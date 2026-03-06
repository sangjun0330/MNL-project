import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getOrCreateSocialCode } from "@/lib/server/socialCode";
import { generateOpaqueToken, isSocialActionRateLimited, recordSocialActionAttempt, sha256Base64Url } from "@/lib/server/socialSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  try {
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

    const admin = getSupabaseAdmin();
    const socialCode = await getOrCreateSocialCode(userId);
    const token = generateOpaqueToken(24);
    const tokenHash = await sha256Base64Url(token);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { error } = await (admin as any).from("rnest_social_share_invites").insert({
      inviter_user_id: userId,
      token_hash: tokenHash,
      issued_share_version: socialCode.shareVersion,
      expires_at: expiresAt,
    });

    if (error) throw error;

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
    await recordSocialActionAttempt({ req, userId, action: "share_link_create", success: false, detail: "failed" });
    console.error("[SocialShareLinks/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_share_link" }, { status: 500 });
  }
}
