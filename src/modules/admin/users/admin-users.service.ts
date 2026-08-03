import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminSupportNotesService } from '../support/admin-support-notes.service';
import { AdminTimelineService } from '../timeline/admin-timeline.service';

/**
 * Cross-tenant user lookup (R8, R10). Admin endpoints pass an explicit target
 * userId — never the caller's activeWorkspaceId (KTD2).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: AdminTimelineService,
    private readonly supportNotes: AdminSupportNotesService,
  ) {}

  async search(q: string | undefined, page: number, pageSize: number) {
    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.listSelect(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.listSelect(),
        planExpiresAt: true,
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        razorpaySubscriptionId: true,
        billingAnchorDate: true,
        createdAt: true,
        onboardingComplete: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: id },
      include: {
        workspace: { select: { id: true, name: true, archivedAt: true } },
        workspaceRole: { select: { id: true, key: true, name: true } },
      },
    });

    return {
      ...user,
      workspaces: memberships.map((m) => ({
        workspaceId: m.workspace.id,
        workspaceName: m.workspace.name,
        archived: !!m.workspace.archivedAt,
        legacyRole: m.role,
        roleKey: m.workspaceRole.key,
        roleName: m.workspaceRole.name,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async detail360(id: string) {
    const [user, timeline, notes] = await Promise.all([
      this.detail(id),
      this.timeline.get('user', id),
      this.supportNotes.list({ targetType: 'user', targetId: id }),
    ]);
    return { ...user, timeline, notes };
  }

  private listSelect() {
    return {
      id: true,
      email: true,
      name: true,
      plan: true,
      activeWorkspaceId: true,
      createdAt: true,
    } as const;
  }
}
