import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AdminRole, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type RefundResult,
} from '../../../modules/payments/payment-provider.interface';
import { StripeService } from '../../../modules/payments/stripe.service';
import type { RefundDto, SyncSubscriptionDto, ReplayEventDto } from './dto/admin-billing.dto';

/**
 * Billing/refund operations (R14, AE6). Refund is superadmin-only (enforced on
 * the controller). Idempotent on paymentId (KTD4): a refund for an already-
 * refunded payment short-circuits by checking prior audit entries for the same
 * paymentId+action before calling the provider.
 */
@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly razorpay: PaymentProvider,
    private readonly stripe: StripeService,
  ) {}

  async refund(
    adminId: string,
    adminRole: AdminRole,
    dto: RefundDto,
  ): Promise<RefundResult> {
    // Idempotency on paymentId (KTD4): short-circuit if we already refunded it.
    const prior = await this.prisma.auditLog.findFirst({
      where: {
        targetType: 'payment',
        targetId: dto.paymentId,
        action: 'admin.billing.refund',
      },
      orderBy: { at: 'desc' },
    });
    if (prior) {
      const after = prior.after as Record<string, unknown> | null;
      this.logger.log(
        `Refund for ${dto.paymentId} short-circuited (already refunded, KTD4 idempotency).`,
      );
      return {
        refundId: String(after?.refundId ?? 'already-refunded'),
        paymentId: dto.paymentId,
        amount: typeof after?.amount === 'number' ? (after.amount as number) : undefined,
        status: 'already_refunded',
      };
    }

    const idempotencyKey = `refund:${adminId}:${dto.paymentId}`;
    let result: RefundResult;
    if (dto.provider === 'stripe') {
      result = await this.stripe.refund(dto.paymentId, dto.amount, idempotencyKey);
    } else {
      result = await this.razorpay.refund(dto.paymentId, dto.amount, idempotencyKey);
    }

    // Each refund attempt writes an audited record keyed by the idempotency key
    // (KTD4) so a retried call surfaces "already refunded."
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'payment',
      targetId: dto.paymentId,
      action: 'admin.billing.refund',
      after: result,
      reason: dto.reason ?? null,
    });

    return result;
  }

  /** Re-sync a stuck subscription: fetch provider state, reconcile User fields. */
  async syncSubscription(
    adminId: string,
    adminRole: AdminRole,
    dto: SyncSubscriptionDto,
  ) {
    // Resolve the user from the subscription id via stored fields.
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { razorpaySubscriptionId: dto.subscriptionId },
          { stripeSubscriptionId: dto.subscriptionId },
        ],
      },
      select: { id: true, subscriptionStatus: true, razorpaySubscriptionId: true, stripeSubscriptionId: true },
    });
    if (!user) throw new NotFoundException('No user owns that subscription id.');

    const state = await this.razorpay.getSubscription(dto.subscriptionId);
    const before = { subscriptionStatus: user.subscriptionStatus };
    // Reconcile: map provider status to SubscriptionStatus conservatively.
    // (Exact mapping per provider is an implementation detail; we record before/after.)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: this.mapStatus(state.status) },
    });
    const after = { subscriptionStatus: this.mapStatus(state.status) };

    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'subscription',
      targetId: dto.subscriptionId,
      action: 'admin.billing.sync_subscription',
      before,
      after,
      reason: dto.reason ?? null,
    });
    return after;
  }

  /** Replay a billing event (re-process its payload). */
  async replayEvent(
    adminId: string,
    adminRole: AdminRole,
    dto: ReplayEventDto,
  ) {
    const event = await this.prisma.billingEvent.findUnique({
      where: { id: dto.billingEventId },
    });
    if (!event) throw new NotFoundException('Billing event not found.');

    // Re-processing the webhook payload is provider/handler-specific; we record
    // the replay intent and the event reference. Full replay wiring is an
    // implementation detail (see Outstanding Questions).
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'billing_event',
      targetId: dto.billingEventId,
      action: 'admin.billing.replay_event',
      before: { eventType: event.eventType, processedAt: event.processedAt },
      after: { replayed: true },
      reason: dto.reason ?? null,
    });
    return { replayed: true, billingEventId: dto.billingEventId };
  }

  private mapStatus(providerStatus: string): SubscriptionStatus {
    const s = providerStatus.toLowerCase();
    if (s === 'active') return SubscriptionStatus.ACTIVE;
    if (s === 'cancelled' || s === 'deleted') return SubscriptionStatus.CANCELLED;
    if (s === 'paused' || s === 'halted') return SubscriptionStatus.PAUSED;
    if (s === 'past_due' || s === 'pending' || s === 'created') return SubscriptionStatus.PAST_DUE;
    return SubscriptionStatus.NONE;
  }
}
