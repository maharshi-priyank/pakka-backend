export type AdminBillingProvider = 'razorpay' | 'stripe' | 'unknown';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function detectBillingProvider(eventType: string, payload: unknown): AdminBillingProvider {
  const record = asRecord(payload);
  if (/subscription|razorpay/i.test(eventType) || typeof record?.event === 'string' || record?.razorpay_payment_id) return 'razorpay';
  if (/stripe|customer\.|invoice\./i.test(eventType) || typeof record?.type === 'string') return 'stripe';
  return 'unknown';
}

export function extractBillingCurrency(payload: unknown): string | null {
  const root = asRecord(payload);
  const nested = asRecord(root?.payload) ?? root;
  const payment = asRecord(asRecord(nested?.payment)?.entity);
  const stripeObject = asRecord(asRecord(root?.data)?.object);
  const candidates = [root?.currency, nested?.currency, payment?.currency, stripeObject?.currency];
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim().toUpperCase() ?? null;
}

export function extractBillingAmount(payload: unknown, provider: AdminBillingProvider): number | null {
  const root = asRecord(payload);
  const nested = asRecord(root?.payload) ?? root;
  const payment = asRecord(asRecord(nested?.payment)?.entity);
  const stripeObject = asRecord(asRecord(root?.data)?.object);
  const candidates = [root?.amount, nested?.amount, payment?.amount, root?.amount_paid, stripeObject?.amount_paid, stripeObject?.amount];
  const raw = candidates.find(value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''));
  if (raw === undefined || !Number.isFinite(Number(raw))) return null;
  const amount = Number(raw);
  return provider === 'stripe' ? amount / 100 : amount;
}

export function isSuccessfulBillingEvent(eventType: string, payload: unknown): boolean {
  const record = asRecord(payload);
  return /success|succeed|paid|charged/i.test(`${eventType} ${String(record?.type ?? '')}`);
}

export function isFailedBillingEvent(eventType: string): boolean {
  return /failed|failure|halted|past_due/i.test(eventType);
}
