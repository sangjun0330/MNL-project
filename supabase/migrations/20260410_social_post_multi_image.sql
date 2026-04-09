-- ══════════════════════════════════════════════════════════════
-- Social post multi-image support
-- 이미지 여러 장 순서 저장 + 이미지 전용 게시글 허용
-- ══════════════════════════════════════════════════════════════

ALTER TABLE rnest_social_posts
  ADD COLUMN IF NOT EXISTS image_paths TEXT[] NOT NULL DEFAULT '{}';

UPDATE rnest_social_posts
SET image_paths = ARRAY[image_path]
WHERE COALESCE(array_length(image_paths, 1), 0) = 0
  AND image_path IS NOT NULL
  AND btrim(image_path) <> '';

UPDATE rnest_social_posts
SET image_path = image_paths[1]
WHERE image_path IS NULL
  AND COALESCE(array_length(image_paths, 1), 0) > 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_posts_body_check'
  ) THEN
    ALTER TABLE rnest_social_posts
      DROP CONSTRAINT rnest_social_posts_body_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_posts_body_length_check'
  ) THEN
    ALTER TABLE rnest_social_posts
      DROP CONSTRAINT rnest_social_posts_body_length_check;
  END IF;
END $$;

ALTER TABLE rnest_social_posts
  ADD CONSTRAINT rnest_social_posts_body_length_check
  CHECK (char_length(body) <= 500);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_posts_body_or_images_check'
  ) THEN
    ALTER TABLE rnest_social_posts
      DROP CONSTRAINT rnest_social_posts_body_or_images_check;
  END IF;
END $$;

ALTER TABLE rnest_social_posts
  ADD CONSTRAINT rnest_social_posts_body_or_images_check
  CHECK (
    char_length(body) >= 1
    OR COALESCE(array_length(image_paths, 1), 0) >= 1
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_posts_image_paths_limit_check'
  ) THEN
    ALTER TABLE rnest_social_posts
      DROP CONSTRAINT rnest_social_posts_image_paths_limit_check;
  END IF;
END $$;

ALTER TABLE rnest_social_posts
  ADD CONSTRAINT rnest_social_posts_image_paths_limit_check
  CHECK (COALESCE(array_length(image_paths, 1), 0) <= 10);
