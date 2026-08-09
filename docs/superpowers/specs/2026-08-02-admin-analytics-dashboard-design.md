# Admin Analytics Dashboard Design

Date: 2026-08-02

Status: Approved scope; awaiting written-spec review before implementation.

## Context

`clearwork-admin` currently has an overview page with headline counts, 30-day user
signups, plan distribution, a rough billing metric, and top workspaces. The
backend already contains the tenant entities needed for richer analytics:
users, workspaces, contacts, projects, proposals, contracts, invoices, tasks,
expenses, time entries, and billing events. `pakka-app` also establishes the
product's existing reporting vocabulary and uses Recharts.

The current overview endpoint is intentionally small and is not date-filtered.
Its revenue value is derived from billing-event payloads and should not be
presented as precise MRR without a subscription snapshot model. The new
analytics surface will make those data boundaries explicit.

## Goals

- Give superadmins and support admins a cross-tenant operational view.
- Add selectable date ranges: 7 days, 30 days, 90 days, 12 months, and custom.
- Show growth, onboarding, billing, lifecycle, document, and product-usage
  trends using real records in the current PostgreSQL schema.
- Keep all existing user, workspace, audit, refund, and impersonation flows
  working.
- Make every aggregate understandable through labels, tooltips, legends, and
  data-quality notes.
- Keep the surface responsive and usable on desktop and tablet widths.

## Non-goals

- No changes to the customer-facing `pakka-app` behavior or routes.
- No new billing provider or subscription architecture.
- No exposure of passwords, access tokens, bank details, payment credentials,
  raw billing payloads, or private tenant records in aggregate responses.
- No admin write actions beyond the already-existing action endpoints.
- No analytics warehouse or event-stream infrastructure in this slice.

## Alternatives considered

### Extend `AdminOversightService`

This is the smallest code change, but it would mix headline overview metrics,
date-series computation, billing interpretation, and future analytics concerns
in one service. It is not recommended.

### Add a dedicated `AdminAnalyticsService` and controller

This is the recommended approach. The analytics contract is isolated, can gain
query caching or database-specific aggregation later, and lets the existing
`/admin/oversight` endpoint remain backward-compatible during the UI migration.

### Add a materialized analytics/event layer

This would provide the best long-term scale and historical accuracy, but the
current data model does not justify the operational cost yet. It can be added
later without changing the dashboard contract if the service remains the
aggregation boundary.

## Backend architecture

Add an `admin/analytics` feature inside the existing admin module:

- `AdminAnalyticsController`
  - `GET /admin/analytics/overview`
  - `GET /admin/analytics/export`
- `AdminAnalyticsService`
  - validates and normalizes the requested range
  - chooses a day/week/month bucket
  - runs parameterized aggregate queries
  - normalizes Decimal and JSON values into JSON-safe numbers
  - returns explicit data-quality metadata where source coverage is limited
- DTOs for query parameters and the response types
- Unit tests covering range normalization, bucket selection, stage/status
  breakdowns, currency handling, and empty datasets

Both endpoints use `@Public()`, `@UseGuards(AdminGuard)`, and
`@RequireAdmin('support')`, matching the existing admin read endpoints. The
admin JWT is the only accepted credential.

The existing `/admin/oversight` and its CSV export remain available for
backward compatibility. The upgraded admin dashboard will consume the new
analytics endpoint.

## Query contract

### Request

`GET /api/v1/admin/analytics/overview`

Optional query parameters:

- `from`: ISO date/time, inclusive
- `to`: ISO date/time, exclusive; defaults to now
- `bucket`: `day`, `week`, `month`, or `auto`; defaults to `auto`

Rules:

- The default range is the previous 30 complete calendar days plus today.
- Maximum custom range is 365 days.
- `auto` selects `day` for ranges up to 31 days, `week` up to 90 days, and
  `month` beyond 90 days.
- Invalid dates, inverted ranges, unsupported buckets, and oversized ranges
  return a clear `400` response.

### Response shape

The normal backend response wrapper remains in place: `{ data: payload }`.
The payload has this shape:

```ts
{
  range: {
    from: string;
    to: string;
    bucket: 'day' | 'week' | 'month';
  };
  kpis: {
    totalUsers: number;
    newUsers: number;
    onboardedUsers: number;
    totalWorkspaces: number;
    newWorkspaces: number;
    activeSubscriptions: number;
    cancelledSubscriptions: number;
    totalContacts: number;
    pipelineValue: number;
  };
  series: {
    growth: Array<{
      period: string;
      newUsers: number;
      newWorkspaces: number;
      onboardedNewUsers: number;
    }>;
    billing: Array<{
      period: string;
      currencies: Record<string, { amount: number; events: number }>;
    }>;
    productCreation: Array<{
      period: string;
      contacts: number;
      projects: number;
      proposals: number;
      contracts: number;
      invoices: number;
      tasks: number;
    }>;
  };
  breakdowns: {
    plans: Array<{ key: string; count: number }>;
    subscriptions: Array<{ key: string; count: number }>;
    contacts: Array<{ key: string; count: number; value: number }>;
    proposals: Array<{ key: string; count: number; value: number }>;
    contracts: Array<{ key: string; count: number }>;
    invoices: Array<{ key: string; count: number; value: number }>;
  };
  topWorkspaces: Array<{
    workspaceId: string;
    name: string;
    members: number;
    contacts: number;
    projects: number;
    proposals: number;
    contracts: number;
    invoices: number;
    tasks: number;
    activityScore: number;
  }>;
  dataQuality: {
    billingEventsRead: number;
    billingEventsWithoutAmount: number;
    billingEventsWithoutCurrency: number;
    billingCurrencies: string[];
  };
}
```

The response intentionally exposes aggregate counts and top-workspace IDs
only. It does not return raw user lists or billing payloads.

## Metric definitions

- **Total users:** all `User` records at request time.
- **New users:** users whose `createdAt` falls inside the selected range.
- **Onboarded users:** users with `onboardingComplete = true`; this is labelled
  “Onboarded users,” not “active users,” because there is no last-login field.
- **Onboarded new users:** new users in each period whose current
  `onboardingComplete` flag is true. This is explicitly labelled as a proxy;
  exact onboarding-completion trends require an onboarding event/timestamp that
  the current schema does not contain.
- **Total workspaces:** workspaces at request time, with archived state shown
  separately where useful.
- **Active subscriptions:** users with `subscriptionStatus = ACTIVE`.
- **Cancelled subscriptions:** users with `subscriptionStatus = CANCELLED` for
  the current snapshot; the trend uses cancellation billing events when they
  exist.
- **Pipeline value:** sum of `Contact.dealValue` for non-archived contacts in
  `ENQUIRY`, `PROPOSAL_SENT`, and `NEGOTIATING`.
- **Contact funnel:** counts and deal values by `ContactStage`.
- **Document breakdowns:** counts by existing proposal, contract, and invoice
  status; invoice/proposal value uses their stored total amount.
- **Billing collections:** sum of numeric `amount` values from
  `SUBSCRIPTION_PAYMENT_SUCCESS` billing events in the selected range, grouped
  by the payload's currency. Missing currency defaults to `INR` only for
  legacy Razorpay-shaped events and is counted in the data-quality metadata.
  This is not labelled MRR.
- **Top workspaces:** product counts are limited to records created inside the
  selected range; member count is a current snapshot. Workspaces are sorted by
  their selected-range activity count.
- **Activity score:** the sum of contacts, projects, proposals, contracts,
  invoices, and tasks created in the selected range, with one point per record.
  The UI displays the component counts alongside the score so it is not treated
  as a hidden health rating.

All monetary values are returned by currency. The UI never combines INR and
non-INR amounts into one total.

## Dashboard design

Upgrade the existing `/admin/overview` route into the analytics dashboard while
preserving its URL. Add the following reusable components under
`clearwork-admin/src/features/admin/analytics/`:

1. **Analytics header**
   - title and last-refreshed state
   - date-range selector
   - refresh button
   - export button using the current range

2. **KPI grid**
   - total users, new users, onboarded users, workspaces
   - active subscriptions, cancellations, contacts, pipeline value
   - responsive from two columns on tablet to four on desktop

3. **Growth chart**
   - multi-line chart for new users, new workspaces, and onboarded new users
   - labels the onboarding series as a current-flag proxy
   - accessible legend and tooltip

4. **Billing chart**
   - currency selector when multiple currencies exist
   - bar chart for collections by period
   - visible note when event amounts are incomplete

5. **Lifecycle and document breakdowns**
   - contact funnel as a horizontal bar chart
   - plan and subscription distributions as donut/bar charts
   - proposal, contract, and invoice status cards/charts

6. **Product usage**
   - stacked creation trend for contacts, projects, proposals, contracts,
     invoices, and tasks
   - top-workspaces table with inline activity bars
   - workspace names link to existing workspace detail pages

7. **State handling**
   - skeleton cards and chart placeholders while loading
   - clear empty state when the range has no records
   - retry action for failed requests
   - responsive overflow handling for dense tables

Use the existing `card`, `data-table`, button, badge, color-token, and Recharts
patterns. Avoid adding a second visual system or changing `pakka-app` styles.
Charts must have non-color labels or legends, visible focus states, readable
tooltips, and support reduced motion through the existing browser behavior.

## Frontend data flow

Add `useAdminAnalytics(range)` using React Query:

- query key includes `from`, `to`, and `bucket`
- stale time: 60 seconds
- manual refresh invalidates the query
- export uses the same normalized range and bearer token
- API response unwrapping stays centralized in `src/lib/api.ts`

The current overview hook may be retained temporarily for compatibility, but
the dashboard should use the new analytics hook and types.

## Security and privacy

- Every analytics request passes through `AdminGuard`.
- Support and superadmin roles can read analytics; only existing superadmin
  routes can perform high-impact writes.
- Never select or serialize password hashes, OAuth tokens, bank fields,
  provider secrets, raw billing payloads, or private message contents.
- Limit custom ranges to one year to prevent accidental unbounded scans.
- Use parameterized SQL/Prisma queries for all date inputs.
- Export contains only the aggregate response fields and the selected range.

## Error handling and data quality

- Return validation errors for bad date ranges with actionable messages.
- Return zero-filled series buckets so charts do not have missing date gaps.
- Treat absent or malformed billing amounts as zero for totals and report them
  in `dataQuality`; never fail the whole dashboard because one event is bad.
- If an aggregate query fails, the API returns the standard error envelope and
  the UI presents a retry state rather than partial unlabeled data.

## Testing and verification

Backend:

- unit tests for range normalization and auto-bucket selection
- unit tests for empty ranges and zero-filled series
- unit tests for stage/status/value breakdowns
- unit tests for multi-currency billing and malformed payloads
- authorization tests for support/superadmin access and rejected tenant JWTs
- controller tests for query validation and export range propagation

Frontend:

- TypeScript project build
- chart rendering with loading, empty, error, and multi-currency states
- range changes update the query key and export parameters
- workspace links preserve IDs and route correctly
- responsive layout check at tablet and desktop widths

Manual verification:

1. Run the backend and admin app.
2. Log in with the admin JWT flow.
3. Verify default 30-day analytics.
4. Switch through all preset ranges and a custom range.
5. Verify charts with a range containing no records.
6. Verify CSV export uses the selected range.
7. Verify a support admin can read analytics but cannot access superadmin-only
   write actions.

## Rollout

Implement backend analytics first, then migrate the existing overview page to
the new hook and chart components. Keep `/admin/oversight` available during the
transition. No customer-facing deployment changes are required.
