import { addDays, fromISODate, startOfWeekMonday, todayISO, toISODate } from "@/lib/date";
import type { SubscriptionSnapshot } from "@/lib/server/billingReadStore";
import { readSubscription } from "@/lib/server/billingReadStore";
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore";
import {
  computeMemberWeeklyVitals,
  getSocialGroupById,
  loadSocialGroupProfileMap,
  normalizeSocialGroupRole,
} from "@/lib/server/socialGroups";
import type { SocialGroupAIBriefSnapshot } from "@/lib/server/openaiSocialGroupBrief";
import type {
  HealthVisibility,
  MemberWeeklyVitals,
  ScheduleVisibility,
  SocialGroupAIBriefPayload,
  SocialGroupAIBriefPersonalCard,
  SocialGroupAIBriefResponse,
  SocialGroupAIBriefTone,
} from "@/types/social";

const SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION = "2026-04-04.social-group-brief.v1";
const SOCIAL_GROUP_AI_BRIEF_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type SocialGroupAIBriefRow = {
  group_id: number;
  week_start_iso: string;
  status: "ready" | "insufficient_data" | "failed";
  generator_type: "cron" | "manual";
  generated_at: string;
  model: string | null;
  prompt_version: string | null;
  contributor_count: number;
  opt_in_card_count: number;
  cooldown_until: string | null;
  payload: SocialGroupAIBriefPayload | null;
  usage: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

type ViewerPrefs = {
  hasEntitlement: boolean;
  healthShareEnabled: boolean;
  personalCardOptIn: boolean;
};

type BriefMemberContext = {
  userId: string;
  nickname: string;
  avatarEmoji: string;
  role: string;
  visibleWeekSchedule: Record<string, string>;
  healthVisibility: HealthVisibility;
  vitals: MemberWeeklyVitals | null;
  personalCardOptIn: boolean;
  hasPaidBriefAccess: boolean;
  hasProBriefAccess: boolean;
  hasAIConsent: boolean;
};

type GroupBriefContext = {
  week: {
    startISO: string;
    endISO: string;
    label: string;
    todayISO: string;
  };
  members: BriefMemberContext[];
  contributors: BriefMemberContext[];
  cardCandidates: BriefMemberContext[];
  commonOffDays: string[];
  todayNightCount: number;
  todayOffCount: number;
  hasPaidEligibleMember: boolean;
  hasProEligibleMember: boolean;
  metrics: {
    contributorCount: number;
    optInCardCount: number;
    avgBattery: number | null;
    avgSleep: number | null;
    avgMental: number | null;
    avgStress: number | null;
    avgActivity: number | null;
    avgCaffeine: number | null;
    warningCount: number;
    dangerCount: number;
    commonOffCount: number;
    nightCountToday: number;
    offCountToday: number;
  };
};

function isOffOrVac(shift: string | null | undefined) {
  return shift === "OFF" || shift === "VAC";
}

function roundOne(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function averageNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return roundOne(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function formatMonthDay(iso: string) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function buildWeekLabel(startISO: string, endISO: string) {
  return `${formatMonthDay(startISO)} - ${formatMonthDay(endISO)}`;
}

function getCurrentWeekWindow() {
  const today = todayISO();
  const start = toISODate(startOfWeekMonday(fromISODate(today)));
  const end = toISODate(addDays(fromISODate(start), 6));
  return {
    startISO: start,
    endISO: end,
    label: buildWeekLabel(start, end),
    todayISO: today,
  };
}

function toneFromMetrics(metrics: GroupBriefContext["metrics"]): SocialGroupAIBriefTone {
  if (metrics.dangerCount > 0) return "recover";
  if ((metrics.avgBattery ?? 100) < 40) return "recover";
  if (metrics.avgSleep != null && metrics.avgSleep < 5.8) return "recover";
  if (metrics.warningCount > 0) return "watch";
  if ((metrics.avgBattery ?? 100) < 62) return "watch";
  if (metrics.avgSleep != null && metrics.avgSleep < 6.7) return "watch";
  return "steady";
}

function buildBasePayload(input: {
  week: GroupBriefContext["week"];
  metrics: GroupBriefContext["metrics"];
  tone: SocialGroupAIBriefTone;
}): SocialGroupAIBriefPayload {
  return {
    week: {
      startISO: input.week.startISO,
      endISO: input.week.endISO,
      label: input.week.label,
    },
    hero: {
      headline: "이번 주 그룹 흐름을 준비 중이에요.",
      subheadline: "브리프를 생성하면 이번 주 회복 패턴을 한눈에 볼 수 있어요.",
      tone: input.tone,
    },
    metrics: {
      contributorCount: input.metrics.contributorCount,
      optInCardCount: input.metrics.optInCardCount,
      avgBattery: input.metrics.avgBattery,
      avgSleep: input.metrics.avgSleep,
      warningCount: input.metrics.warningCount,
      dangerCount: input.metrics.dangerCount,
      commonOffCount: input.metrics.commonOffCount,
      nightCountToday: input.metrics.nightCountToday,
      offCountToday: input.metrics.offCountToday,
    },
    findings: [],
    actions: [],
    windows: [],
    personalCards: [],
  };
}

function hasRenderableBrief(payload: SocialGroupAIBriefPayload | null | undefined) {
  return Boolean(
    payload &&
      payload.hero &&
      payload.findings.length === 3 &&
      payload.actions.length === 3
  );
}

function statusLabelForMember(member: BriefMemberContext) {
  const avgBattery = member.vitals?.weeklyAvgBattery ?? null;
  const avgSleep = member.vitals?.weeklyAvgSleep ?? null;
  if (member.vitals?.burnoutLevel === "danger" || (avgBattery != null && avgBattery < 40) || (avgSleep != null && avgSleep < 5.8)) {
    return "회복 우선" as const;
  }
  if (member.vitals?.burnoutLevel === "warning" || (avgBattery != null && avgBattery < 58) || (avgSleep != null && avgSleep < 6.6)) {
    return "주의" as const;
  }
  return "안정" as const;
}

function compareCardCandidates(a: BriefMemberContext, b: BriefMemberContext) {
  const rank = (value: BriefMemberContext) =>
    value.vitals?.burnoutLevel === "danger" ? 0 : value.vitals?.burnoutLevel === "warning" ? 1 : 2;
  const rankDiff = rank(a) - rank(b);
  if (rankDiff !== 0) return rankDiff;
  const batteryDiff = (a.vitals?.weeklyAvgBattery ?? 999) - (b.vitals?.weeklyAvgBattery ?? 999);
  if (batteryDiff !== 0) return batteryDiff;
  const sleepDiff = (a.vitals?.weeklyAvgSleep ?? 999) - (b.vitals?.weeklyAvgSleep ?? 999);
  if (sleepDiff !== 0) return sleepDiff;
  return a.nickname.localeCompare(b.nickname, "ko");
}

async function readCachedSubscription(
  userId: string,
  cache: Map<string, SubscriptionSnapshot | null>,
  strict = false
) {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  try {
    const subscription = await readSubscription(userId);
    cache.set(userId, subscription);
    return subscription;
  } catch (error) {
    if (strict) throw error;
    console.error("[SocialGroupAIBrief] readSubscription failed user=%s err=%s", String(userId).slice(0, 8), String((error as any)?.message ?? error));
    cache.set(userId, null);
    return null;
  }
}

async function loadViewerPrefs(args: {
  admin: any;
  groupId: number;
  userId: string;
  subscriptionCache: Map<string, SubscriptionSnapshot | null>;
  strictSubscription?: boolean;
}): Promise<ViewerPrefs> {
  const [{ data: membership, error: membershipErr }, { data: pref }, { data: cardPref }, subscription] = await Promise.all([
    (args.admin as any)
      .from("rnest_social_group_members")
      .select("user_id")
      .eq("group_id", args.groupId)
      .eq("user_id", args.userId)
      .maybeSingle(),
    (args.admin as any)
      .from("rnest_social_preferences")
      .select("health_visibility")
      .eq("user_id", args.userId)
      .maybeSingle(),
    (args.admin as any)
      .from("rnest_social_group_ai_card_prefs")
      .select("personal_card_opt_in")
      .eq("group_id", args.groupId)
      .eq("user_id", args.userId)
      .maybeSingle(),
    readCachedSubscription(args.userId, args.subscriptionCache, args.strictSubscription === true),
  ]);

  if (membershipErr) throw membershipErr;
  if (!membership) {
    const error = new Error("not_group_member");
    (error as any).code = "not_group_member";
    throw error;
  }

  return {
    hasEntitlement: subscription?.entitlements.socialGroupBrief === true,
    healthShareEnabled: String(pref?.health_visibility ?? "hidden") === "full",
    personalCardOptIn: cardPref?.personal_card_opt_in === true,
  };
}

async function loadGroupBriefContext(args: {
  admin: any;
  groupId: number;
  subscriptionCache: Map<string, SubscriptionSnapshot | null>;
}): Promise<GroupBriefContext> {
  const group = await getSocialGroupById(args.admin, args.groupId);
  if (!group) {
    const error = new Error("group_not_found");
    (error as any).code = "group_not_found";
    throw error;
  }

  const { data: memberRows, error: memberErr } = await (args.admin as any)
    .from("rnest_social_group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", args.groupId)
    .order("joined_at", { ascending: true });
  if (memberErr) throw memberErr;

  const memberIds = (memberRows ?? []).map((row: any) => String(row.user_id)).filter(Boolean);
  const [profileMap, { data: prefRows }, { data: stateRows }, { data: optInRows }] = await Promise.all([
    loadSocialGroupProfileMap(args.admin, memberIds),
    (args.admin as any)
      .from("rnest_social_preferences")
      .select("user_id, schedule_visibility, health_visibility")
      .in("user_id", memberIds),
    (args.admin as any)
      .from("rnest_user_state")
      .select("user_id, payload")
      .in("user_id", memberIds),
    (args.admin as any)
      .from("rnest_social_group_ai_card_prefs")
      .select("user_id, personal_card_opt_in")
      .eq("group_id", args.groupId),
  ]);

  const prefMap = new Map<string, { scheduleVisibility: ScheduleVisibility; healthVisibility: HealthVisibility }>();
  for (const row of prefRows ?? []) {
    prefMap.set(String(row.user_id), {
      scheduleVisibility: row.schedule_visibility === "hidden" || row.schedule_visibility === "off_only" ? row.schedule_visibility : "full",
      healthVisibility: row.health_visibility === "full" ? "full" : "hidden",
    });
  }

  const payloadMap = new Map<string, Record<string, unknown>>();
  for (const row of stateRows ?? []) {
    payloadMap.set(String(row.user_id), (row.payload ?? {}) as Record<string, unknown>);
  }

  const optInMap = new Map<string, boolean>();
  for (const row of optInRows ?? []) {
    optInMap.set(String(row.user_id), row.personal_card_opt_in === true);
  }

  const subscriptions = await Promise.all(
    memberIds.map(async (userId: string) => [userId, await readCachedSubscription(userId, args.subscriptionCache)] as const)
  );
  const subscriptionMap = new Map<string, SubscriptionSnapshot | null>(subscriptions);
  const consentPairs = await Promise.all(
    memberIds.map(async (userId: string) => [userId, await userHasCompletedServiceConsent(userId)] as const)
  );
  const consentMap = new Map<string, boolean>(consentPairs);

  const week = getCurrentWeekWindow();
  const visibleOffSets: Set<string>[] = [];

  const members: BriefMemberContext[] = (memberRows ?? []).map((row: any) => {
    const userId = String(row.user_id);
    const payload = payloadMap.get(userId) ?? {};
    const rawSchedule = ((payload.schedule ?? {}) as Record<string, string>) ?? {};
    const pref = prefMap.get(userId) ?? {
      scheduleVisibility: "full" as ScheduleVisibility,
      healthVisibility: "hidden" as HealthVisibility,
    };
    const visibleWeekSchedule: Record<string, string> = {};

    for (const [date, shift] of Object.entries(rawSchedule)) {
      if (typeof shift !== "string") continue;
      if (date < week.startISO || date > week.endISO) continue;
      if (pref.scheduleVisibility === "hidden") continue;
      if (pref.scheduleVisibility === "off_only" && !isOffOrVac(shift)) continue;
      visibleWeekSchedule[date] = shift;
    }

    const offSet = new Set(
      Object.entries(visibleWeekSchedule)
        .filter(([, shift]) => isOffOrVac(shift))
        .map(([date]) => date)
    );
    if (offSet.size > 0) visibleOffSets.push(offSet);

    const vitals = pref.healthVisibility === "full" ? computeMemberWeeklyVitals(payload, week.todayISO) : null;
    const profile = profileMap.get(userId);
    const subscription: SubscriptionSnapshot | null = subscriptionMap.get(userId) ?? null;
    const hasAIConsent = consentMap.get(userId) === true;
    return {
      userId,
      nickname: profile?.nickname ?? "",
      avatarEmoji: profile?.avatarEmoji ?? "🐧",
      role: normalizeSocialGroupRole(row.role),
      visibleWeekSchedule,
      healthVisibility: pref.healthVisibility,
      vitals,
      personalCardOptIn: optInMap.get(userId) === true,
      hasPaidBriefAccess: subscription?.entitlements.socialGroupBrief === true,
      hasProBriefAccess: subscription?.entitlements.socialGroupBrief === true && subscription?.tier === "pro" && subscription?.hasPaidAccess === true,
      hasAIConsent,
    };
  });

  const contributors = members.filter(
    (member) => member.healthVisibility === "full" && member.vitals !== null && member.hasAIConsent
  );
  const allCardEligibleMembers = contributors.filter((member) => member.personalCardOptIn).sort(compareCardCandidates);
  const cardCandidates = allCardEligibleMembers.slice(0, 5);
  const commonOffDays =
    visibleOffSets.length >= 2
      ? Array.from(visibleOffSets[0]).filter((date) => visibleOffSets.every((set) => set.has(date))).sort().slice(0, 3)
      : [];

  const metrics = {
    contributorCount: contributors.length,
    optInCardCount: allCardEligibleMembers.length,
    avgBattery: averageNullable(contributors.map((member) => member.vitals?.weeklyAvgBattery ?? null)),
    avgSleep: averageNullable(contributors.map((member) => member.vitals?.weeklyAvgSleep ?? null)),
    avgMental: averageNullable(contributors.map((member) => member.vitals?.weeklyAvgMental ?? null)),
    avgStress: averageNullable(contributors.map((member) => member.vitals?.weeklyAvgStress ?? null)),
    avgActivity: averageNullable(contributors.map((member) => member.vitals?.weeklyAvgActivity ?? null)),
    avgCaffeine: averageNullable(contributors.map((member) => member.vitals?.weeklyAvgCaffeine ?? null)),
    warningCount: contributors.filter((member) => member.vitals?.burnoutLevel === "warning").length,
    dangerCount: contributors.filter((member) => member.vitals?.burnoutLevel === "danger").length,
    commonOffCount: commonOffDays.length,
    nightCountToday: members.filter((member) => member.visibleWeekSchedule[week.todayISO] === "N").length,
    offCountToday: members.filter((member) => isOffOrVac(member.visibleWeekSchedule[week.todayISO])).length,
  };

  return {
    week,
    members,
    contributors,
    cardCandidates,
    commonOffDays,
    todayNightCount: metrics.nightCountToday,
    todayOffCount: metrics.offCountToday,
    hasPaidEligibleMember: members.some((member) => member.hasPaidBriefAccess && member.hasAIConsent),
    hasProEligibleMember: members.some((member) => member.hasProBriefAccess && member.hasAIConsent),
    metrics,
  };
}

async function readBriefRow(admin: any, groupId: number, weekStartISO: string): Promise<SocialGroupAIBriefRow | null> {
  const { data, error } = await (admin as any)
    .from("rnest_social_group_ai_briefs")
    .select("*")
    .eq("group_id", groupId)
    .eq("week_start_iso", weekStartISO)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as SocialGroupAIBriefRow | null;
}

async function upsertBriefRow(admin: any, row: SocialGroupAIBriefRow) {
  const payload = {
    ...row,
    updated_at: new Date().toISOString(),
  };
  const { error } = await (admin as any)
    .from("rnest_social_group_ai_briefs")
    .upsert(payload, { onConflict: "group_id,week_start_iso" });
  if (error) throw error;
}

function buildSnapshot(context: GroupBriefContext): SocialGroupAIBriefSnapshot {
  const tone = toneFromMetrics(context.metrics);
  const avgBatteryLabel = context.metrics.avgBattery != null ? `${context.metrics.avgBattery}점` : "기록 부족";
  const avgSleepLabel = context.metrics.avgSleep != null ? `${context.metrics.avgSleep}시간` : "기록 부족";
  const riskLabel = `주의 ${context.metrics.warningCount}명 · 회복 우선 ${context.metrics.dangerCount}명`;
  const scheduleLabel =
    context.commonOffDays.length > 0
      ? `공통 OFF ${context.commonOffDays.length}일`
      : `오늘 OFF ${context.metrics.offCountToday}명 · 야간 ${context.metrics.nightCountToday}명`;

  const heroHeadline =
    tone === "recover"
      ? "이번 주는 회복 여백을 먼저 챙겨야 하는 흐름이에요."
      : tone === "watch"
        ? "이번 주는 리듬을 정리하면 훨씬 수월해질 수 있어요."
        : "이번 주 그룹 흐름은 비교적 안정적으로 유지되고 있어요.";
  const heroSubheadline =
    tone === "recover"
      ? "무리한 일정 추가보다 공통 쉬는 창과 낮은 부담 운영이 먼저 필요합니다."
      : tone === "watch"
        ? "야간과 수면 패턴이 겹치는 구간만 먼저 정리해도 체감 부담이 줄어듭니다."
        : "지금의 회복 흐름을 유지하면서 같이 쉬는 창을 잘 활용하면 좋습니다.";

  return {
    week: {
      startISO: context.week.startISO,
      endISO: context.week.endISO,
      label: context.week.label,
    },
    metrics: context.metrics,
    hero: {
      tone,
      defaultHeadline: heroHeadline,
      defaultSubheadline: heroSubheadline,
    },
    findings: [
      {
        id: "energy",
        tone,
        factLabel: `${avgBatteryLabel} · ${avgSleepLabel}`,
        factText: `기여 멤버 기준 최근 7일 평균 배터리는 ${avgBatteryLabel}, 평균 수면은 ${avgSleepLabel}입니다.`,
        defaultTitle: "이번 주 기본 체력 흐름",
        defaultBody: `최근 7일 평균 배터리는 ${avgBatteryLabel}, 평균 수면은 ${avgSleepLabel}입니다. 이번 주에는 기본 회복 리듬을 먼저 안정시키는 편이 좋습니다.`,
      },
      {
        id: "risk",
        tone: context.metrics.dangerCount > 0 ? "recover" : context.metrics.warningCount > 0 ? "watch" : "steady",
        factLabel: riskLabel,
        factText: `최근 7일 기준 번아웃 warning ${context.metrics.warningCount}명, danger ${context.metrics.dangerCount}명입니다.`,
        defaultTitle: "주의가 필요한 구간",
        defaultBody: `최근 7일 기준으로 ${riskLabel}입니다. 일정 강도를 올리기보다 낮은 부담 운영과 짧은 체크인이 더 잘 맞는 주입니다.`,
      },
      {
        id: "schedule",
        tone: context.commonOffDays.length > 0 ? "steady" : context.metrics.nightCountToday > 0 ? "watch" : "steady",
        factLabel: scheduleLabel,
        factText:
          context.commonOffDays.length > 0
            ? `이번 주 공개 일정 기준으로 함께 쉬는 창이 ${context.commonOffDays.length}일 있습니다.`
            : `오늘 공개 일정 기준으로 OFF/VAC ${context.metrics.offCountToday}명, 야간 ${context.metrics.nightCountToday}명입니다.`,
        defaultTitle: "같이 맞추기 좋은 일정 흐름",
        defaultBody:
          context.commonOffDays.length > 0
            ? `이번 주 공개 일정 기준으로 함께 쉬는 창이 ${context.commonOffDays.length}일 있습니다. 짧게라도 같은 타이밍에 쉬는 창을 잡아두면 운영이 한결 편해집니다.`
            : `오늘 공개 일정 기준으로 OFF/VAC ${context.metrics.offCountToday}명, 야간 ${context.metrics.nightCountToday}명입니다. 공개된 일정만 놓고 보면 리듬 차이가 있어 짧은 조율이 필요합니다.`,
      },
    ],
    actions: [
      {
        id: "window",
        reason: context.commonOffDays.length > 0 ? "공통 OFF가 있습니다." : "공통 OFF가 적습니다.",
        factText:
          context.commonOffDays.length > 0
            ? `공개 일정 기준 공통 OFF ${context.commonOffDays.length}일을 먼저 확보해 보세요.`
            : "이번 주는 공개 일정상 공통 OFF가 거의 없으니 짧은 회복 창을 먼저 정하는 편이 좋습니다.",
        defaultTitle: context.commonOffDays.length > 0 ? "공통 쉬는 창 먼저 확보" : "짧은 회복 창부터 선점",
        defaultBody:
          context.commonOffDays.length > 0
            ? "공개 일정 기준으로 겹치는 쉬는 날을 먼저 정하고, 그 시간엔 새 약속보다 회복 시간을 우선으로 잡아두세요."
            : "이번 주는 길게 맞추기보다 15~30분이라도 같은 회복 창을 먼저 정해 두는 편이 부담이 적습니다.",
      },
      {
        id: "load",
        reason: context.metrics.dangerCount > 0 || context.metrics.warningCount > 0 ? "회복 우선 멤버가 있습니다." : "안정 흐름을 유지하는 주입니다.",
        factText:
          context.metrics.dangerCount > 0 || context.metrics.warningCount > 0
            ? "부담이 몰리는 멤버가 있어 이번 주는 낮은 강도의 운영이 더 잘 맞습니다."
            : "큰 경고 신호는 적으니 지금의 운영 강도를 유지하는 것이 좋습니다.",
        defaultTitle: context.metrics.dangerCount > 0 || context.metrics.warningCount > 0 ? "낮은 부담 운영으로 조정" : "지금 리듬 유지",
        defaultBody:
          context.metrics.dangerCount > 0 || context.metrics.warningCount > 0
            ? "회복 우선 멤버가 있는 주에는 추가 일정이나 과한 챌린지보다, 기본 회복 리듬을 지키는 편이 전체 흐름에 도움이 됩니다."
            : "큰 변화를 주기보다 현재 리듬을 유지하고, 쉬는 창을 너무 잘게 쪼개지 않도록만 관리해 주세요.",
      },
      {
        id: "sleep",
        reason:
          context.metrics.avgSleep != null && context.metrics.avgSleep < 6.5
            ? "평균 수면이 짧습니다."
            : context.metrics.nightCountToday > 0
              ? "오늘 야간 근무가 있습니다."
              : "야간 부담이 크지 않습니다.",
        factText:
          context.metrics.avgSleep != null && context.metrics.avgSleep < 6.5
            ? `평균 수면이 ${context.metrics.avgSleep}시간 수준이라 수면 보존이 우선입니다.`
            : context.metrics.nightCountToday > 0
              ? `오늘 야간 근무가 ${context.metrics.nightCountToday}명 있어 야간 뒤 리듬 관리가 중요합니다.`
              : "이번 주는 수면 리듬만 흐트러지지 않게 유지해도 충분합니다.",
        defaultTitle:
          context.metrics.avgSleep != null && context.metrics.avgSleep < 6.5
            ? "수면 보존을 우선 순위로"
            : context.metrics.nightCountToday > 0
              ? "야간 뒤 리듬 정리"
              : "기본 수면 리듬 유지",
        defaultBody:
          context.metrics.avgSleep != null && context.metrics.avgSleep < 6.5
            ? "짧은 수면이 이어지는 주에는 약속과 카페인 컷오프를 보수적으로 잡고, 수면 시간을 먼저 보호하는 편이 좋습니다."
            : context.metrics.nightCountToday > 0
              ? "야간 다음날은 활동을 많이 늘리기보다 수면과 식사 타이밍을 단순하게 유지하는 쪽이 더 안정적입니다."
              : "이번 주는 과한 보충 전략보다 취침 시간과 기상 흐름을 크게 흔들지 않는 것이 핵심입니다.",
      },
    ],
    windows: context.commonOffDays.map((dateISO) => ({
      dateISO,
      label: formatMonthDay(dateISO),
      reason: "공개 일정 기준으로 여러 멤버가 OFF/VAC인 날입니다.",
    })),
    personalCards: context.cardCandidates.map((member) => {
      const statusLabel = statusLabelForMember(member);
      const avgBattery = member.vitals?.weeklyAvgBattery != null ? `${member.vitals.weeklyAvgBattery}점` : "기록 부족";
      const avgSleep = member.vitals?.weeklyAvgSleep != null ? `${member.vitals.weeklyAvgSleep}시간` : "기록 부족";
      return {
        userId: member.userId,
        nickname: member.nickname || "익명",
        avatarEmoji: member.avatarEmoji || "🐧",
        statusLabel,
        summaryFact: `최근 7일 평균 배터리 ${avgBattery}, 평균 수면 ${avgSleep} 흐름입니다.`,
        actionFact:
          statusLabel === "회복 우선"
            ? "짧은 일정도 줄이고 연속된 쉬는 창을 먼저 확보하는 편이 좋습니다."
            : statusLabel === "주의"
              ? "이번 주는 회복 시간을 먼저 고정하고 새 약속은 가볍게 잡는 편이 좋습니다."
              : "지금 리듬을 유지하면서 쉬는 창을 너무 잘게 나누지 않는 편이 좋습니다.",
        defaultSummary:
          statusLabel === "회복 우선"
            ? `최근 7일 평균 배터리 ${avgBattery}, 평균 수면 ${avgSleep} 흐름이라 이번 주는 회복 여백을 우선으로 두는 편이 좋습니다.`
            : statusLabel === "주의"
              ? `최근 7일 평균 배터리 ${avgBattery}, 평균 수면 ${avgSleep} 흐름이라 무리한 일정 추가는 피하는 편이 좋습니다.`
              : `최근 7일 평균 배터리 ${avgBattery}, 평균 수면 ${avgSleep} 흐름으로 비교적 안정적인 주간 리듬을 유지하고 있습니다.`,
        defaultAction:
          statusLabel === "회복 우선"
            ? "가능하면 연속 휴식 시간을 먼저 확보하고, 회복이 필요한 날엔 그룹 일정도 가볍게 조정해 보세요."
            : statusLabel === "주의"
              ? "짧은 회복 창을 먼저 확보하고, 체력 소모가 큰 일정은 하루에 몰지 않는 편이 좋습니다."
              : "현재 회복 흐름을 유지하면서 쉬는 창 하나는 고정해 두는 편이 좋습니다.",
      };
    }),
  };
}

function buildDeterministicBriefPayload(context: GroupBriefContext): SocialGroupAIBriefPayload {
  const snapshot = buildSnapshot(context);
  return {
    week: snapshot.week,
    hero: {
      headline: snapshot.hero.defaultHeadline,
      subheadline: snapshot.hero.defaultSubheadline,
      tone: snapshot.hero.tone,
    },
    metrics: {
      contributorCount: context.metrics.contributorCount,
      optInCardCount: context.metrics.optInCardCount,
      avgBattery: context.metrics.avgBattery,
      avgSleep: context.metrics.avgSleep,
      warningCount: context.metrics.warningCount,
      dangerCount: context.metrics.dangerCount,
      commonOffCount: context.metrics.commonOffCount,
      nightCountToday: context.metrics.nightCountToday,
      offCountToday: context.metrics.offCountToday,
    },
    findings: snapshot.findings.map((item) => ({
      id: item.id,
      title: item.defaultTitle,
      body: item.defaultBody,
      tone: item.tone,
      factLabel: item.factLabel,
    })),
    actions: snapshot.actions.map((item) => ({
      id: item.id,
      title: item.defaultTitle,
      body: item.defaultBody,
      reason: item.reason,
    })),
    windows: snapshot.windows,
    personalCards: snapshot.personalCards.map((item) => ({
      userId: item.userId,
      nickname: item.nickname,
      avatarEmoji: item.avatarEmoji,
      statusLabel: item.statusLabel,
      summary: item.defaultSummary,
      action: item.defaultAction,
    })),
  };
}

function filterPayloadForReadTimePrivacy(
  payload: SocialGroupAIBriefPayload,
  context: GroupBriefContext
): SocialGroupAIBriefPayload {
  const eligibleCardIds = new Set(
    context.contributors
      .filter((member) => member.personalCardOptIn)
      .sort(compareCardCandidates)
      .slice(0, 3)
      .map((member) => member.userId)
  );
  const personalCards = payload.personalCards.filter((item) => eligibleCardIds.has(item.userId)).slice(0, 3);
  return {
    ...payload,
    metrics: {
      ...payload.metrics,
      optInCardCount: personalCards.length,
    },
    personalCards,
  };
}

function buildRow(args: {
  groupId: number;
  context: GroupBriefContext;
  status: SocialGroupAIBriefRow["status"];
  generatorType: SocialGroupAIBriefRow["generator_type"];
  model: string | null;
  promptVersion: string | null;
  payload: SocialGroupAIBriefPayload;
  usage: Record<string, unknown> | null;
  generatedAt?: string;
  cooldownUntil?: string | null;
}): SocialGroupAIBriefRow {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  return {
    group_id: args.groupId,
    week_start_iso: args.context.week.startISO,
    status: args.status,
    generator_type: args.generatorType,
    generated_at: generatedAt,
    model: args.model,
    prompt_version: args.promptVersion,
    contributor_count: args.context.metrics.contributorCount,
    opt_in_card_count: args.context.metrics.optInCardCount,
    cooldown_until: args.cooldownUntil ?? null,
    payload: args.payload,
    usage: args.usage,
  };
}

export async function generateGroupAIBriefArtifact(args: {
  admin?: any;
  groupId: number;
  generatorType: "cron" | "manual";
  subscriptionCache?: Map<string, SubscriptionSnapshot | null>;
  existingRow?: SocialGroupAIBriefRow | null;
}): Promise<SocialGroupAIBriefRow | null> {
  const admin = args.admin;
  const subscriptionCache = args.subscriptionCache ?? new Map<string, SubscriptionSnapshot | null>();
  const context = await loadGroupBriefContext({
    admin,
    groupId: args.groupId,
    subscriptionCache,
  });

  if (!context.hasPaidEligibleMember) {
    return null;
  }

  const cooldownUntil =
    args.generatorType === "manual" ? new Date(Date.now() + SOCIAL_GROUP_AI_BRIEF_COOLDOWN_MS).toISOString() : null;
  const tone = toneFromMetrics(context.metrics);
  const basePayload = buildBasePayload({ week: context.week, metrics: context.metrics, tone });

  if (context.metrics.contributorCount < 3) {
    return buildRow({
      groupId: args.groupId,
      context,
      status: "insufficient_data",
      generatorType: args.generatorType,
      model: null,
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
      payload: basePayload,
      usage: null,
      cooldownUntil,
    });
  }

  const snapshot = buildSnapshot(context);
  const model = context.hasProEligibleMember ? "gpt-5.4" : "gpt-5.2";
  const controller = new AbortController();
  try {
    const { generateSocialGroupBriefCopy } = await import("@/lib/server/openaiSocialGroupBrief");
    const aiResult = await generateSocialGroupBriefCopy({
      snapshot,
      model,
      signal: controller.signal,
    });

    if (aiResult.ok) {
      return buildRow({
        groupId: args.groupId,
        context,
        status: "ready",
        generatorType: args.generatorType,
        model: aiResult.model,
        promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
        payload: {
          week: snapshot.week,
          hero: aiResult.content.hero,
          metrics: {
            contributorCount: context.metrics.contributorCount,
            optInCardCount: context.metrics.optInCardCount,
            avgBattery: context.metrics.avgBattery,
            avgSleep: context.metrics.avgSleep,
            warningCount: context.metrics.warningCount,
            dangerCount: context.metrics.dangerCount,
            commonOffCount: context.metrics.commonOffCount,
            nightCountToday: context.metrics.nightCountToday,
            offCountToday: context.metrics.offCountToday,
          },
          findings: aiResult.content.findings,
          actions: aiResult.content.actions,
          windows: aiResult.content.windows,
          personalCards: aiResult.content.personalCards,
        },
        usage: aiResult.usage as unknown as Record<string, unknown> | null,
        cooldownUntil,
      });
    }

    const fallbackPayload = buildDeterministicBriefPayload(context);
    return buildRow({
      groupId: args.groupId,
      context,
      status: "ready",
      generatorType: args.generatorType,
      model: aiResult.model,
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
      payload: fallbackPayload,
      usage: { fallbackReason: aiResult.error },
      cooldownUntil,
    });
  } catch (error) {
    const existingRow = args.existingRow ?? null;
    if (existingRow && hasRenderableBrief(existingRow.payload)) {
      return {
        ...existingRow,
        status: "failed",
        generator_type: args.generatorType,
        model: context.hasProEligibleMember ? "gpt-5.4" : "gpt-5.2",
        prompt_version: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
        cooldown_until: cooldownUntil,
        usage: {
          ...(existingRow.usage ?? {}),
          error: String((error as any)?.message ?? error ?? "group_ai_brief_generation_failed"),
          stale: true,
        },
      };
    }
    return buildRow({
      groupId: args.groupId,
      context,
      status: "failed",
      generatorType: args.generatorType,
      model: context.hasProEligibleMember ? "gpt-5.4" : "gpt-5.2",
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
      payload: basePayload,
      usage: { error: String((error as any)?.message ?? error ?? "group_ai_brief_generation_failed") },
      cooldownUntil,
    });
  }
}

function buildResponse(args: {
  row: SocialGroupAIBriefRow | null;
  viewer: ViewerPrefs;
  context: GroupBriefContext | null;
}): SocialGroupAIBriefResponse {
  const cooldownUntil = args.row?.cooldown_until ? Date.parse(args.row.cooldown_until) : null;
  const canRefresh = args.viewer.hasEntitlement && (!cooldownUntil || cooldownUntil <= Date.now());

  if (!args.viewer.hasEntitlement) {
    return {
      state: "locked",
      generatedAt: null,
      stale: false,
      viewer: {
        hasEntitlement: false,
        canRefresh: false,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      brief: null,
      errorCode: null,
    };
  }

  if (args.context && args.context.metrics.contributorCount < 3) {
    return {
      state: "insufficient_data",
      generatedAt: args.row?.generated_at ?? null,
      stale: false,
      viewer: {
        hasEntitlement: true,
        canRefresh,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      brief: null,
      errorCode: "insufficient_group_ai_brief_data",
    };
  }

  if (!args.row) {
    return {
      state: "failed",
      generatedAt: null,
      stale: false,
      viewer: {
        hasEntitlement: true,
        canRefresh,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      brief: null,
      errorCode: "group_ai_brief_missing",
    };
  }

  if (args.row.status === "insufficient_data") {
    return {
      state: "insufficient_data",
      generatedAt: args.row.generated_at,
      stale: false,
      viewer: {
        hasEntitlement: true,
        canRefresh,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      brief: null,
      errorCode: "insufficient_group_ai_brief_data",
    };
  }

  if (args.row.status === "failed") {
    if (args.row.payload && hasRenderableBrief(args.row.payload) && args.context) {
      return {
        state: "ready",
        generatedAt: args.row.generated_at,
        stale: true,
        viewer: {
          hasEntitlement: true,
          canRefresh,
          healthShareEnabled: args.viewer.healthShareEnabled,
          personalCardOptIn: args.viewer.personalCardOptIn,
        },
        brief: filterPayloadForReadTimePrivacy(args.row.payload, args.context),
        errorCode: "group_ai_brief_generation_failed",
      };
    }
    return {
      state: "failed",
      generatedAt: args.row.generated_at,
      stale: false,
      viewer: {
        hasEntitlement: true,
        canRefresh,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      brief: null,
      errorCode: "group_ai_brief_generation_failed",
    };
  }

  return {
    state: "ready",
    generatedAt: args.row.generated_at,
    stale: false,
    viewer: {
      hasEntitlement: true,
      canRefresh,
      healthShareEnabled: args.viewer.healthShareEnabled,
      personalCardOptIn: args.viewer.personalCardOptIn,
    },
    brief: args.row.payload && args.context ? filterPayloadForReadTimePrivacy(args.row.payload, args.context) : args.row.payload,
    errorCode: null,
  };
}

export async function getCurrentGroupAIBrief(args: {
  admin: any;
  groupId: number;
  userId: string;
  subscriptionCache?: Map<string, SubscriptionSnapshot | null>;
}): Promise<SocialGroupAIBriefResponse> {
  const subscriptionCache = args.subscriptionCache ?? new Map<string, SubscriptionSnapshot | null>();
  const viewer = await loadViewerPrefs({
    admin: args.admin,
    groupId: args.groupId,
    userId: args.userId,
    subscriptionCache,
    strictSubscription: true,
  });
  const week = getCurrentWeekWindow();
  const row = await readBriefRow(args.admin, args.groupId, week.startISO);
  const context = viewer.hasEntitlement ? await loadGroupBriefContext({ admin: args.admin, groupId: args.groupId, subscriptionCache }) : null;
  return buildResponse({ row, viewer, context });
}

export async function refreshCurrentGroupAIBrief(args: {
  admin: any;
  groupId: number;
  userId: string;
}): Promise<SocialGroupAIBriefResponse> {
  const subscriptionCache = new Map<string, SubscriptionSnapshot | null>();
  const viewer = await loadViewerPrefs({
    admin: args.admin,
    groupId: args.groupId,
    userId: args.userId,
    subscriptionCache,
  });
  if (!viewer.hasEntitlement) {
    const error = new Error("paid_plan_required_for_group_ai_brief");
    (error as any).code = "paid_plan_required_for_group_ai_brief";
    throw error;
  }

  const week = getCurrentWeekWindow();
  const existingRow = await readBriefRow(args.admin, args.groupId, week.startISO);
  if (existingRow?.cooldown_until && Date.parse(existingRow.cooldown_until) > Date.now()) {
    const error = new Error("group_ai_brief_refresh_cooldown");
    (error as any).code = "group_ai_brief_refresh_cooldown";
    throw error;
  }

  const generated = await generateGroupAIBriefArtifact({
    admin: args.admin,
    groupId: args.groupId,
    generatorType: "manual",
    subscriptionCache,
    existingRow,
  });
  if (!generated) {
    const error = new Error("group_ai_brief_generation_failed");
    (error as any).code = "group_ai_brief_generation_failed";
    throw error;
  }
  await upsertBriefRow(args.admin, generated);

  const context = await loadGroupBriefContext({
    admin: args.admin,
    groupId: args.groupId,
    subscriptionCache,
  });
  return buildResponse({ row: generated, viewer, context });
}

export async function readGroupAIBriefViewerPrefs(args: {
  admin: any;
  groupId: number;
  userId: string;
}): Promise<{ healthShareEnabled: boolean; personalCardOptIn: boolean }> {
  const viewer = await loadViewerPrefs({
    admin: args.admin,
    groupId: args.groupId,
    userId: args.userId,
    subscriptionCache: new Map<string, SubscriptionSnapshot | null>(),
    strictSubscription: false,
  });
  return {
    healthShareEnabled: viewer.healthShareEnabled,
    personalCardOptIn: viewer.personalCardOptIn,
  };
}

export async function saveGroupAIBriefViewerPrefs(args: {
  admin: any;
  groupId: number;
  userId: string;
  personalCardOptIn: boolean;
}): Promise<{ healthShareEnabled: boolean; personalCardOptIn: boolean }> {
  const viewer = await loadViewerPrefs({
    admin: args.admin,
    groupId: args.groupId,
    userId: args.userId,
    subscriptionCache: new Map<string, SubscriptionSnapshot | null>(),
    strictSubscription: false,
  });

  if (args.personalCardOptIn && !viewer.healthShareEnabled) {
    const error = new Error("health_visibility_required_for_personal_card");
    (error as any).code = "health_visibility_required_for_personal_card";
    throw error;
  }

  const { error } = await (args.admin as any)
    .from("rnest_social_group_ai_card_prefs")
    .upsert(
      {
        group_id: args.groupId,
        user_id: args.userId,
        personal_card_opt_in: args.personalCardOptIn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id,user_id" }
    );
  if (error) throw error;

  return {
    healthShareEnabled: viewer.healthShareEnabled,
    personalCardOptIn: args.personalCardOptIn,
  };
}

export async function generateWeeklyGroupAIBriefs(args: { admin: any }) {
  const week = getCurrentWeekWindow();
  const subscriptionCache = new Map<string, SubscriptionSnapshot | null>();
  const [{ data: existingRows, error: existingErr }, { data: memberRows, error: memberErr }] = await Promise.all([
    (args.admin as any)
      .from("rnest_social_group_ai_briefs")
      .select("group_id")
      .eq("week_start_iso", week.startISO),
    (args.admin as any)
      .from("rnest_social_group_members")
      .select("group_id")
      .order("group_id", { ascending: true }),
  ]);
  if (existingErr) throw existingErr;
  if (memberErr) throw memberErr;

  const existingGroupIds = new Set<number>(
    (existingRows ?? []).map((row: any) => Number(row.group_id)).filter((value: number) => Number.isFinite(value))
  );
  const candidateGroupIds: number[] = Array.from(
    new Set<number>(
      (memberRows ?? []).map((row: any) => Number(row.group_id)).filter((value: number) => Number.isFinite(value))
    )
  ).filter((groupId: number) => !existingGroupIds.has(groupId));

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const groupId of candidateGroupIds) {
    try {
      const generated = await generateGroupAIBriefArtifact({
        admin: args.admin,
        groupId,
        generatorType: "cron",
        subscriptionCache,
      });
      if (!generated) {
        skippedCount += 1;
        continue;
      }
      await upsertBriefRow(args.admin, generated);
      processedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("[SocialGroupAIBrief] cron generation failed group=%d err=%s", groupId, String((error as any)?.message ?? error));
    }
  }

  return {
    weekStartISO: week.startISO,
    processedCount,
    skippedCount,
    failedCount,
  };
}
