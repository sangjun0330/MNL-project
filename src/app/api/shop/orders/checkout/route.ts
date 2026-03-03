import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { calculateShopPricing } from "@/lib/shop";
import { buildShopShippingVerificationValue, isCompleteShopShippingProfile } from "@/lib/shopProfile";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import {
  buildShopOrderId,
  countRecentReadyShopOrdersByUser,
  countReservedShopQuantityForProduct,
  createShopOrder,
} from "@/lib/server/shopOrderStore";
import { buildShopShippingSnapshot, resolveShopShippingProfileFromBook } from "@/lib/server/shopProfileStore";
import { readTossClientKeyFromEnv } from "@/lib/server/tossConfig";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function resolveOrigin(req: Request) {
  try {
    return new URL(req.url).origin;
  } catch {
    const raw = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
    if (!raw) return "";
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  }
}

async function readCustomer(req: Request) {
  try {
    const supabase = await getRouteSupabaseClient();
    const bearer = req.headers.get("authorization") ?? "";
    const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
    const { data } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
    const email = String(data.user?.email ?? "").trim().slice(0, 160);
    const name = String((data.user?.user_metadata?.full_name as string | undefined) ?? "").trim().slice(0, 80);
    return {
      email: email || null,
      name: name || null,
    };
  } catch {
    return { email: null, name: null };
  }
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const client = readTossClientKeyFromEnv();
  if (!client.ok) return jsonNoStore({ ok: false, error: client.error }, { status: 500 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const productId = String(body?.productId ?? "").trim();
  const quantity = Math.max(1, Math.min(9, Math.round(Number(body?.quantity) || 1)));
  const shippingAddressId =
    typeof body?.shippingAddressId === "string" && body.shippingAddressId.trim() ? String(body.shippingAddressId).trim() : null;
  const verification =
    body?.verification && typeof body.verification === "object" && body.verification !== null
      ? (body.verification as Record<string, unknown>)
      : {};
  const shippingVerificationValue =
    typeof body?.shippingVerificationValue === "string" ? String(body.shippingVerificationValue).trim() : "";
  if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

  try {
    const readyCount = await countRecentReadyShopOrdersByUser(userId);
    if (readyCount >= 3) {
      return jsonNoStore({ ok: false, error: "too_many_pending_shop_orders" }, { status: 429 });
    }

    const catalog = await loadShopCatalog();
    const product = catalog.find((item) => item.id === productId);
    if (!product) return jsonNoStore({ ok: false, error: "shop_product_not_found" }, { status: 404 });
    if (product.outOfStock) {
      return jsonNoStore({ ok: false, error: "shop_product_out_of_stock" }, { status: 409 });
    }
    if (typeof product.stockCount === "number") {
      const reservedQuantity = await countReservedShopQuantityForProduct(product.id);
      const remainingStock = Math.max(0, product.stockCount - reservedQuantity);
      if (remainingStock <= 0) {
        return jsonNoStore({ ok: false, error: "shop_product_out_of_stock" }, { status: 409 });
      }
      if (quantity > remainingStock) {
        return jsonNoStore(
          {
            ok: false,
            error: "shop_product_insufficient_stock",
            data: { remainingStock },
          },
          { status: 409 }
        );
      }
    }
    if (!product.checkoutEnabled || !product.priceKrw || product.priceKrw <= 0) {
      return jsonNoStore({ ok: false, error: "shop_checkout_disabled" }, { status: 400 });
    }

    const shippingProfile = await resolveShopShippingProfileFromBook(userId, shippingAddressId);
    if (!isCompleteShopShippingProfile(shippingProfile)) {
      return jsonNoStore(
        { ok: false, error: shippingAddressId ? "invalid_shipping_address" : "missing_shipping_address" },
        { status: 400 }
      );
    }
    if (!verification.shippingConfirmed || !verification.contactConfirmed) {
      return jsonNoStore({ ok: false, error: "shop_checkout_verification_required" }, { status: 400 });
    }
    if (!shippingVerificationValue || shippingVerificationValue !== buildShopShippingVerificationValue(shippingProfile)) {
      return jsonNoStore({ ok: false, error: "shop_checkout_verification_mismatch" }, { status: 409 });
    }

    const origin = resolveOrigin(req);
    if (!origin) return jsonNoStore({ ok: false, error: "invalid_origin" }, { status: 500 });

    const orderId = buildShopOrderId(product.id);
    const customer = await readCustomer(req);
    const pricing = calculateShopPricing({
      priceKrw: product.priceKrw,
      quantity,
    });
    const order = await createShopOrder({
      orderId,
      userId,
      product,
      quantity,
      shipping: buildShopShippingSnapshot(shippingProfile),
    });

    return jsonNoStore({
      ok: true,
      data: {
        orderId: order.orderId,
        orderName: product.name,
        amount: pricing.totalKrw,
        subtotalKrw: pricing.subtotalKrw,
        shippingFeeKrw: pricing.shippingFeeKrw,
        currency: "KRW",
        quantity,
        clientKey: client.clientKey,
        customerKey: `shop_${userId}`.slice(0, 50),
        customerEmail: customer.email,
        customerName: customer.name,
        successUrl: `${origin}/shop/success`,
        failUrl: `${origin}/shop/fail`,
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_create_shop_order");
    if (message === "shop_profile_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_profile_storage_unavailable" }, { status: 503 });
    }
    if (message === "shop_order_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_order_storage_unavailable" }, { status: 503 });
    }
    if (
      message.toLowerCase().includes("supabase admin env missing") ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("shop_orders") ||
      message.toLowerCase().includes("shop_customer_profiles") ||
      message.toLowerCase().includes("rnest_user_state") ||
      message.toLowerCase().includes("rnest_users") ||
      message.toLowerCase().includes("ai_content") ||
      message.toLowerCase().includes("foreign key")
    ) {
      return jsonNoStore({ ok: false, error: "shop_order_storage_unavailable" }, { status: 503 });
    }
    if (message.includes("missing_toss_client_key") || message.includes("invalid_toss_client_key")) {
      return jsonNoStore({ ok: false, error: "missing_toss_client_key" }, { status: 500 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_create_shop_order" }, { status: 500 });
  }
}
