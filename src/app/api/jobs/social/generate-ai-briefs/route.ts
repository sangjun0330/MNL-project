import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { generateWeeklyGroupAIBriefs } from "@/lib/server/socialGroupAIBrief";

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

async function runGenerate(req: Request) {
  if (!readCronSecret()) {
    return Response.json({ ok: false, error: "missing_cron_secret" }, { status: 503 });
  }
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  try {
    const result = await generateWeeklyGroupAIBriefs({ admin });
    return Response.json({ ok: true, data: result });
  } catch (error: any) {
    console.error("[generate-ai-briefs] fatal error:", error?.message);
    return Response.json({ ok: false, error: "failed_to_generate_group_ai_briefs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return runGenerate(req);
}

export async function GET(req: Request) {
  return runGenerate(req);
}
