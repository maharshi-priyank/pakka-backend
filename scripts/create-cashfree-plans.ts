/**
 * One-shot script to create Cashfree subscription plans.
 * Run once per environment (sandbox + production).
 *
 * Usage:
 *   npx ts-node scripts/create-cashfree-plans.ts
 *
 * Override env vars inline for production:
 *   CASHFREE_APP_ID=<live_id> CASHFREE_SECRET_KEY=<live_secret> CASHFREE_ENVIRONMENT=production \
 *   npx ts-node scripts/create-cashfree-plans.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

const APP_ID    = process.env.CASHFREE_APP_ID!;
const SECRET    = process.env.CASHFREE_SECRET_KEY!;
const ENV       = process.env.CASHFREE_ENVIRONMENT ?? 'sandbox';
const BASE_URL  = ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

const PLANS = [
  { plan_id: 'plan_solo_founding',    plan_name: 'ClearWork Solo Founding',     amount: 149, description: 'Solo plan founding rate' },
  { plan_id: 'plan_solo_earlyaccess', plan_name: 'ClearWork Solo Early Access', amount: 199, description: 'Solo plan early access rate' },
  { plan_id: 'plan_solo_regular',     plan_name: 'ClearWork Solo Regular',      amount: 299, description: 'Solo plan regular rate' },
  { plan_id: 'plan_studio_founding',    plan_name: 'ClearWork Studio Founding',     amount: 349, description: 'Studio plan founding rate' },
  { plan_id: 'plan_studio_earlyaccess', plan_name: 'ClearWork Studio Early Access', amount: 499, description: 'Studio plan early access rate' },
  { plan_id: 'plan_studio_regular',     plan_name: 'ClearWork Studio Regular',      amount: 699, description: 'Studio plan regular rate' },
];

const headers = {
  'Content-Type': 'application/json',
  'x-client-id': APP_ID,
  'x-client-secret': SECRET,
  'x-api-version': '2025-01-01',
};

async function createPlan(plan: typeof PLANS[number]) {
  const body = {
    plan_id: plan.plan_id,
    plan_name: plan.plan_name,
    plan_type: 'PERIODIC',
    plan_currency: 'INR',
    plan_recurring_amount: plan.amount,
    plan_max_amount: plan.amount,
    plan_max_cycles: 0,
    plan_intervals: 1,
    plan_interval_type: 'MONTH',
    plan_note: plan.description,
  };

  const res = await fetch(`${BASE_URL}/plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: { message?: string; [k: string]: unknown };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    data = { message: text.slice(0, 200) };
  }

  if (res.ok) {
    console.log(`✓ ${plan.plan_id} — created`);
  } else if (JSON.stringify(data).toLowerCase().includes('already exist')) {
    console.log(`✓ ${plan.plan_id} — already exists`);
  } else {
    console.error(`✗ ${plan.plan_id} — HTTP ${res.status}`);
    console.error('  Response:', JSON.stringify(data));
  }
}

(async () => {
  if (!APP_ID || !SECRET) {
    console.error('Missing CASHFREE_APP_ID or CASHFREE_SECRET_KEY in .env');
    process.exit(1);
  }

  console.log(`Creating plans on ${ENV} (${BASE_URL})\n`);

  for (const plan of PLANS) {
    await createPlan(plan);
  }

  console.log('\nDone. These plan IDs are now ready to use in create-subscription calls.');
})();
