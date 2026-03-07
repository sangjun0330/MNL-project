import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  cleanSocialGroupDescription,
  cleanSocialGroupName,
  cleanSocialGroupNotice,
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";
import {
  appendGroupActivity,
  appendSocialEvent,
  buildSocialGroupPermissions,
  getSocialGroupById,
  listSocialGroupRecipientIds,
  loadSocialGroupProfileMap,
  normalizeSocialGroupRole,
  parseSocialGroupId,
} from "@/lib/server/socialGroups";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function sanitizeUserId(value: unknown): string {
  return String(value ?? "").trim().slice(0, 128);
}

function parseJoinMode(value: unknown): "open" | "approval" {
  return value === "approval" ? "approval" : "open";
}

function parseMaxMembers(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(24, Math.max(2, parsed));
}

function buildSettingsSummary(input: {
  previousName: string;
  nextName: string;
  previousDescription: string;
  nextDescription: string;
  previousJoinMode: "open" | "approval";
  nextJoinMode: "open" | "approval";
  previousAllowMemberInvites: boolean;
  nextAllowMemberInvites: boolean;
  previousMaxMembers: number;
  nextMaxMembers: number;
}): string {
  const changed: string[] = [];
  if (input.previousName !== input.nextName) changed.push("이름");
  if (input.previousDescription !== input.nextDescription) changed.push("소개");
  if (input.previousJoinMode !== input.nextJoinMode) changed.push("가입 방식");
  if (input.previousAllowMemberInvites !== input.nextAllowMemberInvites) changed.push("초대 권한");
  if (input.previousMaxMembers !== input.nextMaxMembers) changed.push("최대 인원");
  if (changed.length === 0) return "그룹 설정이 업데이트됐어요.";
  return `변경 항목: ${changed.join(", ")}`;
}

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

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body?.action ?? "");
  if (!action) return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });

  const admin = getSupabaseAdmin();

  try {
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: `group_manage_${action}`,
      maxPerUser: 120,
      maxPerIp: 180,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const [group, { data: membership, error: membershipErr }, { data: memberRows, error: memberErr }] = await Promise.all([
      getSocialGroupById(admin, groupId),
      (admin as any)
        .from("rnest_social_group_members")
        .select("role, joined_at")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle(),
      (admin as any)
        .from("rnest_social_group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true }),
    ]);

    if (membershipErr) throw membershipErr;
    if (memberErr) throw memberErr;
    if (!group) return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    if (!membership) return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });

    const viewerRole = normalizeSocialGroupRole(membership.role);
    const permissions = buildSocialGroupPermissions(viewerRole, group.allowMemberInvites);
    const members = memberRows ?? [];

    if (action === "update_settings") {
      const nextName = cleanSocialGroupName(body?.name ?? group.name);
      const nextDescription = cleanSocialGroupDescription(body?.description ?? group.description);
      const nextNotice = cleanSocialGroupNotice(body?.notice ?? group.notice);
      const nextJoinMode = parseJoinMode(body?.joinMode ?? group.joinMode);
      const nextAllowMemberInvites =
        typeof body?.allowMemberInvites === "boolean" ? body.allowMemberInvites : group.allowMemberInvites;
      const nextMaxMembers = parseMaxMembers(body?.maxMembers, group.maxMembers);

      if (!permissions.canEditBasicInfo && !permissions.canEditNotice && !permissions.canChangeInvitePolicy) {
        return jsonNoStore({ ok: false, error: "group_manage_forbidden" }, { status: 403 });
      }
      if (!nextName) {
        return jsonNoStore({ ok: false, error: "group_name_required" }, { status: 400 });
      }
      if (members.length > nextMaxMembers) {
        return jsonNoStore({ ok: false, error: "max_members_too_small" }, { status: 409 });
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (permissions.canEditBasicInfo) {
        patch.name = nextName;
        patch.description = nextDescription;
      }
      if (permissions.canEditNotice) {
        patch.notice = nextNotice;
      }
      if (permissions.canChangeInvitePolicy) {
        patch.join_mode = nextJoinMode;
        patch.allow_member_invites = nextAllowMemberInvites;
        patch.max_members = nextMaxMembers;
      }

      const { error } = await (admin as any).from("rnest_social_groups").update(patch).eq("id", groupId);
      if (error) throw error;

      const settingsChanged =
        nextName !== group.name ||
        nextDescription !== group.description ||
        nextJoinMode !== group.joinMode ||
        nextAllowMemberInvites !== group.allowMemberInvites ||
        nextMaxMembers !== group.maxMembers;
      const noticeChanged = nextNotice !== group.notice;
      const recipientIds = listSocialGroupRecipientIds(members, { excludeUserIds: [userId] });
      const actorProfile =
        settingsChanged || noticeChanged
          ? (await loadSocialGroupProfileMap(admin, [userId])).get(userId)
          : null;

      if (settingsChanged) {
        await appendGroupActivity({
          admin,
          groupId,
          type: "group_settings_updated",
          actorUserId: userId,
          payload: { groupName: nextName },
        });
        await Promise.all(
          recipientIds.map((recipientId) =>
            appendSocialEvent({
              admin,
              recipientId,
              actorId: userId,
              type: "group_settings_updated",
              entityId: String(groupId),
              payload: {
                groupName: nextName,
                nickname: actorProfile?.nickname ?? "",
                avatarEmoji: actorProfile?.avatarEmoji ?? "🐧",
                summary: buildSettingsSummary({
                  previousName: group.name,
                  nextName,
                  previousDescription: group.description,
                  nextDescription,
                  previousJoinMode: group.joinMode,
                  nextJoinMode,
                  previousAllowMemberInvites: group.allowMemberInvites,
                  nextAllowMemberInvites,
                  previousMaxMembers: group.maxMembers,
                  nextMaxMembers,
                }),
              },
            })
          )
        );
      }
      if (noticeChanged) {
        await appendGroupActivity({
          admin,
          groupId,
          type: "group_notice_updated",
          actorUserId: userId,
          payload: { notice: nextNotice },
        });
        await Promise.all(
          recipientIds.map((recipientId) =>
            appendSocialEvent({
              admin,
              recipientId,
              actorId: userId,
              type: "group_notice_updated",
              entityId: String(groupId),
              payload: {
                groupName: nextName,
                nickname: actorProfile?.nickname ?? "",
                avatarEmoji: actorProfile?.avatarEmoji ?? "🐧",
                notice: nextNotice,
              },
            })
          )
        );
      }

      await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: true, detail: "ok" });
      return jsonNoStore({ ok: true });
    }

    if (action === "change_role") {
      if (!permissions.canPromoteMembers) {
        return jsonNoStore({ ok: false, error: "group_manage_forbidden" }, { status: 403 });
      }

      const targetUserId = sanitizeUserId(body?.targetUserId);
      const nextRole = normalizeSocialGroupRole(body?.role);
      if (!targetUserId || nextRole === "owner") {
        return jsonNoStore({ ok: false, error: "invalid_target_role" }, { status: 400 });
      }

      const target = members.find((row: any) => String(row.user_id) === targetUserId);
      if (!target) return jsonNoStore({ ok: false, error: "group_member_not_found" }, { status: 404 });
      if (targetUserId === userId) return jsonNoStore({ ok: false, error: "cannot_change_own_role" }, { status: 409 });
      if (normalizeSocialGroupRole(target.role) === "owner") {
        return jsonNoStore({ ok: false, error: "use_owner_transfer" }, { status: 409 });
      }

      const previousRole = normalizeSocialGroupRole(target.role);
      if (previousRole === nextRole) return jsonNoStore({ ok: true });

      const { error } = await (admin as any)
        .from("rnest_social_group_members")
        .update({ role: nextRole })
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (error) throw error;

      await appendGroupActivity({
        admin,
        groupId,
        type: "group_role_changed",
        actorUserId: userId,
        targetUserId,
        payload: { previousRole, role: nextRole, groupName: group.name },
      });
      await appendSocialEvent({
        admin,
        recipientId: targetUserId,
        actorId: userId,
        type: "group_role_changed",
        entityId: String(groupId),
        payload: { groupName: group.name, role: nextRole },
      });

      await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: true, detail: nextRole });
      return jsonNoStore({ ok: true });
    }

    if (action === "transfer_owner") {
      if (!permissions.canTransferOwner) {
        return jsonNoStore({ ok: false, error: "group_manage_forbidden" }, { status: 403 });
      }

      const targetUserId = sanitizeUserId(body?.targetUserId);
      if (!targetUserId || targetUserId === userId) {
        return jsonNoStore({ ok: false, error: "invalid_owner_target" }, { status: 400 });
      }
      const target = members.find((row: any) => String(row.user_id) === targetUserId);
      if (!target) return jsonNoStore({ ok: false, error: "group_member_not_found" }, { status: 404 });
      const previousTargetRole = normalizeSocialGroupRole(target.role);

      try {
        const promoteTarget = await (admin as any)
          .from("rnest_social_group_members")
          .update({ role: "owner" })
          .eq("group_id", groupId)
          .eq("user_id", targetUserId);
        if (promoteTarget.error) throw promoteTarget.error;

        const demoteCurrent = await (admin as any)
          .from("rnest_social_group_members")
          .update({ role: "admin" })
          .eq("group_id", groupId)
          .eq("user_id", userId);
        if (demoteCurrent.error) {
          await (admin as any)
            .from("rnest_social_group_members")
            .update({ role: previousTargetRole })
            .eq("group_id", groupId)
            .eq("user_id", targetUserId);
          throw demoteCurrent.error;
        }

        const updateGroup = await (admin as any)
          .from("rnest_social_groups")
          .update({
            owner_user_id: targetUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", groupId);
        if (updateGroup.error) {
          await (admin as any)
            .from("rnest_social_group_members")
            .update({ role: previousTargetRole })
            .eq("group_id", groupId)
            .eq("user_id", targetUserId);
          await (admin as any)
            .from("rnest_social_group_members")
            .update({ role: "owner" })
            .eq("group_id", groupId)
            .eq("user_id", userId);
          throw updateGroup.error;
        }
      } catch (transferErr: any) {
        throw transferErr;
      }

      await appendGroupActivity({
        admin,
        groupId,
        type: "group_owner_transferred",
        actorUserId: userId,
        targetUserId,
        payload: { groupName: group.name },
      });
      await appendSocialEvent({
        admin,
        recipientId: targetUserId,
        actorId: userId,
        type: "group_owner_transferred",
        entityId: String(groupId),
        payload: { groupName: group.name },
      });

      await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: true, detail: "ok" });
      return jsonNoStore({ ok: true });
    }

    if (action === "remove_member") {
      if (!permissions.canRemoveMembers) {
        return jsonNoStore({ ok: false, error: "group_manage_forbidden" }, { status: 403 });
      }

      const targetUserId = sanitizeUserId(body?.targetUserId);
      if (!targetUserId || targetUserId === userId) {
        return jsonNoStore({ ok: false, error: "invalid_remove_target" }, { status: 400 });
      }
      const target = members.find((row: any) => String(row.user_id) === targetUserId);
      if (!target) return jsonNoStore({ ok: false, error: "group_member_not_found" }, { status: 404 });

      const targetRole = normalizeSocialGroupRole(target.role);
      if (targetRole === "owner") return jsonNoStore({ ok: false, error: "cannot_remove_owner" }, { status: 409 });
      if (viewerRole === "admin" && targetRole !== "member") {
        return jsonNoStore({ ok: false, error: "admin_cannot_remove_manager" }, { status: 403 });
      }

      const { error } = await (admin as any)
        .from("rnest_social_group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", targetUserId);
      if (error) throw error;

      await appendGroupActivity({
        admin,
        groupId,
        type: "group_member_removed",
        actorUserId: userId,
        targetUserId,
        payload: { groupName: group.name },
      });
      await appendSocialEvent({
        admin,
        recipientId: targetUserId,
        actorId: userId,
        type: "group_member_removed",
        entityId: String(groupId),
        payload: { groupName: group.name },
      });

      await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: true, detail: "ok" });
      return jsonNoStore({ ok: true });
    }

    if (action === "handle_join_request") {
      if (!permissions.canManageJoinRequests) {
        return jsonNoStore({ ok: false, error: "group_manage_forbidden" }, { status: 403 });
      }

      const requestId = Number.parseInt(String(body?.requestId ?? ""), 10);
      const decision = String(body?.decision ?? "");
      if (!Number.isFinite(requestId) || !["approve", "reject"].includes(decision)) {
        return jsonNoStore({ ok: false, error: "invalid_join_request_action" }, { status: 400 });
      }

      const { data: joinRequest, error: joinRequestErr } = await (admin as any)
        .from("rnest_social_group_join_requests")
        .select("id, requester_user_id, status")
        .eq("group_id", groupId)
        .eq("id", requestId)
        .maybeSingle();
      if (joinRequestErr) throw joinRequestErr;
      if (!joinRequest || joinRequest.status !== "pending") {
        return jsonNoStore({ ok: false, error: "join_request_not_found" }, { status: 404 });
      }

      const requesterUserId = String(joinRequest.requester_user_id);
      const existingMember = members.some((row: any) => String(row.user_id) === requesterUserId);

      if (decision === "approve") {
        if (!existingMember && members.length >= group.maxMembers) {
          return jsonNoStore({ ok: false, error: "group_full" }, { status: 409 });
        }

        if (!existingMember) {
          const { error: memberInsertErr } = await (admin as any).from("rnest_social_group_members").insert({
            group_id: groupId,
            user_id: requesterUserId,
            role: "member",
          });
          if (memberInsertErr) throw memberInsertErr;
        }

        const { error: updateErr } = await (admin as any)
          .from("rnest_social_group_join_requests")
          .update({
            status: "approved",
            responded_at: new Date().toISOString(),
            responded_by_user_id: userId,
          })
          .eq("id", requestId)
          .eq("group_id", groupId);
        if (updateErr) throw updateErr;

        await appendGroupActivity({
          admin,
          groupId,
          type: "group_join_approved",
          actorUserId: userId,
          targetUserId: requesterUserId,
          payload: { groupName: group.name },
        });
        await appendSocialEvent({
          admin,
          recipientId: requesterUserId,
          actorId: userId,
          type: "group_join_approved",
          entityId: String(groupId),
          payload: { groupName: group.name },
        });
        if (!existingMember) {
          const requesterProfile = (await loadSocialGroupProfileMap(admin, [requesterUserId])).get(requesterUserId);
          const recipientIds = listSocialGroupRecipientIds(members, {
            excludeUserIds: [userId, requesterUserId],
          });
          await Promise.all(
            recipientIds.map((recipientId) =>
              appendSocialEvent({
                admin,
                recipientId,
                actorId: requesterUserId,
                type: "group_member_joined",
                entityId: String(groupId),
                payload: {
                  groupName: group.name,
                  nickname: requesterProfile?.nickname ?? "",
                  avatarEmoji: requesterProfile?.avatarEmoji ?? "🐧",
                },
              })
            )
          );
        }
      } else {
        const { error: updateErr } = await (admin as any)
          .from("rnest_social_group_join_requests")
          .update({
            status: "rejected",
            responded_at: new Date().toISOString(),
            responded_by_user_id: userId,
          })
          .eq("id", requestId)
          .eq("group_id", groupId);
        if (updateErr) throw updateErr;

        await appendGroupActivity({
          admin,
          groupId,
          type: "group_join_rejected",
          actorUserId: userId,
          targetUserId: requesterUserId,
          payload: { groupName: group.name },
        });
        await appendSocialEvent({
          admin,
          recipientId: requesterUserId,
          actorId: userId,
          type: "group_join_rejected",
          entityId: String(groupId),
          payload: { groupName: group.name },
        });
      }

      await recordSocialActionAttempt({
        req,
        userId,
        action: `group_manage_${action}`,
        success: true,
        detail: decision,
      });
      return jsonNoStore({ ok: true });
    }

    if (action === "rotate_invite") {
      if (!permissions.canChangeInvitePolicy) {
        return jsonNoStore({ ok: false, error: "group_manage_forbidden" }, { status: 403 });
      }

      const { error } = await (admin as any)
        .from("rnest_social_groups")
        .update({
          invite_version: group.inviteVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", groupId);
      if (error) throw error;

      await appendGroupActivity({
        admin,
        groupId,
        type: "group_invite_rotated",
        actorUserId: userId,
        payload: { groupName: group.name },
      });

      await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: true, detail: "ok" });
      return jsonNoStore({ ok: true });
    }

    return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (err: any) {
    await recordSocialActionAttempt({ req, userId, action: `group_manage_${action}`, success: false, detail: "failed" });
    console.error("[SocialGroupManage/POST] id=%d action=%s err=%s", groupId, action, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_manage_group" }, { status: 500 });
  }
}
