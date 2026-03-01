import { todayISO } from "@/lib/date";
import { normalizeShopShippingSnapshot, type ShopShippingSnapshot } from "@/lib/shopProfile";
import { buildCancelIdempotencyKey, buildConfirmIdempotencyKey, readTossAcceptLanguage, readTossSecretKeyFromEnv, readTossTestCodeFromEnv } from "@/lib/server/tossConfig";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { ShopProduct } from "@/lib/shop";
import type { Database, Json } from "@/types/supabase";

const SHOP_ORDER_PREFIX = "__shop_order__";
const SHOP_ORDER_LANGUAGE = "ko";

type ShopOrderRow = Database["public"]["Tables"]["shop_orders"]["Row"];

type StoredShopOrder = {
  type: "shop_order";
  version: 1;
  order: ShopOrderRecord;
};

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
  shipping: ShopShippingSnapshot;
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
  shipping: {
    recipientName: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string;
    deliveryNote: string;
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

function normalizeRefundStatus(value: unknown): ShopRefundState["status"] {
  return value === "requested" || value === "rejected" || value === "done" ? value : "none";
}

function normalizeRefund(value: unknown): ShopRefundState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    status: normalizeRefundStatus(raw.status),
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

function normalizeShippingSnapshot(value: unknown): ShopShippingSnapshot {
  return normalizeShopShippingSnapshot(value);
}

function normalizeProductSnapshot(value: unknown): ShopOrderRecord["productSnapshot"] | null {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!raw) return null;

  const priceKrw = toAmount(raw.priceKrw);
  const quantity = toAmount(raw.quantity);
  const category = cleanText(raw.category, 24) as ShopProduct["category"];

  if (priceKrw == null || quantity == null || quantity <= 0) return null;

  return {
    name: cleanText(raw.name, 80),
    subtitle: cleanText(raw.subtitle, 180),
    category,
    visualLabel: cleanText(raw.visualLabel, 40),
    visualClass: cleanText(raw.visualClass, 180),
    priceKrw,
    quantity,
  };
}

function normalizeLegacyOrder(data: unknown): ShopOrderRecord | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (payload.type !== "shop_order" || payload.version !== 1) return null;
  const raw = payload.order;
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const orderId = cleanText(source.orderId, 80);
  const userId = cleanText(source.userId, 120);
  const status = isOrderStatus(source.status) ? source.status : null;
  const productSnapshot = normalizeProductSnapshot(source.productSnapshot);
  const amount = toAmount(source.amount);
  if (!orderId || !userId || !status || !productSnapshot || amount == null) return null;

  return {
    orderId,
    userId,
    status,
    productId: cleanText(source.productId, 80),
    productSnapshot,
    amount,
    currency: "KRW",
    paymentKey: cleanText(source.paymentKey, 220) || null,
    tossResponse: source.tossResponse == null ? null : summarizeTossPaymentResponse(source.tossResponse),
    approvedAt: cleanText(source.approvedAt, 64) || null,
    failCode: cleanText(source.failCode, 120) || null,
    failMessage: cleanText(source.failMessage, 220) || null,
    shipping: normalizeShippingSnapshot(source.shipping),
    refund: normalizeRefund(source.refund),
    createdAt: cleanText(source.createdAt, 64),
    updatedAt: cleanText(source.updatedAt, 64),
  };
}

function buildPayload(order: ShopOrderRecord): StoredShopOrder {
  return {
    type: "shop_order",
    version: 1,
    order,
  };
}

function isMissingTableError(error: unknown, tableName: string) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    (message.includes("relation") && message.includes(tableName)) ||
    (message.includes("column") && message.includes("shipping_snapshot"))
  );
}

function toProductSnapshotJson(snapshot: ShopOrderRecord["productSnapshot"]): Json {
  return {
    name: snapshot.name,
    subtitle: snapshot.subtitle,
    category: snapshot.category,
    visualLabel: snapshot.visualLabel,
    visualClass: snapshot.visualClass,
    priceKrw: snapshot.priceKrw,
    quantity: snapshot.quantity,
  };
}

function toShopOrderRow(order: ShopOrderRecord): Database["public"]["Tables"]["shop_orders"]["Insert"] {
  return {
    order_id: order.orderId,
    user_id: order.userId,
    status: order.status,
    product_id: order.productId,
    product_snapshot: toProductSnapshotJson(order.productSnapshot),
    amount: order.amount,
    currency: order.currency,
    payment_key: order.paymentKey,
    payment_summary: order.tossResponse,
    approved_at: order.approvedAt,
    fail_code: order.failCode,
    fail_message: order.failMessage,
    shipping_snapshot: order.shipping as unknown as Json,
    refund_status: order.refund.status,
    refund_reason: order.refund.reason,
    refund_requested_at: order.refund.requestedAt,
    refund_reviewed_at: order.refund.reviewedAt,
    refund_reviewed_by: order.refund.reviewedBy,
    refund_note: order.refund.note,
    refund_cancel_amount: order.refund.cancelAmount,
    refund_canceled_at: order.refund.canceledAt,
    refund_summary: order.refund.cancelResponse,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

function fromShopOrderRow(row: ShopOrderRow | null): ShopOrderRecord | null {
  if (!row) return null;
  const status = isOrderStatus(row.status) ? row.status : null;
  const productSnapshot = normalizeProductSnapshot(row.product_snapshot);
  const amount = toAmount(row.amount);
  if (!status || !productSnapshot || amount == null) return null;

  return {
    orderId: cleanText(row.order_id, 80),
    userId: cleanText(row.user_id, 120),
    status,
    productId: cleanText(row.product_id, 80),
    productSnapshot,
    amount,
    currency: "KRW",
    paymentKey: cleanText(row.payment_key, 220) || null,
    tossResponse: row.payment_summary == null ? null : summarizeTossPaymentResponse(row.payment_summary),
    approvedAt: cleanText(row.approved_at, 64) || null,
    failCode: cleanText(row.fail_code, 120) || null,
    failMessage: cleanText(row.fail_message, 220) || null,
    shipping: normalizeShippingSnapshot(row.shipping_snapshot),
    refund: {
      status: normalizeRefundStatus(row.refund_status),
      reason: cleanText(row.refund_reason, 240) || null,
      requestedAt: cleanText(row.refund_requested_at, 64) || null,
      reviewedAt: cleanText(row.refund_reviewed_at, 64) || null,
      reviewedBy: cleanText(row.refund_reviewed_by, 120) || null,
      note: cleanText(row.refund_note, 500) || null,
      cancelAmount: toAmount(row.refund_cancel_amount),
      canceledAt: cleanText(row.refund_canceled_at, 64) || null,
      cancelResponse: row.refund_summary == null ? null : summarizeTossCancelResponse(row.refund_summary),
    },
    createdAt: cleanText(row.created_at, 64),
    updatedAt: cleanText(row.updated_at, 64),
  };
}

async function writeLegacyOrder(order: ShopOrderRecord) {
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
      data: buildPayload(nextOrder) as unknown as Json,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
  return nextOrder;
}

async function writeModernOrder(order: ShopOrderRecord) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const nextOrder = {
    ...order,
    updatedAt: now,
  };
  const { data, error } = await admin.from("shop_orders").upsert(toShopOrderRow(nextOrder), { onConflict: "order_id" }).select("*").single();
  if (error) throw error;
  return fromShopOrderRow(data) ?? nextOrder;
}

async function writeOrder(order: ShopOrderRecord) {
  try {
    return await writeModernOrder(order);
  } catch (error) {
    if (!isMissingTableError(error, "shop_orders")) throw error;
    return writeLegacyOrder(order);
  }
}

async function readLegacyOrderByKey(syntheticKey: string): Promise<ShopOrderRecord | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_content")
    .select("data, updated_at")
    .eq("user_id", syntheticKey)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return normalizeLegacyOrder((row?.data ?? null) as Json | null);
}

async function readLegacyOrder(orderId: string) {
  return readLegacyOrderByKey(orderRowKey(orderId));
}

async function readModernOrder(orderId: string): Promise<ShopOrderRecord | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("shop_orders").select("*").eq("order_id", orderId).maybeSingle();
  if (error) throw error;
  return fromShopOrderRow(data);
}

async function readOrderInternal(orderId: string) {
  try {
    const modern = await readModernOrder(orderId);
    if (modern) return modern;
  } catch (error) {
    if (!isMissingTableError(error, "shop_orders")) throw error;
  }
  return readLegacyOrder(orderId);
}

async function listLegacyShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
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
    .map((row) => normalizeLegacyOrder((row.data ?? null) as Json | null))
    .filter((row): row is ShopOrderRecord => Boolean(row));
}

async function listModernShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shop_orders")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(120, limit)));

  if (error) throw error;

  return (data ?? []).map((row) => fromShopOrderRow(row)).filter((row): row is ShopOrderRecord => Boolean(row));
}

async function listShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  let modernRows: ShopOrderRecord[] = [];
  try {
    modernRows = await listModernShopOrderRows(limit);
  } catch (error) {
    if (!isMissingTableError(error, "shop_orders")) throw error;
  }

  let legacyRows: ShopOrderRecord[] = [];
  try {
    legacyRows = await listLegacyShopOrderRows(limit);
  } catch {
    legacyRows = [];
  }

  const merged = new Map<string, ShopOrderRecord>();
  for (const row of modernRows) merged.set(row.orderId, row);
  for (const row of legacyRows) {
    if (!merged.has(row.orderId)) merged.set(row.orderId, row);
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, Math.max(1, Math.min(120, limit)));
}

async function writeOrderEventSafe(input: {
  order: ShopOrderRecord;
  eventType: string;
  actorRole: "system" | "user" | "admin";
  actorUserId?: string | null;
  message?: string | null;
  metadata?: Json | null;
}) {
  const admin = getSupabaseAdmin();
  const payload: Database["public"]["Tables"]["shop_order_events"]["Insert"] = {
    order_id: input.order.orderId,
    user_id: input.order.userId,
    actor_user_id: cleanText(input.actorUserId, 120) || null,
    actor_role: input.actorRole,
    event_type: cleanText(input.eventType, 64) || "updated",
    status: input.order.status,
    message: cleanText(input.message, 500) || null,
    metadata: input.metadata ?? null,
  };

  try {
    const { error } = await admin.from("shop_order_events").insert(payload);
    if (error && !isMissingTableError(error, "shop_order_events")) {
      throw error;
    }
  } catch (error) {
    if (!isMissingTableError(error, "shop_order_events")) {
      return;
    }
  }
}

export async function createShopOrder(input: {
  orderId: string;
  userId: string;
  product: ShopProduct;
  quantity: number;
  shipping: ShopShippingSnapshot;
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
    shipping: normalizeShippingSnapshot(input.shipping),
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

  const saved = await writeOrder(order);
  await writeOrderEventSafe({
    order: saved,
    eventType: "order_created",
    actorRole: "user",
    actorUserId: input.userId,
    message: "쇼핑 주문이 생성되었습니다.",
    metadata: { productId: input.product.id, quantity },
  });
  return saved;
}

export async function readShopOrder(orderId: string) {
  return readOrderInternal(orderId);
}

export async function readShopOrderForUser(userId: string, orderId: string) {
  const order = await readShopOrder(orderId);
  if (!order || order.userId !== userId) return null;
  return order;
}

export async function listShopOrdersForUser(userId: string, limit = 20) {
  let rows: ShopOrderRecord[] = [];
  try {
    rows = await listShopOrderRows(Math.max(limit * 4, 40));
  } catch {
    rows = [];
  }
  return rows.filter((row) => row.userId === userId).slice(0, Math.max(1, Math.min(50, limit)));
}

export async function listShopOrdersForAdmin(limit = 40) {
  try {
    return await listShopOrderRows(limit);
  } catch {
    return [];
  }
}

export async function countRecentReadyShopOrdersByUser(userId: string) {
  const now = Date.now();
  let rows: ShopOrderRecord[] = [];
  try {
    rows = await listShopOrderRows(80);
  } catch {
    rows = [];
  }
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
  const saved = await writeOrder({
    ...current,
    status: "FAILED",
    failCode: cleanText(input.code, 120),
    failMessage: cleanText(input.message, 220),
  });
  await writeOrderEventSafe({
    order: saved,
    eventType: "order_failed",
    actorRole: "system",
    message: saved.failMessage,
    metadata: { code: saved.failCode },
  });
  return saved;
}

export async function markShopOrderPaid(input: {
  orderId: string;
  paymentKey: string;
  approvedAt?: string | null;
  tossResponse: Json;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  const saved = await writeOrder({
    ...current,
    status: "PAID",
    paymentKey: cleanText(input.paymentKey, 220),
    approvedAt: cleanText(input.approvedAt, 64) || new Date().toISOString(),
    tossResponse: summarizeTossPaymentResponse(input.tossResponse),
    failCode: null,
    failMessage: null,
  });
  await writeOrderEventSafe({
    order: saved,
    eventType: "order_paid",
    actorRole: "system",
    message: "토스 결제가 승인되었습니다.",
    metadata: saved.tossResponse,
  });
  return saved;
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

  const saved = await writeOrder({
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
  await writeOrderEventSafe({
    order: saved,
    eventType: "refund_requested",
    actorRole: "user",
    actorUserId: input.userId,
    message: saved.refund.reason,
  });
  return saved;
}

export async function rejectShopOrderRefund(input: {
  orderId: string;
  adminUserId: string;
  note?: string | null;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.refund.status !== "requested") throw new Error("shop_refund_not_requested");
  const saved = await writeOrder({
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
  await writeOrderEventSafe({
    order: saved,
    eventType: "refund_rejected",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    message: saved.refund.note,
  });
  return saved;
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

  const saved = await writeOrder({
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
  await writeOrderEventSafe({
    order: saved,
    eventType: "refund_approved",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    message: cancelReason,
    metadata: saved.refund.cancelResponse,
  });
  return saved;
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
    shipping: {
      recipientName: order.shipping.recipientName,
      phone: order.shipping.phone,
      postalCode: order.shipping.postalCode,
      addressLine1: order.shipping.addressLine1,
      addressLine2: order.shipping.addressLine2,
      deliveryNote: order.shipping.deliveryNote,
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
