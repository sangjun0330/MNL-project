import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getOrCreateSocialCode } from "@/lib/server/socialCode";
import { isSocialActionRateLimited, recordSocialActionAttempt, signSocialInviteToken } from "@/lib/server/socialSecurity";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();

  try {
    await assertSocialWriteAccess(admin, userId);
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "share_link_create",
      maxPerUser: 12,
      maxPerIp: 18,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "share_link_create", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const socialCode = await getOrCreateSocialCode(userId);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const token = await signSocialInviteToken({
      inviterUserId: userId,
      codeUpdatedAt: socialCode.updatedAt,
      expiresAt: Date.parse(expiresAt),
    });

    await recordSocialActionAttempt({ req, userId, action: "share_link_create", success: true, detail: "ok" });
    const origin = new URL(req.url).origin;
    return jsonNoStore({
      ok: true,
      data: {
        url: `${origin}/social?invite=${encodeURIComponent(token)}`,
        expiresAt,
      },
    });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) {
      await recordSocialActionAttempt({ req, userId, action: "share_link_create", success: false, detail: accessCode });
      return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    }
    await recordSocialActionAttempt({ req, userId, action: "share_link_create", success: false, detail: "failed" });
    console.error("[SocialShareLinks/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_share_link" }, { status: 500 });
  }
}
