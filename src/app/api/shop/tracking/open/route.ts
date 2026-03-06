import { NextResponse } from "next/server";
import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { readShopOrderForUser } from "@/lib/server/shopOrderStore";

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

  // 외부 추적 URL은 API 키 파라미터를 포함할 수 있어 직접 리다이렉트를 차단합니다.
  // 사용자는 주문 상세(동일 계정 세션)에서 서버 프록시된 배송 상태를 확인합니다.
  const detailUrl = new URL(`/shop/orders/${encodeURIComponent(order.orderId)}`, req.url);
  detailUrl.searchParams.set("tracking", "1");
  return NextResponse.redirect(detailUrl, { status: 302 });
}
