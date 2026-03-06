-- ============================================================
-- Phase 1: Social Connections
-- Tables: rnest_connect_codes, rnest_connections, rnest_social_profiles
-- ============================================================

-- 1. 개인 연결 코드 테이블
CREATE TABLE IF NOT EXISTS public.rnest_connect_codes (
  user_id    TEXT PRIMARY KEY REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connect_codes_code
  ON public.rnest_connect_codes(code);

ALTER TABLE public.rnest_connect_codes ENABLE ROW LEVEL SECURITY;

-- service role key(admin client)는 RLS를 우회함 — 클라이언트 직접 접근 시 본인만
CREATE POLICY "own_only" ON public.rnest_connect_codes
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- 2. 친구 연결 상태 테이블
CREATE TABLE IF NOT EXISTS public.rnest_connections (
  id           BIGSERIAL PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  receiver_id  TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','accepted','rejected','blocked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, receiver_id),
  CHECK (requester_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_receiver
  ON public.rnest_connections(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_requester
  ON public.rnest_connections(requester_id, status);

ALTER TABLE public.rnest_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_connections" ON public.rnest_connections
  FOR ALL
  USING (requester_id = auth.uid()::text OR receiver_id = auth.uid()::text)
  WITH CHECK (requester_id = auth.uid()::text OR receiver_id = auth.uid()::text);

-- 3. 소셜 프로필 테이블 (닉네임 + 아바타)
CREATE TABLE IF NOT EXISTS public.rnest_social_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  nickname     TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '🐧',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rnest_social_profiles ENABLE ROW LEVEL SECURITY;

-- 타인 프로필은 admin client를 통해서만 서버에서 조회 가능
CREATE POLICY "own_write" ON public.rnest_social_profiles
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
