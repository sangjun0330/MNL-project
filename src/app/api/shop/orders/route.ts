import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { listShopOrdersForUserPage, toShopOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLimit(value: string | null): number {
  const n = Number(value ?? "12");
  if (!Number.isFinite(n)) return 12;
  return Math.max(1, Math.min(50, Math.round(n)));
}

function toOffset(value: string | null): number {
  const n = Number(value ?? "0");
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const limit = toLimit(params.get("limit"));
  const offset = toOffset(params.get("offset"));
  try {
    const page = await listShopOrdersForUserPage(userId, { limit, offset });
    const orders = page.orders.map(toShopOrderSummary);
    return jsonNoStore({
      ok: true,
      data: {
        orders,
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.hasMore,
      },
    });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_list_shop_orders" }, { status: 500 });
  }
}
