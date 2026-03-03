import { normalizeShopShippingSnapshot, type ShopShippingSnapshot } from "@/lib/shopProfile";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";

export type ShopOrderBundleStatus = "READY" | "PAID" | "FAILED" | "CANCELED";

export type ShopOrderBundleItem = {
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceKrw: number;
  amountKrw: number;
};

export type ShopOrderBundleRecord = {
  bundleId: string;
  userId: string;
  status: ShopOrderBundleStatus;
  amount: number;
  subtotalKrw: number;
  shippingFeeKrw: number;
  itemCount: number;
  totalQuantity: number;
  items: ShopOrderBundleItem[];
  shipping: ShopShippingSnapshot;
  paymentKey: string | null;
  approvedAt: string | null;
  failCode: string | null;
  failMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShopOrderBundleSummary = {
  bundleId: string;
  status: ShopOrderBundleStatus;
  amount: number;
  subtotalKrw: number;
  shippingFeeKrw: number;
  itemCount: number;
  totalQuantity: number;
  displayName: string;
  approvedAt: string | null;
};

const SHOP_ORDER_BUNDLES_KEY = "shopOrderBundles";
const MAX_BUNDLES = 40;

function cleanText(value: unknown, max = 220) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function normalizeBundleItem(raw: unknown): ShopOrderBundleItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const orderId = cleanText(source.orderId, 80);
  const productId = cleanText(source.productId, 80);
  const name = cleanText(source.name, 120);
  const quantity = Math.max(1, Math.min(99, Math.round(Number(source.quantity) || 1)));
  const unitPriceKrw = normalizeAmount(source.unitPriceKrw);
  const amountKrw = normalizeAmount(source.amountKrw);
  if (!orderId || !productId || !name || amountKrw <= 0) return null;
  return {
    orderId,
    productId,
    name,
    quantity,
    unitPriceKrw,
    amountKrw,
  };
}

function isBundleStatus(value: unknown): value is ShopOrderBundleStatus {
  return value === "READY" || value === "PAID" || value === "FAILED" || value === "CANCELED";
}

function normalizeBundleRecord(raw: unknown): ShopOrderBundleRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const bundleId = cleanText(source.bundleId, 80);
  const userId = cleanText(source.userId, 120);
  const status = isBundleStatus(source.status) ? source.status : null;
  const items = Array.isArray(source.items)
    ? source.items.map((item) => normalizeBundleItem(item)).filter((item): item is ShopOrderBundleItem => Boolean(item)).slice(0, 30)
    : [];
  if (!bundleId || !userId || !status || items.length === 0) return null;

  const subtotalKrw = normalizeAmount(source.subtotalKrw);
  const shippingFeeKrw = normalizeAmount(source.shippingFeeKrw);
  const amount = normalizeAmount(source.amount);
  const itemCount = Math.max(1, Math.min(30, Math.round(Number(source.itemCount) || items.length)));
  const totalQuantity = Math.max(
    1,
    Math.min(
      999,
      Math.round(Number(source.totalQuantity) || items.reduce((sum, item) => sum + item.quantity, 0))
    )
  );

  return {
    bundleId,
    userId,
    status,
    amount: amount || subtotalKrw + shippingFeeKrw,
    subtotalKrw,
    shippingFeeKrw,
    itemCount,
    totalQuantity,
    items,
    shipping: normalizeShopShippingSnapshot(source.shipping),
    paymentKey: cleanText(source.paymentKey, 220) || null,
    approvedAt: cleanText(source.approvedAt, 64) || null,
    failCode: cleanText(source.failCode, 120) || null,
    failMessage: cleanText(source.failMessage, 220) || null,
    createdAt: cleanText(source.createdAt, 64) || new Date().toISOString(),
    updatedAt: cleanText(source.updatedAt, 64) || new Date().toISOString(),
  };
}

async function loadUserPayload(userId: string) {
  const row = await loadUserState(userId);
  return row?.payload && typeof row.payload === "object" && row.payload !== null
    ? (row.payload as Record<string, unknown>)
    : {};
}

function normalizeBundleMap(raw: unknown): Record<string, ShopOrderBundleRecord> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const map: Record<string, ShopOrderBundleRecord> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeBundleRecord(value);
    if (!normalized) continue;
    map[key] = normalized;
  }
  return map;
}

async function saveBundleMap(userId: string, bundles: Record<string, ShopOrderBundleRecord>) {
  const payload = await loadUserPayload(userId);
  const sorted = Object.values(bundles)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_BUNDLES);

  const nextMap = sorted.reduce<Record<string, ShopOrderBundleRecord>>((acc, item) => {
    acc[item.bundleId] = item;
    return acc;
  }, {});

  await saveUserState({
    userId,
    payload: {
      ...payload,
      [SHOP_ORDER_BUNDLES_KEY]: nextMap,
    },
  });

  return nextMap;
}

export async function readShopOrderBundleForUser(userId: string, bundleId: string): Promise<ShopOrderBundleRecord | null> {
  const payload = await loadUserPayload(userId);
  const bundles = normalizeBundleMap(payload[SHOP_ORDER_BUNDLES_KEY]);
  return bundles[bundleId] ?? null;
}

export async function findShopOrderBundleByOrderId(userId: string, orderId: string): Promise<ShopOrderBundleRecord | null> {
  const payload = await loadUserPayload(userId);
  const bundles = normalizeBundleMap(payload[SHOP_ORDER_BUNDLES_KEY]);
  return Object.values(bundles).find((bundle) => bundle.items.some((item) => item.orderId === orderId)) ?? null;
}

export async function createShopOrderBundle(input: {
  bundleId: string;
  userId: string;
  subtotalKrw: number;
  shippingFeeKrw: number;
  items: ShopOrderBundleItem[];
  shipping: ShopShippingSnapshot;
}): Promise<ShopOrderBundleRecord> {
  const payload = await loadUserPayload(input.userId);
  const bundles = normalizeBundleMap(payload[SHOP_ORDER_BUNDLES_KEY]);
  const now = new Date().toISOString();
  const bundleId = cleanText(input.bundleId, 80);
  const userId = cleanText(input.userId, 120);
  const normalizedItems = input.items
    .map((item) => normalizeBundleItem(item))
    .filter((item): item is ShopOrderBundleItem => Boolean(item))
    .slice(0, 30);
  if (!bundleId || !userId || normalizedItems.length === 0) {
    throw new Error("invalid_shop_order_bundle");
  }

  const subtotalKrw = normalizeAmount(input.subtotalKrw);
  const shippingFeeKrw = normalizeAmount(input.shippingFeeKrw);
  const amount = subtotalKrw + shippingFeeKrw;

  const bundle: ShopOrderBundleRecord = {
    bundleId,
    userId,
    status: "READY",
    amount,
    subtotalKrw,
    shippingFeeKrw,
    itemCount: normalizedItems.length,
    totalQuantity: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
    items: normalizedItems,
    shipping: normalizeShopShippingSnapshot(input.shipping),
    paymentKey: null,
    approvedAt: null,
    failCode: null,
    failMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  bundles[bundle.bundleId] = bundle;
  const saved = await saveBundleMap(input.userId, bundles);
  return saved[bundle.bundleId] ?? bundle;
}

export async function markShopOrderBundlePaid(input: {
  userId: string;
  bundleId: string;
  paymentKey: string;
  approvedAt?: string | null;
}) {
  const payload = await loadUserPayload(input.userId);
  const bundles = normalizeBundleMap(payload[SHOP_ORDER_BUNDLES_KEY]);
  const current = bundles[input.bundleId];
  if (!current) throw new Error("shop_order_bundle_not_found");

  const next: ShopOrderBundleRecord = {
    ...current,
    status: "PAID",
    paymentKey: cleanText(input.paymentKey, 220) || null,
    approvedAt: cleanText(input.approvedAt, 64) || new Date().toISOString(),
    failCode: null,
    failMessage: null,
    updatedAt: new Date().toISOString(),
  };

  bundles[input.bundleId] = next;
  const saved = await saveBundleMap(input.userId, bundles);
  return saved[input.bundleId] ?? next;
}

export async function markShopOrderBundleFailed(input: {
  userId: string;
  bundleId: string;
  code: string;
  message: string;
}) {
  const payload = await loadUserPayload(input.userId);
  const bundles = normalizeBundleMap(payload[SHOP_ORDER_BUNDLES_KEY]);
  const current = bundles[input.bundleId];
  if (!current) throw new Error("shop_order_bundle_not_found");

  const next: ShopOrderBundleRecord = {
    ...current,
    status: "FAILED",
    failCode: cleanText(input.code, 120) || "bundle_failed",
    failMessage: cleanText(input.message, 220) || "주문 묶음 결제에 실패했습니다.",
    updatedAt: new Date().toISOString(),
  };

  bundles[input.bundleId] = next;
  const saved = await saveBundleMap(input.userId, bundles);
  return saved[input.bundleId] ?? next;
}

export async function markShopOrderBundleCanceled(input: {
  userId: string;
  bundleId: string;
  paymentKey?: string | null;
}) {
  const payload = await loadUserPayload(input.userId);
  const bundles = normalizeBundleMap(payload[SHOP_ORDER_BUNDLES_KEY]);
  const current = bundles[input.bundleId];
  if (!current) throw new Error("shop_order_bundle_not_found");

  const next: ShopOrderBundleRecord = {
    ...current,
    status: "CANCELED",
    paymentKey: cleanText(input.paymentKey, 220) || current.paymentKey,
    failCode: null,
    failMessage: null,
    updatedAt: new Date().toISOString(),
  };

  bundles[input.bundleId] = next;
  const saved = await saveBundleMap(input.userId, bundles);
  return saved[input.bundleId] ?? next;
}

export function toShopOrderBundleSummary(bundle: ShopOrderBundleRecord): ShopOrderBundleSummary {
  return {
    bundleId: bundle.bundleId,
    status: bundle.status,
    amount: bundle.amount,
    subtotalKrw: bundle.subtotalKrw,
    shippingFeeKrw: bundle.shippingFeeKrw,
    itemCount: bundle.itemCount,
    totalQuantity: bundle.totalQuantity,
    displayName: bundle.itemCount <= 1 ? bundle.items[0]?.name ?? "장바구니 결제" : `${bundle.items[0]?.name ?? "장바구니 상품"} 외 ${bundle.itemCount - 1}건`,
    approvedAt: bundle.approvedAt,
  };
}
