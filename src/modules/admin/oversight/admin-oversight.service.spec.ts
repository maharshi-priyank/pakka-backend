import { Test, TestingModule } from '@nestjs/testing';
import { AdminOversightService } from './admin-oversight.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { Plan } from '@prisma/client';

describe('AdminOversightService', () => {
  let service: AdminOversightService;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    prisma = {
      workspace: {
        count: jest.fn().mockImplementation(async (args?: { where?: { archivedAt?: unknown } }) =>
          args?.where?.archivedAt ? 1 : 3,
        ),
        findMany: jest.fn().mockResolvedValue([
          { id: 'w1', name: 'W1', _count: { contracts: 2, invoices: 3, leads: 1, clients: 1 } },
          { id: 'w2', name: 'W2', _count: { contracts: 0, invoices: 0, leads: 0, clients: 0 } },
        ]),
      },
      user: {
        count: jest.fn().mockImplementation(async (args?: { where?: unknown }) =>
          args?.where ? 2 : 5,
        ),
        groupBy: jest.fn().mockResolvedValue([
          { plan: Plan.FREE, _count: { _all: 3 } },
          { plan: Plan.SOLO, _count: { _all: 2 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          { createdAt: new Date('2026-07-30T00:00:00Z') },
          { createdAt: new Date('2026-07-30T12:00:00Z') },
        ]),
      },
      billingEvent: {
        findMany: jest.fn().mockResolvedValue([
          { payload: { amount: 500 }, processedAt: new Date() },
          { payload: { amount: 900 }, processedAt: new Date() },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOversightService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminOversightService);
  });

  it('returns workspace totals (3 total, 2 active, 1 archived)', async () => {
    const m = await service.metrics();
    expect(m.workspaces).toEqual({ total: 3, active: 2, archived: 1 });
  });

  it('returns user totals and plan distribution', async () => {
    const m = await service.metrics();
    expect(m.users).toEqual({ total: 5, active: 2 });
    expect(m.planDistribution).toContainEqual({ plan: Plan.FREE, count: 3 });
    expect(m.planDistribution).toContainEqual({ plan: Plan.SOLO, count: 2 });
  });

  it('sums revenue from BillingEvent payloads (mrr, arr)', async () => {
    const m = await service.metrics();
    expect(m.revenue.mrr).toBe(1400);
    expect(m.revenue.arr).toBe(16800);
    expect(m.churn.cancelledInLast30d).toBe(1);
  });

  it('ranks top workspaces by entity count', async () => {
    const m = await service.metrics();
    expect(m.topWorkspacesByUsage[0]).toEqual({
      workspaceId: 'w1',
      name: 'W1',
      entityCount: 7,
    });
  });

  it('csv export includes header and headline metrics', async () => {
    const m = await service.metrics();
    const csv = service.csv(m);
    expect(csv.split('\n')[0]).toBe('metric,value');
    expect(csv).toContain('workspaces.total,3');
    expect(csv).toContain('plan.FREE,3');
  });
});
