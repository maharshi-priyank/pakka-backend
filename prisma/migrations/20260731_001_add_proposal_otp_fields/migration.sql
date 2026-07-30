-- R7/R8/R10/R12: opt-in OTP gate for Proposal public views, mirroring Contract's
-- signerOtp lifecycle. otpGated/viewOtp are only ever written together by
-- send() (KTD5) so a gated Proposal can never exist without a matching OTP.
-- otpFailedAttempts caps brute-force guessing against the 6-digit code (KTD7).

ALTER TABLE "proposals"
  ADD COLUMN "otpGated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "viewOtp" TEXT,
  ADD COLUMN "otpFailedAttempts" INTEGER NOT NULL DEFAULT 0;
