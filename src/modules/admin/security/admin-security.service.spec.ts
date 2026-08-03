import { AdminSecurityService } from './admin-security.service';

describe('AdminSecurityService', () => {
  it('summarizes login outcomes without exposing credentials', async () => {
    const prisma = {
      adminSecurityEvent: {
        count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(3),
        findMany: jest.fn().mockResolvedValueOnce([{ email: 'failed@example.com', at: new Date() }]).mockResolvedValueOnce([{ email: 'failed@example.com' }]),
      },
    } as any;
    const result = await new AdminSecurityService(prisma).overview({});
    expect(result.counts).toEqual({ total: 5, failures: 2, successes: 3 });
    expect(result.failedAttemptsLast24h).toBe(1);
    expect(result.dataQuality.historicalBeforePhase3Available).toBe(false);
  });
});
