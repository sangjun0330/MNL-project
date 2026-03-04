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
  // Vercel Cron은 CRON_SECRET 환경변수를 Bearer 토큰으로 자동 주입합니다
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();

  const auth = String(req.headers.get("authorization") ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (secret && token === secret) return true;
    if (cronSecret && token === cronSecret) return true;
  }

  // 레거시: x-shop-sync-secret 헤더 (외부 스케줄러 호환)
  if (secret && String(req.headers.get("x-shop-sync-secret") ?? "").trim() === secret) return true;
  return false;
}

function toLimit(value: string | null): number {
  const n = Number(value ?? "10");
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(20, Math.round(n)));
}

async function runShippingSync(req: Request) {
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

// POST: 수동 호출 / 외부 스케줄러
export async function POST(req: Request) {
  return runShippingSync(req);
}

// GET: Vercel Cron (cron jobs send GET requests)
export async function GET(req: Request) {
  return runShippingSync(req);
}

