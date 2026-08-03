import { BadRequestException } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = {
      user: {
        count: jest.fn().mockImplementation((args?: { where?: Record<string, unknown> }) => {
          if (!args?.where) return 10;
          if (args.where.onboardingComplete) return 6;
          if (args.where.subscriptionStatus === 'ACTIVE') return 3;
          if (args.where.subscriptionStatus === 'CANCELLED') return 1;
          return 0;
        }),
        findMany: jest.fn().mockResolvedValue([
          { createdAt: new Date('2026-08-01T04:00:00Z'), onboardingComplete: true },
          { createdAt: new Date('2026-08-01T12:00:00Z'), onboardingComplete: false },
        ]),
        groupBy: jest.fn().mockImplementation((args: { by: string[] }) =>
          args.by[0] === 'plan'
            ? [{ plan: 'FREE', _count: { _all: 7 } }, { plan: 'SOLO', _count: { _all: 3 } }]
            : [{ subscriptionStatus: 'ACTIVE', _count: { _all: 3 } }, { subscriptionStatus: 'NONE', _count: { _all: 7 } }],
        ),
      },
      workspace: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockImplementation((args: { select?: { _count?: unknown } }) =>
          args.select?._count
            ? [{ id: 'w1', name: 'Alpha', _count: { members: 4 } }, { id: 'w2', name: 'Beta', _count: { members: 2 } }]
            : [{ createdAt: new Date('2026-08-01T03:00:00Z') }],
        ),
      },
      contact: {
        count: jest.fn().mockResolvedValue(8),
        aggregate: jest.fn().mockResolvedValue({ _sum: { dealValue: 125000 } }),
        findMany: jest.fn().mockImplementation((args: { where?: { archivedAt?: null } }) =>
          args.where?.archivedAt === null
            ? [{ stage: 'ENQUIRY', dealValue: 50000 }, { stage: 'CLIENT', dealValue: 75000 }]
            : [{ createdAt: new Date('2026-08-01T05:00:00Z') }],
        ),
        groupBy: jest.fn().mockResolvedValue([{ workspaceId: 'w1', _count: { _all: 3 } }]),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date('2026-08-01T06:00:00Z') }]),
        groupBy: jest.fn().mockResolvedValue([{ workspaceId: 'w1', _count: { _all: 2 } }]),
      },
      proposal: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date('2026-08-01T07:00:00Z'), status: 'SENT', totalAmount: 80000 }]),
        groupBy: jest.fn().mockResolvedValue([{ workspaceId: 'w1', _count: { _all: 1 } }]),
      },
      contract: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date('2026-08-01T08:00:00Z'), status: 'SIGNED' }]),
        groupBy: jest.fn().mockResolvedValue([{ workspaceId: 'w1', _count: { _all: 1 } }]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date('2026-08-01T09:00:00Z'), status: 'PAID', total: 80000 }]),
        groupBy: jest.fn().mockResolvedValue([{ workspaceId: 'w1', _count: { _all: 1 } }]),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date('2026-08-01T10:00:00Z') }]),
        groupBy: jest.fn().mockResolvedValue([{ workspaceId: 'w1', _count: { _all: 5 } }]),
      },
      billingEvent: {
        findMany: jest.fn().mockResolvedValue([
          { processedAt: new Date('2026-08-01T11:00:00Z'), payload: { amount: 1500, currency: 'INR' } },
          { processedAt: new Date('2026-08-01T12:00:00Z'), payload: { amount: '20', currency: 'USD' } },
          { processedAt: new Date('2026-08-01T13:00:00Z'), payload: { amount: 10 } },
        ]),
      },
    };
    service = new AdminAnalyticsService(prisma as PrismaService);
  });

  it('normalizes auto buckets based on range length', () => {
    const resolveRange = (service as any).resolveRange.bind(service);
    expect(resolveRange({ from: '2026-08-01', to: '2026-08-08', bucket: 'auto' }).bucket).toBe('day');
    expect(resolveRange({ from: '2026-05-05', to: '2026-08-01', bucket: 'auto' }).bucket).toBe('week');
    expect(resolveRange({ from: '2025-08-01', to: '2026-08-01', bucket: 'auto' }).bucket).toBe('month');
  });

  it('rejects inverted and oversized date ranges', () => {
    const resolveRange = (service as any).resolveRange.bind(service);
    expect(() => resolveRange({ from: '2026-08-02', to: '2026-08-01', bucket: 'auto' })).toThrow(BadRequestException);
    expect(() => resolveRange({ from: '2024-01-01', to: '2026-01-01', bucket: 'auto' })).toThrow(BadRequestException);
  });

  it('returns filled series, breakdowns, top workspace activity, and billing quality data', async () => {
    const result = await service.overview({ from: '2026-08-01', to: '2026-08-02', bucket: 'day' });

    expect(result.kpis).toMatchObject({
      totalUsers: 10,
      newUsers: 2,
      onboardedUsers: 6,
      totalWorkspaces: 5,
      newWorkspaces: 1,
      activeSubscriptions: 3,
      cancelledSubscriptions: 1,
      totalContacts: 8,
      pipelineValue: 125000,
    });
    expect(result.series.growth).toHaveLength(1);
    expect(result.series.growth[0]).toMatchObject({ newUsers: 2, onboardedNewUsers: 1, newWorkspaces: 1 });
    expect(result.series.productCreation[0]).toMatchObject({ contacts: 1, projects: 1, proposals: 1, contracts: 1, invoices: 1, tasks: 1 });
    expect(result.series.billing[0].currencies).toEqual({ INR: { amount: 1500, events: 1 }, USD: { amount: 20, events: 1 } });
    expect(result.dataQuality).toMatchObject({ billingEventsRead: 3, billingEventsWithoutAmount: 0, billingEventsWithoutCurrency: 1 });
    expect(result.topWorkspaces[0]).toMatchObject({ workspaceId: 'w1', activityScore: 13 });
    expect(result.breakdowns.contacts).toContainEqual({ key: 'ENQUIRY', count: 1, value: 50000 });
  });

  it('escapes CSV values', async () => {
    const result = await service.overview({ from: '2026-08-01', to: '2026-08-02', bucket: 'day' });
    const csv = service.csv({ ...result, topWorkspaces: [{ ...result.topWorkspaces[0], name: 'Alpha, Inc.' }] });
    expect(csv).toContain('"Alpha, Inc."');
    expect(csv.split('\n')[0]).toBe('section,metric,period,dimension,value');
  });
});
