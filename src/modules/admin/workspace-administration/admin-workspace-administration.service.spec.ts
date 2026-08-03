import { BadRequestException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminWorkspaceAdministrationService } from './admin-workspace-administration.service';

describe('AdminWorkspaceAdministrationService', () => {
  it('protects the workspace owner from removal', async () => {
    const prisma: any = {
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          userId: 'owner-1',
          workspaceId: 'workspace-1',
          role: 'OWNER',
          joinedAt: new Date(),
          user: { id: 'owner-1', name: 'Owner', email: 'owner@example.com', createdAt: new Date() },
          workspaceRole: { id: 'role-owner', key: 'OWNER', name: 'Owner' },
        }),
      },
    };
    const audit = { log: jest.fn() };
    const service = new AdminWorkspaceAdministrationService(prisma, audit as any);

    await expect(service.removeMember('admin-1', AdminRole.SUPERADMIN, 'workspace-1', 'owner-1', {})).rejects.toThrow(BadRequestException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
