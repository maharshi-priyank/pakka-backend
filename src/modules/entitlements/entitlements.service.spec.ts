import { EntitlementsService } from './entitlements.service';

describe('EntitlementsService', () => {
  it('rejects a Free account at the client limit', async () => {
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ billingOwnerId: 'owner-1' }), findMany: jest.fn().mockResolvedValue([{ id: 'ws-1' }]) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner-1', plan: 'FREE', planExpiresAt: null, subscriptionStatus: 'NONE' }) },
      contact: { count: jest.fn().mockResolvedValue(5) },
      project: { count: jest.fn().mockResolvedValue(0) },
      workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
      attachment: { aggregate: jest.fn().mockResolvedValue({ _sum: { fileSize: 0 } }) },
    } as any;
    const service = new EntitlementsService(prisma);
    await expect(service.assertWithinLimit('ws-1', 'clients')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PLAN_LIMIT' }) });
  });

  it('aggregates usage across all workspaces owned by the account', async () => {
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ billingOwnerId: 'owner-1' }), findMany: jest.fn().mockResolvedValue([{ id: 'ws-1' }, { id: 'ws-2' }]) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner-1', plan: 'SOLO', planExpiresAt: null, subscriptionStatus: 'ACTIVE' }) },
      contact: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(7) },
      project: { count: jest.fn().mockResolvedValue(4) },
      workspaceMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'member-1' }, { userId: 'member-2' }]) },
      attachment: { aggregate: jest.fn().mockResolvedValue({ _sum: { fileSize: 2048 } }) },
    } as any;
    const service = new EntitlementsService(prisma);
    const summary = await service.getUsage('ws-1');
    expect(summary.usage).toEqual({ clients: 3, projects: 4, activeLeads: 7, teamMembers: 2, storageBytes: 2048 });
    expect(prisma.contact.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: { in: ['ws-1', 'ws-2'] } }) }));
  });
});
