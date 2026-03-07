import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
  verifySocialGroupInviteToken,
} from "@/lib/server/socialSecurity";

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
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "group_invite_join",
      maxPerUser: 16,
      maxPerIp: 24,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const invite = await verifySocialGroupInviteToken(token);
    if (!invite || invite.expiresAt < Date.now()) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "expired" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    const [{ data: group, error: groupErr }, { data: memberRows, error: memberErr }] = await Promise.all([
      (admin as any)
        .from("rnest_social_groups")
        .select("id, owner_user_id, name, description, invite_version, max_members, created_at")
        .eq("id", invite.groupId)
        .maybeSingle(),
      (admin as any)
        .from("rnest_social_group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", invite.groupId)
        .order("joined_at", { ascending: true }),
    ]);

    if (groupErr) throw groupErr;
    if (memberErr) throw memberErr;
    if (!group || Number(group.invite_version ?? 1) !== invite.inviteVersion) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "stale" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    const members = memberRows ?? [];
    const existingMembership = members.find((row: any) => String(row.user_id) === userId);
    if (!existingMembership && members.length >= Number(group.max_members ?? 12)) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "group_full" });
      return jsonNoStore({ ok: false, error: "group_full" }, { status: 409 });
    }

    if (!existingMembership) {
      const { error: insertErr } = await (admin as any)
        .from("rnest_social_group_members")
        .insert({
          group_id: invite.groupId,
          user_id: userId,
          role: "member",
        });
      if (insertErr) throw insertErr;
    }

    const { data: finalMemberRows } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", invite.groupId)
      .order("joined_at", { ascending: true });

    const memberIds = (finalMemberRows ?? []).map((row: any) => String(row.user_id));
    const { data: profiles } = memberIds.length
      ? await (admin as any)
          .from("rnest_social_profiles")
          .select("user_id, nickname, avatar_emoji")
          .in("user_id", memberIds)
      : { data: [] };

    const profileMap = new Map<string, { nickname: string; avatarEmoji: string }>();
    for (const row of profiles ?? []) {
      profileMap.set(String(row.user_id), {
        nickname: String(row.nickname ?? ""),
        avatarEmoji: String(row.avatar_emoji ?? "🐧"),
      });
    }

    const meMembership = (finalMemberRows ?? []).find((row: any) => String(row.user_id) === userId);
    await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: true, detail: existingMembership ? "already_member" : "joined" });
    return jsonNoStore({
      ok: true,
      data: {
        id: Number(group.id),
        name: String(group.name ?? ""),
        description: String(group.description ?? ""),
        role: meMembership?.role === "owner" ? "owner" : "member",
        ownerUserId: String(group.owner_user_id ?? ""),
        memberCount: (finalMemberRows ?? []).length,
        joinedAt: String(meMembership?.joined_at ?? group.created_at ?? new Date().toISOString()),
        memberPreview: (finalMemberRows ?? []).slice(0, 3).map((row: any) => {
          const profile = profileMap.get(String(row.user_id));
          return {
            userId: String(row.user_id),
            nickname: profile?.nickname ?? "",
            avatarEmoji: profile?.avatarEmoji ?? "🐧",
          };
        }),
      },
    });
  } catch (err: any) {
    await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "failed" });
    console.error("[SocialGroupInvite/Join] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_join_group" }, { status: 500 });
  }
}
