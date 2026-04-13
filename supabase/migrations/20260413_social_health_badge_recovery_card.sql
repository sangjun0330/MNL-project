-- 게시글에 건강/교대 배지 및 회복 카드 컬럼 추가
ALTER TABLE rnest_social_posts
  ADD COLUMN IF NOT EXISTS health_badge  JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_card JSONB DEFAULT NULL;

COMMENT ON COLUMN rnest_social_posts.health_badge  IS '사용자가 선택적으로 첨부하는 건강/교대 배지 (shiftType, batteryLevel, burnoutLevel)';
COMMENT ON COLUMN rnest_social_posts.recovery_card IS '회복 카드 스냅샷 (headline, batteryAvg, sleepDebtHours, weekDays)';
