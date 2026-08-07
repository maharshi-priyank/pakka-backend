import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

interface EventPayload {
  entityId:    string
  workspaceId: string
}

function rupees(val: unknown): string {
  return `₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

@Injectable()
export class NotificationsListener {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma:        PrismaService,
  ) {}

  @OnEvent('invoice.paid')
  async onInvoicePaid({ entityId, workspaceId }: EventPayload) {
    const inv = await this.prisma.invoice.findUnique({
      where:   { id: entityId },
      include: { client: true },
    })
    const clientName = inv?.client?.name ?? 'Client'
    const invoiceNo  = inv?.invoiceNumber ?? 'invoice'
    const amount     = inv ? rupees(inv.total) : ''

    await this.notifications.create({
      userId:     workspaceId,
      type:       'invoice.paid',
      title:      'Payment received',
      body:       `${clientName} paid ${invoiceNo}${amount ? ` · ${amount}` : ''}`,
      entityId,
      entityType: 'invoice',
    })
  }

  @OnEvent('proposal.opened')
  async onProposalOpened({ entityId, workspaceId }: EventPayload) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: entityId },
      include: { client: true, lead: true, contact: true },
    })
    const clientName = proposal?.contact?.name ?? proposal?.client?.name ?? proposal?.lead?.name ?? 'A client'
    const title      = proposal?.title ?? 'your proposal'

    await this.notifications.create({
      userId:     workspaceId,
      type:       'proposal.opened',
      title:      'Proposal opened',
      body:       `${clientName} opened "${title}"`,
      entityId,
      entityType: 'proposal',
    })
  }

  @OnEvent('proposal.accepted')
  async onProposalAccepted({ entityId, workspaceId }: EventPayload) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: entityId },
      include: { client: true, lead: true, contact: true },
    })
    const clientName = proposal?.contact?.name ?? proposal?.client?.name ?? proposal?.lead?.name ?? 'A client'
    const title      = proposal?.title ?? 'your proposal'
    const amount     = proposal ? rupees(proposal.totalAmount) : ''

    await this.notifications.create({
      userId:     workspaceId,
      type:       'proposal.accepted',
      title:      'Proposal accepted!',
      body:       `${clientName} accepted "${title}"${amount ? ` · ${amount}` : ''}`,
      entityId,
      entityType: 'proposal',
    })
  }

  @OnEvent('contract.signed')
  async onContractSigned({ entityId, workspaceId }: EventPayload) {
    const contract = await this.prisma.contract.findUnique({
      where:   { id: entityId },
      include: { client: true, contact: true },
    })
    const clientName    = contract?.contact?.name ?? contract?.client?.name ?? 'Client'
    const contractTitle = contract?.title ?? 'your contract'

    await this.notifications.create({
      userId:     workspaceId,
      type:       'contract.signed',
      title:      'Contract signed',
      body:       `${clientName} signed "${contractTitle}"`,
      entityId,
      entityType: 'contract',
    })
  }

  @OnEvent('proposal.declined')
  async onProposalDeclined({ entityId, workspaceId }: EventPayload) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: entityId },
      include: { client: true, lead: true, contact: true },
    })
    const clientName = proposal?.contact?.name ?? proposal?.client?.name ?? proposal?.lead?.name ?? 'A client'
    const title      = proposal?.title ?? 'your proposal'

    await this.notifications.create({
      userId:     workspaceId,
      type:       'proposal.declined',
      title:      'Proposal declined',
      body:       `${clientName} declined "${title}"`,
      entityId,
      entityType: 'proposal',
    })
  }

  @OnEvent('invoice.partial')
  async onInvoicePartial({ entityId, workspaceId, amountPaid }: EventPayload & { amountPaid: number }) {
    const inv = await this.prisma.invoice.findUnique({
      where:   { id: entityId },
      include: { client: true },
    })
    const clientName = inv?.client?.name ?? 'Client'
    const invoiceNo  = inv?.invoiceNumber ?? 'invoice'
    const paid       = rupees(amountPaid)
    const total      = inv ? rupees(inv.total) : ''

    await this.notifications.create({
      userId:     workspaceId,
      type:       'invoice.partial',
      title:      'Partial payment received',
      body:       `${clientName} paid ${paid}${total ? ` of ${total}` : ''} on ${invoiceNo}`,
      entityId,
      entityType: 'invoice',
    })
  }

  @OnEvent('contract.auto_created')
  async onContractAutoCreated({ entityId, workspaceId, proposalId }: EventPayload & { proposalId: string }) {
    const contract = await this.prisma.contract.findUnique({
      where:   { id: entityId },
      include: { contact: true, client: true },
    })
    const proposal = proposalId
      ? await this.prisma.proposal.findUnique({ where: { id: proposalId }, select: { title: true } })
      : null
    const clientName    = contract?.contact?.name ?? contract?.client?.name ?? 'your client'
    const proposalTitle = proposal?.title ?? 'the proposal'

    await this.notifications.create({
      userId:     workspaceId,
      type:       'contract.auto_created',
      title:      'Contract draft ready',
      body:       `A contract was created from "${proposalTitle}" — send it to ${clientName} for signing`,
      entityId,
      entityType: 'contract',
    })
  }

  @OnEvent('invoice.overdue')
  async onInvoiceOverdue({ entityId, workspaceId }: EventPayload) {
    const inv = await this.prisma.invoice.findUnique({
      where:   { id: entityId },
      include: { client: true },
    })
    const clientName = inv?.client?.name ?? 'Client'
    const invoiceNo  = inv?.invoiceNumber ?? 'invoice'
    const amount     = inv ? rupees(inv.total) : ''

    await this.notifications.create({
      userId:     workspaceId,
      type:       'invoice.overdue',
      title:      'Invoice overdue',
      body:       `${invoiceNo}${amount ? ` · ${amount}` : ''} from ${clientName} is now overdue`,
      entityId,
      entityType: 'invoice',
    })
  }

  @OnEvent('lead.created')
  async onLeadCreated({ entityId, workspaceId }: EventPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id: entityId } })
    const parts: string[] = [lead?.name ?? 'Someone']
    if (lead?.company) parts.push(lead.company)
    const suffix = lead?.service ? ` — interested in ${lead.service}` : ''

    await this.notifications.create({
      userId:     workspaceId,
      type:       'lead.created',
      title:      'New enquiry',
      body:       parts.join(' · ') + suffix,
      entityId,
      // Website-form-sourced leads open the Lead Capture review page;
      // manual/AI-discovered leads keep opening the old /leads page.
      entityType: lead?.sourceFormId ? 'lead-capture' : 'lead',
    })
  }

  @OnEvent('form.submitted')
  async onFormSubmitted({ entityId, workspaceId }: EventPayload) {
    const form = await this.prisma.intakeForm.findUnique({
      where:   { id: entityId },
      include: { _count: { select: { submissions: true } } },
    })
    const formTitle = form?.title ?? 'your form'
    const count     = form?._count?.submissions ?? 1

    await this.notifications.create({
      userId:     workspaceId,
      type:       'form.submitted',
      title:      'New form response',
      body:       `Someone filled out "${formTitle}" · ${count} response${count === 1 ? '' : 's'} total`,
      entityId,
      entityType: 'form',
    })
  }

  @OnEvent('meeting.scheduled')
  async onMeetingScheduled({ entityId, workspaceId }: EventPayload) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: entityId } })
    if (!meeting) return
    const date = new Date(meeting.scheduledAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })

    await this.notifications.create({
      userId:     workspaceId,
      type:       'meeting.scheduled',
      title:      'Meeting scheduled',
      body:       `"${meeting.title}" on ${date}`,
      entityId,
      entityType: 'meeting',
    })
  }
}
