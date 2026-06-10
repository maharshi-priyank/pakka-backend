import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CreateSubscriptionParams, PaymentProvider, SubscriptionState } from './payment-provider.interface';

@Injectable()
export class CashfreeProvider implements PaymentProvider {
  private readonly logger = new Logger(CashfreeProvider.name);
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    const env = config.get<string>('cashfree.environment') ?? 'sandbox';
    this.baseUrl = env === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
    this.appId    = config.get<string>('cashfree.appId')!;
    this.secretKey = config.get<string>('cashfree.secretKey')!;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'x-client-id': this.appId,
      'x-client-secret': this.secretKey,
      'x-api-version': '2025-01-01',
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<{ checkoutUrl: string; subscriptionId: string }> {
    const subscriptionId = params.userId + '_' + Date.now();
    const body = {
      subscription_id: subscriptionId,
      plan_details: {
        plan_id: params.planId,
      },
      customer_details: {
        customer_id:    params.userId,
        customer_email: params.customerEmail,
        customer_name:  params.customerName,
        customer_phone: params.customerPhone ?? '9999999999',
      },
      authorization_details: {
        authorization_amount: 1,
        authorization_amount_refund: true,
      },
      subscription_meta: {
        return_url: params.returnUrl,
      },
    };

    const res = await fetch(`${this.baseUrl}/subscriptions`, {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify(body),
    });

    const data = await res.json() as any;
    this.logger.debug('Cashfree createSubscription response:', JSON.stringify(data));

    if (!res.ok) {
      throw new Error(`Cashfree createSubscription failed: ${data.message ?? res.statusText}`);
    }

    return {
      checkoutUrl:    data.subscription_session_id,
      subscriptionId: data.subscription_id ?? subscriptionId,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}/cancel`, {
      method:  'POST',
      headers: this.headers,
    });

    if (!res.ok) {
      const data = await res.json() as any;
      throw new Error(`Cashfree cancelSubscription failed: ${data.message ?? res.statusText}`);
    }
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionState> {
    const res = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      headers: this.headers,
    });

    const data = await res.json() as any;

    if (!res.ok) {
      throw new Error(`Cashfree getSubscription failed: ${data.message ?? res.statusText}`);
    }

    return {
      subscriptionId: data.subscription_id,
      planId:         data.plan_id,
      status:         data.status,
      nextBillingDate: data.next_payment_date ? new Date(data.next_payment_date) : undefined,
    };
  }
}
