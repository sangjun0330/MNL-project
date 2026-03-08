-- ══════════════════════════════════════════════════════════════
-- Group Challenge System
-- ══════════════════════════════════════════════════════════════

-- ── 챌린지 정의 테이블 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rnest_social_group_challenges (
  id              BIGSERIAL PRIMARY KEY,
  group_id        BIGINT      NOT NULL REFERENCES rnest_social_groups(id) ON DELETE CASCADE,
  created_by      TEXT        NOT NULL,

  title           TEXT        NOT NULL
    CHECK (char_length(title) BETWEEN 1 AND 40),
  description     TEXT
    CHECK (description IS NULL OR char_length(description) <= 120),

  -- 측정 지표
  metric          TEXT        NOT NULL
    CHECK (metric IN ('battery', 'sleep', 'mental')),
    -- battery  → Body Battery 지난 7일 평균 (0–100)
    -- sleep    → 수면 시간 지난 7일 평균 (hours)
    -- mental   → Mental Battery 지난 7일 평균 (0–100)

  -- 챌린지 방식
  challenge_type  TEXT        NOT NULL
    CHECK (challenge_type IN ('leaderboard', 'group_goal', 'streak')),
    -- leaderboard → 개인 순위 경쟁
    -- group_goal  → 그룹 평균 target_value 이상 달성 시 성공
    -- streak      → target_days일 연속 target_value 이상 유지

  target_value    NUMERIC,    -- group_goal: 목표 평균값 / streak: 임계값
  target_days     INT,        -- streak 전용: 연속 목표 일수

  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'canceled')),

  starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at         TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,           -- 실제 종료 처리 시각

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 참가 & 진행 테이블 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rnest_social_challenge_entries (
  id              BIGSERIAL PRIMARY KEY,
  challenge_id    BIGINT      NOT NULL
    REFERENCES rnest_social_group_challenges(id) ON DELETE CASCADE,
  user_id         TEXT        NOT NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 서버 cron이 주기적으로 계산해서 갱신
  snapshot_value  NUMERIC,      -- 현재 메트릭 값 (leaderboard/group_goal용)
  streak_days     INT,          -- streak 타입: 현재 연속일 수
  snapshot_at     TIMESTAMPTZ,  -- 마지막 스냅샷 계산 시각

  is_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,

  UNIQUE(challenge_id, user_id)
);

-- ── 인덱스 ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_challenges_group_status
  ON rnest_social_group_challenges(group_id, status, ends_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenges_active_ends
  ON rnest_social_group_challenges(status, ends_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_challenge_entries_challenge
  ON rnest_social_challenge_entries(challenge_id, snapshot_value DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_challenge_entries_user
  ON rnest_social_challenge_entries(user_id, challenge_id);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE rnest_social_group_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE rnest_social_challenge_entries ENABLE ROW LEVEL SECURITY;

-- 챌린지 조회: 같은 그룹 멤버만
CREATE POLICY "challenge_select_for_members"
  ON rnest_social_group_challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rnest_social_group_members m
      WHERE m.group_id = rnest_social_group_challenges.group_id
        AND m.user_id  = (auth.uid())::text
    )
  );

-- 엔트리 조회: 같은 그룹 멤버 OR 자기 자신
CREATE POLICY "entry_select_for_members"
  ON rnest_social_challenge_entries FOR SELECT
  USING (
    user_id = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM rnest_social_group_challenges c
      JOIN rnest_social_group_members   m ON m.group_id = c.group_id
      WHERE c.id       = rnest_social_challenge_entries.challenge_id
        AND m.user_id  = (auth.uid())::text
    )
  );

-- 모든 INSERT / UPDATE / DELETE 는 service_role(API)에서만 처리
