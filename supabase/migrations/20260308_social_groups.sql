-- Phase 4-A: rnest social groups core

CREATE TABLE IF NOT EXISTS public.rnest_social_groups (
  id             BIGSERIAL PRIMARY KEY,
  owner_user_id  TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  invite_version INTEGER NOT NULL DEFAULT 1,
  max_members    INTEGER NOT NULL DEFAULT 12,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(name) > 0),
  CHECK (max_members BETWEEN 2 AND 24)
);

CREATE TABLE IF NOT EXISTS public.rnest_social_group_members (
  group_id   BIGINT NOT NULL REFERENCES public.rnest_social_groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_groups_owner
  ON public.rnest_social_groups(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_group_members_user
  ON public.rnest_social_group_members(user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_group_members_group
  ON public.rnest_social_group_members(group_id, joined_at ASC);

ALTER TABLE public.rnest_social_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rnest_social_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_select_own_groups" ON public.rnest_social_group_members;
CREATE POLICY "group_members_select_own_groups" ON public.rnest_social_group_members
  FOR SELECT
  USING (
    public.rnest_social_group_members.user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = public.rnest_social_group_members.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "groups_select_member_groups" ON public.rnest_social_groups;
CREATE POLICY "groups_select_member_groups" ON public.rnest_social_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS m
      WHERE m.group_id = id
        AND m.user_id = auth.uid()::text
    )
  );
