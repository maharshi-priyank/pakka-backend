import { AdminBusinessIntelligenceService } from './admin-business-intelligence.service';

describe('AdminBusinessIntelligenceService', () => {
  it('keeps collection totals separated by currency', async () => {
    const prisma = {
      billingEvent: { findMany: jest.fn().mockResolvedValue([
        { id: 'event-inr', eventType: 'SUBSCRIPTION_PAYMENT_SUCCESS', razorpayRef: 'r1', workspaceId: 'ws-1', payload: { amount: 1000, currency: 'INR' }, processedAt: new Date() },
        { id: 'event-usd', eventType: 'SUBSCRIPTION_PAYMENT_SUCCESS', razorpayRef: 'r2', workspaceId: 'ws-1', payload: { amount: 2500, currency: 'USD' }, processedAt: new Date() },
      ]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const result = await new AdminBusinessIntelligenceService(prisma).revenue({});
    expect(result.collections).toEqual(expect.arrayContaining([
      { currency: 'INR', amount: 1000, events: 1 },
      { currency: 'USD', amount: 2500, events: 1 },
    ]));
  });
});
