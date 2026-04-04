-- Social group AI brief cache + personal card opt-in prefs

CREATE TABLE IF NOT EXISTS public.rnest_social_group_ai_briefs (
  group_id          BIGINT NOT NULL REFERENCES public.rnest_social_groups(id) ON DELETE CASCADE,
  week_start_iso    DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'failed',
  generator_type    TEXT NOT NULL DEFAULT 'cron',
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  model             TEXT,
  prompt_version    TEXT,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  opt_in_card_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until    TIMESTAMPTZ,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage             JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, week_start_iso),
  CONSTRAINT rnest_social_group_ai_briefs_status_check
    CHECK (status IN ('ready', 'insufficient_data', 'failed')),
  CONSTRAINT rnest_social_group_ai_briefs_generator_type_check
    CHECK (generator_type IN ('cron', 'manual'))
);

CREATE TABLE IF NOT EXISTS public.rnest_social_group_ai_card_prefs (
  group_id               BIGINT NOT NULL REFERENCES public.rnest_social_groups(id) ON DELETE CASCADE,
  user_id                TEXT NOT NULL REFERENCES public.rnest_users(user_id) ON DELETE CASCADE,
  personal_card_opt_in   BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_group_ai_briefs_generated
  ON public.rnest_social_group_ai_briefs(group_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_group_ai_card_prefs_user
  ON public.rnest_social_group_ai_card_prefs(user_id, updated_at DESC);

ALTER TABLE public.rnest_social_group_ai_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rnest_social_group_ai_card_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_ai_briefs_select_member_groups" ON public.rnest_social_group_ai_briefs;
CREATE POLICY "group_ai_briefs_select_member_groups" ON public.rnest_social_group_ai_briefs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_ai_briefs.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "group_ai_card_prefs_select_own" ON public.rnest_social_group_ai_card_prefs;
CREATE POLICY "group_ai_card_prefs_select_own" ON public.rnest_social_group_ai_card_prefs
  FOR SELECT
  USING (
    user_id = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_ai_card_prefs.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "group_ai_card_prefs_insert_own" ON public.rnest_social_group_ai_card_prefs;
CREATE POLICY "group_ai_card_prefs_insert_own" ON public.rnest_social_group_ai_card_prefs
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_ai_card_prefs.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "group_ai_card_prefs_update_own" ON public.rnest_social_group_ai_card_prefs;
CREATE POLICY "group_ai_card_prefs_update_own" ON public.rnest_social_group_ai_card_prefs
  FOR UPDATE
  USING (
    user_id = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_ai_card_prefs.group_id
        AND viewer.user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    user_id = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.rnest_social_group_members AS viewer
      WHERE viewer.group_id = rnest_social_group_ai_card_prefs.group_id
        AND viewer.user_id = auth.uid()::text
    )
  );
