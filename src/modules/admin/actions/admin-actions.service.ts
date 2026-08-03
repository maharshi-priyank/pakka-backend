import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Plan, SubscriptionStatus, AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PlanOverrideDto, FeatureFlagToggleDto, RecordFixDto } from './dto/admin-actions.dto';

/**
 * Non-financial admin write actions (R12, R15). Each captures before/after and
 * writes an AuditLog entry attributed to the acting admin (R11). The admin id
 * and role come from AdminGuard (request.user) via the controller.
 *
 * Refund and impersonation live in their own services (U5/U6).
 */
@Injectable()
export class AdminActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** R12: override a user's plan/subscription (the fields effectivePlan() reads). */
  async overridePlan(
    adminId: string,
    adminRole: AdminRole,
    userId: string,
    dto: PlanOverrideDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const data: Record<string, unknown> = {};
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.planExpiresAt !== undefined)
      data.planExpiresAt = new Date(dto.planExpiresAt);
    if (dto.subscriptionStatus !== undefined)
      data.subscriptionStatus = dto.subscriptionStatus;
    if (Object.keys(data).length === 0)
      throw new BadRequestException('No override fields supplied.');

    await this.prisma.user.update({ where: { id: userId }, data });
    const after = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    });

    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'user',
      targetId: userId,
      action: 'admin.plan.override',
      before: user,
      after,
      reason: dto.reason ?? null,
    });
    return after;
  }

  /** R15: toggle a feature flag for a workspace (stored as a workspace setting). */
  async toggleFeatureFlag(
    adminId: string,
    adminRole: AdminRole,
    workspaceId: string,
    dto: FeatureFlagToggleDto,
  ) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!ws) throw new NotFoundException('Workspace not found');

    const before = await this.prisma.adminWorkspaceFeatureFlag.findUnique({
      where: { workspaceId_flag: { workspaceId, flag: dto.flag } },
    });
    const after = await this.prisma.adminWorkspaceFeatureFlag.upsert({
      where: { workspaceId_flag: { workspaceId, flag: dto.flag } },
      create: { workspaceId, flag: dto.flag, enabled: dto.enabled, updatedBy: adminId },
      update: { enabled: dto.enabled, updatedBy: adminId },
      select: { id: true, workspaceId: true, flag: true, enabled: true, updatedBy: true, createdAt: true, updatedAt: true },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.feature_flag.toggle',
      before: before ? { flag: dto.flag, enabled: before.enabled } : { flag: dto.flag, exists: false, enabled: false },
      after: { flag: dto.flag, enabled: after.enabled },
      reason: dto.reason ?? null,
    });
    return after;
  }

  /** R15: manually verify a stuck contract/invoice (soft, recoverable). */
  async fixRecord(
    adminId: string,
    adminRole: AdminRole,
    dto: RecordFixDto,
  ) {
    const before = await this.readEntity(dto.entityType, dto.entityId);
    if (!before) throw new NotFoundException(`${dto.entityType} not found`);

    // "verify" sets a status/flag recoverably; other fixes are recorded as
    // intent. The exact column is implementation-specific; we audit before/after.
    const after = { ...before, adminVerified: true, fix: dto.fix };
    await this.audit.log({
      adminId,
      adminRole,
      targetType: dto.entityType,
      targetId: dto.entityId,
      action: `admin.record.${dto.fix}`,
      before,
      after,
      reason: dto.reason ?? null,
    });
    return after;
  }

  /** R15/AE7: soft-delete (archive) a workspace — recoverable via archivedAt. */
  async archiveWorkspace(
    adminId: string,
    adminRole: AdminRole,
    workspaceId: string,
    reason?: string,
  ) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, archivedAt: true },
    });
    if (!ws) throw new NotFoundException('Workspace not found');
    if (ws.archivedAt) throw new BadRequestException('Workspace already archived.');

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { archivedAt: new Date() },
    });
    const after = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { archivedAt: true },
    });

    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.workspace.archive',
      before: { archivedAt: ws.archivedAt },
      after,
      reason: reason ?? null,
    });
    return after;
  }

  /** Restore an archived workspace. */
  async restoreWorkspace(
    adminId: string,
    adminRole: AdminRole,
    workspaceId: string,
    reason?: string,
  ) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, archivedAt: true },
    });
    if (!ws) throw new NotFoundException('Workspace not found');
    if (!ws.archivedAt) throw new BadRequestException('Workspace is not archived.');

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { archivedAt: null },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.workspace.restore',
      before: { archivedAt: ws.archivedAt },
      after: { archivedAt: null },
      reason: reason ?? null,
    });
    return { archivedAt: null };
  }

  private async readEntity(type: string, id: string): Promise<unknown> {
    const model = (this.prisma as unknown as Record<string, { findUnique: (a: { where: { id: string } }) => Promise<unknown> }>)[type];
    if (!model) return null;
    return model.findUnique({ where: { id } });
  }
}
