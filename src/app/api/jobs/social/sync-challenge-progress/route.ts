/**
 * POST /api/jobs/social/sync-challenge-progress
 * Cron job: active 챌린지 진행상황 동기화 + 만료 챌린지 ended 처리
 * Cloudflare Cron Trigger 또는 외부 스케줄러에서 1시간마다 호출
 */
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { syncAllActiveChallenges } from "@/lib/server/socialChallenges";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Cron 인증: 환경변수 CRON_SECRET 헤더 검증
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
    const provided = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (provided !== cronSecret) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
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
