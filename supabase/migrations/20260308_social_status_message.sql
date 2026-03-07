-- ============================================================
-- Phase 2-A: 소셜 상태 메시지 (status_message)
-- rnest_social_profiles 테이블에 status_message 컬럼 추가
-- ============================================================

ALTER TABLE public.rnest_social_profiles
  ADD COLUMN IF NOT EXISTS status_message TEXT NOT NULL DEFAULT '';
