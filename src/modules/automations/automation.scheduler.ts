import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { AutomationEngine } from './automation.engine'
import { AutomationsService } from './automations.service'
import { EmailService } from './email.service'
import { renderTemplate } from './templates/email-templates'
import { InvoicesService } from '../invoices/invoices.service'

@Injectable()
export class AutomationScheduler {
  private readonly logger = new Logger(AutomationScheduler.name)

  constructor(
    private readonly prisma:       PrismaService,
    private readonly engine:       AutomationEngine,
    private readonly automations:  AutomationsService,
    private readonly email:        EmailService,
    private readonly invoices:     InvoicesService,
  ) {}

  // ─── Hourly — meeting reminders ───────────────────────────────────────────

  @Cron('0 * * * *')
  async sendMeetingReminders() {
    const now   = new Date()
    const inOne = new Date(now.getTime() + 60 * 60 * 1000)

    const meetings = await this.prisma.meeting.findMany({
      where:   { scheduledAt: { gte: now, lte: inOne }, status: 'SCHEDULED', reminderSent: false },
      include: { client: true, lead: true },
    })

    for (const m of meetings) {
      const user = await this.prisma.user.findUnique({ where: { id: m.workspaceId } })
      if (!user) continue
      const businessName = user.businessName ?? user.name
      const scheduledStr = m.scheduledAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const vars = {
        recipientName: user.name,
        businessName,
        meetingTitle:  m.title,
        scheduledAt:   scheduledStr,
        durationMins:  m.durationMins,
        meetLink:      m.meetLink,
        agenda:        m.agenda,
      }

      await this.email.send({
        userId:      m.workspaceId,
        to:          user.email,
        subject:     `Reminder: "${m.title}" starts in 1 hour`,
        html:        renderTemplate('meeting_reminder', vars).html,
        templateKey: 'meeting_reminder',
        entityId:    m.id,
        entityType:  'meeting',
      })

      const clientEmail = m.client?.email ?? (m.lead as { email?: string } | null)?.email
      if (clientEmail) {
        const clientName = m.client?.name ?? (m.lead as { name?: string } | null)?.name ?? 'there'
        await this.email.send({
          userId:      m.workspaceId,
          to:          clientEmail,
          subject:     `Reminder: "${m.title}" starts in 1 hour`,
          html:        renderTemplate('meeting_reminder', { ...vars, recipientName: clientName }).html,
          templateKey: 'meeting_reminder',
          entityId:    m.id,
          entityType:  'meeting',
        })
      }

      await this.prisma.meeting.update({ where: { id: m.id }, data: { reminderSent: true } })
    }
  }

  // ─── Daily 9am — all scheduled checks ────────────────────────────────────

  @Cron('0 9 * * *')
  async runDailyChecks() {
    this.logger.log('[scheduler] running daily checks')
    await Promise.allSettled([
      this.expireProposals(),
      this.invoices.markOverdueInvoices(),
      this.invoices.generateRecurringDrafts(),
      this.checkOverdueInvoices(),
      this.checkDueSoonInvoices(),
      this.checkUnsignedContracts(),
      this.checkUnopenedProposals(),
      this.checkOpenedProposalsNoResponse(),
      this.checkExpiringProposals(),
      this.checkColdLeads(),
    ])
  }

  // ─── 8th of each month 9am — GST reminder ─────────────────────────────────

  @Cron('0 9 8 * *')
  async sendGstReminder() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'business.gst_reminder', isActive: true },
    })
    for (const rule of rules) {
      await this.engine.sendDigestEmail(rule.workspaceId, 'gst_reminder')
      await this.automations.recordExecution({ ruleId: rule.id, entityId: rule.workspaceId, entityType: 'user', status: 'SUCCESS' })
    }
  }

  // ─── Every Monday 9am — weekly digest ─────────────────────────────────────

  @Cron('0 9 * * 1')
  async sendWeeklyDigest() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'business.weekly_digest', isActive: true },
    })
    for (const rule of rules) {
      await this.engine.sendDigestEmail(rule.workspaceId, 'weekly_digest')
      await this.automations.recordExecution({ ruleId: rule.id, entityId: rule.workspaceId, entityType: 'user', status: 'SUCCESS' })
    }
  }

  // ─── 1st of each month 9am — monthly summary ──────────────────────────────

  @Cron('0 9 1 * *')
  async sendMonthlySummary() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'business.monthly_summary', isActive: true },
    })
    for (const rule of rules) {
      await this.engine.sendDigestEmail(rule.workspaceId, 'monthly_summary')
      await this.automations.recordExecution({ ruleId: rule.id, entityId: rule.workspaceId, entityType: 'user', status: 'SUCCESS' })
    }
  }

  // ─── Overdue invoice reminders ────────────────────────────────────────────
  // Uses remindersSent as idempotency counter so missed daily runs catch up.
  // d3 fires when remindersSent=0 and overdue >= 3 days
  // d7 fires when remindersSent=1 and overdue >= 7 days
  // d14 fires when remindersSent=2 and overdue >= 14 days

  private async checkOverdueInvoices() {
    const THRESHOLDS = [
      { key: 'invoice.overdue.d3',  days: 3,  reminderIndex: 0 },
      { key: 'invoice.overdue.d7',  days: 7,  reminderIndex: 1 },
      { key: 'invoice.overdue.d14', days: 14, reminderIndex: 2 },
    ]

    const rules = await this.prisma.automationRule.findMany({
      where: { key: { in: THRESHOLDS.map(t => t.key) }, isActive: true },
    })
    if (!rules.length) return

    const now = new Date()

    for (const rule of rules) {
      const threshold = THRESHOLDS.find(t => t.key === rule.key)
      if (!threshold) continue

      const overdueBy = new Date(now.getTime() - threshold.days * 86_400_000)

      const invoices = await this.prisma.invoice.findMany({
        where: {
          workspaceId:  rule.workspaceId,
          status:       'OVERDUE',
          dueDate:      { lte: overdueBy },
          remindersSent: threshold.reminderIndex,
        },
        include: { client: true },
      })

      for (const inv of invoices) {
        if (!inv.client?.email) continue
        await this.engine.executeRule(rule, inv.id, 'invoice', rule.workspaceId)
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data:  { remindersSent: { increment: 1 } },
        })
      }
    }
  }

  // ─── Due-soon invoice reminders ───────────────────────────────────────────

  private async checkDueSoonInvoices() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'invoice.due_soon.d3', isActive: true },
    })
    if (!rules.length) return

    const now   = new Date()
    const in3d  = new Date(now.getTime() + 3 * 86_400_000)
    const in4d  = new Date(now.getTime() + 4 * 86_400_000)

    for (const rule of rules) {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          workspaceId: rule.workspaceId,
          status:  { in: ['SENT', 'VIEWED'] },
          dueDate: { gte: in3d, lte: in4d },
        },
        include: { client: true },
      })
      for (const inv of invoices) {
        if (!inv.client?.email) continue
        await this.engine.executeRule(rule, inv.id, 'invoice', rule.workspaceId)
      }
    }
  }

  // ─── Unsigned contract reminders ─────────────────────────────────────────
  // Uses sentAt (set when contract is first sent) — not updatedAt which resets
  // on every edit and would restart the reminder clock incorrectly.

  private async checkUnsignedContracts() {
    const ruleKeys = ['contract.not_signed.d3', 'contract.not_signed.d7']
    const rules    = await this.prisma.automationRule.findMany({
      where: { key: { in: ruleKeys }, isActive: true },
    })
    if (!rules.length) return

    const now = new Date()

    for (const rule of rules) {
      const cfg  = rule.triggerConfig as { days: number }
      const days = cfg.days
      const from = new Date(now.getTime() - (days + 1) * 86_400_000)
      const to   = new Date(now.getTime() - days * 86_400_000)

      const contracts = await this.prisma.contract.findMany({
        where: {
          workspaceId: rule.workspaceId,
          status:  'SENT',
          sentAt:  { gte: from, lte: to },
        },
        include: { client: true },
      })
      for (const c of contracts) {
        if (!c.client?.email) continue
        await this.engine.executeRule(rule, c.id, 'contract', rule.workspaceId)
      }
    }
  }

  // ─── Unopened proposal alert (to user) ───────────────────────────────────

  private async checkUnopenedProposals() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'proposal.not_opened.d3', isActive: true },
    })
    if (!rules.length) return

    const now  = new Date()
    const from = new Date(now.getTime() - 4 * 86_400_000)
    const to   = new Date(now.getTime() - 3 * 86_400_000)

    for (const rule of rules) {
      const proposals = await this.prisma.proposal.findMany({
        where: {
          workspaceId: rule.workspaceId,
          status:    'SENT',          // still SENT = never opened (would be OPENED)
          updatedAt: { gte: from, lte: to },
        },
      })
      for (const p of proposals) {
        await this.engine.executeRule(rule, p.id, 'proposal', rule.workspaceId)
      }
    }
  }

  // ─── Opened but no response (to user) ────────────────────────────────────

  private async checkOpenedProposalsNoResponse() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'proposal.opened.no_response.d2', isActive: true },
    })
    if (!rules.length) return

    const now  = new Date()
    const from = new Date(now.getTime() - 3 * 86_400_000)
    const to   = new Date(now.getTime() - 2 * 86_400_000)

    for (const rule of rules) {
      const proposals = await this.prisma.proposal.findMany({
        where: {
          workspaceId: rule.workspaceId,
          status:    'OPENED',
          updatedAt: { gte: from, lte: to },
        },
      })
      for (const p of proposals) {
        await this.engine.executeRule(rule, p.id, 'proposal', rule.workspaceId)
      }
    }
  }

  // ─── Proposal expiring tomorrow ───────────────────────────────────────────

  private async checkExpiringProposals() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'proposal.expiring.d1', isActive: true },
    })
    if (!rules.length) return

    const tomorrow     = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const startOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())
    const endOfTomorrow   = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59)

    for (const rule of rules) {
      const proposals = await this.prisma.proposal.findMany({
        where: {
          workspaceId: rule.workspaceId,
          status:     { in: ['SENT', 'OPENED'] },
          validUntil: { gte: startOfTomorrow, lte: endOfTomorrow },
        },
        include: { client: true, lead: true },
      })
      for (const p of proposals) {
        const clientEmail = p.client?.email ?? (p.lead as { email?: string } | null)?.email
        if (!clientEmail) continue
        await this.engine.executeRule(rule, p.id, 'proposal', rule.workspaceId)
      }
    }
  }

  // ─── Cold lead alerts (to user) ──────────────────────────────────────────

  private async checkColdLeads() {
    const rules = await this.prisma.automationRule.findMany({
      where: { key: 'lead.cold.d7', isActive: true },
    })
    if (!rules.length) return

    const now  = new Date()
    const from = new Date(now.getTime() - 8 * 86_400_000)
    const to   = new Date(now.getTime() - 7 * 86_400_000)

    for (const rule of rules) {
      const leads = await this.prisma.lead.findMany({
        where: {
          workspaceId:   rule.workspaceId,
          isDeleted:     false,
          stage:         { notIn: ['WON', 'LOST'] },
          lastActivityAt: { gte: from, lte: to },
        },
      })
      for (const l of leads) {
        const ruleUser = await this.prisma.user.findUnique({ where: { id: rule.workspaceId } })
        if (!ruleUser?.email) continue

        const businessName = ruleUser.businessName ?? ruleUser.name
        const vars = {
          leadName:         l.name,
          businessName,
          service:          l.service ?? '',
          lastActivityDays: 7,
        }
        const { subject, html } = renderTemplate('lead_cold_alert', vars)
        await this.email.send({
          userId:     rule.workspaceId,
          to:         ruleUser.email,
          subject,
          html,
          templateKey: 'lead_cold_alert',
          entityId:   l.id,
          entityType: 'lead',
        })
        await this.automations.recordExecution({ ruleId: rule.id, entityId: l.id, entityType: 'lead', status: 'SUCCESS' })
      }
    }
  }

  // ─── Expire proposals past validUntil ─────────────────────────────────────

  private async expireProposals() {
    await this.prisma.proposal.updateMany({
      where: {
        status:    { in: ['SENT', 'OPENED'] },
        validUntil: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    })
  }
}
