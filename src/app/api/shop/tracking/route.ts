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
import { resolveSweetTrackerCarrierCode } from "@/lib/shopShipping";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { readShopOrderForUser, syncShopOrderTrackingFromSnapshot } from "@/lib/server/shopOrderStore";
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
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) return jsonNoStore({ ok: false, error: "invalid_order_id" }, { status: 400 });

  let order;
  try {
    order = await readShopOrderForUser(userId, orderId);
  } catch {
    order = null;
  }

  if (!order) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });

  const meta = order.shipping.smartTracker;
  const resolvedCarrierCode = resolveSweetTrackerCarrierCode({
    carrierCode: meta?.carrierCode ?? null,
    courier: order.courier,
  });
  if (!order.trackingNumber || !resolvedCarrierCode) {
    return jsonNoStore({ ok: false, error: "tracking_not_available" }, { status: 400 });
  }

  const buildCachedPayload = (currentOrder: typeof order, cached: boolean, error?: string | null, statusLabel?: string | null) => ({
    statusLabel:
      statusLabel ??
      currentOrder.shipping.smartTracker?.lastStatusLabel ??
      (currentOrder.status === "DELIVERED" ? "배송완료" : currentOrder.status === "SHIPPED" ? "배송 조회중" : null),
    lastEventAt: currentOrder.shipping.smartTracker?.lastEventAt ?? currentOrder.deliveredAt ?? currentOrder.shippedAt ?? null,
    lastPolledAt: currentOrder.shipping.smartTracker?.lastPolledAt ?? null,
    delivered: currentOrder.status === "DELIVERED" || Boolean(currentOrder.deliveredAt),
    trackingUrl: null,
    cached,
    error: error ?? null,
  });

  if (order.status === "DELIVERED") {
    return jsonNoStore({ ok: true, data: buildCachedPayload(order, true) });
  }
  if (order.status !== "SHIPPED") {
    return jsonNoStore({ ok: false, error: "order_not_trackable" }, { status: 400 });
  }
  if (!shouldPollSweetTracker(meta, force)) {
    return jsonNoStore({ ok: true, data: buildCachedPayload(order, true) });
  }

  const result = await fetchSweetTrackerTracking({
    carrierCode: resolvedCarrierCode,
    trackingNumber: order.trackingNumber,
  });

  let persistedOrder = order;
  let persisted = false;
  try {
    persistedOrder = await syncShopOrderTrackingFromSnapshot({
      orderId: order.orderId,
      snapshot: result,
      resolvedCarrierCode,
    });
    persisted = true;
  } catch {
    persistedOrder = order;
  }

  if (!result.ok) {
    const fallbackLabel =
      result.reason === "missing_config"
        ? "배송 조회 준비중"
        : result.reason === "invalid_input"
          ? "연동 정보 확인 필요"
          : result.reason === "not_found"
            ? "조회 불가"
            : null;
    return jsonNoStore({
      ok: true,
      data: buildCachedPayload(persistedOrder, true, result.reason, fallbackLabel),
    });
  }

  if (persisted) {
    return jsonNoStore({
      ok: true,
      data: buildCachedPayload(persistedOrder, false, null, result.statusLabel),
    });
  }

  return jsonNoStore({
    ok: true,
    data: {
      statusLabel: result.statusLabel,
      lastEventAt: result.lastEventAt,
      lastPolledAt: new Date().toISOString(),
      delivered: result.delivered,
      trackingUrl: null,
      cached: false,
      error: null,
    },
  });
}
