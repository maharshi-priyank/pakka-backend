import { Inject, Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Plan, SubscriptionStatus } from '@prisma/client';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.interface';
import { PlanResolutionService, type PlanTier } from './plan-resolution.service';
import type { RazorpayWebhookEvent } from './dto/webhook-event.dto';
import { ProductEventsService } from '../product-events/product-events.service';

type WebhookHandler = (event: RazorpayWebhookEvent) => Promise<void>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly handlers: Record<string, WebhookHandler>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planResolution: PlanResolutionService,
    private readonly productEvents: ProductEventsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {
    this.handlers = {
      'subscription.activated':  this.onActivated.bind(this),
      'subscription.charged':    this.onPaymentSuccess.bind(this),
      'subscription.halted':     this.onPaymentFailed.bind(this),
      'subscription.cancelled':  this.onCancelled.bind(this),
      'subscription.completed':  this.onCancelled.bind(this),
      'subscription.paused':     this.onPaused.bind(this),
    };
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async createSubscription(userId: string, tier: PlanTier) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { subscriptionStatus: true, email: true, name: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.subscriptionStatus === SubscriptionStatus.ACTIVE) {
      throw new ConflictException('You already have an active subscription');
    }

    const resolved     = await this.planResolution.resolve(tier);
    const frontendUrl  = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';

    const apiUrl = this.config.get<string>('apiUrl') ?? 'http://localhost:3000/api';
    const { checkoutUrl, subscriptionId } = await this.provider.createSubscription({
      userId,
      planId:        resolved.planId,
      returnUrl:     `${apiUrl}/payments/subscription-return`,
      cancelUrl:     `${apiUrl}/payments/subscription-cancel`,
      customerEmail: user.email,
      customerName:  user.name,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data:  { razorpaySubscriptionId: subscriptionId },
    });

    return { checkoutUrl };
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        plan: true,
        subscriptionStatus: true,
        razorpaySubscriptionId: true,
        razorpayPlanId: true,
        billingAnchorDate: true,
        planExpiresAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async currentPricing() {
    return this.planResolution.currentPricing();
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancelSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { razorpaySubscriptionId: true, subscriptionStatus: true },
    });

    if (!user?.razorpaySubscriptionId) throw new NotFoundException('No active subscription found');
    if (user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new ConflictException('Subscription is not active');
    }

    await this.provider.cancelSubscription(user.razorpaySubscriptionId);

    await this.prisma.user.update({
      where: { id: userId },
      data:  { subscriptionStatus: SubscriptionStatus.CANCELLED },
    });

    return { message: 'Subscription cancelled. Access continues until end of billing period.' };
  }

  // ── Checkout-time signature verification ───────────────────────────────────
  // For immediate UX feedback only — the webhook (below) remains the source
  // of truth for actually updating plan/subscriptionStatus, so a duplicate or
  // delayed webhook can't cause inconsistent state with this check.

  verifySubscriptionPayment(dto: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }): { verified: boolean } {
    const secret = this.config.get<string>('razorpay.keySecret') ?? '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${dto.razorpay_payment_id}|${dto.razorpay_subscription_id}`)
      .digest('hex');

    const verified =
      expected.length === dto.razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(dto.razorpay_signature));

    if (!verified) {
      this.logger.warn(`Subscription payment signature mismatch for ${dto.razorpay_subscription_id}`);
    }
    return { verified };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('razorpay.webhookSecret') ?? '';
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return computed.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  }

  async handleWebhook(event: RazorpayWebhookEvent, razorpayRef: string): Promise<void> {
    // Idempotency: skip if already processed
    const alreadyProcessed = await this.prisma.billingEvent.findUnique({
      where: { razorpayRef },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Duplicate webhook skipped: ${razorpayRef}`);
      return;
    }

    // Record before processing to prevent race conditions
    await this.prisma.billingEvent.create({
      data: {
        eventType:   event.event,
        razorpayRef,
        workspaceId: event.payload.subscription?.entity.notes?.userId as string | undefined,
        payload:     event as object,
      },
    });

    const productEventName = {
      'subscription.activated': 'subscription_activated',
      'subscription.charged': 'subscription_payment_succeeded',
      'subscription.halted': 'subscription_payment_failed',
      'subscription.cancelled': 'subscription_cancelled',
      'subscription.completed': 'subscription_cancelled',
      'subscription.paused': 'subscription_paused',
    }[event.event] as Parameters<ProductEventsService['recordServerEvent']>[0]['eventName'] | undefined;
    const userId = event.payload.subscription?.entity.notes?.userId as string | undefined;
    if (productEventName && userId) {
      void this.productEvents.recordServerEvent({
        userId,
        workspaceId: userId,
        eventName: productEventName,
        idempotencyKey: `billing:${razorpayRef}:${event.event}`,
      }).catch(error => this.productEvents.logWriteFailure(error, productEventName));
    }

    const handler = this.handlers[event.event];
    if (handler) {
      await handler(event);
    } else {
      this.logger.debug(`Unhandled webhook event type: ${event.event}`);
    }
  }

  async replayStoredEvent(event: RazorpayWebhookEvent): Promise<void> {
    const handler = this.handlers[event.event];
    if (!handler) throw new ConflictException(`Unsupported Razorpay event: ${event.event}`);
    await handler(event);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async onActivated(event: RazorpayWebhookEvent): Promise<void> {
    const sub    = event.payload.subscription?.entity;
    const userId = sub?.notes?.userId as string | undefined;
    if (!sub || !userId) return;

    const planTier = sub.plan_id.toLowerCase().includes('solo') ? Plan.SOLO : Plan.STUDIO;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan:                   planTier,
        subscriptionStatus:     SubscriptionStatus.ACTIVE,
        razorpaySubscriptionId: sub.id,
        razorpayPlanId:         sub.plan_id,
        billingAnchorDate:      sub.charge_at ? new Date(sub.charge_at * 1000) : new Date(),
        planExpiresAt:          null,
      },
    });
  }

  private async onPaymentSuccess(event: RazorpayWebhookEvent): Promise<void> {
    const sub    = event.payload.subscription?.entity;
    const userId = sub?.notes?.userId as string | undefined;
    if (!sub || !userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        billingAnchorDate:  sub.charge_at ? new Date(sub.charge_at * 1000) : undefined,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });
  }

  private async onPaymentFailed(event: RazorpayWebhookEvent): Promise<void> {
    const sub    = event.payload.subscription?.entity;
    const userId = sub?.notes?.userId as string | undefined;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data:  { subscriptionStatus: SubscriptionStatus.PAST_DUE },
    });
  }

  private async onCancelled(event: RazorpayWebhookEvent): Promise<void> {
    const sub    = event.payload.subscription?.entity;
    const userId = sub?.notes?.userId as string | undefined;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: SubscriptionStatus.CANCELLED,
        plan:               Plan.FREE,
      },
    });
  }

  private async onPaused(event: RazorpayWebhookEvent): Promise<void> {
    const sub    = event.payload.subscription?.entity;
    const userId = sub?.notes?.userId as string | undefined;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data:  { subscriptionStatus: SubscriptionStatus.PAUSED },
    });
  }
}
