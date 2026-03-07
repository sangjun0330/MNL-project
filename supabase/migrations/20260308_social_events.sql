-- Phase 3-A: rnest_social_events — 소셜 이벤트/알림함
-- Run in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.rnest_social_events (
  id           BIGSERIAL PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES rnest_users(user_id) ON DELETE CASCADE,
  actor_id     TEXT REFERENCES rnest_users(user_id) ON DELETE SET NULL,
  type         TEXT NOT NULL,   -- 'connection_request' | 'connection_accepted' | 'connection_rejected'
  entity_id    TEXT,            -- connection id (string-ified)
  payload      JSONB NOT NULL DEFAULT '{}',  -- { nickname, avatarEmoji }
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedupe_key   TEXT UNIQUE      -- 중복 INSERT 방지 (ON CONFLICT DO NOTHING)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_social_events_recipient
  ON public.rnest_social_events(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_events_unread
  ON public.rnest_social_events(recipient_id, read_at)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE public.rnest_social_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_events_select" ON public.rnest_social_events
  FOR SELECT USING (auth.uid()::text = recipient_id);

-- Realtime 활성화
ALTER TABLE public.rnest_social_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rnest_social_events;
