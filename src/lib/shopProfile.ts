export type ShopShippingProfile = {
  recipientName: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
  deliveryNote: string;
};

export type ShopShippingAddress = ShopShippingProfile & {
  id: string;
  label: string;
};

export type ShopShippingAddressBook = {
  addresses: ShopShippingAddress[];
  defaultAddressId: string | null;
};

export type ShopSmartTrackerMeta = {
  carrierCode: string | null;
  trackingUrl: string | null;
  lastStatus: string | null;
  lastStatusLabel: string | null;
  lastEventAt: string | null;
  lastPolledAt: string | null;
  deliveredAt: string | null;
};

export type ShopShippingSnapshot = ShopShippingProfile & {
  savedAt: string | null;
  smartTracker: ShopSmartTrackerMeta | null;
};

export function emptyShopShippingProfile(): ShopShippingProfile {
  return {
    recipientName: "",
    phone: "",
    postalCode: "",
    addressLine1: "",
    addressLine2: "",
    deliveryNote: "",
  };
}

function cleanText(value: unknown, max = 160) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function createShopShippingAddressId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ship_${crypto.randomUUID()}`;
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `ship_${Date.now().toString(36)}_${suffix}`;
  }
  return `ship_${Date.now().toString(36)}`;
}

export function normalizeShopShippingProfile(raw: unknown): ShopShippingProfile {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    recipientName: cleanText(source.recipientName, 60),
    phone: cleanText(source.phone, 30),
    postalCode: cleanText(source.postalCode, 20),
    addressLine1: cleanText(source.addressLine1, 180),
    addressLine2: cleanText(source.addressLine2, 180),
    deliveryNote: cleanText(source.deliveryNote, 200),
  };
}

export function buildShopShippingAddress(
  raw: unknown,
  fallback?: Partial<Pick<ShopShippingAddress, "id" | "label">>
): ShopShippingAddress {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = normalizeShopShippingProfile(source);
  const id = cleanText(source.id ?? fallback?.id, 80) || createShopShippingAddressId();
  const label = cleanText(source.label ?? fallback?.label, 40) || "기본 배송지";
  return {
    id,
    label,
    ...base,
  };
}

export function normalizeShopShippingAddressBook(raw: unknown): ShopShippingAddressBook {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawAddresses = Array.isArray(source.addresses) ? source.addresses : [];
  const addresses = rawAddresses
    .map((item) => buildShopShippingAddress(item))
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 8);
  const defaultAddressId = cleanText(source.defaultAddressId, 80) || null;
  const resolvedDefaultAddressId =
    addresses.find((item) => item.id === defaultAddressId)?.id ?? addresses[0]?.id ?? null;
  return {
    addresses,
    defaultAddressId: resolvedDefaultAddressId,
  };
}

export function normalizeShopShippingSnapshot(raw: unknown): ShopShippingSnapshot {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = normalizeShopShippingProfile(source);
  const savedAt = cleanText(source.savedAt, 64) || null;
  const smartTrackerSource =
    source.smartTracker && typeof source.smartTracker === "object" && !Array.isArray(source.smartTracker)
      ? (source.smartTracker as Record<string, unknown>)
      : null;
  const smartTracker: ShopSmartTrackerMeta | null = smartTrackerSource
    ? {
        carrierCode: cleanText(smartTrackerSource.carrierCode, 40) || null,
        trackingUrl: cleanText(smartTrackerSource.trackingUrl, 400) || null,
        lastStatus: cleanText(smartTrackerSource.lastStatus, 40) || null,
        lastStatusLabel: cleanText(smartTrackerSource.lastStatusLabel, 80) || null,
        lastEventAt: cleanText(smartTrackerSource.lastEventAt, 64) || null,
        lastPolledAt: cleanText(smartTrackerSource.lastPolledAt, 64) || null,
        deliveredAt: cleanText(smartTrackerSource.deliveredAt, 64) || null,
      }
    : null;
  return {
    ...base,
    savedAt,
    smartTracker,
  };
}

export function isCompleteShopShippingProfile(profile: ShopShippingProfile) {
  return Boolean(profile.recipientName && profile.phone && profile.postalCode && profile.addressLine1);
}

export function toShopShippingProfile(address: ShopShippingAddress | ShopShippingProfile): ShopShippingProfile {
  return normalizeShopShippingProfile(address);
}

export function defaultShopShippingAddressBook(): ShopShippingAddressBook {
  return {
    addresses: [],
    defaultAddressId: null,
  };
}

export function resolveDefaultShopShippingAddress(book: ShopShippingAddressBook) {
  return book.addresses.find((item) => item.id === book.defaultAddressId) ?? book.addresses[0] ?? null;
}

export function formatShopShippingSingleLine(profile: Pick<ShopShippingProfile, "postalCode" | "addressLine1" | "addressLine2">) {
  const parts = [
    profile.postalCode ? `(${profile.postalCode})` : "",
    profile.addressLine1,
    profile.addressLine2,
  ].filter(Boolean);
  return parts.join(" ");
}

export function buildShopShippingVerificationValue(profile: ShopShippingProfile) {
  return JSON.stringify(normalizeShopShippingProfile(profile));
}
