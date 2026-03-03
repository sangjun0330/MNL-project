import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { confirmShopOrderPurchase, toShopOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeOrderId(value: unknown) {
  return String(value ?? "").trim().slice(0, 80);
}

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

  const orderId = sanitizeOrderId(body?.orderId);
  if (!orderId) return jsonNoStore({ ok: false, error: "invalid_order_id" }, { status: 400 });

  try {
    const result = await confirmShopOrderPurchase({ userId, orderId });
    return jsonNoStore({
      ok: true,
      data: {
        order: {
          ...toShopOrderSummary(result.order),
          purchaseConfirmedAt: result.purchaseConfirmedAt,
        },
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_confirm_shop_order_purchase");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    if (message.includes("not_delivered")) {
      return jsonNoStore({ ok: false, error: "shop_order_not_delivered" }, { status: 400 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_confirm_shop_order_purchase" }, { status: 500 });
  }
}
