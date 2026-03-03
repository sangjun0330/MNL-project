import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getShopOrderById } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readOrderIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.orderId ?? "").trim();
}

export async function GET(req: Request, ctx: any) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const orderId = await readOrderIdFromContext(ctx);
  if (!orderId) return jsonNoStore({ ok: false, error: "invalid_order_id" }, { status: 400 });

  try {
    const order = await getShopOrderById(userId, orderId);
    if (!order) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    return jsonNoStore({ ok: true, data: { order } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_get_shop_order" }, { status: 500 });
  }
}
