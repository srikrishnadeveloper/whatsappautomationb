-- Migration 002: Privacy & Encryption Support
-- Run in Supabase SQL Editor

-- ── Privacy: blocked senders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS privacy_blocked_senders (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      TEXT        NOT NULL,  -- WhatsApp phone number OR Supabase UUID
  jid          TEXT        NOT NULL,  -- WhatsApp JID or bare phone
  display_name TEXT        NOT NULL DEFAULT '',
  type         TEXT        NOT NULL DEFAULT 'contact' CHECK (type IN ('contact', 'group')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, jid)
);

-- Index for fast lookups during message ingestion
CREATE INDEX IF NOT EXISTS idx_privacy_blocked_user_jid
  ON privacy_blocked_senders (user_id, jid);

-- RLS: each user can only see/modify their own entries
ALTER TABLE privacy_blocked_senders ENABLE ROW LEVEL SECURITY;

-- Policy for Supabase-authenticated users (UUID user_id)
CREATE POLICY "Users manage own blocked senders"
  ON privacy_blocked_senders
  FOR ALL
  USING  (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- ── Encryption marker column (optional, for audit) ────────────────────────
-- Add a flag column to messages table to track which rows are encrypted.
-- The actual encryption/decryption is handled in the application layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'content_encrypted'
  ) THEN
    ALTER TABLE messages ADD COLUMN content_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END
$$;
