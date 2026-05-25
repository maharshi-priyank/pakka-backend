import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, GstType } from '@prisma/client';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface MonthlyPoint {
  period: string;
  value:  number;
}

export interface RevenueRow {
  period:       string;
  invoiced:     number;
  collected:    number;
  outstanding:  number;
  invoiceCount: number;
}

export interface GstRow {
  period:       string;
  taxableValue: number;
  igst:         number;
  cgst:         number;
  sgst:         number;
  tds:          number;
  totalTax:     number;
  invoiceCount: number;
}

export interface ClientRow {
  clientId:     string | null;
  clientName:   string;
  invoiced:     number;
  collected:    number;
  outstanding:  number;
  invoiceCount: number;
}

export interface ExpenseRow {
  category:    string;
  count:       number;
  total:       number;
  billable:    number;
  nonBillable: number;
}

export interface TimeRow {
  clientId:      string | null;
  clientName:    string;
  totalMins:     number;
  totalHours:    string;
  billedMins:    number;
  unbilledMins:  number;
  billableValue: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private toMonthKey(d: Date): string {
    return d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
  }

  private n(v: { toString(): string } | null | undefined): number {
    return Number(v ?? 0);
  }

  private dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(from);
    if (to)   range.lte = new Date(to + 'T23:59:59.999Z');
    return range;
  }

  // ── Revenue Report ──────────────────────────────────────────────────────────

  async revenueReport(userId: string, from?: string, to?: string) {
    const dateFilter = this.dateRange(from, to);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        userId,
        status: { not: InvoiceStatus.DRAFT },
        ...(dateFilter && { createdAt: dateFilter }),
      },
      select: { total: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthMap = new Map<string, RevenueRow>();

    for (const inv of invoices) {
      const key = this.toMonthKey(inv.createdAt);
      if (!monthMap.has(key)) {
        monthMap.set(key, { period: key, invoiced: 0, collected: 0, outstanding: 0, invoiceCount: 0 });
      }
      const row = monthMap.get(key)!;
      const amount = this.n(inv.total);
      row.invoiced     += amount;
      row.invoiceCount += 1;
      if (inv.status === InvoiceStatus.PAID)                                            row.collected    += amount;
      if (inv.status === InvoiceStatus.SENT || inv.status === InvoiceStatus.OVERDUE)    row.outstanding  += amount;
    }

    const rows = [...monthMap.values()];
    const totals = rows.reduce(
      (acc, r) => ({
        invoiced:    acc.invoiced    + r.invoiced,
        collected:   acc.collected   + r.collected,
        outstanding: acc.outstanding + r.outstanding,
        invoiceCount: acc.invoiceCount + r.invoiceCount,
      }),
      { invoiced: 0, collected: 0, outstanding: 0, invoiceCount: 0 },
    );

    return { rows, totals };
  }

  // ── GST Report ───────────────────────────────────────────────────────────────

  async gstReport(userId: string, from?: string, to?: string) {
    const dateFilter = this.dateRange(from, to);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        userId,
        status: { not: InvoiceStatus.DRAFT },
        ...(dateFilter && { createdAt: dateFilter }),
      },
      select: { subtotal: true, gstAmount: true, total: true, gstType: true, tdsRate: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthMap = new Map<string, GstRow>();

    for (const inv of invoices) {
      const key = this.toMonthKey(inv.createdAt);
      if (!monthMap.has(key)) {
        monthMap.set(key, { period: key, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, tds: 0, totalTax: 0, invoiceCount: 0 });
      }
      const row  = monthMap.get(key)!;
      const gst  = this.n(inv.gstAmount);
      const tds  = inv.tdsRate ? this.n(inv.total) * (this.n(inv.tdsRate) / 100) : 0;

      let igst = 0, cgst = 0, sgst = 0;
      if (inv.gstType === GstType.IGST)      { igst = gst; }
      if (inv.gstType === GstType.CGST_SGST) { cgst = gst / 2; sgst = gst / 2; }

      row.taxableValue  += this.n(inv.subtotal);
      row.igst          += igst;
      row.cgst          += cgst;
      row.sgst          += sgst;
      row.tds           += tds;
      row.totalTax      += igst + cgst + sgst;
      row.invoiceCount  += 1;
    }

    const rows = [...monthMap.values()];
    const totals = rows.reduce(
      (acc, r) => ({
        taxableValue: acc.taxableValue + r.taxableValue,
        igst:         acc.igst         + r.igst,
        cgst:         acc.cgst         + r.cgst,
        sgst:         acc.sgst         + r.sgst,
        tds:          acc.tds          + r.tds,
        totalTax:     acc.totalTax     + r.totalTax,
        invoiceCount: acc.invoiceCount + r.invoiceCount,
      }),
      { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, tds: 0, totalTax: 0, invoiceCount: 0 },
    );

    return { rows, totals };
  }

  // ── Client Report ─────────────────────────────────────────────────────────────

  async clientReport(userId: string, from?: string, to?: string) {
    const dateFilter = this.dateRange(from, to);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        userId,
        status: { not: InvoiceStatus.DRAFT },
        ...(dateFilter && { createdAt: dateFilter }),
      },
      select: { clientId: true, total: true, status: true, client: { select: { name: true } } },
    });

    const clientMap = new Map<string, ClientRow>();

    for (const inv of invoices) {
      const key  = inv.clientId ?? '__none__';
      const name = inv.client?.name ?? 'No client';
      if (!clientMap.has(key)) {
        clientMap.set(key, { clientId: inv.clientId, clientName: name, invoiced: 0, collected: 0, outstanding: 0, invoiceCount: 0 });
      }
      const row    = clientMap.get(key)!;
      const amount = this.n(inv.total);
      row.invoiced     += amount;
      row.invoiceCount += 1;
      if (inv.status === InvoiceStatus.PAID)                                            row.collected   += amount;
      if (inv.status === InvoiceStatus.SENT || inv.status === InvoiceStatus.OVERDUE)    row.outstanding += amount;
    }

    return [...clientMap.values()].sort((a, b) => b.invoiced - a.invoiced);
  }

  // ── Expense Report ────────────────────────────────────────────────────────────

  async expenseReport(userId: string, from?: string, to?: string) {
    const dateFilter = this.dateRange(from, to);

    const expenses = await this.prisma.expense.findMany({
      where: {
        userId,
        ...(dateFilter && { date: dateFilter }),
      },
      select: { category: true, amount: true, isBillable: true, date: true },
      orderBy: { date: 'asc' },
    });

    const categoryMap = new Map<string, ExpenseRow>();
    const monthMap    = new Map<string, number>();

    for (const exp of expenses) {
      // By category
      if (!categoryMap.has(exp.category)) {
        categoryMap.set(exp.category, { category: exp.category, count: 0, total: 0, billable: 0, nonBillable: 0 });
      }
      const row    = categoryMap.get(exp.category)!;
      const amount = this.n(exp.amount);
      row.count       += 1;
      row.total       += amount;
      if (exp.isBillable) row.billable    += amount;
      else                row.nonBillable += amount;

      // Monthly trend
      const key = this.toMonthKey(exp.date);
      monthMap.set(key, (monthMap.get(key) ?? 0) + amount);
    }

    const byCategory = [...categoryMap.values()].sort((a, b) => b.total - a.total);
    const monthly: MonthlyPoint[] = [...monthMap.entries()].map(([period, value]) => ({ period, value }));
    const totals = byCategory.reduce(
      (acc, r) => ({ count: acc.count + r.count, total: acc.total + r.total, billable: acc.billable + r.billable, nonBillable: acc.nonBillable + r.nonBillable }),
      { count: 0, total: 0, billable: 0, nonBillable: 0 },
    );

    return { byCategory, monthly, totals };
  }

  // ── Time Report ───────────────────────────────────────────────────────────────

  async timeReport(userId: string, from?: string, to?: string) {
    const dateFilter = this.dateRange(from, to);

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        ...(dateFilter && { date: dateFilter }),
      },
      select: { clientId: true, durationMins: true, hourlyRate: true, isBilled: true, date: true, client: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });

    const clientMap = new Map<string, TimeRow>();
    const monthMap  = new Map<string, number>();

    for (const entry of entries) {
      const key  = entry.clientId ?? '__none__';
      const name = entry.client?.name ?? 'No client';
      if (!clientMap.has(key)) {
        clientMap.set(key, { clientId: entry.clientId, clientName: name, totalMins: 0, totalHours: '0', billedMins: 0, unbilledMins: 0, billableValue: 0 });
      }
      const row = clientMap.get(key)!;
      row.totalMins += entry.durationMins;
      if (entry.isBilled) row.billedMins   += entry.durationMins;
      else                row.unbilledMins += entry.durationMins;
      if (entry.hourlyRate) {
        row.billableValue += (entry.durationMins / 60) * this.n(entry.hourlyRate);
      }

      // Monthly trend (hours)
      const mKey = this.toMonthKey(entry.date);
      monthMap.set(mKey, (monthMap.get(mKey) ?? 0) + entry.durationMins);
    }

    const byClient = [...clientMap.values()]
      .map(r => ({ ...r, totalHours: (r.totalMins / 60).toFixed(1) }))
      .sort((a, b) => b.totalMins - a.totalMins);

    const monthly: MonthlyPoint[] = [...monthMap.entries()].map(([period, mins]) => ({
      period,
      value: parseFloat((mins / 60).toFixed(1)),
    }));

    const totals = byClient.reduce(
      (acc, r) => ({
        totalMins:     acc.totalMins     + r.totalMins,
        billedMins:    acc.billedMins    + r.billedMins,
        unbilledMins:  acc.unbilledMins  + r.unbilledMins,
        billableValue: acc.billableValue + r.billableValue,
      }),
      { totalMins: 0, billedMins: 0, unbilledMins: 0, billableValue: 0 },
    );

    return { byClient, monthly, totals };
  }
}
