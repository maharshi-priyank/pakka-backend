import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import type {
  CreateSubscriptionParams,
  PaymentProvider,
  SubscriptionState,
  RefundResult,
} from './payment-provider.interface';

// Razorpay subscriptions require a finite billing-cycle count at creation —
// there's no "until cancelled" option. 100 monthly cycles (~8 years) stands
// in for "indefinite"; cancelSubscription() ends it earlier when needed.
const TOTAL_BILLING_CYCLES = 100;

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  private readonly logger = new Logger(RazorpayProvider.name);
  private readonly client: Razorpay;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('razorpay.keyId');
    const keySecret = this.config.get<string>('razorpay.keySecret');
    this.configured =
      this.isUsableCredential(keyId) && this.isUsableCredential(keySecret);
    this.client = new Razorpay({
      key_id: keyId ?? '',
      key_secret: keySecret ?? '',
    });

    if (!this.configured) {
      this.logger.warn(
        'Razorpay credentials are missing or still contain placeholders; billing checkout is disabled.',
      );
    }
  }

  private isUsableCredential(value: string | undefined): value is string {
    return Boolean(value && !value.includes('YOUR_') && !value.includes('...'));
  }

  private async callRazorpay<T>(
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Razorpay billing is unavailable. Set valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }

    try {
      return await action();
    } catch (error) {
      const providerError = error as {
        statusCode?: unknown;
        error?: { description?: unknown };
        message?: unknown;
      };
      const authenticationFailed =
        providerError.statusCode === 401 ||
        providerError.error?.description === 'Authentication failed' ||
        providerError.message === 'Authentication failed';

      if (authenticationFailed) {
        this.logger.error(
          `Razorpay ${operation} failed: authentication rejected`,
        );
        throw new ServiceUnavailableException(
          'Razorpay billing is unavailable. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
        );
      }

      throw error;
    }
  }

  // ── Plan lookup/creation ────────────────────────────────────────────────────
  // Plans are looked up by description (deterministic per tier+window+price) and
  // created lazily on first use — avoids a DB migration just to cache plan IDs,
  // and re-running this is idempotent (matches the existing plan if found).

  async getOrCreatePlanId(
    tier: 'SOLO' | 'STUDIO',
    window: string,
    priceInInr: number,
  ): Promise<string> {
    const description = `ClearWork ${tier} — ${window}`;

    return this.callRazorpay('plan lookup', async () => {
      const existing = await this.client.plans.all({ count: 100 });
      const match = existing.items.find(
        (p) => p.item.description === description,
      );
      if (match) return match.id;

      const plan = await this.client.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: `ClearWork ${tier} (${window})`,
          amount: priceInInr * 100,
          currency: 'INR',
          description,
        },
      });
      this.logger.log(`Created Razorpay plan ${plan.id} for ${description}`);
      return plan.id;
    });
  }

  // ── PaymentProvider interface ──────────────────────────────────────────────

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<{ checkoutUrl: string; subscriptionId: string }> {
    return this.callRazorpay('subscription creation', async () => {
      const subscription = await this.client.subscriptions.create({
        plan_id: params.planId,
        total_count: TOTAL_BILLING_CYCLES,
        customer_notify: 1,
        notes: { userId: params.userId, tier: params.tier ?? 'PRO' },
      });

      // No hosted checkout URL for Razorpay Subscriptions — the frontend opens
      // the Checkout widget directly with this subscription id.
      return { checkoutUrl: subscription.id, subscriptionId: subscription.id };
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // cancelAtCycleEnd=true: access continues until the current paid period ends.
    await this.callRazorpay('subscription cancellation', () =>
      this.client.subscriptions.cancel(subscriptionId, true),
    );
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionState> {
    return this.callRazorpay('subscription lookup', async () => {
      const sub = await this.client.subscriptions.fetch(subscriptionId);
      return {
        subscriptionId: sub.id,
        planId: sub.plan_id,
        status: sub.status,
        nextBillingDate: sub.charge_at
          ? new Date(sub.charge_at * 1000)
          : undefined,
      };
    });
  }

  // ── Refund (KTD4) ──────────────────────────────────────────────────────────
  // Razorpay refunds via client.payments.refund(paymentId, { amount? }). Amount
  // is in the payment's currency unit; omit for a full refund. Razorpay rejects
  // a refund on an already-fully-refunded payment, which the admin service
  // treats as the idempotent short-circuit (KTD4).
  async refund(
    paymentId: string,
    amount?: number,
    idempotencyKey?: string,
  ): Promise<RefundResult> {
    return this.callRazorpay('payment refund', async () => {
      const refund = await this.client.payments.refund(paymentId, {
        ...(amount ? { amount: amount * 100 } : {}), // Razorpay expects paise
        ...(idempotencyKey ? { notes: { idempotencyKey } } : {}),
      });
      return {
        refundId: refund.id,
        paymentId,
        amount: refund.amount ? refund.amount / 100 : undefined,
        status: refund.status,
      };
    });
  }
}
