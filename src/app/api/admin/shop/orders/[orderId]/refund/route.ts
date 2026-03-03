import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { approveShopOrderRefund, rejectShopOrderRefund, toShopAdminOrderSummary } from "@/lib/server/shopOrderStore";
import { loadUserEmailById, sendRefundResultEmail } from "@/lib/server/emailService";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readOrderIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.orderId ?? "").trim();
}

export async function POST(req: Request, ctx: any) {
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
    body = null;
  }

  const action = String(body?.action ?? "").trim();
  const note = String(body?.note ?? "").trim() || null;
  if (action !== "approve" && action !== "reject") {
    return jsonNoStore({ ok: false, error: "invalid_refund_action" }, { status: 400 });
  }

  try {
    const order =
      action === "reject"
        ? await rejectShopOrderRefund({
            orderId,
            adminUserId: admin.identity.userId,
            note,
          })
        : await approveShopOrderRefund({
            orderId,
            adminUserId: admin.identity.userId,
            note,
            requestAcceptLanguage: req.headers.get("accept-language"),
          });

    try {
      const email = await loadUserEmailById(order.userId);
      await sendRefundResultEmail({
        customerEmail: email,
        productName: order.productSnapshot.name,
        result: action === "approve" ? "approved" : "rejected",
        note: order.refund.note,
        cancelAmount: order.refund.cancelAmount,
      });
    } catch {
      // 이메일 실패는 무시
    }

    return jsonNoStore({ ok: true, data: { order: toShopAdminOrderSummary(order) } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_process_shop_refund");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    if (message.includes("not_requested")) return jsonNoStore({ ok: false, error: "shop_refund_not_requested" }, { status: 400 });
    if (message.includes("already_processed")) return jsonNoStore({ ok: false, error: "shop_refund_already_processed" }, { status: 409 });
    if (message.includes("missing_toss") || message.includes("invalid_toss")) return jsonNoStore({ ok: false, error: message }, { status: 500 });
    if (message.startsWith("toss_")) return jsonNoStore({ ok: false, error: message }, { status: 400 });
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
    return jsonNoStore({ ok: false, error: "failed_to_process_shop_refund" }, { status: 500 });
  }
}
