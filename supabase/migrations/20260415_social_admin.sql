-- social admin: 소셜 계정 정지 필드 추가
ALTER TABLE rnest_social_profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by TEXT,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- 정지 계정 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_social_profiles_suspended
  ON rnest_social_profiles(is_suspended)
  WHERE is_suspended = true;
