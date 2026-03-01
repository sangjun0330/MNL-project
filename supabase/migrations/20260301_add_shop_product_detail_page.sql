ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS detail_page jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.shop_products
SET detail_page = jsonb_build_object(
  'headline', COALESCE(NULLIF(visual_label, ''), name),
  'summary', COALESCE(NULLIF(description, ''), subtitle, name),
  'storyTitle', '이 제품은',
  'storyBody', COALESCE(NULLIF(description, ''), subtitle, name),
  'featureTitle', '핵심 포인트',
  'featureItems', COALESCE(to_jsonb(benefit_tags), '[]'::jsonb),
  'routineTitle', '이럴 때 보기 좋아요',
  'routineItems', COALESCE(to_jsonb(use_moments), '[]'::jsonb),
  'noticeTitle', '구매 전 안내',
  'noticeBody', COALESCE(NULLIF(caution, ''), '구매 전 구성과 사용 안내를 판매처 기준으로 다시 확인해 주세요.')
)
WHERE detail_page = '{}'::jsonb OR detail_page IS NULL;
