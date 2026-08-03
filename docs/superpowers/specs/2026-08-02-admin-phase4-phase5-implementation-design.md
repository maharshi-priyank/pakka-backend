# Admin Phase 4 and Phase 5 Implementation Design

## Context

Phase 1–3 delivered admin analytics, support operations, governance, configuration, and business intelligence. Phase 4 extends that foundation with admin-team governance, reliability/incident management, and customer lifecycle CRM. Phase 5 unifies those surfaces in an actionable command center.

The implementation must preserve the existing split between tenant authentication and admin authentication, explicit target IDs for cross-tenant access, audit logging for state changes, and redaction of secrets and sensitive payloads.

## Phase 4 scope

### 1. Admin governance

Extend `AdminUser` with account status and lockout metadata. Add persisted admin sessions so a revoked session is rejected immediately even though the admin JWT remains self-contained. Keep the existing two-tier role model (`SUPPORT`, `SUPERADMIN`) and centralize capability checks in `AdminGuard`.

Add an admin-team API and UI for listing, inspecting, creating, changing role, suspending, reactivating, resetting passwords, and revoking sessions. Mutations require reasons where appropriate and are audited without secrets. Safety rules prevent self-suspension and removal/demotion of the last active superadmin.

### 2. Reliability and incidents

Add persisted incidents and timeline events. Health is derived from existing operational data: billing failures, automation and workflow failures, stuck runs, communication delivery failures, stale integrations, security failures, and database connectivity. Repeated derived alerts use a stable fingerprint and update an existing incident rather than creating duplicates.

Add operations overview, failure inspection, incident lifecycle endpoints, assignment, comments, acknowledgement, resolution, and safe source actions. Support can manage incident workflow; superadmins can execute high-impact recovery actions. All state changes are audited.

### 3. Customer lifecycle CRM

Use `Workspace` as the primary customer account and attach users, subscription, billing, onboarding, engagement, integrations, support notes, communications, alerts, and incidents. Compute an explainable health score and lifecycle stage from available data; label activity and retention metrics as proxies where telemetry is incomplete.

Add persistent customer tasks and tags, searchable customer segments, saved views, customer 360 details, timeline, export, and links to existing BI, billing, support, and incident pages. Never return credentials, tokens, payment secrets, or raw provider payloads.

## Phase 5 scope: Admin command center

Add a unified `/admin/command-center` view backed by a single aggregation endpoint. It combines:

- overall service health and open incident severity;
- at-risk, past-due, inactive, and onboarding-incomplete customer counts;
- failed automation/workflow and communication signals;
- recent security and billing alerts;
- admin follow-up task queue;
- prioritized action feed with deep links to the source record.

The command center is read-heavy and safe by default. It supports date range and severity filters, refresh, CSV export, and links into the specialized admin pages. It does not duplicate source mutations; actions remain on governance, operations, customer, billing, or configuration pages and are protected by their existing role checks.

## Data model additions

Add the following Prisma models/enums:

- `AdminUserStatus`: `ACTIVE`, `SUSPENDED`, `INVITED`.
- `AdminSession`: admin ID, session/JWT ID, timestamps, IP/user-agent metadata, revocation metadata.
- `AdminIncident`: fingerprint, source, service, title, description, severity, status, affected workspace, owner, detection and resolution timestamps, metadata.
- `AdminIncidentEvent`: incident timeline event, actor, type, message, metadata, timestamp.
- `AdminCustomerTask`: target type/id, title, body, owner, status, due/completion timestamps.
- `AdminCustomerTag`: target type/id, tag, creator, timestamps, unique target/tag pair.

The migration is additive and indexes list/filter paths. Existing applied migrations are not rewritten. The historical failed migration `20260709_003_enforce_contactid_notnull` is handled by a compatibility repair that preserves live nullable rows and adds only its safe thread lookup index; it is not treated as applied until that repair is deployed.

## API conventions

- Controllers remain under `/admin/**` and use `AdminGuard` plus `RequireAdmin`.
- DTOs validate query ranges, enums, IDs, and reason fields.
- Responses use explicit `select` objects and redact secrets.
- Mutating service methods perform the state transition and audit write together where possible.
- Incident detection is idempotent by fingerprint.
- Customer reads use explicit target IDs and never infer the caller's tenant workspace.

## UI conventions

Add routes for team governance, operations/incidents, customers, and command center. Reuse existing admin tokens, React Query hooks, cards, tables, badges, confirmation patterns, and responsive layout. Pages should remain usable without chart libraries by using compact CSS bars and tables where appropriate.

## Verification

- Prisma validate and generated client compile.
- Backend build and test suite pass.
- Admin Vite build passes.
- `git diff --check` passes.
- Protected smoke checks cover admin team, operations, incidents, customers, and command center endpoints.
- Existing Phase 1–3 endpoints remain green.
