import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
  signSocialGroupInviteToken,
} from "@/lib/server/socialSecurity";
import {
  buildSocialGroupPermissions,
  getSocialGroupById,
  normalizeSocialGroupRole,
  parseSocialGroupId,
} from "@/lib/server/socialGroups";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId } = await params;
  const groupId = parseSocialGroupId(rawGroupId);
  if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

  const admin = getSupabaseAdmin();

  try {
    await assertSocialWriteAccess(admin, userId);
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "group_invite_create",
      maxPerUser: 16,
      maxPerIp: 24,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_create", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const [group, { data: membership, error: membershipErr }] = await Promise.all([
      getSocialGroupById(admin, groupId),
      (admin as any)
        .from("rnest_social_group_members")
        .select("user_id, role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (membershipErr) throw membershipErr;
    if (!group) return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    if (!membership) return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });

    const permissions = buildSocialGroupPermissions(
      normalizeSocialGroupRole(membership.role),
      group.allowMemberInvites
    );
    if (!permissions.canCreateInvite) {
      return jsonNoStore({ ok: false, error: "invite_permission_denied" }, { status: 403 });
    }

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const token = await signSocialGroupInviteToken({
      groupId,
      inviterUserId: userId,
      inviteVersion: Number(group.inviteVersion ?? 1),
      expiresAt: Date.parse(expiresAt),
    });

    await recordSocialActionAttempt({ req, userId, action: "group_invite_create", success: true, detail: "ok" });
    const origin = new URL(req.url).origin;
    return jsonNoStore({
      ok: true,
      data: {
        url: `${origin}/social?groupInvite=${encodeURIComponent(token)}`,
        expiresAt,
      },
    });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_create", success: false, detail: accessCode });
      return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    }
    await recordSocialActionAttempt({ req, userId, action: "group_invite_create", success: false, detail: "failed" });
    console.error("[SocialGroupInvite/POST] id=%d err=%s", groupId, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_group_invite" }, { status: 500 });
  }
}
