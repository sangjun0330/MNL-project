const SHOP_CLIENT_STATE_KEY = "rnest_shop_state_v2";
const MAX_RECENT_PRODUCTS = 6;
const LEGACY_WISHLIST_KEY = "rnest_shop_wishlist_v1";
const MAX_WISHLIST_SIZE = 50;

export type ShopCartItem = {
  productId: string;
  quantity: number;
  savedAt: string;
};

export type ShopClientState = {
  version: 2;
  recentIds: string[];
  detailOpenCounts: Record<string, number>;
  partnerClickCounts: Record<string, number>;
};

export function defaultShopClientState(): ShopClientState {
  return {
    version: 2,
    recentIds: [],
    detailOpenCounts: {},
    partnerClickCounts: {},
  };
}

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 24);
}

function safeNumberMap(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, count]) => {
    if (typeof key !== "string") return acc;
    const nextCount = Number(count);
    if (!Number.isFinite(nextCount) || nextCount <= 0) return acc;
    acc[key] = Math.floor(nextCount);
    return acc;
  }, {});
}

export function loadShopClientState(): ShopClientState {
  if (typeof window === "undefined") return defaultShopClientState();
  try {
    const raw = window.localStorage.getItem(SHOP_CLIENT_STATE_KEY);
    if (!raw) return defaultShopClientState();
    const parsed = JSON.parse(raw) as Partial<ShopClientState> | null;
    if (!parsed || parsed.version !== 2) return defaultShopClientState();
    return {
      version: 2,
      recentIds: safeStringArray(parsed.recentIds).slice(0, MAX_RECENT_PRODUCTS),
      detailOpenCounts: safeNumberMap(parsed.detailOpenCounts),
      partnerClickCounts: safeNumberMap(parsed.partnerClickCounts),
    };
  } catch {
    return defaultShopClientState();
  }
}

export function saveShopClientState(state: ShopClientState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHOP_CLIENT_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota/private-mode failures
  }
}

export function markShopViewed(state: ShopClientState, productId: string): ShopClientState {
  return {
    ...state,
    recentIds: [productId, ...state.recentIds.filter((id) => id !== productId)].slice(0, MAX_RECENT_PRODUCTS),
    detailOpenCounts: {
      ...state.detailOpenCounts,
      [productId]: (state.detailOpenCounts[productId] ?? 0) + 1,
    },
  };
}

export function markShopPartnerClick(state: ShopClientState, productId: string): ShopClientState {
  return {
    ...state,
    partnerClickCounts: {
      ...state.partnerClickCounts,
      [productId]: (state.partnerClickCounts[productId] ?? 0) + 1,
    },
  };
}

function readLegacyWishlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_WISHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const id = item.trim();
      if (!id || ids.includes(id)) continue;
      ids.push(id);
      if (ids.length >= MAX_WISHLIST_SIZE) break;
    }
    return ids;
  } catch {
    return [];
  }
}

function clearLegacyWishlist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_WISHLIST_KEY);
  } catch {
    // ignore storage failures
  }
}

async function requestWishlist(
  input: {
    method: "GET" | "PUT";
    headers?: HeadersInit;
    body?: Record<string, unknown>;
  }
): Promise<{ ids: string[]; active: boolean | null }> {
  const res = await fetch("/api/shop/wishlist", {
    method: input.method,
    headers: {
      ...(input.method === "PUT" ? { "content-type": "application/json" } : {}),
      ...(input.headers ?? {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error ?? `wishlist_http_${res.status}`));
  }
  const ids = Array.isArray(json?.data?.ids)
    ? json.data.ids.filter((item: unknown): item is string => typeof item === "string").slice(0, MAX_WISHLIST_SIZE)
    : [];
  const active = typeof json?.data?.active === "boolean" ? json.data.active : null;
  return { ids, active };
}

export async function getWishlist(headers?: HeadersInit): Promise<string[]> {
  const result = await requestWishlist({ method: "GET", headers });
  const legacyIds = readLegacyWishlist();
  if (legacyIds.length === 0) return result.ids;

  const merged = Array.from(new Set([...legacyIds, ...result.ids])).slice(0, MAX_WISHLIST_SIZE);
  try {
    const saved = await requestWishlist({
      method: "PUT",
      headers,
      body: { ids: merged },
    });
    clearLegacyWishlist();
    return saved.ids;
  } catch {
    return result.ids;
  }
}

export async function isInWishlist(productId: string, headers?: HeadersInit): Promise<boolean> {
  const ids = await getWishlist(headers);
  return ids.includes(productId);
}

export async function addToWishlist(productId: string, headers?: HeadersInit): Promise<string[]> {
  const result = await requestWishlist({
    method: "PUT",
    headers,
    body: { productId, action: "add" },
  });
  return result.ids;
}

export async function removeFromWishlist(productId: string, headers?: HeadersInit): Promise<string[]> {
  const result = await requestWishlist({
    method: "PUT",
    headers,
    body: { productId, action: "remove" },
  });
  return result.ids;
}

export async function toggleWishlist(productId: string, headers?: HeadersInit): Promise<{ ids: string[]; active: boolean }> {
  const result = await requestWishlist({
    method: "PUT",
    headers,
    body: { productId, action: "toggle" },
  });
  return {
    ids: result.ids,
    active: Boolean(result.active),
  };
}

async function requestCart(input: {
  method: "GET" | "PUT";
  headers?: HeadersInit;
  body?: Record<string, unknown>;
}): Promise<ShopCartItem[]> {
  const res = await fetch("/api/shop/cart", {
    method: input.method,
    headers: {
      ...(input.method === "PUT" ? { "content-type": "application/json" } : {}),
      ...(input.headers ?? {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error ?? `cart_http_${res.status}`));
  }
  const rawItems: unknown[] = Array.isArray(json?.data?.items) ? json.data.items : [];
  return rawItems
    .filter(
      (item: unknown): item is ShopCartItem =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as ShopCartItem).productId === "string" &&
        typeof (item as ShopCartItem).quantity === "number"
    )
    .map((item) => ({
      productId: item.productId,
      quantity: Math.max(1, Math.min(9, Math.round(Number(item.quantity) || 1))),
      savedAt: String(item.savedAt ?? ""),
    }));
}

export async function getCart(headers?: HeadersInit): Promise<ShopCartItem[]> {
  return requestCart({ method: "GET", headers });
}

export async function addToCart(productId: string, quantity = 1, headers?: HeadersInit): Promise<ShopCartItem[]> {
  return requestCart({
    method: "PUT",
    headers,
    body: { action: "add", productId, quantity },
  });
}

export async function updateCartQuantity(productId: string, quantity: number, headers?: HeadersInit): Promise<ShopCartItem[]> {
  return requestCart({
    method: "PUT",
    headers,
    body: { action: "set", productId, quantity },
  });
}

export async function removeFromCart(productId: string, headers?: HeadersInit): Promise<ShopCartItem[]> {
  return requestCart({
    method: "PUT",
    headers,
    body: { action: "remove", productId },
  });
}

export async function clearCart(headers?: HeadersInit): Promise<ShopCartItem[]> {
  return requestCart({
    method: "PUT",
    headers,
    body: { action: "clear" },
  });
}
