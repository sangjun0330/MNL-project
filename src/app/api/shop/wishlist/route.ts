import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import {
  addShopWishlistItem,
  loadShopWishlist,
  removeShopWishlistItem,
  replaceShopWishlist,
  toggleShopWishlistItem,
} from "@/lib/server/shopWishlistStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeProductId(value: unknown) {
  return String(value ?? "").trim().slice(0, 80);
}

async function buildCatalogIdSet() {
  const catalog = await loadShopCatalog();
  return new Set(catalog.map((item) => item.id));
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  try {
    const ids = await loadShopWishlist(userId);
    return jsonNoStore({ ok: true, data: { ids } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_shop_wishlist" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    if (Array.isArray(body?.ids)) {
      const catalogIds = await buildCatalogIdSet();
      const ids = await replaceShopWishlist(
        userId,
        body.ids.filter((item: unknown) => catalogIds.has(sanitizeProductId(item)))
      );
      return jsonNoStore({ ok: true, data: { ids, active: null } });
    }

    const productId = sanitizeProductId(body?.productId);
    const action = String(body?.action ?? "toggle").trim().toLowerCase();
    if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

    const catalogIds = await buildCatalogIdSet();
    if (!catalogIds.has(productId)) {
      return jsonNoStore({ ok: false, error: "shop_product_not_found" }, { status: 404 });
    }

    if (action === "add") {
      const ids = await addShopWishlistItem(userId, productId);
      return jsonNoStore({ ok: true, data: { ids, active: true } });
    }
    if (action === "remove") {
      const ids = await removeShopWishlistItem(userId, productId);
      return jsonNoStore({ ok: true, data: { ids, active: false } });
    }

    const result = await toggleShopWishlistItem(userId, productId);
    return jsonNoStore({ ok: true, data: result });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_save_shop_wishlist" }, { status: 500 });
  }
}
