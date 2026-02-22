import { NextResponse } from "next/server";
import { listRecentBillingOrders, readBillingPurchaseSummary, readSubscription } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  try {
    const [subscription, orders, purchaseSummary] = await Promise.all([
      readSubscription(userId),
      listRecentBillingOrders(userId, 12),
      readBillingPurchaseSummary(userId),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        subscription,
        orders,
        purchaseSummary,
      },
    });
  } catch {
    return bad(500, "failed_to_read_subscription");
  }
}
