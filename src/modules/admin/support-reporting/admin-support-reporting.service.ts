import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AdminSupportQueueQueryDto,
  AdminSupportReportingQueryDto,
  SupportQueueType,
} from './dto/admin-support-reporting.dto';

interface DateRange { from: Date; to: Date }

interface InactiveWorkspace {
  id: string;
  name: string;
  createdAt: Date;
  lastActivityAt: Date | null;
}

interface QueueRow {
  id: string;
  type: 'onboarding' | 'billing' | 'inactive';
  priority: 'normal' | 'high' | 'critical';
  userId: string | null;
  workspaceId: string | null;
  subject: string;
  reason: string;
  createdAt: Date;
  lastKnownActivityAt: Date | null;
}

@Injectable()
export class AdminSupportReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: AdminSupportReportingQueryDto = {}) {
    const range = this.resolveRange(query);
    const inactiveDays = query.inactiveDays ?? 30;
    const onboardingThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      pendingOnboarding,
      onboardingAging,
      activatedUsers,
      pastDueUsers,
      inactiveWorkspaces,
      notesCreated,
      newUsers,
      noteGroups,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { onboardingComplete: false } }),
      this.prisma.user.count({ where: { onboardingComplete: false, createdAt: { lte: onboardingThreshold } } }),
      this.prisma.user.count({ where: { onboardingComplete: true } }),
      this.prisma.user.count({ where: { subscriptionStatus: 'PAST_DUE' } }),
      this.findInactiveWorkspaces(inactiveDays),
      this.prisma.adminSupportNote.count({ where: { createdAt: { gte: range.from, lt: range.to } } }),
      this.prisma.user.findMany({ where: { createdAt: { gte: range.from, lt: range.to } }, select: { createdAt: true, onboardingComplete: true } }),
      this.prisma.adminSupportNote.groupBy({ where: { createdAt: { gte: range.from, lt: range.to } }, by: ['adminId'], _count: { _all: true } }),
    ]);

    const periods = this.periodKeys(range);
    const series = new Map(periods.map((period) => [period, { period, newUsers: 0, currentOnboarded: 0 }]));
    for (const user of newUsers) {
      const point = series.get(this.periodKey(user.createdAt, range));
      if (!point) continue;
      point.newUsers += 1;
      if (user.onboardingComplete) point.currentOnboarded += 1;
    }

    return {
      range: { ...this.serializeRange(range), inactiveDays },
      kpis: {
        totalUsers,
        pendingOnboarding,
        onboardingAging,
        activatedUsers,
        activationRate: totalUsers ? Number(((activatedUsers / totalUsers) * 100).toFixed(1)) : 0,
        pastDueUsers,
        inactiveWorkspaces: inactiveWorkspaces.length,
        notesCreated,
      },
      onboardingSeries: [...series.values()],
      supportWorkload: noteGroups.map((group) => ({ adminId: group.adminId, notes: group._count._all })),
      dataQuality: {
        onboardingCompletionTimestampAvailable: false as const,
        loginTelemetryAvailable: false as const,
        inactivityDefinition: `No product or billing activity recorded in the last ${inactiveDays} days for a workspace older than 14 days.`,
      },
    };
  }

  async queue(query: AdminSupportQueueQueryDto = {}) {
    const range = this.resolveRange(query);
    const inactiveDays = query.inactiveDays ?? 30;
    const type = query.type ?? 'all';
    const [onboarding, billing, inactive] = await Promise.all([
      type === 'all' || type === 'onboarding' ? this.onboardingRows() : Promise.resolve([]),
      type === 'all' || type === 'billing' ? this.billingRows() : Promise.resolve([]),
      type === 'all' || type === 'inactive' ? this.inactiveRows(inactiveDays) : Promise.resolve([]),
    ]);
    const search = query.q?.trim().toLowerCase();
    const rows = [...onboarding, ...billing, ...inactive]
      .filter((row) => !search || [row.subject, row.reason].some((value) => value.toLowerCase().includes(search)))
      .sort((a, b) => this.priorityRank(b.priority) - this.priorityRank(a.priority) || b.createdAt.getTime() - a.createdAt.getTime());
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastKnownActivityAt: row.lastKnownActivityAt?.toISOString() ?? null,
      })),
      total: rows.length,
      page,
      pageSize,
      range: { ...this.serializeRange(range), inactiveDays },
    };
  }

  private async onboardingRows(): Promise<QueueRow[]> {
    const threshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const users = await this.prisma.user.findMany({
      where: { onboardingComplete: false, createdAt: { lte: threshold } },
      select: { id: true, name: true, email: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return users.map((user) => ({
      id: `onboarding:${user.id}`,
      type: 'onboarding',
      priority: user.createdAt < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) ? 'high' : 'normal',
      userId: user.id,
      workspaceId: null,
      subject: user.name || user.email,
      reason: 'Onboarding is incomplete.',
      createdAt: user.createdAt,
      lastKnownActivityAt: user.updatedAt,
    }));
  }

  private async billingRows(): Promise<QueueRow[]> {
    const users = await this.prisma.user.findMany({
      where: { subscriptionStatus: 'PAST_DUE' },
      select: { id: true, name: true, email: true, activeWorkspaceId: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    return users.map((user) => ({
      id: `billing:${user.id}`,
      type: 'billing',
      priority: 'critical',
      userId: user.id,
      workspaceId: user.activeWorkspaceId,
      subject: user.name || user.email,
      reason: 'Subscription is past due.',
      createdAt: user.createdAt,
      lastKnownActivityAt: user.updatedAt,
    }));
  }

  private async inactiveRows(inactiveDays: number): Promise<QueueRow[]> {
    const workspaces = await this.findInactiveWorkspaces(inactiveDays);
    return workspaces.map((workspace) => ({
      id: `inactive:${workspace.id}`,
      type: 'inactive',
      priority: workspace.lastActivityAt && workspace.lastActivityAt < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) ? 'high' : 'normal',
      userId: null,
      workspaceId: workspace.id,
      subject: workspace.name,
      reason: `No product or billing activity recorded for ${inactiveDays} days.`,
      createdAt: workspace.createdAt,
      lastKnownActivityAt: workspace.lastActivityAt,
    }));
  }

  private async findInactiveWorkspaces(inactiveDays: number): Promise<InactiveWorkspace[]> {
    const inactivityCutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const ageCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [workspaces, contacts, projects, proposals, contracts, invoices, tasks, billing] = await Promise.all([
      this.prisma.workspace.findMany({ where: { archivedAt: null, createdAt: { lte: ageCutoff } }, select: { id: true, name: true, createdAt: true } }),
      this.prisma.contact.groupBy({ by: ['workspaceId'], _max: { updatedAt: true } }),
      this.prisma.project.groupBy({ by: ['workspaceId'], _max: { updatedAt: true } }),
      this.prisma.proposal.groupBy({ by: ['workspaceId'], _max: { updatedAt: true } }),
      this.prisma.contract.groupBy({ by: ['workspaceId'], _max: { updatedAt: true } }),
      this.prisma.invoice.groupBy({ by: ['workspaceId'], _max: { updatedAt: true } }),
      this.prisma.task.groupBy({ by: ['workspaceId'], _max: { updatedAt: true } }),
      this.prisma.billingEvent.groupBy({ by: ['workspaceId'], _max: { processedAt: true } }),
    ]);
    const latestByWorkspace = new Map<string, Date>();
    for (const group of [...contacts, ...projects, ...proposals, ...contracts, ...invoices, ...tasks]) {
      const value = group._max.updatedAt;
      if (value && (!latestByWorkspace.has(group.workspaceId) || value > latestByWorkspace.get(group.workspaceId)!)) latestByWorkspace.set(group.workspaceId, value);
    }
    for (const group of billing) {
      if (!group.workspaceId || !group._max.processedAt) continue;
      if (!latestByWorkspace.has(group.workspaceId) || group._max.processedAt > latestByWorkspace.get(group.workspaceId)!) latestByWorkspace.set(group.workspaceId, group._max.processedAt);
    }
    return workspaces
      .map((workspace) => ({ ...workspace, lastActivityAt: latestByWorkspace.get(workspace.id) ?? null }))
      .filter((workspace) => !workspace.lastActivityAt || workspace.lastActivityAt < inactivityCutoff);
  }

  private resolveRange(query: AdminSupportReportingQueryDto): DateRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new BadRequestException('Invalid support reporting date range.');
    if (to.getTime() - from.getTime() > 365 * 24 * 60 * 60 * 1000) throw new BadRequestException('Support reporting date range cannot exceed 365 days.');
    return { from, to };
  }

  private serializeRange(range: DateRange) { return { from: range.from.toISOString(), to: range.to.toISOString() }; }

  private periodKeys(range: DateRange) {
    const keys: string[] = [];
    const cursor = new Date(range.from);
    const useDay = range.to.getTime() - range.from.getTime() <= 31 * 24 * 60 * 60 * 1000;
    while (cursor < range.to && keys.length < 370) {
      keys.push(this.periodKey(cursor, range));
      if (useDay) cursor.setUTCDate(cursor.getUTCDate() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return [...new Set(keys)];
  }

  private periodKey(value: Date, range: DateRange) {
    const useDay = range.to.getTime() - range.from.getTime() <= 31 * 24 * 60 * 60 * 1000;
    return useDay ? value.toISOString().slice(0, 10) : value.toISOString().slice(0, 7);
  }

  private priorityRank(priority: QueueRow['priority']) { return priority === 'critical' ? 3 : priority === 'high' ? 2 : 1; }
}
