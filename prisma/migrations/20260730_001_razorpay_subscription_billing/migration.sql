-- Migrate ClearWork's own SaaS subscription billing from Cashfree to Razorpay.
-- Client-facing invoice payments (Invoice.razorpayOrderId/razorpayPaymentId,
-- Workspace.razorpayKeyId/razorpayKeySecret) are a separate, already-Razorpay
-- BYOK system and are untouched by this migration.
--
-- Safe to run: both cashfreeSubscriptionId and cashfreePlanId are NULL for
-- every existing row (no live Cashfree subscriptions were ever activated —
-- confirmed against production data before writing this migration).

ALTER TABLE "users" RENAME COLUMN "cashfreeSubscriptionId" TO "razorpaySubscriptionId";
ALTER TABLE "users" RENAME COLUMN "cashfreePlanId" TO "razorpayPlanId";
ALTER TABLE "billing_events" RENAME COLUMN "cashfreeRef" TO "razorpayRef";
