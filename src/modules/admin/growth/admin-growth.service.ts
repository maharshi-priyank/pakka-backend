import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PRODUCT_EVENT_COVERAGE_START, type ProductEventName } from '../../product-events/product-events.contract';
import {
  detectBillingProvider,
  extractBillingAmount,
  extractBillingCurrency,
  isSuccessfulBillingEvent,
} from '../shared/admin-billing-normalization';
import type { AdminGrowthExportQueryDto, AdminGrowthQueryDto, GrowthBucket } from './dto/admin-growth-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 365;
const MAX_READ = 100_000;
const ADOPTION_EVENTS: ProductEventName[] = [
  'lead_created', 'proposal_sent', 'contract_signed', 'invoice_sent', 'invoice_paid', 'project_created', 'time_logged',
];
const FUNNEL_STAGES: Array<{ key: ProductEventName; label: string }> = [
  { key: 'lead_created', label: 'Lead created' },
  { key: 'proposal_sent', label: 'Proposal sent' },
  { key: 'contract_signed', label: 'Contract signed' },
  { key: 'invoice_sent', label: 'Invoice sent' },
  { key: 'invoice_paid', label: 'Invoice paid' },
];
const PLAN_MONTHLY_PRICES: Record<string, number> = { SOLO: 299, STUDIO: 699 };

type Range = { from: Date; to: Date; bucket: Exclude<GrowthBucket, 'auto'> };
type EventRow = { eventName: string; userId: string; workspaceId: string | null; occurredAt: Date; source: string; properties: unknown };
type UserRow = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  onboardingComplete: boolean;
  onboardingCompletedAt: Date | null;
  subscriptionStatus: string;
  plan: string;
  acquisitionSource: string;
  currency: string | null;
  activeWorkspaceId: string | null;
  activeWorkspace?: { currency: string | null } | null;
};

export interface AdminGrowthOverview {
  range: { from: string; to: string; bucket: string };
  kpis: {
    signups: number | null;
    activatedUsers: number | null;
    activationRate: number | null;
    wau: number | null;
    mau: number | null;
    paidWorkspaces: number | null;
    cancellationEvents: number | null;
    paymentFailureEvents: number | null;
    medianTimeToValueDays: number | null;
  };
  series: Array<{ period: string; signups: number; activatedUsers: number; activeUsers: number }>;
  funnel: Array<{ key: string; label: string; users: number; rate: number | null; source: string }>;
  acquisition: Array<{ source: string; users: number; activatedUsers: number; activationRate: number | null }>;
  adoption: Array<{ eventName: string; events: number; uniqueUsers: number; adoptionRate: number | null }>;
  cohorts: Array<{
    cohort: string;
    newUsers: number;
    activatedUsers: number;
    activationRate: number | null;
    retention7: number | null;
    retention30: number | null;
    retentionState: 'available' | 'unavailable' | 'partial';
  }>;
  revenueQuality: {
    subscriptionCollections: Array<{ currency: string; amount: number; events: number }>;
    recurringRevenueEstimate: Array<{ currency: string; amount: number; workspaces: number }>;
    invoiceCollections: Array<{ currency: string; amount: number; invoices: number }>;
    dataQuality: {
      billingEventsRead: number;
      eventsWithoutAmount: number;
      eventsWithoutCurrency: number;
      recurringRevenueCurrencyUnknown: number;
      mixedCurrencyConversionAvailable: false;
    };
  };
  dataQuality: {
    telemetryCoverageStart: string;
    telemetryLatestEventAt: string | null;
    telemetryEventsRead: number;
    freshness: string;
    partial: boolean;
    unavailablePanels: string[];
    proxies: string[];
  };
}

@Injectable()
export class AdminGrowthService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: Partial<AdminGrowthQueryDto> = {}): Promise<AdminGrowthOverview> {
    const range = this.resolveRange(query);
    const userWhere = this.userWhere(query, range);
    const eventWhere = this.eventWhere(range, query);
    const billingWhere: any = { processedAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) };
    const invoiceWhere: any = { paidAt: { gte: range.from, lt: range.to }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) };

    const [usersResult, eventsResult, billingResult, invoicesResult] = await Promise.allSettled([
      this.prisma.user.findMany({ where: userWhere, select: this.userSelect(), take: MAX_READ }),
      this.prisma.productEvent.findMany({ where: eventWhere, select: { eventName: true, userId: true, workspaceId: true, occurredAt: true, source: true, properties: true }, take: MAX_READ }),
      this.prisma.billingEvent.findMany({ where: billingWhere, select: { id: true, eventType: true, payload: true, processedAt: true }, take: MAX_READ }),
      this.prisma.invoice.findMany({ where: invoiceWhere, select: { id: true, amountPaid: true, currency: true, paidAt: true }, take: MAX_READ }),
    ]);

    const users = usersResult.status === 'fulfilled' ? usersResult.value as unknown as UserRow[] : [];
    const events = eventsResult.status === 'fulfilled' ? eventsResult.value as unknown as EventRow[] : [];
    const billing = billingResult.status === 'fulfilled' ? billingResult.value as Array<{ id: string; eventType: string; payload: unknown; processedAt: Date }> : [];
    const invoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value as Array<{ id: string; amountPaid: any; currency: string; paidAt: Date | null }> : [];
    const unavailablePanels = [
      ...(usersResult.status === 'rejected' ? ['core', 'acquisition', 'cohorts'] : []),
      ...(eventsResult.status === 'rejected' ? ['activation', 'funnel', 'adoption', 'retention'] : []),
      ...(billingResult.status === 'rejected' || invoicesResult.status === 'rejected' ? ['revenue'] : []),
    ];

    const eventByUser = this.groupEventsByUser(events);
    const activatedIds = this.uniqueUsers(events, 'onboarding_completed');
    const activeIds = this.uniqueUsers(events, 'session_started');
    const paidUsers = new Set(users.filter(user => user.subscriptionStatus === 'ACTIVE').map(user => user.id));
    const paidWorkspaces = new Set(users.filter(user => paidUsers.has(user.id)).map(user => user.activeWorkspaceId ?? user.id));
    const ttvValues = users.map(user => this.timeToValue(eventByUser.get(user.id) ?? [])).filter((value): value is number => value !== null);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString(), bucket: range.bucket },
      kpis: {
        signups: usersResult.status === 'fulfilled' ? users.length : null,
        activatedUsers: eventsResult.status === 'fulfilled' ? activatedIds.size : null,
        activationRate: eventsResult.status === 'fulfilled' ? this.rate(activatedIds.size, users.length) : null,
        wau: eventsResult.status === 'fulfilled' ? this.activeUsersInWindow(events, range.to, 7) : null,
        mau: eventsResult.status === 'fulfilled' ? this.activeUsersInWindow(events, range.to, 30) : null,
        paidWorkspaces: usersResult.status === 'fulfilled' ? paidWorkspaces.size : null,
        cancellationEvents: eventsResult.status === 'fulfilled' ? events.filter(event => event.eventName === 'subscription_cancelled').length : null,
        paymentFailureEvents: eventsResult.status === 'fulfilled' ? events.filter(event => event.eventName === 'subscription_payment_failed').length : null,
        medianTimeToValueDays: eventsResult.status === 'fulfilled' ? this.median(ttvValues) : null,
      },
      series: this.series(range, users, events),
      funnel: this.funnel(events, users.length),
      acquisition: this.acquisition(users, activatedIds),
      adoption: this.adoption(events, users.length),
      cohorts: this.cohorts(users, eventByUser, range.to),
      revenueQuality: this.revenueQuality(billing, invoices, users, query),
      dataQuality: {
        telemetryCoverageStart: PRODUCT_EVENT_COVERAGE_START,
        telemetryLatestEventAt: events.length ? new Date(Math.max(...events.map(event => event.occurredAt.getTime()))).toISOString() : null,
        telemetryEventsRead: events.length,
        freshness: new Date().toISOString(),
        partial: unavailablePanels.length > 0,
        unavailablePanels: [...new Set(unavailablePanels)],
        proxies: ['paidWorkspaces uses current active subscription state; historical paid-workspace snapshots require subscription history'],
      },
    };
  }

  async segments(query: Partial<AdminGrowthQueryDto> = {}) {
    const range = this.resolveRange(query);
    const users = await this.prisma.user.findMany({ where: this.userWhere(query, range), select: this.userSelect(), take: MAX_READ });
    const events = await this.prisma.productEvent.findMany({ where: this.eventWhere(range, query), select: { eventName: true, userId: true, workspaceId: true, occurredAt: true, source: true, properties: true }, take: MAX_READ }) as unknown as EventRow[];
    const eventByUser = this.groupEventsByUser(events);
    const rows = (users as unknown as UserRow[]).map(user => {
      const userEvents = eventByUser.get(user.id) ?? [];
      const activeDays = new Set(userEvents.filter(event => event.eventName === 'session_started').map(event => event.occurredAt.toISOString().slice(0, 10))).size;
      return {
        userId: user.id,
        workspaceId: user.activeWorkspaceId ?? user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
        signupAt: user.createdAt,
        acquisitionSource: user.acquisitionSource || 'unknown',
        activated: userEvents.some(event => event.eventName === 'onboarding_completed'),
        activeDays,
        latestEventAt: userEvents.length ? new Date(Math.max(...userEvents.map(event => event.occurredAt.getTime()))) : null,
      };
    }).filter(row => this.matchesSegment(row, query.segment));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      dataQuality: { rawEventPayloadsExposed: false, telemetryCoverageStart: PRODUCT_EVENT_COVERAGE_START },
    };
  }

  async csv(query: AdminGrowthExportQueryDto): Promise<string> {
    const data: any = query.report === 'segments' ? await this.segments(query) : await this.overview(query);
    const rows: string[][] = [['report', 'section', 'key', 'value']];
    const add = (section: string, key: string, value: unknown) => rows.push([query.report, section, key, typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')]);
    if (query.report === 'segments') for (const item of data.items) add('segment', item.userId, item);
    if (query.report !== 'segments') {
      add('range', 'from', data.range.from); add('range', 'to', data.range.to);
      for (const [key, value] of Object.entries(data.kpis)) add('kpi', key, value);
      for (const item of data.funnel) add('funnel', item.key, item);
      for (const item of data.acquisition) add('acquisition', item.source, item);
      for (const item of data.adoption) add('adoption', item.eventName, item);
      for (const item of data.cohorts) add('cohort', item.cohort, item);
      for (const item of data.revenueQuality.subscriptionCollections) add('subscriptionCollections', item.currency, item);
    }
    return rows.map(row => row.map(cell => this.csvCell(cell)).join(',')).join('\n');
  }

  private userSelect() {
    return {
      id: true, email: true, name: true, createdAt: true, onboardingComplete: true,
      onboardingCompletedAt: true, subscriptionStatus: true, plan: true, acquisitionSource: true,
      currency: true, activeWorkspaceId: true, activeWorkspace: { select: { currency: true } },
    } as const;
  }

  private userWhere(query: Partial<AdminGrowthQueryDto>, range?: Range): any {
    return {
      ...(range ? { createdAt: { gte: range.from, lt: range.to } } : {}),
      ...(query.plan ? { plan: query.plan } : {}),
      ...(query.subscriptionStatus ? { subscriptionStatus: query.subscriptionStatus } : {}),
      ...(query.acquisitionSource ? { acquisitionSource: query.acquisitionSource } : {}),
      ...(query.workspaceId ? { OR: [{ activeWorkspaceId: query.workspaceId }, { workspaceMemberships: { some: { workspaceId: query.workspaceId } } }] } : {}),
    };
  }

  private eventWhere(range: Range, query: Partial<AdminGrowthQueryDto>): any {
    return {
      occurredAt: { gte: range.from, lt: range.to },
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      user: this.userWhere(query),
    };
  }

  private resolveRange(query: Partial<AdminGrowthQueryDto>): Range {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * DAY_MS);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new BadRequestException('Growth dates must be valid and ordered.');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) throw new BadRequestException(`Growth range cannot exceed ${MAX_RANGE_DAYS} days.`);
    const duration = to.getTime() - from.getTime();
    const bucket = query.bucket === 'auto' || !query.bucket ? duration <= 31 * DAY_MS ? 'day' : duration <= 90 * DAY_MS ? 'week' : 'month' : query.bucket;
    return { from, to, bucket: bucket as Exclude<GrowthBucket, 'auto'> };
  }

  private series(range: Range, users: UserRow[], events: EventRow[]) {
    const periods = new Map<string, { period: string; signups: number; activatedUsers: number; activeUsers: number; activated: Set<string>; active: Set<string> }>();
    for (let cursor = this.bucketStart(range.from, range.bucket); cursor < range.to; cursor = this.nextBucket(cursor, range.bucket)) {
      const period = this.periodKey(cursor, range.bucket);
      periods.set(period, { period, signups: 0, activatedUsers: 0, activeUsers: 0, activated: new Set(), active: new Set() });
    }
    for (const user of users) {
      const point = periods.get(this.periodKey(user.createdAt, range.bucket));
      if (point) point.signups += 1;
    }
    for (const event of events) {
      const point = periods.get(this.periodKey(event.occurredAt, range.bucket));
      if (!point) continue;
      if (event.eventName === 'onboarding_completed') point.activated.add(event.userId);
      if (event.eventName === 'session_started') point.active.add(event.userId);
    }
    return [...periods.values()].map(point => ({ period: point.period, signups: point.signups, activatedUsers: point.activated.size, activeUsers: point.active.size }));
  }

  private funnel(events: EventRow[], denominator: number) {
    return FUNNEL_STAGES.map(stage => {
      const users = this.uniqueUsers(events, stage.key).size;
      return { key: stage.key, label: stage.label, users, rate: this.rate(users, denominator), source: 'product_events' };
    });
  }

  private acquisition(users: UserRow[], activatedIds: Set<string>) {
    const groups = new Map<string, { source: string; users: number; activatedUsers: number }>();
    for (const user of users) {
      const source = user.acquisitionSource || 'unknown';
      const group = groups.get(source) ?? { source, users: 0, activatedUsers: 0 };
      group.users += 1; if (activatedIds.has(user.id)) group.activatedUsers += 1;
      groups.set(source, group);
    }
    return [...groups.values()].sort((a, b) => b.users - a.users).map(group => ({ ...group, activationRate: this.rate(group.activatedUsers, group.users) }));
  }

  private adoption(events: EventRow[], denominator: number) {
    return ADOPTION_EVENTS.map(eventName => {
      const matching = events.filter(event => event.eventName === eventName);
      return { eventName, events: matching.length, uniqueUsers: new Set(matching.map(event => event.userId)).size, adoptionRate: this.rate(new Set(matching.map(event => event.userId)).size, denominator) };
    });
  }

  private cohorts(users: UserRow[], eventByUser: Map<string, EventRow[]>, to: Date) {
    const map = new Map<string, { cohort: string; newUsers: number; activatedUsers: number; retention7Eligible: number; retained7: number; retention30Eligible: number; retained30: number; partial: boolean }>();
    for (const user of users) {
      const cohort = this.monthKey(user.createdAt);
      const group = map.get(cohort) ?? { cohort, newUsers: 0, activatedUsers: 0, retention7Eligible: 0, retained7: 0, retention30Eligible: 0, retained30: 0, partial: user.createdAt < new Date(PRODUCT_EVENT_COVERAGE_START) };
      const userEvents = eventByUser.get(user.id) ?? [];
      group.newUsers += 1;
      if (userEvents.some(event => event.eventName === 'onboarding_completed')) group.activatedUsers += 1;
      for (const days of [7, 30] as const) {
        if (to.getTime() < user.createdAt.getTime() + days * DAY_MS) continue;
        if (group.partial) continue;
        if (days === 7) group.retention7Eligible += 1; else group.retention30Eligible += 1;
        const retained = userEvents.some(event => event.eventName === 'session_started' && event.occurredAt.getTime() >= user.createdAt.getTime() + days * DAY_MS);
        if (retained) { if (days === 7) group.retained7 += 1; else group.retained30 += 1; }
      }
      map.set(cohort, group);
    }
    return [...map.values()].sort((a, b) => a.cohort.localeCompare(b.cohort)).map(group => ({
      cohort: group.cohort,
      newUsers: group.newUsers,
      activatedUsers: group.activatedUsers,
      activationRate: this.rate(group.activatedUsers, group.newUsers),
      retention7: group.partial ? null : this.rate(group.retained7, group.retention7Eligible),
      retention30: group.partial ? null : this.rate(group.retained30, group.retention30Eligible),
      retentionState: group.partial ? 'partial' as const : group.retention7Eligible || group.retention30Eligible ? 'available' as const : 'unavailable' as const,
    }));
  }

  private revenueQuality(
    billing: Array<{ id: string; eventType: string; payload: unknown; processedAt: Date }>,
    invoices: Array<{ id: string; amountPaid: any; currency: string; paidAt: Date | null }>,
    users: UserRow[],
    query: Partial<AdminGrowthQueryDto>,
  ) {
    const subscriptionCollections = new Map<string, { currency: string; amount: number; events: number }>();
    let eventsWithoutAmount = 0;
    let eventsWithoutCurrency = 0;
    for (const event of billing) {
      if (!isSuccessfulBillingEvent(event.eventType, event.payload)) continue;
      const provider = detectBillingProvider(event.eventType, event.payload);
      if (query.provider && query.provider !== 'all' && provider !== query.provider) continue;
      const currency = extractBillingCurrency(event.payload);
      const amount = extractBillingAmount(event.payload, provider);
      if (amount === null) eventsWithoutAmount += 1;
      if (!currency) eventsWithoutCurrency += 1;
      if (amount === null || !currency || (query.currency && currency !== query.currency.toUpperCase())) continue;
      const item = subscriptionCollections.get(currency) ?? { currency, amount: 0, events: 0 };
      item.amount += amount; item.events += 1; subscriptionCollections.set(currency, item);
    }
    const invoiceCollections = new Map<string, { currency: string; amount: number; invoices: number }>();
    for (const invoice of invoices) {
      const currency = this.stringValue(invoice.currency)?.toUpperCase();
      if (!currency || (query.currency && currency !== query.currency.toUpperCase())) continue;
      const item = invoiceCollections.get(currency) ?? { currency, amount: 0, invoices: 0 };
      item.amount += this.number(invoice.amountPaid); item.invoices += 1; invoiceCollections.set(currency, item);
    }
    const recurringRevenue = new Map<string, { currency: string; amount: number; workspaces: number }>();
    let recurringRevenueCurrencyUnknown = 0;
    for (const user of users.filter(item => item.subscriptionStatus === 'ACTIVE')) {
      const currency = this.stringValue(user.currency ?? user.activeWorkspace?.currency)?.toUpperCase();
      const price = PLAN_MONTHLY_PRICES[user.plan] ?? 0;
      if (!price) continue;
      if (!currency) { recurringRevenueCurrencyUnknown += 1; continue; }
      const item = recurringRevenue.get(currency) ?? { currency, amount: 0, workspaces: 0 };
      item.amount += price; item.workspaces += 1; recurringRevenue.set(currency, item);
    }
    return {
      subscriptionCollections: [...subscriptionCollections.values()],
      recurringRevenueEstimate: [...recurringRevenue.values()],
      invoiceCollections: [...invoiceCollections.values()],
      dataQuality: { billingEventsRead: billing.length, eventsWithoutAmount, eventsWithoutCurrency, recurringRevenueCurrencyUnknown, mixedCurrencyConversionAvailable: false as const },
    };
  }

  private groupEventsByUser(events: EventRow[]) { const map = new Map<string, EventRow[]>(); for (const event of events) map.set(event.userId, [...(map.get(event.userId) ?? []), event]); return map; }
  private uniqueUsers(events: EventRow[], eventName: string) { return new Set(events.filter(event => event.eventName === eventName).map(event => event.userId)); }
  private activeUsersInWindow(events: EventRow[], to: Date, days: number) { const from = to.getTime() - days * DAY_MS; return new Set(events.filter(event => event.eventName === 'session_started' && event.occurredAt.getTime() >= from && event.occurredAt < to).map(event => event.userId)).size; }
  private timeToValue(events: EventRow[]) { const onboarding = events.filter(event => event.eventName === 'onboarding_completed').sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]; if (!onboarding) return null; const value = events.filter(event => ['proposal_sent', 'invoice_paid', 'contract_signed'].includes(event.eventName) && event.occurredAt >= onboarding.occurredAt).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0]; return value ? (value.occurredAt.getTime() - onboarding.occurredAt.getTime()) / DAY_MS : null; }
  private matchesSegment(row: { activated: boolean; activeDays: number; subscriptionStatus: string }, segment?: string) { if (!segment) return true; if (segment === 'not_activated') return !row.activated; if (segment === 'retention_risk') return row.activated && row.activeDays <= 1; if (segment === 'paid') return row.subscriptionStatus === 'ACTIVE'; return true; }
  private rate(numerator: number, denominator: number) { return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null; }
  private median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return Number((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(2)); }
  private stringValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
  private number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : 0; }
  private bucketStart(date: Date, bucket: Exclude<GrowthBucket, 'auto'>) { const value = new Date(date); if (bucket === 'month') return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1)); if (bucket === 'week') { const offset = (value.getUTCDay() + 6) % 7; return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() - offset)); } return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
  private nextBucket(date: Date, bucket: Exclude<GrowthBucket, 'auto'>) { return bucket === 'month' ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)) : bucket === 'week' ? new Date(date.getTime() + 7 * DAY_MS) : new Date(date.getTime() + DAY_MS); }
  private periodKey(date: Date, bucket: Exclude<GrowthBucket, 'auto'>) { const start = this.bucketStart(date, bucket); return bucket === 'month' ? start.toISOString().slice(0, 7) : start.toISOString().slice(0, 10); }
  private monthKey(date: Date) { return date.toISOString().slice(0, 7); }
  private csvCell(value: unknown) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
}
