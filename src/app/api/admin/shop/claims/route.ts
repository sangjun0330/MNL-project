import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { toAdminShopClaimSummary } from "@/lib/server/shopClaimPresenter";
import { jsonNoStore } from "@/lib/server/requestSecurity";
import { listShopClaimsForAdmin } from "@/lib/server/shopClaimStore";
import { readShopOrder, toShopAdminOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLimit(value: string | null): number {
  const n = Number(value ?? "80");
  if (!Number.isFinite(n)) return 80;
  return Math.max(1, Math.min(120, Math.round(n)));
}

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  const limit = toLimit(new URL(req.url).searchParams.get("limit"));
  try {
    const claims = await listShopClaimsForAdmin(limit);
    const orderIds = Array.from(new Set(claims.map((claim) => claim.orderId)));
    const orderEntries = await Promise.all(
      orderIds.map(async (orderId) => {
        const order = await readShopOrder(orderId).catch(() => null);
        return [orderId, order ? toShopAdminOrderSummary(order) : null] as const;
      })
    );
    const ordersById = new Map(orderEntries);
    return jsonNoStore({
      ok: true,
      data: {
        claims: claims.map((claim) => toAdminShopClaimSummary(claim, ordersById.get(claim.orderId) ?? null)),
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? "failed_to_list_admin_shop_claims");
    if (message.includes("shop_claim_storage_unavailable")) {
      return jsonNoStore({ ok: false, error: "shop_claim_storage_unavailable" }, { status: 503 });
    }
    return jsonNoStore({ ok: false, error: "failed_to_list_admin_shop_claims" }, { status: 500 });
  }
}
