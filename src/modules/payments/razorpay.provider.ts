import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import type { CreateSubscriptionParams, PaymentProvider, SubscriptionState } from './payment-provider.interface';

// Razorpay subscriptions require a finite billing-cycle count at creation —
// there's no "until cancelled" option. 100 monthly cycles (~8 years) stands
// in for "indefinite"; cancelSubscription() ends it earlier when needed.
const TOTAL_BILLING_CYCLES = 100;

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  private readonly logger = new Logger(RazorpayProvider.name);
  private readonly client: Razorpay;

  constructor(private readonly config: ConfigService) {
    this.client = new Razorpay({
      key_id:     this.config.get<string>('razorpay.keyId')!,
      key_secret: this.config.get<string>('razorpay.keySecret')!,
    });
  }

  // ── Plan lookup/creation ────────────────────────────────────────────────────
  // Plans are looked up by description (deterministic per tier+window+price) and
  // created lazily on first use — avoids a DB migration just to cache plan IDs,
  // and re-running this is idempotent (matches the existing plan if found).

  async getOrCreatePlanId(tier: 'SOLO' | 'STUDIO', window: string, priceInInr: number): Promise<string> {
    const description = `ClearWork ${tier} — ${window}`;

    const existing = await this.client.plans.all({ count: 100 });
    const match = existing.items.find(p => p.item.description === description);
    if (match) return match.id;

    const plan = await this.client.plans.create({
      period:   'monthly',
      interval: 1,
      item: {
        name:        `ClearWork ${tier} (${window})`,
        amount:      priceInInr * 100,
        currency:    'INR',
        description,
      },
    });
    this.logger.log(`Created Razorpay plan ${plan.id} for ${description}`);
    return plan.id;
  }

  // ── PaymentProvider interface ──────────────────────────────────────────────

  async createSubscription(params: CreateSubscriptionParams): Promise<{ checkoutUrl: string; subscriptionId: string }> {
    const subscription = await this.client.subscriptions.create({
      plan_id:         params.planId,
      total_count:     TOTAL_BILLING_CYCLES,
      customer_notify: 1,
      notes:           { userId: params.userId },
    });

    // No hosted checkout URL for Razorpay Subscriptions — the frontend opens
    // the Checkout widget directly with this subscription id.
    return { checkoutUrl: subscription.id, subscriptionId: subscription.id };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // cancelAtCycleEnd=true: access continues until the current paid period ends.
    await this.client.subscriptions.cancel(subscriptionId, true);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionState> {
    const sub = await this.client.subscriptions.fetch(subscriptionId);
    return {
      subscriptionId: sub.id,
      planId:         sub.plan_id,
      status:         sub.status,
      nextBillingDate: sub.charge_at ? new Date(sub.charge_at * 1000) : undefined,
    };
  }
}
