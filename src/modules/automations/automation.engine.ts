import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ModuleRef } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { AutomationsService } from './automations.service'
import { EmailService } from './email.service'
import { renderTemplate } from './templates/email-templates'
import type {
  InvoiceTemplateVars, ContractTemplateVars,
  ProposalTemplateVars, LeadTemplateVars,
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
      if (!inv || !inv.client?.email) return
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
      if (!contract || !contract.client?.email) return
      to = contract.client.email
      vars = {
        clientName:    contract.client.name,
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
      if (!proposal || !clientEmail) return
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
      if (!lead?.email) return
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
  // Uses ModuleRef.get with string token to avoid circular module dependencies

  private async autoCreateContract(proposalId: string, userId: string) {
    const contractsService = this.moduleRef.get('ContractsService', { strict: false }) as {
      createFromProposal: (userId: string, proposalId: string) => Promise<unknown>
    }
    await contractsService.createFromProposal(userId, proposalId)
    this.logger.log(`[engine] auto-created contract from proposal=${proposalId}`)
  }

  // ─── Action: auto-create invoice ──────────────────────────────────────────

  private async autoCreateInvoice(contractId: string, userId: string) {
    const invoicesService = this.moduleRef.get('InvoicesService', { strict: false }) as {
      createFromContract: (userId: string, contractId: string) => Promise<unknown>
    }
    await invoicesService.createFromContract(userId, contractId)
    this.logger.log(`[engine] auto-created invoice from contract=${contractId}`)
  }
}
