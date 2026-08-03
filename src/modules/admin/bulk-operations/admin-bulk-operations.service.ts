import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminActionsService } from '../actions/admin-actions.service';
import { AdminBillingService } from '../billing/admin-billing.service';
import type { PlanOverrideDto } from '../actions/dto/admin-actions.dto';
import type { SyncSubscriptionDto } from '../billing/dto/admin-billing.dto';
import type { AdminBulkAction, AdminBulkOperationDto } from './dto/admin-bulk-operation.dto';

interface PreviewItem { targetId: string; eligible: boolean; reason?: string }

@Injectable()
export class AdminBulkOperationsService {
  private static readonly PREVIEW_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly actions: AdminActionsService,
    private readonly billing: AdminBillingService,
  ) {}

  async preview(adminId: string, dto: AdminBulkOperationDto) {
    const targetIds = [...new Set(dto.targetIds.map((id) => id.trim()).filter(Boolean))];
    if (!targetIds.length || targetIds.length > 100) throw new BadRequestException('Provide between 1 and 100 unique targets.');
    this.validateInput(dto);
    const items = await Promise.all(targetIds.map((targetId) => this.validateTarget(dto.action, targetId, dto)));
    const operation = await this.prisma.adminBulkOperation.create({
      data: {
        adminId,
        action: dto.action,
        status: 'PREVIEWED',
        targetIds,
        input: this.safeInput(dto),
        preview: items as unknown as Prisma.InputJsonValue,
        reason: dto.reason ?? null,
      },
      select: { id: true, action: true, status: true, targetIds: true, preview: true, reason: true, createdAt: true },
    });
    return {
      ...operation,
      eligible: items.filter((item) => item.eligible).length,
      skipped: items.filter((item) => !item.eligible).length,
      expiresAt: new Date(operation.createdAt.getTime() + AdminBulkOperationsService.PREVIEW_TTL_MS).toISOString(),
    };
  }

  async execute(adminId: string, adminRole: AdminRole, operationId: string) {
    const operation = await this.prisma.adminBulkOperation.findUnique({ where: { id: operationId } });
    if (!operation) throw new NotFoundException('Bulk operation not found.');
    if (operation.adminId !== adminId) throw new ForbiddenException('This bulk operation belongs to another admin.');
    if (operation.status !== 'PREVIEWED') throw new BadRequestException('This bulk operation has already been executed.');
    if (Date.now() - operation.createdAt.getTime() > AdminBulkOperationsService.PREVIEW_TTL_MS) {
      await this.prisma.adminBulkOperation.update({ where: { id: operation.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Bulk preview expired. Create a new preview.');
    }

    await this.prisma.adminBulkOperation.update({ where: { id: operation.id }, data: { status: 'RUNNING' } });
    const input = (operation.input ?? {}) as Record<string, unknown>;
    const targetIds = Array.isArray(operation.targetIds) ? operation.targetIds.filter((id): id is string => typeof id === 'string') : [];
    const results: Array<{ targetId: string; success: boolean; error?: string }> = [];

    for (const targetId of targetIds) {
      try {
        const validation = await this.validateTarget(operation.action as AdminBulkAction, targetId, input);
        if (!validation.eligible) {
          results.push({ targetId, success: false, error: validation.reason ?? 'Target is no longer eligible.' });
          continue;
        }
        await this.apply(operation.action as AdminBulkAction, targetId, input, adminId, adminRole);
        results.push({ targetId, success: true });
      } catch (error) {
        results.push({ targetId, success: false, error: this.safeError(error) });
      }
    }

    const succeeded = results.filter((item) => item.success).length;
    const failed = results.length - succeeded;
    const status = failed === 0 ? 'COMPLETED' : succeeded === 0 ? 'FAILED' : 'PARTIAL';
    const updated = await this.prisma.adminBulkOperation.update({
      where: { id: operation.id },
      data: { status, result: { results, succeeded, failed }, executedAt: new Date() },
      select: { id: true, action: true, status: true, result: true, reason: true, executedAt: true },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'admin_bulk_operation',
      targetId: operation.id,
      action: 'admin.bulk.execute',
      after: { action: operation.action, status, succeeded, failed },
      reason: operation.reason,
    });
    return updated;
  }

  async get(adminId: string, operationId: string) {
    const operation = await this.prisma.adminBulkOperation.findFirst({
      where: { id: operationId, adminId },
      select: { id: true, action: true, status: true, targetIds: true, preview: true, result: true, reason: true, createdAt: true, executedAt: true },
    });
    if (!operation) throw new NotFoundException('Bulk operation not found.');
    return operation;
  }

  private validateInput(dto: AdminBulkOperationDto) {
    if (dto.action === 'workspace.feature_flag' && (dto.flag === undefined || dto.enabled === undefined)) {
      throw new BadRequestException('Feature-flag bulk actions require flag and enabled.');
    }
    if (dto.action === 'user.plan_override' && dto.plan === undefined && dto.planExpiresAt === undefined && dto.subscriptionStatus === undefined) {
      throw new BadRequestException('Plan override bulk actions require at least one override field.');
    }
  }

  private async validateTarget(action: AdminBulkAction, targetId: string, input: AdminBulkOperationDto | Record<string, unknown>): Promise<PreviewItem> {
    if (action === 'workspace.archive' || action === 'workspace.restore') {
      const workspace = await this.prisma.workspace.findUnique({ where: { id: targetId }, select: { archivedAt: true } });
      if (!workspace) return { targetId, eligible: false, reason: 'Workspace not found.' };
      if (action === 'workspace.archive' && workspace.archivedAt) return { targetId, eligible: false, reason: 'Workspace is already archived.' };
      if (action === 'workspace.restore' && !workspace.archivedAt) return { targetId, eligible: false, reason: 'Workspace is not archived.' };
      return { targetId, eligible: true };
    }
    if (action === 'workspace.feature_flag') {
      const workspace = await this.prisma.workspace.findUnique({ where: { id: targetId }, select: { id: true } });
      return workspace ? { targetId, eligible: true } : { targetId, eligible: false, reason: 'Workspace not found.' };
    }
    if (action === 'user.plan_override') {
      const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      return user ? { targetId, eligible: true } : { targetId, eligible: false, reason: 'User not found.' };
    }
    const subscriptionId = targetId;
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ razorpaySubscriptionId: subscriptionId }, { stripeSubscriptionId: subscriptionId }] },
      select: { id: true },
    });
    return user ? { targetId, eligible: true } : { targetId, eligible: false, reason: 'No user owns this subscription.' };
  }

  private async apply(action: AdminBulkAction, targetId: string, input: Record<string, unknown>, adminId: string, adminRole: AdminRole) {
    const reason = typeof input.reason === 'string' ? input.reason : undefined;
    switch (action) {
      case 'workspace.archive': return this.actions.archiveWorkspace(adminId, adminRole, targetId, reason);
      case 'workspace.restore': return this.actions.restoreWorkspace(adminId, adminRole, targetId, reason);
      case 'workspace.feature_flag': return this.actions.toggleFeatureFlag(adminId, adminRole, targetId, {
        flag: String(input.flag), enabled: Boolean(input.enabled), reason,
      });
      case 'user.plan_override': return this.actions.overridePlan(adminId, adminRole, targetId, {
        plan: input.plan as PlanOverrideDto['plan'],
        planExpiresAt: typeof input.planExpiresAt === 'string' ? input.planExpiresAt : undefined,
        subscriptionStatus: input.subscriptionStatus as PlanOverrideDto['subscriptionStatus'],
        reason,
      });
      case 'subscription.sync': return this.billing.syncSubscription(adminId, adminRole, {
        subscriptionId: targetId,
        provider: input.provider as SyncSubscriptionDto['provider'],
        reason,
      });
    }
  }

  private safeInput(dto: AdminBulkOperationDto) {
    return {
      flag: dto.flag,
      enabled: dto.enabled,
      plan: dto.plan,
      planExpiresAt: dto.planExpiresAt,
      subscriptionStatus: dto.subscriptionStatus,
      provider: dto.provider,
      reason: dto.reason,
    };
  }

  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Operation failed.';
    return message.replace(/[\r\n]+/g, ' ').slice(0, 180);
  }
}
