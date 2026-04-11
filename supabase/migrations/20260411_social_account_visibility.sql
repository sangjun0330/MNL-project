-- ============================================================
-- Social account visibility
-- 프로필 잠금 상태와 허브 공개 게시글 노출을 분리
-- ============================================================

ALTER TABLE public.rnest_social_profiles
  ADD COLUMN IF NOT EXISTS account_visibility TEXT NOT NULL DEFAULT 'public';

UPDATE public.rnest_social_profiles
SET account_visibility = COALESCE(NULLIF(trim(account_visibility), ''), 'public')
WHERE account_visibility IS NULL
   OR trim(account_visibility) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_profiles_account_visibility_check'
  ) THEN
    ALTER TABLE public.rnest_social_profiles
      ADD CONSTRAINT rnest_social_profiles_account_visibility_check
      CHECK (account_visibility IN ('public', 'private'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_profiles_account_visibility
  ON public.rnest_social_profiles(account_visibility, updated_at DESC);
