import { addDays, fromISODate, startOfWeekMonday, todayISO, toISODate } from "@/lib/date";
import {
  computeMemberWeeklyVitals,
  getSocialGroupById,
  loadSocialGroupProfileMap,
  normalizeSocialGroupRole,
} from "@/lib/server/socialGroups";
import {
  readSocialGroupAIBriefConsentMap,
  readSocialGroupAIBriefSubscription,
  type SocialGroupAIBriefSubscriptionSnapshot,
} from "@/lib/server/socialGroupAIBriefAccess";
import type { SocialGroupAIBriefSnapshot } from "@/lib/server/socialGroupAIBriefModel";
import type {
  HealthVisibility,
  MemberWeeklyVitals,
  ScheduleVisibility,
  SocialGroupAIBriefFlowRow,
  SocialGroupAIBriefMetrics,
  SocialGroupAIBriefPayload,
  SocialGroupAIBriefPersonalCard,
  SocialGroupAIBriefResponse,
  SocialGroupAIBriefTone,
} from "@/types/social";

const SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION = "2026-04-04.social-group-brief.v1";
const SOCIAL_GROUP_AI_BRIEF_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_GROUP_AI_BRIEF_CONTRIBUTORS = 3;

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
  hasRecentData: boolean;
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
    memberCount: number;
    contributorCount: number;
    optInCardCount: number;
    healthShareCount: number;
    consentCount: number;
    recentDataCount: number;
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

function buildMetricsPayload(metrics: GroupBriefContext["metrics"]): SocialGroupAIBriefMetrics {
  return {
    contributorCount: metrics.contributorCount,
    optInCardCount: metrics.optInCardCount,
    avgBattery: metrics.avgBattery,
    avgSleep: metrics.avgSleep,
    warningCount: metrics.warningCount,
    dangerCount: metrics.dangerCount,
    commonOffCount: metrics.commonOffCount,
    nightCountToday: metrics.nightCountToday,
    offCountToday: metrics.offCountToday,
  };
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
    metrics: buildMetricsPayload(input.metrics),
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

function hasMinimumContributorCount(context: GroupBriefContext | null | undefined) {
  return (context?.metrics.contributorCount ?? 0) >= MIN_GROUP_AI_BRIEF_CONTRIBUTORS;
}

function shouldTreatInsufficientDataRowAsObsolete(
  row: SocialGroupAIBriefRow | null | undefined,
  context: GroupBriefContext | null | undefined
) {
  return row?.status === "insufficient_data" && hasMinimumContributorCount(context);
}

function shouldBypassCooldownForCurrentContext(
  row: SocialGroupAIBriefRow | null | undefined,
  context: GroupBriefContext | null | undefined
) {
  return shouldTreatInsufficientDataRowAsObsolete(row, context);
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

function isSocialGroupAIBriefSchemaUnavailableError(error: unknown) {
  const code = String((error as any)?.code ?? "").toUpperCase();
  const message = String((error as any)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the column")
  );
}

async function readCachedSubscription(
  admin: any,
  userId: string,
  cache: Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>,
  strict = false
) {
  if (cache.has(userId)) return cache.get(userId) ?? null;
  try {
    const subscription = await readSocialGroupAIBriefSubscription(admin, userId, { strict });
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
  subscriptionCache: Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>;
  strictSubscription?: boolean;
}): Promise<ViewerPrefs> {
  const [membershipRes, prefRes, cardPrefRes, subscription] = await Promise.all([
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
    readCachedSubscription(args.admin, args.userId, args.subscriptionCache, args.strictSubscription === true),
  ]);

  const membership = membershipRes.data;
  const membershipErr = membershipRes.error;
  const pref = prefRes.data;
  const prefErr = prefRes.error;
  const cardPref = cardPrefRes.data;
  const cardPrefErr = cardPrefRes.error;

  if (membershipErr) throw membershipErr;
  if (prefErr) throw prefErr;
  if (cardPrefErr && !isSocialGroupAIBriefSchemaUnavailableError(cardPrefErr)) throw cardPrefErr;
  if (!membership) {
    const error = new Error("not_group_member");
    (error as any).code = "not_group_member";
    throw error;
  }

  return {
    hasEntitlement: subscription?.hasBriefAccess === true,
    healthShareEnabled: String(pref?.health_visibility ?? "hidden") === "full",
    personalCardOptIn: !cardPrefErr && cardPref?.personal_card_opt_in === true,
  };
}

async function loadGroupBriefContext(args: {
  admin: any;
  groupId: number;
  subscriptionCache: Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>;
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
  const [profileMap, prefRes, stateRes, optInRes] = await Promise.all([
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
  if (prefRes.error) throw prefRes.error;
  if (stateRes.error) throw stateRes.error;
  if (optInRes.error && !isSocialGroupAIBriefSchemaUnavailableError(optInRes.error)) throw optInRes.error;

  const prefRows = prefRes.data ?? [];
  const stateRows = stateRes.data ?? [];
  const optInRows = optInRes.error ? [] : (optInRes.data ?? []);

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
    memberIds.map(async (userId: string) => [userId, await readCachedSubscription(args.admin, userId, args.subscriptionCache)] as const)
  );
  const subscriptionMap = new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>(subscriptions);
  const consentMap = await readSocialGroupAIBriefConsentMap(args.admin, memberIds);

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

    const rawVitals = computeMemberWeeklyVitals(payload, week.todayISO);
    const vitals = pref.healthVisibility === "full" ? rawVitals : null;
    const profile = profileMap.get(userId);
    const subscription: SocialGroupAIBriefSubscriptionSnapshot | null = subscriptionMap.get(userId) ?? null;
    const hasAIConsent = consentMap.get(userId) === true;
    return {
      userId,
      nickname: profile?.nickname ?? "",
      avatarEmoji: profile?.avatarEmoji ?? "🐧",
      role: normalizeSocialGroupRole(row.role),
      visibleWeekSchedule,
      healthVisibility: pref.healthVisibility,
      vitals,
      hasRecentData: rawVitals !== null,
      personalCardOptIn: optInMap.get(userId) === true,
      hasPaidBriefAccess: subscription?.hasBriefAccess === true,
      hasProBriefAccess: subscription?.hasProBriefAccess === true,
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
    memberCount: members.length,
    contributorCount: contributors.length,
    optInCardCount: allCardEligibleMembers.length,
    healthShareCount: members.filter((member) => member.healthVisibility === "full").length,
    consentCount: members.filter((member) => member.hasAIConsent).length,
    recentDataCount: members.filter((member) => member.hasRecentData).length,
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
  if (error && !isSocialGroupAIBriefSchemaUnavailableError(error)) throw error;
  if (error) return null;
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
  if (error && !isSocialGroupAIBriefSchemaUnavailableError(error)) throw error;
}

function formatPointText(value: number | null) {
  return value != null && Number.isFinite(value) ? `${value}점` : "기록 부족";
}

function formatHourText(value: number | null) {
  return value != null && Number.isFinite(value) ? `${value}시간` : "기록 부족";
}

function formatDebtText(value: number | null) {
  return value != null && Number.isFinite(value) ? `${value}h` : "-";
}

function buildHeroCopy(context: GroupBriefContext, tone: SocialGroupAIBriefTone) {
  const avgBatteryLabel = formatPointText(context.metrics.avgBattery);
  const avgMentalLabel = formatPointText(context.metrics.avgMental);
  const avgSleepLabel = formatHourText(context.metrics.avgSleep);
  const avgBattery = context.metrics.avgBattery ?? null;
  const avgMental = context.metrics.avgMental ?? null;
  const avgSleep = context.metrics.avgSleep ?? null;
  const commonOffCount = context.commonOffDays.length;
  const nightCountToday = context.metrics.nightCountToday;
  const warningCount = context.metrics.warningCount;
  const dangerCount = context.metrics.dangerCount;
  const mentalGap =
    avgBattery != null && avgMental != null ? Math.round((avgBattery - avgMental) * 10) / 10 : null;
  const sleepShort = avgSleep != null && avgSleep < 6.2;
  const sleepWatch = avgSleep != null && avgSleep < 6.8;
  const batteryLow = avgBattery != null && avgBattery < 58;
  const mentalLow = avgMental != null && avgMental < 58;
  const mentalDrift = mentalGap != null && mentalGap >= 7;
  const strongSharedWindow = commonOffCount >= 2;
  const noSharedWindow = commonOffCount === 0;

  if (dangerCount > 0 && sleepShort) {
    return {
      headline: "이번 주는 회복 우선 신호와 짧은 수면이 같이 올라와 있어요.",
      subheadline: `회복 우선 ${dangerCount}명, 평균 수면 ${avgSleepLabel}이라 새 일정보다 수면 확보와 응답 강도 조절이 먼저입니다.`,
    };
  }
  if (dangerCount > 0 && mentalDrift) {
    return {
      headline: "이번 주는 버티는 체력보다 멘탈 소모 관리가 더 급해요.",
      subheadline: `평균 body ${avgBatteryLabel}, mental ${avgMentalLabel} 흐름에 회복 우선 ${dangerCount}명이 있어 긴 일정과 잦은 체크인을 먼저 줄이는 편이 맞습니다.`,
    };
  }
  if (dangerCount > 0) {
    return {
      headline: "이번 주는 회복 여백을 먼저 확보해야 팀 리듬이 무너지지 않아요.",
      subheadline: `주의 ${warningCount}명, 회복 우선 ${dangerCount}명 흐름이라 과한 챌린지보다 낮은 부담 운영이 먼저 필요합니다.`,
    };
  }
  if (sleepShort && nightCountToday > 0) {
    return {
      headline: "이번 주는 야간과 짧은 수면이 겹쳐 리듬이 쉽게 흐트러질 수 있어요.",
      subheadline: `평균 수면 ${avgSleepLabel}, 오늘 야간 ${nightCountToday}명이라 야간 뒤 회복 구간을 먼저 비워 두는 편이 좋습니다.`,
    };
  }
  if (mentalDrift && sleepWatch) {
    return {
      headline: "이번 주는 체력보다 집중 소모와 수면 회복을 함께 봐야 해요.",
      subheadline: `평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}, 수면 ${avgSleepLabel}이라 버티는 것보다 회복 속도 관리가 더 중요합니다.`,
    };
  }
  if (mentalLow) {
    return {
      headline: "이번 주는 멘탈 배터리 하강폭을 먼저 완충하는 편이 좋아요.",
      subheadline: `평균 mental ${avgMentalLabel}까지 내려와 있어 일정 길이보다 집중이 길어지는 구간을 먼저 줄이는 전략이 맞습니다.`,
    };
  }
  if (batteryLow && commonOffCount > 0) {
    return {
      headline: "이번 주는 체력 소모가 보이지만 회복 창을 활용할 여지는 있어요.",
      subheadline: `평균 body ${avgBatteryLabel} 흐름이지만 공통 OFF ${commonOffCount}일이 보여 쉬는 창만 잘 고정해도 부담을 줄일 수 있습니다.`,
    };
  }
  if (warningCount > 0 && noSharedWindow) {
    return {
      headline: "큰 위험 신호는 아니지만 리듬 차이를 방치하면 피로가 커질 수 있어요.",
      subheadline: `주의 ${warningCount}명 흐름에 공통 OFF가 없어, 길게 맞추기보다 짧은 회복 슬롯을 먼저 맞추는 편이 안전합니다.`,
    };
  }
  if (tone === "steady" && strongSharedWindow) {
    return {
      headline: "이번 주는 안정 흐름 위에 같이 쉬는 창도 꽤 잡혀 있어요.",
      subheadline: `평균 body ${avgBatteryLabel}, 수면 ${avgSleepLabel}, 공통 OFF ${commonOffCount}일 흐름이라 지금 리듬을 유지하면서 회복 슬롯만 고정하면 충분합니다.`,
    };
  }
  if (tone === "steady" && noSharedWindow) {
    return {
      headline: "전체 흐름은 안정적이지만 쉬는 타이밍은 조금 흩어져 있어요.",
      subheadline: `평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}로 크게 흔들리진 않지만 공통 OFF가 없어 짧은 회복 창을 먼저 잡아 두는 편이 좋습니다.`,
    };
  }
  return {
    headline: "이번 주 그룹 흐름은 비교적 안정적으로 유지되고 있어요.",
    subheadline: `평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}, 수면 ${avgSleepLabel} 흐름이라 지금의 회복 리듬을 크게 흔들지 않는 편이 좋습니다.`,
  };
}

function buildEnergyFinding(context: GroupBriefContext, tone: SocialGroupAIBriefTone): SocialGroupAIBriefSnapshot["findings"][number] {
  const avgBattery = context.metrics.avgBattery ?? null;
  const avgMental = context.metrics.avgMental ?? null;
  const avgSleep = context.metrics.avgSleep ?? null;
  const avgBatteryLabel = formatPointText(avgBattery);
  const avgMentalLabel = formatPointText(avgMental);
  const avgSleepLabel = formatHourText(avgSleep);
  const mentalGap = avgBattery != null && avgMental != null ? Math.round((avgBattery - avgMental) * 10) / 10 : null;
  const sleepShort = avgSleep != null && avgSleep < 6.2;
  const batteryLow = avgBattery != null && avgBattery < 58;
  const mentalDrift = mentalGap != null && mentalGap >= 7;

  if (sleepShort && batteryLow) {
    return {
      id: "energy",
      tone: "recover",
      factLabel: `body ${avgBatteryLabel} · sleep ${avgSleepLabel}`,
      factText: `최근 7일 평균 body는 ${avgBatteryLabel}, mental은 ${avgMentalLabel}, 수면은 ${avgSleepLabel}입니다.`,
      defaultTitle: "회복량보다 소모가 먼저 앞서는 흐름",
      defaultBody: `최근 7일 평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}, 수면 ${avgSleepLabel}입니다. 기본 회복이 쌓이기보다 소모가 앞서서 이번 주는 수면 확보와 일과 사이 완충 시간이 먼저 필요합니다.`,
    };
  }
  if (mentalDrift) {
    return {
      id: "energy",
      tone: tone === "recover" ? "recover" : "watch",
      factLabel: `body ${avgBatteryLabel} · mental ${avgMentalLabel}`,
      factText: `최근 7일 평균 body는 ${avgBatteryLabel}, mental은 ${avgMentalLabel}입니다.`,
      defaultTitle: "체력보다 멘탈 배터리가 먼저 꺾이는 흐름",
      defaultBody: `최근 7일 평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}입니다. 버티는 체력보다 집중 소모가 빨라서 긴 일정과 잦은 응답이 누적되면 피로가 크게 느껴질 수 있습니다.`,
    };
  }
  if (sleepShort) {
    return {
      id: "energy",
      tone: "watch",
      factLabel: `sleep ${avgSleepLabel} · body ${avgBatteryLabel}`,
      factText: `최근 7일 평균 수면은 ${avgSleepLabel}, body는 ${avgBatteryLabel}, mental은 ${avgMentalLabel}입니다.`,
      defaultTitle: "수면이 회복 속도를 붙잡고 있는 흐름",
      defaultBody: `최근 7일 평균 수면 ${avgSleepLabel}, body ${avgBatteryLabel}, mental ${avgMentalLabel}입니다. 이번 주는 낮 시간대 회복 여백과 취침 루틴을 같이 지켜야 흐름이 덜 흔들립니다.`,
    };
  }
  return {
    id: "energy",
    tone,
    factLabel: `body ${avgBatteryLabel} · mental ${avgMentalLabel}`,
    factText: `최근 7일 평균 body는 ${avgBatteryLabel}, mental은 ${avgMentalLabel}, 수면은 ${avgSleepLabel}입니다.`,
    defaultTitle: tone === "steady" ? "기본 회복 리듬이 비교적 유지되는 흐름" : "기본 리듬을 먼저 안정시켜야 하는 흐름",
    defaultBody:
      tone === "steady"
        ? `최근 7일 평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}, 수면 ${avgSleepLabel}입니다. 큰 하강 없이 유지되고 있어 기본 회복 루틴을 건드리지 않는 편이 좋습니다.`
        : `최근 7일 평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}, 수면 ${avgSleepLabel}입니다. 이번 주는 체력을 더 쓰기보다 기본 회복 리듬을 먼저 고정하는 편이 맞습니다.`,
  };
}

function buildRiskFinding(context: GroupBriefContext): SocialGroupAIBriefSnapshot["findings"][number] {
  const warningCount = context.metrics.warningCount;
  const dangerCount = context.metrics.dangerCount;
  const nightCountToday = context.metrics.nightCountToday;
  const riskLabel = `주의 ${warningCount}명 · 회복 우선 ${dangerCount}명`;

  if (dangerCount > 0 && warningCount > 0) {
    return {
      id: "risk",
      tone: "recover",
      factLabel: riskLabel,
      factText: `최근 7일 기준으로 ${riskLabel}입니다.`,
      defaultTitle: "경고 신호와 회복 우선 신호가 같이 섞인 구간",
      defaultBody: `최근 7일 기준 ${riskLabel}입니다. 이번 주는 팀 평균보다 회복이 더 느린 멤버를 기준으로 속도와 응답량을 정하는 편이 안전합니다.`,
    };
  }
  if (dangerCount > 0) {
    return {
      id: "risk",
      tone: "recover",
      factLabel: riskLabel,
      factText: `최근 7일 기준으로 ${riskLabel}입니다.`,
      defaultTitle: "회복 우선 멤버를 기준으로 봐야 하는 구간",
      defaultBody: `최근 7일 기준 ${riskLabel}입니다. 이번 주는 추가 부담을 얹기보다 회복 우선 멤버가 버틸 수 있는 속도로 운영 강도를 낮추는 편이 좋습니다.`,
    };
  }
  if (warningCount >= 2) {
    return {
      id: "risk",
      tone: "watch",
      factLabel: riskLabel,
      factText: `최근 7일 기준으로 ${riskLabel}입니다.`,
      defaultTitle: "주의 신호가 여러 명에게 겹치는 구간",
      defaultBody: `최근 7일 기준 ${riskLabel}입니다. 큰 경고 전 단계지만 동시에 여러 명이 피로를 느끼는 흐름이라 짧은 체크인과 낮은 부담 운영이 더 잘 맞습니다.`,
    };
  }
  if (warningCount === 1) {
    return {
      id: "risk",
      tone: "watch",
      factLabel: riskLabel,
      factText: `최근 7일 기준으로 ${riskLabel}입니다.`,
      defaultTitle: "한 명의 하강 신호가 팀 속도를 좌우할 수 있는 구간",
      defaultBody: `최근 7일 기준 ${riskLabel}입니다. 주의 신호가 작은 것처럼 보여도 이번 주 속도를 끌어올리면 체감 부담이 빠르게 커질 수 있습니다.`,
    };
  }
  return {
    id: "risk",
    tone: nightCountToday > 0 ? "watch" : "steady",
    factLabel: riskLabel,
    factText: `최근 7일 기준으로 ${riskLabel}입니다.`,
    defaultTitle: nightCountToday > 0 ? "큰 경고는 적지만 야간 변수가 남아 있는 구간" : "큰 경고 없이 유지되는 구간",
    defaultBody:
      nightCountToday > 0
        ? `최근 7일 기준 ${riskLabel}이고 오늘 야간 ${nightCountToday}명이 있습니다. 지금은 큰 경고가 적지만 야간 뒤 리듬이 깨지면 피로가 커질 수 있어 미리 완충이 필요합니다.`
        : `최근 7일 기준 ${riskLabel}입니다. 큰 위험 신호는 적어 지금 리듬을 유지하면서도 작은 피로 누적만 막아 주면 충분합니다.`,
  };
}

function buildScheduleFinding(context: GroupBriefContext): SocialGroupAIBriefSnapshot["findings"][number] {
  const scheduleLabel =
    context.commonOffDays.length > 0
      ? `공통 OFF ${context.commonOffDays.length}일`
      : `오늘 OFF ${context.metrics.offCountToday}명 · 야간 ${context.metrics.nightCountToday}명`;
  return {
    id: "schedule",
    tone: context.commonOffDays.length > 0 ? "steady" : context.metrics.nightCountToday > 0 ? "watch" : "steady",
    factLabel: scheduleLabel,
    factText:
      context.commonOffDays.length > 0
        ? `이번 주 공개 일정 기준으로 함께 쉬는 창이 ${context.commonOffDays.length}일 있습니다.`
        : `오늘 공개 일정 기준으로 OFF/VAC ${context.metrics.offCountToday}명, 야간 ${context.metrics.nightCountToday}명입니다.`,
    defaultTitle: context.commonOffDays.length > 0 ? "같이 맞추기 좋은 회복 창이 보이는 흐름" : "리듬 차이가 있어 짧은 조율이 필요한 흐름",
    defaultBody:
      context.commonOffDays.length > 0
        ? `이번 주 공개 일정 기준으로 함께 쉬는 창이 ${context.commonOffDays.length}일 있습니다. 긴 계획보다 같은 타이밍에 쉬는 창을 먼저 고정하는 편이 더 효과적입니다.`
        : `오늘 공개 일정 기준으로 OFF/VAC ${context.metrics.offCountToday}명, 야간 ${context.metrics.nightCountToday}명입니다. 공개된 일정만 놓고 보면 리듬 차이가 있어 짧은 조율이 필요합니다.`,
  };
}

function buildActionPlans(context: GroupBriefContext): SocialGroupAIBriefSnapshot["actions"] {
  const avgBatteryLabel = formatPointText(context.metrics.avgBattery);
  const avgMentalLabel = formatPointText(context.metrics.avgMental);
  const avgSleepLabel = formatHourText(context.metrics.avgSleep);
  const commonOffCount = context.commonOffDays.length;
  const warningCount = context.metrics.warningCount;
  const dangerCount = context.metrics.dangerCount;
  const nightCountToday = context.metrics.nightCountToday;
  const avgBattery = context.metrics.avgBattery ?? null;
  const avgMental = context.metrics.avgMental ?? null;
  const avgSleep = context.metrics.avgSleep ?? null;
  const mentalGap =
    avgBattery != null && avgMental != null ? Math.round((avgBattery - avgMental) * 10) / 10 : null;

  type ActionCandidate = SocialGroupAIBriefSnapshot["actions"][number] & { priority: number };
  const candidates: ActionCandidate[] = [];
  const push = (candidate: ActionCandidate) => {
    if (candidates.some((item) => item.id === candidate.id)) return;
    candidates.push(candidate);
  };

  if (dangerCount > 0 || warningCount > 0) {
    push({
      id: "load_guard",
      priority: 10,
      reason: `주의 ${warningCount}명 · 회복 우선 ${dangerCount}명`,
      factText: `이번 주는 경고 신호를 기준으로 운영 강도를 낮추는 편이 좋습니다.`,
      defaultTitle:
        dangerCount > 0 ? `회복 우선 ${dangerCount}명 기준으로 속도 낮추기` : `주의 ${warningCount}명 신호에 맞춰 강도 조정`,
      defaultBody:
        dangerCount > 0
          ? `이번 주는 회복 우선 ${dangerCount}명이 보여 새 과제나 긴 모임보다, 응답 속도와 일정 길이를 먼저 낮추는 편이 안전합니다.`
          : `주의 신호가 ${warningCount}명에게 보여 이번 주는 체크인 빈도와 일정 밀도를 조금만 낮춰도 전체 부담이 훨씬 덜해집니다.`,
    });
  }

  if (avgSleep != null && avgSleep < 6.2) {
    push({
      id: "sleep_restore",
      priority: 12,
      reason: `평균 수면 ${avgSleepLabel}`,
      factText: `평균 수면 ${avgSleepLabel} 구간을 먼저 회복하는 편이 좋습니다.`,
      defaultTitle: `평균 수면 ${avgSleepLabel}선부터 먼저 복구`,
      defaultBody: `이번 주는 취침 시간을 늘리는 것보다 취침 시각과 카페인 컷오프를 먼저 고정해 수면 ${avgSleepLabel} 구간이 더 짧아지지 않게 막는 편이 중요합니다.`,
    });
  } else if (avgSleep != null && avgSleep < 6.8) {
    push({
      id: "sleep_guard",
      priority: 18,
      reason: `평균 수면 ${avgSleepLabel}`,
      factText: `이번 주는 수면 시간이 더 줄지 않게 보호하는 편이 핵심입니다.`,
      defaultTitle: `수면 ${avgSleepLabel}를 더 깎지 않게 보호`,
      defaultBody: `수면은 아주 낮진 않지만 여유롭지도 않습니다. 취침 전 자극과 늦은 약속을 줄여 지금 확보된 수면 시간을 그대로 지키는 편이 좋습니다.`,
    });
  }

  if (mentalGap != null && mentalGap >= 7) {
    push({
      id: "mental_buffer",
      priority: 14,
      reason: `body ${avgBatteryLabel} · mental ${avgMentalLabel}`,
      factText: `체력보다 멘탈 배터리 하강폭이 더 큰 흐름입니다.`,
      defaultTitle: `멘탈 ${avgMentalLabel} 구간부터 먼저 완충`,
      defaultBody: `평균 body ${avgBatteryLabel}보다 mental ${avgMentalLabel}이 더 낮습니다. 긴 집중 블록과 잦은 응답을 줄이고, 깊은 일은 한 번에 몰아 처리하는 편이 덜 지칩니다.`,
    });
  } else if (avgBattery != null && avgBattery < 58) {
    push({
      id: "body_buffer",
      priority: 16,
      reason: `평균 body ${avgBatteryLabel}`,
      factText: `body 배터리 소모 구간을 먼저 줄이는 편이 맞습니다.`,
      defaultTitle: `body ${avgBatteryLabel} 소모 구간 줄이기`,
      defaultBody: `이번 주는 체력을 더 쓰는 일정보다, 하루 중 한 번은 완전히 쉬는 블록을 확보해 body 배터리가 연속으로 깎이지 않게 관리하는 편이 좋습니다.`,
    });
  }

  if (commonOffCount > 0) {
    push({
      id: "shared_window",
      priority: 20,
      reason: `공통 OFF ${commonOffCount}일`,
      factText: `이번 주는 공통 쉬는 창을 먼저 고정하는 편이 좋습니다.`,
      defaultTitle: `공통 OFF ${commonOffCount}일에 회복 슬롯 고정`,
      defaultBody: `공개 일정 기준으로 겹치는 쉬는 날이 ${commonOffCount}일 있습니다. 새로운 약속보다 회복성 일정 하나를 그 창에 먼저 올려 두는 편이 유지에 유리합니다.`,
    });
  } else {
    push({
      id: "micro_window",
      priority: 22,
      reason: "공통 OFF가 거의 없습니다.",
      factText: `이번 주는 짧은 공통 회복 창부터 먼저 정하는 편이 좋습니다.`,
      defaultTitle: "15~30분 공통 회복 슬롯부터 맞추기",
      defaultBody: "길게 맞추기 어려운 주라면 15~30분이라도 겹치는 쉬는 시간을 먼저 확보해 두세요. 짧은 회복 슬롯 하나가 전체 흐름을 훨씬 안정적으로 만듭니다.",
    });
  }

  if (nightCountToday > 0) {
    push({
      id: "night_reset",
      priority: 24,
      reason: `오늘 야간 ${nightCountToday}명`,
      factText: `야간 뒤 리듬을 단순하게 유지하는 편이 필요합니다.`,
      defaultTitle: `야간 ${nightCountToday}명 뒤 리듬 단순화`,
      defaultBody: `오늘 야간 ${nightCountToday}명이 있어 다음날은 활동량을 늘리기보다 식사, 수면, 응답 타이밍을 단순하게 유지하는 쪽이 더 안정적입니다.`,
    });
  }

  push({
    id: "anchor_window",
    priority: 32,
    reason: commonOffCount > 0 ? `공통 OFF ${commonOffCount}일` : "짧은 회복 슬롯 유지",
    factText: "하루 회복 앵커 하나를 먼저 고정하는 편이 좋습니다.",
    defaultTitle: "하루 회복 앵커 하나는 매일 고정",
    defaultBody:
      commonOffCount > 0
        ? "공통으로 쉬는 날이 있더라도 각자 회복 타이밍 하나는 비슷한 시간대로 고정해 두는 편이 주간 리듬을 덜 흔들리게 만듭니다."
        : "같이 쉬는 날이 적더라도, 하루에 한 번은 겹치는 회복 슬롯을 정해 두면 짧은 회복이 훨씬 안정적으로 쌓입니다.",
  });

  push({
    id: "maintain_rhythm",
    priority: 40,
    reason: "기본 회복 리듬 유지",
    factText: "이번 주는 큰 변화보다 현재 리듬을 지키는 편이 좋습니다.",
    defaultTitle: "이미 맞는 리듬은 더 흔들지 않기",
    defaultBody: "이번 주는 새 전략을 여러 개 얹기보다, 이미 잘 지켜지고 있는 취침 흐름과 쉬는 창 하나만 유지해도 체감 부담을 충분히 낮출 수 있습니다.",
  });

  candidates.sort((a, b) => a.priority - b.priority);
  const selected = candidates.slice(0, 3);
  return selected.map(({ priority: _priority, ...rest }) => rest);
}

function buildPersonalCardSnapshot(member: BriefMemberContext): SocialGroupAIBriefSnapshot["personalCards"][number] {
  const statusLabel = statusLabelForMember(member);
  const vitalScore = member.vitals?.latestVital ?? null;
  const bodyBattery = member.vitals?.latestBodyBattery ?? null;
  const mentalBattery = member.vitals?.latestMentalBattery ?? null;
  const sleepDebtHours = member.vitals?.latestSleepDebtHours ?? null;
  const vitalLabel = vitalScore != null ? String(vitalScore) : "-";
  const bodyLabel = bodyBattery != null ? String(bodyBattery) : "-";
  const mentalLabel = mentalBattery != null ? String(mentalBattery) : "-";
  const debtLabel = formatDebtText(sleepDebtHours);
  return {
    userId: member.userId,
    nickname: member.nickname || "익명",
    avatarEmoji: member.avatarEmoji || "🐧",
    statusLabel,
    vitalScore,
    bodyBattery,
    mentalBattery,
    sleepDebtHours,
    summaryFact: `RNest Vital ${vitalLabel}, body ${bodyLabel}, mental ${mentalLabel}, 수면 부채 ${debtLabel} 흐름입니다.`,
    actionFact:
      statusLabel === "회복 우선"
        ? "짧은 회복 창과 수면 부채 정리를 먼저 잡는 편이 좋습니다."
        : statusLabel === "주의"
          ? "집중 소모가 긴 구간보다 짧은 완충 시간을 먼저 넣는 편이 낫습니다."
          : "지금 확보된 회복 리듬을 유지하는 편이 가장 효율적입니다.",
    defaultSummary: `RNest Vital ${vitalLabel}, body ${bodyLabel}, mental ${mentalLabel}, 수면 부채 ${debtLabel}입니다.`,
    defaultAction:
      statusLabel === "회복 우선"
        ? "이번 주는 추가 일정보다 수면 부채를 덜어내고, 길게 쉬는 창 하나를 먼저 확보하는 편이 좋습니다."
        : statusLabel === "주의"
          ? "이번 주는 집중 시간이 길어지기 전에 짧은 회복 슬롯을 먼저 넣어 멘탈과 body 하강폭을 줄이는 편이 좋습니다."
          : "현재 회복 흐름을 유지하면서 쉬는 창 하나만 고정해도 충분히 안정적인 주를 보낼 수 있습니다.",
  };
}

function buildSnapshot(context: GroupBriefContext): SocialGroupAIBriefSnapshot {
  const tone = toneFromMetrics(context.metrics);
  const heroCopy = buildHeroCopy(context, tone);
  return {
    week: {
      startISO: context.week.startISO,
      endISO: context.week.endISO,
      label: context.week.label,
    },
    metrics: context.metrics,
    hero: {
      tone,
      defaultHeadline: heroCopy.headline,
      defaultSubheadline: heroCopy.subheadline,
    },
    findings: [
      buildEnergyFinding(context, tone),
      buildRiskFinding(context),
      buildScheduleFinding(context),
    ],
    actions: buildActionPlans(context),
    windows: context.commonOffDays.map((dateISO) => ({
      dateISO,
      label: formatMonthDay(dateISO),
      reason: "공개 일정 기준으로 여러 멤버가 OFF/VAC인 날입니다.",
    })),
    personalCards: context.cardCandidates.map((member) => buildPersonalCardSnapshot(member)),
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
    metrics: buildMetricsPayload(context.metrics),
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
      vitalScore: item.vitalScore,
      bodyBattery: item.bodyBattery,
      mentalBattery: item.mentalBattery,
      sleepDebtHours: item.sleepDebtHours,
      summary: item.defaultSummary,
      action: item.defaultAction,
    })),
  };
}

function buildFlowRowLevel(id: SocialGroupAIBriefFlowRow["id"], context: GroupBriefContext): 1 | 2 | 3 | 4 | 5 {
  if (id === "energy") {
    if ((context.metrics.avgBattery ?? 100) < 40 || (context.metrics.avgSleep ?? 99) < 5.8) return 2;
    if ((context.metrics.avgBattery ?? 100) < 62 || (context.metrics.avgSleep ?? 99) < 6.7) return 3;
    if ((context.metrics.avgBattery ?? 100) < 74 || (context.metrics.avgSleep ?? 99) < 7.2) return 4;
    return 5;
  }
  if (id === "risk") {
    if (context.metrics.dangerCount > 0) return 5;
    if (context.metrics.warningCount > 1) return 4;
    if (context.metrics.warningCount > 0) return 3;
    return 2;
  }
  if (context.commonOffDays.length >= 2) return 5;
  if (context.commonOffDays.length >= 1) return 4;
  if (context.metrics.nightCountToday === 0) return 3;
  return 2;
}

function buildLivePanel(context: GroupBriefContext): NonNullable<SocialGroupAIBriefResponse["live"]> {
  const snapshot = buildSnapshot(context);
  return {
    week: snapshot.week,
    updatedAt: new Date().toISOString(),
    metrics: buildMetricsPayload(context.metrics),
    flowRows: snapshot.findings.filter((item) => item.id !== "schedule").map((item) => ({
      id: item.id,
      label: item.id === "energy" ? "에너지" : "리스크",
      title: item.defaultTitle,
      summary: item.defaultBody,
      factLabel: item.factLabel,
      tone: item.tone,
      level: buildFlowRowLevel(item.id, context),
    })),
    windows: snapshot.windows,
    personalCards: snapshot.personalCards.map((item) => ({
      userId: item.userId,
      nickname: item.nickname,
      avatarEmoji: item.avatarEmoji,
      statusLabel: item.statusLabel,
      vitalScore: item.vitalScore,
      bodyBattery: item.bodyBattery,
      mentalBattery: item.mentalBattery,
      sleepDebtHours: item.sleepDebtHours,
      summary: item.defaultSummary,
      action: item.defaultAction,
    })),
  };
}

function buildSnapshotPanel(args: {
  row: SocialGroupAIBriefRow | null;
  context: GroupBriefContext;
}): { snapshot: NonNullable<SocialGroupAIBriefResponse["snapshot"]>; stale: boolean; errorCode: string | null } {
  if (args.row?.payload && hasRenderableBrief(args.row.payload)) {
    return {
      snapshot: {
        hero: args.row.payload.hero,
        actions: args.row.payload.actions,
        generatedAt: args.row.generated_at,
      },
      stale: args.row.status !== "ready",
      errorCode: args.row.status === "failed" ? "group_ai_brief_generation_failed" : null,
    };
  }

  const fallback = buildDeterministicBriefPayload(args.context);
  return {
    snapshot: {
      hero: fallback.hero,
      actions: fallback.actions,
      generatedAt: null,
    },
    stale: true,
    errorCode: "group_ai_brief_missing",
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
  subscriptionCache?: Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>;
  existingRow?: SocialGroupAIBriefRow | null;
}): Promise<SocialGroupAIBriefRow | null> {
  const admin = args.admin;
  const subscriptionCache = args.subscriptionCache ?? new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>();
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

  if (context.metrics.contributorCount < MIN_GROUP_AI_BRIEF_CONTRIBUTORS) {
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
          metrics: buildMetricsPayload(context.metrics),
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
  const canRefresh =
    args.viewer.hasEntitlement &&
    (shouldBypassCooldownForCurrentContext(args.row, args.context) || !cooldownUntil || cooldownUntil <= Date.now());
  const eligibility = args.context
    ? {
        memberCount: args.context.metrics.memberCount,
        requiredContributorCount: MIN_GROUP_AI_BRIEF_CONTRIBUTORS,
        contributorCount: args.context.metrics.contributorCount,
        healthShareCount: args.context.metrics.healthShareCount,
        consentCount: args.context.metrics.consentCount,
        recentDataCount: args.context.metrics.recentDataCount,
      }
    : null;

  if (!args.viewer.hasEntitlement) {
    return {
      state: "locked",
      stale: false,
      viewer: {
        hasEntitlement: false,
        canRefresh: false,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      eligibility,
      snapshot: null,
      live: null,
      errorCode: null,
    };
  }

  if (args.context && !hasMinimumContributorCount(args.context)) {
    return {
      state: "insufficient_data",
      stale: false,
      viewer: {
        hasEntitlement: true,
        canRefresh,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      eligibility,
      snapshot: null,
      live: null,
      errorCode: "insufficient_group_ai_brief_data",
    };
  }

  if (!args.context) {
    return {
      state: "failed",
      stale: false,
      viewer: {
        hasEntitlement: true,
        canRefresh,
        healthShareEnabled: args.viewer.healthShareEnabled,
        personalCardOptIn: args.viewer.personalCardOptIn,
      },
      eligibility,
      snapshot: null,
      live: null,
      errorCode: "group_ai_brief_viewer_load_failed",
    };
  }

  const snapshotPanel = buildSnapshotPanel({
    row: args.row,
    context: args.context,
  });

  return {
    state: "ready",
    stale: snapshotPanel.stale,
    viewer: {
      hasEntitlement: true,
      canRefresh,
      healthShareEnabled: args.viewer.healthShareEnabled,
      personalCardOptIn: args.viewer.personalCardOptIn,
    },
    eligibility,
    snapshot: snapshotPanel.snapshot,
    live: buildLivePanel(args.context),
    errorCode: snapshotPanel.errorCode,
  };
}

export async function getCurrentGroupAIBrief(args: {
  admin: any;
  groupId: number;
  userId: string;
  subscriptionCache?: Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>;
}): Promise<SocialGroupAIBriefResponse> {
  const subscriptionCache = args.subscriptionCache ?? new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>();
  let viewer: ViewerPrefs | null = null;
  try {
    viewer = await loadViewerPrefs({
      admin: args.admin,
      groupId: args.groupId,
      userId: args.userId,
      subscriptionCache,
      strictSubscription: true,
    });
  } catch (error: any) {
    const code = String(error?.code ?? error?.message ?? "");
    if (code === "not_group_member" || code === "group_not_found") throw error;
    console.error(
      "[SocialGroupAIBrief] loadViewerPrefs failed group=%d userId=%s code=%s err=%s",
      args.groupId,
      String(args.userId).slice(0, 8),
      code,
      String(error?.message ?? error)
    );
    return {
      state: "failed",
      stale: false,
      viewer: { hasEntitlement: false, canRefresh: false, healthShareEnabled: false, personalCardOptIn: false },
      eligibility: null,
      snapshot: null,
      live: null,
      errorCode: "group_ai_brief_viewer_load_failed",
    };
  }
  const week = getCurrentWeekWindow();
  let row: SocialGroupAIBriefRow | null = null;
  try {
    row = await readBriefRow(args.admin, args.groupId, week.startISO);
  } catch (error) {
    console.error(
      "[SocialGroupAIBrief] readBriefRow failed group=%d err=%s",
      args.groupId,
      String((error as any)?.message ?? error)
    );
  }
  let context: GroupBriefContext | null = null;
  if (viewer.hasEntitlement) {
    try {
      context = await loadGroupBriefContext({ admin: args.admin, groupId: args.groupId, subscriptionCache });
    } catch (error) {
      console.error(
        "[SocialGroupAIBrief] loadGroupBriefContext failed group=%d err=%s",
        args.groupId,
        String((error as any)?.message ?? error)
      );
    }
  }
  return buildResponse({ row, viewer, context });
}

export async function refreshCurrentGroupAIBrief(args: {
  admin: any;
  groupId: number;
  userId: string;
}): Promise<SocialGroupAIBriefResponse> {
  const subscriptionCache = new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>();
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
  const currentContext = await loadGroupBriefContext({
    admin: args.admin,
    groupId: args.groupId,
    subscriptionCache,
  });
  if (
    existingRow?.cooldown_until &&
    Date.parse(existingRow.cooldown_until) > Date.now() &&
    !shouldBypassCooldownForCurrentContext(existingRow, currentContext)
  ) {
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

  return buildResponse({ row: generated, viewer, context: currentContext });
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
    subscriptionCache: new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>(),
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
    subscriptionCache: new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>(),
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
  if (error && !isSocialGroupAIBriefSchemaUnavailableError(error)) throw error;

  return {
    healthShareEnabled: viewer.healthShareEnabled,
    personalCardOptIn: args.personalCardOptIn,
  };
}

export async function generateWeeklyGroupAIBriefs(args: { admin: any }) {
  const week = getCurrentWeekWindow();
  const subscriptionCache = new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>();
  const { data: memberRows, error: memberErr } = await (args.admin as any)
    .from("rnest_social_group_members")
    .select("group_id")
    .order("group_id", { ascending: true });
  if (memberErr) throw memberErr;
  const candidateGroupIds: number[] = Array.from(
    new Set<number>(
      (memberRows ?? []).map((row: any) => Number(row.group_id)).filter((value: number) => Number.isFinite(value))
    )
  );

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
