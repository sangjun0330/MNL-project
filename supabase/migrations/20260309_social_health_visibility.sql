-- 건강 데이터 그룹 공유 설정 컬럼 추가
-- health_visibility: 'full' = 그룹 랭킹 참여, 'hidden' = 비공개 (기본값)
-- Privacy-first: 사용자가 명시적으로 켜야만 그룹 랭킹에 참여됩니다.

ALTER TABLE rnest_social_preferences
ADD COLUMN IF NOT EXISTS health_visibility TEXT NOT NULL DEFAULT 'hidden'
  CHECK (health_visibility IN ('full', 'hidden'));

COMMENT ON COLUMN rnest_social_preferences.health_visibility IS
  'Controls whether health vitals (body battery, sleep) are shared in group rankings. full = participate, hidden = private (default).';
