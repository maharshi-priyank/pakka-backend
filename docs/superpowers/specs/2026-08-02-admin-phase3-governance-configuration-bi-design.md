# Admin Phase 3 Governance, Configuration, and Business Intelligence Design

Date: 2026-08-02

Status: Design approved in conversation; written-spec review pending.

## Context

Phase 1 added cross-tenant analytics, global search, Customer 360 views,
activity timelines, and append-only support notes. Phase 2 added billing
operations, workspace member and feature-flag administration, and derived
support/onboarding reporting. The admin console now has operational visibility,
but it still lacks a complete governance surface, cross-tenant product
configuration tools, and finance/cohort reporting.

The current application already contains the source records needed for most of
Phase 3: `AuditLog`, `AdminUser`, billing events, users, workspaces, invoices,
automation rules and executions, workflows and runs, document templates, email
templates, WhatsApp connections, and communication logs. The schema does not
contain historical login telemetry, historical onboarding transitions, a
general accounting ledger, or a reporting warehouse.

Phase 3 therefore uses focused request-time admin services and explicit data
quality labels. It does not pretend that current-state fields are historical
events, and it does not introduce a warehouse before the operational need is
proven.

## Goals

- Give superadmins a reliable audit, security, bulk-operation, alert, and
  saved-view foundation.
- Let admins inspect and safely operate existing templates, automations,
  workflows, and integration health across tenants.
- Provide finance and operations reports for collections, invoice aging,
  reconciliation signals, cohorts, activation, and retention proxies.
- Preserve the separate admin JWT boundary, existing admin role hierarchy,
  append-only audit model, and tenant data ownership rules.
- Keep the three tracks independently testable while sharing common contracts.
- Make every derived metric and every data limitation visible in the UI and
  API response metadata.

## Non-goals

- No customer-facing `pakka-app` redesign or new tenant workflow in this phase.
- No analytics warehouse, event-stream infrastructure, scheduled snapshot job,
  or currency conversion service.
- No provider-side payment retry, automatic refund, accounting adjustment, or
  revenue-editing operation.
- No bulk refund, billing-event replay, destructive member removal, arbitrary
  automation trigger, or bulk workflow replay.
- No email, push, or outbound support campaign automation from the admin alert
  center.
- No exposure of passwords, JWTs, API keys, encrypted tokens, bank details,
  raw billing payloads, message bodies, or unrestricted private tenant content.

## Alternatives considered

### One large Phase 3 admin suite

This would place governance, configuration, and BI logic in one module and one
page tree. It would appear fast initially, but it would combine high-risk
mutations with sensitive reporting and create a broad authorization surface.
It is not recommended.

### Three feature tracks with shared foundations

This is the recommended approach. Governance is implemented first because its
audit, confirmation, export, alert, and saved-view contracts are reused by
configuration and BI. Product configuration then uses existing tenant models,
and BI consumes the existing transactional data through explicit report
contracts. Each track has a focused backend service and frontend surface.

### A reporting warehouse and configuration control plane

This would provide stronger historical reporting and lower query cost, while a
separate control plane could provide versioned configuration. It requires
complete event capture, backfills, scheduling, retention, and new operational
infrastructure that the current schema does not justify. The Phase 3 service
boundaries leave room to introduce those systems later.

## Delivery sequence

Phase 3 is one product milestone with three independently verifiable slices:

1. Governance foundation: audit explorer, security events, bulk operations,
   alerts, saved views, and shared export/redaction helpers.
2. Product and configuration management: templates, automation/workflow
   controls, and integration health.
3. Business intelligence: revenue/reconciliation reports, cohorts, retention
   proxies, invoice aging, and filtered exports.

The first slice must land before the later slices use its action-confirmation,
audit, alert, and export contracts.

## Shared architecture and policy

### Authorization

All routes remain under `/api/v1/admin/**`, use the existing admin JWT, and are
protected by `AdminGuard` plus `RequireAdmin`.

- `SUPPORT` may read operational alerts, configuration metadata, integration
  health, and business reports, and may save personal views.
- `SUPERADMIN` may read security events and audit exports, inspect sensitive
  template content, perform configuration mutations, execute bulk actions, and
  export finance-sensitive datasets.
- No Phase 3 route accepts a tenant-user JWT or an impersonated tenant session
  as an admin credential.

### Audit and redaction

Existing `AuditLog` remains the source of truth for admin mutations. Every new
mutation records the operator, role, target, action, reason, and safe before/
after metadata. Full template content, credentials, raw billing payloads, and
message bodies are replaced with hashes, counts, or redacted markers.

The shared response serializer applies the same redaction policy to audit
responses, exports, alert details, execution errors, and configuration detail
responses. Every mutation response includes enough information for the UI to
refresh the affected query without returning private data.

### Dates, pagination, and exports

- Request-time report ranges are ISO timestamps and capped at 365 days unless
  a route documents a smaller security/export range.
- List endpoints return `{ items, total, page, pageSize }` and cap page size at
  100 or the route-specific safe maximum.
- CSV exports preserve current filters, escape cells, enforce row/date limits,
  and never combine monetary values from different currencies.
- Empty, partial, and data-quality states are first-class responses rather than
  errors.

### Error and mutation behavior

All destructive or tenant-impacting UI actions require confirmation and a
reason where appropriate. Services re-check target existence, permissions,
ownership, and current state at execution time. Bulk operations report each
target independently; one invalid target does not hide the remaining results.

## Track 1: Governance and automation foundation

### Data model additions

Add additive Prisma models and a migration:

```prisma
model AdminSecurityEvent {
  id         String   @id @default(cuid())
  adminId    String?  @map("admin_id")
  email      String
  outcome    String
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  at         DateTime @default(now())

  @@index([email])
  @@index([outcome, at])
  @@map("admin_security_events")
}

model AdminSavedView {
  id        String   @id @default(cuid())
  adminId   String   @map("admin_id")
  page      String
  name      String
  filters   Json
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([adminId, page])
  @@map("admin_saved_views")
}

model AdminAlertDismissal {
  id           String   @id @default(cuid())
  adminId      String   @map("admin_id")
  fingerprint  String
  dismissedAt  DateTime @default(now()) @map("dismissed_at")

  @@unique([adminId, fingerprint])
  @@index([adminId])
  @@map("admin_alert_dismissals")
}

model AdminBulkOperation {
  id          String   @id @default(cuid())
  adminId     String   @map("admin_id")
  action      String
  status      String
  targetIds   Json     @map("target_ids")
  input       Json?
  preview     Json?
  result      Json?
  reason      String?
  createdAt   DateTime @default(now()) @map("created_at")
  executedAt  DateTime? @map("executed_at")

  @@index([adminId, createdAt])
  @@index([status, createdAt])
  @@map("admin_bulk_operations")
}
```

Security events store only operational login metadata. They never store a
password, token, or request body. The security list has a bounded date range
and redacts or truncates user-agent and address values as appropriate for the
admin UI.

### Audit explorer API

Enhance `GET /admin/audit` with admin email/name enrichment, role, target links,
date range, reason, pagination, and safe before/after differences. Add:

- `GET /admin/audit/export` — superadmin-only CSV export using the same filters.
- `GET /admin/audit/filters` — safe distinct admin, target, and action options
  for filter controls.

The existing audit route remains compatible with current query parameters.

### Security API

Add a focused `admin/security` controller:

- `GET /admin/security/overview` — login success/failure counts, recent failure
  rate, affected emails, and data-quality metadata.
- `GET /admin/security/events` — paginated events with date, outcome, email,
  and bounded metadata filters.

The admin auth service writes a security event for both successful and failed
login attempts. Failed attempts are recorded without revealing whether an
email exists in the authentication response.

### Bulk action API

Add `admin/bulk-operations`:

- `POST /admin/bulk/preview` — validates an allowlisted action and returns a
  persisted operation ID, eligible targets, skipped targets, and reasons.
- `POST /admin/bulk/:id/execute` — revalidates the preview, applies the action,
  records per-target results, and writes one audit entry per successful
  mutation.
- `GET /admin/bulk/:id` — returns operation status and redacted results.

The initial allowlist is:

- Workspace archive or restore.
- Workspace feature-flag update.
- User plan override.
- Subscription synchronization.

Batch size is capped, preview records expire through status validation, and
financial or provider-side actions remain excluded unless explicitly listed.
The preview validity window is 10 minutes from `createdAt`; `input` stores only
allowlisted scalar parameters and target IDs, never template content, billing
payloads, credentials, or private message content.

### Alerts and saved views API

Add:

- `GET /admin/alerts` — combines billing, support, onboarding, and security
  alerts with stable fingerprints and severity.
- `POST /admin/alerts/:fingerprint/dismiss` — records per-admin dismissal.
- `GET /admin/saved-views?page=...`.
- `POST /admin/saved-views`.
- `PATCH /admin/saved-views/:id`.
- `DELETE /admin/saved-views/:id`.

Alerts are derived from current operational data; dismissal state is persisted
separately so a changed underlying event produces a new fingerprint.

### Governance UI

Upgrade the existing Audit page with filter chips, date presets, enriched
targets, expandable safe diffs, saved views, export, loading/error/empty
states, and links to affected users/workspaces. Add Security and Alerts pages
and a reusable notification indicator in the admin shell. Add a preview and
result modal for bulk operations; the modal must show skipped records before
the execute button is enabled.

### Governance testing

Cover:

- Successful and failed login security events.
- Audit redaction and CSV escaping.
- Support versus superadmin route authorization.
- Saved-view CRUD ownership.
- Bulk preview validation, stale-target revalidation, partial failures, and
  per-item audit records.
- Alert fingerprinting and dismissal behavior.

## Track 2: Product and configuration management

### Configuration inventory

Create a focused `admin/configuration` module with separate services for
templates, automation/workflows, and integrations. It reads the existing
tenant-scoped models; it does not create duplicate configuration tables.

### Template API and rules

Add normalized cross-tenant read endpoints:

- `GET /admin/configuration/templates?type=&workspaceId=&q=&page=`.
- `GET /admin/configuration/templates/:type/:id`.

Supported types are email, proposal, contract, and invoice. List responses
contain workspace, type, name/key, category, system/default/customized state,
usage count, and timestamps.

Superadmin-only actions:

- `PATCH /admin/configuration/templates/:type/:id` for supported fields.
- `POST /admin/configuration/templates/:type/:id/preview` using sample data.
- `POST /admin/configuration/templates/:type/:id/reset` where the existing
  template type supports reset.
- `POST /admin/configuration/templates/:type/:id/set-default` where the
  existing document-template rules support defaults.

The service preserves each existing template service's tenant invariants,
validates content size and shape, and never allows an admin action to bypass
system-template or default-template protections. Email edits are limited to
subject and rendered HTML body; proposal, contract, and invoice edits are
limited to the fields already accepted by their tenant service. Audit entries
contain safe metadata and content hashes rather than full content snapshots.
Support admins see metadata but not raw template content.

### Automation and workflow API

Add:

- `GET /admin/configuration/automations` — cross-tenant rules with workspace,
  active/system state, trigger/action categories, run counts, and last run.
- `GET /admin/configuration/automations/:id/executions` — bounded, sanitized
  execution history.
- `PATCH /admin/configuration/automations/:id` — superadmin enable/disable,
  preserving the existing rule configuration.
- `GET /admin/configuration/workflows` — cross-tenant workflow inventory and
  status summary.
- `GET /admin/configuration/workflows/:id/runs` — bounded run history.
- `PATCH /admin/configuration/workflows/:id` — superadmin pause/resume.
- `POST /admin/configuration/workflow-runs/:id/cancel` — superadmin cancel only
  when the current run state permits cancellation.

Arbitrary trigger execution, action-config editing, and bulk workflow replay
are excluded. Error strings are sanitized and truncated before returning.
Every mutation uses the governance audit contract.

### Integration health API

Add:

- `GET /admin/configuration/integrations/overview` — counts and health states
  for WhatsApp, email delivery, and communication logs.
- `GET /admin/configuration/integrations/:provider?workspaceId=` — bounded
  workspace-level health details.
- `POST /admin/configuration/integrations/:provider/:workspaceId/check` —
  read-only health check that never returns credentials.

WhatsApp responses include only connection state, display phone, connected and
updated timestamps, and stale/inactive indicators. Email status is based on
configured transport and communication-log outcomes. No disconnect, token
rotation, or credential mutation is introduced.

### Configuration UI

Add a Configuration navigation area with Templates, Automations, Workflows,
and Integrations tabs. Lists support saved views, workspace/search filters,
pagination, status badges, detail drawers, previews, confirmations, and links
to audit history. Support controls are read-only; superadmin controls require
reason and confirmation.

### Configuration testing

Cover:

- Cross-tenant template normalization and type-specific invariants.
- Template content redaction and preview safety.
- System/default-template protection.
- Automation/workflow authorization, state transitions, cancellation rules,
  and sanitized errors.
- Integration health responses never containing credential fields.
- Audit entries for every configuration mutation.

## Track 3: Business intelligence and reconciliation

### Revenue and reconciliation semantics

Create `admin/business-intelligence` with a bounded report service. Reports keep
these streams separate:

1. Successful provider collections from known successful `BillingEvent` rows,
   grouped by provider and currency.
2. Customer invoice totals, amount paid, outstanding balance, overdue balance,
   and aging buckets from `Invoice`.
3. Refund and failed-payment signals where the existing billing data contains
   a safe reference and amount.

The service returns reconciliation indicators rather than accounting truth:

- Billing events without amount, currency, user, workspace, or invoice
  references.
- Invoices whose paid amount/status is inconsistent.
- Provider references that cannot be matched to an invoice or subscription.
- Potential duplicate references detected within the selected report range.

Amounts are grouped by currency and never converted or combined. Raw payloads,
line items, bank data, and payment credentials are not returned.

### Cohort and retention semantics

Add monthly signup cohorts for users and workspaces with:

- New accounts/workspaces.
- Current onboarding completion.
- 7/30/90-day activation proxy.
- Current subscription distribution.
- Activity proxy based on selected product-entity activity.
- Collections linked to a cohort only when a billing event has a usable user or
  workspace reference.

The response includes `dataQuality` flags stating that onboarding completion is
current state rather than a historical transition and that login telemetry is
unavailable. Retention is labeled a product-activity/subscription proxy, not
an exact login-based retention rate.

### Report API

Add:

- `GET /admin/bi/revenue/overview` — currency/provider collections and invoice
  summaries.
- `GET /admin/bi/reconciliation` — mismatch and missing-reference queues.
- `GET /admin/bi/cohorts` — cohort matrix and activation/retention proxies.
- `GET /admin/bi/invoice-aging` — aging buckets and workspace summaries.
- `GET /admin/bi/export?report=...` — filtered CSV through the shared export
  limits.

All report endpoints accept ISO range, plan, subscription status, provider,
currency, workspace, and pagination filters where relevant. Report ranges are
capped at 365 days and large row-oriented reports are paginated.

### BI UI

Add a Business intelligence navigation area with Revenue, Reconciliation,
Cohorts, and Invoice Aging tabs. Use currency-separated KPI cards, trend
charts, cohort tables/heatmaps, aging buckets, mismatch queues, data-quality
notices, filter persistence, export controls, and links to Customer 360 or
Workspace 360. No mixed-currency KPI is rendered.

### BI testing

Cover:

- Currency/provider separation and no mixed-currency totals.
- Invoice aging and paid/outstanding calculations.
- Missing-reference and mismatch classification.
- Cohort assignment and proxy data-quality flags.
- Export filter preservation, bounds, and redaction.
- Empty, partial, and invalid-range responses.

## Backward compatibility and migration

All schema additions are additive. Existing Phase 1 and Phase 2 routes remain
available. Existing tenant template and automation services remain the source
of truth for business invariants; admin services call or reproduce those
invariants explicitly rather than weakening them.

The historical `20260709_003_enforce_contactid_notnull` migration must not
invent contacts, delete unassociated records, or be marked applied while the
live database contains nullable `contactId` rows. The compatibility repair
keeps those columns nullable and adds only the safe thread lookup index;
future NOT NULL enforcement requires a separate, verified data-backfill plan.

## Verification and rollout

Before release:

1. Generate Prisma client and validate the schema.
2. Apply the additive Phase 3 migration in a non-production environment.
3. Run backend unit/service tests and frontend type/build checks.
4. Run authorization tests for support and superadmin roles.
5. Smoke-test read endpoints with seeded admin credentials without printing
   tokens or private records.
6. Smoke-test bulk preview with no execute mutation, then verify one safe
   mutation and its audit entry in a controlled environment.
7. Verify every export is filtered, bounded, currency-safe, and redacted.
8. Confirm existing Phase 1 and Phase 2 pages still load and that the known
   failed contactId migration remains clearly reported.

Rollout is additive and can be staged by navigation area. Governance should be
enabled first, configuration mutations second, and BI reports third. Any slow
request-time report should be bounded or temporarily disabled rather than
silently presenting incomplete totals.
