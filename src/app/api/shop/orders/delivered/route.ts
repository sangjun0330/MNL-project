import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { confirmShopOrderDelivered, toShopOrderSummary } from "@/lib/server/shopOrderStore";
import { loadUserEmailById, sendDeliveryCompletedEmail } from "@/lib/server/emailService";

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
    const order = await confirmShopOrderDelivered({ userId, orderId });

    // FEAT-11: 배달 완료 이메일 (fire-and-forget, 실패 시 콘솔 기록)
    loadUserEmailById(userId)
      .then((email) =>
        sendDeliveryCompletedEmail({
          customerEmail: email,
          productName: order.productSnapshot.name,
          orderId: order.orderId,
        })
      )
      .catch((emailError) => {
        console.error("[OrderDelivered] 배달완료 이메일 발송 실패 orderId=%s err=%s", orderId, String(emailError?.message ?? emailError));
      });

    return jsonNoStore({
      ok: true,
      data: {
        order: toShopOrderSummary(order),
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_confirm_shop_order_delivery");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    if (message.includes("not_shipped")) {
      return jsonNoStore({ ok: false, error: "shop_order_not_shipped" }, { status: 400 });
    }
    if (
      message === "shop_order_storage_unavailable" ||
      message.toLowerCase().includes("supabase admin env missing") ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("shop_orders") ||
      message.toLowerCase().includes("rnest_user_state") ||
      message.toLowerCase().includes("rnest_users") ||
      message.toLowerCase().includes("ai_content") ||
      message.toLowerCase().includes("foreign key")
    ) {
      return jsonNoStore({ ok: false, error: "shop_order_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_confirm_shop_order_delivery" }, { status: 500 });
  }
}
