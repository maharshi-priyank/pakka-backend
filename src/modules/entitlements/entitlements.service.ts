import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactStage, Plan, SubscriptionStatus, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { effectivePlan } from '../users/effective-plan';

export type UsageMetric = 'clients' | 'projects' | 'activeLeads' | 'teamMembers' | 'storageBytes';

export const PLAN_LIMITS: Record<Plan, Record<UsageMetric, number>> = {
  FREE:  { clients: 2,  projects: 10, activeLeads: 30,  teamMembers: 0, storageBytes: 100 * 1024 * 1024 },
  SOLO:  { clients: Infinity, projects: Infinity, activeLeads: Infinity, teamMembers: 0, storageBytes: 2 * 1024 * 1024 * 1024 },
  STUDIO:{ clients: Infinity, projects: Infinity, activeLeads: Infinity, teamMembers: Infinity, storageBytes: Infinity },
};

const ACTIVE_LEAD_STAGES: ContactStage[] = ['ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING'];
const CLIENT_STAGES: ContactStage[] = ['CLIENT', 'PAST_CLIENT'];

type PlanFields = Pick<User, 'plan' | 'planExpiresAt' | 'subscriptionStatus'>;

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBillingOwnerId(workspaceId: string): Promise<string> {
    let workspace: { billingOwnerId: string | null } | null = null;
    try {
      workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { billingOwnerId: true } });
    } catch (error) {
      // Older deployments may run the app before the additive migration. The
      // membership owner is a safe compatibility source until it is applied.
      if ((error as { code?: string }).code !== 'P2022') throw error;
    }
    if (workspace?.billingOwnerId) return workspace.billingOwnerId;
    if (!workspace) {
      const exists = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Workspace not found');
    }

    // Compatibility for rows created before the account ownership migration.
    const owner = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, workspaceRole: { key: 'OWNER' } },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    return owner?.userId ?? workspaceId;
  }

  async getOwnerForWorkspace(workspaceId: string): Promise<PlanFields & { id: string }> {
    const ownerId = await this.resolveBillingOwnerId(workspaceId);
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, plan: true, planExpiresAt: true, subscriptionStatus: true },
    });
    if (!owner) throw new NotFoundException('Billing account not found');
    return owner;
  }

  async getEffectivePlanForWorkspace(workspaceId: string): Promise<Plan> {
    return effectivePlan(await this.getOwnerForWorkspace(workspaceId));
  }

  async getAccountWorkspaceIds(ownerId: string): Promise<string[]> {
    let workspaces: { id: string }[] = [];
    try {
      workspaces = await this.prisma.workspace.findMany({ where: { billingOwnerId: ownerId }, select: { id: true } });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2022') throw error;
    }
    return workspaces.length ? workspaces.map(({ id }) => id) : [ownerId];
  }

  async getUsage(workspaceId: string) {
    const owner = await this.getOwnerForWorkspace(workspaceId);
    const workspaceIds = await this.getAccountWorkspaceIds(owner.id);
    const [clients, projects, activeLeads, members, storage] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId: { in: workspaceIds }, archivedAt: null, stage: { in: CLIENT_STAGES } } }),
      this.prisma.project.count({ where: { workspaceId: { in: workspaceIds }, archivedAt: null } }),
      this.prisma.contact.count({ where: { workspaceId: { in: workspaceIds }, archivedAt: null, stage: { in: ACTIVE_LEAD_STAGES } } }),
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: { in: workspaceIds }, userId: { not: owner.id } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.attachment.aggregate({ where: { workspaceId: { in: workspaceIds } }, _sum: { fileSize: true } }),
    ]);
    const plan = effectivePlan(owner);
    const rawLimits = PLAN_LIMITS[plan];
    const limits = Object.fromEntries(Object.entries(rawLimits).map(([key, value]) => [key, Number.isFinite(value) ? value : null])) as Record<UsageMetric, number | null>;
    return {
      plan,
      usage: { clients, projects, activeLeads, teamMembers: members.length, storageBytes: storage._sum.fileSize ?? 0 },
      limits,
      overLimit: {
        clients: rawLimits.clients !== Infinity && clients > rawLimits.clients,
        projects: rawLimits.projects !== Infinity && projects > rawLimits.projects,
        activeLeads: rawLimits.activeLeads !== Infinity && activeLeads > rawLimits.activeLeads,
        teamMembers: rawLimits.teamMembers !== Infinity && members.length > rawLimits.teamMembers,
        storageBytes: rawLimits.storageBytes !== Infinity && Number(storage._sum.fileSize ?? 0) > rawLimits.storageBytes,
      },
      workspaceCount: workspaceIds.length,
      trialEndsAt: owner.planExpiresAt,
      subscriptionStatus: owner.subscriptionStatus,
    };
  }

  async assertWithinLimit(workspaceId: string, metric: UsageMetric, increment = 1): Promise<void> {
    const summary = await this.getUsage(workspaceId);
    const current = summary.usage[metric];
    const limit = summary.limits[metric];
    if (limit != null && current + increment > limit) {
      throw new ForbiddenException({
        message: `You've reached the ${metric} limit for the ${summary.plan === 'SOLO' ? 'Pro' : summary.plan} plan. Upgrade to continue.`,
        code: 'PLAN_LIMIT',
        metric,
        usage: current,
        limit,
        plan: summary.plan,
      });
    }
  }

  async assertPortalAccess(workspaceId: string): Promise<void> {
    const plan = await this.getEffectivePlanForWorkspace(workspaceId);
    if (plan === Plan.FREE) {
      throw new ForbiddenException({ message: 'Client Portal requires a Pro or Studio plan.', code: 'PORTAL_LOCKED' });
    }
  }

  isBillingManager(user: Pick<User, 'id'>, ownerId: string, permissions: string[] = []): boolean {
    return user.id === ownerId || permissions.includes('MANAGE_BILLING');
  }
}
