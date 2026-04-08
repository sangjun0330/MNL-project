import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import {
  buildShopShippingAddress,
  defaultShopShippingAddressBook,
  emptyShopShippingProfile,
  isCompleteShopShippingProfile,
  normalizeShopShippingAddressBook,
  normalizeShopShippingProfile,
  normalizeShopShippingSnapshot,
  resolveDefaultShopShippingAddress,
  toShopShippingProfile,
  type ShopShippingAddress,
  type ShopShippingAddressBook,
  type ShopShippingProfile,
  type ShopShippingSnapshot,
} from "@/lib/shopProfile";
import type { Database } from "@/types/supabase";

type ShopProfileRow = Database["public"]["Tables"]["shop_customer_profiles"]["Row"];

function isMissingTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("relation") && message.includes("shop_customer_profiles")) ||
    (message.includes("column") && message.includes("shop_customer_profiles"))
  );
}

function fromRow(row: ShopProfileRow | null): ShopShippingProfile {
  if (!row) return emptyShopShippingProfile();
  return normalizeShopShippingProfile({
    recipientName: row.recipient_name,
    phone: row.phone,
    postalCode: row.postal_code,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    deliveryNote: row.delivery_note,
  });
}

async function loadUserStatePayload(userId: string) {
  const row = await loadUserState(userId);
  return row?.payload && typeof row.payload === "object" && row.payload !== null
    ? (row.payload as Record<string, unknown>)
    : {};
}

function bookFromFallbackProfile(profile: ShopShippingProfile | null): ShopShippingAddressBook {
  if (!profile || !isCompleteShopShippingProfile(profile)) {
    return defaultShopShippingAddressBook();
  }
  const address = buildShopShippingAddress(profile, {
    id: "legacy_default",
    label: "기본 배송지",
  });
  return {
    addresses: [address],
    defaultAddressId: address.id,
  };
}

function mergeAddressBookSources(input: {
  primaryProfile: ShopShippingProfile | null;
  legacyProfile: ShopShippingProfile | null;
  rawBook: unknown;
}) {
  const normalizedBook = normalizeShopShippingAddressBook(input.rawBook);
  if (normalizedBook.addresses.length > 0) return normalizedBook;
  if (input.primaryProfile && isCompleteShopShippingProfile(input.primaryProfile)) {
    return bookFromFallbackProfile(input.primaryProfile);
  }
  if (input.legacyProfile && isCompleteShopShippingProfile(input.legacyProfile)) {
    return bookFromFallbackProfile(input.legacyProfile);
  }
  return defaultShopShippingAddressBook();
}

async function readPrimaryProfileRow(userId: string): Promise<ShopShippingProfile | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("shop_customer_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function writePrimaryProfileRow(userId: string, profile: ShopShippingProfile | null) {
  const admin = getSupabaseAdmin();
  if (!profile || !isCompleteShopShippingProfile(profile)) {
    const { error } = await admin.from("shop_customer_profiles").delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("shop_customer_profiles").upsert(
    {
      user_id: userId,
      recipient_name: profile.recipientName,
      phone: profile.phone,
      postal_code: profile.postalCode,
      address_line1: profile.addressLine1,
      address_line2: profile.addressLine2,
      delivery_note: profile.deliveryNote,
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

async function loadLegacyProfile(userId: string): Promise<ShopShippingProfile> {
  const payload = await loadUserStatePayload(userId);
  return normalizeShopShippingProfile(payload.shopShippingProfile ?? null);
}

async function saveLegacyPayload(
  userId: string,
  book: ShopShippingAddressBook,
  profile: ShopShippingProfile
): Promise<void> {
  await saveUserState({
    userId,
    payload: {
      shopShippingProfile: profile,
      shopShippingAddressBook: {
        addresses: book.addresses,
        defaultAddressId: book.defaultAddressId,
      },
    },
  });
}

export async function loadShopShippingAddressBook(userId: string): Promise<ShopShippingAddressBook> {
  let primaryProfile: ShopShippingProfile | null = null;
  try {
    primaryProfile = await readPrimaryProfileRow(userId);
  } catch {
    primaryProfile = null;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await loadUserStatePayload(userId);
  } catch {
    payload = {};
  }

  const legacyProfile = normalizeShopShippingProfile(payload.shopShippingProfile ?? null);
  return mergeAddressBookSources({
    primaryProfile,
    legacyProfile,
    rawBook: payload.shopShippingAddressBook ?? null,
  });
}

export async function saveShopShippingAddressBook(
  userId: string,
  raw: unknown
): Promise<{ book: ShopShippingAddressBook; profile: ShopShippingProfile }> {
  const book = normalizeShopShippingAddressBook(raw);
  if (book.addresses.some((item) => !isCompleteShopShippingProfile(item))) {
    throw new Error("invalid_shop_shipping_profile");
  }

  const primaryAddress = resolveDefaultShopShippingAddress(book);
  const profile = primaryAddress ? toShopShippingProfile(primaryAddress) : emptyShopShippingProfile();

  try {
    await writePrimaryProfileRow(userId, primaryAddress ? profile : null);
  } catch {
    // Fall through to legacy state storage. Primary profile sync is best-effort.
  }

  try {
    await saveLegacyPayload(userId, book, profile);
  } catch {
    throw new Error("shop_profile_storage_unavailable");
  }

  return { book, profile };
}

export async function resolveShopShippingProfileFromBook(
  userId: string,
  addressId?: string | null
): Promise<ShopShippingProfile> {
  const book = await loadShopShippingAddressBook(userId);
  const selected =
    (addressId ? book.addresses.find((item) => item.id === addressId) : null) ??
    resolveDefaultShopShippingAddress(book);
  if (!selected) {
    return emptyShopShippingProfile();
  }
  return toShopShippingProfile(selected);
}

export async function loadShopShippingProfile(userId: string): Promise<ShopShippingProfile> {
  try {
    const book = await loadShopShippingAddressBook(userId);
    const address = resolveDefaultShopShippingAddress(book);
    return address ? toShopShippingProfile(address) : emptyShopShippingProfile();
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    try {
      return await loadLegacyProfile(userId);
    } catch {
      return emptyShopShippingProfile();
    }
  }
}

export async function saveShopShippingProfile(userId: string, raw: unknown): Promise<ShopShippingProfile> {
  const profile = normalizeShopShippingProfile(raw);
  if (!isCompleteShopShippingProfile(profile)) {
    throw new Error("invalid_shop_shipping_profile");
  }
  const current = await loadShopShippingAddressBook(userId).catch(() => defaultShopShippingAddressBook());
  const currentDefault =
    resolveDefaultShopShippingAddress(current) ??
    buildShopShippingAddress(profile, { id: "legacy_default", label: "기본 배송지" });
  const nextAddress: ShopShippingAddress = buildShopShippingAddress(
    {
      ...profile,
      id: currentDefault.id,
      label: currentDefault.label,
    },
    {
      id: currentDefault.id,
      label: currentDefault.label,
    }
  );
  const addresses = current.addresses.some((item) => item.id === nextAddress.id)
    ? current.addresses.map((item) => (item.id === nextAddress.id ? nextAddress : item))
    : [nextAddress, ...current.addresses].slice(0, 8);
  const saved = await saveShopShippingAddressBook(userId, {
    addresses,
    defaultAddressId: nextAddress.id,
  });
  return saved.profile;
}

export function buildShopShippingSnapshot(profile: ShopShippingProfile): ShopShippingSnapshot {
  return normalizeShopShippingSnapshot({
    ...profile,
    savedAt: new Date().toISOString(),
    smartTracker: null,
  });
}
