import { NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { readShopOrderForUser } from "@/lib/server/shopOrderStore";
import { buildSweetTrackerTrackingUrl } from "@/lib/server/sweetTracker";
import { resolveSweetTrackerCarrierCode } from "@/lib/shopShipping";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitize(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const url = new URL(req.url);
  const orderId = sanitize(url.searchParams.get("orderId"), 80);
  if (!orderId) return jsonNoStore({ ok: false, error: "missing_order_id" }, { status: 400 });

  const order = await readShopOrderForUser(userId, orderId).catch(() => null);
  if (!order) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });

  const carrierCode = resolveSweetTrackerCarrierCode({
    carrierCode: order.shipping.smartTracker?.carrierCode ?? null,
    courier: order.courier,
  });
  const trackingUrl = buildSweetTrackerTrackingUrl({
    carrierCode,
    courier: order.courier,
    trackingNumber: order.trackingNumber,
  });
  if (!trackingUrl) {
    return jsonNoStore({ ok: false, error: "tracking_not_available" }, { status: 400 });
  }

  return NextResponse.redirect(trackingUrl, { status: 302 });
}
