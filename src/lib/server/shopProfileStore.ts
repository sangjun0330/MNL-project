import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import { emptyShopShippingProfile, normalizeShopShippingProfile, normalizeShopShippingSnapshot, type ShopShippingProfile, type ShopShippingSnapshot } from "@/lib/shopProfile";
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

async function loadLegacyProfile(userId: string): Promise<ShopShippingProfile> {
  const row = await loadUserState(userId);
  const payload =
    row?.payload && typeof row.payload === "object" && row.payload !== null ? (row.payload as Record<string, unknown>) : null;
  return normalizeShopShippingProfile(payload?.shopShippingProfile ?? null);
}

async function saveLegacyProfile(userId: string, profile: ShopShippingProfile): Promise<ShopShippingProfile> {
  const row = await loadUserState(userId);
  const existing =
    row?.payload && typeof row.payload === "object" && row.payload !== null ? (row.payload as Record<string, unknown>) : {};
  await saveUserState({
    userId,
    payload: {
      ...existing,
      shopShippingProfile: profile,
    },
  });
  return profile;
}

export async function loadShopShippingProfile(userId: string): Promise<ShopShippingProfile> {
  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await admin.from("shop_customer_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return fromRow(data);
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
  const admin = getSupabaseAdmin();
  const profile = normalizeShopShippingProfile(raw);
  try {
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
    return profile;
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    try {
      return await saveLegacyProfile(userId, profile);
    } catch {
      throw new Error("shop_profile_storage_unavailable");
    }
  }
}

export function buildShopShippingSnapshot(profile: ShopShippingProfile): ShopShippingSnapshot {
  return normalizeShopShippingSnapshot({
    ...profile,
    savedAt: new Date().toISOString(),
  });
}
