import { loadUserState, saveUserState } from "@/lib/server/userStateStore";

const MAX_WISHLIST_SIZE = 50;

function normalizeWishlistIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    const value = String(item ?? "").trim().slice(0, 80);
    if (!value || ids.includes(value)) continue;
    ids.push(value);
    if (ids.length >= MAX_WISHLIST_SIZE) break;
  }
  return ids;
}

async function loadUserPayload(userId: string) {
  const row = await loadUserState(userId);
  return row?.payload && typeof row.payload === "object" && row.payload !== null
    ? (row.payload as Record<string, unknown>)
    : {};
}

async function saveWishlist(userId: string, ids: string[]) {
  const payload = await loadUserPayload(userId);
  const normalized = normalizeWishlistIds(ids);
  await saveUserState({
    userId,
    payload: {
      ...payload,
      shopWishlist: normalized,
    },
  });
  return normalized;
}

export async function loadShopWishlist(userId: string): Promise<string[]> {
  const payload = await loadUserPayload(userId);
  return normalizeWishlistIds(payload.shopWishlist);
}

export async function replaceShopWishlist(userId: string, rawIds: unknown): Promise<string[]> {
  return saveWishlist(userId, normalizeWishlistIds(rawIds));
}

export async function addShopWishlistItem(userId: string, productId: string): Promise<string[]> {
  const current = await loadShopWishlist(userId);
  if (current.includes(productId)) return current;
  return saveWishlist(userId, [productId, ...current]);
}

export async function removeShopWishlistItem(userId: string, productId: string): Promise<string[]> {
  const current = await loadShopWishlist(userId);
  if (!current.includes(productId)) return current;
  return saveWishlist(userId, current.filter((id) => id !== productId));
}

export async function toggleShopWishlistItem(userId: string, productId: string): Promise<{ ids: string[]; active: boolean }> {
  const current = await loadShopWishlist(userId);
  if (current.includes(productId)) {
    const ids = await saveWishlist(userId, current.filter((id) => id !== productId));
    return { ids, active: false };
  }
  const ids = await saveWishlist(userId, [productId, ...current]);
  return { ids, active: true };
}
