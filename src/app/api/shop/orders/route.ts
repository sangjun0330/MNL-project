import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { listShopOrdersForUser } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLimit(value: string | null): number {
  const n = Number(value ?? "12");
  if (!Number.isFinite(n)) return 12;
  return Math.max(1, Math.min(30, Math.round(n)));
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const limit = toLimit(new URL(req.url).searchParams.get("limit"));
  try {
    const orders = await listShopOrdersForUser(userId, limit);
    return jsonNoStore({ ok: true, data: { orders } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_list_shop_orders" }, { status: 500 });
  }
}
