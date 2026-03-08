-- Phase 4-C: social group notice board posts

CREATE TABLE IF NOT EXISTS public.rnest_social_group_notice_posts (
  id             BIGSERIAL PRIMARY KEY,
  group_id       BIGINT NOT NULL REFERENCES public.rnest_social_groups(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES public.rnest_users(user_id) ON DELETE SET NULL,
  title          TEXT NOT NULL DEFAULT '',
  body           TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(title) > 0),
  CHECK (char_length(body) > 0)
);

CREATE INDEX IF NOT EXISTS idx_social_group_notice_posts_group
  ON public.rnest_social_group_notice_posts(group_id, created_at DESC);

ALTER TABLE public.rnest_social_group_notice_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_notice_posts_select_member_groups" ON public.rnest_social_group_notice_posts;
CREATE POLICY "group_notice_posts_select_member_groups" ON public.rnest_social_group_notice_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_notice_posts.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );
