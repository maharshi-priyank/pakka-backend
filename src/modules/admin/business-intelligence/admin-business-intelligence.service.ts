import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AdminBiExportQueryDto, AdminBiQueryDto } from './dto/admin-bi-query.dto';
import {
  asRecord,
  detectBillingProvider,
  extractBillingAmount,
  extractBillingCurrency,
  isSuccessfulBillingEvent,
} from '../shared/admin-billing-normalization';

interface Range { from: Date; to: Date }
type Provider = 'razorpay' | 'stripe' | 'unknown';

@Injectable()
export class AdminBusinessIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async revenue(query: AdminBiQueryDto = {}) {
    const range = this.resolveRange(query);
    const [events, invoices] = await Promise.all([
      this.prisma.billingEvent.findMany({ where: { processedAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, select: { id: true, eventType: true, razorpayRef: true, workspaceId: true, payload: true, processedAt: true }, take: 10000 }),
      this.prisma.invoice.findMany({ where: { createdAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, select: { id: true, invoiceNumber: true, workspaceId: true, status: true, total: true, amountPaid: true, currency: true, dueDate: true, paidAt: true, workspace: { select: { name: true } } }, take: 10000 }),
    ]);
    const filteredEvents = events.filter((event) => this.matchesProvider(this.provider(event), query.provider) && (!query.currency || this.currency(event) === query.currency.toUpperCase()));
    const filteredInvoices = invoices.filter((invoice) => !query.currency || invoice.currency.toUpperCase() === query.currency.toUpperCase());
    const collections = new Map<string, { amount: number; events: number }>();
    let collectionEvents = 0;
    let missingAmount = 0;
    let missingCurrency = 0;
    for (const event of filteredEvents) {
      if (!this.isSuccess(event.eventType, event.payload)) continue;
      collectionEvents += 1;
      const amount = this.amount(event);
      const currency = this.currency(event);
      if (amount === null) missingAmount += 1;
      if (!currency) missingCurrency += 1;
      if (amount === null || !currency) continue;
      const bucket = collections.get(currency) ?? { amount: 0, events: 0 };
      bucket.amount += amount;
      bucket.events += 1;
      collections.set(currency, bucket);
    }
    const invoiceSummary = this.invoiceSummary(filteredInvoices);
    return {
      range: this.serializeRange(range),
      collections: [...collections.entries()].map(([currency, value]) => ({ currency, ...value })),
      invoiceSummary,
      dataQuality: {
        billingEventsRead: filteredEvents.length,
        successfulCollectionEvents: collectionEvents,
        eventsWithoutAmount: missingAmount,
        eventsWithoutCurrency: missingCurrency,
        mixedCurrencyConversionAvailable: false as const,
      },
    };
  }

  async reconciliation(query: AdminBiQueryDto = {}) {
    const range = this.resolveRange(query);
    const [events, invoices] = await Promise.all([
      this.prisma.billingEvent.findMany({ where: { processedAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, select: { id: true, eventType: true, razorpayRef: true, workspaceId: true, payload: true, processedAt: true }, take: 10000 }),
      this.prisma.invoice.findMany({ where: { createdAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, select: { id: true, invoiceNumber: true, workspaceId: true, status: true, total: true, amountPaid: true, currency: true, razorpayPaymentId: true, dueDate: true, workspace: { select: { name: true } } }, take: 10000 }),
    ]);
    const items: Array<Record<string, unknown>> = [];
    const references = new Map<string, number>();
    for (const event of events.filter((item) => this.matchesProvider(this.provider(item), query.provider))) {
      const reference = this.providerReference(event);
      if (reference) references.set(reference, (references.get(reference) ?? 0) + 1);
      const amount = this.amount(event);
      const currency = this.currency(event);
      if (amount === null || !currency || !event.workspaceId || !this.eventOwner(event)) {
        items.push({ id: `event:${event.id}`, type: 'missing_reference', severity: 'warning', billingEventId: event.id, workspaceId: event.workspaceId, providerReference: reference, processedAt: event.processedAt, missing: { amount: amount === null, currency: !currency, workspace: !event.workspaceId, owner: !this.eventOwner(event) } });
      }
    }
    for (const invoice of invoices) {
      const total = Number(invoice.total);
      const paid = Number(invoice.amountPaid);
      if (paid > total || (invoice.status === 'PAID' && paid + 0.01 < total)) {
        items.push({ id: `invoice:${invoice.id}`, type: 'invoice_mismatch', severity: 'critical', invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, workspaceId: invoice.workspaceId, workspaceName: invoice.workspace.name, currency: invoice.currency, total, amountPaid: paid, status: invoice.status });
      }
      if (invoice.status === 'PAID' && !invoice.razorpayPaymentId) {
        items.push({ id: `invoice-payment:${invoice.id}`, type: 'missing_payment_reference', severity: 'warning', invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, workspaceId: invoice.workspaceId, workspaceName: invoice.workspace.name, currency: invoice.currency });
      }
    }
    for (const [reference, count] of references) if (count > 1) items.push({ id: `duplicate:${reference}`, type: 'duplicate_provider_reference', severity: 'warning', providerReference: reference, count });
    const searchFiltered = query.currency ? items.filter((item) => item.currency === query.currency!.toUpperCase() || item.currency === undefined) : items;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return { items: searchFiltered.slice((page - 1) * pageSize, page * pageSize), total: searchFiltered.length, page, pageSize, range: this.serializeRange(range), dataQuality: { reconciliationIsBestEffort: true as const, rawPayloadsExposed: false as const } };
  }

  async cohorts(query: AdminBiQueryDto = {}) {
    const range = this.resolveRange(query);
    const users = await this.prisma.user.findMany({ where: { createdAt: { gte: range.from, lt: range.to }, ...(query.plan ? { plan: query.plan } : {}), ...(query.subscriptionStatus ? { subscriptionStatus: query.subscriptionStatus } : {}) }, select: { id: true, createdAt: true, onboardingComplete: true, onboardingCompletedAt: true, subscriptionStatus: true, activeWorkspaceId: true }, take: 10000 });
    const productEventStore = (this.prisma as PrismaService & { productEvent?: { findMany: (args: Record<string, unknown>) => Promise<Array<{ userId: string; eventName: string; occurredAt: Date }>> } }).productEvent;
    const productEvents = productEventStore?.findMany
      ? await productEventStore.findMany({ where: { userId: { in: users.map(user => user.id) }, eventName: { in: ['onboarding_completed', 'session_started'] } }, select: { userId: true, eventName: true, occurredAt: true }, take: 100000 })
      : [];
    const billingEvents = await this.prisma.billingEvent.findMany({ where: { processedAt: { gte: range.from, lt: range.to } }, select: { payload: true, eventType: true }, take: 10000 });
    const eventsByUser = new Map<string, Array<{ eventName: string; occurredAt: Date }>>();
    for (const event of productEvents) eventsByUser.set(event.userId, [...(eventsByUser.get(event.userId) ?? []), event]);
    const cohorts = new Map<string, { cohort: string; newUsers: number; currentOnboarded: number; activeSubscriptions: number; activeWorkspaceProxy: number; eligible7: number; activated7: number; eligible30: number; activated30: number; eligible90: number; activated90: number; collections: Record<string, number> }>();
    const userCohorts = new Map(users.map((user) => [user.id, this.monthKey(user.createdAt)]));
    for (const user of users) {
      const cohort = this.getCohort(cohorts, this.monthKey(user.createdAt));
      const userEvents = eventsByUser.get(user.id) ?? [];
      cohort.newUsers += 1;
      if (user.onboardingComplete) cohort.currentOnboarded += 1;
      if (user.subscriptionStatus === 'ACTIVE') cohort.activeSubscriptions += 1;
      if (userEvents.some(event => event.eventName === 'session_started')) cohort.activeWorkspaceProxy += 1;
      const ageDays = (Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      const onboardingAt = userEvents.filter(event => event.eventName === 'onboarding_completed').sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]?.occurredAt ?? user.onboardingCompletedAt;
      const telemetryAvailable = user.createdAt >= new Date('2026-08-03T00:00:00.000Z');
      if (ageDays >= 7 && telemetryAvailable) { cohort.eligible7 += 1; if (onboardingAt && onboardingAt.getTime() <= user.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) cohort.activated7 += 1; }
      if (ageDays >= 30 && telemetryAvailable) { cohort.eligible30 += 1; if (onboardingAt && onboardingAt.getTime() <= user.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) cohort.activated30 += 1; }
      if (ageDays >= 90 && telemetryAvailable) { cohort.eligible90 += 1; if (onboardingAt && onboardingAt.getTime() <= user.createdAt.getTime() + 90 * 24 * 60 * 60 * 1000) cohort.activated90 += 1; }
    }
    for (const event of billingEvents) {
      if (!this.isSuccess(event.eventType, event.payload)) continue;
      const payload = this.record(event.payload);
      const userId = this.stringValue(payload?.userId) ?? this.stringValue(payload?.user_id);
      const cohortKey = userId ? userCohorts.get(userId) : undefined;
      if (!cohortKey) continue;
      const amount = this.numberValue(payload?.amount);
      const currency = this.stringValue(payload?.currency)?.toUpperCase();
      if (amount === null || !currency) continue;
      const cohort = this.getCohort(cohorts, cohortKey);
      cohort.collections[currency] = (cohort.collections[currency] ?? 0) + amount;
    }
    return {
      range: this.serializeRange(range),
      items: [...cohorts.values()].sort((a, b) => a.cohort.localeCompare(b.cohort)).map((cohort) => ({ cohort: cohort.cohort, newUsers: cohort.newUsers, currentOnboarded: cohort.currentOnboarded, currentActivationRate: this.rate(cohort.currentOnboarded, cohort.newUsers), activeSubscriptions: cohort.activeSubscriptions, activityProxy: cohort.activeWorkspaceProxy, activationProxy7: this.rate(cohort.activated7, cohort.eligible7), activationProxy30: this.rate(cohort.activated30, cohort.eligible30), activationProxy90: this.rate(cohort.activated90, cohort.eligible90), collections: cohort.collections })),
      dataQuality: { onboardingCompletionTimestampAvailable: true as const, loginTelemetryAvailable: productEvents.length > 0, retentionIsProductActivityProxy: false as const, historicalTelemetryCoverageStart: '2026-08-03T00:00:00.000Z', cohortCollectionsRequireUserReference: true as const },
    };
  }

  async invoiceAging(query: AdminBiQueryDto = {}) {
    const range = this.resolveRange(query);
    const invoices = await this.prisma.invoice.findMany({ where: { createdAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}), ...(query.currency ? { currency: query.currency.toUpperCase() } : {}) }, select: { id: true, invoiceNumber: true, workspaceId: true, status: true, total: true, amountPaid: true, currency: true, dueDate: true, paidAt: true, workspace: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 10000 });
    const now = Date.now();
    const buckets = new Map<string, { currency: string; invoices: number; total: number; outstanding: number }>();
    const rows = invoices.map((invoice) => {
      const total = Number(invoice.total);
      const paid = Number(invoice.amountPaid);
      const outstanding = Math.max(total - paid, 0);
      const daysOverdue = invoice.dueDate && outstanding > 0 ? Math.max(Math.floor((now - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000)), 0) : 0;
      const bucket = outstanding <= 0 ? 'paid' : !invoice.dueDate || daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? '1-30' : daysOverdue <= 60 ? '31-60' : daysOverdue <= 90 ? '61-90' : '90+';
      const key = `${invoice.currency}:${bucket}`;
      const summary = buckets.get(key) ?? { currency: invoice.currency, invoices: 0, total: 0, outstanding: 0 };
      summary.invoices += 1; summary.total += total; summary.outstanding += outstanding; buckets.set(key, summary);
      return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, workspaceId: invoice.workspaceId, workspaceName: invoice.workspace.name, status: invoice.status, currency: invoice.currency, total, amountPaid: paid, outstanding, dueDate: invoice.dueDate, daysOverdue, bucket };
    });
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return { range: this.serializeRange(range), buckets: [...buckets.entries()].map(([bucket, value]) => ({ bucket, ...value })), items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, dataQuality: { currencyConversionAvailable: false as const } };
  }

  async export(query: AdminBiExportQueryDto) {
    const report = query.report;
    const data: any = report === 'revenue' ? await this.revenue(query) : report === 'reconciliation' ? await this.reconciliation(query) : report === 'cohorts' ? await this.cohorts(query) : await this.invoiceAging(query);
    const rows: string[][] = [['report', 'section', 'key', 'value']];
    const add = (section: string, key: string, value: unknown) => rows.push([report, section, key, typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')]);
    if (report === 'revenue') { add('range', 'from', data.range.from); add('range', 'to', data.range.to); for (const item of data.collections) add('collections', item.currency, item.amount); for (const item of data.invoiceSummary) add('invoiceSummary', item.currency, item.outstanding); }
    if (report === 'reconciliation') for (const item of data.items) add('reconciliation', String(item.id), item);
    if (report === 'cohorts') for (const item of data.items) add('cohort', item.cohort, item);
    if (report === 'invoice-aging') for (const item of data.items) add('invoice', item.invoiceNumber, item);
    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
  }

  private invoiceSummary(invoices: Array<{ status: string; total: any; amountPaid: any; currency: string; dueDate: Date | null }>) {
    const summary = new Map<string, { currency: string; invoices: number; total: number; paid: number; outstanding: number; overdue: number }>();
    const now = Date.now();
    for (const invoice of invoices) {
      const value = summary.get(invoice.currency) ?? { currency: invoice.currency, invoices: 0, total: 0, paid: 0, outstanding: 0, overdue: 0 };
      const total = Number(invoice.total); const paid = Number(invoice.amountPaid);
      value.invoices += 1; value.total += total; value.paid += paid; value.outstanding += Math.max(total - paid, 0);
      if (invoice.dueDate && invoice.dueDate.getTime() < now && total > paid) value.overdue += Math.max(total - paid, 0);
      summary.set(invoice.currency, value);
    }
    return [...summary.values()];
  }

  private getCohort(map: Map<string, any>, key: string) {
    let cohort = map.get(key);
    if (!cohort) { cohort = { cohort: key, newUsers: 0, currentOnboarded: 0, activeSubscriptions: 0, activeWorkspaceProxy: 0, eligible7: 0, activated7: 0, eligible30: 0, activated30: 0, eligible90: 0, activated90: 0, collections: {} }; map.set(key, cohort); }
    return cohort;
  }

  private resolveRange(query: AdminBiQueryDto): Range {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new BadRequestException('Invalid BI date range.');
    if (to.getTime() - from.getTime() > 365 * 24 * 60 * 60 * 1000) throw new BadRequestException('BI date range cannot exceed 365 days.');
    return { from, to };
  }

  private serializeRange(range: Range) { return { from: range.from.toISOString(), to: range.to.toISOString() }; }
  private record(payload: unknown) { return asRecord(payload); }
  private stringValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
  private numberValue(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : null; }
  private amount(event: { eventType: string; payload: unknown }) { return extractBillingAmount(event.payload, this.provider(event)); }
  private currency(event: { payload: unknown }) { return extractBillingCurrency(event.payload); }
  private provider(event: { eventType: string; payload: unknown }): Provider { return detectBillingProvider(event.eventType, event.payload); }
  private matchesProvider(provider: Provider, filter = 'all') { return filter === 'all' || provider === filter; }
  private isSuccess(eventType: string, payload: unknown) { return isSuccessfulBillingEvent(eventType, payload); }
  private providerReference(event: { razorpayRef: string; payload: unknown }) { const payload = this.record(event.payload); return this.stringValue(payload?.payment_id ?? payload?.paymentId ?? payload?.id) ?? event.razorpayRef; }
  private eventOwner(event: { payload: unknown }) { const payload = this.record(event.payload); return Boolean(this.stringValue(payload?.userId) ?? this.stringValue(payload?.user_id) ?? this.stringValue(payload?.email)); }
  private monthKey(date: Date) { return date.toISOString().slice(0, 7); }
  private rate(numerator: number, denominator: number) { return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null; }
  private csvCell(value: unknown) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
}
