import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminCustomerTargetType, AdminCustomerTaskStatus, AdminRole, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminSupportNotesService } from '../support/admin-support-notes.service';
import { AdminTimelineService } from '../timeline/admin-timeline.service';
import type {
  AdminCustomerQueryDto,
  CreateCustomerTagDto,
  CreateCustomerTaskDto,
  CustomerLifecycle,
  UpdateCustomerTaskDto,
} from './dto/admin-customers.dto';

type WorkspaceRow = {
  id: string;
  name: string;
  businessName: string | null;
  country: string | null;
  currency: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  members: Array<{ role: string; workspaceRole: { key: string }; user: { id: string; name: string; email: string; plan: string; subscriptionStatus: SubscriptionStatus; onboardingComplete: boolean; createdAt: Date } }>;
  _count: { members: number; contacts: number; proposals: number; invoices: number; projects: number; incidents: number };
  whatsappConnection: { isActive: boolean; updatedAt: Date } | null;
};

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: AdminTimelineService,
    private readonly supportNotes: AdminSupportNotesService,
  ) {}

  async overview() {
    const rows = await this.loadWorkspaces();
    const accounts = rows.map((row) => this.score(row));
    const byLifecycle = this.countBy(accounts, (account) => account.lifecycle);
    const byHealth = { healthy: accounts.filter((account) => account.healthScore >= 70).length, watch: accounts.filter((account) => account.healthScore >= 45 && account.healthScore < 70).length, atRisk: accounts.filter((account) => account.healthScore < 45).length };
    return {
      total: accounts.length,
      active: accounts.filter((account) => !account.archivedAt).length,
      lifecycle: byLifecycle,
      health: byHealth,
      topAtRisk: accounts.filter((account) => account.lifecycle === 'AT_RISK' || account.lifecycle === 'PAST_DUE' || account.lifecycle === 'CHURNED').sort((a, b) => a.healthScore - b.healthScore).slice(0, 10),
      dataQuality: { activityIsWorkspaceUpdatedAtProxy: true as const, retentionTelemetryAvailable: false as const, subscriptionOwnerIsWorkspaceOwnerProxy: true as const },
    };
  }

  async list(query: AdminCustomerQueryDto) {
    const rows = await this.loadWorkspaces();
    const search = query.q?.trim().toLowerCase();
    let accounts = rows.map((row) => this.score(row));
    accounts = accounts.filter((account) => {
      if (search && ![account.name, account.businessName, account.owner?.name, account.owner?.email].some((value) => value?.toLowerCase().includes(search))) return false;
      if (query.lifecycle && account.lifecycle !== query.lifecycle) return false;
      if (query.healthMin !== undefined && account.healthScore < query.healthMin) return false;
      if (query.healthMax !== undefined && account.healthScore > query.healthMax) return false;
      if (query.plan && account.owner?.plan !== query.plan) return false;
      if (query.subscriptionStatus && account.owner?.subscriptionStatus !== query.subscriptionStatus) return false;
      if (query.inactiveDays !== undefined && account.activityAgeDays < query.inactiveDays) return false;
      return true;
    });
    accounts.sort((a, b) => a.healthScore - b.healthScore || b.updatedAt.getTime() - a.updatedAt.getTime());
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return { items: accounts.slice((page - 1) * pageSize, page * pageSize), total: accounts.length, page, pageSize };
  }

  async detail(id: string) {
    const row = await this.prisma.workspace.findUnique({ where: { id }, select: this.workspaceSelect() });
    if (!row) throw new NotFoundException('Customer workspace not found.');
    const account = this.score(row as WorkspaceRow);
    const [tasks, tags, notes, communications, incidents, timeline] = await Promise.all([
      this.tasks(id),
      this.prisma.adminCustomerTag.findMany({ where: { targetType: AdminCustomerTargetType.WORKSPACE, targetId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, tag: true, createdById: true, createdAt: true } }),
      this.supportNotes.list({ targetType: 'workspace', targetId: id }),
      this.prisma.communicationLog.groupBy({ by: ['channel', 'status'], where: { workspaceId: id }, _count: { _all: true } }),
      this.prisma.adminIncident.findMany({ where: { workspaceId: id }, orderBy: { lastSeenAt: 'desc' }, take: 30, select: { id: true, source: true, title: true, severity: true, status: true, lastSeenAt: true } }),
      this.timeline.get('workspace', id, 120),
    ]);
    return { ...account, tasks, tags, notes, communications: communications.map((item) => ({ channel: item.channel, status: item.status, count: item._count._all })), incidents, timeline };
  }

  async export(query: AdminCustomerQueryDto) {
    const result = await this.list({ ...query, page: 1, pageSize: 10000 });
    const rows = [['workspace_id', 'workspace_name', 'owner_email', 'plan', 'subscription_status', 'lifecycle', 'health_score', 'activity_age_days', 'members', 'contacts', 'proposals', 'invoices', 'projects']];
    for (const item of result.items) rows.push([item.id, item.name, item.owner?.email ?? '', item.owner?.plan ?? '', item.owner?.subscriptionStatus ?? '', item.lifecycle, String(item.healthScore), String(item.activityAgeDays), String(item.counts.members), String(item.counts.contacts), String(item.counts.proposals), String(item.counts.invoices), String(item.counts.projects)]);
    return rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\n');
  }

  async tasks(workspaceId: string) {
    await this.assertWorkspace(workspaceId);
    return this.prisma.adminCustomerTask.findMany({ where: { targetType: AdminCustomerTargetType.WORKSPACE, targetId: workspaceId }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }], take: 100, include: { owner: { select: { id: true, name: true, email: true, role: true } } } });
  }

  async createTask(adminId: string, adminRole: AdminRole, workspaceId: string, dto: CreateCustomerTaskDto) {
    await this.assertWorkspace(workspaceId);
    if (dto.ownerAdminId) await this.assertActiveAdmin(dto.ownerAdminId);
    const task = await this.prisma.adminCustomerTask.create({ data: { targetType: AdminCustomerTargetType.WORKSPACE, targetId: workspaceId, title: dto.title.trim(), body: dto.body?.trim() || null, ownerAdminId: dto.ownerAdminId ?? adminId, dueAt: dto.dueAt ? new Date(dto.dueAt) : null }, include: { owner: { select: { id: true, name: true, email: true, role: true } } } });
    await this.audit.log({ adminId, adminRole, targetType: 'workspace', targetId: workspaceId, action: 'admin.customer.task.create', after: { taskId: task.id, title: task.title, ownerAdminId: task.ownerAdminId, dueAt: task.dueAt } });
    return task;
  }

  async updateTask(adminId: string, adminRole: AdminRole, id: string, dto: UpdateCustomerTaskDto) {
    const before = await this.prisma.adminCustomerTask.findUnique({ where: { id }, select: { id: true, targetType: true, targetId: true, title: true, status: true, ownerAdminId: true, dueAt: true } });
    if (!before) throw new NotFoundException('Customer task not found.');
    if (dto.ownerAdminId) await this.assertActiveAdmin(dto.ownerAdminId);
    const status = dto.status ?? before.status;
    const task = await this.prisma.adminCustomerTask.update({ where: { id }, data: { ...(dto.title !== undefined ? { title: dto.title.trim() } : {}), ...(dto.body !== undefined ? { body: dto.body?.trim() || null } : {}), ...(dto.ownerAdminId !== undefined ? { ownerAdminId: dto.ownerAdminId || null } : {}), ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}), status, completedAt: status === AdminCustomerTaskStatus.COMPLETED ? new Date() : status === AdminCustomerTaskStatus.OPEN || status === AdminCustomerTaskStatus.IN_PROGRESS ? null : undefined }, include: { owner: { select: { id: true, name: true, email: true, role: true } } } });
    await this.audit.log({ adminId, adminRole, targetType: 'customer_task', targetId: id, action: 'admin.customer.task.update', before, after: { status: task.status, ownerAdminId: task.ownerAdminId, dueAt: task.dueAt }, reason: dto.body?.trim() ?? null });
    return task;
  }

  async addTag(adminId: string, adminRole: AdminRole, workspaceId: string, dto: CreateCustomerTagDto) {
    await this.assertWorkspace(workspaceId);
    const tag = dto.tag.trim().toLowerCase().replace(/\s+/g, '-');
    try {
      const result = await this.prisma.adminCustomerTag.create({ data: { targetType: AdminCustomerTargetType.WORKSPACE, targetId: workspaceId, tag, createdById: adminId } });
      await this.audit.log({ adminId, adminRole, targetType: 'workspace', targetId: workspaceId, action: 'admin.customer.tag.add', after: { tag } });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Customer tag already exists.');
      throw error;
    }
  }

  async removeTag(adminId: string, adminRole: AdminRole, workspaceId: string, tag: string) {
    const normalized = tag.trim().toLowerCase();
    const existing = await this.prisma.adminCustomerTag.findUnique({ where: { targetType_targetId_tag: { targetType: AdminCustomerTargetType.WORKSPACE, targetId: workspaceId, tag: normalized } } });
    if (!existing) throw new NotFoundException('Customer tag not found.');
    await this.prisma.adminCustomerTag.delete({ where: { id: existing.id } });
    await this.audit.log({ adminId, adminRole, targetType: 'workspace', targetId: workspaceId, action: 'admin.customer.tag.remove', before: { tag: normalized } });
    return { removed: true, tag: normalized };
  }

  private async loadWorkspaces() {
    return (await this.prisma.workspace.findMany({ where: { archivedAt: null }, select: this.workspaceSelect(), orderBy: { updatedAt: 'desc' }, take: 10000 })) as unknown as WorkspaceRow[];
  }

  private workspaceSelect() {
    return {
      id: true,
      name: true,
      businessName: true,
      country: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
      members: { take: 8, select: { role: true, workspaceRole: { select: { key: true } }, user: { select: { id: true, name: true, email: true, plan: true, subscriptionStatus: true, onboardingComplete: true, createdAt: true } } } },
      whatsappConnection: { select: { isActive: true, updatedAt: true } },
      _count: { select: { members: true, contacts: true, proposals: true, invoices: true, projects: true, incidents: true } },
    } as const;
  }

  private score(row: WorkspaceRow) {
    const ownerMember = row.members.find((member) => member.role === 'OWNER' || member.workspaceRole.key === 'OWNER');
    const owner = ownerMember?.user ?? null;
    const now = Date.now();
    const activityAgeDays = Math.max(0, Math.floor((now - row.updatedAt.getTime()) / 86_400_000));
    const accountAgeDays = Math.max(0, Math.floor((now - row.createdAt.getTime()) / 86_400_000));
    const factors: Array<{ key: string; label: string; impact: number; state: 'positive' | 'warning' | 'negative' | 'neutral' }> = [];
    let score = 0;
    if (owner?.onboardingComplete) { score += 25; factors.push({ key: 'onboarding', label: 'Onboarding completed', impact: 25, state: 'positive' }); } else factors.push({ key: 'onboarding', label: 'Onboarding incomplete', impact: 0, state: 'warning' });
    if (owner?.subscriptionStatus === SubscriptionStatus.ACTIVE) { score += 25; factors.push({ key: 'subscription', label: 'Subscription active', impact: 25, state: 'positive' }); } else if (owner?.subscriptionStatus === SubscriptionStatus.PAST_DUE) factors.push({ key: 'subscription', label: 'Subscription past due', impact: 0, state: 'negative' }); else factors.push({ key: 'subscription', label: `Subscription ${owner?.subscriptionStatus ?? 'unknown'}`, impact: 5, state: 'neutral' });
    if (activityAgeDays <= 14) { score += 20; factors.push({ key: 'activity', label: 'Activity in the last 14 days', impact: 20, state: 'positive' }); } else if (activityAgeDays <= 30) { score += 12; factors.push({ key: 'activity', label: 'Activity in the last 30 days', impact: 12, state: 'warning' }); } else { factors.push({ key: 'activity', label: `No workspace update for ${activityAgeDays} days`, impact: 0, state: 'negative' }); }
    const records = row._count.contacts + row._count.proposals + row._count.invoices + row._count.projects;
    if (records > 0) { score += 15; factors.push({ key: 'records', label: `${records} business records created`, impact: 15, state: 'positive' }); } else factors.push({ key: 'records', label: 'No business records yet', impact: 0, state: 'warning' });
    if (row.whatsappConnection?.isActive) { score += 10; factors.push({ key: 'integration', label: 'WhatsApp integration active', impact: 10, state: 'positive' }); }
    if (owner?.subscriptionStatus === SubscriptionStatus.PAST_DUE) score -= 25;
    if (owner?.subscriptionStatus === SubscriptionStatus.CANCELLED) score -= 15;
    if (activityAgeDays > 60) score -= 15;
    const healthScore = Math.max(0, Math.min(100, score));
    const lifecycle: CustomerLifecycle = owner?.subscriptionStatus === SubscriptionStatus.PAST_DUE ? 'PAST_DUE' : owner?.subscriptionStatus === SubscriptionStatus.CANCELLED && activityAgeDays > 45 ? 'CHURNED' : accountAgeDays <= 14 ? 'NEW' : !owner?.onboardingComplete ? 'ONBOARDING' : healthScore < 45 || activityAgeDays > 60 ? 'AT_RISK' : 'ACTIVE';
    return { id: row.id, name: row.name, businessName: row.businessName, country: row.country, currency: row.currency, createdAt: row.createdAt, updatedAt: row.updatedAt, archivedAt: row.archivedAt, owner: owner ? { id: owner.id, name: owner.name, email: owner.email, plan: owner.plan, subscriptionStatus: owner.subscriptionStatus, onboardingComplete: owner.onboardingComplete, createdAt: owner.createdAt } : null, lifecycle, healthScore, activityAgeDays, factors, counts: row._count, integration: row.whatsappConnection ? { active: row.whatsappConnection.isActive, updatedAt: row.whatsappConnection.updatedAt } : null };
  }

  private countBy<T>(items: T[], key: (item: T) => string) { return items.reduce<Record<string, number>>((result, item) => { const value = key(item); result[value] = (result[value] ?? 0) + 1; return result; }, {}); }

  private async assertWorkspace(id: string) { const workspace = await this.prisma.workspace.findUnique({ where: { id }, select: { id: true } }); if (!workspace) throw new NotFoundException('Customer workspace not found.'); }
  private async assertActiveAdmin(id: string) { const admin = await this.prisma.adminUser.findUnique({ where: { id }, select: { id: true, status: true } }); if (!admin) throw new NotFoundException('Admin account not found.'); if (admin.status !== 'ACTIVE') throw new BadRequestException('Task owner must be active.'); }
  private csvCell(value: unknown) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
}
