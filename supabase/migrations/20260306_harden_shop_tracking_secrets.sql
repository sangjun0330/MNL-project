-- 배송 추적 URL(t_key 포함 가능) 잔존 데이터 제거
-- 목적: API 키/시크릿이 포함될 수 있는 URL을 DB에서 영구적으로 정리

-- 1) 주문 shipping.smartTracker.trackingUrl 제거
update public.shop_orders
set
  shipping = jsonb_set(
    coalesce(shipping, '{}'::jsonb),
    '{smartTracker,trackingUrl}',
    'null'::jsonb,
    true
  ),
  updated_at = now()
where coalesce(shipping -> 'smartTracker' ->> 'trackingUrl', '') <> '';

-- 2) 주문 이벤트 metadata의 trackingUrl 제거
update public.shop_order_events
set metadata = metadata - 'trackingUrl'
where metadata ? 'trackingUrl';
