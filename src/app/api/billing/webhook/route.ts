import { NextResponse } from "next/server";
import {
  downgradeToFreeNow,
  markBillingOrderDoneAndApplyPlan,
  markBillingOrderFailed,
  markRefundRequestRefundedBySystem,
  removeUnsettledBillingOrder,
  readBillingOrderByOrderIdAny,
  readPendingRefundRequestByOrder,
} from "@/lib/server/billingStore";
import type { Json } from "@/types/supabase";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DONE_STATUSES = new Set(["DONE"]);
const CANCELED_STATUSES = new Set(["CANCELED", "PARTIAL_CANCELED"]);
const FAILED_STATUSES = new Set(["ABORTED", "EXPIRED", "FAILED", "REJECTED"]);
let warnedDeprecatedQueryToken = false;
let warnedInsecureIpFallback = false;

function ok(data?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function clean(value: unknown, size = 220) {
  return String(value ?? "").trim().slice(0, size);
}

function envFlag(name: string, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function asJson(value: unknown): Json {
  return (value ?? null) as Json;
}

function isPaymentOrderId(value: string) {
  return /^[A-Za-z0-9_-]{6,80}$/.test(value);
}

function isPaymentKey(value: string) {
  return /^[A-Za-z0-9_-]{10,220}$/.test(value);
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    // 길이 차이도 시간 기반 공격으로 유추되지 않도록 동일한 연산을 수행 후 false 반환
    let diff = 0;
    for (let i = 0; i < Math.max(aBytes.length, bBytes.length); i++) {
      diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function isWebhookAuthorized(req: Request) {
  const expected = clean(process.env.TOSS_WEBHOOK_TOKEN, 120);
  // 토큰이 설정되지 않은 경우 모든 요청을 거부하여 위조 웹훅 공격 방지
  if (!expected) return false;

  const headerToken = clean(req.headers.get("x-toss-webhook-token"), 120);
  if (headerToken) return timingSafeEqual(headerToken, expected);

  const urlToken = clean(new URL(req.url).searchParams.get("token"), 120);
  if (!urlToken) return false;

  const allowQueryToken = envFlag("TOSS_WEBHOOK_ALLOW_QUERY_TOKEN", process.env.NODE_ENV !== "production");
  if (!allowQueryToken) return false;

  if (process.env.NODE_ENV === "production" && !warnedDeprecatedQueryToken) {
    warnedDeprecatedQueryToken = true;
    console.warn(
      "[Webhook] Query-string token fallback is enabled. Move token to x-toss-webhook-token header and disable TOSS_WEBHOOK_ALLOW_QUERY_TOKEN."
    );
  }
  return timingSafeEqual(urlToken, expected);
}

function toIpv4Int(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function matchesIpv4Rule(ip: string, rule: string): boolean {
  const ipInt = toIpv4Int(ip);
  if (ipInt == null) return false;

  const raw = rule.trim();
  if (!raw) return false;

  if (!raw.includes("/")) {
    return ip === raw;
  }

  const [base, bitsRaw] = raw.split("/", 2);
  const baseInt = toIpv4Int(base);
  const bits = Number(bitsRaw);
  if (baseInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const shift = 32 - bits;
  const mask = bits === 0 ? 0 : ((0xffffffff << shift) >>> 0);
  return (ipInt & mask) === (baseInt & mask);
}

function readWebhookClientIp(req: Request): string {
  const cfIp = clean(req.headers.get("cf-connecting-ip"), 80);
  if (cfIp) return cfIp;

  const xff = clean(req.headers.get("x-forwarded-for"), 220);
  if (xff) return clean(xff.split(",")[0], 80);
  return "";
}

function checkWebhookIpAllowed(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const rules = clean(process.env.TOSS_WEBHOOK_IP_ALLOWLIST, 1200)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rules.length === 0) {
    const allowInsecureFallback = envFlag("TOSS_WEBHOOK_ALLOW_INSECURE_NO_IP_ALLOWLIST", process.env.NODE_ENV !== "production");
    if (!allowInsecureFallback) {
      return { ok: false, status: 503, error: "webhook_ip_allowlist_not_configured" };
    }
    if (process.env.NODE_ENV === "production" && !warnedInsecureIpFallback) {
      warnedInsecureIpFallback = true;
      console.error(
        "[Webhook] TOSS_WEBHOOK_IP_ALLOWLIST is not configured. Temporary insecure fallback is enabled via TOSS_WEBHOOK_ALLOW_INSECURE_NO_IP_ALLOWLIST."
      );
    }
    return { ok: true };
  }

  const ip = readWebhookClientIp(req);
  if (!ip) return { ok: false, status: 403, error: "webhook_ip_missing" };

  return rules.some((rule) => matchesIpv4Rule(ip, rule))
    ? { ok: true }
    : { ok: false, status: 403, error: "forbidden_webhook_ip" };
}

async function syncRefundRequestFromWebhookCancel(input: {
  userId: string;
  orderId: string;
  status: string;
  payload: unknown;
}): Promise<number | null> {
  if (input.status !== "CANCELED") return null;

  const pending = await readPendingRefundRequestByOrder({
    userId: input.userId,
    orderId: input.orderId,
  });
  if (!pending) return null;

  const data: any = (input.payload as any)?.data ?? {};
  const transactionKey = clean(data?.cancels?.[0]?.transactionKey ?? data?.lastTransactionKey ?? "", 220) || null;
  try {
    const synced = await markRefundRequestRefundedBySystem({
      id: pending.id,
      reason: `Webhook cancel sync: ${input.status || "CANCELED"}`,
      transactionKey,
      gatewayResponse: asJson(input.payload),
    });
    return synced.id;
  } catch (error: any) {
    const message = String(error?.message ?? "");
    if (message.startsWith("invalid_refund_request_state:") || message === "refund_request_conflict") {
      return null;
    }
    throw error;
  }
}

export async function POST(req: Request) {
  if (!isWebhookAuthorized(req)) {
    return bad(401, "unauthorized_webhook");
  }
  const ipCheck = checkWebhookIpAllowed(req);
  if (!ipCheck.ok) {
    return bad(ipCheck.status, ipCheck.error);
  }

  let payload: any = null;
  try {
    const raw = await req.text();
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    return bad(400, "invalid_json");
  }

  const eventType = clean(payload?.eventType || payload?.event_type || "", 80);
  const data = payload?.data ?? {};
  const orderId = clean(data?.orderId || payload?.orderId || "", 80);
  const status = clean(data?.status || payload?.status || "", 80).toUpperCase();
  const paymentKey = clean(data?.paymentKey || payload?.paymentKey || "", 220);
  const approvedAt = clean(data?.approvedAt || payload?.approvedAt || "", 80) || null;
  const totalAmount = toAmount(data?.totalAmount ?? data?.balanceAmount ?? data?.suppliedAmount ?? payload?.totalAmount);

  // Unknown payloads are acknowledged to prevent noisy webhook retries.
  if (!eventType || !orderId || !isPaymentOrderId(orderId)) {
    return ok({ accepted: false, reason: "ignored_payload" });
  }

  const order = await readBillingOrderByOrderIdAny(orderId).catch(() => null);
  if (!order || !order.userId) {
    return ok({ accepted: false, reason: "unknown_order", orderId });
  }

  const userId = order.userId;

  // If already finalized, keep idempotent.
  if (order.status === "DONE") {
    return ok({ accepted: true, reason: "already_done", orderId });
  }

  try {
    if (eventType === "PAYMENT_STATUS_CHANGED" || eventType === "DEPOSIT_CALLBACK") {
      if (DONE_STATUSES.has(status)) {
        if (!paymentKey || !isPaymentKey(paymentKey)) {
          return ok({ accepted: false, reason: "missing_payment_key", orderId });
        }

        const amount = totalAmount ?? order.amount;
        await markBillingOrderDoneAndApplyPlan({
          userId,
          orderId,
          paymentKey,
          approvedAt,
          amount,
          tossResponse: asJson(payload),
        });
        return ok({ accepted: true, action: "done", orderId });
      }

      if (CANCELED_STATUSES.has(status)) {
        if (order.status === "READY" || order.status === "FAILED") {
          await removeUnsettledBillingOrder({
            userId,
            orderId,
          });
        } else if (order.status === "CANCELED") {
          // 이미 완료 환불 처리된 주문 이력은 유지
        }
        const syncedRefundId = await syncRefundRequestFromWebhookCancel({
          userId,
          orderId,
          status,
          payload,
        });
        if (status === "CANCELED" && order.orderKind === "subscription") {
          await downgradeToFreeNow({
            userId,
            reason: `Webhook cancel: ${status}`,
          });
        }
        return ok({ accepted: true, action: "canceled", orderId, syncedRefundId });
      }

      if (FAILED_STATUSES.has(status)) {
        await markBillingOrderFailed({
          userId,
          orderId,
          code: `webhook_${status.toLowerCase()}`,
          message: `Webhook status: ${status || "FAILED"}`,
        });
        await removeUnsettledBillingOrder({
          userId,
          orderId,
        });
        return ok({ accepted: true, action: "failed", orderId });
      }

      return ok({ accepted: false, reason: "ignored_status", orderId, status });
    }

    if (eventType === "CANCEL_STATUS_CHANGED") {
      if (order.status === "READY" || order.status === "FAILED") {
        await removeUnsettledBillingOrder({
          userId,
          orderId,
        });
      } else if (order.status === "CANCELED") {
        // 이미 완료 환불 처리된 주문 이력은 유지
      }
      const syncedRefundId = await syncRefundRequestFromWebhookCancel({
        userId,
        orderId,
        status,
        payload,
      });
      if (status === "CANCELED" && order.orderKind === "subscription") {
        await downgradeToFreeNow({
          userId,
          reason: `Webhook cancel: ${status}`,
        });
      }
      return ok({ accepted: true, action: "canceled", orderId, syncedRefundId });
    }

    return ok({ accepted: false, reason: "ignored_event", eventType, orderId });
  } catch {
    // Return non-2xx so Toss retries for temporary failures.
    // 내부 에러 상세 정보는 외부에 노출하지 않음
    return bad(500, "webhook_processing_failed");
  }
}
