import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import {
  addShopCartItem,
  clearShopCart,
  loadShopCart,
  removeShopCartItem,
  setShopCartItemQuantity,
} from "@/lib/server/shopCartStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeProductId(value: unknown) {
  return String(value ?? "").trim().slice(0, 80);
}

function sanitizeQuantity(value: unknown) {
  return Math.max(0, Math.min(9, Math.round(Number(value) || 0)));
}

async function hasProduct(productId: string) {
  const catalog = await loadShopCatalog();
  return catalog.some((item) => item.id === productId);
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  try {
    const items = await loadShopCart(userId);
    return jsonNoStore({ ok: true, data: { items } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_shop_cart" }, { status: 500 });
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
    const action = String(body?.action ?? "add").trim().toLowerCase();
    const productId = sanitizeProductId(body?.productId);
    const quantity = sanitizeQuantity(body?.quantity);

    if (action === "clear") {
      const items = await clearShopCart(userId);
      return jsonNoStore({ ok: true, data: { items } });
    }

    if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });
    if (!(await hasProduct(productId))) {
      return jsonNoStore({ ok: false, error: "shop_product_not_found" }, { status: 404 });
    }

    if (action === "remove") {
      const items = await removeShopCartItem(userId, productId);
      return jsonNoStore({ ok: true, data: { items } });
    }
    if (action === "set") {
      const items = await setShopCartItemQuantity(userId, productId, quantity);
      return jsonNoStore({ ok: true, data: { items } });
    }

    const items = await addShopCartItem(userId, productId, quantity || 1);
    return jsonNoStore({ ok: true, data: { items } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_save_shop_cart" }, { status: 500 });
  }
}
