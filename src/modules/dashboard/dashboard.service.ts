import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, LeadStage } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string) {
    const now = new Date();
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      revenueThisMonth,
      revenueLastMonth,
      overdueInvoices,
      activeLeads,
      openProposals,
      pipelineLeads,
    ] = await Promise.all([
      // Revenue this month (paid invoices)
      this.prisma.invoice.aggregate({
        where: { userId, status: InvoiceStatus.PAID, paidAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      // Revenue last month
      this.prisma.invoice.aggregate({
        where: { userId, status: InvoiceStatus.PAID, paidAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { total: true },
      }),
      // Overdue invoices
      this.prisma.invoice.aggregate({
        where: { userId, status: InvoiceStatus.OVERDUE },
        _sum: { total: true },
        _count: true,
      }),
      // Active leads (not WON or LOST)
      this.prisma.lead.count({
        where: { userId, isDeleted: false, stage: { notIn: [LeadStage.WON, LeadStage.LOST] } },
      }),
      // Open proposals (SENT or OPENED)
      this.prisma.proposal.count({
        where: { userId, status: { in: ['SENT', 'OPENED'] } },
      }),
      // Pipeline value from active leads
      this.prisma.lead.aggregate({
        where: { userId, isDeleted: false, stage: { notIn: [LeadStage.WON, LeadStage.LOST] } },
        _sum: { budget: true },
      }),
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
      pipelineValue:     Number(pipelineLeads._sum.budget ?? 0),
      activeLeads,
      openProposals,
    };
  }

  async getRecentActivity(userId: string) {
    const [invoices, contracts, proposals, leads] = await Promise.all([
      this.prisma.invoice.findMany({
        where:   { userId, status: { in: [InvoiceStatus.PAID, InvoiceStatus.SENT] } },
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { client: { select: { name: true } } },
      }),
      this.prisma.contract.findMany({
        where:   { userId, status: { in: ['SIGNED', 'SENT'] } },
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { client: { select: { name: true } } },
      }),
      this.prisma.proposal.findMany({
        where:   { userId, status: { in: ['ACCEPTED', 'OPENED', 'SENT'] } },
        orderBy: { updatedAt: 'desc' },
        take:    5,
        include: { client: { select: { name: true } }, lead: { select: { name: true } } },
      }),
      this.prisma.lead.findMany({
        where:   { userId, isDeleted: false },
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

    for (const l of leads) {
      events.push({ type: 'lead_added', label: 'New lead added', detail: `${l.name}${l.company ? ` — ${l.company}` : ''}`, time: l.createdAt, entityId: l.id });
    }

    return events
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 10);
  }

  async getUpcomingFollowUps(userId: string) {
    const now      = new Date();
    const in7Days  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return this.prisma.lead.findMany({
      where: {
        userId,
        isDeleted:  false,
        followUpAt: { gte: now, lte: in7Days },
        stage:      { notIn: [LeadStage.WON, LeadStage.LOST] },
      },
      orderBy: { followUpAt: 'asc' },
      take: 8,
    });
  }

  async getRevenueChart(userId: string) {
    const months: { month: string; revenue: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const result = await this.prisma.invoice.aggregate({
        where: { userId, status: InvoiceStatus.PAID, paidAt: { gte: start, lte: end } },
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
