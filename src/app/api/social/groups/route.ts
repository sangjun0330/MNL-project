import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  cleanSocialGroupDescription,
  cleanSocialGroupName,
  isSocialActionRateLimited,
  recordSocialActionAttempt,
} from "@/lib/server/socialSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DEFAULT_GROUP_MAX_MEMBERS = 12;

function mapGroupSummary(input: {
  group: any;
  membership: any;
  memberCount: number;
  memberPreview: Array<{ userId: string; nickname: string; avatarEmoji: string }>;
}) {
  return {
    id: Number(input.group.id),
    name: String(input.group.name ?? ""),
    description: String(input.group.description ?? ""),
    role: input.membership?.role === "owner" ? "owner" : "member",
    ownerUserId: String(input.group.owner_user_id ?? ""),
    memberCount: input.memberCount,
    joinedAt: String(input.membership?.joined_at ?? input.group.created_at ?? new Date().toISOString()),
    memberPreview: input.memberPreview,
  };
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();

  try {
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

    const groupIds = Array.from(new Set(membershipRows.map((row: any) => Number(row.group_id)).filter(Number.isFinite)));
    const [{ data: groups, error: groupErr }, { data: memberRows, error: memberErr }] = await Promise.all([
      (admin as any)
        .from("rnest_social_groups")
        .select("id, owner_user_id, name, description, created_at, updated_at")
        .in("id", groupIds)
        .order("updated_at", { ascending: false }),
      (admin as any)
        .from("rnest_social_group_members")
        .select("group_id, user_id, joined_at")
        .in("group_id", groupIds)
        .order("joined_at", { ascending: true }),
    ]);

    if (groupErr) throw groupErr;
    if (memberErr) throw memberErr;

    const membersByGroupId = new Map<number, any[]>();
    const memberIds = new Set<string>();
    for (const row of memberRows ?? []) {
      const groupId = Number(row.group_id);
      if (!membersByGroupId.has(groupId)) membersByGroupId.set(groupId, []);
      membersByGroupId.get(groupId)?.push(row);
      if (typeof row.user_id === "string") memberIds.add(row.user_id);
    }

    const { data: profiles } = memberIds.size
      ? await (admin as any)
          .from("rnest_social_profiles")
          .select("user_id, nickname, avatar_emoji")
          .in("user_id", Array.from(memberIds))
      : { data: [] };

    const profileMap = new Map<string, { nickname: string; avatarEmoji: string }>();
    for (const row of profiles ?? []) {
      profileMap.set(String(row.user_id), {
        nickname: String(row.nickname ?? ""),
        avatarEmoji: String(row.avatar_emoji ?? "🐧"),
      });
    }

    const membershipMap = new Map<number, any>();
    for (const row of membershipRows) {
      membershipMap.set(Number(row.group_id), row);
    }

    const groupList = (groups ?? []).map((group: any) => {
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

      return mapGroupSummary({
        group,
        membership: membershipMap.get(groupId),
        memberCount: groupMembers.length,
        memberPreview: preview,
      });
    });

    return jsonNoStore({ ok: true, data: { groups: groupList } });
  } catch (err: any) {
    console.error("[SocialGroups/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_groups" }, { status: 500 });
  }
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

  const name = cleanSocialGroupName(body?.name);
  const description = cleanSocialGroupDescription(body?.description);
  if (!name) {
    return jsonNoStore({ ok: false, error: "group_name_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
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
        max_members: DEFAULT_GROUP_MAX_MEMBERS,
        updated_at: new Date().toISOString(),
      })
      .select("id, owner_user_id, name, description, created_at, updated_at")
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

    const { data: profile } = await (admin as any)
      .from("rnest_social_profiles")
      .select("nickname, avatar_emoji")
      .eq("user_id", userId)
      .maybeSingle();

    await recordSocialActionAttempt({ req, userId, action: "group_create", success: true, detail: "ok" });
    return jsonNoStore({
      ok: true,
      data: mapGroupSummary({
        group,
        membership: { role: "owner", joined_at: group.created_at },
        memberCount: 1,
        memberPreview: [
          {
            userId,
            nickname: String(profile?.nickname ?? ""),
            avatarEmoji: String(profile?.avatar_emoji ?? "🐧"),
          },
        ],
      }),
    });
  } catch (err: any) {
    await recordSocialActionAttempt({ req, userId, action: "group_create", success: false, detail: "failed" });
    console.error("[SocialGroups/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_create_group" }, { status: 500 });
  }
}
