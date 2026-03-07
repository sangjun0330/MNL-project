import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { SocialGroupBoardMember } from "@/types/social";
import {
  buildSocialGroupPermissions,
  computeMemberWeeklyVitals,
  getSocialGroupById,
  loadGroupActivities,
  loadPendingJoinRequests,
  loadSocialGroupProfileMap,
  mapSocialGroupSummary,
  normalizeSocialGroupRole,
  parseSocialGroupId,
} from "@/lib/server/socialGroups";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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
  const groupId = parseSocialGroupId(rawGroupId);
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

    const members = memberRows ?? [];
    const memberIds = members.map((row: any) => String(row.user_id));

    const memberRole = normalizeSocialGroupRole(membership.role);
    const permissions = buildSocialGroupPermissions(memberRole, group.allowMemberInvites);

    // 기존 쿼리 + health_visibility를 별도로 안전하게 로드
    const [profileMap, { data: prefs }, { data: states }, joinRequests, activities] = await Promise.all([
      loadSocialGroupProfileMap(admin, memberIds),
      (admin as any)
        .from("rnest_social_preferences")
        .select("user_id, schedule_visibility, status_message_visible")
        .in("user_id", memberIds),
      (admin as any)
        .from("rnest_user_state")
        .select("user_id, payload")
        .in("user_id", memberIds),
      permissions.canManageJoinRequests ? loadPendingJoinRequests(admin, groupId) : Promise.resolve([]),
      loadGroupActivities(admin, groupId, 24),
    ]);

    // health_visibility는 별도 쿼리로 안전하게 로드
    // (마이그레이션이 아직 적용 안 됐을 경우 전체 보드 API가 실패하지 않도록 격리)
    const healthVisMap = new Map<string, "full" | "hidden">();
    try {
      const { data: healthPrefs } = await (admin as any)
        .from("rnest_social_preferences")
        .select("user_id, health_visibility")
        .in("user_id", memberIds);
      for (const row of healthPrefs ?? []) {
        const vis = String(row.health_visibility ?? "hidden");
        healthVisMap.set(String(row.user_id), vis === "full" ? "full" : "hidden");
      }
    } catch {
      // 컬럼이 없으면 전원 'hidden' 기본값 (안전)
    }

    const prefMap = new Map<string, { scheduleVisibility: string; statusMessageVisible: boolean }>();
    for (const row of prefs ?? []) {
      prefMap.set(String(row.user_id), {
        scheduleVisibility: String(row.schedule_visibility ?? "full"),
        statusMessageVisible: row.status_message_visible !== false,
      });
    }

    // schedule + 전체 payload 맵 (vitals 계산용)
    const stateMap = new Map<string, Record<string, string>>();
    const fullPayloadMap = new Map<string, Record<string, unknown>>();
    for (const row of states ?? []) {
      const uid = String(row.user_id);
      stateMap.set(uid, ((row.payload as any)?.schedule ?? {}) as Record<string, string>);
      fullPayloadMap.set(uid, (row.payload ?? {}) as Record<string, unknown>);
    }

    // 오늘 ISO (서버 UTC 기준)
    const todayISO = new Date().toISOString().slice(0, 10);

    let hiddenScheduleMemberCount = 0;
    const visibleOffSets: Set<string>[] = [];

    const boardMembers: SocialGroupBoardMember[] = members.map((row: any) => {
      const memberUserId = String(row.user_id);
      const pref = prefMap.get(memberUserId) ?? { scheduleVisibility: "full", statusMessageVisible: true };
      const profile = profileMap.get(memberUserId) ?? { nickname: "", avatarEmoji: "🐧", statusMessage: "" };
      const rawSchedule = stateMap.get(memberUserId) ?? {};
      const healthVisibility = healthVisMap.get(memberUserId) ?? "hidden";
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

      // 건강 통계: health_visibility=full인 멤버만 계산
      let vitals = null;
      if (healthVisibility === "full") {
        const fullPayload = fullPayloadMap.get(memberUserId);
        if (fullPayload) {
          vitals = computeMemberWeeklyVitals(fullPayload, todayISO);
        }
      }

      return {
        userId: memberUserId,
        nickname: profile.nickname,
        avatarEmoji: profile.avatarEmoji,
        statusMessage: memberUserId === userId || pref.statusMessageVisible ? profile.statusMessage : "",
        role: normalizeSocialGroupRole(row.role),
        joinedAt: String(row.joined_at ?? group.createdAt ?? new Date().toISOString()),
        schedule,
        healthVisibility,
        vitals,
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
        group: mapSocialGroupSummary({
          group,
          membership,
          memberCount: boardMembers.length,
          memberPreview,
          pendingJoinRequestCount: joinRequests.length,
        }),
        members: boardMembers,
        commonOffDays,
        hiddenScheduleMemberCount,
        joinRequests,
        activities,
        permissions,
      },
    });
  } catch (err: any) {
    console.error("[SocialGroupBoard/GET] id=%d err=%s", groupId, String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_group_board" }, { status: 500 });
  }
}
