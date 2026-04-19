import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  appendGroupActivity,
  appendSocialEvent,
  getSocialGroupById,
  listSocialGroupRecipientIds,
  loadSocialGroupProfileMap,
  normalizeSocialGroupRole,
  parseSocialGroupId,
} from "@/lib/server/socialGroups";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function PATCH(
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
  if (!["leave", "delete"].includes(action)) {
    return jsonNoStore({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    await assertSocialWriteAccess(admin, userId);
    const [group, { data: membership, error: membershipErr }, { data: memberRows, error: memberRowsErr }] = await Promise.all([
      getSocialGroupById(admin, groupId),
      (admin as any)
        .from("rnest_social_group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle(),
      (admin as any)
        .from("rnest_social_group_members")
        .select("user_id, role")
        .eq("group_id", groupId),
    ]);

    if (membershipErr) throw membershipErr;
    if (memberRowsErr) throw memberRowsErr;
    if (!group) return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    if (!membership) return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });

    if (action === "delete") {
      if (normalizeSocialGroupRole(membership.role) !== "owner") {
        return jsonNoStore({ ok: false, error: "only_owner_can_delete_group" }, { status: 403 });
      }
      const { error } = await (admin as any).from("rnest_social_groups").delete().eq("id", groupId);
      if (error) throw error;
      return jsonNoStore({ ok: true });
    }

    if (normalizeSocialGroupRole(membership.role) === "owner") {
      return jsonNoStore({ ok: false, error: "owner_cannot_leave_group" }, { status: 409 });
    }

    const { error } = await (admin as any)
      .from("rnest_social_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);

    if (error) throw error;

    await appendGroupActivity({
      admin,
      groupId,
      type: "group_member_left",
      actorUserId: userId,
      payload: { groupName: group.name },
    });

    const recipientIds = listSocialGroupRecipientIds(memberRows ?? [], { excludeUserIds: [userId] });
    if (recipientIds.length > 0) {
      const actorProfile = (await loadSocialGroupProfileMap(admin, [userId])).get(userId);
      await Promise.all(
        recipientIds.map((recipientId) =>
          appendSocialEvent({
            admin,
            recipientId,
            actorId: userId,
            type: "group_member_left",
            entityId: String(groupId),
            payload: {
              groupName: group.name,
              nickname: actorProfile?.nickname ?? "",
              avatarEmoji: actorProfile?.avatarEmoji ?? "🐧",
            },
          })
        )
      );
    }

    return jsonNoStore({ ok: true });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialGroup/PATCH] id=%d err=%s", groupId, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_update_group" }, { status: 500 });
  }
}
