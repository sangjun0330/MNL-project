import { NextResponse } from "next/server";
import { listRecentBillingOrders, readSubscription } from "@/lib/server/billingStore";
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
    const [subscription, orders] = await Promise.all([
      readSubscription(userId),
      listRecentBillingOrders(userId, 12),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        subscription,
        orders,
      },
    });
  } catch (error: any) {
    return bad(500, error?.message || "failed_to_read_subscription");
  }
}
