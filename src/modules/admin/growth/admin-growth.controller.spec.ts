import { AdminRole } from '@prisma/client';
import { AdminGrowthController } from './admin-growth.controller';
import { AdminGrowthService } from './admin-growth.service';
import { AuditService } from '../audit/audit.service';

describe('AdminGrowthController', () => {
  it('exports a safe report and records the export without raw report data', async () => {
    const growth = {
      csv: jest.fn().mockResolvedValue('section,key,value\noverview,signups,3'),
    } as unknown as AdminGrowthService;
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const controller = new AdminGrowthController(growth, audit);

    const csv = await controller.export(
      { id: 'admin-1', role: AdminRole.SUPERADMIN },
      {
        report: 'overview',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-03T00:00:00.000Z',
        provider: 'all',
      },
    );

    expect(csv).toContain('overview,signups,3');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      adminRole: AdminRole.SUPERADMIN,
      action: 'growth.export',
      targetType: 'growth_report',
      after: expect.objectContaining({ rowCount: 1, report: 'overview' }),
    }));
    expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({
      after: expect.objectContaining({ csv }),
    }));
  });
});
