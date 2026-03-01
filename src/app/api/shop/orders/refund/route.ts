import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { requestShopOrderRefund, toShopOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

  const orderId = String(body?.orderId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  if (!orderId) return jsonNoStore({ ok: false, error: "invalid_order_id" }, { status: 400 });

  try {
    const order = await requestShopOrderRefund({
      userId,
      orderId,
      reason,
    });
    return jsonNoStore({ ok: true, data: { order: toShopOrderSummary(order) } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_request_shop_refund");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    if (message.includes("not_refundable")) return jsonNoStore({ ok: false, error: "shop_order_not_refundable" }, { status: 400 });
    return jsonNoStore({ ok: false, error: "failed_to_request_shop_refund" }, { status: 500 });
  }
}
