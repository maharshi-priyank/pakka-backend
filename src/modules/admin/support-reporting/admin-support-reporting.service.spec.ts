import { AdminSupportReportingService } from './admin-support-reporting.service';

describe('AdminSupportReportingService', () => {
  it('returns explicit proxy metadata for an empty dataset', async () => {
    const prisma: any = {
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      workspace: { findMany: jest.fn().mockResolvedValue([]) },
      contact: { groupBy: jest.fn().mockResolvedValue([]) },
      project: { groupBy: jest.fn().mockResolvedValue([]) },
      proposal: { groupBy: jest.fn().mockResolvedValue([]) },
      contract: { groupBy: jest.fn().mockResolvedValue([]) },
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      task: { groupBy: jest.fn().mockResolvedValue([]) },
      billingEvent: { groupBy: jest.fn().mockResolvedValue([]) },
      adminSupportNote: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AdminSupportReportingService(prisma);

    const result = await service.overview({ inactiveDays: 30 });

    expect(result.kpis).toMatchObject({ totalUsers: 0, pendingOnboarding: 0, activationRate: 0, inactiveWorkspaces: 0 });
    expect(result.dataQuality).toMatchObject({ onboardingCompletionTimestampAvailable: false, loginTelemetryAvailable: false });
    expect(result.onboardingSeries.length).toBeGreaterThan(0);
  });
});
