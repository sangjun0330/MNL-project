-- ══════════════════════════════════════════════════════════════
-- Social Hub phase 1
-- 프로필 확장, 팔로우/저장/댓글 좋아요, 답글, 공개 범위 확장
-- ══════════════════════════════════════════════════════════════

ALTER TABLE rnest_social_profiles
  ADD COLUMN IF NOT EXISTS handle TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS profile_image_path TEXT,
  ADD COLUMN IF NOT EXISTS discoverability TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS default_post_visibility TEXT NOT NULL DEFAULT 'friends';

UPDATE rnest_social_profiles
SET handle = lower(trim(handle))
WHERE handle IS NOT NULL;

UPDATE rnest_social_profiles
SET display_name = NULLIF(trim(display_name), '')
WHERE display_name IS NOT NULL;

UPDATE rnest_social_profiles
SET bio = NULLIF(trim(bio), '')
WHERE bio IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_profiles_handle_lowercase'
  ) THEN
    ALTER TABLE rnest_social_profiles
      ADD CONSTRAINT rnest_social_profiles_handle_lowercase
      CHECK (handle IS NULL OR handle = lower(handle));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_profiles_discoverability_check'
  ) THEN
    ALTER TABLE rnest_social_profiles
      ADD CONSTRAINT rnest_social_profiles_discoverability_check
      CHECK (discoverability IN ('off', 'internal'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_profiles_default_post_visibility_check'
  ) THEN
    ALTER TABLE rnest_social_profiles
      ADD CONSTRAINT rnest_social_profiles_default_post_visibility_check
      CHECK (default_post_visibility IN ('public_internal', 'followers', 'friends', 'group'));
  END IF;
END $$;

WITH profile_seed AS (
  SELECT
    p.user_id,
    COALESCE(
      NULLIF(trim(p.display_name), ''),
      NULLIF(trim(p.nickname), ''),
      NULLIF(trim(COALESCE(au.raw_user_meta_data ->> 'name', au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'preferred_username', au.raw_user_meta_data ->> 'user_name')), ''),
      NULLIF(trim(split_part(COALESCE(au.email, ''), '@', 1)), ''),
      'RNest 사용자'
    ) AS display_seed,
    COALESCE(
      NULLIF(
        trim(
          both '-'
          FROM regexp_replace(
            lower(
              COALESCE(
                NULLIF(trim(p.handle), ''),
                NULLIF(trim(COALESCE(au.raw_user_meta_data ->> 'preferred_username', au.raw_user_meta_data ->> 'user_name')), ''),
                NULLIF(trim(split_part(COALESCE(au.email, ''), '@', 1)), ''),
                NULLIF(trim(p.nickname), ''),
                split_part(p.user_id, '-', 1)
              )
            ),
            '[^a-z0-9._-]+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'user'
    ) AS handle_seed
  FROM rnest_social_profiles p
  LEFT JOIN auth.users au
    ON au.id::text = p.user_id
),
ranked AS (
  SELECT
    user_id,
    display_seed,
    handle_seed,
    row_number() OVER (
      PARTITION BY handle_seed
      ORDER BY user_id
    ) AS handle_rank
  FROM profile_seed
)
UPDATE rnest_social_profiles p
SET
  display_name = COALESCE(p.display_name, ranked.display_seed),
  handle = COALESCE(
    p.handle,
    CASE
      WHEN ranked.handle_rank = 1 THEN ranked.handle_seed
      ELSE ranked.handle_seed || '-' || ranked.handle_rank::text
    END
  ),
  discoverability = COALESCE(NULLIF(p.discoverability, ''), 'off'),
  default_post_visibility = COALESCE(NULLIF(p.default_post_visibility, ''), 'friends')
FROM ranked
WHERE p.user_id = ranked.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_profiles_handle_unique
  ON rnest_social_profiles(handle)
  WHERE handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_profiles_discoverability
  ON rnest_social_profiles(discoverability, updated_at DESC);

CREATE TABLE IF NOT EXISTS rnest_social_follows (
  follower_user_id TEXT NOT NULL,
  followee_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followee_user_id),
  CONSTRAINT rnest_social_follows_no_self CHECK (follower_user_id <> followee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_follows_followee
  ON rnest_social_follows(followee_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_follows_follower
  ON rnest_social_follows(follower_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rnest_social_post_saves (
  post_id BIGINT NOT NULL REFERENCES rnest_social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_saves_user
  ON rnest_social_post_saves(user_id, created_at DESC);

ALTER TABLE rnest_social_post_comments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES rnest_social_post_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_social_post_comments_parent
  ON rnest_social_post_comments(parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rnest_social_comment_likes (
  comment_id BIGINT NOT NULL REFERENCES rnest_social_post_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_comment_likes_user
  ON rnest_social_comment_likes(user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rnest_social_posts_visibility_check'
  ) THEN
    ALTER TABLE rnest_social_posts
      DROP CONSTRAINT rnest_social_posts_visibility_check;
  END IF;
END $$;

ALTER TABLE rnest_social_posts
  ADD CONSTRAINT rnest_social_posts_visibility_check
  CHECK (visibility IN ('public_internal', 'followers', 'friends', 'group'));

ALTER TABLE rnest_social_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnest_social_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnest_social_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_posts_select ON rnest_social_posts;
CREATE POLICY social_posts_select
  ON rnest_social_posts FOR SELECT
  USING (
    author_user_id = (auth.uid())::text
    OR visibility = 'public_internal'
    OR (
      visibility = 'followers'
      AND EXISTS (
        SELECT 1
        FROM rnest_social_follows f
        WHERE f.followee_user_id = author_user_id
          AND f.follower_user_id = (auth.uid())::text
      )
    )
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM rnest_connections c
        WHERE c.status = 'accepted'
          AND (
            (c.requester_id = author_user_id AND c.receiver_id = (auth.uid())::text)
            OR
            (c.receiver_id = author_user_id AND c.requester_id = (auth.uid())::text)
          )
      )
    )
    OR (
      visibility = 'group'
      AND group_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM rnest_social_group_members m
        WHERE m.group_id = rnest_social_posts.group_id
          AND m.user_id = (auth.uid())::text
      )
    )
  );

DROP POLICY IF EXISTS social_post_likes_select ON rnest_social_post_likes;
CREATE POLICY social_post_likes_select
  ON rnest_social_post_likes FOR SELECT
  USING (
    user_id = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM rnest_social_posts p
      WHERE p.id = rnest_social_post_likes.post_id
        AND (
          p.author_user_id = (auth.uid())::text
          OR p.visibility = 'public_internal'
          OR (
            p.visibility = 'followers'
            AND EXISTS (
              SELECT 1 FROM rnest_social_follows f
              WHERE f.followee_user_id = p.author_user_id
                AND f.follower_user_id = (auth.uid())::text
            )
          )
          OR (
            p.visibility = 'friends'
            AND EXISTS (
              SELECT 1 FROM rnest_connections c
              WHERE c.status = 'accepted'
                AND (
                  (c.requester_id = p.author_user_id AND c.receiver_id = (auth.uid())::text)
                  OR
                  (c.receiver_id = p.author_user_id AND c.requester_id = (auth.uid())::text)
                )
            )
          )
          OR (
            p.visibility = 'group'
            AND p.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM rnest_social_group_members m
              WHERE m.group_id = p.group_id
                AND m.user_id = (auth.uid())::text
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS social_post_comments_select ON rnest_social_post_comments;
CREATE POLICY social_post_comments_select
  ON rnest_social_post_comments FOR SELECT
  USING (
    author_user_id = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM rnest_social_posts p
      WHERE p.id = rnest_social_post_comments.post_id
        AND (
          p.author_user_id = (auth.uid())::text
          OR p.visibility = 'public_internal'
          OR (
            p.visibility = 'followers'
            AND EXISTS (
              SELECT 1 FROM rnest_social_follows f
              WHERE f.followee_user_id = p.author_user_id
                AND f.follower_user_id = (auth.uid())::text
            )
          )
          OR (
            p.visibility = 'friends'
            AND EXISTS (
              SELECT 1 FROM rnest_connections c
              WHERE c.status = 'accepted'
                AND (
                  (c.requester_id = p.author_user_id AND c.receiver_id = (auth.uid())::text)
                  OR
                  (c.receiver_id = p.author_user_id AND c.requester_id = (auth.uid())::text)
                )
            )
          )
          OR (
            p.visibility = 'group'
            AND p.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM rnest_social_group_members m
              WHERE m.group_id = p.group_id
                AND m.user_id = (auth.uid())::text
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS social_follows_select ON rnest_social_follows;
CREATE POLICY social_follows_select
  ON rnest_social_follows FOR SELECT
  USING (
    follower_user_id = (auth.uid())::text
    OR followee_user_id = (auth.uid())::text
  );

DROP POLICY IF EXISTS social_post_saves_select ON rnest_social_post_saves;
CREATE POLICY social_post_saves_select
  ON rnest_social_post_saves FOR SELECT
  USING (user_id = (auth.uid())::text);

DROP POLICY IF EXISTS social_comment_likes_select ON rnest_social_comment_likes;
CREATE POLICY social_comment_likes_select
  ON rnest_social_comment_likes FOR SELECT
  USING (user_id = (auth.uid())::text);
