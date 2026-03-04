import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { removeShopCartItem } from "@/lib/server/shopCartStore";
import {
  markShopOrderFailed,
  markShopOrderPaid,
  readShopOrderForUser,
  toShopOrderSummary,
  type ShopOrderRecord,
} from "@/lib/server/shopOrderStore";
import {
  markShopOrderBundleFailed,
  markShopOrderBundlePaid,
  readShopOrderBundleForUser,
  toShopOrderBundleSummary,
  type ShopOrderBundleRecord,
} from "@/lib/server/shopOrderBundleStore";
import { buildConfirmIdempotencyKey, readTossAcceptLanguage, readTossSecretKeyFromEnv, readTossTestCodeFromEnv } from "@/lib/server/tossConfig";
import { loadUserEmailById, sendOrderConfirmationEmail } from "@/lib/server/emailService";

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

function isShopStorageSetupError(message: string) {
  const lower = String(message ?? "").toLowerCase();
  return (
    lower === "shop_order_storage_unavailable" ||
    lower.includes("supabase admin env missing") ||
    lower.includes("schema cache") ||
    lower.includes("shop_orders") ||
    lower.includes("rnest_user_state") ||
    lower.includes("rnest_users") ||
    lower.includes("ai_content") ||
    lower.includes("foreign key")
  );
}

type TossConfirmFailure = {
  ok: false;
  status: number;
  error: string;
  failureCode: string;
  failureMessage: string;
  shouldMarkFailed: boolean;
};

type TossConfirmSuccess = {
  ok: true;
  json: any;
  approvedAt: string | null;
};

async function confirmWithToss(req: Request, input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmFailure | TossConfirmSuccess> {
  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) {
    return {
      ok: false,
      status: 500,
      error: secret.error,
      failureCode: "missing_toss_secret_key",
      failureMessage: "결제 승인 설정을 확인할 수 없습니다.",
      shouldMarkFailed: false,
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${secret.secretKey}:`)}`,
    "Content-Type": "application/json",
    "Idempotency-Key": buildConfirmIdempotencyKey(input.orderId),
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
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
      signal: controller.signal,
    });
  } catch {
    return {
      ok: false,
      status: 502,
      error: "toss_confirm_network_error",
      failureCode: "network_error",
      failureMessage: "Failed to reach tosspayments confirm API.",
      shouldMarkFailed: true,
    };
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
    return {
      ok: false,
      status: 400,
      error: code,
      failureCode: code,
      failureMessage: message,
      shouldMarkFailed: code !== "ALREADY_PROCESSED_PAYMENT",
    };
  }

  const responseOrderId = sanitize(json?.orderId, 80);
  const responsePaymentKey = sanitize(json?.paymentKey, 220);
  const totalAmount = toAmount(json?.totalAmount ?? json?.balanceAmount ?? input.amount);
  const status = sanitize(json?.status, 40);
  if ((responseOrderId && responseOrderId !== input.orderId) || (responsePaymentKey && responsePaymentKey !== input.paymentKey)) {
    return {
      ok: false,
      status: 400,
      error: "confirm_response_mismatch",
      failureCode: "confirm_response_mismatch",
      failureMessage: "Confirm response does not match orderId/paymentKey.",
      shouldMarkFailed: true,
    };
  }
  if (totalAmount == null || totalAmount !== input.amount || status !== "DONE") {
    const failureCode = totalAmount !== input.amount ? "confirm_amount_mismatch" : `invalid_status_${status || "unknown"}`;
    return {
      ok: false,
      status: 400,
      error: failureCode,
      failureCode,
      failureMessage: sanitize(json?.message, 220) || "Unexpected confirm response.",
      shouldMarkFailed: true,
    };
  }

  return {
    ok: true,
    json,
    approvedAt: typeof json?.approvedAt === "string" ? json.approvedAt : null,
  };
}

async function handleSingleOrderConfirm(req: Request, input: {
  userId: string;
  order: ShopOrderRecord;
  paymentKey: string;
  amount: number;
}) {
  const toss = await confirmWithToss(req, {
    paymentKey: input.paymentKey,
    orderId: input.order.orderId,
    amount: input.amount,
  });

  if (!toss.ok) {
    if (toss.shouldMarkFailed) {
      await markShopOrderFailed({
        orderId: input.order.orderId,
        code: toss.failureCode,
        message: toss.failureMessage,
      }).catch(() => undefined);
    }
    return jsonNoStore({ ok: false, error: toss.error }, { status: toss.status });
  }

  try {
    const paidOrder = await markShopOrderPaid({
      orderId: input.order.orderId,
      paymentKey: input.paymentKey,
      approvedAt: toss.approvedAt,
      tossResponse: toss.json,
    });
    await removeShopCartItem(paidOrder.userId, paidOrder.productId).catch(() => undefined);

    // BUG-08: 이메일 실패 시 콘솔에 기록 (사용자/운영자 가시성 확보)
    loadUserEmailById(paidOrder.userId)
      .then((email) =>
        sendOrderConfirmationEmail({
          orderId: paidOrder.orderId,
          customerEmail: email,
          productName: paidOrder.productSnapshot.name,
          quantity: paidOrder.productSnapshot.quantity,
          amount: paidOrder.amount,
          recipientName: paidOrder.shipping.recipientName,
          addressLine1: paidOrder.shipping.addressLine1,
          addressLine2: paidOrder.shipping.addressLine2,
        })
      )
      .catch((emailError) => {
        console.error("[OrderConfirm] 주문확인 이메일 발송 실패 orderId=%s err=%s", paidOrder.orderId, String(emailError?.message ?? emailError));
      });

    return jsonNoStore({
      ok: true,
      data: {
        mode: "single",
        order: toShopOrderSummary(paidOrder),
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "");
    if (isShopStorageSetupError(message)) {
      return jsonNoStore({ ok: false, error: "shop_order_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_finalize_shop_order" }, { status: 500 });
  }
}

async function markBundleChildrenFailed(orderIds: string[], code: string, message: string) {
  await Promise.all(
    orderIds.map((orderId) =>
      markShopOrderFailed({
        orderId,
        code,
        message,
      }).catch(() => undefined)
    )
  );
}

async function handleBundleOrderConfirm(req: Request, input: {
  userId: string;
  bundle: ShopOrderBundleRecord;
  paymentKey: string;
  amount: number;
}) {
  const toss = await confirmWithToss(req, {
    paymentKey: input.paymentKey,
    orderId: input.bundle.bundleId,
    amount: input.amount,
  });

  if (!toss.ok) {
    if (toss.shouldMarkFailed) {
      await markShopOrderBundleFailed({
        userId: input.userId,
        bundleId: input.bundle.bundleId,
        code: toss.failureCode,
        message: toss.failureMessage,
      }).catch(() => undefined);
      await markBundleChildrenFailed(
        input.bundle.items.map((item) => item.orderId),
        toss.failureCode,
        toss.failureMessage
      );
    }
    return jsonNoStore({ ok: false, error: toss.error }, { status: toss.status });
  }

  try {
    // BUG-07: 개별 주문 markShopOrderPaid 실패 시 부분 성공 감지 및 로깅
    const paidOrders = [];
    const failedOrderIds: string[] = [];

    for (const item of input.bundle.items) {
      try {
        const paidOrder = await markShopOrderPaid({
          orderId: item.orderId,
          paymentKey: input.paymentKey,
          approvedAt: toss.approvedAt,
          tossResponse: toss.json,
        });
        paidOrders.push(paidOrder);
        await removeShopCartItem(paidOrder.userId, paidOrder.productId).catch(() => undefined);
      } catch (itemError: any) {
        failedOrderIds.push(item.orderId);
        console.error(
          "[BundleConfirm] bundle_partial_failure bundleId=%s orderId=%s err=%s",
          input.bundle.bundleId,
          item.orderId,
          String(itemError?.message ?? itemError)
        );
      }
    }

    if (failedOrderIds.length > 0) {
      console.error(
        "[BundleConfirm] bundle_partial_failure bundleId=%s failedOrders=%s succeededOrders=%s",
        input.bundle.bundleId,
        failedOrderIds.join(","),
        paidOrders.map((o) => o.orderId).join(",")
      );
    }

    const paidBundle =
      (await markShopOrderBundlePaid({
        userId: input.userId,
        bundleId: input.bundle.bundleId,
        paymentKey: input.paymentKey,
        approvedAt: toss.approvedAt,
      }).catch(() => null)) ?? {
        ...input.bundle,
        status: "PAID" as const,
        paymentKey: input.paymentKey,
        approvedAt: toss.approvedAt ?? new Date().toISOString(),
      };

    // BUG-08: 번들 이메일 실패 시 콘솔에 기록 (사용자/운영자 가시성 확보)
    loadUserEmailById(input.userId)
      .then((email) =>
        sendOrderConfirmationEmail({
          orderId: paidBundle.bundleId,
          customerEmail: email,
          productName: toShopOrderBundleSummary(paidBundle).displayName,
          quantity: paidBundle.totalQuantity,
          amount: paidBundle.amount,
          recipientName: paidBundle.shipping.recipientName,
          addressLine1: paidBundle.shipping.addressLine1,
          addressLine2: paidBundle.shipping.addressLine2,
        })
      )
      .catch((emailError) => {
        console.error(
          "[BundleConfirm] 주문확인 이메일 발송 실패 bundleId=%s err=%s",
          paidBundle.bundleId,
          String(emailError?.message ?? emailError)
        );
      });

    return jsonNoStore({
      ok: true,
      data: {
        mode: "bundle",
        bundle: toShopOrderBundleSummary(paidBundle),
        orders: paidOrders.map((order) => toShopOrderSummary(order)),
        ...(failedOrderIds.length > 0 && { partialFailureOrderIds: failedOrderIds }),
      },
    });
  } catch (error: any) {
    await markShopOrderBundleFailed({
      userId: input.userId,
      bundleId: input.bundle.bundleId,
      code: "failed_to_finalize_shop_bundle",
      message: "장바구니 묶음 결제를 최종 반영하지 못했습니다.",
    }).catch(() => undefined);
    const message = String(error?.message ?? "");
    if (isShopStorageSetupError(message)) {
      return jsonNoStore({ ok: false, error: "shop_order_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_finalize_shop_order" }, { status: 500 });
  }
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

  const paymentKey = sanitize(body?.paymentKey, 220);
  const orderId = sanitize(body?.orderId, 80);
  const amount = toAmount(body?.amount);
  if (!paymentKey || !orderId || amount == null) return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  if (!isValidOrderId(orderId) || !isValidPaymentKey(paymentKey) || amount <= 0) {
    return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const bundle = await readShopOrderBundleForUser(userId, orderId).catch(() => null);
  if (bundle) {
    if (bundle.status === "PAID") {
      return jsonNoStore({
        ok: true,
        data: {
          mode: "bundle",
          bundle: toShopOrderBundleSummary(bundle),
        },
      });
    }
    if (bundle.status !== "READY") {
      return jsonNoStore({ ok: false, error: "shop_order_not_confirmable" }, { status: 400 });
    }
    if (amount !== bundle.amount) {
      return jsonNoStore({ ok: false, error: "amount_mismatch" }, { status: 400 });
    }
    return handleBundleOrderConfirm(req, { userId, bundle, paymentKey, amount });
  }

  const order = await readShopOrderForUser(userId, orderId).catch(() => null);
  if (!order) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
  if (order.status === "PAID") {
    return jsonNoStore({
      ok: true,
      data: {
        mode: "single",
        order: toShopOrderSummary(order),
      },
    });
  }
  if (order.status !== "READY") return jsonNoStore({ ok: false, error: "shop_order_not_confirmable" }, { status: 400 });
  if (amount !== order.amount) return jsonNoStore({ ok: false, error: "amount_mismatch" }, { status: 400 });

  return handleSingleOrderConfirm(req, { userId, order, paymentKey, amount });
}
