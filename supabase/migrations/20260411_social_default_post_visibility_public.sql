-- ============================================================
-- Social default post visibility
-- 신규 사용자와 신규 게시글 기본 공개 범위를 허브 공개로 정렬
-- ============================================================

ALTER TABLE public.rnest_social_profiles
  ALTER COLUMN default_post_visibility SET DEFAULT 'public_internal';

ALTER TABLE public.rnest_social_posts
  ALTER COLUMN visibility SET DEFAULT 'public_internal';

UPDATE public.rnest_social_profiles
SET default_post_visibility = 'public_internal'
WHERE default_post_visibility IS NULL
   OR trim(default_post_visibility) = '';
