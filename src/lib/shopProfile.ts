export type ShopShippingProfile = {
  recipientName: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2: string;
  deliveryNote: string;
};

export type ShopShippingSnapshot = ShopShippingProfile & {
  savedAt: string | null;
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

export function normalizeShopShippingSnapshot(raw: unknown): ShopShippingSnapshot {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = normalizeShopShippingProfile(source);
  const savedAt = cleanText(source.savedAt, 64) || null;
  return {
    ...base,
    savedAt,
  };
}

export function isCompleteShopShippingProfile(profile: ShopShippingProfile) {
  return Boolean(profile.recipientName && profile.phone && profile.postalCode && profile.addressLine1);
}

export function formatShopShippingSingleLine(profile: Pick<ShopShippingProfile, "postalCode" | "addressLine1" | "addressLine2">) {
  const parts = [
    profile.postalCode ? `(${profile.postalCode})` : "",
    profile.addressLine1,
    profile.addressLine2,
  ].filter(Boolean);
  return parts.join(" ");
}

