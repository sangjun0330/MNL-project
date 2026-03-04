import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { calculateShopShippingFee } from "@/lib/shop";
import { buildShopShippingVerificationValue, isCompleteShopShippingProfile } from "@/lib/shopProfile";
import { loadShopCart } from "@/lib/server/shopCartStore";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import {
  buildShopOrderId,
  countRecentReadyShopOrdersByUser,
  countReservedShopQuantityForProduct,
  createShopOrder,
  markShopOrderCanceled,
  markShopOrderFailed,
  type ShopOrderRecord,
} from "@/lib/server/shopOrderStore";
import { createShopOrderBundle } from "@/lib/server/shopOrderBundleStore";
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

function sanitizeProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const productId = String(item ?? "").trim().slice(0, 80);
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    ids.push(productId);
    if (ids.length >= 30) break;
  }
  return ids;
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

  const selectedProductIds = sanitizeProductIds(body?.productIds);
  const shippingAddressId =
    typeof body?.shippingAddressId === "string" && body.shippingAddressId.trim() ? String(body.shippingAddressId).trim() : null;
  const verification =
    body?.verification && typeof body.verification === "object" && body.verification !== null
      ? (body.verification as Record<string, unknown>)
      : {};
  const shippingVerificationValue =
    typeof body?.shippingVerificationValue === "string" ? String(body.shippingVerificationValue).trim() : "";

  const createdOrderIds: string[] = [];

  try {
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

    const cartItems = await loadShopCart(userId);
    if (cartItems.length === 0) return jsonNoStore({ ok: false, error: "empty_shop_cart" }, { status: 400 });

    const checkoutItems = selectedProductIds.length > 0
      ? cartItems.filter((item) => selectedProductIds.includes(item.productId))
      : cartItems;
    if (checkoutItems.length === 0) {
      return jsonNoStore({ ok: false, error: "empty_shop_cart_selection" }, { status: 400 });
    }
    if (selectedProductIds.length > 0 && checkoutItems.length !== selectedProductIds.length) {
      return jsonNoStore({ ok: false, error: "invalid_cart_selection" }, { status: 400 });
    }

    const readyCount = await countRecentReadyShopOrdersByUser(userId);
    if (readyCount + checkoutItems.length > 12) {
      return jsonNoStore({ ok: false, error: "too_many_pending_shop_orders" }, { status: 429 });
    }

    const catalog = await loadShopCatalog();
    const productMap = new Map(catalog.map((item) => [item.id, item]));
    const checkoutLines: Array<{
      productId: string;
      name: string;
      quantity: number;
      unitPriceKrw: number;
      subtotalKrw: number;
    }> = [];

    for (const cartItem of checkoutItems) {
      const product = productMap.get(cartItem.productId);
      if (!product) return jsonNoStore({ ok: false, error: "shop_product_not_found" }, { status: 404 });
      if (product.outOfStock) {
        return jsonNoStore({ ok: false, error: "shop_product_out_of_stock" }, { status: 409 });
      }
      if (!product.checkoutEnabled || !product.priceKrw || product.priceKrw <= 0) {
        return jsonNoStore({ ok: false, error: "shop_checkout_disabled" }, { status: 400 });
      }
      const quantity = Math.max(1, Math.min(9, Math.round(Number(cartItem.quantity) || 1)));
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
              data: { remainingStock, productId: product.id },
            },
            { status: 409 }
          );
        }
      }

      const unitPriceKrw = Math.max(0, Math.round(Number(product.priceKrw) || 0));
      checkoutLines.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPriceKrw,
        subtotalKrw: unitPriceKrw * quantity,
      });
    }

    const subtotalKrw = checkoutLines.reduce((sum, item) => sum + item.subtotalKrw, 0);
    if (subtotalKrw <= 0) return jsonNoStore({ ok: false, error: "empty_shop_cart_selection" }, { status: 400 });
    const shippingFeeKrw = calculateShopShippingFee(subtotalKrw);
    const amount = subtotalKrw + shippingFeeKrw;
    const bundleId = buildShopOrderId("cart");
    const origin = resolveOrigin(req);
    if (!origin) return jsonNoStore({ ok: false, error: "invalid_origin" }, { status: 500 });

    const shippingSnapshot = buildShopShippingSnapshot(shippingProfile);
    const createdOrders: ShopOrderRecord[] = [];

    for (const [index, line] of checkoutLines.entries()) {
      const product = productMap.get(line.productId);
      if (!product) continue;
      const order = await createShopOrder({
        orderId: buildShopOrderId(line.productId),
        userId,
        product,
        quantity: line.quantity,
        shipping: shippingSnapshot,
        amountOverrideKrw: line.subtotalKrw + (index === 0 ? shippingFeeKrw : 0),
      });
      createdOrders.push(order);
      createdOrderIds.push(order.orderId);
    }

    // BUG-01: Check-Act-Verify — 주문 생성 후 재고를 재검증하여 동시 요청에 의한 초과 판매 방지
    for (const order of createdOrders) {
      const product = productMap.get(order.productId);
      if (!product || typeof product.stockCount !== "number") continue;
      const totalReserved = await countReservedShopQuantityForProduct(order.productId);
      if (totalReserved > product.stockCount) {
        // 생성된 모든 주문을 취소하고 에러 반환
        await Promise.all(
          createdOrderIds.map((id) =>
            markShopOrderCanceled({
              orderId: id,
              code: "out_of_stock_after_reserve",
              message: "재고 부족으로 주문이 자동 취소되었습니다.",
            }).catch(() => undefined)
          )
        );
        return jsonNoStore(
          { ok: false, error: "shop_product_out_of_stock", data: { productId: order.productId } },
          { status: 409 }
        );
      }
    }

    const bundle = await createShopOrderBundle({
      bundleId,
      userId,
      subtotalKrw,
      shippingFeeKrw,
      items: createdOrders.map((order) => ({
        orderId: order.orderId,
        productId: order.productId,
        name: order.productSnapshot.name,
        quantity: order.productSnapshot.quantity,
        unitPriceKrw: order.productSnapshot.priceKrw,
        amountKrw: order.amount,
      })),
      shipping: shippingSnapshot,
    });

    const customer = await readCustomer(req);
    const firstItemName = checkoutLines[0]?.name ?? "장바구니 상품";
    const orderName = checkoutLines.length <= 1 ? firstItemName : `${firstItemName} 외 ${checkoutLines.length - 1}건`;

    return jsonNoStore({
      ok: true,
      data: {
        orderId: bundle.bundleId,
        orderName,
        amount,
        subtotalKrw,
        shippingFeeKrw,
        itemCount: bundle.itemCount,
        totalQuantity: bundle.totalQuantity,
        currency: "KRW",
        clientKey: client.clientKey,
        customerKey: `shop_${userId}`.slice(0, 50),
        customerEmail: customer.email,
        customerName: customer.name,
        successUrl: `${origin}/shop/success`,
        failUrl: `${origin}/shop/fail`,
      },
    });
  } catch (error: any) {
    if (createdOrderIds.length > 0) {
      await Promise.all(
        createdOrderIds.map((orderId) =>
          markShopOrderFailed({
            orderId,
            code: "bundle_setup_failed",
            message: "장바구니 묶음 주문 생성 중 롤백되었습니다.",
          }).catch(() => undefined)
        )
      );
    }

    const message = String(error?.message ?? "failed_to_create_shop_bundle_order");
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
    if (message === "invalid_shop_order_bundle") {
      return jsonNoStore({ ok: false, error: "invalid_shop_order_bundle" }, { status: 400 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_create_shop_bundle_order" }, { status: 500 });
  }
}
