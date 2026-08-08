import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, ContactStage } from '@prisma/client';

// Contact replaced Lead as the live pipeline entity -- mirrors
// contacts.service.ts's ACTIVE_STAGES. WON_STAGES has no single-value
// equivalent in the old LeadStage enum (which only had WON); a Contact can
// land in either CLIENT or PAST_CLIENT and both count as "won" here.
const ACTIVE_STAGES: ContactStage[] = ['ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING'];
const WON_STAGES:    ContactStage[] = ['CLIENT', 'PAST_CLIENT'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(workspaceId: string) {
    const now = new Date();
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      revenueThisMonth,
      revenueLastMonth,
      overdueInvoices,
      activeContacts,
      openProposals,
      pipelineContacts,
      workspace,
      unreadClientMessages,
      totalContacts,
      totalProposals,
      totalInvoices,
      totalContracts,
    ] = await Promise.all([
      // Revenue this month (paid invoices)
      this.prisma.invoice.aggregate({
        where: { workspaceId, status: InvoiceStatus.PAID, paidAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      // Revenue last month
      this.prisma.invoice.aggregate({
        where: { workspaceId, status: InvoiceStatus.PAID, paidAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { total: true },
      }),
      // Overdue invoices
      this.prisma.invoice.aggregate({
        where: { workspaceId, status: InvoiceStatus.OVERDUE },
        _sum: { total: true },
        _count: true,
      }),
      // Active contacts (still in the open pipeline)
      this.prisma.contact.count({
        where: { workspaceId, archivedAt: null, stage: { in: ACTIVE_STAGES } },
      }),
      // Open proposals (SENT or OPENED)
      this.prisma.proposal.count({
        where: { workspaceId, status: { in: ['SENT', 'OPENED'] } },
      }),
      // Pipeline value from active contacts
      this.prisma.contact.aggregate({
        where: { workspaceId, archivedAt: null, stage: { in: ACTIVE_STAGES } },
        _sum: { dealValue: true },
      }),
      // Workspace record — for the monthly revenue goal
      this.prisma.workspace.findUnique({
        where:  { id: workspaceId },
        select: { monthlyRevenueGoal: true },
      }),
      // Unread messages sent by clients on the portal, across the whole workspace
      this.prisma.message.count({
        where: { senderType: 'CLIENT', readAt: null, thread: { workspaceId } },
      }),
      // All-time counts — used to detect a brand-new, empty workspace
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.proposal.count({ where: { workspaceId } }),
      this.prisma.invoice.count({ where: { workspaceId } }),
      this.prisma.contract.count({ where: { workspaceId } }),
    ]);

    const thisMonth = Number(revenueThisMonth._sum.total ?? 0);
    const lastMonth = Number(revenueLastMonth._sum.total ?? 0);
    const revenueChange = lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : null;

    return {
      revenueThisMonth:  thisMonth,
      revenueLastMonth:  lastMonth,
      revenueChange,
      overdueAmount:     Number(overdueInvoices._sum.total ?? 0),
      overdueCount:      overdueInvoices._count,
      pipelineValue:     Number(pipelineContacts._sum.dealValue ?? 0),
      activeContacts,
      openProposals,
      monthlyRevenueGoal:   workspace?.monthlyRevenueGoal != null ? Number(workspace.monthlyRevenueGoal) : null,
      unreadClientMessages,
      hasAnyActivity: totalContacts > 0 || totalProposals > 0 || totalInvoices > 0 || totalContracts > 0,
    };
  }

  async getRecentActivity(workspaceId: string) {
    const [invoices, contracts, proposals, contacts] = await Promise.all([
      this.prisma.invoice.findMany({
        where:   { workspaceId, status: { in: [InvoiceStatus.PAID, InvoiceStatus.SENT] } },
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { client: { select: { name: true } } },
      }),
      this.prisma.contract.findMany({
        where:   { workspaceId, status: { in: ['SIGNED', 'SENT'] } },
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { client: { select: { name: true } } },
      }),
      this.prisma.proposal.findMany({
        where:   { workspaceId, status: { in: ['ACCEPTED', 'OPENED', 'SENT'] } },
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { client: { select: { name: true } }, lead: { select: { name: true } } },
      }),
      this.prisma.contact.findMany({
        where:   { workspaceId, archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
    ]);

    const events: Array<{
      type: string; label: string; detail: string; time: Date; entityId: string
    }> = [];

    for (const inv of invoices) {
      const name = inv.client?.name ?? 'Client';
      if (inv.status === InvoiceStatus.PAID && inv.paidAt) {
        events.push({ type: 'invoice_paid', label: 'Payment received', detail: `${name} — ${inv.invoiceNumber}`, time: inv.paidAt, entityId: inv.id });
      } else {
        events.push({ type: 'invoice_sent', label: 'Invoice sent', detail: `${name} — ${inv.invoiceNumber}`, time: inv.updatedAt, entityId: inv.id });
      }
    }

    for (const c of contracts) {
      const name = c.client?.name ?? 'Client';
      if (c.status === 'SIGNED' && c.signedAt) {
        events.push({ type: 'contract_signed', label: 'Contract signed', detail: `${name} — ${c.title}`, time: c.signedAt, entityId: c.id });
      } else {
        events.push({ type: 'contract_sent', label: 'Contract sent', detail: `${name} — ${c.title}`, time: c.updatedAt, entityId: c.id });
      }
    }

    for (const p of proposals) {
      const name = p.client?.name ?? p.lead?.name ?? 'Client';
      if (p.status === 'ACCEPTED' && p.acceptedAt) {
        events.push({ type: 'proposal_accepted', label: 'Proposal accepted', detail: `${name} — ${p.title}`, time: p.acceptedAt, entityId: p.id });
      } else if (p.status === 'OPENED') {
        events.push({ type: 'proposal_opened', label: 'Proposal opened', detail: `${name} — ${p.title}`, time: p.updatedAt, entityId: p.id });
      } else {
        events.push({ type: 'proposal_sent', label: 'Proposal sent', detail: `${name} — ${p.title}`, time: p.updatedAt, entityId: p.id });
      }
    }

    for (const c of contacts) {
      events.push({ type: 'contact_added', label: 'New contact added', detail: `${c.name}${c.company ? ` — ${c.company}` : ''}`, time: c.createdAt, entityId: c.id });
    }

    return events
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 10);
  }

  async getUpcomingFollowUps(workspaceId: string) {
    const now      = new Date();
    const in7Days  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return this.prisma.contact.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        followUpAt: { gte: now, lte: in7Days },
        stage:      { notIn: [...WON_STAGES, 'LOST'] },
      },
      orderBy: { followUpAt: 'asc' },
      take: 8,
    });
  }

  async getRevenueChart(workspaceId: string) {
    const months: { month: string; revenue: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const result = await this.prisma.invoice.aggregate({
        where: { workspaceId, status: InvoiceStatus.PAID, paidAt: { gte: start, lte: end } },
        _sum: { total: true },
      });

      months.push({
        month:   start.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: Number(result._sum.total ?? 0),
      });
    }

    return months;
  }
}
