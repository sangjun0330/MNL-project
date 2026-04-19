import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
  verifySocialGroupInviteToken,
} from "@/lib/server/socialSecurity";
import {
  getSocialGroupById,
  loadPendingJoinRequestForUser,
  loadSocialGroupProfileMap,
  mapSocialGroupSummary,
  normalizeSocialGroupRole,
} from "@/lib/server/socialGroups";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeToken(value: unknown): string {
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

  const token = sanitizeToken(body?.token);
  if (!token) return jsonNoStore({ ok: false, error: "invalid_group_invite_token" }, { status: 400 });

  const admin = getSupabaseAdmin();

  try {
    await assertSocialReadAccess(admin, userId);
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "group_invite_resolve",
      maxPerUser: 36,
      maxPerIp: 48,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_resolve", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const invite = await verifySocialGroupInviteToken(token);
    if (!invite || invite.expiresAt < Date.now()) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_resolve", success: false, detail: "expired" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    const [group, { data: memberRows, error: memberErr }, joinRequest] = await Promise.all([
      getSocialGroupById(admin, invite.groupId),
      (admin as any)
        .from("rnest_social_group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", invite.groupId)
        .order("joined_at", { ascending: true }),
      loadPendingJoinRequestForUser(admin, invite.groupId, userId),
    ]);

    if (memberErr) throw memberErr;
    if (!group || Number(group.inviteVersion ?? 1) !== invite.inviteVersion) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_resolve", success: false, detail: "stale" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    const members = memberRows ?? [];
    const alreadyMember = members.some((row: any) => String(row.user_id) === userId);
    const memberIds = members.map((row: any) => String(row.user_id));
    const profileMap = await loadSocialGroupProfileMap(admin, memberIds);

    const state = alreadyMember
      ? "already_member"
      : members.length >= Number(group.maxMembers ?? 12)
        ? "group_full"
        : joinRequest?.status === "pending"
          ? "request_pending"
          : group.joinMode === "approval"
            ? "approval_required"
            : "joinable";

    await recordSocialActionAttempt({ req, userId, action: "group_invite_resolve", success: true, detail: state });
    return jsonNoStore({
      ok: true,
      data: {
        token,
        state,
        group: mapSocialGroupSummary({
          group,
          membership: alreadyMember
            ? members.find((row: any) => String(row.user_id) === userId) ?? { role: "member", joined_at: group.createdAt }
            : { role: "member", joined_at: group.createdAt },
          memberCount: members.length,
          memberPreview: members.slice(0, 3).map((row: any) => {
            const profile = profileMap.get(String(row.user_id));
            return {
              userId: String(row.user_id),
              nickname: profile?.nickname ?? "",
              avatarEmoji: profile?.avatarEmoji ?? "🐧",
            };
          }),
          pendingJoinRequestCount: 0,
        }),
      },
    });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_resolve", success: false, detail: accessCode });
      return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    }
    await recordSocialActionAttempt({ req, userId, action: "group_invite_resolve", success: false, detail: "failed" });
    console.error("[SocialGroupInvite/Resolve] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_resolve_group_invite" }, { status: 500 });
  }
}
