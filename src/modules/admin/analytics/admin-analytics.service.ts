import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AdminAnalyticsQueryDto,
  AnalyticsBucket,
} from './dto/admin-analytics-query.dto';
import { extractBillingAmount, extractBillingCurrency } from '../shared/admin-billing-normalization';

type ResolvedBucket = Exclude<AnalyticsBucket, 'auto'>;

interface DateRange {
  from: Date;
  to: Date;
  bucket: ResolvedBucket;
}

interface GrowthPoint {
  period: string;
  newUsers: number;
  newWorkspaces: number;
  onboardedNewUsers: number;
}

interface BillingPoint {
  period: string;
  currencies: Record<string, { amount: number; events: number }>;
}

interface ProductCreationPoint {
  period: string;
  contacts: number;
  projects: number;
  proposals: number;
  contracts: number;
  invoices: number;
  tasks: number;
}

export interface AdminAnalytics {
  range: { from: string; to: string; bucket: ResolvedBucket };
  kpis: {
    totalUsers: number;
    newUsers: number;
    onboardedUsers: number;
    totalWorkspaces: number;
    newWorkspaces: number;
    activeSubscriptions: number;
    cancelledSubscriptions: number;
    totalContacts: number;
    pipelineValue: number;
  };
  series: {
    growth: GrowthPoint[];
    billing: BillingPoint[];
    productCreation: ProductCreationPoint[];
  };
  breakdowns: {
    plans: Array<{ key: string; count: number }>;
    subscriptions: Array<{ key: string; count: number }>;
    contacts: Array<{ key: string; count: number; value: number }>;
    proposals: Array<{ key: string; count: number; value: number }>;
    contracts: Array<{ key: string; count: number }>;
    invoices: Array<{ key: string; count: number; value: number }>;
  };
  topWorkspaces: Array<{
    workspaceId: string;
    name: string;
    members: number;
    contacts: number;
    projects: number;
    proposals: number;
    contracts: number;
    invoices: number;
    tasks: number;
    activityScore: number;
  }>;
  dataQuality: {
    billingEventsRead: number;
    billingEventsWithoutAmount: number;
    billingEventsWithoutCurrency: number;
    billingCurrencies: string[];
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 365;

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: Partial<AdminAnalyticsQueryDto> = {}): Promise<AdminAnalytics> {
    const range = this.resolveRange(query);
    const dateFilter = { gte: range.from, lt: range.to };

    const [
      totalUsers,
      newUsers,
      onboardedUsers,
      totalWorkspaces,
      newWorkspaces,
      activeSubscriptions,
      cancelledSubscriptions,
      totalContacts,
      pipeline,
      planGroups,
      subscriptionGroups,
      currentContacts,
      rangeContacts,
      rangeProjects,
      rangeProposals,
      rangeContracts,
      rangeInvoices,
      rangeTasks,
      billingEvents,
      topWorkspaces,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true, onboardingComplete: true },
      }),
      this.prisma.user.count({ where: { onboardingComplete: true } }),
      this.prisma.workspace.count(),
      this.prisma.workspace.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true },
      }),
      this.prisma.user.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      this.prisma.user.count({ where: { subscriptionStatus: 'CANCELLED' } }),
      this.prisma.contact.count({ where: { archivedAt: null } }),
      this.prisma.contact.aggregate({
        where: {
          archivedAt: null,
          stage: { in: ['ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING'] },
        },
        _sum: { dealValue: true },
      }),
      this.prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
      this.prisma.user.groupBy({
        by: ['subscriptionStatus'],
        _count: { _all: true },
      }),
      this.prisma.contact.findMany({
        where: { archivedAt: null },
        select: { stage: true, dealValue: true },
      }),
      this.prisma.contact.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true },
      }),
      this.prisma.project.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true },
      }),
      this.prisma.proposal.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true, status: true, totalAmount: true },
      }),
      this.prisma.contract.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true, status: true },
      }),
      this.prisma.invoice.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true, status: true, total: true },
      }),
      this.prisma.task.findMany({
        where: { createdAt: dateFilter },
        select: { createdAt: true },
      }),
      this.prisma.billingEvent.findMany({
        where: {
          eventType: 'SUBSCRIPTION_PAYMENT_SUCCESS',
          processedAt: dateFilter,
        },
        select: { processedAt: true, payload: true },
      }),
      this.getTopWorkspaces(dateFilter),
    ]);

    const periods = this.periodKeys(range);
    const growth = this.emptyGrowth(periods);
    const productCreation = this.emptyProductCreation(periods);

    for (const user of newUsers) {
      const point = growth.get(this.periodKey(user.createdAt, range.bucket));
      if (!point) continue;
      point.newUsers += 1;
      if (user.onboardingComplete) point.onboardedNewUsers += 1;
    }
    for (const workspace of newWorkspaces) {
      const point = growth.get(this.periodKey(workspace.createdAt, range.bucket));
      if (point) point.newWorkspaces += 1;
    }

    for (const item of rangeContacts) this.incrementProduct(productCreation, item.createdAt, range.bucket, 'contacts');
    for (const item of rangeProjects) this.incrementProduct(productCreation, item.createdAt, range.bucket, 'projects');
    for (const item of rangeProposals) this.incrementProduct(productCreation, item.createdAt, range.bucket, 'proposals');
    for (const item of rangeContracts) this.incrementProduct(productCreation, item.createdAt, range.bucket, 'contracts');
    for (const item of rangeInvoices) this.incrementProduct(productCreation, item.createdAt, range.bucket, 'invoices');
    for (const item of rangeTasks) this.incrementProduct(productCreation, item.createdAt, range.bucket, 'tasks');

    const billing = this.emptyBilling(periods);
    const billingCurrencies = new Set<string>();
    let billingEventsWithoutAmount = 0;
    let billingEventsWithoutCurrency = 0;

    for (const event of billingEvents) {
      const currency = extractBillingCurrency(event.payload);
      const hasCurrency = currency !== null;
      if (!hasCurrency) billingEventsWithoutCurrency += 1;
      if (currency) billingCurrencies.add(currency);

      const amount = extractBillingAmount(event.payload, 'razorpay');
      if (amount === null) billingEventsWithoutAmount += 1;

      const point = billing.get(this.periodKey(event.processedAt, range.bucket));
      if (!point || !currency) continue;
      point.currencies[currency] ??= { amount: 0, events: 0 };
      point.currencies[currency].events += 1;
      if (amount !== null) point.currencies[currency].amount += amount;
    }

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        bucket: range.bucket,
      },
      kpis: {
        totalUsers,
        newUsers: newUsers.length,
        onboardedUsers,
        totalWorkspaces,
        newWorkspaces: newWorkspaces.length,
        activeSubscriptions,
        cancelledSubscriptions,
        totalContacts,
        pipelineValue: this.numberOrZero(pipeline._sum.dealValue),
      },
      series: {
        growth: [...growth.values()],
        billing: [...billing.values()],
        productCreation: [...productCreation.values()],
      },
      breakdowns: {
        plans: planGroups.map((group) => ({ key: group.plan, count: group._count._all })),
        subscriptions: subscriptionGroups.map((group) => ({
          key: group.subscriptionStatus,
          count: group._count._all,
        })),
        contacts: this.valueBreakdown(
          currentContacts.map((item) => ({ key: item.stage, value: this.numberOrZero(item.dealValue) })),
        ),
        proposals: this.valueBreakdown(
          rangeProposals.map((item) => ({ key: item.status, value: this.numberOrZero(item.totalAmount) })),
        ),
        contracts: this.countBreakdown(rangeContracts.map((item) => item.status)),
        invoices: this.valueBreakdown(
          rangeInvoices.map((item) => ({ key: item.status, value: this.numberOrZero(item.total) })),
        ),
      },
      topWorkspaces,
      dataQuality: {
        billingEventsRead: billingEvents.length,
        billingEventsWithoutAmount,
        billingEventsWithoutCurrency,
        billingCurrencies: [...billingCurrencies].sort(),
      },
    };
  }

  csv(analytics: AdminAnalytics): string {
    const rows: string[][] = [['section', 'metric', 'period', 'dimension', 'value']];
    const add = (section: string, metric: string, period: string, dimension: string, value: unknown) => {
      rows.push([section, metric, period, dimension, String(value ?? '')]);
    };

    add('range', 'from', '', '', analytics.range.from);
    add('range', 'to', '', '', analytics.range.to);
    add('range', 'bucket', '', '', analytics.range.bucket);
    for (const [metric, value] of Object.entries(analytics.kpis)) add('kpi', metric, '', '', value);
    for (const point of analytics.series.growth) {
      add('growth', 'newUsers', point.period, '', point.newUsers);
      add('growth', 'newWorkspaces', point.period, '', point.newWorkspaces);
      add('growth', 'onboardedNewUsers', point.period, '', point.onboardedNewUsers);
    }
    for (const point of analytics.series.billing) {
      for (const [currency, value] of Object.entries(point.currencies)) {
        add('billing', 'amount', point.period, currency, value.amount);
        add('billing', 'events', point.period, currency, value.events);
      }
    }
    for (const point of analytics.series.productCreation) {
      for (const [metric, value] of Object.entries(point).filter(([key]) => key !== 'period')) {
        add('productCreation', metric, point.period, '', value);
      }
    }
    for (const [section, breakdown] of Object.entries(analytics.breakdowns)) {
      for (const item of breakdown) {
        for (const [metric, value] of Object.entries(item).filter(([key]) => key !== 'key')) {
          add(section, metric, '', item.key, value);
        }
      }
    }
    for (const workspace of analytics.topWorkspaces) {
      for (const [metric, value] of Object.entries(workspace).filter(([key]) => key !== 'workspaceId' && key !== 'name')) {
        add('topWorkspace', metric, '', workspace.name, value);
      }
    }

    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
  }

  private resolveRange(query: Partial<AdminAnalyticsQueryDto>): DateRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * DAY_MS);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Analytics dates must be valid ISO date/time values.');
    }
    if (from >= to) {
      throw new BadRequestException('Analytics `from` must be earlier than `to`.');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(`Analytics range cannot exceed ${MAX_RANGE_DAYS} days.`);
    }

    const bucket = query.bucket === 'auto' || !query.bucket
      ? this.autoBucket(to.getTime() - from.getTime())
      : query.bucket;
    return { from, to, bucket: bucket as ResolvedBucket };
  }

  private autoBucket(duration: number): ResolvedBucket {
    if (duration <= 31 * DAY_MS) return 'day';
    if (duration <= 90 * DAY_MS) return 'week';
    return 'month';
  }

  private periodKeys(range: DateRange): string[] {
    const keys: string[] = [];
    for (let cursor = this.bucketStart(range.from, range.bucket); cursor < range.to;) {
      keys.push(this.periodKey(cursor, range.bucket));
      cursor = this.nextBucket(cursor, range.bucket);
    }
    return keys;
  }

  private periodKey(date: Date, bucket: ResolvedBucket): string {
    const start = this.bucketStart(date, bucket);
    return bucket === 'month'
      ? start.toISOString().slice(0, 7)
      : start.toISOString().slice(0, 10);
  }

  private bucketStart(date: Date, bucket: ResolvedBucket): Date {
    const start = new Date(date);
    if (bucket === 'month') {
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    }
    if (bucket === 'week') {
      const day = start.getUTCDay();
      const mondayOffset = (day + 6) % 7;
      return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - mondayOffset));
    }
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  }

  private nextBucket(date: Date, bucket: ResolvedBucket): Date {
    if (bucket === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    if (bucket === 'week') return new Date(date.getTime() + 7 * DAY_MS);
    return new Date(date.getTime() + DAY_MS);
  }

  private emptyGrowth(periods: string[]): Map<string, GrowthPoint> {
    return new Map(periods.map((period) => [period, { period, newUsers: 0, newWorkspaces: 0, onboardedNewUsers: 0 }]));
  }

  private emptyBilling(periods: string[]): Map<string, BillingPoint> {
    return new Map(periods.map((period) => [period, { period, currencies: {} }]));
  }

  private emptyProductCreation(periods: string[]): Map<string, ProductCreationPoint> {
    return new Map(periods.map((period) => [period, {
      period,
      contacts: 0,
      projects: 0,
      proposals: 0,
      contracts: 0,
      invoices: 0,
      tasks: 0,
    }]));
  }

  private incrementProduct(
    points: Map<string, ProductCreationPoint>,
    date: Date,
    bucket: ResolvedBucket,
    field: keyof Omit<ProductCreationPoint, 'period'>,
  ) {
    const point = points.get(this.periodKey(date, bucket));
    if (point) point[field] += 1;
  }

  private countBreakdown(keys: string[]): Array<{ key: string; count: number }> {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));
  }

  private valueBreakdown(items: Array<{ key: string; value: number }>) {
    const values = new Map<string, { count: number; value: number }>();
    for (const item of items) {
      const current = values.get(item.key) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += item.value;
      values.set(item.key, current);
    }
    return [...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, ...value }));
  }

  private async getTopWorkspaces(dateFilter: { gte: Date; lt: Date }) {
    const [workspaces, contacts, projects, proposals, contracts, invoices, tasks] = await Promise.all([
      this.prisma.workspace.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, _count: { select: { members: true } } },
      }),
      this.prisma.contact.groupBy({ by: ['workspaceId'], where: { createdAt: dateFilter }, _count: { _all: true } }),
      this.prisma.project.groupBy({ by: ['workspaceId'], where: { createdAt: dateFilter }, _count: { _all: true } }),
      this.prisma.proposal.groupBy({ by: ['workspaceId'], where: { createdAt: dateFilter }, _count: { _all: true } }),
      this.prisma.contract.groupBy({ by: ['workspaceId'], where: { createdAt: dateFilter }, _count: { _all: true } }),
      this.prisma.invoice.groupBy({ by: ['workspaceId'], where: { createdAt: dateFilter }, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['workspaceId'], where: { createdAt: dateFilter }, _count: { _all: true } }),
    ]);

    const index = (groups: Array<{ workspaceId: string; _count: { _all: number } }>) =>
      new Map(groups.map((group) => [group.workspaceId, group._count._all]));
    const counts = {
      contacts: index(contacts),
      projects: index(projects),
      proposals: index(proposals),
      contracts: index(contracts),
      invoices: index(invoices),
      tasks: index(tasks),
    };

    return workspaces.map((workspace) => {
      const row = {
        workspaceId: workspace.id,
        name: workspace.name,
        members: workspace._count.members,
        contacts: counts.contacts.get(workspace.id) ?? 0,
        projects: counts.projects.get(workspace.id) ?? 0,
        proposals: counts.proposals.get(workspace.id) ?? 0,
        contracts: counts.contracts.get(workspace.id) ?? 0,
        invoices: counts.invoices.get(workspace.id) ?? 0,
        tasks: counts.tasks.get(workspace.id) ?? 0,
        activityScore: 0,
      };
      row.activityScore = row.contacts + row.projects + row.proposals + row.contracts + row.invoices + row.tasks;
      return row;
    }).sort((a, b) => b.activityScore - a.activityScore).slice(0, 10);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private numberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (value && typeof value === 'object' && 'toString' in value) {
      const parsed = Number(String(value));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private numberOrZero(value: unknown): number {
    return this.numberOrNull(value) ?? 0;
  }

  private csvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }
}
