import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleSheetsService, SHEET } from './google-sheets.service';

@Injectable()
export class GoogleSheetsListener {
  private readonly logger = new Logger(GoogleSheetsListener.name);

  constructor(
    private readonly sheets: GoogleSheetsService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Leads ────────────────────────────────────────────────────────────────

  @OnEvent('lead.created', { async: true })
  async onLeadCreated(payload: { entityId: string; userId: string }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: payload.entityId },
    });
    if (!lead) return;
    await this.sheets.appendRow(payload.userId, SHEET.LEADS, this.sheets.buildLeadRow(lead));
  }

  @OnEvent('lead.updated', { async: true })
  async onLeadUpdated(payload: { entityId: string; userId: string }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: payload.entityId },
    });
    if (!lead) return;
    await this.sheets.updateRowById(payload.userId, SHEET.LEADS, lead.id, this.sheets.buildLeadRow(lead));
  }

  @OnEvent('lead.converted', { async: true })
  async onLeadConverted(payload: { entityId: string; userId: string }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: payload.entityId },
    });
    if (!lead) return;
    await this.sheets.updateRowById(payload.userId, SHEET.LEADS, lead.id, this.sheets.buildLeadRow(lead));
  }

  // ─── Clients ──────────────────────────────────────────────────────────────

  @OnEvent('client.created', { async: true })
  async onClientCreated(payload: { entityId: string; userId: string }) {
    const client = await this.prisma.client.findUnique({
      where: { id: payload.entityId },
    });
    if (!client) return;
    await this.sheets.appendRow(payload.userId, SHEET.CLIENTS, this.sheets.buildClientRow(client));
  }

  // ─── Proposals ────────────────────────────────────────────────────────────

  @OnEvent('proposal.sent', { async: true })
  async onProposalSent(payload: { entityId: string; userId: string }) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!proposal) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.PROPOSALS, proposal.id, this.sheets.buildProposalRow(proposal),
    );
  }

  @OnEvent('proposal.accepted', { async: true })
  async onProposalAccepted(payload: { entityId: string; userId: string }) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!proposal) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.PROPOSALS, proposal.id, this.sheets.buildProposalRow(proposal),
    );
  }

  @OnEvent('proposal.declined', { async: true })
  async onProposalDeclined(payload: { entityId: string; userId: string }) {
    const proposal = await this.prisma.proposal.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!proposal) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.PROPOSALS, proposal.id, this.sheets.buildProposalRow(proposal),
    );
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────

  @OnEvent('invoice.sent', { async: true })
  async onInvoiceSent(payload: { entityId: string; userId: string }) {
    const invoice = await this.prisma.invoice.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!invoice) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.REVENUE, invoice.invoiceNumber, this.sheets.buildInvoiceRow(invoice),
    );
  }

  @OnEvent('invoice.paid', { async: true })
  async onInvoicePaid(payload: { entityId: string; userId: string }) {
    const invoice = await this.prisma.invoice.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!invoice) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.REVENUE, invoice.invoiceNumber, this.sheets.buildInvoiceRow(invoice),
    );
  }

  @OnEvent('invoice.overdue', { async: true })
  async onInvoiceOverdue(payload: { entityId: string; userId: string }) {
    const invoice = await this.prisma.invoice.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!invoice) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.REVENUE, invoice.invoiceNumber, this.sheets.buildInvoiceRow(invoice),
    );
  }

  @OnEvent('invoice.partial', { async: true })
  async onInvoicePartial(payload: { entityId: string; userId: string }) {
    const invoice = await this.prisma.invoice.findUnique({
      where:   { id: payload.entityId },
      include: { client: true },
    });
    if (!invoice) return;
    await this.sheets.updateRowById(
      payload.userId, SHEET.REVENUE, invoice.invoiceNumber, this.sheets.buildInvoiceRow(invoice),
    );
  }
}
