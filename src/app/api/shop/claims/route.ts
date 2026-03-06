import { createShopClaim, listShopClaimsForUser, type ShopClaimType } from "@/lib/server/shopClaimStore";
import { toUserShopClaimSummary } from "@/lib/server/shopClaimPresenter";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLimit(value: string | null): number {
  const n = Number(value ?? "20");
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(80, Math.round(n)));
}

function toClaimType(value: unknown): ShopClaimType | null {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "REFUND") return "REFUND";
  if (text === "EXCHANGE") return "EXCHANGE";
  return null;
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const orderId = String(params.get("orderId") ?? "").trim() || null;
  const limit = toLimit(params.get("limit"));

  try {
    const claims = await listShopClaimsForUser(userId, {
      orderId,
      limit,
    });
    return jsonNoStore({ ok: true, data: { claims: claims.map(toUserShopClaimSummary) } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_list_shop_claims");
    if (message === "shop_claim_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_claim_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_list_shop_claims" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const orderId = String(body?.orderId ?? "").trim();
  const claimType = toClaimType(body?.claimType);
  const reason = String(body?.reason ?? "").trim();
  const detail = String(body?.detail ?? "").trim() || null;
  if (!orderId || !claimType) {
    return jsonNoStore({ ok: false, error: "invalid_shop_claim_input" }, { status: 400 });
  }

  try {
    const claim = await createShopClaim({
      userId,
      orderId,
      claimType,
      reason,
      detail,
    });
    return jsonNoStore({ ok: true, data: { claim: toUserShopClaimSummary(claim) } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_create_shop_claim");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_order_not_found" }, { status: 404 });
    if (message.includes("reason_required")) {
      return jsonNoStore({ ok: false, error: "shop_claim_reason_required" }, { status: 400 });
    }
    if (message.includes("already_open")) return jsonNoStore({ ok: false, error: "shop_claim_already_open" }, { status: 409 });
    if (message.includes("window_expired")) return jsonNoStore({ ok: false, error: "shop_claim_window_expired" }, { status: 400 });
    if (message.includes("not_eligible")) return jsonNoStore({ ok: false, error: "shop_claim_not_eligible" }, { status: 400 });
    if (message.includes("already_refunded")) return jsonNoStore({ ok: false, error: "shop_order_already_refunded" }, { status: 409 });
    if (message.includes("not_refundable")) return jsonNoStore({ ok: false, error: "shop_order_not_refundable" }, { status: 400 });
    if (message === "shop_claim_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_claim_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_create_shop_claim" }, { status: 500 });
  }
}
