-- Phase 3-B: rnest_social_preferences — 공개 범위·설정
-- Run in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.rnest_social_preferences (
  user_id                TEXT PRIMARY KEY REFERENCES rnest_users(user_id) ON DELETE CASCADE,
  schedule_visibility    TEXT NOT NULL DEFAULT 'full',   -- 'full' | 'off_only' | 'hidden'
  status_message_visible BOOLEAN NOT NULL DEFAULT true,
  accept_invites         BOOLEAN NOT NULL DEFAULT true,
  notify_requests        BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.rnest_social_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_prefs_all" ON public.rnest_social_preferences
  FOR ALL USING (auth.uid()::text = user_id);
