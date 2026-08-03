import { AdminBulkOperationsService } from './admin-bulk-operations.service';

describe('AdminBulkOperationsService', () => {
  it('creates a preview with eligible and skipped workspace targets', async () => {
    const prisma = {
      workspace: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.id === 'workspace-1' ? { archivedAt: null } : null)) },
      adminBulkOperation: { create: jest.fn().mockResolvedValue({ id: 'bulk-1', action: 'workspace.archive', status: 'PREVIEWED', targetIds: ['workspace-1', 'missing'], preview: [], reason: 'cleanup', createdAt: new Date() }) },
    } as any;
    const service = new AdminBulkOperationsService(prisma, { log: jest.fn() } as any, {} as any, {} as any);
    const result = await service.preview('admin-1', { action: 'workspace.archive', targetIds: ['workspace-1', 'missing'], reason: 'cleanup' });
    expect(result.eligible).toBe(1);
    expect(result.skipped).toBe(1);
    expect(prisma.adminBulkOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PREVIEWED' }) }));
  });
});
