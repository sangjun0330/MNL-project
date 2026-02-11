import { NextResponse } from "next/server";
import { asCheckoutPlanTier, getPlanDefinition } from "@/lib/billing/plans";
import { createBillingOrder, createCustomerKey } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function buildOrderId(plan: "basic" | "pro") {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `wnl_${plan}_${stamp}_${rand}`.slice(0, 64);
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

  const clientKey = String(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "").trim();
  if (!clientKey) return bad(500, "missing_toss_client_key");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const planTier = asCheckoutPlanTier(body?.plan);
  if (!planTier) return bad(400, "invalid_plan");

  const plan = getPlanDefinition(planTier);
  const orderId = buildOrderId(planTier);

  try {
    await createBillingOrder({
      userId,
      orderId,
      planTier,
      amount: plan.priceKrw,
      currency: "KRW",
      orderName: plan.orderName,
    });
  } catch (error: any) {
    return bad(500, error?.message || "failed_to_create_order");
  }

  const origin = resolveOrigin(req);
  if (!origin) return bad(500, "invalid_origin");

  const customer = await readCustomer(req);

  return NextResponse.json({
    ok: true,
    data: {
      planTier,
      orderId,
      orderName: plan.orderName,
      amount: plan.priceKrw,
      currency: "KRW",
      customerKey: createCustomerKey(userId),
      customerEmail: customer.email,
      customerName: customer.name,
      clientKey,
      successUrl: `${origin}/settings/billing/success`,
      failUrl: `${origin}/settings/billing/fail`,
    },
  });
}
