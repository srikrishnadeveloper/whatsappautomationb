-- Migration: Add Gmail integration tables
-- Stores Google OAuth tokens and Gmail messages for classification

-- ===========================================
-- 1. Gmail OAuth tokens (per user)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.gmail_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    scopes TEXT,
    google_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Gmail tokens"
    ON public.gmail_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Gmail tokens"
    ON public.gmail_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail tokens"
    ON public.gmail_tokens FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail tokens"
    ON public.gmail_tokens FOR DELETE
    USING (auth.uid() = user_id);

-- ===========================================
-- 2. Gmail messages table
-- ===========================================
CREATE TABLE IF NOT EXISTS public.gmail_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    gmail_id TEXT NOT NULL,
    thread_id TEXT,
    from_email TEXT NOT NULL,
    from_name TEXT,
    to_email TEXT,
    subject TEXT,
    snippet TEXT,
    body_text TEXT,
    labels TEXT[],
    gmail_timestamp TIMESTAMPTZ NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    has_attachments BOOLEAN DEFAULT FALSE,
    classification TEXT,
    decision TEXT,
    priority TEXT,
    ai_reasoning TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, gmail_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_id ON public.gmail_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_gmail_id ON public.gmail_messages(gmail_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_timestamp ON public.gmail_messages(gmail_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_classification ON public.gmail_messages(classification);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_decision ON public.gmail_messages(decision);

ALTER TABLE public.gmail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Gmail messages"
    ON public.gmail_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Gmail messages"
    ON public.gmail_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail messages"
    ON public.gmail_messages FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail messages"
    ON public.gmail_messages FOR DELETE
    USING (auth.uid() = user_id);

-- ===========================================
-- 3. Triggers for updated_at
-- ===========================================
CREATE TRIGGER update_gmail_tokens_updated_at BEFORE UPDATE ON public.gmail_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gmail_messages_updated_at BEFORE UPDATE ON public.gmail_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 4. Add avatar_url and provider fields to profiles
-- ===========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'email';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS google_id TEXT;

-- ===========================================
-- 5. Gmail sync state tracking
-- ===========================================
CREATE TABLE IF NOT EXISTS public.gmail_sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    last_history_id TEXT,
    last_sync_at TIMESTAMPTZ,
    sync_enabled BOOLEAN DEFAULT TRUE,
    total_synced INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync state"
    ON public.gmail_sync_state FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync state"
    ON public.gmail_sync_state FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sync state"
    ON public.gmail_sync_state FOR UPDATE
    USING (auth.uid() = user_id);
