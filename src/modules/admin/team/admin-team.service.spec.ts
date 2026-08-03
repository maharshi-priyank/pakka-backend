import { BadRequestException } from '@nestjs/common';
import { AdminRole, AdminUserStatus } from '@prisma/client';
import { AdminTeamService } from './admin-team.service';

describe('AdminTeamService', () => {
  const target = {
    id: 'admin-2',
    email: 'support@example.com',
    name: 'Support',
    role: AdminRole.SUPERADMIN,
    status: AdminUserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    suspendedAt: null,
    mustChangePassword: false,
  };

  function makeService() {
    const prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(target),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...target, role: AdminRole.SUPPORT }),
      },
      adminSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'session-1', adminId: target.id, revokedAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'session-1', revokedAt: new Date() }),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return { service: new AdminTeamService(prisma as never, audit as never), prisma, audit };
  }

  it('prevents demoting the last active superadmin', async () => {
    const { service, prisma } = makeService();
    prisma.adminUser.count.mockResolvedValue(1);
    await expect(service.updateRole('admin-1', AdminRole.SUPERADMIN, target.id, { role: AdminRole.SUPPORT, reason: 'handoff' })).rejects.toThrow(BadRequestException);
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it('suspends an account and revokes its sessions with an audit event', async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.suspend('admin-1', AdminRole.SUPERADMIN, target.id, { reason: 'access review' });
    expect(result).toBeTruthy();
    expect(prisma.adminUser.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: target.id }, data: expect.objectContaining({ status: AdminUserStatus.SUSPENDED, suspensionReason: 'access review' }) }));
    expect(prisma.adminSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { adminId: target.id, revokedAt: null } }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.team.suspend', targetId: target.id }));
  });

  it('revokes only the requested session', async () => {
    const { service, prisma } = makeService();
    await service.revokeSession('admin-1', AdminRole.SUPERADMIN, target.id, 'session-1', { reason: 'device removed' });
    expect(prisma.adminSession.findFirst).toHaveBeenCalledWith({ where: { id: 'session-1', adminId: target.id }, select: { id: true, adminId: true, revokedAt: true } });
    expect(prisma.adminSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-1' } }));
  });
});
