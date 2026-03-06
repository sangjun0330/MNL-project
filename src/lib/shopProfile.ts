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
        // 보안 정책: 외부 추적 URL(API 키 포함 가능)은 스냅샷으로 보존/노출하지 않음
        trackingUrl: null,
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

/**
 * 한국 전화번호 포맷 검증 (010-1234-5678, 02-123-4567 등)
 * 공백·하이픈을 제거한 후 숫자만으로 판단합니다.
 */
export function isValidKoreanPhone(phone: string): boolean {
  const digits = String(phone ?? "").replace(/[\s\-]/g, "");
  // 01X로 시작하는 휴대폰(10~11자리) 또는 지역번호(9~11자리)
  return /^(01[016789]\d{7,8}|0[2-9]\d{7,9})$/.test(digits);
}

/**
 * 한국 우편번호 5자리 숫자 검증
 */
export function isValidPostalCode(code: string): boolean {
  return /^\d{5}$/.test(String(code ?? "").trim());
}

export function isCompleteShopShippingProfile(profile: ShopShippingProfile) {
  if (!profile.recipientName || !profile.phone || !profile.postalCode || !profile.addressLine1) {
    return false;
  }
  if (!isValidKoreanPhone(profile.phone)) return false;
  if (!isValidPostalCode(profile.postalCode)) return false;
  return true;
}

/**
 * 배송 프로필의 각 필드별 오류 메시지를 반환합니다.
 * 유효하면 null, 유효하지 않으면 오류 문자열 반환.
 */
export function validateShopShippingProfileField(
  field: keyof ShopShippingProfile,
  value: string
): string | null {
  switch (field) {
    case "recipientName":
      return value.trim() ? null : "수령인 이름을 입력해 주세요.";
    case "phone":
      if (!value.trim()) return "연락처를 입력해 주세요.";
      if (!isValidKoreanPhone(value)) return "올바른 전화번호 형식을 입력해 주세요. (예: 010-1234-5678)";
      return null;
    case "postalCode":
      if (!value.trim()) return "우편번호를 입력해 주세요.";
      if (!isValidPostalCode(value)) return "우편번호는 5자리 숫자여야 합니다.";
      return null;
    case "addressLine1":
      return value.trim() ? null : "주소를 입력해 주세요.";
    default:
      return null;
  }
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
