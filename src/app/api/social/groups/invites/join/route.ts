import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  isSocialActionRateLimited,
  recordSocialActionAttempt,
  verifySocialGroupInviteToken,
} from "@/lib/server/socialSecurity";
import {
  appendGroupActivity,
  appendSocialEvent,
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

    const [group, { data: memberRows, error: memberErr }, existingJoinRequest] = await Promise.all([
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
      await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "stale" });
      return jsonNoStore({ ok: false, error: "invite_not_found_or_expired" }, { status: 404 });
    }

    const members = memberRows ?? [];
    const existingMembership = members.find((row: any) => String(row.user_id) === userId);
    if (!existingMembership && members.length >= Number(group.maxMembers ?? 12)) {
      await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "group_full" });
      return jsonNoStore({ ok: false, error: "group_full" }, { status: 409 });
    }

    const myProfileMap = await loadSocialGroupProfileMap(admin, [userId]);
    const myProfile = myProfileMap.get(userId);

    if (!existingMembership && group.joinMode === "approval") {
      if (existingJoinRequest?.status === "pending") {
        await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: true, detail: "request_pending" });
      } else {
        const { error: requestErr } = await (admin as any)
          .from("rnest_social_group_join_requests")
          .upsert(
            {
              group_id: invite.groupId,
              requester_user_id: userId,
              status: "pending",
              created_at: new Date().toISOString(),
              responded_at: null,
              responded_by_user_id: null,
            },
            { onConflict: "group_id,requester_user_id" }
          );
        if (requestErr) throw requestErr;

        const managerIds = members
          .filter((row: any) => {
            const role = normalizeSocialGroupRole(row.role);
            return role === "owner" || role === "admin";
          })
          .map((row: any) => String(row.user_id))
          .filter((id: string) => id && id !== userId);

        await Promise.all(
          managerIds.map((recipientId: string) =>
            appendSocialEvent({
              admin,
              recipientId,
              actorId: userId,
              type: "group_join_requested",
              entityId: String(invite.groupId),
              payload: {
                nickname: myProfile?.nickname ?? "",
                avatarEmoji: myProfile?.avatarEmoji ?? "🐧",
                groupName: group.name,
              },
              dedupeKey: `group_join_requested:${invite.groupId}:${userId}:${recipientId}`,
            })
          )
        );

        await appendGroupActivity({
          admin,
          groupId: invite.groupId,
          type: "group_join_requested",
          actorUserId: userId,
          payload: { groupName: group.name },
        });

        await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: true, detail: "requested" });
      }

      return jsonNoStore({
        ok: true,
        data: {
          state: "request_pending",
          group: mapSocialGroupSummary({
            group,
            membership: { role: "member", joined_at: group.createdAt },
            memberCount: members.length,
            memberPreview: [],
            pendingJoinRequestCount: 0,
          }),
        },
      });
    }

    if (!existingMembership) {
      const { error: insertErr } = await (admin as any).from("rnest_social_group_members").insert({
        group_id: invite.groupId,
        user_id: userId,
        role: "member",
      });
      if (insertErr) throw insertErr;

      await (admin as any)
        .from("rnest_social_group_join_requests")
        .update({
          status: "approved",
          responded_at: new Date().toISOString(),
          responded_by_user_id: invite.inviterUserId,
        })
        .eq("group_id", invite.groupId)
        .eq("requester_user_id", userId);

      await appendGroupActivity({
        admin,
        groupId: invite.groupId,
        type: "group_member_joined",
        actorUserId: userId,
        payload: { groupName: group.name },
      });
    }

    const { data: finalMemberRows } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id, role, joined_at")
        .eq("group_id", invite.groupId)
        .order("joined_at", { ascending: true });

    const memberIds = (finalMemberRows ?? []).map((row: any) => String(row.user_id));
    const profileMap = await loadSocialGroupProfileMap(admin, memberIds);

    const meMembership = (finalMemberRows ?? []).find((row: any) => String(row.user_id) === userId);
    await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: true, detail: existingMembership ? "already_member" : "joined" });
    return jsonNoStore({
      ok: true,
      data: {
        ...mapSocialGroupSummary({
          group,
          membership: meMembership ?? { role: "member", joined_at: group.createdAt },
          memberCount: (finalMemberRows ?? []).length,
          memberPreview: (finalMemberRows ?? []).slice(0, 3).map((row: any) => {
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
    await recordSocialActionAttempt({ req, userId, action: "group_invite_join", success: false, detail: "failed" });
    console.error("[SocialGroupInvite/Join] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_join_group" }, { status: 500 });
  }
}
