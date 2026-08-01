import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Plan } from '@prisma/client';

export interface OversightMetrics {
  workspaces: { total: number; active: number; archived: number };
  users: { total: number; active: number };
  planDistribution: { plan: string; count: number }[];
  signups: { date: string; count: number }[];
  revenue: { mrr: number; arr: number };
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
    const [totalWs, archivedWs, totalUsers, activeUsers, planGroups, billingEvents] =
      await Promise.all([
        this.prisma.workspace.count(),
        this.prisma.workspace.count({ where: { archivedAt: { not: null } } }),
        this.prisma.user.count(),
        this.prisma.user.count({ where: { onboardingComplete: true } }),
        this.prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
        this.prisma.billingEvent.findMany({
          where: { eventType: 'SUBSCRIPTION_PAYMENT_SUCCESS' },
          select: { payload: true, processedAt: true },
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

    // Revenue/churn from BillingEvent payloads (best-effort; depends on coverage).
    let mrr = 0;
    let cancelledInLast30d = 0;
    const churnSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const e of billingEvents) {
      const amount =
        (e.payload as Record<string, unknown> | null)?.amount ?? null;
      if (typeof amount === 'number') mrr += amount;
    }
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
      revenue: { mrr, arr: mrr * 12 },
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
      ['revenue.mrr', String(m.revenue.mrr)],
      ['revenue.arr', String(m.revenue.arr)],
      ['churn.cancelledInLast30d', String(m.churn.cancelledInLast30d)],
      ...m.planDistribution.map((p) => [`plan.${p.plan}`, String(p.count)]),
    ];
    return rows.map((r) => r.join(',')).join('\n');
  }
}
