import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Plan, SubscriptionStatus, AdminRole } from '@prisma/client';
import { AdminActionsService } from './admin-actions.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AdminActionsService', () => {
  let service: AdminActionsService;
  let prisma: any;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          plan: Plan.FREE,
          planExpiresAt: null,
          subscriptionStatus: SubscriptionStatus.NONE,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      workspace: {
        findUnique: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          name: 'W',
          archivedAt: where.id === 'archived' ? new Date('2026-07-01') : null,
        })),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminActionsService,
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminActionsService);
  });

  it('AE4: extends planExpiresAt 30d, audits before/after with reason', async () => {
    const future = new Date(Date.now() + 30 * 86400_000);
    prisma.user.findUnique
      .mockResolvedValueOnce({ plan: Plan.FREE, planExpiresAt: null, subscriptionStatus: SubscriptionStatus.NONE })
      .mockResolvedValueOnce({ plan: Plan.FREE, planExpiresAt: future, subscriptionStatus: SubscriptionStatus.NONE });
    const res = await service.overridePlan('admin-1', AdminRole.SUPERADMIN, 'u1', {
      planExpiresAt: future.toISOString(),
      reason: 'support: extend 30d',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { planExpiresAt: expect.any(Date) },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      targetId: 'u1',
      action: 'admin.plan.override',
      reason: 'support: extend 30d',
    }));
    expect(res!.planExpiresAt).toEqual(future);
  });

  it('throws on unknown user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.overridePlan('a', AdminRole.SUPERADMIN, 'x', { plan: Plan.SOLO }))
      .rejects.toThrow(NotFoundException);
  });

  it('throws when no override fields supplied', async () => {
    await expect(service.overridePlan('a', AdminRole.SUPERADMIN, 'u1', {}))
      .rejects.toThrow(BadRequestException);
  });

  it('AE7: archives a workspace (sets archivedAt), recoverable, audited', async () => {
    const archivedAt = new Date();
    prisma.workspace.findUnique
      .mockResolvedValueOnce({ id: 'w1', name: 'W1', archivedAt: null })
      .mockResolvedValueOnce({ archivedAt });
    const res = await service.archiveWorkspace('admin-1', AdminRole.SUPERADMIN, 'w1', 'fraud');
    expect(res!.archivedAt).toBeInstanceOf(Date);
    expect(prisma.workspace.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { archivedAt: expect.any(Date) } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin.workspace.archive', targetId: 'w1', reason: 'fraud',
    }));
  });

  it('AE7: restore clears archivedAt and audits', async () => {
    prisma.workspace.findUnique.mockResolvedValueOnce({ id: 'w1', archivedAt: new Date() });
    const res = await service.restoreWorkspace('admin-1', AdminRole.SUPERADMIN, 'w1');
    expect(res!.archivedAt).toBeNull();
    expect(prisma.workspace.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { archivedAt: null } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.workspace.restore' }));
  });

  it('archive refuses an already-archived workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValueOnce({ id: 'w1', archivedAt: new Date() });
    await expect(service.archiveWorkspace('a', AdminRole.SUPERADMIN, 'w1')).rejects.toThrow(BadRequestException);
  });
});
