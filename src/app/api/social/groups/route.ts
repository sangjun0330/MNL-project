import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  cleanSocialGroupNotice,
  cleanSocialGroupDescription,
  cleanSocialGroupName,
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";
import {
  appendGroupActivity,
  DEFAULT_GROUP_MAX_MEMBERS,
  getSocialGroupsByIds,
  loadLatestGroupNoticePreviewMap,
  loadPendingJoinRequestCountMap,
  loadSocialGroupProfileMap,
  mapSocialGroupSummary,
} from "@/lib/server/socialGroups";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: { groups: [] } });

  const admin = getSupabaseAdmin();

  try {
    await assertSocialReadAccess(admin, userId);
    const { data: memberships, error: membershipErr } = await (admin as any)
      .from("rnest_social_group_members")
      .select("group_id, role, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

    if (membershipErr) throw membershipErr;

    const membershipRows = memberships ?? [];
    if (membershipRows.length === 0) {
      return jsonNoStore({ ok: true, data: { groups: [] } });
    }

    const groupIds = Array.from(
      new Set(
        membershipRows
          .map((row: any) => Number(row.group_id))
          .filter((value: number) => Number.isFinite(value))
      )
    ) as number[];
    const [groups, { data: memberRows, error: memberErr }, pendingCountMap, latestNoticePreviewMap] = await Promise.all([
      getSocialGroupsByIds(admin, groupIds),
      (admin as any)
        .from("rnest_social_group_members")
        .select("group_id, user_id, joined_at")
        .in("group_id", groupIds)
        .order("joined_at", { ascending: true }),
      loadPendingJoinRequestCountMap(admin, groupIds),
      loadLatestGroupNoticePreviewMap(admin, groupIds),
    ]);

    if (memberErr) throw memberErr;

    const membersByGroupId = new Map<number, any[]>();
    const memberIds = new Set<string>();
    for (const row of memberRows ?? []) {
      const groupId = Number(row.group_id);
      if (!membersByGroupId.has(groupId)) membersByGroupId.set(groupId, []);
      membersByGroupId.get(groupId)?.push(row);
      if (typeof row.user_id === "string") memberIds.add(row.user_id);
    }

    const profileMap = await loadSocialGroupProfileMap(admin, Array.from(memberIds));

    const membershipMap = new Map<number, any>();
    for (const row of membershipRows) {
      membershipMap.set(Number(row.group_id), row);
    }

    const groupList = groups
      .map((group) => {
      const groupId = Number(group.id);
      const groupMembers = membersByGroupId.get(groupId) ?? [];
      const preview = groupMembers.slice(0, 3).map((member: any) => {
        const profile = profileMap.get(String(member.user_id));
        return {
          userId: String(member.user_id),
          nickname: profile?.nickname ?? "",
          avatarEmoji: profile?.avatarEmoji ?? "🐧",
        };
      });

      return mapSocialGroupSummary({
        group,
        membership: membershipMap.get(groupId),
        memberCount: groupMembers.length,
        memberPreview: preview,
        latestNotice: latestNoticePreviewMap.get(groupId) ?? null,
        pendingJoinRequestCount:
          membershipMap.get(groupId)?.role === "owner" || membershipMap.get(groupId)?.role === "admin"
            ? Number(pendingCountMap.get(groupId) ?? 0)
            : 0,
      });
      })
      .sort((a, b) => {
        const joinedCompare = b.joinedAt.localeCompare(a.joinedAt);
        if (joinedCompare !== 0) return joinedCompare;
        return b.id - a.id;
      });

    return jsonNoStore({ ok: true, data: { groups: groupList } });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialGroups/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_groups" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const adminForCheck = getSupabaseAdmin();
  const { data: profileCheck } = await (adminForCheck as any)
    .from("rnest_social_profiles")
    .select("is_suspended")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileCheck?.is_suspended) {
    return jsonNoStore({ ok: false, error: "account_suspended" }, { status: 403 });
  }

  try {
    const { readSubscription } = await import("@/lib/server/billingReadStore");
    const subscription = await readSubscription(userId);
    if (subscription.entitlements.socialGroupCreate !== true) {
      return jsonNoStore({ ok: false, error: "paid_plan_required_for_group_create" }, { status: 403 });
    }
  } catch (err: any) {
    console.error("[SocialGroups/POST] billing access check failed err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "billing_access_check_failed" }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = cleanSocialGroupName(body?.name);
  const description = cleanSocialGroupDescription(body?.description);
  const notice = cleanSocialGroupNotice(body?.notice);
  if (!name) {
    return jsonNoStore({ ok: false, error: "group_name_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    await assertSocialWriteAccess(admin, userId);
    const limited = await isSocialActionRateLimited({
      req,
      userId,
      action: "group_create",
      maxPerUser: 6,
      maxPerIp: 12,
      windowMinutes: 60,
    });
    if (limited) {
      await recordSocialActionAttempt({ req, userId, action: "group_create", success: false, detail: "rate_limited" });
      return jsonNoStore({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const { data: group, error: groupErr } = await (admin as any)
      .from("rnest_social_groups")
      .insert({
        owner_user_id: userId,
        name,
        description,
        notice,
        max_members: DEFAULT_GROUP_MAX_MEMBERS,
        updated_at: new Date().toISOString(),
      })
      .select("id, owner_user_id, name, description, notice, invite_version, max_members, join_mode, allow_member_invites, created_at, updated_at")
      .single();

    if (groupErr) throw groupErr;

    const { error: memberErr } = await (admin as any)
      .from("rnest_social_group_members")
      .insert({
        group_id: group.id,
        user_id: userId,
        role: "owner",
      });

    if (memberErr) {
      await (admin as any).from("rnest_social_groups").delete().eq("id", group.id);
      throw memberErr;
    }

    const profileMap = await loadSocialGroupProfileMap(admin, [userId]);
    const profile = profileMap.get(userId);

    await appendGroupActivity({
      admin,
      groupId: Number(group.id),
      type: "group_created",
      actorUserId: userId,
      payload: { groupName: name },
    });

    await recordSocialActionAttempt({ req, userId, action: "group_create", success: true, detail: "ok" });
    return jsonNoStore({
      ok: true,
      data: mapSocialGroupSummary({
        group: {
          id: Number(group.id),
          ownerUserId: String(group.owner_user_id ?? userId),
          name: String(group.name ?? ""),
          description: String(group.description ?? ""),
          notice: String(group.notice ?? ""),
          inviteVersion: Number(group.invite_version ?? 1),
          maxMembers: Number(group.max_members ?? DEFAULT_GROUP_MAX_MEMBERS),
          joinMode: group.join_mode === "approval" ? "approval" : "open",
          allowMemberInvites: group.allow_member_invites !== false,
          createdAt: String(group.created_at ?? new Date().toISOString()),
          updatedAt: String(group.updated_at ?? group.created_at ?? new Date().toISOString()),
        },
        membership: { role: "owner", joined_at: group.created_at },
        memberCount: 1,
        memberPreview: [
          {
            userId,
            nickname: String(profile?.nickname ?? ""),
            avatarEmoji: String(profile?.avatarEmoji ?? "🐧"),
          },
        ],
        latestNotice: notice
          ? {
              title: "고정 안내",
              preview: notice,
              createdAt: String(group.updated_at ?? group.created_at ?? new Date().toISOString()),
            }
          : null,
        pendingJoinRequestCount: 0,
      }),
    });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) {
      await recordSocialActionAttempt({ req, userId, action: "group_create", success: false, detail: accessCode });
      return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    }
    await recordSocialActionAttempt({ req, userId, action: "group_create", success: false, detail: "failed" });
    console.error("[SocialGroups/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_group" }, { status: 500 });
  }
}
