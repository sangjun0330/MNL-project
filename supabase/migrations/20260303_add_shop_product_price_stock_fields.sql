ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS original_price_krw integer NULL;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS stock_count integer NULL;

ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS out_of_stock boolean NOT NULL DEFAULT false;
