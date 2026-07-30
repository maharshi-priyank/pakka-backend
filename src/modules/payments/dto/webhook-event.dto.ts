export interface RazorpaySubscriptionEntity {
  id:           string;
  plan_id:      string;
  status:       string;
  charge_at?:   number;
  current_end?: number;
  notes?:       Record<string, string | number>;
}

export interface RazorpayWebhookEvent {
  event: string;
  payload: {
    subscription?: { entity: RazorpaySubscriptionEntity };
    payment?:       { entity: { id: string; status?: string } };
  };
}
