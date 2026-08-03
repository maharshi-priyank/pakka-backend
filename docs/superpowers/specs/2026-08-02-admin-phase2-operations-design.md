# Admin Phase 2 Operations Suite Design

Date: 2026-08-02

Status: Approved scope; awaiting written-spec review before implementation.

## Context

Phase 1 added cross-tenant analytics, global admin search, Customer 360 views,
activity timelines, and append-only support notes to `pakka-admin`. The backend
already has audited admin actions for plan overrides, refunds, subscription
sync, billing-event replay intent, workspace archive/restore, impersonation,
and feature-flag intent. Phase 2 turns those isolated capabilities into an
operational support console and adds the missing workspace administration and
support-reporting workflows.

The current data model has useful billing events, subscription snapshots,
workspace memberships, roles, account onboarding flags, product timestamps,
and support notes. It does not have login telemetry, onboarding completion
timestamps, a ticket model, a payment-retry API, or a persisted feature-flag
store. Phase 2 must make those limitations explicit instead of presenting
derived values as exact historical facts.

## Goals

- Give support and superadmin staff a single operational view of billing health,
  workspace access, onboarding risk, and support workload.
- Make existing refund, subscription-sync, and billing-event replay actions
  discoverable and safe from the admin UI.
- Provide audited workspace member and role administration.
- Persist workspace feature-flag state instead of recording toggle intent only.
- Provide an actionable onboarding/support queue linked to Customer 360.
- Preserve the existing admin JWT boundary, role hierarchy, audit log, and
  tenant application behavior.
- Keep the three tracks independently testable and deployable within one Phase
  2 release.

## Non-goals

- No customer-facing `pakka-app` redesign or new tenant routes in this phase.
- No new billing provider, payment processor, payment-retry API, or payment
  credential storage.
- No support-ticketing system, SLA engine, outbound support campaign, or email
  automation.
- No analytics warehouse, event-stream infrastructure, or background snapshot
  job.
- No exposure of passwords, access tokens, bank details, raw billing payloads,
  or private tenant content.
- No automatic account suspension or destructive workspace/member operation.
- Feature flags are persisted and administered in this phase; wiring every flag
  into customer-facing product behavior is a later, flag-by-flag change.

## Alternatives considered

### One large operations dashboard

This would put billing, members, flags, onboarding, and support queue logic in a
single service and page. It would be fast to scaffold, but would create a large
authorization surface and make it difficult to test derived support metrics
without coupling them to billing and workspace mutations. It is not
recommended.

### Separate feature modules with shared operational contracts

This is the recommended approach. Billing operations, workspace administration,
and support reporting each get a focused backend service/controller and focused
frontend page or panel. They share `AdminGuard`, `RequireAdmin`, `AuditService`,
Customer 360 links, and common response/error conventions. This keeps each
slice independently understandable and allows later replacement of derived
metrics with event-backed data without changing the UI contracts.

### Materialized support and billing warehouse

This would provide stronger historical reporting and lower request-time query
cost, but requires event completeness, backfill strategy, scheduling, and new
operational infrastructure. The current schema does not justify that cost.
The service boundaries in this design leave room to add snapshots later.

## Authorization and audit policy

All Phase 2 routes are under `/admin/**`, marked `@Public()`, and protected by
`AdminGuard`; the admin JWT is the only accepted credential.

- `SUPPORT` may read billing operations, workspace members/flags, and support
  reporting, and may continue to create support notes.
- `SUPERADMIN` satisfies the support tier and is required for refunds,
  subscription synchronization, billing-event replay, member add/remove/role
  changes, and feature-flag mutations.
- Every mutation writes one append-only `AuditLog` entry containing the target,
  action, before/after state where applicable, and an operator-supplied reason
  where the UI requests one.
- Membership mutations use transactions and re-check the workspace, user, and
  role inside the service. An OWNER member cannot be removed or downgraded.
- Billing mutations remain idempotent. A replay does not create a duplicate
  `BillingEvent` row, and a refund continues to use the existing payment-id
  idempotency check.

## Track A: Billing and operations

### Backend architecture

Add an `admin/billing-operations` feature that reads from `User`, `Workspace`,
and `BillingEvent`, and delegates mutations to the existing `AdminBillingService`
after making those mutations provider-aware.

The read service never returns `BillingEvent.payload`. It extracts only a safe
summary from known fields such as amount, currency, invoice/reference IDs,
subscription IDs, and user/workspace identifiers. Unknown payload shapes are
reported as incomplete rather than returned to the browser.

### API contract

`GET /api/v1/admin/billing/operations/summary`

Optional query parameters:

- `from`, `to`: ISO date/time range; default is the previous 30 days through now.
- `provider`: `razorpay`, `stripe`, or `all`.
- `eventType`: exact or prefix filter.

Response:

```ts
{
  range: { from: string; to: string };
  counts: {
    billingEvents: number;
    successfulPayments: number;
    failedPayments: number;
    activeSubscriptions: number;
    pastDueSubscriptions: number;
    pausedSubscriptions: number;
    cancelledSubscriptions: number;
  };
  collections: Array<{ currency: string; amount: number; events: number }>;
  alerts: Array<{
    id: string;
    type: 'payment_failed' | 'past_due' | 'missing_owner' | 'incomplete_event';
    severity: 'warning' | 'critical';
    title: string;
    description: string;
    userId?: string;
    workspaceId?: string;
    billingEventId?: string;
    at: string;
  }>;
  dataQuality: {
    eventsWithoutAmount: number;
    eventsWithoutCurrency: number;
    eventsWithoutOwner: number;
    exactRetryTelemetryAvailable: false;
  };
}
```

`GET /api/v1/admin/billing/operations`

Query parameters:

- `from`, `to`, `provider`, `eventType` as above.
- `q`: provider reference, subscription ID, invoice/reference text, email, or
  workspace name.
- `page`, `pageSize`: page size capped at 100.

Response rows contain only:

```ts
{
  id: string;
  eventType: string;
  provider: 'razorpay' | 'stripe' | 'unknown';
  providerReference: string;
  workspaceId: string | null;
  workspaceName: string | null;
  userId: string | null;
  userEmail: string | null;
  amount: number | null;
  currency: string | null;
  outcome: 'success' | 'failed' | 'info';
  processedAt: string;
  replayable: boolean;
}
```

The existing mutation routes remain available:

- `POST /admin/billing/refund`
- `POST /admin/billing/sync-subscription`
- `POST /admin/billing/replay-event`

`sync-subscription` will select the provider from the stored subscription ID
or an explicit provider field, so Stripe subscriptions are not sent through the
Razorpay client. `replay-event` will call the existing provider handler without
inserting a second billing-event row. The UI will call this action “Replay
webhook event”; it will not claim to trigger a provider-side payment retry,
because `PaymentProvider` has no portable retry operation.

### Billing UI

Add an `Operations` or `Billing` navigation item and a page under
`pakka-admin/src/features/admin/billing/` with:

1. Summary cards for subscription states and recent payment outcomes.
2. Alert list with links to the affected user/workspace Customer 360 page.
3. Currency-separated collection totals and a visible data-quality notice.
4. Filterable billing-event table with safe fields only.
5. Row actions for replay and subscription sync, each behind confirmation and
   with an audit reason.
6. Existing refund action linked from payment rows where a payment ID is
   available; refund remains superadmin-only.

The page supports loading, empty, error, retry, and mutation-success states.
No mixed-currency total is displayed.

## Track B: Workspace administration

### Feature-flag persistence

Add an `AdminWorkspaceFeatureFlag` Prisma model mapped to
`admin_workspace_feature_flags`:

```prisma
model AdminWorkspaceFeatureFlag {
  id          String   @id @default(cuid())
  workspaceId String   @map("workspace_id")
  flag        String
  enabled     Boolean  @default(false)
  updatedBy   String?  @map("updated_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, flag])
  @@index([workspaceId])
  @@map("admin_workspace_feature_flags")
}
```

The migration is additive and does not alter customer data. Existing
`POST /admin/workspaces/:id/feature-flag` becomes a real upsert while retaining
its route for compatibility.

### Membership API

Add a focused `admin/workspace-administration` service:

- `GET /admin/workspaces/:id/members`
- `POST /admin/workspaces/:id/members` with `{ userId, roleId }`
- `PATCH /admin/workspaces/:id/members/:userId` with `{ roleId, reason? }`
- `DELETE /admin/workspaces/:id/members/:userId` with `{ reason? }`
- `GET /admin/workspaces/:id/feature-flags`
- `PATCH /admin/workspaces/:id/feature-flags/:flag` with `{ enabled, reason? }`

The add operation accepts an existing tenant user only; it does not send an
email invitation. It validates that the workspace and role exist, prevents
duplicates, and creates or updates `WorkspaceMember` in a transaction. Role
responses include role ID, key, name, user identity, and joined timestamp.

The existing workspace 360 response will include `members` and `featureFlags`
so the page does not need a second round trip for its initial render.

### Workspace UI

Extend the workspace 360 page with:

- Member administration table with role selector, add-member flow, remove flow,
  owner protection, and links to user 360.
- Feature flags panel showing persisted state, toggle confirmation, and the
  last updating admin when available.
- Permission-aware controls: support admins see state and disabled mutation
  controls; superadmins can mutate.

All member removal, role change, member add, and feature-flag changes refresh
the 360 query, timeline, notes, and audit query.

## Track C: Onboarding and support reporting

### Reporting semantics

Add an `admin/support-reporting` service with request-time derived metrics.
There is no login event or onboarding-completion timestamp in the current
schema, so the response explicitly labels these metrics as proxies:

- **Pending onboarding:** `User.onboardingComplete = false`.
- **Onboarding aging:** pending users whose `createdAt` is older than three
  days.
- **Activated user:** current `onboardingComplete = true`.
- **Inactive workspace:** workspace older than 14 days with no contact, project,
  proposal, contract, invoice, task, or billing-event activity in the selected
  inactivity window (default 30 days).
- **Billing attention:** users currently `PAST_DUE` or recent payment-failure
  events.
- **Support workload:** support notes created in the selected range grouped by
  admin and target type. This is note activity, not ticket volume.

### API contract

`GET /api/v1/admin/support/overview`

Optional query parameters:

- `from`, `to`: ISO date/time; default previous 30 days through now.
- `inactiveDays`: integer from 7 to 180; default 30.

Response:

```ts
{
  range: { from: string; to: string; inactiveDays: number };
  kpis: {
    totalUsers: number;
    pendingOnboarding: number;
    onboardingAging: number;
    activatedUsers: number;
    activationRate: number;
    pastDueUsers: number;
    inactiveWorkspaces: number;
    notesCreated: number;
  };
  onboardingSeries: Array<{
    period: string;
    newUsers: number;
    currentOnboarded: number;
  }>;
  supportWorkload: Array<{ adminId: string; notes: number }>;
  dataQuality: {
    onboardingCompletionTimestampAvailable: false;
    loginTelemetryAvailable: false;
    inactivityDefinition: string;
  };
}
```

`GET /api/v1/admin/support/queue`

Query parameters:

- `type`: `all`, `onboarding`, `billing`, or `inactive`.
- `q`: email, user name, workspace name, or business name.
- `inactiveDays`, `page`, `pageSize`.

Queue rows contain:

```ts
{
  id: string;
  type: 'onboarding' | 'billing' | 'inactive';
  priority: 'normal' | 'high' | 'critical';
  userId: string | null;
  workspaceId: string | null;
  subject: string;
  reason: string;
  createdAt: string;
  lastKnownActivityAt: string | null;
}
```

The service never returns private document content or message bodies. It uses
bounded, paginated queries and only returns the identity and timestamps needed
for triage.

### Support UI

Add a `Support` navigation item and a page under
`pakka-admin/src/features/admin/support-reporting/` with:

1. KPI cards for onboarding, activation, billing attention, inactivity, and
   support notes.
2. Onboarding trend chart with a proxy disclaimer.
3. Support workload table by admin.
4. Queue filters, priority badges, pagination, and direct links to user or
   workspace 360.
5. Empty/error/loading/retry states.

Support staff can add a note from Customer 360 as in Phase 1. Queue rows do not
get mutable status fields in this phase; queue membership is derived from the
current data, avoiding a new ticket lifecycle that the product does not yet
support.

## Data flow and error handling

The admin frontend continues to use the central API interceptor to unwrap the
normal `{ data: payload }` response. React Query keys include all filter and
date parameters. Reads use a 30–60 second stale time; mutation success
invalidates the relevant operations, 360, timeline, notes, and audit queries.

Backend validation uses DTOs with strict enums, date bounds, page caps, and
non-empty identifiers. Not-found targets return 404; invalid role, owner, or
mutation state returns 400/409; provider unavailability returns the existing
503-style error. The UI displays server messages without exposing raw provider
responses.

Billing and support summary queries must degrade gracefully when no events or
records exist. Missing billing fields are counted in data-quality metadata.
Derived activity timestamps are nullable and shown as “No recorded activity”
rather than fabricated dates.

## Testing and rollout

Backend tests:

- Billing operations filtering, safe payload mapping, currency separation,
  alert classification, provider selection, and replay idempotency.
- Workspace membership add/change/remove transactions, owner protection,
  duplicate protection, role validation, and feature-flag upsert/audit.
- Support KPI calculations, queue classification, inactivity threshold,
  pagination, and explicit data-quality flags.
- Controller/guard coverage for support versus superadmin routes.

Frontend verification:

- Admin build and TypeScript compilation.
- Billing filters, confirmation/error states, and currency display.
- Workspace role/flag mutation refresh behavior.
- Support queue links to both Customer 360 routes.
- Responsive table overflow and empty states.

Database verification:

- `prisma validate` and `prisma generate`.
- Additive feature-flag migration applied without resetting or deleting data.
- Existing pre-existing failed migration remains a separate operational issue;
  Phase 2 must not mark it applied while nullable legacy `contactId` rows still
  exist.

The implementation order is Billing Operations, Workspace Administration, then
Support Reporting. Each slice will compile and test before the next slice is
started, followed by a full backend/admin build and a protected live smoke test.
