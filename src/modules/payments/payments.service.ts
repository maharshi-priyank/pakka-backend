import { Inject, Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Plan, SubscriptionStatus } from '@prisma/client';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.interface';
import { PlanResolutionService, type PlanTier } from './plan-resolution.service';
import type { CashfreeWebhookEvent } from './dto/webhook-event.dto';

type WebhookHandler = (event: CashfreeWebhookEvent) => Promise<void>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly handlers: Record<string, WebhookHandler>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planResolution: PlanResolutionService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {
    this.handlers = {
      SUBSCRIPTION_ACTIVATED:       this.onActivated.bind(this),
      SUBSCRIPTION_PAYMENT_SUCCESS:  this.onPaymentSuccess.bind(this),
      SUBSCRIPTION_PAYMENT_FAILED:   this.onPaymentFailed.bind(this),
      SUBSCRIPTION_CANCELLED:        this.onCancelled.bind(this),
      SUBSCRIPTION_PAUSED:           this.onPaused.bind(this),
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
      data:  { cashfreeSubscriptionId: subscriptionId },
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
        cashfreeSubscriptionId: true,
        cashfreePlanId: true,
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
      select: { cashfreeSubscriptionId: true, subscriptionStatus: true },
    });

    if (!user?.cashfreeSubscriptionId) throw new NotFoundException('No active subscription found');
    if (user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new ConflictException('Subscription is not active');
    }

    await this.provider.cancelSubscription(user.cashfreeSubscriptionId);

    await this.prisma.user.update({
      where: { id: userId },
      data:  { subscriptionStatus: SubscriptionStatus.CANCELLED },
    });

    return { message: 'Subscription cancelled. Access continues until end of billing period.' };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhookSignature(rawBody: Buffer, signature: string, timestamp: string): boolean {
    const secret = this.config.get<string>('cashfree.secretKey') ?? '';
    const signedPayload = timestamp + rawBody.toString();
    const computed = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('base64');
    return computed === signature;
  }

  async handleWebhook(event: CashfreeWebhookEvent, cashfreeRef: string): Promise<void> {
    // Idempotency: skip if already processed
    const alreadyProcessed = await this.prisma.billingEvent.findUnique({
      where: { cashfreeRef },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Duplicate webhook skipped: ${cashfreeRef}`);
      return;
    }

    // Record before processing to prevent race conditions
    await this.prisma.billingEvent.create({
      data: {
        eventType:   event.type,
        cashfreeRef,
        workspaceId: event.data.subscription.customer_details?.customer_id,
        payload:     event as object,
      },
    });

    const handler = this.handlers[event.type];
    if (handler) {
      await handler(event);
    } else {
      this.logger.debug(`Unhandled webhook event type: ${event.type}`);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async onActivated(event: CashfreeWebhookEvent): Promise<void> {
    const sub   = event.data.subscription;
    const userId = sub.customer_details?.customer_id;
    if (!userId) return;

    const planTier = sub.plan_id.includes('solo') ? Plan.SOLO : Plan.STUDIO;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan:                   planTier,
        subscriptionStatus:     SubscriptionStatus.ACTIVE,
        cashfreeSubscriptionId: sub.subscription_id,
        cashfreePlanId:         sub.plan_id,
        billingAnchorDate:      sub.next_payment_date ? new Date(sub.next_payment_date) : new Date(),
        planExpiresAt:          null,
      },
    });
  }

  private async onPaymentSuccess(event: CashfreeWebhookEvent): Promise<void> {
    const sub    = event.data.subscription;
    const userId = sub.customer_details?.customer_id;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        billingAnchorDate:  sub.next_payment_date ? new Date(sub.next_payment_date) : undefined,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });
  }

  private async onPaymentFailed(event: CashfreeWebhookEvent): Promise<void> {
    const sub    = event.data.subscription;
    const userId = sub.customer_details?.customer_id;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data:  { subscriptionStatus: SubscriptionStatus.PAST_DUE },
    });
  }

  private async onCancelled(event: CashfreeWebhookEvent): Promise<void> {
    const sub    = event.data.subscription;
    const userId = sub.customer_details?.customer_id;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: SubscriptionStatus.CANCELLED,
        plan:               Plan.FREE,
      },
    });
  }

  private async onPaused(event: CashfreeWebhookEvent): Promise<void> {
    const sub    = event.data.subscription;
    const userId = sub.customer_details?.customer_id;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data:  { subscriptionStatus: SubscriptionStatus.PAUSED },
    });
  }
}
