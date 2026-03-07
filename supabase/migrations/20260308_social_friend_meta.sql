-- Phase 3-C: rnest_social_friend_meta — 핀·별칭·뮤트
-- Run in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.rnest_social_friend_meta (
  owner_id   TEXT NOT NULL REFERENCES rnest_users(user_id) ON DELETE CASCADE,
  friend_id  TEXT NOT NULL REFERENCES rnest_users(user_id) ON DELETE CASCADE,
  pinned     BOOLEAN NOT NULL DEFAULT false,
  alias      TEXT NOT NULL DEFAULT '',   -- 최대 12자, cleanSocialNickname() 적용
  muted      BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, friend_id)
);

-- RLS
ALTER TABLE public.rnest_social_friend_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_meta_all" ON public.rnest_social_friend_meta
  FOR ALL USING (auth.uid()::text = owner_id);
