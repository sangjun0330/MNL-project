-- ══════════════════════════════════════════════════════════════
-- Social Post Feed System
-- 게시글(posts), 좋아요(likes), 댓글(comments)
-- ══════════════════════════════════════════════════════════════

-- ── 게시글 테이블 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rnest_social_posts (
  id              BIGSERIAL   PRIMARY KEY,
  author_user_id  TEXT        NOT NULL,

  body            TEXT        NOT NULL
    CHECK (char_length(body) BETWEEN 1 AND 500),

  image_path      TEXT,       -- Supabase Storage 경로 (nullable)

  tags            TEXT[]      NOT NULL DEFAULT '{}',
    -- 예: '{야간후회복,수면기록,오프데이}'

  -- 공개 범위
  visibility      TEXT        NOT NULL DEFAULT 'friends'
    CHECK (visibility IN ('friends', 'group')),
    -- friends → 양방향 연결된 친구에게 노출
    -- group   → 해당 그룹 멤버에게 노출

  group_id        BIGINT      REFERENCES rnest_social_groups(id) ON DELETE SET NULL,
    -- visibility='group' 일 때 대상 그룹

  like_count      INT         NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count   INT         NOT NULL DEFAULT 0 CHECK (comment_count >= 0),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 좋아요 테이블 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rnest_social_post_likes (
  post_id     BIGINT  NOT NULL REFERENCES rnest_social_posts(id) ON DELETE CASCADE,
  user_id     TEXT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- ── 댓글 테이블 ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rnest_social_post_comments (
  id              BIGSERIAL   PRIMARY KEY,
  post_id         BIGINT      NOT NULL REFERENCES rnest_social_posts(id) ON DELETE CASCADE,
  author_user_id  TEXT        NOT NULL,
  body            TEXT        NOT NULL
    CHECK (char_length(body) BETWEEN 1 AND 200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 인덱스 ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_posts_author
  ON rnest_social_posts(author_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_group
  ON rnest_social_posts(group_id, created_at DESC)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_created
  ON rnest_social_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_post_likes_user
  ON rnest_social_post_likes(user_id, post_id);

CREATE INDEX IF NOT EXISTS idx_social_post_comments_post
  ON rnest_social_post_comments(post_id, created_at ASC);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE rnest_social_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnest_social_post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnest_social_post_comments ENABLE ROW LEVEL SECURITY;

-- 게시글 조회:
--   1) 본인 게시글
--   2) 친구 게시글 (visibility='friends', accepted 연결)
--   3) 그룹 게시글 (visibility='group', 그룹 멤버)
CREATE POLICY "social_posts_select"
  ON rnest_social_posts FOR SELECT
  USING (
    -- 본인
    author_user_id = (auth.uid())::text
    -- 친구 공개 게시글
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM rnest_connections c
        WHERE c.status = 'accepted'
          AND (
            (c.requester_id = author_user_id AND c.receiver_id  = (auth.uid())::text)
            OR
            (c.receiver_id  = author_user_id AND c.requester_id = (auth.uid())::text)
          )
      )
    )
    -- 그룹 공개 게시글
    OR (
      visibility = 'group'
      AND group_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM rnest_social_group_members m
        WHERE m.group_id = rnest_social_posts.group_id
          AND m.user_id  = (auth.uid())::text
      )
    )
  );

-- 좋아요 조회: 해당 게시글에 접근 가능한 사용자
CREATE POLICY "social_post_likes_select"
  ON rnest_social_post_likes FOR SELECT
  USING (
    user_id = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM rnest_social_posts p
      WHERE p.id = rnest_social_post_likes.post_id
        AND (
          p.author_user_id = (auth.uid())::text
          OR (
            p.visibility = 'friends'
            AND EXISTS (
              SELECT 1 FROM rnest_connections c
              WHERE c.status = 'accepted'
                AND (
                  (c.requester_id = p.author_user_id AND c.receiver_id  = (auth.uid())::text)
                  OR
                  (c.receiver_id  = p.author_user_id AND c.requester_id = (auth.uid())::text)
                )
            )
          )
          OR (
            p.visibility = 'group'
            AND p.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM rnest_social_group_members m
              WHERE m.group_id = p.group_id
                AND m.user_id  = (auth.uid())::text
            )
          )
        )
    )
  );

-- 댓글 조회: 좋아요와 동일 패턴
CREATE POLICY "social_post_comments_select"
  ON rnest_social_post_comments FOR SELECT
  USING (
    author_user_id = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM rnest_social_posts p
      WHERE p.id = rnest_social_post_comments.post_id
        AND (
          p.author_user_id = (auth.uid())::text
          OR (
            p.visibility = 'friends'
            AND EXISTS (
              SELECT 1 FROM rnest_connections c
              WHERE c.status = 'accepted'
                AND (
                  (c.requester_id = p.author_user_id AND c.receiver_id  = (auth.uid())::text)
                  OR
                  (c.receiver_id  = p.author_user_id AND c.requester_id = (auth.uid())::text)
                )
            )
          )
          OR (
            p.visibility = 'group'
            AND p.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM rnest_social_group_members m
              WHERE m.group_id = p.group_id
                AND m.user_id  = (auth.uid())::text
            )
          )
        )
    )
  );

-- 모든 INSERT / UPDATE / DELETE 는 service_role(API)에서만 처리
