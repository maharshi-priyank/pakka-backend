import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminBillingService } from './admin-billing.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PAYMENT_PROVIDER } from '../../../modules/payments/payment-provider.interface';
import { StripeService } from '../../../modules/payments/stripe.service';

describe('AdminBillingService', () => {
  let service: AdminBillingService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let razorpay: { refund: jest.Mock; getSubscription: jest.Mock };
  let stripe: { refund: jest.Mock };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    razorpay = {
      refund: jest.fn().mockResolvedValue({ refundId: 'rp_r1', paymentId: 'pay_1', amount: 500, status: 'processed' }),
      getSubscription: jest.fn().mockResolvedValue({ subscriptionId: 'sub_1', planId: 'p', status: 'active', nextBillingDate: undefined }),
    };
    stripe = { refund: jest.fn().mockResolvedValue({ refundId: 're_1', paymentId: 'pi_1', amount: 500, status: 'succeeded' }) };
    prisma = {
      auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1', subscriptionStatus: 'NONE', razorpaySubscriptionId: 'sub_1', stripeSubscriptionId: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      billingEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'be1', eventType: 'SUBSCRIPTION_PAYMENT_SUCCESS', processedAt: new Date() }) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBillingService,
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENT_PROVIDER, useValue: razorpay },
        { provide: StripeService, useValue: stripe },
      ],
    }).compile();
    service = module.get(AdminBillingService);
  });

  it('AE6: refunds via Razorpay and audits (admin, payment, amount, time)', async () => {
    const res = await service.refund('admin-1', AdminRole.SUPERADMIN, { paymentId: 'pay_1', reason: 'disputed' });
    expect(res.refundId).toBe('rp_r1');
    expect(razorpay.refund).toHaveBeenCalledWith('pay_1', undefined, 'refund:admin-1:pay_1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', targetType: 'payment', targetId: 'pay_1', action: 'admin.billing.refund', reason: 'disputed',
    }));
  });

  it('KTD4: short-circuits a refund for an already-refunded payment (idempotent)', async () => {
    prisma.auditLog.findFirst.mockResolvedValueOnce({
      after: { refundId: 'rp_r1', amount: 500 },
      action: 'admin.billing.refund',
    });
    const res = await service.refund('admin-1', AdminRole.SUPERADMIN, { paymentId: 'pay_1' });
    expect(res.status).toBe('already_refunded');
    expect(razorpay.refund).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('routes to Stripe when provider=stripe', async () => {
    await service.refund('admin-1', AdminRole.SUPERADMIN, { paymentId: 'pi_1', provider: 'stripe' });
    expect(stripe.refund).toHaveBeenCalledWith('pi_1', undefined, 'refund:admin-1:pi_1');
    expect(razorpay.refund).not.toHaveBeenCalled();
  });

  it('sync-subscription reconciles user status and audits', async () => {
    const res = await service.syncSubscription('admin-1', AdminRole.SUPERADMIN, { subscriptionId: 'sub_1' });
    expect(res.subscriptionStatus).toBe('ACTIVE');
    expect(prisma.user.update).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.billing.sync_subscription' }));
  });

  it('sync-subscription throws on unknown subscription id', async () => {
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.syncSubscription('a', AdminRole.SUPERADMIN, { subscriptionId: 'nope' })).rejects.toThrow(NotFoundException);
  });

  it('replay-event audits the replay intent', async () => {
    const res = await service.replayEvent('admin-1', AdminRole.SUPERADMIN, { billingEventId: 'be1' });
    expect(res.replayed).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.billing.replay_event', targetId: 'be1' }));
  });
});
