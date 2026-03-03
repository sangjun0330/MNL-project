ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS original_price_krw integer NULL;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS detail_page jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS stock_count integer NULL;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS out_of_stock boolean NOT NULL DEFAULT false;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS shipping_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS tracking_number text NULL;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS courier text NULL;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz NULL;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;
