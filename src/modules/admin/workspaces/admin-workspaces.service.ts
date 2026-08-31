import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminSupportNotesService } from '../support/admin-support-notes.service';
import { AdminTimelineService } from '../timeline/admin-timeline.service';

/**
 * Cross-tenant workspace lookup (R9, R10). Admin endpoints pass an explicit
 * target workspaceId — never the caller's activeWorkspaceId (KTD2).
 */
@Injectable()
export class AdminWorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: AdminTimelineService,
    private readonly supportNotes: AdminSupportNotesService,
  ) {}

  async search(q: string | undefined, page: number, pageSize: number) {
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { businessName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.workspace.findMany({
        where,
        select: {
          id: true,
          name: true,
          businessName: true,
          country: true,
          currency: true,
          createdAt: true,
          archivedAt: true,
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workspace.count({ where }),
    ]);
    return {
      items: items.map((w) => ({
        ...w,
        memberCount: w._count.members,
        _count: undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        businessName: true,
        country: true,
        currency: true,
        taxLabel: true,
        createdAt: true,
        archivedAt: true,
        _count: {
          select: {
            leads: true,
            clients: true,
            proposals: true,
            contracts: true,
            invoices: true,
            projects: true,
            tasks: true,
            timeEntries: true,
            expenses: true,
            threads: true,
            members: true,
          },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        workspaceRole: { select: { id: true, key: true, name: true } },
      },
    });
    const [featureFlags, memberRoles] = await Promise.all([
      this.prisma.adminWorkspaceFeatureFlag.findMany({
        where: { workspaceId: id },
        orderBy: { flag: 'asc' },
        select: { id: true, workspaceId: true, flag: true, enabled: true, updatedBy: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.workspaceRole.findMany({
        where:   { OR: [{ workspaceId: null }, { workspaceId: id }] },
        select:  { id: true, key: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    // Plan of the workspace's owner (first OWNER member) for billing/limits context.
    const owner = members.find((m) => m.workspaceRole.key === 'OWNER');

    return {
      ...workspace,
      entityCounts: {
        leads: workspace._count.leads,
        clients: workspace._count.clients,
        proposals: workspace._count.proposals,
        contracts: workspace._count.contracts,
        invoices: workspace._count.invoices,
        projects: workspace._count.projects,
        tasks: workspace._count.tasks,
        timeEntries: workspace._count.timeEntries,
        expenses: workspace._count.expenses,
        threads: workspace._count.threads,
      },
      memberCount: workspace._count.members,
      _count: undefined,
      members: members.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        legacyRole: m.role,
        roleId: m.workspaceRole.id,
        roleKey: m.workspaceRole.key,
        roleName: m.workspaceRole.name,
        joinedAt: m.joinedAt,
      })),
      ownerId: owner?.user.id ?? null,
      memberRoles,
      featureFlags,
    };
  }

  async detail360(id: string) {
    const [workspace, timeline, notes] = await Promise.all([
      this.detail(id),
      this.timeline.get('workspace', id),
      this.supportNotes.list({ targetType: 'workspace', targetId: id }),
    ]);
    return { ...workspace, timeline, notes };
  }
}
