import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Plan } from '@prisma/client';
import { detectBillingProvider, extractBillingAmount, extractBillingCurrency, isSuccessfulBillingEvent } from '../shared/admin-billing-normalization';

export interface OversightMetrics {
  workspaces: { total: number; active: number; archived: number };
  users: { total: number; active: number };
  planDistribution: { plan: string; count: number }[];
  signups: { date: string; count: number }[];
  revenue: {
    mrr: number | null;
    arr: number | null;
    mrrCurrency: string | null;
    collectionsByCurrency: Array<{ currency: string; amount: number; events: number }>;
    recurringRevenueByCurrency: Array<{ currency: string; amount: number; workspaces: number }>;
    dataQuality: { recurringRevenueCurrencyUnknown: number; mixedCurrencyConversionAvailable: false };
  };
  churn: { cancelledInLast30d: number };
  topWorkspacesByUsage: { workspaceId: string; name: string; entityCount: number }[];
}

/**
 * Cross-tenant aggregate queries for the overview dashboard (R5–R7).
 * Revenue/churn are derived from BillingEvent; if coverage is thin the values
 * are honestly whatever BillingEvent holds (per the plan's R6 assumption).
 */
@Injectable()
export class AdminOversightService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(): Promise<OversightMetrics> {
    const [totalWs, archivedWs, totalUsers, activeUsers, planGroups, billingEvents, activePlanUsers] =
      await Promise.all([
        this.prisma.workspace.count(),
        this.prisma.workspace.count({ where: { archivedAt: { not: null } } }),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { onboardingComplete: true } }),
        this.prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
        this.prisma.billingEvent.findMany({
          where: { processedAt: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
          select: { eventType: true, payload: true, processedAt: true },
        }),
        this.prisma.user.findMany({
          where: { subscriptionStatus: 'ACTIVE' },
          select: { plan: true, currency: true, activeWorkspace: { select: { currency: true } } },
        }),
      ]);

    const planDistribution = planGroups.map((g) => ({
      plan: g.plan,
      count: g._count._all,
    }));

    // Signups per day for the last 30 days.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentUsers = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const signupsMap = new Map<string, number>();
    for (const u of recentUsers) {
      const day = u.createdAt.toISOString().slice(0, 10);
      signupsMap.set(day, (signupsMap.get(day) ?? 0) + 1);
    }
    const signups = [...signupsMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Collections and recurring revenue are different facts. BillingEvent sums
    // are collections; MRR is derived only from active plan prices with a known
    // currency, and is null when currencies cannot be represented safely.
    const collections = new Map<string, { currency: string; amount: number; events: number }>();
    for (const event of billingEvents) {
      if (!isSuccessfulBillingEvent(event.eventType ?? '', event.payload)) continue;
      const currency = extractBillingCurrency(event.payload);
      const amount = extractBillingAmount(event.payload, detectBillingProvider(event.eventType ?? '', event.payload));
      if (!currency || amount === null) continue;
      const item = collections.get(currency) ?? { currency, amount: 0, events: 0 };
      item.amount += amount;
      item.events += 1;
      collections.set(currency, item);
    }
    const recurring = new Map<string, { currency: string; amount: number; workspaces: number }>();
    let recurringRevenueCurrencyUnknown = 0;
    for (const user of activePlanUsers) {
      const currency = user.currency ?? user.activeWorkspace?.currency;
      const price = user.plan === Plan.SOLO ? 299 : user.plan === Plan.STUDIO ? 699 : 0;
      if (!price) continue;
      if (!currency) { recurringRevenueCurrencyUnknown += 1; continue; }
      const key = currency.toUpperCase();
      const item = recurring.get(key) ?? { currency: key, amount: 0, workspaces: 0 };
      item.amount += price;
      item.workspaces += 1;
      recurring.set(key, item);
    }
    const recurringValues = [...recurring.values()];
    const mrrCurrency = recurringValues.length === 1 ? recurringValues[0].currency : null;
    const mrr = recurringValues.length === 1 ? recurringValues[0].amount : null;
    let cancelledInLast30d = 0;
    const churnSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cancelled = await this.prisma.billingEvent.count({
      where: {
        eventType: 'SUBSCRIPTION_CANCELLED',
        processedAt: { gte: churnSince },
      },
    });
    cancelledInLast30d = cancelled;

    // Top workspaces by entity count (sum of a few high-signal domains).
    const topWorkspacesByUsage = await this.topWorkspaces(5);

    return {
      workspaces: { total: totalWs, active: totalWs - archivedWs, archived: archivedWs },
      users: { total: totalUsers, active: activeUsers },
      planDistribution,
      signups,
      revenue: {
        mrr,
        arr: mrr === null ? null : mrr * 12,
        mrrCurrency,
        collectionsByCurrency: [...collections.values()],
        recurringRevenueByCurrency: recurringValues,
        dataQuality: { recurringRevenueCurrencyUnknown, mixedCurrencyConversionAvailable: false as const },
      },
      churn: { cancelledInLast30d },
      topWorkspacesByUsage,
    };
  }

  private async topWorkspaces(limit: number) {
    // Count contracts + invoices + leads + clients per workspace; rank by sum.
    const workspaces = await this.prisma.workspace.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { contracts: true, invoices: true, leads: true, clients: true } },
      },
      take: 200,
    });
    return workspaces
      .map((w) => ({
        workspaceId: w.id,
        name: w.name,
        entityCount:
          w._count.contracts +
          w._count.invoices +
          w._count.leads +
          w._count.clients,
      }))
      .sort((a, b) => b.entityCount - a.entityCount)
      .slice(0, limit);
  }

  /** CSV export of the headline metrics (R7). */
  csv(m: OversightMetrics): string {
    const rows = [
      ['metric', 'value'],
      ['workspaces.total', String(m.workspaces.total)],
      ['workspaces.active', String(m.workspaces.active)],
      ['workspaces.archived', String(m.workspaces.archived)],
      ['users.total', String(m.users.total)],
      ['users.active', String(m.users.active)],
      ['revenue.mrr', m.revenue.mrr === null ? 'unavailable' : String(m.revenue.mrr)],
      ['revenue.arr', m.revenue.arr === null ? 'unavailable' : String(m.revenue.arr)],
      ['churn.cancelledInLast30d', String(m.churn.cancelledInLast30d)],
      ...m.planDistribution.map((p) => [`plan.${p.plan}`, String(p.count)]),
    ];
    return rows.map((r) => r.join(',')).join('\n');
  }
}
