import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { Plan, SubscriptionStatus } from '@prisma/client';
import { PlanResolutionService, type PlanTier } from './plan-resolution.service';

// USD prices (cents) for international billing
const USD_PRICES: Record<PlanTier, Record<string, number>> = {
  SOLO:   { founding: 500,  earlyaccess: 700,  regular: 900  },
  STUDIO: { founding: 1200, earlyaccess: 1700, regular: 2200 },
};

interface SubMetadata { userId?: string; tier?: string; window?: string }

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: ReturnType<typeof Stripe>;

  constructor(
    private readonly config:         ConfigService,
    private readonly prisma:         PrismaService,
    private readonly planResolution: PlanResolutionService,
  ) {
    const secretKey = this.config.get<string>('stripe.secretKey') ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new (Stripe as any)(secretKey) as ReturnType<typeof Stripe>;
  }

  // ── Checkout Session ───────────────────────────────────────────────────────

  async createCheckoutSession(userId: string, tier: PlanTier): Promise<{ checkoutUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, name: true, stripeCustomerId: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const resolved    = await this.planResolution.resolve(tier);
    const frontendUrl = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';
    const apiUrl      = this.config.get<string>('apiUrl')      ?? 'http://localhost:3000/api';
    const unitAmount  = USD_PRICES[tier][resolved.window];

    let customerId = user.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await this.client.customers.create({
        email:    user.email,
        name:     user.name ?? undefined,
        metadata: { userId },
      });
      customerId = customer.id;
      await this.prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
    }

    const session = await this.client.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items: [{
        price_data: {
          currency:    'usd',
          unit_amount: unitAmount,
          recurring:   { interval: 'month' },
          product_data: {
            name:     tier === 'SOLO' ? 'Rupway Solo' : 'Rupway Studio',
            metadata: { tier, window: resolved.window },
          },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: { userId, tier, window: resolved.window },
      },
      success_url: `${apiUrl}/payments/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${frontendUrl}/billing/cancelled`,
    });

    return { checkoutUrl: session.url! };
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyAndParseWebhook(rawBody: Buffer, signature: string): { type: string; id: string; data: { object: Record<string, unknown> } } {
    const secret = this.config.get<string>('stripe.webhookSecret') ?? '';
    try {
      return this.client.webhooks.constructEvent(rawBody, signature, secret) as unknown as { type: string; id: string; data: { object: Record<string, unknown> } };
    } catch {
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }
  }

  async handleWebhookEvent(event: { type: string; id: string; data: { object: Record<string, unknown> } }): Promise<void> {
    const existing = await this.prisma.billingEvent.findUnique({ where: { cashfreeRef: event.id } });
    if (existing) {
      this.logger.debug(`Duplicate Stripe event skipped: ${event.id}`);
      return;
    }

    await this.prisma.billingEvent.create({
      data: { eventType: event.type, cashfreeRef: event.id, payload: event as object },
    });

    const obj = event.data.object;

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionActivated(obj);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(obj);
        break;
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(obj);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(obj);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private async onSubscriptionActivated(sub: Record<string, unknown>): Promise<void> {
    const metadata    = (sub.metadata ?? {}) as SubMetadata;
    const userId      = metadata.userId;
    if (!userId) return;

    const tier        = ((metadata.tier ?? 'SOLO') as string).toUpperCase() as Plan;
    const periodEnd   = sub.current_period_end as number | undefined;
    const nextBilling = periodEnd ? new Date(periodEnd * 1000) : undefined;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan:                 tier,
        subscriptionStatus:   SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: sub.id as string,
        ...(nextBilling && { billingAnchorDate: nextBilling }),
        planExpiresAt:        null,
      },
    });
  }

  private async onInvoicePaid(invoice: Record<string, unknown>): Promise<void> {
    const subId = invoice.subscription as string | null;
    if (!subId) return;

    const sub     = await this.client.subscriptions.retrieve(subId);
    const metadata = (sub.metadata ?? {}) as SubMetadata;
    const userId  = metadata.userId;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        billingAnchorDate:  new Date(sub.billing_cycle_anchor * 1000),
      },
    });
  }

  private async onInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
    const subId = invoice.subscription as string | null;
    if (!subId) return;

    const sub      = await this.client.subscriptions.retrieve(subId);
    const metadata  = (sub.metadata ?? {}) as SubMetadata;
    const userId   = metadata.userId;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: SubscriptionStatus.PAST_DUE },
    });
  }

  private async onSubscriptionDeleted(sub: Record<string, unknown>): Promise<void> {
    const metadata = (sub.metadata ?? {}) as SubMetadata;
    const userId   = metadata.userId;
    if (!userId) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: SubscriptionStatus.CANCELLED, plan: Plan.FREE },
    });
  }
}
