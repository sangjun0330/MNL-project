import { todayISO } from "@/lib/date";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { normalizeShopCatalogProducts, normalizeShopProduct, SHOP_PRODUCTS, type ShopProduct } from "@/lib/shop";
import type { Database, Json } from "@/types/supabase";

const SHOP_CATALOG_USER_ID = "__system_shop_catalog__";
const SHOP_CATALOG_LANGUAGE = "ko";

type ShopProductRow = Database["public"]["Tables"]["shop_products"]["Row"];

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

function isMissingTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    (message.includes("relation") && message.includes("shop_products")) ||
    (message.includes("column") && message.includes("detail_page"))
  );
}

function toProductRow(product: ShopProduct): Database["public"]["Tables"]["shop_products"]["Insert"] {
  return {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    category: product.category,
    visual_label: product.visualLabel,
    visual_class: product.visualClass,
    price_label: product.priceLabel,
    partner_label: product.partnerLabel,
    partner_status: product.partnerStatus,
    external_url: product.externalUrl ?? null,
    price_krw: product.priceKrw ?? null,
    checkout_enabled: Boolean(product.checkoutEnabled && product.priceKrw && product.priceKrw > 0),
    benefit_tags: product.benefitTags,
    use_moments: product.useMoments,
    caution: product.caution,
    priority: product.priority,
    match_signals: product.matchSignals,
    detail_page: product.detailPage as unknown as Json,
    active: true,
  };
}

function fromProductRow(row: ShopProductRow): ShopProduct | null {
  return normalizeShopProduct({
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    category: row.category,
    visualLabel: row.visual_label,
    visualClass: row.visual_class,
    priceLabel: row.price_label,
    partnerLabel: row.partner_label,
    partnerStatus: row.partner_status,
    externalUrl: row.external_url,
    priceKrw: row.price_krw,
    checkoutEnabled: row.checkout_enabled,
    benefitTags: row.benefit_tags,
    useMoments: row.use_moments,
    caution: row.caution,
    priority: row.priority,
    matchSignals: row.match_signals,
    detailPage: row.detail_page,
  });
}

async function loadLegacyShopCatalog(): Promise<ShopProduct[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_content")
    .select("data, updated_at")
    .eq("user_id", SHOP_CATALOG_USER_ID)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  const products = readProductsFromJson((row?.data ?? null) as Json | null);
  return products.length > 0 ? products : SHOP_PRODUCTS;
}

async function saveLegacyShopCatalog(products: ShopProduct[]): Promise<ShopProduct[]> {
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

export async function loadShopCatalog(): Promise<ShopProduct[]> {
  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from("shop_products")
      .select("*")
      .eq("active", true)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const products = (data ?? [])
      .map((row) => fromProductRow(row))
      .filter((row): row is ShopProduct => Boolean(row));

    if (products.length > 0) return products;
  } catch {
    // Fall back to legacy or bundled defaults when the modern table is unavailable
    // or when production data is temporarily inconsistent.
  }

  try {
    return await loadLegacyShopCatalog();
  } catch {
    return SHOP_PRODUCTS;
  }
}

export async function saveShopCatalog(products: ShopProduct[]): Promise<ShopProduct[]> {
  const admin = getSupabaseAdmin();
  const normalized = normalizeShopCatalogProducts(products);
  const finalProducts = normalized.length > 0 ? normalized : SHOP_PRODUCTS;

  try {
    const activeIds = new Set(finalProducts.map((item) => item.id));
    const { data: existingRows, error: existingError } = await admin.from("shop_products").select("id");
    if (existingError) throw existingError;

    const rows = finalProducts.map((item) => toProductRow(item));
    const { error: upsertError } = await admin.from("shop_products").upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const staleIds = (existingRows ?? []).map((row) => row.id).filter((id) => !activeIds.has(id));
    if (staleIds.length > 0) {
      const { error: deactivateError } = await admin.from("shop_products").update({ active: false }).in("id", staleIds);
      if (deactivateError) throw deactivateError;
    }

    return finalProducts;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    try {
      return await saveLegacyShopCatalog(finalProducts);
    } catch {
      throw new Error("shop_catalog_storage_unavailable");
    }
  }
}
