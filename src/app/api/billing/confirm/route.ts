import { NextResponse } from "next/server";
import { markBillingOrderDoneAndApplyPlan, markBillingOrderFailed, readBillingOrderByOrderId, readSubscription } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

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

  const order = await readBillingOrderByOrderId({ userId, orderId }).catch(() => null);
  if (!order) return bad(404, "order_not_found");

  if (order.status === "DONE") {
    const subscription = await readSubscription(userId).catch(() => null);
    return NextResponse.json({ ok: true, data: { order, subscription } });
  }

  if (amount !== order.amount) {
    return bad(400, "amount_mismatch");
  }

  const secretKey = String(process.env.TOSS_SECRET_KEY ?? "").trim();
  if (!secretKey) return bad(500, "missing_toss_secret_key");

  const auth = btoa(`${secretKey}:`);
  const payload = {
    paymentKey,
    orderId,
    amount,
  };

  let confirmRes: Response;
  try {
    confirmRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    await markBillingOrderFailed({
      userId,
      orderId,
      code: "network_error",
      message: "Failed to reach tosspayments confirm API.",
    }).catch(() => undefined);
    return bad(502, "toss_confirm_network_error");
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
    await markBillingOrderFailed({ userId, orderId, code, message }).catch(() => undefined);
    return bad(400, code);
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
