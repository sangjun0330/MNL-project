import { NextResponse } from "next/server";
import {
  createRefundRequest,
  markRefundRequestNotified,
  readBillingOrderByOrderId,
  readLatestRefundableOrder,
  readPendingRefundRequestByOrder,
  readSubscription,
  resumeScheduledSubscription,
  scheduleSubscriptionCancelAtPeriodEnd,
} from "@/lib/server/billingStore";
import { sendRefundRequestNotification } from "@/lib/server/refundNotification";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type CancelMode = "period_end" | "resume" | "now_refund";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function sanitizeText(value: unknown, fallback: string, size = 220) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.slice(0, size);
}

function sanitizeReason(value: unknown) {
  return sanitizeText(value, "사용자 요청", 500);
}

function toMode(value: unknown): CancelMode | null {
  if (value === "period_end" || value === "resume" || value === "now_refund") return value;
  return null;
}

async function readRequesterEmail(req: Request): Promise<string | null> {
  try {
    const supabase = await getRouteSupabaseClient();
    const bearer = req.headers.get("authorization") ?? "";
    const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
    const { data } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const mode = toMode(body?.mode);
  if (!mode) return bad(400, "invalid_mode");
  const reason = sanitizeReason(body?.reason);

  try {
    if (mode === "period_end") {
      const subscription = await scheduleSubscriptionCancelAtPeriodEnd({ userId, reason });
      return NextResponse.json({ ok: true, data: { mode, subscription } });
    }

    if (mode === "resume") {
      const subscription = await resumeScheduledSubscription({ userId });
      return NextResponse.json({ ok: true, data: { mode, subscription } });
    }

    const requestedOrderId = sanitizeText(body?.orderId, "", 80);
    const targetOrder = requestedOrderId
      ? await readBillingOrderByOrderId({ userId, orderId: requestedOrderId })
      : await readLatestRefundableOrder(userId);

    if (!targetOrder?.orderId) {
      return bad(404, "refundable_order_not_found");
    }
    if (targetOrder.status !== "DONE") return bad(400, "order_not_refundable");
    if (!targetOrder.paymentKey) return bad(400, "missing_payment_key_for_refund_request");

    const existing = await readPendingRefundRequestByOrder({
      userId,
      orderId: targetOrder.orderId,
    });
    if (existing) {
      const subscription = await readSubscription(userId).catch(() => null);
      return NextResponse.json({
        ok: true,
        data: {
          mode,
          orderId: targetOrder.orderId,
          refundRequestId: existing.id,
          refundRequestStatus: existing.status,
          notificationSent: Boolean(existing.notifiedAt),
          message: "이미 환불 요청이 접수되었습니다. 관리자가 사유 검토 후 수동 처리합니다.",
          subscription,
        },
      });
    }

    const refundRequest = await createRefundRequest({
      userId,
      orderId: targetOrder.orderId,
      reason,
      cancelAmount: targetOrder.amount,
      currency: targetOrder.currency,
      paymentKeySnapshot: targetOrder.paymentKey,
    });
    const requesterEmail = await readRequesterEmail(req);

    const notify = await sendRefundRequestNotification({
      requestId: refundRequest.id,
      userId,
      requesterEmail,
      orderId: targetOrder.orderId,
      reason,
      amount: targetOrder.amount,
      planTier: targetOrder.planTier,
      requestedAt: refundRequest.requestedAt,
    });

    if (notify.sent) {
      await markRefundRequestNotified({ id: refundRequest.id }).catch(() => undefined);
    }

    const subscription = await readSubscription(userId).catch(() => null);

    return NextResponse.json({
      ok: true,
      data: {
        mode,
        orderId: targetOrder.orderId,
        refundRequestId: refundRequest.id,
        refundRequestStatus: refundRequest.status,
        notificationSent: notify.sent,
        notificationMessage: notify.message,
        message: notify.sent
          ? "환불 요청이 접수되었고 관리자 메일로 전달되었습니다. 검토 후 수동 환불 처리됩니다."
          : "환불 요청이 접수되었습니다. 메일 전송이 실패해도 요청은 저장되었으며 관리자가 수동 확인합니다.",
        subscription,
      },
    });
  } catch (error: any) {
    return bad(500, sanitizeText(error?.message, "cancel_failed"));
  }
}
