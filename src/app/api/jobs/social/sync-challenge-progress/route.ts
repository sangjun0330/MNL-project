/**
 * POST /api/jobs/social/sync-challenge-progress
 * Cron job: active 챌린지 진행상황 동기화 + 만료 챌린지 ended 처리
 * Cloudflare Cron Trigger 또는 외부 스케줄러에서 1시간마다 호출
 */
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncAllActiveChallenges } from "@/lib/server/socialChallenges";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function readCronSecret() {
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  return cronSecret || null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let mismatch = 1;
    for (let i = 0; i < b.length; i += 1) mismatch |= b.charCodeAt(i);
    return mismatch === 0;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(req: Request) {
  const cronSecret = readCronSecret();
  if (!cronSecret) return false;
  const authHeader = String(req.headers.get("x-cron-secret") ?? req.headers.get("authorization") ?? "").trim();
  if (!authHeader) return false;
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!provided) return false;
  return timingSafeEqual(provided, cronSecret);
}

export async function POST(req: Request) {
  const cronSecret = readCronSecret();
  if (!cronSecret) {
    return Response.json({ ok: false, error: "missing_cron_secret" }, { status: 503 });
  }
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  try {
    const result = await syncAllActiveChallenges(admin);
    console.log(`[sync-challenge-progress] processed=${result.processedCount} ended=${result.endedCount} errors=${result.errorCount}`);
    return Response.json({ ok: true, data: result });
  } catch (err: any) {
    console.error("[sync-challenge-progress] fatal error:", err?.message);
    return Response.json({ ok: false, error: "sync_failed" }, { status: 500 });
  }
}

// GET: 헬스체크용
export async function GET() {
  return Response.json({ ok: true, service: "sync-challenge-progress" });
}
