import { NextResponse } from "next/server";
import { asCheckoutProductId, getCheckoutProductDefinition, getPaidPlanRank, type CheckoutProductId, type PlanTier } from "@/lib/billing/plans";
import { sanitizeInternalPath } from "@/lib/navigation";
import { countRecentReadyOrdersByUser, createBillingOrder, createCustomerKey, readSubscription } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";
import { readTossClientKeyFromEnv, readTossSecretKeyFromEnv } from "@/lib/server/tossConfig";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function checkoutCreateOrderError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? "");
  if (message.includes("billing_schema_outdated_search_credit_columns")) return "billing_schema_outdated_search_credit_columns";
  if (message.includes("billing_schema_outdated_credit_pack_columns")) return "billing_schema_outdated_credit_pack_columns";
  if (message.includes("paid_plan_downgrade_not_allowed")) return "paid_plan_downgrade_not_allowed";
  return "failed_to_create_order";
}

function buildOrderId(productId: CheckoutProductId) {
  const stamp = Date.now().toString(36);
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const rand = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `rnest_${productId}_${stamp}_${rand}`.slice(0, 64);
}

function resolveOrigin(req: Request) {
  try {
    const reqOrigin = new URL(req.url).origin;
    if (reqOrigin) return reqOrigin;
  } catch {
    // ignore
  }
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
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
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  // H-7: 1시간 내 READY 주문 5개 초과 시 요청 차단 (결제 API 남용 방지)
  try {
    const readyCount = await countRecentReadyOrdersByUser(userId);
    if (readyCount >= 5) return bad(429, "too_many_pending_orders");
  } catch {
    // 카운트 조회 실패 시 fail-open: 진행 허용
  }

  const client = readTossClientKeyFromEnv();
  if (!client.ok) return bad(500, client.error);

  // Checkout 단계에서 키 짝(테스트/라이브)까지 미리 검증해 운영 오류를 줄입니다.
  const secret = readTossSecretKeyFromEnv();
  if (!secret.ok) return bad(500, secret.error);
  if (client.mode !== secret.mode) return bad(500, "toss_key_mode_mismatch");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const productId = asCheckoutProductId(body?.product ?? body?.plan) ?? "plus";
  const returnTo = sanitizeInternalPath(typeof body?.returnTo === "string" ? body.returnTo : null, "");
  const product = getCheckoutProductDefinition(productId);
  if (!product.checkoutEnabled) return bad(400, "checkout_disabled_product");

  if (product.kind === "subscription" && product.planTier) {
    try {
      const current = await readSubscription(userId);
      if (current.hasPaidAccess && current.tier !== "free") {
        const currentRank = getPaidPlanRank(current.tier);
        const targetRank = getPaidPlanRank(product.planTier);
        if (targetRank < currentRank) {
          return bad(409, "paid_plan_downgrade_not_allowed");
        }
      }
    } catch {
      // fail-open: checkout creation should not be blocked by snapshot read failure
    }
  }

  const orderId = buildOrderId(productId);
  let orderPlanTier: PlanTier = product.planTier ?? "free";
  if (product.kind === "credit_pack") {
    try {
      const current = await readSubscription(userId);
      if (current.tier === "free") {
        return bad(403, "free_plan_credit_pack_not_allowed");
      }
      orderPlanTier = current.tier;
    } catch {
      return bad(500, "failed_to_read_subscription");
    }
  }

  try {
    await createBillingOrder({
      userId,
      orderId,
      planTier: orderPlanTier,
      orderKind: product.kind,
      productId: product.id,
      creditType: product.creditType,
      creditPackUnits: product.creditUnits,
      amount: product.priceKrw,
      currency: "KRW",
      orderName: product.orderName,
    });
  } catch (error) {
    console.error("[billing/checkout] failed to create order", error);
    return bad(500, checkoutCreateOrderError(error));
  }

  const origin = resolveOrigin(req);
  if (!origin) return bad(500, "invalid_origin");

  const customer = await readCustomer(req);

  return NextResponse.json({
    ok: true,
    data: {
      productId,
      orderKind: product.kind,
      creditPackUnits: product.creditUnits,
      orderId,
      orderName: product.orderName,
      amount: product.priceKrw,
      currency: "KRW",
      customerKey: createCustomerKey(userId),
      customerEmail: customer.email,
      customerName: customer.name,
      clientKey: client.clientKey,
      successUrl: `${origin}/settings/billing/success${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
      failUrl: `${origin}/settings/billing/fail${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
    },
  });
}
