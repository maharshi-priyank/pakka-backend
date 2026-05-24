import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ModuleRef } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Prisma, LeadStage } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { EmailService } from '../automations/email.service'
import { ContractsService } from '../contracts/contracts.service'
import { InvoicesService } from '../invoices/invoices.service'
import { WorkflowsService } from './workflows.service'

// ─── Shared types (exported for use in service + scheduler) ──────────────────

export interface ActionNode {
  id:     string
  type:   'action'
  delay:  { value: number; unit: 'minutes' | 'hours' | 'days' }
  action: { type: string; config: Record<string, unknown> }
}

export interface ConditionNode {
  id:        string
  type:      'condition'
  condition: { field: string; operator: string; value: string }
  trueBranch:  StepNode[]
  falseBranch: StepNode[]
}

export type StepNode = ActionNode | ConditionNode

export interface WorkflowTriggerEvent {
  entityId:   string
  userId:     string
  extra?:     Record<string, unknown>
}

// ─── Merge field resolver ─────────────────────────────────────────────────────

type MergeVars = Record<string, string>

// ─── Engine ───────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name)

  constructor(
    private readonly prisma:     PrismaService,
    private readonly workflows:  WorkflowsService,
    private readonly email:      EmailService,
    private readonly config:     ConfigService,
    private readonly moduleRef:  ModuleRef,
  ) {}

  // ─── Event listeners ────────────────────────────────────────────────────────

  @OnEvent('lead.created')
  async onLeadCreated(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('lead.created', ev.entityId, 'lead', ev.userId)
  }

  @OnEvent('lead.stage_changed')
  async onLeadStageChanged(ev: WorkflowTriggerEvent & { toStage: string }) {
    await this.handleTrigger('lead.stage_changed', ev.entityId, 'lead', ev.userId, { toStage: ev.toStage })
  }

  @OnEvent('proposal.accepted')
  async onProposalAccepted(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('proposal.accepted', ev.entityId, 'proposal', ev.userId)
  }

  @OnEvent('proposal.sent')
  async onProposalSent(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('proposal.sent', ev.entityId, 'proposal', ev.userId)
  }

  @OnEvent('contract.signed')
  async onContractSigned(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('contract.signed', ev.entityId, 'contract', ev.userId)
  }

  @OnEvent('contract.sent')
  async onContractSent(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('contract.sent', ev.entityId, 'contract', ev.userId)
  }

  @OnEvent('invoice.paid')
  async onInvoicePaid(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('invoice.paid', ev.entityId, 'invoice', ev.userId)
  }

  @OnEvent('invoice.sent')
  async onInvoiceSent(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('invoice.sent', ev.entityId, 'invoice', ev.userId)
  }

  @OnEvent('invoice.overdue')
  async onInvoiceOverdue(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('invoice.overdue', ev.entityId, 'invoice', ev.userId)
  }

  @OnEvent('meeting.scheduled')
  async onMeetingScheduled(ev: WorkflowTriggerEvent) {
    await this.handleTrigger('meeting.scheduled', ev.entityId, 'meeting', ev.userId)
  }

  @OnEvent('form.submitted')
  async onFormSubmitted(ev: WorkflowTriggerEvent & { formId?: string }) {
    await this.handleTrigger('form.submitted', ev.entityId, 'form', ev.userId, { formId: ev.formId })
  }

  // ─── Core: match active workflows and start runs ───────────────────────────

  async handleTrigger(
    type:       string,
    entityId:   string,
    entityType: string,
    userId:     string,
    extra:      Record<string, unknown> = {},
  ) {
    const workflowList = await this.prisma.automationWorkflow.findMany({
      where: { userId, isActive: true },
    })

    for (const wf of workflowList) {
      const trigger = wf.trigger as { type: string; config: Record<string, unknown> }
      if (trigger.type !== type) continue

      // Stage-specific filter
      if (type === 'lead.stage_changed' && trigger.config.toStage) {
        if (trigger.config.toStage !== extra.toStage) continue
      }
      // Form-specific filter
      if (type === 'form.submitted' && trigger.config.formId) {
        if (trigger.config.formId !== extra.formId) continue
      }

      await this.workflows.startRun(wf.id, entityId, entityType, userId)
    }
  }

  // ─── Condition evaluator ──────────────────────────────────────────────────

  async evaluateCondition(
    condition:  { field: string; operator: string; value: string },
    entityId:   string,
    entityType: string,
  ): Promise<boolean> {
    const { field, operator, value } = condition
    let actual: unknown

    if (field === 'lead.budget' || field === 'lead.stage' || field === 'lead.source') {
      const lead = await this.prisma.lead.findUnique({ where: { id: entityId }, select: { budget: true, stage: true, source: true } })
      if (field === 'lead.budget') actual = lead?.budget ? Number(lead.budget) : 0
      if (field === 'lead.stage')  actual = lead?.stage
      if (field === 'lead.source') actual = lead?.source
    } else if (field === 'invoice.total') {
      const inv = await this.prisma.invoice.findUnique({ where: { id: entityId }, select: { total: true } })
      actual = inv?.total ? Number(inv.total) : 0
    } else if (field === 'client.hasEmail') {
      const client = await this.prisma.client.findUnique({ where: { id: entityId }, select: { email: true } })
      actual = !!client?.email
    } else {
      return false
    }

    const numValue = Number(value)

    switch (operator) {
      case 'gt':       return typeof actual === 'number' && actual > numValue
      case 'lt':       return typeof actual === 'number' && actual < numValue
      case 'eq':       return String(actual) === value
      case 'ne':       return String(actual) !== value
      case 'contains': return typeof actual === 'string' && actual.toLowerCase().includes(value.toLowerCase())
      default:         return false
    }
  }

  // ─── Action executor ──────────────────────────────────────────────────────

  async executeAction(
    action:     { type: string; config: Record<string, unknown> },
    entityId:   string,
    entityType: string,
    userId:     string,
  ) {
    const { type, config } = action

    switch (type) {
      case 'send_email.client': return this.sendCustomEmail(config, entityId, entityType, userId, 'client')
      case 'send_email.me':     return this.sendCustomEmail(config, entityId, entityType, userId, 'user')
      case 'send_form':         return this.sendFormLink(config, entityId, entityType, userId)
      case 'change_lead_stage': return this.changeLeadStage(config, entityId)
      case 'create_task':       return this.createTask(config, entityId, entityType, userId)
      case 'add_note':          return this.addNote(config, entityId, entityType, userId)
      case 'create.contract':   return this.autoCreateContract(entityId, userId)
      case 'create.invoice':    return this.autoCreateInvoice(entityId, userId)
      default:
        throw new Error(`Unknown action type: ${type}`)
    }
  }

  // ─── Merge fields ────────────────────────────────────────────────────────

  async resolveMergeFields(text: string, entityId: string, entityType: string, userId: string): Promise<string> {
    const appUrl      = this.config.get<string>('appUrl') ?? 'http://localhost:5173'
    const user        = await this.prisma.user.findUnique({ where: { id: userId } })
    const businessName = user?.businessName ?? user?.name ?? ''

    const vars: MergeVars = { businessName }

    if (entityType === 'invoice') {
      const inv = await this.prisma.invoice.findUnique({ where: { id: entityId }, include: { client: true } })
      if (inv) {
        vars.clientName    = inv.client?.name ?? ''
        vars.clientEmail   = inv.client?.email ?? ''
        vars.invoiceAmount = `₹${Number(inv.total).toLocaleString('en-IN')}`
        vars.invoiceDueDate = inv.dueDate ? inv.dueDate.toLocaleDateString('en-IN') : '—'
        vars.portalLink    = inv.client?.portalToken ? `${appUrl}/portal/${inv.client.portalToken}` : ''
      }
    } else if (entityType === 'proposal') {
      const p = await this.prisma.proposal.findUnique({ where: { id: entityId }, include: { client: true, lead: true } })
      if (p) {
        vars.clientName    = p.client?.name ?? (p.lead as { name?: string } | null)?.name ?? ''
        vars.clientEmail   = p.client?.email ?? (p.lead as { email?: string } | null)?.email ?? ''
        vars.proposalTitle = p.title
        vars.portalLink    = p.client?.portalToken ? `${appUrl}/portal/${p.client.portalToken}` : ''
      }
    } else if (entityType === 'contract') {
      const c = await this.prisma.contract.findUnique({ where: { id: entityId }, include: { client: true } })
      if (c) {
        vars.clientName  = c.client?.name ?? ''
        vars.clientEmail = c.client?.email ?? ''
        vars.portalLink  = c.client?.portalToken ? `${appUrl}/portal/${c.client.portalToken}` : ''
      }
    } else if (entityType === 'lead') {
      const l = await this.prisma.lead.findUnique({ where: { id: entityId } })
      if (l) {
        vars.clientName  = l.name
        vars.clientEmail = l.email ?? ''
      }
    } else if (entityType === 'meeting') {
      const m = await this.prisma.meeting.findUnique({ where: { id: entityId }, include: { client: true } })
      if (m) {
        vars.meetingTitle = m.title
        vars.meetingDate  = m.scheduledAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        vars.clientName   = m.client?.name ?? ''
        vars.clientEmail  = m.client?.email ?? ''
        vars.portalLink   = m.client?.portalToken ? `${appUrl}/portal/${m.client.portalToken}` : ''
      }
    } else if (entityType === 'form') {
      const f = await this.prisma.intakeForm.findUnique({ where: { id: entityId } })
      if (f) {
        vars.formLink = `${appUrl}/q/${f.token}`
      }
    }

    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
  }

  // ─── Action implementations ───────────────────────────────────────────────

  private async sendCustomEmail(
    config:     Record<string, unknown>,
    entityId:   string,
    entityType: string,
    userId:     string,
    recipient:  'client' | 'user',
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return

    const rawSubject = (config.subject as string) ?? '(no subject)'
    const rawBody    = (config.body    as string) ?? ''

    const subject = await this.resolveMergeFields(rawSubject, entityId, entityType, userId)
    const body    = await this.resolveMergeFields(rawBody,    entityId, entityType, userId)
    const html    = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#344054;">${body.replace(/\n/g, '<br/>')}</div>`

    let to = ''
    if (recipient === 'user') {
      to = user.email
    } else {
      to = await this.resolveClientEmail(entityId, entityType)
    }
    if (!to) return

    await this.email.send({ userId, to, subject, html, templateKey: 'workflow_custom', entityId, entityType })
  }

  private async resolveClientEmail(entityId: string, entityType: string): Promise<string> {
    if (entityType === 'invoice') {
      const inv = await this.prisma.invoice.findUnique({ where: { id: entityId }, include: { client: true } })
      return inv?.client?.email ?? ''
    }
    if (entityType === 'proposal') {
      const p = await this.prisma.proposal.findUnique({ where: { id: entityId }, include: { client: true, lead: true } })
      return p?.client?.email ?? (p?.lead as { email?: string } | null)?.email ?? ''
    }
    if (entityType === 'contract') {
      const c = await this.prisma.contract.findUnique({ where: { id: entityId }, include: { client: true } })
      const content = c?.content as Record<string, string> | null
      return c?.client?.email ?? content?.signerEmail ?? ''
    }
    if (entityType === 'lead') {
      const l = await this.prisma.lead.findUnique({ where: { id: entityId } })
      return l?.email ?? ''
    }
    if (entityType === 'meeting') {
      const m = await this.prisma.meeting.findUnique({ where: { id: entityId }, include: { client: true } })
      return m?.client?.email ?? ''
    }
    return ''
  }

  private async sendFormLink(config: Record<string, unknown>, entityId: string, entityType: string, userId: string) {
    const formId = config.formId as string
    if (!formId) return
    const form = await this.prisma.intakeForm.findUnique({ where: { id: formId } })
    if (!form || !form.isActive) return

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return

    const appUrl  = this.config.get<string>('appUrl') ?? 'http://localhost:5173'
    const formLink = `${appUrl}/q/${form.token}`
    const to       = await this.resolveClientEmail(entityId, entityType)
    if (!to) return

    const subject = `${user.businessName ?? user.name} sent you a form`
    const html    = `<p>Hi there,</p><p>Please fill out this form: <a href="${formLink}">${form.title}</a></p>`
    await this.email.send({ userId, to, subject, html, templateKey: 'workflow_send_form', entityId, entityType })
  }

  private async changeLeadStage(config: Record<string, unknown>, entityId: string) {
    const stage = config.stage as LeadStage
    if (!stage) return
    await this.prisma.lead.update({ where: { id: entityId }, data: { stage, lastActivityAt: new Date() } })
  }

  private async createTask(config: Record<string, unknown>, entityId: string, entityType: string, userId: string) {
    const title        = (config.title as string) ?? 'Follow up'
    const dueOffset    = Number(config.dueOffsetDays ?? 1)
    const dueDate      = new Date()
    dueDate.setDate(dueDate.getDate() + dueOffset)

    await this.prisma.notification.create({
      data: {
        userId,
        type:       'workflow_task',
        title:      `Task: ${title}`,
        body:       `Due ${dueDate.toLocaleDateString('en-IN')}`,
        entityId,
        entityType,
      },
    })
  }

  private async addNote(config: Record<string, unknown>, entityId: string, entityType: string, userId: string) {
    const note = (config.note as string) ?? ''
    if (!note) return

    await this.prisma.notification.create({
      data: {
        userId,
        type:       'workflow_note',
        title:      'Auto-note added',
        body:       note,
        entityId,
        entityType,
      },
    })
  }

  private async autoCreateContract(proposalId: string, userId: string) {
    try {
      const contractsService = this.moduleRef.get(ContractsService, { strict: false })
      await contractsService.createFromProposal(userId, proposalId)
    } catch (err) {
      this.logger.error(`[workflow] auto-create contract failed: ${err}`)
    }
  }

  private async autoCreateInvoice(contractId: string, userId: string) {
    try {
      const invoicesService = this.moduleRef.get(InvoicesService, { strict: false })
      await invoicesService.createFromContract(userId, contractId)
    } catch (err) {
      this.logger.error(`[workflow] auto-create invoice failed: ${err}`)
    }
  }
}
