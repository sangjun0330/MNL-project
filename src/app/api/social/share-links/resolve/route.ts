import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getSocialCode } from "@/lib/server/socialCode";
import { isSocialActionRateLimited, recordSocialActionAttempt, verifySocialInviteToken } from "@/lib/server/socialSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeInviteToken(value: unknown): string {
  return String(value ?? "").trim().replace(/[^A-Za-z0-9\-_.]/g, "").slice(0, 320);
}

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

  const token = sanitizeInviteToken(body?.token);
  if (!token) {
    return jsonNoStore({ ok: false, error: "invalid_invite_token" }, { status: 400 });
  }

  try {
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "share_link_resolve",
      maxPerUser: 30,
      maxPerIp: 45,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "share_link_resolve", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const admin = getSupabaseAdmin();
    const invite = await verifySocialInviteToken(token);
    if (!invite || invite.expiresAt < Date.now()) {
      await recordSocialActionAttempt({ req, userId, action: "share_link_resolve", success: false, detail: "expired" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    if (invite.inviterUserId === userId) {
      await recordSocialActionAttempt({ req, userId, action: "share_link_resolve", success: false, detail: "self" });
      return jsonNoStore({ ok: false, error: "cannot_connect_to_self" }, { status: 400 });
    }

    const [codeRow, profileRes] = await Promise.all([
      getSocialCode(invite.inviterUserId),
      (admin as any)
        .from("rnest_social_profiles")
        .select("nickname, avatar_emoji")
        .eq("user_id", invite.inviterUserId)
        .maybeSingle(),
    ]);
    const profile = profileRes?.data ?? null;
    if (profileRes?.error) throw profileRes.error;

    if (!codeRow || String(codeRow.updatedAt) !== String(invite.codeUpdatedAt)) {
      await recordSocialActionAttempt({ req, userId, action: "share_link_resolve", success: false, detail: "stale" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    const { data: existingRows, error: existingErr } = await (admin as any)
      .from("rnest_connections")
      .select("status, requester_id, receiver_id")
      .or(
        `and(requester_id.eq.${userId},receiver_id.eq.${invite.inviterUserId}),and(requester_id.eq.${invite.inviterUserId},receiver_id.eq.${userId})`
      )
      .limit(2);

    if (existingErr) throw existingErr;

    const existing: any = (existingRows ?? []).sort((a: any, b: any) => {
      const priority: Record<string, number> = { blocked: 3, accepted: 2, pending: 1, rejected: 0 };
      return (priority[b.status] ?? 0) - (priority[a.status] ?? 0);
    })[0] ?? null;

    const relationState =
      existing?.status === "accepted"
        ? "accepted"
        : existing?.status === "pending"
          ? "pending"
          : existing?.status === "blocked"
            ? "blocked"
            : "available";

    await recordSocialActionAttempt({ req, userId, action: "share_link_resolve", success: true, detail: relationState });
    return jsonNoStore({
      ok: true,
      data: {
        relationState,
        code: relationState === "available" ? codeRow.code : null,
        inviterNickname: profile?.nickname || "",
        inviterAvatarEmoji: profile?.avatar_emoji || "🐧",
      },
    });
  } catch (err: any) {
    await recordSocialActionAttempt({ req, userId, action: "share_link_resolve", success: false, detail: "failed" });
    console.error("[SocialShareLinks/Resolve] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_resolve_share_link" }, { status: 500 });
  }
}
