/**
 * 배송 추적 서버사이드 프록시
 *
 * SweetTracker API 키를 클라이언트에 노출하지 않고
 * 서버에서 추적 정보를 조회하여 결과만 반환합니다.
 *
 * GET /api/shop/tracking?orderId=<orderId>
 *
 * 인증된 사용자 본인의 주문에 대한 추적 정보만 조회 가능합니다.
 * 응답: { ok: true, data: { statusLabel, lastEventAt, trackingUrl, delivered } }
 */

import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { readShopOrderForUser } from "@/lib/server/shopOrderStore";
import { fetchSweetTrackerTracking, shouldPollSweetTracker } from "@/lib/server/sweetTracker";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitize(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const url = new URL(req.url);
  const orderId = sanitize(url.searchParams.get("orderId"));
  const force = url.searchParams.get("force") === "1";

  if (!orderId) return jsonNoStore({ ok: false, error: "missing_order_id" }, { status: 400 });

  let order;
  try {
    order = await readShopOrderForUser(userId, orderId);
  } catch {
    order = null;
  }

  if (!order) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
  if (order.status !== "SHIPPED") {
    return jsonNoStore({ ok: false, error: "order_not_in_transit" }, { status: 400 });
  }

  const meta = order.shipping.smartTracker;
  if (!shouldPollSweetTracker(meta, force)) {
    // 폴링 불필요 시 캐시된 정보 반환
    return jsonNoStore({
      ok: true,
      data: {
        statusLabel: meta?.lastStatusLabel ?? null,
        lastEventAt: meta?.lastEventAt ?? null,
        delivered: false,
        cached: true,
      },
    });
  }

  const result = await fetchSweetTrackerTracking({
    carrierCode: meta?.carrierCode ?? null,
    trackingNumber: order.trackingNumber,
  });

  if (!result.ok) {
    return jsonNoStore({
      ok: true,
      data: {
        statusLabel: meta?.lastStatusLabel ?? "조회 불가",
        lastEventAt: meta?.lastEventAt ?? null,
        delivered: false,
        error: result.reason,
      },
    });
  }

  return jsonNoStore({
    ok: true,
    data: {
      statusLabel: result.statusLabel,
      lastEventAt: result.lastEventAt,
      delivered: result.delivered,
      cached: false,
    },
  });
}
