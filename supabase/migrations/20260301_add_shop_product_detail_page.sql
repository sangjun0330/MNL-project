ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS detail_page jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Schema-only setup:
-- Existing shop_products rows are left unchanged.
-- The application fills default detail-page content at read time when this column is empty.
