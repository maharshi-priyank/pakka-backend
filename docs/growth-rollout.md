# Growth intelligence rollout

## Before deployment

- This database has a historical failed contact migration. The repository
  repair preserves valid unassociated legacy rows instead of inventing contacts
  or deleting data. After pulling this repair, run:
  `npx prisma migrate resolve --rolled-back 20260709_003_enforce_contactid_notnull`
  followed by `npx prisma migrate deploy`.
- Before resolving, restore the exact migration directories already recorded in
  the database (`20260803_001_add_lead_source_form_and_contact` and
  `20260803_002_add_intake_form_captures_leads`) from the release artifact that
  applied them. Do not create placeholder migration files; Prisma validates
  migration history checksums.
- The deploy will then apply `202608030001_product_events`.
- Generate the Prisma client during install/build.
- Confirm admin JWT role enforcement: support can read `/api/v1/admin/growth/overview` and `/segments`; superadmin alone can call `/export`.
- Confirm the customer app can call `/api/v1/product-events` with a tenant JWT.

## Healthy signals

- `ProductEventsService` writes are mostly successful; occasional client telemetry failures do not fail the originating customer action.
- Growth responses report a current freshness timestamp and the coverage boundary `2026-08-03T00:00:00.000Z`.
- Collections are grouped by explicit currency, with no implicit INR bucket.
- Admin export audit entries contain actor, report, filters, time range, and row count, but no event payloads.

## Failure and rollback

If telemetry writes cause request latency or database pressure, disable client event calls at the app release boundary while retaining server-owned billing/onboarding writes. The migration is additive and nullable/defaulted, so restoring the previous application version leaves the new table and fields in place without changing existing customer data.
