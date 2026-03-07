import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { SocialGroupBoardMember } from "@/types/social";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function parseGroupId(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isOffOrVac(shift: string | null | undefined) {
  return shift === "OFF" || shift === "VAC";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const { groupId: rawGroupId } = await params;
  const groupId = parseGroupId(rawGroupId);
  if (!groupId) return jsonNoStore({ ok: false, error: "invalid_group_id" }, { status: 400 });

  const url = new URL(req.url);
  const rawMonths = url.searchParams.get("months") ?? url.searchParams.get("month") ?? "";
  const monthList = rawMonths
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (monthList.length === 0 || monthList.length > 2) {
    return jsonNoStore({ ok: false, error: "invalid_month_format" }, { status: 400 });
  }

  const primaryMonth = monthList[0];
  const prefixes = monthList.map((m) => `${m}-`);
  const admin = getSupabaseAdmin();

  try {
    const [{ data: group, error: groupErr }, { data: membership, error: membershipErr }, { data: memberRows, error: memberErr }] = await Promise.all([
      (admin as any)
        .from("rnest_social_groups")
        .select("id, owner_user_id, name, description, created_at, updated_at")
        .eq("id", groupId)
        .maybeSingle(),
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

    if (groupErr) throw groupErr;
    if (membershipErr) throw membershipErr;
    if (memberErr) throw memberErr;
    if (!group) return jsonNoStore({ ok: false, error: "group_not_found" }, { status: 404 });
    if (!membership) return jsonNoStore({ ok: false, error: "not_group_member" }, { status: 403 });

    const members = memberRows ?? [];
    const memberIds = members.map((row: any) => String(row.user_id));

    const [{ data: profiles }, { data: prefs }, { data: states }] = await Promise.all([
      (admin as any)
        .from("rnest_social_profiles")
        .select("user_id, nickname, avatar_emoji, status_message")
        .in("user_id", memberIds),
      (admin as any)
        .from("rnest_social_preferences")
        .select("user_id, schedule_visibility, status_message_visible")
        .in("user_id", memberIds),
      (admin as any)
        .from("rnest_user_state")
        .select("user_id, payload")
        .in("user_id", memberIds),
    ]);

    const profileMap = new Map<string, { nickname: string; avatarEmoji: string; statusMessage: string }>();
    for (const row of profiles ?? []) {
      profileMap.set(String(row.user_id), {
        nickname: String(row.nickname ?? ""),
        avatarEmoji: String(row.avatar_emoji ?? "🐧"),
        statusMessage: String(row.status_message ?? ""),
      });
    }

    const prefMap = new Map<string, { scheduleVisibility: string; statusMessageVisible: boolean }>();
    for (const row of prefs ?? []) {
      prefMap.set(String(row.user_id), {
        scheduleVisibility: String(row.schedule_visibility ?? "full"),
        statusMessageVisible: row.status_message_visible !== false,
      });
    }

    const stateMap = new Map<string, Record<string, string>>();
    for (const row of states ?? []) {
      stateMap.set(String(row.user_id), ((row.payload as any)?.schedule ?? {}) as Record<string, string>);
    }

    let hiddenScheduleMemberCount = 0;
    const visibleOffSets: Set<string>[] = [];

    const boardMembers: SocialGroupBoardMember[] = members.map((row: any) => {
      const memberUserId = String(row.user_id);
      const pref = prefMap.get(memberUserId) ?? { scheduleVisibility: "full", statusMessageVisible: true };
      const profile = profileMap.get(memberUserId) ?? { nickname: "", avatarEmoji: "🐧", statusMessage: "" };
      const rawSchedule = stateMap.get(memberUserId) ?? {};
      const schedule: Record<string, string> = {};

      if (memberUserId === userId) {
        for (const [date, shift] of Object.entries(rawSchedule)) {
          if (prefixes.some((prefix) => date.startsWith(prefix)) && typeof shift === "string") {
            schedule[date] = shift;
          }
        }
      } else if (pref.scheduleVisibility !== "hidden") {
        for (const [date, shift] of Object.entries(rawSchedule)) {
          if (!prefixes.some((prefix) => date.startsWith(prefix)) || typeof shift !== "string") continue;
          if (pref.scheduleVisibility === "off_only" && !isOffOrVac(shift)) continue;
          schedule[date] = shift;
        }
      } else {
        hiddenScheduleMemberCount += 1;
      }

      const offSet = new Set(
        Object.entries(schedule)
          .filter(([, shift]) => isOffOrVac(shift))
          .map(([date]) => date)
      );
      if (offSet.size > 0 && (memberUserId === userId || pref.scheduleVisibility !== "hidden")) {
        visibleOffSets.push(offSet);
      }

      return {
        userId: memberUserId,
        nickname: profile.nickname,
        avatarEmoji: profile.avatarEmoji,
        statusMessage: memberUserId === userId || pref.statusMessageVisible ? profile.statusMessage : "",
        role: row.role === "owner" ? "owner" : "member",
        joinedAt: String(row.joined_at ?? group.created_at ?? new Date().toISOString()),
        schedule,
      };
    });

    let commonOffDays: string[] = [];
    if (visibleOffSets.length >= 2) {
      const primaryOffDays = Array.from(visibleOffSets[0]).filter((date) => date.startsWith(`${primaryMonth}-`));
      commonOffDays = primaryOffDays.filter((date) => visibleOffSets.every((set) => set.has(date))).sort();
    }

    const memberPreview = boardMembers.slice(0, 3).map((member: SocialGroupBoardMember) => ({
      userId: member.userId,
      nickname: member.nickname,
      avatarEmoji: member.avatarEmoji,
    }));

    return jsonNoStore({
      ok: true,
      data: {
        group: {
          id: Number(group.id),
          name: String(group.name ?? ""),
          description: String(group.description ?? ""),
          role: membership.role === "owner" ? "owner" : "member",
          ownerUserId: String(group.owner_user_id ?? ""),
          memberCount: boardMembers.length,
          joinedAt: String(membership.joined_at ?? group.created_at ?? new Date().toISOString()),
          memberPreview,
        },
        members: boardMembers,
        commonOffDays,
        hiddenScheduleMemberCount,
      },
    });
  } catch (err: any) {
    console.error("[SocialGroupBoard/GET] id=%d err=%s", groupId, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_group_board" }, { status: 500 });
  }
}
