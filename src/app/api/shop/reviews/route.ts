import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import { listShopReviewsForProduct, summarizeShopReviews, upsertShopReview } from "@/lib/server/shopReviewStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeProductId(value: string | null) {
  return String(value ?? "").trim().slice(0, 80);
}

export async function GET(req: Request) {
  const productId = sanitizeProductId(new URL(req.url).searchParams.get("productId"));
  if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

  try {
    const reviews = await listShopReviewsForProduct(productId);
    const summary = summarizeShopReviews(reviews);
    return jsonNoStore({ ok: true, data: { reviews, summary } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_shop_reviews" }, { status: 500 });
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

    const review = await upsertShopReview({
      productId,
      userId,
      rating: Number(body?.rating),
      title: String(body?.title ?? ""),
      body: String(body?.body ?? ""),
    });
    const reviews = await listShopReviewsForProduct(productId);
    const summary = summarizeShopReviews(reviews);
    return jsonNoStore({ ok: true, data: { review, reviews, summary } });
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
