import {
  downgradeToFreeNow,
  markBillingOrderCanceled,
  markRefundRequestExecuting,
  markRefundRequestFailed,
  markRefundRequestRefunded,
  readBillingOrderByOrderIdAny,
  readRefundRequestById,
  readSubscription,
  type BillingRefundRequestSummary,
  type SubscriptionSnapshot,
} from "@/lib/server/billingStore";
import {
  buildCancelIdempotencyKey,
  readTossAcceptLanguage,
  readTossClientKeyFromEnv,
  readTossSecretKeyFromEnv,
  readTossTestCodeFromEnv,
} from "@/lib/server/tossConfig";
import type { Json } from "@/types/supabase";

export type ExecuteRefundRequestInput = {
  refundId: number;
  actorUserId: string;
  note?: string | null;
  cancelAmount?: number | null;
  allowedRequestStatuses?: string[];
  requestAcceptLanguage?: string | null;
};

export type ExecuteRefundRequestResult = {
  request: BillingRefundRequestSummary;
  subscription: SubscriptionSnapshot | null;
  cancelStatus: string;
  alreadyRefunded: boolean;
};

const DEFAULT_ALLOWED_STATUSES = ["APPROVED", "FAILED_RETRYABLE", "EXECUTING"];

function clean(value: unknown, size = 220) {
  return String(value ?? "").trim().slice(0, size);
}

function toAmount(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function isPaymentKey(value: string) {
  return /^[A-Za-z0-9_-]{10,220}$/.test(value);
}

function isRetryableGatewayError(httpStatus: number, code: string): boolean {
  if (httpStatus >= 500 || httpStatus === 429) return true;
  const retryableCodes = new Set(["INTERNAL_SERVER_ERROR", "TIMEOUT", "SYSTEM_ERROR", "TOO_MANY_REQUESTS"]);
  return retryableCodes.has(code);
}

export function toExecuteRefundHttpError(error: any): { status: number; message: string } {
  const message = String(error?.message ?? "execute_refund_failed");
  if (message === "refund_request_not_found") return { status: 404, message };
  if (message.startsWith("invalid_refund_request_state:")) return { status: 409, message };
  if (message === "refund_request_conflict") return { status: 409, message };
  if (message === "billing_order_not_found") return { status: 404, message };
  if (message === "missing_payment_key_for_refund") return { status: 400, message };
  if (message === "invalid_cancel_amount") return { status: 400, message };
  if (message === "refund_order_user_mismatch") return { status: 409, message };
  if (message === "toss_cancel_network_error") return { status: 502, message };
  if (message.startsWith("toss_http_")) return { status: 502, message };
  if (message.startsWith("toss_retryable:")) return { status: 502, message: message.replace("toss_retryable:", "") };
  if (message.startsWith("toss_rejected:")) return { status: 400, message: message.replace("toss_rejected:", "") };
  if (message === "invalid_cancel_status") return { status: 400, message };
  if (message === "missing_toss_client_key" || message === "missing_toss_secret_key") return { status: 500, message };
  if (message === "toss_key_mode_mismatch") return { status: 500, message };
  return { status: 500, message };
}

export async function executeRefundRequest(input: ExecuteRefundRequestInput): Promise<ExecuteRefundRequestResult> {
  const note = clean(input.note, 500) || null;

  const refundRequest = await readRefundRequestById(input.refundId);
  if (!refundRequest) throw new Error("refund_request_not_found");

  if (refundRequest.status === "REFUNDED") {
    let subscription: SubscriptionSnapshot | null = null;
    try {
      subscription = await readSubscription(refundRequest.userId);
    } catch {
      subscription = null;
    }
    return {
      request: refundRequest,
      subscription,
      cancelStatus: "ALREADY_REFUNDED",
      alreadyRefunded: true,
    };
  }

  const allowedStatuses = (input.allowedRequestStatuses ?? DEFAULT_ALLOWED_STATUSES).map((value) =>
    String(value ?? "").trim().toUpperCase()
  );
  if (!allowedStatuses.includes(refundRequest.status)) {
    throw new Error(`invalid_refund_request_state:${refundRequest.status}`);
  }

  const order = await readBillingOrderByOrderIdAny(refundRequest.orderId);
  if (!order?.orderId) throw new Error("billing_order_not_found");
  if (order.userId && order.userId !== refundRequest.userId) {
    throw new Error("refund_order_user_mismatch");
  }

  const paymentKey = clean(refundRequest.tossPaymentKeySnapshot || order.paymentKey, 220);
  if (!paymentKey || !isPaymentKey(paymentKey)) {
    throw new Error("missing_payment_key_for_refund");
  }

  const cancelAmount = toAmount(input.cancelAmount) ?? refundRequest.cancelAmount ?? order.amount;
  if (!cancelAmount || cancelAmount <= 0 || cancelAmount !== order.amount) {
    throw new Error("invalid_cancel_amount");
  }

  if (refundRequest.status !== "EXECUTING") {
    await markRefundRequestExecuting({
      id: refundRequest.id,
      adminUserId: input.actorUserId,
      note,
    });
  }

  const client = readTossClientKeyFromEnv();
  if (!client.ok) throw new Error(client.error);
  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) throw new Error(secret.error);
  if (client.mode !== secret.mode) throw new Error("toss_key_mode_mismatch");

  const auth = btoa(`${secret.secretKey}:`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    "Idempotency-Key": buildCancelIdempotencyKey(`${order.orderId}_${refundRequest.id}`),
  };
  const acceptLanguage = readTossAcceptLanguage(input.requestAcceptLanguage ?? null);
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;

  const testCode = readTossTestCodeFromEnv(secret.mode);
  if (testCode) headers["TossPayments-Test-Code"] = testCode;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 12_000);

  let cancelRes: Response;
  try {
    cancelRes = await fetch(`https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cancelReason: note || "관리자 환불 승인",
        cancelAmount,
      }),
      signal: controller.signal,
    });
  } catch {
    await markRefundRequestFailed({
      id: refundRequest.id,
      adminUserId: input.actorUserId,
      code: "gateway_network_error",
      message: "Failed to reach tosspayments cancel API.",
      retryable: true,
    }).catch(() => undefined);
    throw new Error("toss_cancel_network_error");
  } finally {
    clearTimeout(timeoutId);
  }

  const raw = await cancelRes.text().catch(() => "");
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!cancelRes.ok) {
    const code = clean(json?.code, 120) || `toss_http_${cancelRes.status}`;
    const message = clean(json?.message, 500) || "toss_cancel_failed";
    const retryable = isRetryableGatewayError(cancelRes.status, code);
    await markRefundRequestFailed({
      id: refundRequest.id,
      adminUserId: input.actorUserId,
      code,
      message,
      retryable,
      gatewayResponse: (json ?? null) as Json | null,
    }).catch(() => undefined);
    throw new Error(retryable ? `toss_retryable:${code}` : `toss_rejected:${code}`);
  }

  const cancelStatus = clean(json?.status, 80).toUpperCase();
  if (!["CANCELED", "PARTIAL_CANCELED", "DONE"].includes(cancelStatus)) {
    await markRefundRequestFailed({
      id: refundRequest.id,
      adminUserId: input.actorUserId,
      code: "invalid_cancel_status",
      message: `Unexpected cancel status: ${cancelStatus || "unknown"}`,
      retryable: false,
      gatewayResponse: (json ?? null) as Json | null,
    }).catch(() => undefined);
    throw new Error("invalid_cancel_status");
  }

  const transactionKey = clean(json?.cancels?.[0]?.transactionKey ?? json?.lastTransactionKey ?? "", 220) || null;
  await markBillingOrderCanceled({
    userId: refundRequest.userId,
    orderId: refundRequest.orderId,
    message: clean(json?.message, 220) || `Manual refund executed: ${cancelStatus}`,
  });

  const subscription = await downgradeToFreeNow({
    userId: refundRequest.userId,
    reason: `관리자 환불 처리 #${refundRequest.id}`,
  });

  const updatedRequest = await markRefundRequestRefunded({
    id: refundRequest.id,
    adminUserId: input.actorUserId,
    transactionKey,
    gatewayResponse: (json ?? null) as Json | null,
    note: note || "관리자 수동 환불 완료",
  });

  return {
    request: updatedRequest,
    subscription,
    cancelStatus,
    alreadyRefunded: false,
  };
}
