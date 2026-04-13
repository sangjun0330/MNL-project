-- 소셜 스토리 테이블 (24시간 임시 게시)
CREATE TABLE IF NOT EXISTS rnest_social_stories (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type     TEXT NOT NULL CHECK (content_type IN ('text','image','recovery')),
  media_path       TEXT,          -- Supabase Storage 경로
  text             TEXT,          -- 텍스트 카드 내용 (최대 200자)
  text_color       TEXT,          -- 텍스트 색상 (hex)
  bg_color         TEXT,          -- 배경 색상 (hex)
  recovery_snapshot JSONB,        -- RecoveryCardSnapshot
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  view_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 스토리 조회 기록 (누가 봤는지)
CREATE TABLE IF NOT EXISTS rnest_social_story_views (
  story_id         BIGINT NOT NULL REFERENCES rnest_social_stories(id) ON DELETE CASCADE,
  viewer_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_user_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_social_stories_author      ON rnest_social_stories(author_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_social_stories_expires     ON rnest_social_stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_social_story_views_story   ON rnest_social_story_views(story_id);

-- RLS
ALTER TABLE rnest_social_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnest_social_story_views ENABLE ROW LEVEL SECURITY;

-- 스토리: 로그인 사용자는 만료되지 않은 스토리 조회 가능
CREATE POLICY "story_select" ON rnest_social_stories
  FOR SELECT USING (auth.uid() IS NOT NULL AND expires_at > NOW());

-- 스토리: 본인만 INSERT
CREATE POLICY "story_insert" ON rnest_social_stories
  FOR INSERT WITH CHECK (auth.uid() = author_user_id);

-- 스토리: 본인만 DELETE
CREATE POLICY "story_delete" ON rnest_social_stories
  FOR DELETE USING (auth.uid() = author_user_id);

-- 조회기록: 로그인 사용자는 INSERT/SELECT
CREATE POLICY "story_view_insert" ON rnest_social_story_views
  FOR INSERT WITH CHECK (auth.uid() = viewer_user_id);

CREATE POLICY "story_view_select" ON rnest_social_story_views
  FOR SELECT USING (auth.uid() IS NOT NULL);
