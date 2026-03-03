import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import { listVerifiedShopReviewerIdsForProduct } from "@/lib/server/shopOrderStore";
import { listShopReviewsForProduct, summarizeShopReviews, upsertShopReview } from "@/lib/server/shopReviewStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeProductId(value: string | null) {
  return String(value ?? "").trim().slice(0, 80);
}

function maskReviewer(userId: string) {
  const safe = String(userId ?? "").trim();
  if (!safe) return "회원님";
  if (safe.length <= 4) return `${safe.slice(0, 1)}**님`;
  return `${safe.slice(0, 2)}**님`;
}

async function toPublicReviews(productId: string) {
  const [reviews, verifiedIds] = await Promise.all([
    listShopReviewsForProduct(productId),
    listVerifiedShopReviewerIdsForProduct(productId),
  ]);
  return reviews.map((review) => ({
    id: review.id,
    productId: review.productId,
    rating: review.rating,
    title: review.title,
    body: review.body,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    authorLabel: maskReviewer(review.userId),
    verifiedPurchase: verifiedIds.has(review.userId),
  }));
}

export async function GET(req: Request) {
  const productId = sanitizeProductId(new URL(req.url).searchParams.get("productId"));
  if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

  try {
    const reviews = await toPublicReviews(productId);
    const summary = summarizeShopReviews(reviews);
    return jsonNoStore({ ok: true, data: { reviews, summary } });
  } catch {
    return jsonNoStore({ ok: true, data: { reviews: [], summary: { count: 0, averageRating: 0 }, degraded: true } });
  }
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const productId = sanitizeProductId(body?.productId);
    const catalog = await loadShopCatalog();
    if (!catalog.some((item) => item.id === productId)) {
      return jsonNoStore({ ok: false, error: "shop_product_not_found" }, { status: 404 });
    }

    const savedReview = await upsertShopReview({
      productId,
      userId,
      rating: Number(body?.rating),
      title: String(body?.title ?? ""),
      body: String(body?.body ?? ""),
    });
    const reviews = await toPublicReviews(productId);
    const summary = summarizeShopReviews(reviews);
    const publicReview = savedReview
      ? {
          id: savedReview.id,
          productId: savedReview.productId,
          rating: savedReview.rating,
          title: savedReview.title,
          body: savedReview.body,
          createdAt: savedReview.createdAt,
          updatedAt: savedReview.updatedAt,
          authorLabel: maskReviewer(savedReview.userId),
          verifiedPurchase: reviews.some((item) => item.id === savedReview.id && item.verifiedPurchase),
        }
      : null;
    return jsonNoStore({ ok: true, data: { review: publicReview, reviews, summary } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_save_shop_review");
    if (message === "invalid_shop_review") {
      return jsonNoStore({ ok: false, error: "invalid_shop_review" }, { status: 400 });
    }
    if (message === "shop_review_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_review_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_save_shop_review" }, { status: 500 });
  }
}
