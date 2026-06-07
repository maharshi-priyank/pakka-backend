import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FlodeskService } from './flodesk.service.js';
import { LeadStage } from '@prisma/client';

interface AutomationEvent {
  entityId: string;
  userId:   string;
}

interface LeadUpdatedEvent extends AutomationEvent {
  stage?: string;
}

@Injectable()
export class FlodeskListener {
  private readonly logger = new Logger(FlodeskListener.name);

  constructor(
    private readonly flodesk: FlodeskService,
    private readonly prisma:  PrismaService,
  ) {}

  @OnEvent('client.created')
  async onClientCreated(ev: AutomationEvent) {
    const client = await this.prisma.client.findUnique({
      where:  { id: ev.entityId },
      select: { email: true, name: true },
    });
    if (!client) return;
    await this.flodesk.syncClient(ev.userId, client);
  }

  @OnEvent('lead.created')
  async onLeadCreated(ev: AutomationEvent) {
    const lead = await this.prisma.lead.findUnique({
      where:  { id: ev.entityId },
      select: { email: true, name: true },
    });
    if (!lead) return;
    await this.flodesk.syncLead(ev.userId, lead);
  }

  @OnEvent('lead.updated')
  async onLeadUpdated(ev: LeadUpdatedEvent) {
    if (ev.stage !== LeadStage.WON) return;
    const lead = await this.prisma.lead.findUnique({
      where:  { id: ev.entityId },
      select: { email: true, name: true },
    });
    if (!lead) return;
    await this.flodesk.syncWonLead(ev.userId, lead);
  }

  @OnEvent('invoice.paid')
  async onInvoicePaid(ev: AutomationEvent) {
    const invoice = await this.prisma.invoice.findUnique({
      where:   { id: ev.entityId },
      select:  { client: { select: { email: true, name: true } } },
    });
    if (!invoice?.client) return;
    await this.flodesk.syncPaidInvoice(ev.userId, invoice.client.email, invoice.client.name);
  }
}
