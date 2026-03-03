import { jsonNoStore } from "@/lib/server/requestSecurity";
import { syncOutstandingShopOrders, toShopAdminOrderSummary } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function readSecret() {
  const secret = String(process.env.SHOP_SHIPPING_SYNC_SECRET ?? "").trim();
  return secret || null;
}

function isAuthorized(req: Request) {
  const secret = readSecret();
  if (!secret) return false;

  const auth = String(req.headers.get("authorization") ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() === secret;
  }

  return String(req.headers.get("x-shop-sync-secret") ?? "").trim() === secret;
}

function toLimit(value: string | null): number {
  const n = Number(value ?? "10");
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(20, Math.round(n)));
}

export async function POST(req: Request) {
  if (!readSecret()) {
    return jsonNoStore({ ok: false, error: "missing_shop_shipping_sync_secret" }, { status: 503 });
  }
  if (!isAuthorized(req)) {
    return jsonNoStore({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const limit = toLimit(new URL(req.url).searchParams.get("limit"));

  try {
    const orders = await syncOutstandingShopOrders(limit);
    return jsonNoStore({
      ok: true,
      data: {
        syncedCount: orders.length,
        deliveredCount: orders.filter((order) => order.status === "DELIVERED").length,
        orders: orders.map(toShopAdminOrderSummary),
      },
    });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_sync_shop_shipping" }, { status: 500 });
  }
}

