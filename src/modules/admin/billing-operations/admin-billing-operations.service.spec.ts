import { AdminBillingOperationsService } from './admin-billing-operations.service';

describe('AdminBillingOperationsService', () => {
  it('returns sanitized provider-aware billing rows', async () => {
    const prisma: any = {
      billingEvent: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'event-1',
          eventType: 'subscription.charged',
          razorpayRef: 'pay_ref_1',
          workspaceId: 'workspace-1',
          payload: {
            event: 'subscription.charged',
            payload: {
              subscription: { entity: { id: 'sub_1', notes: { userId: 'user-1' } } },
              payment: { entity: { amount: 500, currency: 'INR' } },
            },
          },
          processedAt: new Date('2026-08-01T10:00:00.000Z'),
        }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1', email: 'user@example.com', activeWorkspaceId: 'workspace-1', razorpaySubscriptionId: 'sub_1', stripeSubscriptionId: null }]),
      },
      workspace: {
        findMany: jest.fn().mockResolvedValue([{ id: 'workspace-1', name: 'Demo workspace' }]),
      },
    };
    const service = new AdminBillingOperationsService(prisma);

    const result = await service.list({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z', page: 1, pageSize: 50 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      eventType: 'subscription.charged',
      provider: 'razorpay',
      userId: 'user-1',
      workspaceName: 'Demo workspace',
      subscriptionId: 'sub_1',
      amount: 500,
      currency: 'INR',
      replayable: true,
    });
    expect(result.items[0]).not.toHaveProperty('payload');
  });
});
