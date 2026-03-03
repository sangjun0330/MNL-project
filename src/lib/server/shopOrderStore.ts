import { todayISO } from "@/lib/date";
import { toMaskedShopShippingSnapshot } from "@/lib/shopPrivacy";
import { normalizeShopShippingSnapshot, type ShopShippingSnapshot, type ShopSmartTrackerMeta } from "@/lib/shopProfile";
import { findShopOrderBundleByOrderId, markShopOrderBundleCanceled } from "@/lib/server/shopOrderBundleStore";
import { buildSweetTrackerTrackingUrl, fetchSweetTrackerTracking, shouldPollSweetTracker } from "@/lib/server/sweetTracker";
import { buildCancelIdempotencyKey, buildConfirmIdempotencyKey, readTossAcceptLanguage, readTossSecretKeyFromEnv, readTossTestCodeFromEnv } from "@/lib/server/tossConfig";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import { calculateShopPricing, type ShopProduct } from "@/lib/shop";
import type { Database, Json } from "@/types/supabase";

const SHOP_ORDER_PREFIX = "__shop_order__";
const SHOP_ORDER_LANGUAGE = "ko";
const SHOP_ORDER_STATE_KEY = "shopOrders";
const MAX_LIST_SCAN = 240;

type ShopOrderRow = Database["public"]["Tables"]["shop_orders"]["Row"];

type StoredShopOrder = {
  type: "shop_order";
  version: 1;
  order: ShopOrderRecord;
};

export type ShopOrderStatus =
  | "READY"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
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
  trackingNumber: string | null;
  courier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShopOrderSummary = {
  orderId: string;
  status: ShopOrderStatus;
  amount: number;
  subtotalKrw: number;
  shippingFeeKrw: number;
  createdAt: string;
  approvedAt: string | null;
  paymentMethod: string | null;
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
  trackingNumber: string | null;
  courier: string | null;
  tracking: {
    carrierCode: string | null;
    trackingUrl: string | null;
    statusLabel: string | null;
    lastEventAt: string | null;
    lastPolledAt: string | null;
  } | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  purchaseConfirmedAt: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readPaymentMethod(summary: Json | null): string | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  return cleanText((summary as Record<string, unknown>).method, 40) || null;
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function isOrderStatus(value: unknown): value is ShopOrderStatus {
  return (
    value === "READY" ||
    value === "PAID" ||
    value === "SHIPPED" ||
    value === "DELIVERED" ||
    value === "FAILED" ||
    value === "CANCELED" ||
    value === "REFUND_REQUESTED" ||
    value === "REFUND_REJECTED" ||
    value === "REFUNDED"
  );
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

function normalizeSmartTrackerMeta(value: unknown): ShopSmartTrackerMeta | null {
  const snapshot = normalizeShopShippingSnapshot({ smartTracker: value });
  return snapshot.smartTracker;
}

function buildTrackingSummary(meta: ShopSmartTrackerMeta | null) {
  if (!meta) return null;
  return {
    carrierCode: meta.carrierCode,
    trackingUrl: meta.trackingUrl,
    statusLabel: meta.lastStatusLabel,
    lastEventAt: meta.lastEventAt,
    lastPolledAt: meta.lastPolledAt,
  };
}

function mergeSmartTrackerMeta(
  current: ShopSmartTrackerMeta | null,
  next: Partial<ShopSmartTrackerMeta>
): ShopSmartTrackerMeta {
  return normalizeSmartTrackerMeta({
    ...(current ?? {}),
    ...next,
  }) ?? {
    carrierCode: cleanText(next.carrierCode, 40) || null,
    trackingUrl: cleanText(next.trackingUrl, 400) || null,
    lastStatus: cleanText(next.lastStatus, 40) || null,
    lastStatusLabel: cleanText(next.lastStatusLabel, 80) || null,
    lastEventAt: cleanText(next.lastEventAt, 64) || null,
    lastPolledAt: cleanText(next.lastPolledAt, 64) || null,
    deliveredAt: cleanText(next.deliveredAt, 64) || null,
  };
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
    trackingNumber: cleanText(source.trackingNumber, 120) || null,
    courier: cleanText(source.courier, 60) || null,
    shippedAt: cleanText(source.shippedAt, 64) || null,
    deliveredAt: cleanText(source.deliveredAt, 64) || null,
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
    code === "PGRST204" ||
    (message.includes("relation") && message.includes(tableName)) ||
    (
      message.includes("column") &&
      (
        message.includes("shipping_snapshot") ||
        message.includes("tracking_number") ||
        message.includes("courier") ||
        message.includes("shipped_at") ||
        message.includes("delivered_at") ||
        message.includes(tableName)
      )
    ) ||
    message.includes("schema cache")
  );
}

function isStorageUnavailableError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return message.includes("supabase admin env missing");
}

function isForeignKeyError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return code === "23503" || message.includes("foreign key");
}

function toTimestamp(value: string | null | undefined) {
  const time = new Date(String(value ?? "")).getTime();
  if (!Number.isFinite(time)) return 0;
  return time;
}

function preferLatestOrder(a: ShopOrderRecord | null, b: ShopOrderRecord | null): ShopOrderRecord | null {
  if (!a) return b;
  if (!b) return a;
  return toTimestamp(b.updatedAt) >= toTimestamp(a.updatedAt) ? b : a;
}

function normalizeStoredOrderMap(value: unknown): Record<string, ShopOrderRecord> {
  if (!isRecord(value)) return {};

  const next: Record<string, ShopOrderRecord> = {};
  for (const [orderId, raw] of Object.entries(value).slice(0, MAX_LIST_SCAN)) {
    const safeOrderId = cleanText(orderId, 80);
    const order = normalizeLegacyOrder(raw);
    if (!safeOrderId || !order) continue;
    next[safeOrderId] = order;
  }
  return next;
}

function serializeStoredOrderMap(map: Record<string, ShopOrderRecord>): Json {
  const payload: Record<string, Json> = {};
  for (const [orderId, order] of Object.entries(map)) {
    const safeOrderId = cleanText(orderId, 80);
    if (!safeOrderId) continue;
    payload[safeOrderId] = buildPayload(order) as unknown as Json;
  }
  return payload as Json;
}

function extractStateStoredOrders(payload: unknown): ShopOrderRecord[] {
  if (!isRecord(payload)) return [];
  return Object.values(normalizeStoredOrderMap(payload[SHOP_ORDER_STATE_KEY]));
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
  const row: Database["public"]["Tables"]["shop_orders"]["Insert"] = {
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

  if (order.trackingNumber) row.tracking_number = order.trackingNumber;
  if (order.courier) row.courier = order.courier;
  if (order.shippedAt) row.shipped_at = order.shippedAt;
  if (order.deliveredAt) row.delivered_at = order.deliveredAt;

  return row;
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
    trackingNumber: cleanText(row.tracking_number, 120) || null,
    courier: cleanText(row.courier, 60) || null,
    shippedAt: cleanText(row.shipped_at, 64) || null,
    deliveredAt: cleanText(row.delivered_at, 64) || null,
    createdAt: cleanText(row.created_at, 64),
    updatedAt: cleanText(row.updated_at, 64),
  };
}

async function writeLegacyOrderBySyntheticKey(order: ShopOrderRecord) {
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

async function writeLegacyOrderByUserState(order: ShopOrderRecord) {
  const now = new Date().toISOString();
  const nextOrder = {
    ...order,
    updatedAt: now,
  };

  const existingRow = await loadUserState(order.userId);
  const currentPayload = isRecord(existingRow?.payload) ? existingRow.payload : {};
  const currentMap = normalizeStoredOrderMap(currentPayload[SHOP_ORDER_STATE_KEY]);

  await saveUserState({
    userId: order.userId,
    payload: {
      ...currentPayload,
      [SHOP_ORDER_STATE_KEY]: serializeStoredOrderMap({
        ...currentMap,
        [nextOrder.orderId]: nextOrder,
      }),
    },
  });

  return nextOrder;
}

async function writeLegacyOrder(order: ShopOrderRecord) {
  try {
    return await writeLegacyOrderByUserState(order);
  } catch (stateError) {
    try {
      return await writeLegacyOrderBySyntheticKey(order);
    } catch (legacyError) {
      if (isStorageUnavailableError(stateError) || isStorageUnavailableError(legacyError)) {
        throw new Error("shop_order_storage_unavailable");
      }
      if (
        isMissingTableError(stateError, "rnest_user_state") ||
        isMissingTableError(stateError, "rnest_users") ||
        isMissingTableError(legacyError, "ai_content") ||
        isForeignKeyError(legacyError)
      ) {
        throw new Error("shop_order_storage_unavailable");
      }
      throw stateError;
    }
  }
}

async function writeModernOrder(order: ShopOrderRecord) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const nextOrder = {
    ...order,
    updatedAt: now,
  };
  const { error } = await admin.from("shop_orders").upsert(toShopOrderRow(nextOrder), { onConflict: "order_id" });
  if (error) throw error;
  return nextOrder;
}

async function writeOrder(order: ShopOrderRecord) {
  try {
    return await writeModernOrder(order);
  } catch (error) {
    try {
      return await writeLegacyOrder(order);
    } catch (legacyError) {
      if (isStorageUnavailableError(error) || isStorageUnavailableError(legacyError)) {
        throw new Error("shop_order_storage_unavailable");
      }
      if (isMissingTableError(error, "shop_orders")) {
        throw legacyError;
      }
      if (isStorageUnavailableError(legacyError)) {
        throw new Error("shop_order_storage_unavailable");
      }
      throw error;
    }
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
  try {
    const direct = await readLegacyOrderByKey(orderRowKey(orderId));
    if (direct) return direct;
  } catch {
    // continue to newer fallback stores
  }

  const safeOrderId = cleanText(orderId, 80);
  if (!safeOrderId) return null;

  const rows = await listLegacyShopOrderRows(MAX_LIST_SCAN);
  return rows.find((row) => row.orderId === safeOrderId) ?? null;
}

async function readModernOrder(orderId: string): Promise<ShopOrderRecord | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("shop_orders").select("*").eq("order_id", orderId).maybeSingle();
  if (error) throw error;
  return fromShopOrderRow(data);
}

async function readOrderInternal(orderId: string) {
  let modern: ShopOrderRecord | null = null;
  try {
    modern = await readModernOrder(orderId);
  } catch {
    modern = null;
  }

  let legacy: ShopOrderRecord | null = null;
  try {
    legacy = await readLegacyOrder(orderId);
  } catch {
    legacy = null;
  }

  return preferLatestOrder(modern, legacy);
}

async function listLegacyAiContentShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_content")
    .select("data, updated_at")
    .gte("user_id", SHOP_ORDER_PREFIX)
    .lt("user_id", `${SHOP_ORDER_PREFIX}~`)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(MAX_LIST_SCAN, limit)));

  if (error) throw error;

  return (data ?? [])
    .map((row) => normalizeLegacyOrder((row.data ?? null) as Json | null))
    .filter((row): row is ShopOrderRecord => Boolean(row));
}

async function listLegacyUserStateShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("rnest_user_state")
    .select("user_id, payload, updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(MAX_LIST_SCAN, limit)));

  if (error) throw error;

  return (data ?? []).flatMap((row) => extractStateStoredOrders(row.payload));
}

async function listLegacyShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  let stateRows: ShopOrderRecord[] = [];
  try {
    stateRows = await listLegacyUserStateShopOrderRows(limit);
  } catch {
    stateRows = [];
  }

  let aiContentRows: ShopOrderRecord[] = [];
  try {
    aiContentRows = await listLegacyAiContentShopOrderRows(limit);
  } catch {
    aiContentRows = [];
  }

  const merged = new Map<string, ShopOrderRecord>();
  for (const row of stateRows) merged.set(row.orderId, row);
  for (const row of aiContentRows) {
    const current = merged.get(row.orderId) ?? null;
    merged.set(row.orderId, preferLatestOrder(current, row) ?? row);
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, Math.max(1, Math.min(MAX_LIST_SCAN, limit)));
}

async function listModernShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shop_orders")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(MAX_LIST_SCAN, limit)));

  if (error) throw error;

  return (data ?? []).map((row) => fromShopOrderRow(row)).filter((row): row is ShopOrderRecord => Boolean(row));
}

async function listShopOrderRows(limit: number): Promise<ShopOrderRecord[]> {
  let modernRows: ShopOrderRecord[] = [];
  try {
    modernRows = await listModernShopOrderRows(limit);
  } catch {
    modernRows = [];
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
    const current = merged.get(row.orderId) ?? null;
    merged.set(row.orderId, preferLatestOrder(current, row) ?? row);
  }

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, Math.max(1, Math.min(MAX_LIST_SCAN, limit)));
}

function isTrackableShippedOrder(order: ShopOrderRecord) {
  return (
    order.status === "SHIPPED" &&
    Boolean(order.trackingNumber) &&
    Boolean(order.shipping.smartTracker?.carrierCode)
  );
}

async function saveOrderWithSmartTrackerMeta(
  order: ShopOrderRecord,
  metaPatch: Partial<ShopSmartTrackerMeta>
): Promise<ShopOrderRecord> {
  const nextShipping = normalizeShopShippingSnapshot({
    ...order.shipping,
    smartTracker: mergeSmartTrackerMeta(order.shipping.smartTracker, metaPatch),
  });
  return writeOrder({
    ...order,
    shipping: nextShipping,
  });
}

async function syncSingleOrderTrackingIfNeeded(
  order: ShopOrderRecord,
  input?: { force?: boolean; actorUserId?: string | null }
): Promise<ShopOrderRecord> {
  if (!isTrackableShippedOrder(order)) return order;
  if (!shouldPollSweetTracker(order.shipping.smartTracker, Boolean(input?.force))) return order;

  const meta = order.shipping.smartTracker;
  const result = await fetchSweetTrackerTracking({
    carrierCode: meta?.carrierCode ?? null,
    trackingNumber: order.trackingNumber,
  });

  const now = new Date().toISOString();
  if (!result.ok) {
    if (result.reason === "missing_config" || result.reason === "invalid_input") {
      return order;
    }
    if (result.reason === "fetch_failed") {
      return await saveOrderWithSmartTrackerMeta(order, {
        trackingUrl: result.trackingUrl ?? meta?.trackingUrl ?? null,
        lastPolledAt: now,
      }).catch(() => order);
    }
    return await saveOrderWithSmartTrackerMeta(order, {
      trackingUrl: result.trackingUrl ?? meta?.trackingUrl ?? null,
      lastStatus: "not_found",
      lastStatusLabel: "조회 불가",
      lastPolledAt: now,
    }).catch(() => order);
  }

  const nextMeta = mergeSmartTrackerMeta(meta, {
    trackingUrl: result.trackingUrl,
    lastStatus: result.rawStatus,
    lastStatusLabel: result.statusLabel,
    lastEventAt: result.lastEventAt,
    lastPolledAt: now,
    deliveredAt: result.deliveredAt,
  });

  if (result.delivered) {
    const deliveredAt = result.deliveredAt || order.deliveredAt || now;
    const saved = await writeOrder({
      ...order,
      status: "DELIVERED",
      deliveredAt,
      shipping: normalizeShopShippingSnapshot({
        ...order.shipping,
        smartTracker: {
          ...nextMeta,
          deliveredAt,
        },
      }),
    });
    await writeOrderEventSafe({
      order: saved,
      eventType: "order_delivered",
      actorRole: input?.actorUserId ? "admin" : "system",
      actorUserId: input?.actorUserId ?? null,
      message: "스마트택배 배송 조회 결과 배송 완료로 자동 반영되었습니다.",
      metadata: {
        source: "sweettracker",
        statusLabel: result.statusLabel,
        trackingUrl: result.trackingUrl,
      },
    });
    return saved;
  }

  const hasMetaChanged =
    nextMeta.trackingUrl !== meta?.trackingUrl ||
    nextMeta.lastStatus !== meta?.lastStatus ||
    nextMeta.lastStatusLabel !== meta?.lastStatusLabel ||
    nextMeta.lastEventAt !== meta?.lastEventAt ||
    nextMeta.lastPolledAt !== meta?.lastPolledAt;

  if (!hasMetaChanged) return order;
  return saveOrderWithSmartTrackerMeta(order, nextMeta).catch(() => order);
}

async function syncOrdersForRead(
  orders: ShopOrderRecord[],
  input?: { maxOrders?: number; force?: boolean; actorUserId?: string | null }
): Promise<ShopOrderRecord[]> {
  const maxOrders = Math.max(1, Math.min(5, Math.round(Number(input?.maxOrders) || 3)));
  let syncedCount = 0;
  const nextOrders: ShopOrderRecord[] = [];

  for (const order of orders) {
    if (isTrackableShippedOrder(order) && (syncedCount < maxOrders || input?.force)) {
      const synced = await syncSingleOrderTrackingIfNeeded(order, input).catch(() => order);
      nextOrders.push(synced);
      syncedCount += 1;
    } else {
      nextOrders.push(order);
    }
  }

  return nextOrders;
}

async function writeOrderEventSafe(input: {
  order: ShopOrderRecord;
  eventType: string;
  actorRole: "system" | "user" | "admin";
  actorUserId?: string | null;
  message?: string | null;
  metadata?: Json | null;
}) {
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
    const admin = getSupabaseAdmin();
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
  amountOverrideKrw?: number | null;
}) {
  const now = new Date().toISOString();
  const quantity = Math.max(1, Math.min(9, Math.round(Number(input.quantity) || 1)));
  const priceKrw = Math.max(0, Math.round(Number(input.product.priceKrw) || 0));
  const pricing = calculateShopPricing({ priceKrw, quantity });
  const amountOverrideKrw = toAmount(input.amountOverrideKrw);
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
    amount: amountOverrideKrw != null && amountOverrideKrw >= pricing.subtotalKrw ? amountOverrideKrw : pricing.totalKrw,
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
    trackingNumber: null,
    courier: null,
    shippedAt: null,
    deliveredAt: null,
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

function normalizeListArgs(input: number | { limit?: number; offset?: number } | undefined) {
  const rawLimit = typeof input === "number" ? input : input?.limit ?? 20;
  const rawOffset = typeof input === "number" ? 0 : input?.offset ?? 0;
  const limit = Math.max(1, Math.min(50, Math.round(Number(rawLimit) || 20)));
  const offset = Math.max(0, Math.round(Number(rawOffset) || 0));
  return { limit, offset };
}

function normalizePurchaseConfirmationMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 240);
  for (const [orderId, value] of entries) {
    const safeOrderId = cleanText(orderId, 80);
    const confirmedAt = cleanText(value, 64);
    if (!safeOrderId || !confirmedAt) continue;
    next[safeOrderId] = confirmedAt;
  }
  return next;
}

async function loadPurchaseConfirmationMap(userId: string): Promise<Record<string, string>> {
  const row = await loadUserState(userId);
  const payload = row?.payload && typeof row.payload === "object" && row.payload !== null
    ? (row.payload as Record<string, unknown>)
    : {};
  return normalizePurchaseConfirmationMap(payload.shopPurchaseConfirmations);
}

async function savePurchaseConfirmationMap(userId: string, map: Record<string, string>): Promise<Record<string, string>> {
  const row = await loadUserState(userId);
  const payload = row?.payload && typeof row.payload === "object" && row.payload !== null
    ? (row.payload as Record<string, unknown>)
    : {};
  const normalized = normalizePurchaseConfirmationMap(map);
  await saveUserState({
    userId,
    payload: {
      ...payload,
      shopPurchaseConfirmations: normalized,
    },
  });
  return normalized;
}

export async function listShopOrderPurchaseConfirmations(
  userId: string,
  orderIds?: string[]
): Promise<Record<string, string>> {
  const map = await loadPurchaseConfirmationMap(userId);
  if (!Array.isArray(orderIds) || orderIds.length === 0) return map;
  return orderIds.reduce<Record<string, string>>((acc, orderId) => {
    const safeOrderId = cleanText(orderId, 80);
    if (safeOrderId && map[safeOrderId]) {
      acc[safeOrderId] = map[safeOrderId];
    }
    return acc;
  }, {});
}

export async function getShopOrderPurchaseConfirmedAt(userId: string, orderId: string): Promise<string | null> {
  const safeOrderId = cleanText(orderId, 80);
  if (!safeOrderId) return null;
  try {
    const map = await loadPurchaseConfirmationMap(userId);
    return map[safeOrderId] ?? null;
  } catch {
    return null;
  }
}

export async function listShopOrdersForUserPage(
  userId: string,
  input?: number | { limit?: number; offset?: number }
) {
  const { limit, offset } = normalizeListArgs(input);
  let rows: ShopOrderRecord[] = [];
  try {
    rows = await listShopOrderRows(Math.max(offset + limit + 40, 80));
  } catch {
    rows = [];
  }
  const filtered = rows.filter((row) => row.userId === userId);
  const total = filtered.length;
  const orders = await syncOrdersForRead(filtered.slice(offset, offset + limit), { maxOrders: 3 });
  return {
    orders,
    total,
    limit,
    offset,
    hasMore: offset + orders.length < total,
  };
}

export async function listShopOrdersForUser(userId: string, input?: number | { limit?: number; offset?: number }) {
  const page = await listShopOrdersForUserPage(userId, input);
  return page.orders;
}

export async function listShopOrdersForAdmin(limit = 40) {
  try {
    const rows = await listShopOrderRows(limit);
    return await syncOrdersForRead(rows, { maxOrders: 5 });
  } catch {
    return [];
  }
}

export async function syncOutstandingShopOrders(limit = 20) {
  const rows = await listShopOrderRows(Math.max(1, Math.min(80, limit)));
  return syncOrdersForRead(rows.filter((row) => isTrackableShippedOrder(row)), {
    maxOrders: Math.max(1, Math.min(20, limit)),
    force: true,
  });
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

export async function countReservedShopQuantityForProduct(productId: string) {
  const key = cleanText(productId, 80);
  if (!key) return 0;

  let rows: ShopOrderRecord[] = [];
  try {
    rows = await listShopOrderRows(240);
  } catch {
    rows = [];
  }

  return rows.reduce((sum, row) => {
    if (row.productId !== key) return sum;
    if (
      row.status !== "READY" &&
      row.status !== "PAID" &&
      row.status !== "SHIPPED" &&
      row.status !== "DELIVERED" &&
      row.status !== "REFUND_REQUESTED" &&
      row.status !== "REFUND_REJECTED"
    ) {
      return sum;
    }
    return sum + Math.max(0, Math.round(Number(row.productSnapshot.quantity) || 0));
  }, 0);
}

function isPurchaseConfirmableOrder(row: ShopOrderRecord) {
  return row.status === "DELIVERED" || Boolean(row.deliveredAt);
}

export async function listVerifiedShopReviewerIdsForProduct(productId: string): Promise<Set<string>> {
  const key = cleanText(productId, 80);
  if (!key) return new Set();

  let rows: ShopOrderRecord[] = [];
  try {
    rows = await listShopOrderRows(200);
  } catch {
    rows = [];
  }

  const verified = new Set<string>();
  const confirmationCache = new Map<string, Record<string, string>>();
  for (const row of rows) {
    if (row.productId !== key) continue;
    if (!isPurchaseConfirmableOrder(row)) continue;

    let confirmations = confirmationCache.get(row.userId);
    if (!confirmations) {
      try {
        confirmations = await loadPurchaseConfirmationMap(row.userId);
      } catch {
        confirmations = {};
      }
      confirmationCache.set(row.userId, confirmations);
    }

    if (confirmations[row.orderId]) {
      verified.add(row.userId);
    }
  }

  return verified;
}

export async function hasDeliveredShopOrderForUserProduct(userId: string, productId: string): Promise<boolean> {
  const safeUserId = cleanText(userId, 120);
  const safeProductId = cleanText(productId, 80);
  if (!safeUserId || !safeProductId) return false;

  let rows: ShopOrderRecord[] = [];
  try {
    rows = await listShopOrderRows(200);
  } catch {
    rows = [];
  }

  let confirmations: Record<string, string> = {};
  try {
    confirmations = await loadPurchaseConfirmationMap(safeUserId);
  } catch {
    confirmations = {};
  }

  return rows.some(
    (row) =>
      row.userId === safeUserId &&
      row.productId === safeProductId &&
      isPurchaseConfirmableOrder(row) &&
      Boolean(confirmations[row.orderId])
  );
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
  const bundle = await findShopOrderBundleByOrderId(input.userId, input.orderId).catch(() => null);
  const reason = sanitizeReason(input.reason);

  if (bundle && bundle.itemCount > 1 && bundle.status === "PAID") {
    const bundleOrders: ShopOrderRecord[] = [];
    for (const item of bundle.items) {
      const order = await readShopOrderForUser(input.userId, item.orderId);
      if (!order) throw new Error("shop_order_not_found");
      bundleOrders.push(order);
    }

    const hasInvalidOrder = bundleOrders.some(
      (order) => order.refund.status !== "requested" && order.refund.status !== "done" && order.status !== "PAID"
    );
    if (hasInvalidOrder) throw new Error("shop_order_not_refundable");

    const savedOrders: ShopOrderRecord[] = [];
    for (const order of bundleOrders) {
      if (order.refund.status === "requested" || order.refund.status === "done") {
        savedOrders.push(order);
        continue;
      }
      const saved = await writeOrder({
        ...order,
        status: "REFUND_REQUESTED",
        refund: {
          ...order.refund,
          status: "requested",
          reason,
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
        message: `묶음 주문 환불 요청: ${saved.refund.reason}`,
        metadata: { bundleId: bundle.bundleId },
      });
      savedOrders.push(saved);
    }

    const primaryOrder =
      savedOrders.find((order) => order.orderId === input.orderId) ??
      savedOrders[0] ??
      current;

    return {
      order: primaryOrder,
      orders: savedOrders,
      bundleRefundApplied: true,
    };
  }
  if (current.status !== "PAID") throw new Error("shop_order_not_refundable");
  if (current.refund.status === "requested" || current.refund.status === "done") {
    return {
      order: current,
      orders: [current],
      bundleRefundApplied: false,
    };
  }

  const saved = await writeOrder({
    ...current,
    status: "REFUND_REQUESTED",
    refund: {
      ...current.refund,
      status: "requested",
      reason,
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
  return {
    order: saved,
    orders: [saved],
    bundleRefundApplied: false,
  };
}

export async function rejectShopOrderRefund(input: {
  orderId: string;
  adminUserId: string;
  note?: string | null;
}) {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.refund.status !== "requested") throw new Error("shop_refund_not_requested");

  const bundle = await findShopOrderBundleByOrderId(current.userId, current.orderId).catch(() => null);
  if (bundle && bundle.itemCount > 1 && bundle.status === "PAID") {
    const bundleOrders: ShopOrderRecord[] = [];
    for (const item of bundle.items) {
      const order = await readShopOrderForUser(current.userId, item.orderId);
      if (!order) throw new Error("shop_order_not_found");
      bundleOrders.push(order);
    }
    if (bundleOrders.some((order) => order.refund.status === "done")) {
      throw new Error("shop_refund_already_processed");
    }

    const noteText = cleanText(input.note, 500) || "환불 요청이 반려되었습니다.";
    const savedOrders: ShopOrderRecord[] = [];
    for (const order of bundleOrders) {
      if (order.refund.status === "rejected") {
        savedOrders.push(order);
        continue;
      }
      if (order.refund.status !== "requested") throw new Error("shop_refund_not_requested");

      const saved = await writeOrder({
        ...order,
        status: "REFUND_REJECTED",
        refund: {
          ...order.refund,
          status: "rejected",
          reviewedAt: new Date().toISOString(),
          reviewedBy: cleanText(input.adminUserId, 120),
          note: noteText,
        },
      });
      await writeOrderEventSafe({
        order: saved,
        eventType: "refund_rejected",
        actorRole: "admin",
        actorUserId: input.adminUserId,
        message: saved.refund.note,
        metadata: { bundleId: bundle.bundleId },
      });
      savedOrders.push(saved);
    }

    return (
      savedOrders.find((order) => order.orderId === input.orderId) ??
      savedOrders[0] ??
      current
    );
  }

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
  const bundle = await findShopOrderBundleByOrderId(current.userId, current.orderId).catch(() => null);

  const bundleOrders: ShopOrderRecord[] =
    bundle && bundle.itemCount > 1 && bundle.status === "PAID"
      ? await Promise.all(
          bundle.items.map(async (item) => {
            const order = await readShopOrderForUser(current.userId, item.orderId);
            if (!order) throw new Error("shop_order_not_found");
            return order;
          })
        )
      : [];

  if (bundleOrders.length > 0 && bundleOrders.every((order) => order.refund.status === "done")) {
    return (
      bundleOrders.find((order) => order.orderId === input.orderId) ??
      bundleOrders[0] ??
      current
    );
  }
  if (bundleOrders.length > 0 && bundleOrders.some((order) => order.refund.status === "done")) {
    throw new Error("shop_refund_already_processed");
  }
  if (bundleOrders.length > 0 && bundleOrders.some((order) => order.refund.status !== "requested")) {
    throw new Error("shop_refund_not_requested");
  }

  const paymentKey =
    (bundle && bundleOrders.length > 0 ? bundle.paymentKey : null) ||
    current.paymentKey;
  if (!paymentKey) throw new Error("shop_order_missing_payment_key");

  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) throw new Error(secret.error);

  const auth = btoa(`${secret.secretKey}:`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    "Idempotency-Key": buildCancelIdempotencyKey(bundle && bundleOrders.length > 0 ? bundle.bundleId : current.orderId),
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
    res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cancelReason,
        cancelAmount: bundle && bundleOrders.length > 0 ? bundle.amount : current.amount,
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

  if (bundle && bundleOrders.length > 0) {
    const reviewedAt = new Date().toISOString();
    const canceledAt = reviewedAt;
    const cancelResponse = summarizeTossCancelResponse(json);
    const savedOrders: ShopOrderRecord[] = [];

    for (const order of bundleOrders) {
      if (order.refund.status === "done") {
        savedOrders.push(order);
        continue;
      }

      const saved = await writeOrder({
        ...order,
        status: "REFUNDED",
        paymentKey,
        refund: {
          ...order.refund,
          status: "done",
          reviewedAt,
          reviewedBy: cleanText(input.adminUserId, 120),
          note: cancelReason,
          cancelAmount: order.amount,
          canceledAt,
          cancelResponse,
        },
      });
      await writeOrderEventSafe({
        order: saved,
        eventType: "refund_approved",
        actorRole: "admin",
        actorUserId: input.adminUserId,
        message: cancelReason,
        metadata: {
          ...(cancelResponse && typeof cancelResponse === "object" && !Array.isArray(cancelResponse) ? (cancelResponse as Record<string, Json>) : {}),
          bundleId: bundle.bundleId,
          bundleCancelAmount: bundle.amount,
        },
      });
      savedOrders.push(saved);
    }

    await markShopOrderBundleCanceled({
      userId: current.userId,
      bundleId: bundle.bundleId,
      paymentKey,
    }).catch(() => null);

    return (
      savedOrders.find((order) => order.orderId === input.orderId) ??
      savedOrders[0] ??
      current
    );
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

export async function confirmShopOrderPurchase(input: {
  userId: string;
  orderId: string;
}): Promise<{ order: ShopOrderRecord; purchaseConfirmedAt: string }> {
  const current = await readShopOrderForUser(input.userId, input.orderId);
  const order = current ? await syncSingleOrderTrackingIfNeeded(current).catch(() => current) : null;
  if (!order) throw new Error("shop_order_not_found");
  if (!isPurchaseConfirmableOrder(order)) throw new Error("shop_order_not_delivered");

  const currentMap: Record<string, string> = await loadPurchaseConfirmationMap(input.userId).catch(
    (): Record<string, string> => ({})
  );
  if (currentMap[order.orderId]) {
    return {
      order,
      purchaseConfirmedAt: currentMap[order.orderId],
    };
  }

  const purchaseConfirmedAt = new Date().toISOString();
  await savePurchaseConfirmationMap(input.userId, {
    ...currentMap,
    [order.orderId]: purchaseConfirmedAt,
  });
  await writeOrderEventSafe({
    order,
    eventType: "purchase_confirmed",
    actorRole: "user",
    actorUserId: input.userId,
    message: "사용자가 배송 수령 후 구매를 확정했습니다.",
    metadata: { purchaseConfirmedAt },
  });

  return {
    order,
    purchaseConfirmedAt,
  };
}

export function toShopOrderSummary(order: ShopOrderRecord): ShopOrderSummary {
  const pricing = calculateShopPricing({
    priceKrw: order.productSnapshot.priceKrw,
    quantity: order.productSnapshot.quantity,
    currentAmountKrw: order.amount,
  });
  return {
    orderId: order.orderId,
    status: order.status,
    amount: pricing.totalKrw,
    subtotalKrw: pricing.subtotalKrw,
    shippingFeeKrw: pricing.shippingFeeKrw,
    createdAt: order.createdAt,
    approvedAt: order.approvedAt,
    paymentMethod: readPaymentMethod(order.tossResponse),
    failMessage: order.failMessage,
    productSnapshot: {
      name: order.productSnapshot.name,
      quantity: order.productSnapshot.quantity,
    },
    shipping: toMaskedShopShippingSnapshot(order.shipping),
    refund: {
      status: order.refund.status,
      reason: order.refund.reason,
      note: order.refund.note,
    },
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    tracking: buildTrackingSummary(order.shipping.smartTracker),
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    purchaseConfirmedAt: null,
  };
}

export async function getShopOrderById(userId: string, orderId: string): Promise<ShopOrderSummary | null> {
  const current = await readShopOrderForUser(userId, orderId);
  const order = current ? await syncSingleOrderTrackingIfNeeded(current).catch(() => current) : null;
  if (!order) return null;
  const purchaseConfirmedAt = await getShopOrderPurchaseConfirmedAt(userId, order.orderId);
  return {
    ...toShopOrderSummary(order),
    purchaseConfirmedAt,
  };
}

export async function markShopOrderShipped(input: {
  orderId: string;
  adminUserId: string;
  trackingNumber: string;
  courier: string;
  carrierCode: string;
}): Promise<ShopOrderRecord> {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.status !== "PAID") throw new Error("shop_order_not_paid");
  const now = new Date().toISOString();
  const carrierCode = cleanText(input.carrierCode, 40);
  if (!carrierCode) throw new Error("tracking_carrier_code_required");
  const trackingUrl = buildSweetTrackerTrackingUrl({
    carrierCode,
    trackingNumber: input.trackingNumber,
  });
  const saved = await writeOrder({
    ...current,
    status: "SHIPPED",
    trackingNumber: cleanText(input.trackingNumber, 120),
    courier: cleanText(input.courier, 60),
    shipping: normalizeShopShippingSnapshot({
      ...current.shipping,
      smartTracker: mergeSmartTrackerMeta(current.shipping.smartTracker, {
        carrierCode,
        trackingUrl,
        lastStatus: "shipped",
        lastStatusLabel: "배송 시작",
        lastEventAt: now,
        lastPolledAt: null,
        deliveredAt: null,
      }),
    }),
    shippedAt: now,
  });
  await writeOrderEventSafe({
    order: saved,
    eventType: "order_shipped",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    message: `배송 처리: ${input.courier} ${input.trackingNumber}`,
    metadata: { trackingNumber: input.trackingNumber, courier: input.courier, carrierCode },
  });
  return saved;
}

export async function markShopOrderDelivered(input: {
  orderId: string;
  adminUserId: string;
}): Promise<ShopOrderRecord> {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  if (current.status !== "SHIPPED") throw new Error("shop_order_not_shipped");
  const now = new Date().toISOString();
  const saved = await writeOrder({
    ...current,
    status: "DELIVERED",
    shipping: normalizeShopShippingSnapshot({
      ...current.shipping,
      smartTracker: mergeSmartTrackerMeta(current.shipping.smartTracker, {
        lastStatus: "delivered",
        lastStatusLabel: "배송완료",
        lastEventAt: now,
        lastPolledAt: now,
        deliveredAt: now,
      }),
    }),
    deliveredAt: now,
  });
  await writeOrderEventSafe({
    order: saved,
    eventType: "order_delivered",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    message: "배달 완료 처리",
    metadata: null,
  });
  return saved;
}

export async function confirmShopOrderDelivered(input: {
  userId: string;
  orderId: string;
}): Promise<ShopOrderRecord> {
  const current = await readShopOrderForUser(input.userId, input.orderId);
  const order = current ? await syncSingleOrderTrackingIfNeeded(current).catch(() => current) : null;
  if (!order) throw new Error("shop_order_not_found");
  if (order.status === "DELIVERED") return order;
  if (order.status !== "SHIPPED") throw new Error("shop_order_not_shipped");

  const now = new Date().toISOString();
  const saved = await writeOrder({
    ...order,
    status: "DELIVERED",
    shipping: normalizeShopShippingSnapshot({
      ...order.shipping,
      smartTracker: mergeSmartTrackerMeta(order.shipping.smartTracker, {
        lastStatus: "delivered",
        lastStatusLabel: "배송완료",
        lastEventAt: now,
        lastPolledAt: now,
        deliveredAt: now,
      }),
    }),
    deliveredAt: now,
  });
  await writeOrderEventSafe({
    order: saved,
    eventType: "order_delivered",
    actorRole: "user",
    actorUserId: input.userId,
    message: "사용자가 배송 수령을 확인했습니다.",
    metadata: { deliveredAt: now, source: "user_confirmation" },
  });
  return saved;
}

export async function syncShopOrderTracking(input: {
  orderId: string;
  adminUserId?: string | null;
  force?: boolean;
}): Promise<ShopOrderRecord> {
  const current = await readShopOrder(input.orderId);
  if (!current) throw new Error("shop_order_not_found");
  return syncSingleOrderTrackingIfNeeded(current, {
    force: Boolean(input.force),
    actorUserId: input.adminUserId ?? null,
  });
}

export function toShopAdminOrderSummary(order: ShopOrderRecord): ShopAdminOrderSummary {
  return {
    ...toShopOrderSummary(order),
    shipping: {
      recipientName: order.shipping.recipientName,
      phone: order.shipping.phone,
      postalCode: order.shipping.postalCode,
      addressLine1: order.shipping.addressLine1,
      addressLine2: order.shipping.addressLine2,
      deliveryNote: order.shipping.deliveryNote,
    },
    userLabel: maskUserId(order.userId),
  };
}
