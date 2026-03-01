import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { Database } from "@/types/supabase";

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
  return code === "42P01" || (message.includes("relation") && message.includes("shop_reviews"));
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
    if (isMissingTableError(error)) return [];
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
    if (isMissingTableError(error)) throw new Error("shop_review_storage_unavailable");
    throw error;
  }

  return fromRow(data) ?? null;
}

