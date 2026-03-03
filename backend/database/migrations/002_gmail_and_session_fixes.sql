-- Migration 002: Gmail tables + service-role RLS bypass
-- Run this in Supabase SQL editor

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Gmail tokens table
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.gmail_tokens (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token     TEXT NOT NULL,
    refresh_token    TEXT,
    token_expiry     TIMESTAMPTZ,
    scopes           TEXT,
    google_email     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_tokens_user_id ON public.gmail_tokens(user_id);

ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY IF NOT EXISTS "Users can view their own Gmail tokens"
    ON public.gmail_tokens FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own Gmail tokens"
    ON public.gmail_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own Gmail tokens"
    ON public.gmail_tokens FOR UPDATE USING (auth.uid() = user_id);

-- SERVICE ROLE bypass (allows backend server writes that don't carry a user JWT)
CREATE POLICY IF NOT EXISTS "Service role full access to gmail_tokens"
    ON public.gmail_tokens
    USING (current_setting('role') = 'service_role')
    WITH CHECK (current_setting('role') = 'service_role');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Gmail messages table
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.gmail_messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    gmail_id            TEXT NOT NULL,
    thread_id           TEXT,
    from_email          TEXT,
    from_name           TEXT,
    to_email            TEXT,
    subject             TEXT,
    snippet             TEXT,
    body_text           TEXT,
    body_html           TEXT,
    labels              TEXT[],
    gmail_timestamp     TIMESTAMPTZ,
    is_read             BOOLEAN DEFAULT FALSE,
    has_attachments     BOOLEAN DEFAULT FALSE,
    classification      TEXT,
    decision            TEXT,
    priority            TEXT,
    ai_reasoning        TEXT,
    metadata            JSONB,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, gmail_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_id    ON public.gmail_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_gmail_id   ON public.gmail_messages(gmail_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_timestamp  ON public.gmail_messages(gmail_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_class      ON public.gmail_messages(classification);

ALTER TABLE public.gmail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own Gmail messages"
    ON public.gmail_messages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert their own Gmail messages"
    ON public.gmail_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own Gmail messages"
    ON public.gmail_messages FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete their own Gmail messages"
    ON public.gmail_messages FOR DELETE USING (auth.uid() = user_id);

-- SERVICE ROLE bypass
CREATE POLICY IF NOT EXISTS "Service role full access to gmail_messages"
    ON public.gmail_messages
    USING (current_setting('role') = 'service_role')
    WITH CHECK (current_setting('role') = 'service_role');

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Gmail sync state table
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.gmail_sync_state (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    last_sync_at    TIMESTAMPTZ,
    last_history_id TEXT,
    total_synced    INTEGER DEFAULT 0,
    sync_enabled    BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_user_id ON public.gmail_sync_state(user_id);

ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own Gmail sync state"
    ON public.gmail_sync_state FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can upsert their own Gmail sync state"
    ON public.gmail_sync_state FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update their own Gmail sync state"
    ON public.gmail_sync_state FOR UPDATE USING (auth.uid() = user_id);

-- SERVICE ROLE bypass
CREATE POLICY IF NOT EXISTS "Service role full access to gmail_sync_state"
    ON public.gmail_sync_state
    USING (current_setting('role') = 'service_role')
    WITH CHECK (current_setting('role') = 'service_role');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. WhatsApp sessions — add SERVICE ROLE bypass policy
--    (backend writes session_data without a user JWT during auto-reconnect)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'whatsapp_sessions'
      AND policyname = 'Service role full access to whatsapp_sessions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Service role full access to whatsapp_sessions"
          ON public.whatsapp_sessions
          USING (current_setting('role') = 'service_role')
          WITH CHECK (current_setting('role') = 'service_role')
    $policy$;
  END IF;
END$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Updated_at triggers for new tables
-- ════════════════════════════════════════════════════════════════════════════
CREATE TRIGGER update_gmail_tokens_updated_at
    BEFORE UPDATE ON public.gmail_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_messages_updated_at
    BEFORE UPDATE ON public.gmail_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_sync_state_updated_at
    BEFORE UPDATE ON public.gmail_sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. System state / offline tracking (used by whatsapp-integrated.ts)
--    Server-only table — no per-user data, no RLS needed.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.system_state (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key             TEXT UNIQUE NOT NULL,
    value           TEXT,   -- JSON string
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_state_key ON public.system_state(key);

-- No RLS on system_state — it is purely a server-side key/value store.
-- If your project requires RLS everywhere, enable it and add a service-role bypass:
-- ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Service role only" ON public.system_state USING (current_setting('role') = 'service_role');
