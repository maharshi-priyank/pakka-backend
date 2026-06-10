export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreateSubscriptionParams {
  userId: string;
  planId: string;
  returnUrl: string;
  cancelUrl: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
}

export interface SubscriptionState {
  subscriptionId: string;
  planId: string;
  status: string;
  nextBillingDate?: Date;
}

export interface PaymentProvider {
  createSubscription(params: CreateSubscriptionParams): Promise<{ checkoutUrl: string; subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  getSubscription(subscriptionId: string): Promise<SubscriptionState>;
}
