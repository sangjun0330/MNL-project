import { todayISO } from "@/lib/date";
import { buildCancelIdempotencyKey, buildConfirmIdempotencyKey, readTossAcceptLanguage, readTossSecretKeyFromEnv, readTossTestCodeFromEnv } from "@/lib/server/tossConfig";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { ShopProduct } from "@/lib/shop";
import type { Json } from "@/types/supabase";

const SHOP_ORDER_PREFIX = "__shop_order__";
const SHOP_ORDER_LANGUAGE = "ko";

export type ShopOrderStatus =
  | "READY"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "REFUND_REQUESTED"
  | "REFUND_REJECTED"
  | "REFUNDED";

export type ShopRefundState = {
  status: "none" | "requested" | "rejected" | "done";
  reason: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
  cancelAmount: number | null;
  canceledAt: string | null;
  cancelResponse: Json | null;
};

export type ShopOrderRecord = {
  orderId: string;
  userId: string;
  status: ShopOrderStatus;
  productId: string;
  productSnapshot: {
    name: string;
    subtitle: string;
    category: ShopProduct["category"];
    visualLabel: string;
    visualClass: string;
    priceKrw: number;
    quantity: number;
  };
  amount: number;
  currency: "KRW";
  paymentKey: string | null;
  tossResponse: Json | null;
  approvedAt: string | null;
  failCode: string | null;
  failMessage: string | null;
  refund: ShopRefundState;
  createdAt: string;
  updatedAt: string;
};

export type ShopOrderSummary = {
  orderId: string;
  status: ShopOrderStatus;
  amount: number;
  createdAt: string;
  approvedAt: string | null;
  failMessage: string | null;
  productSnapshot: {
    name: string;
    quantity: number;
  };
  refund: {
    status: ShopRefundState["status"];
    reason: string | null;
    note: string | null;
  };
};

export type ShopAdminOrderSummary = ShopOrderSummary & {
  userLabel: string;
};

type StoredShopOrder = {
  type: "shop_order";
  version: 1;
  order: ShopOrderRecord;
};

function orderRowKey(orderId: string) {
  return `${SHOP_ORDER_PREFIX}${orderId}`.slice(0, 220);
}

function cleanText(value: unknown, max = 220) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitizeReason(value: unknown) {
  const text = cleanText(value, 240);
  return text || "단순 환불 요청";
}

function maskUserId(userId: string) {
  const text = cleanText(userId, 120);
  if (!text) return "unknown";
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function summarizeTossPaymentResponse(raw: any): Json {
  const status = cleanText(raw?.status, 40);
  const orderId = cleanText(raw?.orderId, 80);
  const approvedAt = cleanText(raw?.approvedAt, 64);
  const method = cleanText(raw?.method, 40);
  const totalAmount = toAmount(raw?.totalAmount ?? raw?.balanceAmount);
  return {
    status: status || null,
    orderId: orderId || null,
    approvedAt: approvedAt || null,
    method: method || null,
    totalAmount,
  };
}

function summarizeTossCancelResponse(raw: any): Json {
  const status = cleanText(raw?.status, 40);
  const totalAmount = toAmount(raw?.totalAmount ?? raw?.balanceAmount);
  const cancelTransactionKey = cleanText(raw?.cancels?.[0]?.transactionKey ?? raw?.lastTransactionKey, 120);
  const canceledAt = cleanText(raw?.cancels?.[0]?.canceledAt, 64);
  return {
    status: status || null,
    totalAmount,
    cancelTransactionKey: cancelTransactionKey || null,
    canceledAt: canceledAt || null,
  };
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function isOrderStatus(value: unknown): value is ShopOrderStatus {
  return value === "READY" || value === "PAID" || value === "FAILED" || value === "CANCELED" || value === "REFUND_REQUESTED" || value === "REFUND_REJECTED" || value === "REFUNDED";
}

function normalizeRefund(value: unknown): ShopRefundState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = raw.status === "requested" || raw.status === "rejected" || raw.status === "done" ? raw.status : "none";
  return {
    status,
    reason: cleanText(raw.reason, 240) || null,
    requestedAt: cleanText(raw.requestedAt, 64) || null,
    reviewedAt: cleanText(raw.reviewedAt, 64) || null,
    reviewedBy: cleanText(raw.reviewedBy, 120) || null,
    note: cleanText(raw.note, 500) || null,
    cancelAmount: toAmount(raw.cancelAmount),
    canceledAt: cleanText(raw.canceledAt, 64) || null,
    cancelResponse: raw.cancelResponse == null ? null : summarizeTossCancelResponse(raw.cancelResponse),
  };
}

function normalizeOrder(data: unknown): ShopOrderRecord | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (payload.type !== "shop_order" || payload.version !== 1) return null;
  const raw = payload.order;
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const orderId = cleanText(source.orderId, 80);
  const userId = cleanText(source.userId, 120);
  const status = isOrderStatus(source.status) ? source.status : null;
  const product = source.productSnapshot && typeof source.productSnapshot === "object" ? (source.productSnapshot as Record<string, unknown>) : null;
  const amount = toAmount(source.amount);
  const priceKrw = toAmount(product?.priceKrw);
  const quantity = toAmount(product?.quantity);
  if (!orderId || !userId || !status || !product || amount == null || priceKrw == null || quantity == null || quantity <= 0) return null;

  const category = cleanText(product.category, 24) as ShopProduct["category"];

  return {
    orderId,
    userId,
    status,
    productId: cleanText(source.productId, 80),
    productSnapshot: {
      name: cleanText(product.name, 80),
      subtitle: cleanText(product.subtitle, 180),
      category,
      visualLabel: cleanText(product.visualLabel, 40),
      visualClass: cleanText(product.visualClass, 180),
      priceKrw,
      quantity,
    },
    amount,
    currency: "KRW",
    paymentKey: cleanText(source.paymentKey, 220) || null,
    tossResponse: source.tossResponse == null ? null : summarizeTossPaymentResponse(source.tossResponse),
    approvedAt: cleanText(source.approvedAt, 64) || null,
    failCode: cleanText(source.failCode, 120) || null,
    failMessage: cleanText(source.failMessage, 220) || null,
    refund: normalizeRefund(source.refund),
    createdAt: cleanText(source.createdAt, 64),
    updatedAt: cleanText(source.updatedAt, 64),
  };
}

function toPayload(order: ShopOrderRecord): StoredShopOrder {
  return {
    type: "shop_order",
    version: 1,
    order,
  };
}

async function writeOrder(order: ShopOrderRecord) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const nextOrder = {
    ...order,
    updatedAt: now,
  };
  const { error } = await admin.from("ai_content").upsert(
    {
      user_id: orderRowKey(order.orderId),
      date_iso: todayISO(),
      language: SHOP_ORDER_LANGUAGE,
      data: toPayload(nextOrder) as unknown as Json,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
  return nextOrder;
}

async function readOrderBySyntheticKey(syntheticKey: string): Promise<ShopOrderRecord | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("ai_content").select("data").eq("user_id", syntheticKey).maybeSingle();
  if (error) throw error;
  return normalizeOrder((data?.data ?? null) as Json | null);
}

export async function createShopOrder(input: {
  orderId: string;
  userId: string;
  product: ShopProduct;
  quantity: number;
}) {
  const now = new Date().toISOString();
  const quantity = Math.max(1, Math.min(9, Math.round(Number(input.quantity) || 1)));
  const priceKrw = Math.max(0, Math.round(Number(input.product.priceKrw) || 0));
  const order: ShopOrderRecord = {
    orderId: input.orderId,
    userId: input.userId,
    status: "READY",
    productId: input.product.id,
    productSnapshot: {
      name: input.product.name,
      subtitle: input.product.subtitle,
      category: input.product.category,
      visualLabel: input.product.visualLabel,
      visualClass: input.product.visualClass,
      priceKrw,
      quantity,
    },
    amount: priceKrw * quantity,
    currency: "KRW",
    paymentKey: null,
    tossResponse: null,
    approvedAt: null,
    failCode: null,
    failMessage: null,
    refund: {
      status: "none",
      reason: null,
      requestedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      note: null,
      cancelAmount: null,
      canceledAt: null,
      cancelResponse: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  return writeOrder(order);
}

export async function readShopOrder(orderId: string) {
  return readOrderBySyntheticKey(orderRowKey(orderId));
}

export async function readShopOrderForUser(userId: string, orderId: string) {
  const order = await readShopOrder(orderId);
  if (!order || order.userId !== userId) return null;
  return order;
}

async function listShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_content")
    .select("data, updated_at")
    .gte("user_id", SHOP_ORDER_PREFIX)
    .lt("user_id", `${SHOP_ORDER_PREFIX}~`)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(120, limit)));

  if (error) throw error;

  return (data ?? [])
    .map((row) => normalizeOrder((row.data ?? null) as Json | null))
    .filter((row): row is ShopOrderRecord => Boolean(row));
}

export async function listShopOrdersForUser(userId: string, limit = 20) {
  const rows = await listShopOrderRows(Math.max(limit * 4, 40));
  return rows.filter((row) => row.userId === userId).slice(0, Math.max(1, Math.min(50, limit)));
}

export async function listShopOrdersForAdmin(limit = 40) {
  return listShopOrderRows(limit);
}

export async function countRecentReadyShopOrdersByUser(userId: string) {
  const now = Date.now();
  const rows = await listShopOrderRows(80);
  return rows.filter((row) => {
    if (row.userId !== userId || row.status !== "READY") return false;
    const createdAt = new Date(row.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return false;
    return now - createdAt <= 60 * 60 * 1000;
  }).length;
}

export async function markShopOrderFailed(input: {
  orderId: string;
  code: string;
  message: string;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  return writeOrder({
    ...current,
    status: "FAILED",
    failCode: cleanText(input.code, 120),
    failMessage: cleanText(input.message, 220),
  });
}

export async function markShopOrderPaid(input: {
  orderId: string;
  paymentKey: string;
  approvedAt?: string | null;
  tossResponse: Json;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  return writeOrder({
    ...current,
    status: "PAID",
    paymentKey: cleanText(input.paymentKey, 220),
    approvedAt: cleanText(input.approvedAt, 64) || new Date().toISOString(),
    tossResponse: summarizeTossPaymentResponse(input.tossResponse),
    failCode: null,
    failMessage: null,
  });
}

export async function requestShopOrderRefund(input: {
  userId: string;
  orderId: string;
  reason: string;
}) {
  const current = await readShopOrderForUser(input.userId, input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.status !== "PAID") throw new Error("shop_order_not_refundable");
  if (current.refund.status === "requested" || current.refund.status === "done") return current;

  return writeOrder({
    ...current,
    status: "REFUND_REQUESTED",
    refund: {
      ...current.refund,
      status: "requested",
      reason: sanitizeReason(input.reason),
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      note: null,
      cancelAmount: null,
      canceledAt: null,
      cancelResponse: null,
    },
  });
}

export async function rejectShopOrderRefund(input: {
  orderId: string;
  adminUserId: string;
  note?: string | null;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.refund.status !== "requested") throw new Error("shop_refund_not_requested");
  return writeOrder({
    ...current,
    status: "REFUND_REJECTED",
    refund: {
      ...current.refund,
      status: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: cleanText(input.adminUserId, 120),
      note: cleanText(input.note, 500) || "환불 요청이 반려되었습니다.",
    },
  });
}

export async function approveShopOrderRefund(input: {
  orderId: string;
  adminUserId: string;
  note?: string | null;
  requestAcceptLanguage?: string | null;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.refund.status !== "requested") throw new Error("shop_refund_not_requested");
  if (!current.paymentKey) throw new Error("shop_order_missing_payment_key");

  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) throw new Error(secret.error);

  const auth = btoa(`${secret.secretKey}:`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    "Idempotency-Key": buildCancelIdempotencyKey(current.orderId),
  };
  const acceptLanguage = readTossAcceptLanguage(input.requestAcceptLanguage ?? null);
  if (acceptLanguage) headers["Accept-Language"] = acceptLanguage;
  const testCode = readTossTestCodeFromEnv(secret.mode);
  if (testCode) headers["TossPayments-Test-Code"] = testCode;

  const cancelReason = cleanText(input.note, 200) || current.refund.reason || "사용자 환불 요청";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 10_000);

  let res: Response;
  try {
    res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(current.paymentKey)}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cancelReason,
        cancelAmount: current.amount,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(cleanText(json?.code, 120) || `toss_cancel_http_${res.status}`);
  }

  return writeOrder({
    ...current,
    status: "REFUNDED",
    refund: {
      ...current.refund,
      status: "done",
      reviewedAt: new Date().toISOString(),
      reviewedBy: cleanText(input.adminUserId, 120),
      note: cancelReason,
      cancelAmount: current.amount,
      canceledAt: new Date().toISOString(),
      cancelResponse: summarizeTossCancelResponse(json),
    },
  });
}

export function buildShopOrderId(productId: string) {
  const stamp = Date.now().toString(36);
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const rand = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const safeProduct = cleanText(productId, 24).replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "item";
  return `shop_${safeProduct}_${stamp}_${rand}`.slice(0, 64);
}

export function buildShopOrderConfirmIdempotencyKey(orderId: string) {
  return buildConfirmIdempotencyKey(orderId);
}

export function toShopOrderSummary(order: ShopOrderRecord): ShopOrderSummary {
  return {
    orderId: order.orderId,
    status: order.status,
    amount: order.amount,
    createdAt: order.createdAt,
    approvedAt: order.approvedAt,
    failMessage: order.failMessage,
    productSnapshot: {
      name: order.productSnapshot.name,
      quantity: order.productSnapshot.quantity,
    },
    refund: {
      status: order.refund.status,
      reason: order.refund.reason,
      note: order.refund.note,
    },
  };
}

export function toShopAdminOrderSummary(order: ShopOrderRecord): ShopAdminOrderSummary {
  return {
    ...toShopOrderSummary(order),
    userLabel: maskUserId(order.userId),
  };
}
