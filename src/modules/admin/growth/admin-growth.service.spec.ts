import { BadRequestException } from '@nestjs/common';
import { AdminGrowthService } from './admin-growth.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AdminGrowthService', () => {
  let service: AdminGrowthService;
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', email: 'one@example.com', name: 'One', createdAt: new Date('2026-08-01T01:00:00Z'), onboardingComplete: true, onboardingCompletedAt: new Date('2026-08-01T02:00:00Z'), subscriptionStatus: 'ACTIVE', plan: 'SOLO', acquisitionSource: 'linkedin', currency: 'INR', activeWorkspaceId: 'w1', activeWorkspace: { currency: 'INR' } },
          { id: 'u2', email: 'two@example.com', name: 'Two', createdAt: new Date('2026-08-01T03:00:00Z'), onboardingComplete: false, onboardingCompletedAt: null, subscriptionStatus: 'NONE', plan: 'FREE', acquisitionSource: 'unknown', currency: null, activeWorkspaceId: 'w2', activeWorkspace: { currency: null } },
        ]),
      },
      productEvent: {
        findMany: jest.fn().mockResolvedValue([
          { eventName: 'onboarding_completed', userId: 'u1', workspaceId: 'w1', occurredAt: new Date('2026-08-01T02:00:00Z'), source: 'backend', properties: {} },
          { eventName: 'session_started', userId: 'u1', workspaceId: 'w1', occurredAt: new Date('2026-08-01T03:00:00Z'), source: 'customer-app', properties: {} },
          { eventName: 'lead_created', userId: 'u1', workspaceId: 'w1', occurredAt: new Date('2026-08-01T04:00:00Z'), source: 'customer-app', properties: {} },
          { eventName: 'proposal_sent', userId: 'u1', workspaceId: 'w1', occurredAt: new Date('2026-08-01T05:00:00Z'), source: 'customer-app', properties: {} },
          { eventName: 'contract_signed', userId: 'u1', workspaceId: 'w1', occurredAt: new Date('2026-08-01T06:00:00Z'), source: 'backend', properties: {} },
        ]),
      },
      billingEvent: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'b1', eventType: 'subscription.charged', processedAt: new Date('2026-08-01T07:00:00Z'), payload: { amount: 149, currency: 'INR' } },
          { id: 'b2', eventType: 'subscription.charged', processedAt: new Date('2026-08-01T08:00:00Z'), payload: { amount: 20 } },
        ]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i1', amountPaid: 500, currency: 'INR', paidAt: new Date('2026-08-01T09:00:00Z') },
        ]),
      },
    };
    service = new AdminGrowthService(prisma as PrismaService);
  });

  it('returns deterministic funnel, activation, adoption, and currency-safe revenue signals', async () => {
    const result = await service.overview({ from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z', bucket: 'day' });

    expect(result.kpis).toMatchObject({ signups: 2, activatedUsers: 1, activationRate: 50, paidWorkspaces: 1 });
    expect(result.funnel[0]).toMatchObject({ key: 'lead_created', users: 1, rate: 50 });
    expect(result.adoption.find(item => item.eventName === 'proposal_sent')).toMatchObject({ events: 1, uniqueUsers: 1 });
    expect(result.revenueQuality.subscriptionCollections).toEqual([{ currency: 'INR', amount: 149, events: 1 }]);
    expect(result.revenueQuality.invoiceCollections).toEqual([{ currency: 'INR', amount: 500, invoices: 1 }]);
    expect(result.revenueQuality.dataQuality.eventsWithoutCurrency).toBe(1);
    expect(result.dataQuality.proxies).toEqual(expect.arrayContaining([expect.stringContaining('current active subscription state')]));
  });

  it('rejects inverted and oversized ranges', async () => {
    await expect(service.overview({ from: '2026-08-02', to: '2026-08-01' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.overview({ from: '2024-01-01', to: '2026-01-01' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns paginated segment descriptors without raw event payloads', async () => {
    const result = await service.segments({ from: '2026-08-01', to: '2026-08-02', segment: 'not_activated', page: 1, pageSize: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ userId: 'u2', activated: false });
    expect(result.items[0]).not.toHaveProperty('properties');
    expect(result.dataQuality.rawEventPayloadsExposed).toBe(false);
  });
});
