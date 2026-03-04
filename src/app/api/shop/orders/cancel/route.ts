/**
 * FEAT-01: 사용자 주문 취소 API
 *
 * POST /api/shop/orders/cancel
 * Body: { orderId: string }
 *
 * 취소 가능 조건:
 *   READY 상태 → 즉시 CANCELED (결제 없음)
 *   PAID 상태 + 발송 전 + 승인 후 1시간 이내 → Toss 즉시 취소 → REFUNDED
 *   PAID 번들 주문 → 취소 불가, 환불 신청 안내
 *   그 외 → 취소 불가
 */

import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { cancelShopOrderByUser, toShopOrderSummary } from "@/lib/server/shopOrderStore";
import { loadUserEmailById, sendOrderCanceledEmail } from "@/lib/server/emailService";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitize(value: unknown, max = 80) {
  return String(value ?? "").trim().slice(0, max);
}

function isValidOrderId(value: string) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(value);
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

  const orderId = sanitize(body?.orderId);
  if (!orderId || !isValidOrderId(orderId)) {
    return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const { order, refunded } = await cancelShopOrderByUser({
      userId,
      orderId,
      requestAcceptLanguage: req.headers.get("accept-language"),
    });

    // FEAT-05: 취소 이메일 발송 (fire-and-forget, 실패 시 콘솔 기록)
    loadUserEmailById(userId)
      .then((email) =>
        sendOrderCanceledEmail({
          customerEmail: email,
          productName: order.productSnapshot.name,
          orderId: order.orderId,
          refunded,
          amount: order.amount,
        })
      )
      .catch((emailError) => {
        console.error("[OrderCancel] 취소 이메일 발송 실패 orderId=%s err=%s", order.orderId, String(emailError?.message ?? emailError));
      });

    return jsonNoStore({
      ok: true,
      data: {
        order: toShopOrderSummary(order),
        refunded,
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "");

    if (message === "shop_order_not_found") {
      return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    }
    if (message === "shop_order_not_cancelable") {
      return jsonNoStore(
        {
          ok: false,
          error: "shop_order_not_cancelable",
          hint: "배송 시작 후 또는 결제 후 1시간 초과 주문은 취소할 수 없습니다. 환불 신청을 이용해 주세요.",
        },
        { status: 400 }
      );
    }
    if (message === "shop_order_already_shipped") {
      return jsonNoStore(
        {
          ok: false,
          error: "shop_order_already_shipped",
          hint: "이미 발송된 주문은 취소할 수 없습니다. 환불 신청을 이용해 주세요.",
        },
        { status: 400 }
      );
    }
    if (message === "shop_order_cancel_window_expired") {
      return jsonNoStore(
        {
          ok: false,
          error: "shop_order_cancel_window_expired",
          hint: "결제 후 1시간이 지난 주문은 즉시 취소가 불가합니다. 환불 신청을 이용해 주세요.",
        },
        { status: 400 }
      );
    }
    if (message === "shop_bundle_cancel_use_refund") {
      return jsonNoStore(
        {
          ok: false,
          error: "shop_bundle_cancel_use_refund",
          hint: "묶음 결제 주문은 개별 취소가 불가합니다. 환불 신청을 이용해 주세요.",
        },
        { status: 400 }
      );
    }

    console.error("[OrderCancel] 주문 취소 실패 userId=%s orderId=%s err=%s", userId, orderId, message);
    return jsonNoStore({ ok: false, error: "failed_to_cancel_order" }, { status: 500 });
  }
}
