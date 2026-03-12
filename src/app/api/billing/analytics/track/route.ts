import { NextResponse } from "next/server";
import { asPlanTier } from "@/lib/billing/plans";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { trackBillingAnalyticsEvent, type BillingAnalyticsEventName } from "@/lib/server/billingStore";
import type { Json } from "@/types/supabase";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set<BillingAnalyticsEventName>([
  "search_mode_selected",
  "credit_pack_viewed",
  "credit_pack_checkout_started",
  "credit_pack_checkout_succeeded",
  "pro_upsell_viewed",
  "pro_upsell_clicked",
  "plan_checkout_started",
  "plan_checkout_succeeded",
]);

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const eventName = String(body?.eventName ?? "").trim() as BillingAnalyticsEventName;
  if (!ALLOWED_EVENTS.has(eventName)) return bad(400, "invalid_event_name");

  try {
    await trackBillingAnalyticsEvent({
      userId,
      eventName,
      planTierSnapshot: asPlanTier(body?.planTierSnapshot) ?? undefined,
      props: (body?.props ?? null) as Json | null,
    });
    return NextResponse.json({ ok: true, data: { tracked: true } });
  } catch {
    return bad(500, "failed_to_track_billing_analytics");
  }
}
