import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';

interface EventPayload {
  entityId: string
  userId:   string
}

@Injectable()
export class NotificationsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('invoice.paid')
  async onInvoicePaid({ entityId, userId }: EventPayload) {
    await this.notifications.create({
      userId,
      type:       'invoice.paid',
      title:      'Payment received',
      body:       'Your invoice has been paid',
      entityId,
      entityType: 'invoice',
    });
  }

  @OnEvent('proposal.opened')
  async onProposalOpened({ entityId, userId }: EventPayload) {
    await this.notifications.create({
      userId,
      type:       'proposal.opened',
      title:      'Proposal opened',
      body:       'A client just opened your proposal',
      entityId,
      entityType: 'proposal',
    });
  }

  @OnEvent('proposal.accepted')
  async onProposalAccepted({ entityId, userId }: EventPayload) {
    await this.notifications.create({
      userId,
      type:       'proposal.accepted',
      title:      'Proposal accepted!',
      body:       'Your proposal was accepted',
      entityId,
      entityType: 'proposal',
    });
  }

  @OnEvent('contract.signed')
  async onContractSigned({ entityId, userId }: EventPayload) {
    await this.notifications.create({
      userId,
      type:       'contract.signed',
      title:      'Contract signed',
      body:       'Your contract has been signed',
      entityId,
      entityType: 'contract',
    });
  }

  @OnEvent('lead.created')
  async onLeadCreated({ entityId, userId }: EventPayload) {
    await this.notifications.create({
      userId,
      type:       'lead.created',
      title:      'New enquiry',
      body:       'You have a new lead',
      entityId,
      entityType: 'lead',
    });
  }
}
