-- ============================================================
-- Phase 2: Social security hardening + share links
-- Tables: rnest_social_share_invites, rnest_social_action_attempts
-- ============================================================

ALTER TABLE public.rnest_connect_codes
  ADD COLUMN IF NOT EXISTS share_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.rnest_social_share_invites (
  id                   BIGSERIAL PRIMARY KEY,
  inviter_user_id      TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  token_hash           TEXT NOT NULL UNIQUE,
  issued_share_version INTEGER NOT NULL DEFAULT 1,
  expires_at           TIMESTAMPTZ NOT NULL,
  resolve_count        INTEGER NOT NULL DEFAULT 0,
  last_resolved_at     TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_share_invites_inviter
  ON public.rnest_social_share_invites(inviter_user_id, expires_at DESC);

ALTER TABLE public.rnest_social_share_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_social_share_invites" ON public.rnest_social_share_invites
  FOR SELECT
  USING (inviter_user_id = auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.rnest_social_action_attempts (
  id            BIGSERIAL PRIMARY KEY,
  action        TEXT NOT NULL,
  actor_user_id TEXT REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  actor_ip      TEXT,
  success       BOOLEAN NOT NULL DEFAULT false,
  detail        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (actor_user_id IS NOT NULL OR actor_ip IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_social_action_attempts_user
  ON public.rnest_social_action_attempts(action, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_action_attempts_ip
  ON public.rnest_social_action_attempts(action, actor_ip, created_at DESC);

ALTER TABLE public.rnest_social_action_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_social_action_attempts" ON public.rnest_social_action_attempts
  FOR ALL
  USING (false)
  WITH CHECK (false);
