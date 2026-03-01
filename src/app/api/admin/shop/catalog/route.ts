import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { normalizeShopProduct, upsertShopProductInCatalog } from "@/lib/shop";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { loadShopCatalog, saveShopCatalog } from "@/lib/server/shopCatalogStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  try {
    const products = await loadShopCatalog();
    return jsonNoStore({ ok: true, data: { products } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_shop_catalog" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const product = normalizeShopProduct((body as { product?: unknown } | null)?.product);
  if (!product) {
    return jsonNoStore({ ok: false, error: "invalid_shop_product" }, { status: 400 });
  }

  try {
    const catalog = await loadShopCatalog();
    const nextCatalog = upsertShopProductInCatalog(catalog, product);
    const saved = await saveShopCatalog(nextCatalog);
    return jsonNoStore({ ok: true, data: { product, products: saved } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_save_shop_catalog");
    if (message === "shop_catalog_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_catalog_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_save_shop_catalog" }, { status: 500 });
  }
}
