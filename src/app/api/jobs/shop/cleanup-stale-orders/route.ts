/**
 * READY 상태 주문 자동 정리 Job
 *
 * 30분 이상 READY 상태로 방치된 주문(결제 미완료/이탈)을 CANCELED 처리합니다.
 * 이를 통해 허위 재고 점유를 해제하고, 사용자가 너무 많은 READY 주문으로
 * 재구매가 차단되는 상황을 방지합니다.
 *
 * 호출 방법:
 *   POST /api/jobs/shop/cleanup-stale-orders
 *   Authorization: Bearer <SHOP_CLEANUP_JOB_SECRET>
 *
 * 스케줄링: Vercel Cron (vercel.json), 외부 스케줄러, 또는 수동 호출.
 * 권장 주기: 10분마다.
 *
 * 환경변수:
 *   SHOP_CLEANUP_JOB_SECRET  — Bearer 토큰. 미설정 시 엔드포인트 비활성화.
 */

import { jsonNoStore } from "@/lib/server/requestSecurity";
import { listStaleReadyShopOrders, markShopOrderCanceled } from "@/lib/server/shopOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30분
const MAX_BATCH = 50;

function readSecret() {
  const secret = String(process.env.SHOP_CLEANUP_JOB_SECRET ?? "").trim();
  return secret || null;
}

function isAuthorized(req: Request): boolean {
  const secret = readSecret();
  // Vercel Cron은 CRON_SECRET 환경변수를 Bearer 토큰으로 자동 주입합니다
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  const auth = String(req.headers.get("authorization") ?? "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (secret && token === secret) return true;
    if (cronSecret && token === cronSecret) return true;
  }
  return false;
}

async function runCleanup(req: Request) {
  const headers = jsonNoStore({}, {}).headers;

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers,
    });
  }

  try {
    const staleOrders = await listStaleReadyShopOrders(STALE_AFTER_MS);
    const batch = staleOrders.slice(0, MAX_BATCH);

    const results = await Promise.allSettled(
      batch.map((order) =>
        markShopOrderCanceled({
          orderId: order.orderId,
          code: "stale_ready_auto_cancel",
          message: "결제 미완료로 30분 후 자동 취소되었습니다.",
        })
      )
    );

    const canceled = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          found: staleOrders.length,
          processed: batch.length,
          canceled,
          failed,
        },
      }),
      { status: 200, headers }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(error?.message ?? "cleanup_failed") }),
      { status: 500, headers }
    );
  }
}

// POST: 수동 호출 / 외부 스케줄러
export async function POST(req: Request) {
  return runCleanup(req);
}

// GET: Vercel Cron (cron jobs send GET requests)
export async function GET(req: Request) {
  return runCleanup(req);
}
