import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getOrCreateSocialCode, regenerateSocialCode } from "@/lib/server/socialCode";
import { isSocialActionRateLimited, recordSocialActionAttempt } from "@/lib/server/socialSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/code — 내 코드 조회 (없으면 자동 생성)
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: { code: null, createdAt: null } });

  try {
    const socialCode = await getOrCreateSocialCode(userId);
    return jsonNoStore({
      ok: true,
      data: { code: socialCode.code, createdAt: socialCode.createdAt },
    });
  } catch (err: any) {
    console.error("[SocialCode/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_code" }, { status: 500 });
  }
}

// POST /api/social/code — 코드 재생성
export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body?.regenerate) {
    return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "code_regenerate",
      maxPerUser: 3,
      maxPerIp: 5,
      windowMinutes: 60 * 24,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "code_regenerate", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const newCode = await regenerateSocialCode(userId);
    await recordSocialActionAttempt({ req, userId, action: "code_regenerate", success: true, detail: "ok" });
    return jsonNoStore({
      ok: true,
      data: { code: newCode.code, createdAt: newCode.createdAt },
    });
  } catch (err: any) {
    await recordSocialActionAttempt({ req, userId, action: "code_regenerate", success: false, detail: "failed" });
    console.error("[SocialCode/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_regenerate_code" }, { status: 500 });
  }
}
