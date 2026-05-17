import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ModuleRef } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { AutomationsService } from './automations.service'
import { EmailService } from './email.service'
import { renderTemplate } from './templates/email-templates'
import { ContractsService } from '../contracts/contracts.service'
import { InvoicesService } from '../invoices/invoices.service'
import type {
  InvoiceTemplateVars, ContractTemplateVars,
  ProposalTemplateVars, LeadTemplateVars, MeetingTemplateVars,
} from './templates/template.variables'

export interface AutomationEvent {
  entityId: string
  userId:   string
}

@Injectable()
export class AutomationEngine {
  private readonly logger = new Logger(AutomationEngine.name)

  constructor(
    private readonly prisma:       PrismaService,
    private readonly automations:  AutomationsService,
    private readonly email:        EmailService,
    private readonly config:       ConfigService,
    private readonly moduleRef:    ModuleRef,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async notifySkip(userId: string, entityId: string, entityType: string, reason: string) {
    await this.prisma.notification.create({
      data: {
        userId,
        type:       'automation_skip',
        title:      'Email not sent — missing contact info',
        body:       reason,
        entityId,
        entityType,
      },
    })
  }

  // ─── Event listeners ───────────────────────────────────────────────────────

  @OnEvent('invoice.paid')
  async onInvoicePaid(ev: AutomationEvent) {
    await this.fireRulesForEvent('event.invoice.paid', ev.entityId, 'invoice', ev.userId)
  }

  @OnEvent('proposal.accepted')
  async onProposalAccepted(ev: AutomationEvent) {
    await this.fireRulesForEvent('event.proposal.accepted', ev.entityId, 'proposal', ev.userId)
  }

  @OnEvent('contract.signed')
  async onContractSigned(ev: AutomationEvent) {
    await this.fireRulesForEvent('event.contract.signed', ev.entityId, 'contract', ev.userId)
  }

  @OnEvent('lead.created')
  async onLeadCreated(ev: AutomationEvent) {
    await this.fireRulesForEvent('event.lead.created', ev.entityId, 'lead', ev.userId)
  }

  @OnEvent('invoice.sent')
  async onInvoiceSent(ev: AutomationEvent) {
    await this.sendEmailToClient({ templateKey: 'invoice_client_link' }, ev.entityId, 'invoice', ev.userId)
  }

  @OnEvent('proposal.sent')
  async onProposalSent(ev: AutomationEvent) {
    await this.sendEmailToClient({ templateKey: 'proposal_client_link' }, ev.entityId, 'proposal', ev.userId)
  }

  @OnEvent('contract.sent')
  async onContractSent(ev: AutomationEvent) {
    await this.sendEmailToClient({ templateKey: 'contract_client_sign' }, ev.entityId, 'contract', ev.userId)
  }

  @OnEvent('meeting.scheduled')
  async onMeetingScheduled(ev: AutomationEvent) {
    await this.sendMeetingConfirmation(ev.entityId, ev.userId)
  }

  // ─── Core: fire all matching active rules ──────────────────────────────────

  async fireRulesForEvent(
    triggerEvent: string,
    entityId:     string,
    entityType:   string,
    userId:       string,
  ) {
    const rules = await this.prisma.automationRule.findMany({
      where: { userId, triggerEvent, isActive: true },
    })
    for (const rule of rules) {
      await this.executeRule(rule, entityId, entityType, userId)
    }
  }

  async executeRule(
    rule:       { id: string; actionType: string; actionConfig: unknown; userId: string },
    entityId:   string,
    entityType: string,
    userId:     string,
  ) {
    try {
      await this.dispatchAction(rule.actionType, rule.actionConfig as Record<string, unknown>, entityId, entityType, userId)
      await this.automations.recordExecution({ ruleId: rule.id, entityId, entityType, status: 'SUCCESS' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[engine] rule=${rule.id} failed: ${msg}`)
      await this.automations.recordExecution({ ruleId: rule.id, entityId, entityType, status: 'FAILED', error: msg })
    }
  }

  // ─── Action dispatcher ─────────────────────────────────────────────────────

  private async dispatchAction(
    actionType:   string,
    actionConfig: Record<string, unknown>,
    entityId:     string,
    entityType:   string,
    userId:       string,
  ) {
    switch (actionType) {
      case 'send_email.client': return this.sendEmailToClient(actionConfig, entityId, entityType, userId)
      case 'send_email.user':   return this.sendEmailToUser(actionConfig, userId, entityId, entityType)
      case 'create.contract':   return this.autoCreateContract(entityId, userId)
      case 'create.invoice':    return this.autoCreateInvoice(entityId, userId)
      default:
        throw new Error(`Unknown action type: ${actionType}`)
    }
  }

  // ─── Action: send email to client ─────────────────────────────────────────

  private async sendEmailToClient(
    config:     Record<string, unknown>,
    entityId:   string,
    entityType: string,
    userId:     string,
  ) {
    const templateKey = config.templateKey as string
    const appUrl      = this.config.get<string>('appUrl') ?? 'http://localhost:5173'
    const user        = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return

    const businessName = user.businessName ?? user.name
    let to      = ''
    let vars: InvoiceTemplateVars | ContractTemplateVars | ProposalTemplateVars | LeadTemplateVars

    if (entityType === 'invoice') {
      const inv = await this.prisma.invoice.findUnique({
        where:   { id: entityId },
        include: { client: true },
      })
      if (!inv || !inv.client?.email) {
        await this.notifySkip(userId, entityId, 'invoice', `Invoice ${inv?.invoiceNumber ?? entityId} has no client email — automated email was skipped.`)
        return
      }
      to = inv.client.email
      const dueDate      = inv.dueDate ? inv.dueDate.toLocaleDateString('en-IN') : '—'
      const overdueByDays = inv.dueDate
        ? Math.floor((Date.now() - inv.dueDate.getTime()) / 86_400_000)
        : 0
      vars = {
        clientName:    inv.client.name,
        businessName,
        userEmail:     user.email,
        invoiceNumber: inv.invoiceNumber,
        total:         `₹${Number(inv.total).toLocaleString('en-IN')}`,
        dueDate,
        overdueByDays,
        paymentLink:   '',
        viewUrl:       `${appUrl}/invoice/${inv.id}`,
      } satisfies InvoiceTemplateVars

    } else if (entityType === 'contract') {
      const contract = await this.prisma.contract.findUnique({
        where:   { id: entityId },
        include: { client: true },
      })
      const content = contract?.content as Record<string, string> | null
      const contractEmail = contract?.client?.email ?? content?.signerEmail
      const contractName  = contract?.client?.name  ?? content?.signerName ?? 'there'
      if (!contract || !contractEmail) {
        await this.notifySkip(userId, entityId, 'contract', `Contract "${contract?.title ?? entityId}" has no client email — automated email was skipped.`)
        return
      }
      to = contractEmail
      vars = {
        clientName:    contractName,
        businessName,
        contractTitle: contract.title,
        signLink:      `${appUrl}/sign/${contract.id}`,
      } satisfies ContractTemplateVars

    } else if (entityType === 'proposal') {
      const proposal = await this.prisma.proposal.findUnique({
        where:   { id: entityId },
        include: { client: true, lead: true },
      })
      const clientEmail = proposal?.client?.email ?? (proposal?.lead as { email?: string } | null)?.email
      if (!proposal || !clientEmail) {
        await this.notifySkip(userId, entityId, 'proposal', `Proposal "${proposal?.title ?? entityId}" has no client email — automated email was skipped.`)
        return
      }
      to = clientEmail
      vars = {
        clientName:    proposal.client?.name ?? proposal.lead?.name ?? 'there',
        businessName,
        proposalTitle: proposal.title,
        proposalLink:  `${appUrl}/p/${proposal.slug}`,
        validUntil:    proposal.validUntil ? proposal.validUntil.toLocaleDateString('en-IN') : '—',
      } satisfies ProposalTemplateVars

    } else if (entityType === 'lead') {
      const lead = await this.prisma.lead.findUnique({ where: { id: entityId } })
      if (!lead?.email) {
        await this.notifySkip(userId, entityId, 'lead', `Lead "${lead?.name ?? entityId}" has no email address — automated email was skipped.`)
        return
      }
      to = lead.email
      vars = {
        leadName:         lead.name,
        businessName,
        service:          lead.service ?? '',
        lastActivityDays: Math.floor((Date.now() - lead.lastActivityAt.getTime()) / 86_400_000),
      } satisfies LeadTemplateVars

    } else {
      return
    }

    const { subject, html } = renderTemplate(templateKey, vars)
    await this.email.send({ userId, to, subject, html, templateKey, entityId, entityType })
  }

  // ─── Action: send email to user (owner) ───────────────────────────────────

  private async sendEmailToUser(
    config:     Record<string, unknown>,
    userId:     string,
    entityId:   string,
    entityType: string,
  ) {
    const templateKey = config.templateKey as string
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.email) return

    const businessName = user.businessName ?? user.name

    let vars: LeadTemplateVars | ProposalTemplateVars

    if (entityType === 'lead') {
      const lead = await this.prisma.lead.findUnique({ where: { id: entityId } })
      if (!lead) return
      vars = {
        leadName:         lead.name,
        businessName,
        service:          lead.service ?? '',
        lastActivityDays: Math.floor((Date.now() - lead.lastActivityAt.getTime()) / 86_400_000),
      } satisfies LeadTemplateVars

    } else if (entityType === 'proposal') {
      const appUrl   = this.config.get<string>('appUrl') ?? 'http://localhost:5173'
      const proposal = await this.prisma.proposal.findUnique({ where: { id: entityId }, include: { client: true, lead: true } })
      if (!proposal) return
      vars = {
        clientName:    proposal.client?.name ?? proposal.lead?.name ?? '—',
        businessName,
        proposalTitle: proposal.title,
        proposalLink:  `${appUrl}/p/${proposal.slug}`,
        validUntil:    proposal.validUntil ? proposal.validUntil.toLocaleDateString('en-IN') : '—',
      } satisfies ProposalTemplateVars

    } else {
      // Digest / business alerts pass entityType as a sentinel
      return
    }

    const { subject, html } = renderTemplate(templateKey, vars)
    await this.email.send({ userId, to: user.email, subject, html, templateKey, entityId, entityType })
  }

  // ─── Meeting: confirmation email to client/lead + guests ─────────────────

  private async sendMeetingConfirmation(meetingId: string, userId: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where:   { id: meetingId },
      include: {
        client: { select: { id: true, name: true, email: true, portalToken: true } },
        lead:   { select: { id: true, name: true, email: true } },
      },
    })
    if (!meeting) return

    const user         = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return

    const businessName = user.businessName ?? user.name
    const appUrl       = this.config.get<string>('appUrl') ?? 'http://localhost:5173'

    const scheduledAt = meeting.scheduledAt.toLocaleString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })

    // Build list of recipients: client → lead (if no client) → guests
    const recipients: { name: string; email: string; portalLink?: string | null }[] = []

    if (meeting.client?.email) {
      const portalLink = meeting.client.portalToken
        ? `${appUrl}/portal/${meeting.client.portalToken}`
        : null
      recipients.push({ name: meeting.client.name, email: meeting.client.email, portalLink })
    } else if (meeting.lead?.email) {
      recipients.push({ name: meeting.lead.name, email: meeting.lead.email })
    }

    for (const guestEmail of meeting.guestEmails) {
      if (!recipients.find(r => r.email === guestEmail)) {
        recipients.push({ name: 'Guest', email: guestEmail })
      }
    }

    for (const recipient of recipients) {
      const vars: MeetingTemplateVars = {
        recipientName: recipient.name,
        businessName,
        meetingTitle:  meeting.title,
        scheduledAt,
        durationMins:  meeting.durationMins,
        meetLink:      meeting.meetLink,
        agenda:        meeting.agenda,
        portalLink:    recipient.portalLink ?? null,
      }
      const { subject, html } = renderTemplate('meeting_scheduled_client', vars)
      await this.email.send({
        userId,
        to:          recipient.email,
        subject,
        html,
        templateKey: 'meeting_scheduled_client',
        entityId:    meetingId,
        entityType:  'meeting',
      })
    }
  }

  // ─── Send digest email to user (called directly from scheduler) ───────────

  async sendDigestEmail(userId: string, templateKey: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.email) return

    const businessName = user.businessName ?? user.name
    const now          = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [revenueAgg, activeLeads, overdueCount, openProposals, followUps] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { userId, status: 'PAID', paidAt: { gte: startOfMonth } },
        _sum:  { total: true },
      }),
      this.prisma.lead.count({ where: { userId, isDeleted: false, stage: { notIn: ['WON', 'LOST'] } } }),
      this.prisma.invoice.count({ where: { userId, status: 'OVERDUE' } }),
      this.prisma.proposal.count({ where: { userId, status: { in: ['SENT', 'OPENED'] } } }),
      this.prisma.lead.count({
        where: {
          userId,
          isDeleted:  false,
          followUpAt: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
        },
      }),
    ])

    const vars = {
      businessName,
      revenueThisMonth: `₹${Number(revenueAgg._sum.total ?? 0).toLocaleString('en-IN')}`,
      activeLeads,
      overdueCount,
      openProposals,
      followUpsCount: followUps,
    }

    const { subject, html } = renderTemplate(templateKey, vars)
    await this.email.send({ userId, to: user.email, subject, html, templateKey, entityId: userId, entityType: 'user' })
  }

  // ─── Action: auto-create contract ─────────────────────────────────────────

  private async autoCreateContract(proposalId: string, userId: string) {
    const contractsService = this.moduleRef.get(ContractsService, { strict: false })
    await contractsService.createFromProposal(userId, proposalId)
    this.logger.log(`[engine] auto-created contract from proposal=${proposalId}`)
  }

  // ─── Action: auto-create invoice ──────────────────────────────────────────

  private async autoCreateInvoice(contractId: string, userId: string) {
    const invoicesService = this.moduleRef.get(InvoicesService, { strict: false })
    await invoicesService.createFromContract(userId, contractId)
    this.logger.log(`[engine] auto-created invoice from contract=${contractId}`)
  }
}
