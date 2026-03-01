import { jsonNoStore } from "@/lib/server/requestSecurity";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { listShopOrdersForAdmin, toShopAdminOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLimit(value: string | null): number {
  const n = Number(value ?? "40");
  if (!Number.isFinite(n)) return 40;
  return Math.max(1, Math.min(80, Math.round(n)));
}

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return jsonNoStore({ ok: false, error: admin.error }, { status: admin.status });

  const limit = toLimit(new URL(req.url).searchParams.get("limit"));
  try {
    const orders = (await listShopOrdersForAdmin(limit)).map(toShopAdminOrderSummary);
    return jsonNoStore({ ok: true, data: { orders } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_list_admin_shop_orders" }, { status: 500 });
  }
}
