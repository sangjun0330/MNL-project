import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadAIContent, saveAIContent } from "@/lib/server/aiContentStore";
import { ensureUserRow } from "@/lib/server/userStateStore";
import { todayISO } from "@/lib/date";
import type { Database } from "@/types/supabase";
import type { Json } from "@/types/supabase";

export type ShopReviewRecord = {
  id: number;
  productId: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopReviewSummary = {
  count: number;
  averageRating: number;
};

type ShopReviewRow = Database["public"]["Tables"]["shop_reviews"]["Row"];

function cleanText(value: unknown, max = 220) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function toRating(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function isMissingTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    (message.includes("relation") && message.includes("shop_reviews")) ||
    (message.includes("column") && message.includes("shop_reviews"))
  );
}

function fromRow(row: ShopReviewRow): ShopReviewRecord | null {
  const rating = toRating(row.rating);
  if (!rating) return null;
  return {
    id: Number(row.id),
    productId: cleanText(row.product_id, 80),
    userId: cleanText(row.user_id, 120),
    rating,
    title: cleanText(row.title, 80),
    body: cleanText(row.body, 500),
    createdAt: cleanText(row.created_at, 64),
    updatedAt: cleanText(row.updated_at, 64),
  };
}

function stableNumericId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return Number(hash || 1);
}

function readLegacyReviewMap(data: Json | null | undefined): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const source = data as Record<string, unknown>;
  const reviews = source.shopReviews;
  if (!reviews || typeof reviews !== "object" || Array.isArray(reviews)) return {};
  return reviews as Record<string, unknown>;
}

function fromLegacyEntry(userId: string, productId: string, raw: unknown): ShopReviewRecord | null {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!source) return null;
  const rating = toRating(source.rating);
  if (!rating) return null;
  const createdAt = cleanText(source.createdAt, 64) || new Date().toISOString();
  const updatedAt = cleanText(source.updatedAt, 64) || createdAt;
  return {
    id: stableNumericId(`${userId}:${productId}`),
    productId: cleanText(productId, 80),
    userId: cleanText(userId, 120),
    rating,
    title: cleanText(source.title, 80),
    body: cleanText(source.body, 500),
    createdAt,
    updatedAt,
  };
}

async function listLegacyShopReviewsForProduct(productId: string) {
  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await admin.from("ai_content").select("user_id, data");
    if (error) throw error;

    const reviews = (data ?? [])
      .map((row) => fromLegacyEntry(row.user_id, productId, readLegacyReviewMap(row.data as Json)[productId]))
      .filter((row): row is ShopReviewRecord => Boolean(row))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

    return reviews;
  } catch {
    return [];
  }
}

async function upsertLegacyShopReview(input: {
  productId: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
}) {
  const rating = toRating(input.rating);
  const productId = cleanText(input.productId, 80);
  const userId = cleanText(input.userId, 120);
  const title = cleanText(input.title, 80);
  const body = cleanText(input.body, 500);

  if (!productId || !userId || !rating || !body) {
    throw new Error("invalid_shop_review");
  }

  await ensureUserRow(userId);
  const existing = await loadAIContent(userId).catch(() => null);
  const currentData =
    existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data) ? ({ ...existing.data } as Record<string, Json>) : {};
  const currentReviewMap = readLegacyReviewMap(currentData as Json);
  const previous = currentReviewMap[productId] && typeof currentReviewMap[productId] === "object"
    ? (currentReviewMap[productId] as Record<string, unknown>)
    : null;
  const createdAt = cleanText(previous?.createdAt, 64) || new Date().toISOString();
  const updatedAt = new Date().toISOString();

  const nextData: Record<string, Json> = {
    ...currentData,
    shopReviews: {
      ...currentReviewMap,
      [productId]: {
        rating,
        title,
        body,
        createdAt,
        updatedAt,
      } as Json,
    } as Json,
  };

  await saveAIContent({
    userId,
    dateISO: existing?.dateISO ?? todayISO(),
    language: existing?.language ?? "ko",
    data: nextData as Json,
  });

  return fromLegacyEntry(userId, productId, (nextData.shopReviews as Record<string, unknown>)[productId]);
}

export async function listShopReviewsForProduct(productId: string) {
  const admin = getSupabaseAdmin();
  try {
    const { data, error } = await admin
      .from("shop_reviews")
      .select("*")
      .eq("product_id", cleanText(productId, 80))
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) throw error;
    const reviews = (data ?? []).map((row) => fromRow(row)).filter((row): row is ShopReviewRecord => Boolean(row));
    return reviews;
  } catch (error) {
    if (isMissingTableError(error)) return listLegacyShopReviewsForProduct(productId);
    throw error;
  }
}

export function summarizeShopReviews(reviews: ShopReviewRecord[]): ShopReviewSummary {
  if (reviews.length === 0) return { count: 0, averageRating: 0 };
  const total = reviews.reduce((sum, item) => sum + item.rating, 0);
  return {
    count: reviews.length,
    averageRating: Math.round((total / reviews.length) * 10) / 10,
  };
}

export async function upsertShopReview(input: {
  productId: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
}) {
  const admin = getSupabaseAdmin();
  const rating = toRating(input.rating);
  const productId = cleanText(input.productId, 80);
  const userId = cleanText(input.userId, 120);
  const title = cleanText(input.title, 80);
  const body = cleanText(input.body, 500);

  if (!productId || !userId || !rating || !body) {
    throw new Error("invalid_shop_review");
  }

  const { data, error } = await admin
    .from("shop_reviews")
    .upsert(
      {
        product_id: productId,
        user_id: userId,
        rating,
        title,
        body,
      },
      { onConflict: "product_id,user_id" }
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      try {
        return await upsertLegacyShopReview({
          productId,
          userId,
          rating,
          title,
          body,
        });
      } catch (legacyError: any) {
        const legacyMessage = String(legacyError?.message ?? "");
        if (legacyMessage === "invalid_shop_review") throw legacyError;
        throw new Error("shop_review_storage_unavailable");
      }
    }
    throw error;
  }

  return fromRow(data) ?? null;
}
