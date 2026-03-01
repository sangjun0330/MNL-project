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
