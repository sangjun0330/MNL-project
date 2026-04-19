-- Social admin controls and audit logging

CREATE TABLE IF NOT EXISTS public.rnest_social_user_controls (
  user_id TEXT PRIMARY KEY,
  social_state TEXT NOT NULL DEFAULT 'active'
    CHECK (social_state IN ('active', 'read_only', 'suspended')),
  reason TEXT NULL,
  updated_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_user_controls_state
  ON public.rnest_social_user_controls(social_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.rnest_social_admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_admin_audit_log_created
  ON public.rnest_social_admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_admin_audit_log_target
  ON public.rnest_social_admin_audit_log(target_type, target_id, created_at DESC);

ALTER TABLE public.rnest_social_user_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rnest_social_admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_social_user_controls" ON public.rnest_social_user_controls;
CREATE POLICY "deny_social_user_controls"
  ON public.rnest_social_user_controls
  FOR ALL
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_social_admin_audit_log" ON public.rnest_social_admin_audit_log;
CREATE POLICY "deny_social_admin_audit_log"
  ON public.rnest_social_admin_audit_log
  FOR ALL
  USING (false)
  WITH CHECK (false);
