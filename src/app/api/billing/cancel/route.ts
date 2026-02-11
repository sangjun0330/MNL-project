import { NextResponse } from "next/server";
import {
  downgradeToFreeNow,
  markBillingOrderCanceled,
  readBillingOrderByOrderId,
  readLatestRefundableOrder,
  readSubscription,
  resumeScheduledSubscription,
  scheduleSubscriptionCancelAtPeriodEnd,
} from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  buildCancelIdempotencyKey,
  readTossAcceptLanguage,
  readTossClientKeyFromEnv,
  readTossSecretKeyFromEnv,
  readTossTestCodeFromEnv,
} from "@/lib/server/tossConfig";

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
  return sanitizeText(value, "사용자 요청", 180);
}

function toMode(value: unknown): CancelMode | null {
  if (value === "period_end" || value === "resume" || value === "now_refund") return value;
  return null;
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

    const current = await readSubscription(userId);
    if (!current.hasPaidAccess) return bad(400, "no_active_paid_subscription");

    const requestedOrderId = sanitizeText(body?.orderId, "", 80);
    const targetOrder = requestedOrderId
      ? await readBillingOrderByOrderId({ userId, orderId: requestedOrderId })
      : await readLatestRefundableOrder(userId);

    if (!targetOrder?.orderId || !targetOrder.paymentKey) {
      return bad(404, "refundable_order_not_found");
    }
    if (targetOrder.status !== "DONE") return bad(400, "order_not_refundable");

    const client = readTossClientKeyFromEnv();
    if (!client.ok) return bad(500, client.error);

    const secret = readTossSecretKeyFromEnv();
    if (!secret.ok) return bad(500, secret.error);
    if (client.mode !== secret.mode) return bad(500, "toss_key_mode_mismatch");

    const auth = btoa(`${secret.secretKey}:`);
    const tossHeaders: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Idempotency-Key": buildCancelIdempotencyKey(targetOrder.orderId),
    };
    const acceptLanguage = readTossAcceptLanguage(req.headers.get("accept-language"));
    if (acceptLanguage) tossHeaders["Accept-Language"] = acceptLanguage;

    const testCode = readTossTestCodeFromEnv(secret.mode);
    if (testCode) tossHeaders["TossPayments-Test-Code"] = testCode;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("timeout"), 10_000);
    let cancelRes: Response;
    try {
      cancelRes = await fetch(`https://api.tosspayments.com/v1/payments/${targetOrder.paymentKey}/cancel`, {
        method: "POST",
        headers: tossHeaders,
        body: JSON.stringify({
          cancelReason: reason,
          cancelAmount: Math.round(targetOrder.amount),
        }),
        signal: controller.signal,
      });
    } catch {
      return bad(502, "toss_cancel_network_error");
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await cancelRes.text().catch(() => "");
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    if (!cancelRes.ok) {
      const code = sanitizeText(json?.code, `toss_http_${cancelRes.status}`, 120);
      return bad(400, code);
    }

    const status = sanitizeText(json?.status, "");
    if (status !== "CANCELED" && status !== "PARTIAL_CANCELED" && status !== "DONE") {
      return bad(400, "invalid_cancel_status");
    }

    await markBillingOrderCanceled({
      userId,
      orderId: targetOrder.orderId,
      message: sanitizeText(json?.message, "결제가 취소되었습니다."),
    });

    const subscription = await downgradeToFreeNow({
      userId,
      reason: `환불 해지: ${reason}`,
    });

    return NextResponse.json({
      ok: true,
      data: {
        mode,
        orderId: targetOrder.orderId,
        subscription,
      },
    });
  } catch (error: any) {
    return bad(500, sanitizeText(error?.message, "cancel_failed"));
  }
}
