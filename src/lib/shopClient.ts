const SHOP_CLIENT_STATE_KEY = "rnest_shop_state_v2";
const MAX_RECENT_PRODUCTS = 6;

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

// ─── 위시리스트 (localStorage, 독립 키) ───────────────────────────────────────

const WISHLIST_KEY = "rnest_shop_wishlist_v1";
const MAX_WISHLIST_SIZE = 50;

export function getWishlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_WISHLIST_SIZE);
  } catch {
    return [];
  }
}

export function isInWishlist(productId: string): boolean {
  return getWishlist().includes(productId);
}

export function addToWishlist(productId: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getWishlist();
    if (current.includes(productId)) return;
    const next = [productId, ...current].slice(0, MAX_WISHLIST_SIZE);
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
  } catch {
    // ignore quota/private-mode failures
  }
}

export function removeFromWishlist(productId: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = getWishlist().filter((id) => id !== productId);
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
  } catch {
    // ignore quota/private-mode failures
  }
}

export function toggleWishlist(productId: string): boolean {
  if (isInWishlist(productId)) {
    removeFromWishlist(productId);
    return false;
  } else {
    addToWishlist(productId);
    return true;
  }
}
