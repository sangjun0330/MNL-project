import { NextResponse } from "next/server";
import { markBillingOrderDoneAndApplyPlan, markBillingOrderFailed, readBillingOrderByOrderId, readSubscription } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  buildConfirmIdempotencyKey,
  readTossAcceptLanguage,
  readTossClientKeyFromEnv,
  readTossSecretKeyFromEnv,
  readTossTestCodeFromEnv,
} from "@/lib/server/tossConfig";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function sanitizeText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.slice(0, 220);
}

function isValidOrderId(value: string) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

function isValidPaymentKey(value: string) {
  return /^[A-Za-z0-9_-]{10,220}$/.test(value);
}

export async function POST(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const paymentKey = String(body?.paymentKey ?? "").trim();
  const orderId = String(body?.orderId ?? "").trim();
  const amount = toAmount(body?.amount);

  if (!paymentKey || !orderId || amount == null) {
    return bad(400, "invalid_payload");
  }
  if (!isValidOrderId(orderId) || !isValidPaymentKey(paymentKey) || amount <= 0) {
    return bad(400, "invalid_payload");
  }

  const order = await readBillingOrderByOrderId({ userId, orderId }).catch(() => null);
  if (!order) return bad(404, "order_not_found");

  if (order.status === "DONE") {
    const subscription = await readSubscription(userId).catch(() => null);
    return NextResponse.json({ ok: true, data: { order, subscription } });
  }

  if (amount !== order.amount) {
    return bad(400, "amount_mismatch");
  }

  const client = readTossClientKeyFromEnv();
  if (!client.ok) return bad(500, client.error);

  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) return bad(500, secret.error);
  if (client.mode !== secret.mode) return bad(500, "toss_key_mode_mismatch");

  const auth = btoa(`${secret.secretKey}:`);
  const payload = {
    paymentKey,
    orderId,
    amount,
  };
  const tossHeaders: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    "Idempotency-Key": buildConfirmIdempotencyKey(orderId),
  };
  const acceptLanguage = readTossAcceptLanguage(req.headers.get("accept-language"));
  if (acceptLanguage) tossHeaders["Accept-Language"] = acceptLanguage;

  const testCode = readTossTestCodeFromEnv(secret.mode);
  if (testCode) tossHeaders["TossPayments-Test-Code"] = testCode;

  let confirmRes: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 10_000);
  try {
    confirmRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: tossHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    await markBillingOrderFailed({
      userId,
      orderId,
      code: "network_error",
      message: "Failed to reach tosspayments confirm API.",
    }).catch(() => undefined);
    return bad(502, "toss_confirm_network_error");
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await confirmRes.text().catch(() => "");
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!confirmRes.ok) {
    const code = sanitizeText(json?.code, `toss_http_${confirmRes.status}`);
    const message = sanitizeText(json?.message, "Payment confirmation failed.");
    // 멱등키 재시도 중 발생 가능한 중복 승인 코드는 실패로 확정하지 않습니다.
    if (code !== "ALREADY_PROCESSED_PAYMENT") {
      await markBillingOrderFailed({ userId, orderId, code, message }).catch(() => undefined);
    }
    return bad(400, code);
  }

  const responseOrderId = sanitizeText(json?.orderId, "");
  const responsePaymentKey = sanitizeText(json?.paymentKey, "");
  if (
    (responseOrderId && responseOrderId !== orderId) ||
    (responsePaymentKey && responsePaymentKey !== paymentKey)
  ) {
    await markBillingOrderFailed({
      userId,
      orderId,
      code: "confirm_response_mismatch",
      message: "Confirm response does not match orderId/paymentKey.",
    }).catch(() => undefined);
    return bad(400, "confirm_response_mismatch");
  }

  const totalAmount = toAmount(json?.totalAmount ?? json?.balanceAmount ?? json?.suppliedAmount ?? amount);
  const status = sanitizeText(json?.status, "");
  if (totalAmount == null || totalAmount !== amount || status !== "DONE") {
    const failCode = totalAmount !== amount ? "confirm_amount_mismatch" : `invalid_status_${status || "unknown"}`;
    await markBillingOrderFailed({
      userId,
      orderId,
      code: failCode,
      message: sanitizeText(json?.message, "Unexpected confirm response."),
    }).catch(() => undefined);
    return bad(400, failCode);
  }

  try {
    const subscription = await markBillingOrderDoneAndApplyPlan({
      userId,
      orderId,
      paymentKey,
      approvedAt: typeof json?.approvedAt === "string" ? json.approvedAt : null,
      amount,
      tossResponse: json,
    });
    const latestOrder = await readBillingOrderByOrderId({ userId, orderId });

    return NextResponse.json({
      ok: true,
      data: {
        order: latestOrder,
        subscription,
      },
    });
  } catch (error: any) {
    return bad(500, error?.message || "failed_to_finalize_order");
  }
}
