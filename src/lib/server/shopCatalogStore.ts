import { todayISO } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { normalizeShopCatalogProducts, SHOP_PRODUCTS, type ShopProduct } from "@/lib/shop";
import type { Json } from "@/types/supabase";

const SHOP_CATALOG_USER_ID = "__system_shop_catalog__";
const SHOP_CATALOG_LANGUAGE = "ko";

type StoredShopCatalog = {
  type: "shop_catalog";
  version: 1;
  products: ShopProduct[];
};

function buildPayload(products: ShopProduct[]): StoredShopCatalog {
  return {
    type: "shop_catalog",
    version: 1,
    products: products.slice(0, 80),
  };
}

function readProductsFromJson(data: Json | null): ShopProduct[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const payload = data as Record<string, unknown>;
  if (payload.type !== "shop_catalog" || payload.version !== 1) return [];
  return normalizeShopCatalogProducts(payload.products);
}

export async function loadShopCatalog(): Promise<ShopProduct[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_content")
    .select("data")
    .eq("user_id", SHOP_CATALOG_USER_ID)
    .maybeSingle();

  if (error) throw error;

  const products = readProductsFromJson((data?.data ?? null) as Json | null);
  return products.length > 0 ? products : SHOP_PRODUCTS;
}

export async function saveShopCatalog(products: ShopProduct[]): Promise<ShopProduct[]> {
  const admin = getSupabaseAdmin();
  const normalized = normalizeShopCatalogProducts(products);
  const finalProducts = normalized.length > 0 ? normalized : SHOP_PRODUCTS;
  const payload = buildPayload(finalProducts);
  const now = new Date().toISOString();

  const { error } = await admin.from("ai_content").upsert(
    {
      user_id: SHOP_CATALOG_USER_ID,
      date_iso: todayISO(),
      language: SHOP_CATALOG_LANGUAGE,
      data: payload as unknown as Json,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  return finalProducts;
}
