import type { ShopShippingSnapshot } from "@/lib/shopProfile";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export function maskShopEmail(email: string | null | undefined) {
  const safe = cleanText(email);
  if (!safe.includes("@")) return safe || "로그인된 계정";
  const [local, domain] = safe.split("@");
  if (!local || !domain) return safe;
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export function maskShopRecipientName(name: string | null | undefined) {
  const safe = cleanText(name);
  if (!safe) return "-";
  if (safe.length === 1) return `${safe}*`;
  return `${safe.slice(0, 1)}${"*".repeat(Math.max(1, safe.length - 1))}`;
}

export function maskShopPhone(phone: string | null | undefined) {
  const safe = cleanText(phone);
  if (safe.length < 7) return safe || "-";
  return `${safe.slice(0, 3)}-${"*".repeat(Math.max(3, safe.length - 7))}-${safe.slice(-4)}`;
}

export function maskShopPostalCode(postalCode: string | null | undefined) {
  const safe = cleanText(postalCode);
  if (!safe) return "-";
  if (safe.length <= 3) return `${safe.slice(0, 1)}${"*".repeat(Math.max(1, safe.length - 1))}`;
  return `${safe.slice(0, 3)}${"*".repeat(Math.max(2, safe.length - 3))}`;
}

export function maskShopAddressLine(addressLine: string | null | undefined) {
  const safe = cleanText(addressLine);
  if (!safe) return "-";
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return `${parts[0] ?? safe} · 상세 비공개`;
  return `${parts.slice(0, 3).join(" ")} · 상세 비공개`;
}

export function toMaskedShopShippingSnapshot(shipping: ShopShippingSnapshot): ShopShippingSnapshot {
  return {
    savedAt: shipping.savedAt,
    recipientName: maskShopRecipientName(shipping.recipientName),
    phone: maskShopPhone(shipping.phone),
    postalCode: maskShopPostalCode(shipping.postalCode),
    addressLine1: maskShopAddressLine(shipping.addressLine1),
    addressLine2: shipping.addressLine2 ? "상세 주소 비공개" : "",
    deliveryNote: shipping.deliveryNote ? "배송 메모 저장됨" : "",
  };
}
