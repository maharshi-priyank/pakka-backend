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
      ? 'https://api.cashfree.com'
      : 'https://sandbox.cashfree.com';
    this.appId    = config.get<string>('cashfree.appId')!;
    this.secretKey = config.get<string>('cashfree.secretKey')!;
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'x-client-id': this.appId,
      'x-client-secret': this.secretKey,
      'x-api-version': '2023-08-01',
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<{ checkoutUrl: string; subscriptionId: string }> {
    const body = {
      subscription_id:    params.userId + '_' + Date.now(),
      plan_id:            params.planId,
      customer_details: {
        customer_id:    params.userId,
        customer_email: params.customerEmail,
        customer_name:  params.customerName,
        customer_phone: params.customerPhone ?? '',
      },
      authorization_details: {
        authorization_amount: 0,
      },
      return_url: params.returnUrl,
    };

    const res = await fetch(`${this.baseUrl}/api/v1/subscriptions`, {
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
      checkoutUrl:    data.authorization_details?.authorization_url ?? data.payment_link,
      subscriptionId: data.subscription_id ?? body.subscription_id,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/subscriptions/${subscriptionId}/cancel`, {
      method:  'POST',
      headers: this.headers,
    });

    if (!res.ok) {
      const data = await res.json() as any;
      throw new Error(`Cashfree cancelSubscription failed: ${data.message ?? res.statusText}`);
    }
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionState> {
    const res = await fetch(`${this.baseUrl}/api/v1/subscriptions/${subscriptionId}`, {
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
