import { loadUserState, saveUserState } from "@/lib/server/userStateStore";

export type ShopCartItem = {
  productId: string;
  quantity: number;
  savedAt: string;
};

const MAX_CART_ITEMS = 30;

function normalizeCartItems(raw: unknown): ShopCartItem[] {
  if (!Array.isArray(raw)) return [];
  const next: ShopCartItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const productId = String(source.productId ?? "").trim().slice(0, 80);
    if (!productId || seen.has(productId)) continue;
    const quantity = Math.max(1, Math.min(9, Math.round(Number(source.quantity) || 1)));
    const savedAt = String(source.savedAt ?? "").trim().slice(0, 64) || new Date().toISOString();
    next.push({ productId, quantity, savedAt });
    seen.add(productId);
    if (next.length >= MAX_CART_ITEMS) break;
  }
  return next;
}

async function loadUserPayload(userId: string) {
  const row = await loadUserState(userId);
  return row?.payload && typeof row.payload === "object" && row.payload !== null
    ? (row.payload as Record<string, unknown>)
    : {};
}

async function saveCart(userId: string, items: ShopCartItem[]) {
  const payload = await loadUserPayload(userId);
  const normalized = normalizeCartItems(items);
  await saveUserState({
    userId,
    payload: {
      ...payload,
      shopCart: normalized,
    },
  });
  return normalized;
}

export async function loadShopCart(userId: string): Promise<ShopCartItem[]> {
  const payload = await loadUserPayload(userId);
  return normalizeCartItems(payload.shopCart);
}

export async function addShopCartItem(userId: string, productId: string, quantity = 1): Promise<ShopCartItem[]> {
  const current = await loadShopCart(userId);
  const safeProductId = String(productId ?? "").trim().slice(0, 80);
  if (!safeProductId) return current;
  const safeQuantity = Math.max(1, Math.min(9, Math.round(Number(quantity) || 1)));
  const now = new Date().toISOString();
  const existing = current.find((item) => item.productId === safeProductId);
  if (existing) {
    return saveCart(
      userId,
      current.map((item) =>
        item.productId === safeProductId
          ? { ...item, quantity: Math.max(1, Math.min(9, item.quantity + safeQuantity)), savedAt: now }
          : item
      )
    );
  }
  return saveCart(userId, [{ productId: safeProductId, quantity: safeQuantity, savedAt: now }, ...current]);
}

export async function setShopCartItemQuantity(userId: string, productId: string, quantity: number): Promise<ShopCartItem[]> {
  const current = await loadShopCart(userId);
  const safeProductId = String(productId ?? "").trim().slice(0, 80);
  if (!safeProductId) return current;
  const safeQuantity = Math.max(0, Math.min(9, Math.round(Number(quantity) || 0)));
  if (safeQuantity <= 0) {
    return saveCart(userId, current.filter((item) => item.productId !== safeProductId));
  }
  const now = new Date().toISOString();
  const exists = current.some((item) => item.productId === safeProductId);
  if (!exists) {
    return saveCart(userId, [{ productId: safeProductId, quantity: safeQuantity, savedAt: now }, ...current]);
  }
  return saveCart(
    userId,
    current.map((item) =>
      item.productId === safeProductId ? { ...item, quantity: safeQuantity, savedAt: now } : item
    )
  );
}

export async function removeShopCartItem(userId: string, productId: string): Promise<ShopCartItem[]> {
  const current = await loadShopCart(userId);
  const safeProductId = String(productId ?? "").trim().slice(0, 80);
  if (!safeProductId) return current;
  return saveCart(userId, current.filter((item) => item.productId !== safeProductId));
}

export async function clearShopCart(userId: string): Promise<ShopCartItem[]> {
  return saveCart(userId, []);
}
