import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { markShopOrderShipped, markShopOrderDelivered, toShopAdminOrderSummary } from "@/lib/server/shopOrderStore";
import { loadUserEmailById, sendShippingStartedEmail } from "@/lib/server/emailService";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readOrderIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.orderId ?? "").trim();
}

export async function PATCH(req: Request, ctx: any) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  const orderId = await readOrderIdFromContext(ctx);
  if (!orderId) return jsonNoStore({ ok: false, error: "invalid_order_id" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body?.action ?? "").trim();

  try {
    if (action === "mark_shipped") {
      const trackingNumber = String(body?.trackingNumber ?? "").trim();
      const courier = String(body?.courier ?? "").trim();
      if (!trackingNumber || !courier) {
        return jsonNoStore({ ok: false, error: "tracking_number_and_courier_required" }, { status: 400 });
      }
      const order = await markShopOrderShipped({
        orderId,
        adminUserId: admin.identity.userId,
        trackingNumber,
        courier,
      });
      // 이메일 발송 (실패해도 계속)
      try {
        const email = await loadUserEmailById(order.userId);
        await sendShippingStartedEmail({
          customerEmail: email,
          productName: order.productSnapshot.name,
          trackingNumber,
          courier,
        });
      } catch {
        // 이메일 실패는 무시
      }
      return jsonNoStore({ ok: true, data: { order: toShopAdminOrderSummary(order) } });
    }

    if (action === "mark_delivered") {
      const order = await markShopOrderDelivered({
        orderId,
        adminUserId: admin.identity.userId,
      });
      return jsonNoStore({ ok: true, data: { order: toShopAdminOrderSummary(order) } });
    }

    return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_update_shop_order");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    if (message.includes("not_paid")) return jsonNoStore({ ok: false, error: "shop_order_not_paid" }, { status: 400 });
    if (message.includes("not_shipped")) return jsonNoStore({ ok: false, error: "shop_order_not_shipped" }, { status: 400 });
    if (
      message === "shop_order_storage_unavailable" ||
      message.toLowerCase().includes("supabase admin env missing") ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("shop_orders") ||
      message.toLowerCase().includes("rnest_user_state") ||
      message.toLowerCase().includes("rnest_users") ||
      message.toLowerCase().includes("ai_content") ||
      message.toLowerCase().includes("foreign key") ||
      message.toLowerCase().includes("tracking_number") ||
      message.toLowerCase().includes("courier") ||
      message.toLowerCase().includes("shipped_at") ||
      message.toLowerCase().includes("delivered_at")
    ) {
      return jsonNoStore({ ok: false, error: "shop_order_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_update_shop_order" }, { status: 500 });
  }
}
