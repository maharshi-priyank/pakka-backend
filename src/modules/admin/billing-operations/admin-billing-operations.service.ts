import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { BillingEvent, Prisma } from '@prisma/client';
import type {
  AdminBillingOperationsQueryDto,
  BillingProviderFilter,
} from './dto/admin-billing-operations.dto';
import {
  detectBillingProvider,
  extractBillingAmount,
  extractBillingCurrency,
} from '../shared/admin-billing-normalization';

type Provider = 'razorpay' | 'stripe' | 'unknown';
type Outcome = 'success' | 'failed' | 'info';

interface BillingRow {
  id: string;
  eventType: string;
  provider: Provider;
  providerReference: string;
  workspaceId: string | null;
  workspaceName: string | null;
  userId: string | null;
  userEmail: string | null;
  subscriptionId: string | null;
  amount: number | null;
  currency: string | null;
  outcome: Outcome;
  processedAt: Date;
  replayable: boolean;
}

interface DateRange {
  from: Date;
  to: Date;
}

@Injectable()
export class AdminBillingOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminBillingOperationsQueryDto = {}) {
    const range = this.resolveRange(query);
    const rawEvents = await this.findEvents(range, query, 5000);
    const rows = await this.decorate(rawEvents);
    const filtered = this.filterRows(rows, query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: items.map((row) => this.serializeRow(row)),
      total: filtered.length,
      page,
      pageSize,
      range: this.serializeRange(range),
    };
  }

  async summary(query: AdminBillingOperationsQueryDto = {}) {
    const range = this.resolveRange(query);
    const rawEvents = await this.findEvents(range, query, 5000);
    const rows = this.filterRows(await this.decorate(rawEvents), query);
    const [subscriptionGroups, pastDueUsers] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['subscriptionStatus'],
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        where: { subscriptionStatus: 'PAST_DUE' },
        select: { id: true, email: true, activeWorkspaceId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    const collections = new Map<string, { amount: number; events: number }>();
    let successfulPayments = 0;
    let failedPayments = 0;
    let eventsWithoutAmount = 0;
    let eventsWithoutCurrency = 0;
    let eventsWithoutOwner = 0;

    for (const row of rows) {
      if (row.outcome === 'success') successfulPayments += 1;
      if (row.outcome === 'failed') failedPayments += 1;
      if (row.userId === null) eventsWithoutOwner += 1;
      if (row.amount === null) eventsWithoutAmount += 1;
      if (!row.currency) eventsWithoutCurrency += 1;
      if (row.outcome !== 'success' || row.amount === null) continue;

      if (!row.currency) continue;
      const currency = row.currency;
      const current = collections.get(currency) ?? { amount: 0, events: 0 };
      current.amount += row.amount;
      current.events += 1;
      collections.set(currency, current);
    }

    const statusCounts = new Map(
      subscriptionGroups.map((group) => [group.subscriptionStatus, group._count._all]),
    );
    const alerts = [
      ...rows
        .filter((row) => row.outcome === 'failed')
        .slice(0, 25)
        .map((row) => ({
          id: `payment-failed:${row.id}`,
          type: 'payment_failed' as const,
          severity: 'critical' as const,
          title: 'Payment event failed',
          description: `${row.eventType} for ${row.userEmail ?? row.providerReference}`,
          userId: row.userId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          billingEventId: row.id,
          at: row.processedAt.toISOString(),
        })),
      ...pastDueUsers.slice(0, 25).map((user) => ({
        id: `past-due:${user.id}`,
        type: 'past_due' as const,
        severity: 'warning' as const,
        title: 'Subscription is past due',
        description: `${user.email} needs billing attention.`,
        userId: user.id,
        workspaceId: user.activeWorkspaceId ?? undefined,
        at: user.updatedAt.toISOString(),
      })),
      ...rows
        .filter((row) => row.userId === null)
        .slice(0, 25)
        .map((row) => ({
          id: `missing-owner:${row.id}`,
          type: 'missing_owner' as const,
          severity: 'warning' as const,
          title: 'Billing event has no owner',
          description: `${row.eventType} could not be associated with a user.`,
          workspaceId: row.workspaceId ?? undefined,
          billingEventId: row.id,
          at: row.processedAt.toISOString(),
        })),
      ...rows
        .filter((row) => row.amount === null || !row.currency)
        .slice(0, 25)
        .map((row) => ({
          id: `incomplete:${row.id}`,
          type: 'incomplete_event' as const,
          severity: 'warning' as const,
          title: 'Billing event is incomplete',
          description: `${row.eventType} is missing amount or currency metadata.`,
          userId: row.userId ?? undefined,
          workspaceId: row.workspaceId ?? undefined,
          billingEventId: row.id,
          at: row.processedAt.toISOString(),
        })),
    ];

    return {
      range: this.serializeRange(range),
      counts: {
        billingEvents: rows.length,
        successfulPayments,
        failedPayments,
        activeSubscriptions: statusCounts.get('ACTIVE') ?? 0,
        pastDueSubscriptions: statusCounts.get('PAST_DUE') ?? 0,
        pausedSubscriptions: statusCounts.get('PAUSED') ?? 0,
        cancelledSubscriptions: statusCounts.get('CANCELLED') ?? 0,
      },
      collections: [...collections.entries()].map(([currency, value]) => ({ currency, ...value })),
      alerts: alerts
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 50),
      dataQuality: {
        eventsWithoutAmount,
        eventsWithoutCurrency,
        eventsWithoutOwner,
        exactRetryTelemetryAvailable: false as const,
      },
    };
  }

  private async findEvents(
    range: DateRange,
    query: AdminBillingOperationsQueryDto,
    take: number,
  ) {
    const where: Prisma.BillingEventWhereInput = {
      processedAt: { gte: range.from, lt: range.to },
    };
    const eventType = query.eventType?.trim();
    if (eventType) where.eventType = { contains: eventType, mode: 'insensitive' };

    return this.prisma.billingEvent.findMany({
      where,
      orderBy: { processedAt: 'desc' },
      take,
    });
  }

  private async decorate(events: BillingEvent[]): Promise<BillingRow[]> {
    const candidates = events.map((event) => this.eventCandidates(event));
    const userIds = [...new Set(candidates.flatMap((item) => item.userIds))];
    const subscriptionIds = [...new Set(candidates.flatMap((item) => item.subscriptionIds))];
    const workspaceIds = [...new Set(events.map((event) => event.workspaceId).filter((id): id is string => !!id))];

    const [users, workspaces] = await Promise.all([
      userIds.length || subscriptionIds.length
        ? this.prisma.user.findMany({
            where: {
              OR: [
                ...(userIds.length ? [{ id: { in: userIds } }] : []),
                ...(subscriptionIds.length
                  ? [{ razorpaySubscriptionId: { in: subscriptionIds } }, { stripeSubscriptionId: { in: subscriptionIds } }]
                  : []),
              ],
            },
            select: {
              id: true,
              email: true,
              activeWorkspaceId: true,
              razorpaySubscriptionId: true,
              stripeSubscriptionId: true,
            },
          })
        : Promise.resolve([]),
      workspaceIds.length
        ? this.prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const usersById = new Map(users.map((user) => [user.id, user]));
    for (const user of users) {
      if (user.razorpaySubscriptionId) usersById.set(`subscription:${user.razorpaySubscriptionId}`, user);
      if (user.stripeSubscriptionId) usersById.set(`subscription:${user.stripeSubscriptionId}`, user);
    }
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

    return events.map((event, index) => {
      const candidate = candidates[index];
      const user = candidate.userIds.map((id) => usersById.get(id)).find(Boolean)
        ?? candidate.subscriptionIds.map((id) => usersById.get(`subscription:${id}`)).find(Boolean);
      const rawWorkspace = event.workspaceId ? workspaceById.get(event.workspaceId) : undefined;
      const workspaceId = rawWorkspace?.id ?? user?.activeWorkspaceId ?? null;
      const workspace = workspaceId ? workspaceById.get(workspaceId) : undefined;
      const provider = this.providerFor(event);
      const values = this.extractValues(event.payload, provider);

      return {
        id: event.id,
        eventType: event.eventType,
        provider,
        providerReference: event.razorpayRef,
        workspaceId,
        workspaceName: workspace?.name ?? null,
        userId: user?.id ?? null,
        userEmail: user?.email ?? null,
        subscriptionId: user?.razorpaySubscriptionId ?? user?.stripeSubscriptionId ?? candidate.subscriptionIds[0] ?? null,
        amount: values.amount,
        currency: values.currency,
        outcome: this.outcomeFor(event.eventType),
        processedAt: event.processedAt,
        replayable: this.isReplayable(event, provider),
      };
    });
  }

  private filterRows(rows: BillingRow[], query: AdminBillingOperationsQueryDto) {
    const provider = query.provider ?? 'all';
    const search = query.q?.trim().toLowerCase();
    return rows.filter((row) => {
      if (provider !== 'all' && row.provider !== provider) return false;
      if (!search) return true;
      return [
        row.eventType,
        row.providerReference,
        row.workspaceName,
        row.userEmail,
      ].some((value) => value?.toLowerCase().includes(search));
    });
  }

  private resolveRange(query: AdminBillingOperationsQueryDto): DateRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      throw new BadRequestException('Invalid billing date range.');
    }
    if (to.getTime() - from.getTime() > 365 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Billing date range cannot exceed 365 days.');
    }
    return { from, to };
  }

  private serializeRange(range: DateRange) {
    return { from: range.from.toISOString(), to: range.to.toISOString() };
  }

  private serializeRow(row: BillingRow) {
    return { ...row, processedAt: row.processedAt.toISOString() };
  }

  private providerFor(event: BillingEvent): Provider {
    return detectBillingProvider(event.eventType, event.payload);
  }

  private outcomeFor(eventType: string): Outcome {
    const value = eventType.toLowerCase();
    if (/(failed|failure|halted|past_due)/.test(value)) return 'failed';
    if (/(success|paid|activated|charged|created|updated)/.test(value)) return 'success';
    return 'info';
  }

  private isReplayable(event: BillingEvent, provider: Provider) {
    const payload = this.asRecord(event.payload);
    return provider === 'razorpay'
      ? typeof payload?.event === 'string' && !!this.asRecord(payload.payload)
      : provider === 'stripe' && typeof payload?.type === 'string' && !!this.asRecord(payload.data);
  }

  private eventCandidates(event: BillingEvent) {
    const root = this.asRecord(event.payload);
    const razorpayPayload = this.asRecord(root?.payload) ?? root;
    const subscription = this.asRecord(this.asRecord(razorpayPayload?.subscription)?.entity);
    const stripeObject = this.asRecord(this.asRecord(root?.data)?.object);
    const metadata = this.asRecord(subscription?.notes) ?? this.asRecord(stripeObject?.metadata);
    const userIds = [metadata?.userId, metadata?.ownerId]
      .filter((value): value is string => typeof value === 'string');
    const subscriptionIds = [subscription?.id, stripeObject?.id]
      .filter((value): value is string => typeof value === 'string' && value.startsWith('sub_'));
    if (event.workspaceId) userIds.push(event.workspaceId);
    return { userIds: [...new Set(userIds)], subscriptionIds: [...new Set(subscriptionIds)] };
  }

  private extractValues(payload: unknown, provider: Provider) {
    return {
      amount: extractBillingAmount(payload, provider),
      currency: extractBillingCurrency(payload),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
}
