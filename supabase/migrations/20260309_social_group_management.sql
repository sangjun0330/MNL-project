-- Phase 4-B: social group management

ALTER TABLE public.rnest_social_groups
  ADD COLUMN IF NOT EXISTS notice TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS join_mode TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS allow_member_invites BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.rnest_social_groups
  DROP CONSTRAINT IF EXISTS rnest_social_groups_join_mode_check;

ALTER TABLE public.rnest_social_groups
  ADD CONSTRAINT rnest_social_groups_join_mode_check
  CHECK (join_mode IN ('open', 'approval'));

ALTER TABLE public.rnest_social_group_members
  DROP CONSTRAINT IF EXISTS rnest_social_group_members_role_check;

ALTER TABLE public.rnest_social_group_members
  ADD CONSTRAINT rnest_social_group_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

CREATE TABLE IF NOT EXISTS public.rnest_social_group_join_requests (
  id                   BIGSERIAL PRIMARY KEY,
  group_id             BIGINT NOT NULL REFERENCES public.rnest_social_groups(id) ON DELETE CASCADE,
  requester_user_id    TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at         TIMESTAMPTZ,
  responded_by_user_id TEXT REFERENCES public.rnest_users(user_id) ON DELETE SET NULL,
  UNIQUE (group_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_group_join_requests_group
  ON public.rnest_social_group_join_requests(group_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_group_join_requests_user
  ON public.rnest_social_group_join_requests(requester_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rnest_social_group_activity (
  id             BIGSERIAL PRIMARY KEY,
  group_id       BIGINT NOT NULL REFERENCES public.rnest_social_groups(id) ON DELETE CASCADE,
  actor_user_id  TEXT REFERENCES public.rnest_users(user_id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES public.rnest_users(user_id) ON DELETE SET NULL,
  type           TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_group_activity_group
  ON public.rnest_social_group_activity(group_id, created_at DESC);

ALTER TABLE public.rnest_social_group_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rnest_social_group_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_join_requests_select_own_groups" ON public.rnest_social_group_join_requests;
CREATE POLICY "group_join_requests_select_own_groups" ON public.rnest_social_group_join_requests
  FOR SELECT
  USING (
    requester_user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_join_requests.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "group_activity_select_member_groups" ON public.rnest_social_group_activity;
CREATE POLICY "group_activity_select_member_groups" ON public.rnest_social_group_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_activity.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );

