import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { toAdminShopClaimSummary } from "@/lib/server/shopClaimPresenter";
import {
  completeShopRefundClaimByAdmin,
  getShopClaimLinkedOrder,
  markShopClaimReturnReceivedByAdmin,
  markShopExchangeClaimShippedByAdmin,
  reviewShopClaimByAdmin,
} from "@/lib/server/shopClaimStore";
import { toShopAdminOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function readClaimIdFromContext(ctx: any) {
  const params = await Promise.resolve(ctx?.params);
  return String(params?.claimId ?? "").trim();
}

export async function PATCH(req: Request, ctx: any) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  const claimId = await readClaimIdFromContext(ctx);
  if (!claimId) return jsonNoStore({ ok: false, error: "invalid_claim_id" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body?.action ?? "").trim();
  const note = String(body?.note ?? "").trim() || null;

  try {
    if (action === "approve" || action === "reject") {
      await reviewShopClaimByAdmin({
        claimId,
        adminUserId: admin.identity.userId,
        action,
        note,
      });
    } else if (action === "mark_return_received") {
      await markShopClaimReturnReceivedByAdmin({
        claimId,
        adminUserId: admin.identity.userId,
        note,
      });
    } else if (action === "complete_refund") {
      await completeShopRefundClaimByAdmin({
        claimId,
        adminUserId: admin.identity.userId,
        note,
        requestAcceptLanguage: req.headers.get("accept-language"),
      });
    } else if (action === "ship_exchange") {
      const courier = String(body?.courier ?? "").trim();
      const trackingNumber = String(body?.trackingNumber ?? "").trim();
      if (!courier || !trackingNumber) {
        return jsonNoStore({ ok: false, error: "invalid_shop_claim_input" }, { status: 400 });
      }
      await markShopExchangeClaimShippedByAdmin({
        claimId,
        adminUserId: admin.identity.userId,
        courier,
        trackingNumber,
        note,
      });
    } else {
      return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });
    }

    const linked = await getShopClaimLinkedOrder({ claimId });
    if (!linked.claim) {
      return jsonNoStore({ ok: false, error: "shop_claim_not_found" }, { status: 404 });
    }
    return jsonNoStore({
      ok: true,
      data: {
        claim: toAdminShopClaimSummary(linked.claim, linked.order ? toShopAdminOrderSummary(linked.order) : null),
        order: linked.order ? toShopAdminOrderSummary(linked.order) : null,
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_update_shop_claim");
    if (message.includes("not_found")) return jsonNoStore({ ok: false, error: "shop_claim_not_found" }, { status: 404 });
    if (message.includes("not_reviewable")) return jsonNoStore({ ok: false, error: "shop_claim_not_reviewable" }, { status: 400 });
    if (message.includes("return_not_shipped")) {
      return jsonNoStore({ ok: false, error: "shop_claim_return_not_shipped" }, { status: 400 });
    }
    if (message.includes("refund_not_ready")) {
      return jsonNoStore({ ok: false, error: "shop_claim_refund_not_ready" }, { status: 400 });
    }
    if (message.includes("exchange_not_ready")) {
      return jsonNoStore({ ok: false, error: "shop_claim_exchange_not_ready" }, { status: 400 });
    }
    if (message.includes("not_refund")) return jsonNoStore({ ok: false, error: "shop_claim_not_refund" }, { status: 400 });
    if (message.includes("not_exchange")) return jsonNoStore({ ok: false, error: "shop_claim_not_exchange" }, { status: 400 });
    if (message.includes("toss_")) return jsonNoStore({ ok: false, error: message }, { status: 400 });
    if (message === "shop_claim_storage_unavailable") {
      return jsonNoStore({ ok: false, error: "shop_claim_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_update_shop_claim" }, { status: 500 });
  }
}
