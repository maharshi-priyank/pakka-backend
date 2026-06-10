# Rupway API (pakka-api)

NestJS + Prisma backend for [ClearWork](https://getclearwork.in) — India-first freelancer SaaS.

- **Runtime:** Node.js 20, NestJS 10, Prisma 7
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase JWT (validated via JWKS)
- **Payments:** Cashfree Subscriptions
- **Deployed on:** Fly.io (`rupway-backend`)

---

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example and fill in values:

```bash
cp .env.example .env
```

Minimum required for local dev:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
GEMINI_API_KEY=...
EMAIL_HOST=...
EMAIL_USER=...
EMAIL_PASS=...
NODE_ENV=development
```

### 3. Run database migrations

```bash
npx prisma db push
```

### 4. Start the dev server

```bash
npm run start:dev
```

API runs at `http://localhost:3000`.

---

## Cashfree Subscriptions — Test setup

### Step 1 — Get sandbox API keys

1. Log in to [merchant.cashfree.com](https://merchant.cashfree.com)
2. Toggle to **Test Environment** (top bar)
3. Go to **Developers → API Keys** (under Payment Gateway)
4. Copy **Client ID** and **Client Secret**

Add to `.env`:

```env
CASHFREE_APP_ID=TEST_xxxxxxxxxx
CASHFREE_SECRET_KEY=cfsk_ma_test_xxxxxxxxxx
CASHFREE_ENVIRONMENT=sandbox
CASHFREE_WEBHOOK_SECRET=cfsk_ma_test_xxxxxxxxxx   # same as secret key
APP_FRONTEND_URL=http://localhost:5173
```

### Step 2 — Register the webhook

1. Dashboard → **Subscriptions → Webhooks**
2. Add URL:
   - **Local:** use [ngrok](https://ngrok.com) — `ngrok http 3000` → `https://xxx.ngrok.io/payments/webhook`
   - **Staging/prod:** `https://rupway-backend.fly.dev/payments/webhook`
3. Select events:
   - `SUBSCRIPTION_STATUS_CHANGED`
   - `SUBSCRIPTION_PAYMENT_SUCCESS`
   - `SUBSCRIPTION_PAYMENT_FAILED`
   - `SUBSCRIPTION_AUTH_STATUS`
4. Save

> The webhook is verified using `HMAC-SHA256(timestamp + rawBody, clientSecret)` against the `x-webhook-signature` header. No separate webhook secret — the `CASHFREE_WEBHOOK_SECRET` env var should equal your `CASHFREE_SECRET_KEY`.

### Step 3 — Create subscription plans

Plans must be created via API (no dashboard UI). Run the seed script once against sandbox:

```bash
npx ts-node scripts/create-cashfree-plans.ts
```

This creates 6 plans: `plan_solo_founding`, `plan_solo_earlyaccess`, `plan_solo_regular`, `plan_studio_founding`, `plan_studio_earlyaccess`, `plan_studio_regular`.

> Plan names must be alphanumeric only — no em dashes or special characters.

### Step 4 — Test the flow

1. Start the API locally
2. Use the app at `http://localhost:5173` → Settings → Billing → upgrade
3. You'll be redirected to Cashfree's sandbox checkout
4. Use test card: `4111 1111 1111 1111`, any future expiry, any CVV
5. After payment, Cashfree fires a webhook → your API updates the user's plan

---

## Cashfree Subscriptions — Production setup

### Step 1 — Get production API keys

1. Log in to [merchant.cashfree.com](https://merchant.cashfree.com)
2. Switch to **Production** (top bar)
3. Complete KYC if not done (required for live payments)
4. **Developers → API Keys** → copy live Client ID and Secret

### Step 2 — Set Fly.io secrets

```bash
flyctl secrets set \
  CASHFREE_APP_ID=<live_client_id> \
  CASHFREE_SECRET_KEY=<live_client_secret> \
  CASHFREE_ENVIRONMENT=production \
  CASHFREE_WEBHOOK_SECRET=<live_client_secret> \
  APP_FRONTEND_URL=https://app.getclearwork.in \
  -a rupway-backend
```

### Step 3 — Register the production webhook

1. Switch Cashfree dashboard to **Production**
2. **Subscriptions → Webhooks** → add `https://rupway-backend.fly.dev/payments/webhook`
3. Select the same 4 events as test

### Step 4 — Create production subscription plans

```bash
CASHFREE_ENVIRONMENT=production \
CASHFREE_APP_ID=<live_id> \
CASHFREE_SECRET_KEY=<live_secret> \
npx ts-node scripts/create-cashfree-plans.ts
```

### Step 5 — Deploy

```bash
flyctl deploy -a rupway-backend
```

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (pooled for runtime) |
| `DIRECT_URL` | yes | Postgres direct connection (for migrations) |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | yes | JWT secret for verifying Supabase auth tokens |
| `CASHFREE_APP_ID` | yes | Cashfree Client ID |
| `CASHFREE_SECRET_KEY` | yes | Cashfree Client Secret |
| `CASHFREE_ENVIRONMENT` | yes | `sandbox` or `production` |
| `CASHFREE_WEBHOOK_SECRET` | yes | Same as `CASHFREE_SECRET_KEY` |
| `APP_FRONTEND_URL` | yes | Frontend URL for Cashfree return redirects |
| `GEMINI_API_KEY` | yes | Google Gemini API key (AI features) |
| `EMAIL_HOST` | yes | SMTP host |
| `EMAIL_PORT` | no | SMTP port (default 465) |
| `EMAIL_USER` | yes | SMTP username |
| `EMAIL_PASS` | yes | SMTP password |
| `EMAIL_FROM` | no | From address (default `ClearWork <noreply@clearwork.in>`) |
| `RAZORPAY_KEY_ID` | no | Razorpay key (invoice deposits) |
| `RAZORPAY_KEY_SECRET` | no | Razorpay secret |
| `VAPID_PUBLIC_KEY` | no | Web push public key |
| `VAPID_PRIVATE_KEY` | no | Web push private key |
| `VAPID_SUBJECT` | no | Web push subject (mailto:) |
| `NODE_ENV` | no | `development` or `production` |
| `PORT` | no | Server port (default 3000) |
| `CORS_ORIGIN` | no | Comma-separated allowed origins |

---

## Deployment (Fly.io)

```bash
# Deploy
flyctl deploy -a rupway-backend

# View logs
flyctl logs -a rupway-backend

# SSH into running instance
flyctl ssh console -a rupway-backend

# View/set secrets
flyctl secrets list -a rupway-backend
flyctl secrets set KEY=value -a rupway-backend
```
