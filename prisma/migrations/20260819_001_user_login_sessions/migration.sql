CREATE TABLE "user_login_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_session_id" TEXT,
    "session_fingerprint" TEXT NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "device_type" TEXT NOT NULL DEFAULT 'unknown',
    "browser" TEXT,
    "os" TEXT,
    "ip_address" TEXT,
    "location" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token_expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "user_login_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_login_sessions_provider_session_id_key"
    ON "user_login_sessions"("provider_session_id");

CREATE UNIQUE INDEX "user_login_sessions_session_fingerprint_key"
    ON "user_login_sessions"("session_fingerprint");

CREATE INDEX "user_login_sessions_user_id_revoked_at_last_active_at_idx"
    ON "user_login_sessions"("user_id", "revoked_at", "last_active_at");

CREATE INDEX "user_login_sessions_token_expires_at_idx"
    ON "user_login_sessions"("token_expires_at");

ALTER TABLE "user_login_sessions"
    ADD CONSTRAINT "user_login_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Session metadata and revocation tombstones are backend-only security data.
-- Keep them inaccessible through Supabase's public-schema REST roles even if
-- the project has permissive default table grants.
ALTER TABLE "user_login_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "user_login_sessions" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE "user_login_sessions" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE "user_login_sessions" FROM authenticated;
    END IF;
END
$$;
