import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

interface EventPayload {
  entityId: string
  userId:   string
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
  async onInvoicePaid({ entityId, userId }: EventPayload) {
    const inv = await this.prisma.invoice.findUnique({
      where:   { id: entityId },
      include: { client: true },
    })
    const clientName = inv?.client?.name ?? 'Client'
    const invoiceNo  = inv?.invoiceNumber ?? 'invoice'
    const amount     = inv ? rupees(inv.total) : ''

    await this.notifications.create({
      userId,
      type:       'invoice.paid',
      title:      'Payment received',
      body:       `${clientName} paid ${invoiceNo}${amount ? ` · ${amount}` : ''}`,
      entityId,
      entityType: 'invoice',
    })
  }

  @OnEvent('proposal.opened')
  async onProposalOpened({ entityId, userId }: EventPayload) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: entityId },
      include: { client: true, lead: true },
    })
    const clientName = proposal?.client?.name ?? proposal?.lead?.name ?? 'A client'
    const title      = proposal?.title ?? 'your proposal'

    await this.notifications.create({
      userId,
      type:       'proposal.opened',
      title:      'Proposal opened',
      body:       `${clientName} opened "${title}"`,
      entityId,
      entityType: 'proposal',
    })
  }

  @OnEvent('proposal.accepted')
  async onProposalAccepted({ entityId, userId }: EventPayload) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: entityId },
      include: { client: true, lead: true },
    })
    const clientName = proposal?.client?.name ?? proposal?.lead?.name ?? 'A client'
    const title      = proposal?.title ?? 'your proposal'
    const amount     = proposal ? rupees(proposal.totalAmount) : ''

    await this.notifications.create({
      userId,
      type:       'proposal.accepted',
      title:      'Proposal accepted!',
      body:       `${clientName} accepted "${title}"${amount ? ` · ${amount}` : ''}`,
      entityId,
      entityType: 'proposal',
    })
  }

  @OnEvent('contract.signed')
  async onContractSigned({ entityId, userId }: EventPayload) {
    const contract = await this.prisma.contract.findUnique({
      where:   { id: entityId },
      include: { client: true },
    })
    const clientName    = contract?.client?.name ?? 'Client'
    const contractTitle = contract?.title ?? 'your contract'

    await this.notifications.create({
      userId,
      type:       'contract.signed',
      title:      'Contract signed',
      body:       `${clientName} signed "${contractTitle}"`,
      entityId,
      entityType: 'contract',
    })
  }

  @OnEvent('lead.created')
  async onLeadCreated({ entityId, userId }: EventPayload) {
    const lead = await this.prisma.lead.findUnique({ where: { id: entityId } })
    const parts: string[] = [lead?.name ?? 'Someone']
    if (lead?.company) parts.push(lead.company)
    const suffix = lead?.service ? ` — interested in ${lead.service}` : ''

    await this.notifications.create({
      userId,
      type:       'lead.created',
      title:      'New enquiry',
      body:       parts.join(' · ') + suffix,
      entityId,
      entityType: 'lead',
    })
  }
}
