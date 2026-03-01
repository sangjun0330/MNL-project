import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";
import { buildShopOrderId, createShopOrder } from "@/lib/server/shopOrderStore";
import { readTossClientKeyFromEnv, readTossSecretKeyFromEnv } from "@/lib/server/tossConfig";

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
    return {
      email: data.user?.email ?? null,
      name: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
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
  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) return jsonNoStore({ ok: false, error: secret.error }, { status: 500 });
  if (client.mode !== secret.mode) return jsonNoStore({ ok: false, error: "toss_key_mode_mismatch" }, { status: 500 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const productId = String(body?.productId ?? "").trim();
  const quantity = Math.max(1, Math.min(9, Math.round(Number(body?.quantity) || 1)));
  if (!productId) return jsonNoStore({ ok: false, error: "invalid_product_id" }, { status: 400 });

  try {
    const catalog = await loadShopCatalog();
    const product = catalog.find((item) => item.id === productId);
    if (!product) return jsonNoStore({ ok: false, error: "shop_product_not_found" }, { status: 404 });
    if (!product.checkoutEnabled || !product.priceKrw || product.priceKrw <= 0) {
      return jsonNoStore({ ok: false, error: "shop_checkout_disabled" }, { status: 400 });
    }

    const orderId = buildShopOrderId(product.id);
    const customer = await readCustomer(req);
    const order = await createShopOrder({
      orderId,
      userId,
      product,
      quantity,
      customerEmail: customer.email,
      customerName: customer.name,
    });
    const origin = resolveOrigin(req);
    if (!origin) return jsonNoStore({ ok: false, error: "invalid_origin" }, { status: 500 });

    return jsonNoStore({
      ok: true,
      data: {
        orderId: order.orderId,
        orderName: product.name,
        amount: order.amount,
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
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_create_shop_order" }, { status: 500 });
  }
}
