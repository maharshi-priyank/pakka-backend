export interface CashfreeWebhookEvent {
  type: string;
  data: {
    subscription: {
      subscription_id:   string;
      plan_id:           string;
      status:            string;
      customer_details?: { customer_id?: string };
      next_payment_date?: string;
    };
    payment?: {
      cf_payment_id?: string;
    };
  };
}
