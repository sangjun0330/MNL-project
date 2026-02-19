import { NextResponse } from "next/server";
import { markBillingOrderFailed, readBillingOrderByOrderId, removeUnsettledBillingOrder } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function sanitize(value: unknown, fallback: string, size = 220) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.slice(0, size);
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

  const orderId = sanitize(body?.orderId, "", 80);
  const code = sanitize(body?.code, "payment_failed", 80);
  const message = sanitize(body?.message, "Payment failed.", 220);
  if (!orderId) return bad(400, "invalid_order_id");

  try {
    const exists = await readBillingOrderByOrderId({ userId, orderId });
    if (!exists) return bad(404, "order_not_found");

    if (exists.status !== "DONE") {
      await markBillingOrderFailed({
        userId,
        orderId,
        code,
        message,
      });
      await removeUnsettledBillingOrder({
        userId,
        orderId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return bad(500, error?.message || "failed_to_mark_failed");
  }
}
