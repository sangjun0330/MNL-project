import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { buildShopOrderConfirmIdempotencyKey, markShopOrderFailed, markShopOrderPaid, readShopOrderForUser } from "@/lib/server/shopOrderStore";
import { readTossAcceptLanguage, readTossSecretKeyFromEnv, readTossTestCodeFromEnv } from "@/lib/server/tossConfig";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitize(value: unknown, max = 220) {
  return String(value ?? "").trim().slice(0, max);
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function isValidOrderId(value: string) {
  return /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

function isValidPaymentKey(value: string) {
  return /^[A-Za-z0-9_-]{10,220}$/.test(value);
}

export async function POST(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const paymentKey = sanitize(body?.paymentKey, 220);
  const orderId = sanitize(body?.orderId, 80);
  const amount = toAmount(body?.amount);
  if (!paymentKey || !orderId || amount == null) return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  if (!isValidOrderId(orderId) || !isValidPaymentKey(paymentKey) || amount <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const order = await readShopOrderForUser(userId, orderId).catch(() => null);
  if (!order) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
  if (order.status === "PAID") return jsonNoStore({ ok: true, data: { order } });
  if (amount !== order.amount) return jsonNoStore({ ok: false, error: "amount_mismatch" }, { status: 400 });

  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) return jsonNoStore({ ok: false, error: secret.error }, { status: 500 });

  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${secret.secretKey}:`)}`,
    "Content-Type": "application/json",
    "Idempotency-Key": buildShopOrderConfirmIdempotencyKey(orderId),
  };
  const acceptLanguage = readTossAcceptLanguage(req.headers.get("accept-language"));
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;
  const testCode = readTossTestCodeFromEnv(secret.mode);
  if (testCode) headers["TossPayments-Test-Code"] = testCode;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 10_000);

  let confirmRes: Response;
  try {
    confirmRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers,
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
      signal: controller.signal,
    });
  } catch {
    await markShopOrderFailed({
      orderId,
      code: "network_error",
      message: "Failed to reach tosspayments confirm API.",
    }).catch(() => undefined);
    return jsonNoStore({ ok: false, error: "toss_confirm_network_error" }, { status: 502 });
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
    const code = sanitize(json?.code, 120) || `toss_http_${confirmRes.status}`;
    const message = sanitize(json?.message, 220) || "Payment confirmation failed.";
    if (code !== "ALREADY_PROCESSED_PAYMENT") {
      await markShopOrderFailed({ orderId, code, message }).catch(() => undefined);
    }
    return jsonNoStore({ ok: false, error: code }, { status: 400 });
  }

  const responseOrderId = sanitize(json?.orderId, 80);
  const responsePaymentKey = sanitize(json?.paymentKey, 220);
  const totalAmount = toAmount(json?.totalAmount ?? json?.balanceAmount ?? amount);
  const status = sanitize(json?.status, 40);
  if ((responseOrderId && responseOrderId !== orderId) || (responsePaymentKey && responsePaymentKey !== paymentKey)) {
    await markShopOrderFailed({
      orderId,
      code: "confirm_response_mismatch",
      message: "Confirm response does not match orderId/paymentKey.",
    }).catch(() => undefined);
    return jsonNoStore({ ok: false, error: "confirm_response_mismatch" }, { status: 400 });
  }
  if (totalAmount == null || totalAmount !== amount || status !== "DONE") {
    const failCode = totalAmount !== amount ? "confirm_amount_mismatch" : `invalid_status_${status || "unknown"}`;
    await markShopOrderFailed({
      orderId,
      code: failCode,
      message: sanitize(json?.message, 220) || "Unexpected confirm response.",
    }).catch(() => undefined);
    return jsonNoStore({ ok: false, error: failCode }, { status: 400 });
  }

  try {
    const paidOrder = await markShopOrderPaid({
      orderId,
      paymentKey,
      approvedAt: typeof json?.approvedAt === "string" ? json.approvedAt : null,
      tossResponse: json,
    });
    return jsonNoStore({ ok: true, data: { order: paidOrder } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_finalize_shop_order" }, { status: 500 });
  }
}
