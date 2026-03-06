import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { toUserShopClaimSummary } from "@/lib/server/shopClaimPresenter";
import { submitShopClaimReturnShipmentByUser } from "@/lib/server/shopClaimStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readClaimIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.claimId ?? "").trim();
}

export async function POST(req: Request, ctx: any) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const claimId = await readClaimIdFromContext(ctx);
  if (!claimId) return jsonNoStore({ ok: false, error: "invalid_claim_id" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const courier = String(body?.courier ?? "").trim();
  const trackingNumber = String(body?.trackingNumber ?? "").trim();
  if (!courier || !trackingNumber) {
    return jsonNoStore({ ok: false, error: "invalid_shop_claim_input" }, { status: 400 });
  }

  try {
    const claim = await submitShopClaimReturnShipmentByUser({
      userId,
      claimId,
      courier,
      trackingNumber,
    });
    return jsonNoStore({ ok: true, data: { claim: toUserShopClaimSummary(claim) } });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_submit_shop_claim_return");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_claim_not_found" }, { status: 404 });
    if (message.includes("return_not_allowed")) {
      return jsonNoStore({ ok: false, error: "shop_claim_return_not_allowed" }, { status: 400 });
    }
    if (message.includes("shop_claim_storage_unavailable")) {
      return jsonNoStore({ ok: false, error: "shop_claim_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_submit_shop_claim_return" }, { status: 500 });
  }
}
