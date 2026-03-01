import { jsonNoStore } from "@/lib/server/requestSecurity";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await loadShopCatalog();
    return jsonNoStore({ ok: true, data: { products } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_shop_catalog" }, { status: 500 });
  }
}
