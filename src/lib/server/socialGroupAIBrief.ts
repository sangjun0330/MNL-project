import { addDays, fromISODate, todayISO, toISODate } from "@/lib/date";
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
import type {
  BriefActionPriorityProfile,
  BriefBodyBand,
  BriefCoordinationBand,
  BriefCopySlotKey,
  BriefDriftBand,
  BriefMentalBand,
  BriefNarrativeAxis,
  BriefNarrativeSpec,
  BriefNightBand,
  BriefRiskBand,
  BriefSecondaryAxis,
  BriefSeverityBand,
  BriefSleepBand,
  BriefUsageMeta,
  BriefVariantIds,
  SocialGroupAIBriefFactBundle,
  SocialGroupAIBriefSnapshot,
} from "@/lib/server/socialGroupAIBriefModel";
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
  SocialMemberPreview,
} from "@/types/social";

const SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION = "2026-04-04.social-group-brief.v2";
const SOCIAL_GROUP_AI_BRIEF_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_GROUP_AI_BRIEF_CONTRIBUTORS = 3;
const DEFAULT_SOCIAL_GROUP_AI_BRIEF_MODEL = "gpt-5.4-mini";

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
  hasTodayTrackedHealthInput: boolean;
  personalCardOptIn: boolean;
  hasPaidBriefAccess: boolean;
  hasProBriefAccess: boolean;
  hasAIConsent: boolean;
};

type GroupBriefContext = {
  groupId: number;
  week: {
    startISO: string;
    endISO: string;
    label: string;
    todayISO: string;
  };
  members: BriefMemberContext[];
  contributors: BriefMemberContext[];
  cardCandidates: BriefMemberContext[];
  sharedWindows: Array<{
    dateISO: string;
    members: SocialMemberPreview[];
  }>;
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
    todayContributorRecordCount: number;
    autoGenerateRequiredCount: number;
  };
};

function resolveSocialGroupAIBriefModel() {
  const configured = String(process.env.OPENAI_SOCIAL_GROUP_BRIEF_MODEL ?? "").trim();
  return configured || DEFAULT_SOCIAL_GROUP_AI_BRIEF_MODEL;
}

function isOffOrVac(shift: string | null | undefined) {
  return shift === "OFF" || shift === "VAC";
}

function roundOne(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function readTodayTrackedHealthInput(payload: unknown, dayISO: string) {
  const root = isRecord(payload) ? payload : {};
  const bioMap = isRecord(root.bio) ? root.bio : {};
  const emotionMap = isRecord(root.emotions) ? root.emotions : {};
  const bioEntry = isRecord(bioMap[dayISO]) ? (bioMap[dayISO] as Record<string, unknown>) : {};
  const emotionEntry = isRecord(emotionMap[dayISO]) ? (emotionMap[dayISO] as Record<string, unknown>) : {};
  return {
    sleepHours: hasFiniteNumber(bioEntry.sleepHours),
    stress: hasFiniteNumber(bioEntry.stress),
    mood: hasFiniteNumber(bioEntry.mood) || hasFiniteNumber(emotionEntry.mood),
    activity: hasFiniteNumber(bioEntry.activity),
    caffeine: hasFiniteNumber(bioEntry.caffeineMg),
  };
}

function hasTodayTrackedHealthInput(payload: unknown, dayISO: string) {
  const tracked = readTodayTrackedHealthInput(payload, dayISO);
  return tracked.sleepHours || tracked.stress || tracked.mood || tracked.activity || tracked.caffeine;
}

function getAutoGenerateRequiredCount(contributorCount: number) {
  if (!Number.isFinite(contributorCount) || contributorCount <= 0) return 0;
  return Math.ceil(contributorCount * 0.5);
}

function hasAutoGenerateReadyContributors(context: GroupBriefContext) {
  return (
    context.metrics.contributorCount >= MIN_GROUP_AI_BRIEF_CONTRIBUTORS &&
    context.metrics.todayContributorRecordCount >= context.metrics.autoGenerateRequiredCount
  );
}

function toKSTISODate(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return toISODate(new Date(time + 9 * 60 * 60 * 1000));
}

function readStoredFallbackReason(row: SocialGroupAIBriefRow | null | undefined) {
  const usage = row?.usage;
  const fallbackReason = String((usage as any)?.fallbackReason ?? "").trim();
  return fallbackReason || null;
}

function hasStoredAITrace(row: SocialGroupAIBriefRow | null | undefined) {
  const usage = row?.usage;
  if (!usage || typeof usage !== "object") return false;
  const responseId = String((usage as any)?.responseId ?? "").trim();
  return Boolean(responseId || (usage as any).providerUsage || (usage as any).llmMode);
}

function isSuccessfulStoredBriefRow(row: SocialGroupAIBriefRow | null | undefined) {
  if (!row?.payload || !hasRenderableBrief(row.payload)) return false;
  if (readStoredFallbackReason(row)) return false;
  if (row.status === "ready") return true;
  if (row.status === "failed") return hasStoredAITrace(row);
  return false;
}

function wasRowGeneratedOnDay(row: SocialGroupAIBriefRow | null | undefined, dayISO: string) {
  return Boolean(row?.generated_at && toKSTISODate(row.generated_at) === dayISO);
}

function didTrackedHealthInputChange(previousPayload: unknown, nextPayload: unknown, dayISO: string) {
  const previous = readTodayTrackedHealthInput(previousPayload, dayISO);
  const next = readTodayTrackedHealthInput(nextPayload, dayISO);
  return (
    previous.sleepHours !== next.sleepHours ||
    previous.stress !== next.stress ||
    previous.mood !== next.mood ||
    previous.activity !== next.activity ||
    previous.caffeine !== next.caffeine
  );
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
  const start = today;
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
      hasTodayTrackedHealthInput: hasTodayTrackedHealthInput(payload, week.todayISO),
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
  const sharedWindows: GroupBriefContext["sharedWindows"] = Array.from({ length: 7 }, (_, offset) => {
    const dateISO = toISODate(addDays(fromISODate(week.startISO), offset));
    const overlapMembers = members
      .filter((member) => isOffOrVac(member.visibleWeekSchedule[dateISO]))
      .map((member) => ({
        userId: member.userId,
        nickname: member.nickname,
        avatarEmoji: member.avatarEmoji,
      }));
    if (overlapMembers.length < 2) return [];
    return [
      {
        dateISO,
        members: overlapMembers,
      },
    ];
  }).flat();
  const commonOffDays = sharedWindows.map((item) => item.dateISO);

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
    todayContributorRecordCount: contributors.filter((member) => member.hasTodayTrackedHealthInput).length,
    autoGenerateRequiredCount: getAutoGenerateRequiredCount(contributors.length),
  };

  return {
    groupId: args.groupId,
    week,
    members,
    contributors,
    cardCandidates,
    sharedWindows,
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

async function readRecentBriefRows(admin: any, groupId: number, limit = 12): Promise<SocialGroupAIBriefRow[]> {
  const { data, error } = await (admin as any)
    .from("rnest_social_group_ai_briefs")
    .select("*")
    .eq("group_id", groupId)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error && !isSocialGroupAIBriefSchemaUnavailableError(error)) throw error;
  if (error) return [];
  return Array.isArray(data) ? (data as SocialGroupAIBriefRow[]) : [];
}

async function readLatestStoredDisplayRow(admin: any, groupId: number): Promise<SocialGroupAIBriefRow | null> {
  const rows = await readRecentBriefRows(admin, groupId);
  return rows.find((row) => isSuccessfulStoredBriefRow(row)) ?? rows.find((row) => hasRenderableBrief(row.payload)) ?? null;
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

type ActionBlueprint = {
  id: SocialGroupAIBriefSnapshot["actions"][number]["id"];
  priority: number;
  factText: string;
  reasonFact: string;
};

type CopyOption = {
  id: string;
  opener: string;
  noun: string;
  text: string;
};

type CopyLead = {
  id: string;
  opener: string;
  noun: string;
  text: string;
};

type CopyTail = {
  id: string;
  text: string;
};

function stableHashHex(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableHashInt(input: string) {
  return parseInt(stableHashHex(input).slice(0, 8), 16) >>> 0;
}

function resolveCopySlotKey(now = new Date()): BriefCopySlotKey {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() < 12 ? "06-slot" : "18-slot";
}

function formatFactBundle(context: GroupBriefContext): SocialGroupAIBriefFactBundle {
  return {
    contributorCount: context.metrics.contributorCount,
    avgBattery: context.metrics.avgBattery,
    avgMental: context.metrics.avgMental,
    avgSleep: context.metrics.avgSleep,
    warningCount: context.metrics.warningCount,
    dangerCount: context.metrics.dangerCount,
    commonOffCount: context.metrics.commonOffCount,
    nightCountToday: context.metrics.nightCountToday,
    offCountToday: context.metrics.offCountToday,
  };
}

function classifySeverityBand(metrics: GroupBriefContext["metrics"]): BriefSeverityBand {
  if (metrics.dangerCount > 0 || (metrics.avgBattery ?? 100) < 40 || (metrics.avgSleep ?? 99) < 5.8) return "recover";
  if (metrics.warningCount > 0 || (metrics.avgBattery ?? 100) < 62 || (metrics.avgSleep ?? 99) < 6.7) return "watch";
  return "steady";
}

function classifySleepBand(value: number | null): BriefSleepBand {
  if (value == null) return "guarded";
  if (value < 6.2) return "very_short";
  if (value < 6.8) return "short";
  if (value < 7.4) return "guarded";
  return "steady";
}

function classifyBodyBand(value: number | null): BriefBodyBand {
  if (value == null) return "guarded";
  if (value < 40) return "very_low";
  if (value < 58) return "low";
  if (value < 70) return "guarded";
  return "steady";
}

function classifyMentalBand(value: number | null): BriefMentalBand {
  if (value == null) return "guarded";
  if (value < 44) return "very_low";
  if (value < 58) return "low";
  if (value < 68) return "guarded";
  return "steady";
}

function classifyDriftBand(avgBattery: number | null, avgMental: number | null): BriefDriftBand {
  if (avgBattery == null || avgMental == null) return "aligned";
  const gap = Math.round((avgBattery - avgMental) * 10) / 10;
  if (gap >= 10) return "wide";
  if (gap >= 7) return "visible";
  return "aligned";
}

function classifyRiskBand(metrics: GroupBriefContext["metrics"]): BriefRiskBand {
  if (metrics.dangerCount > 0) return "recover";
  if (metrics.warningCount >= 2) return "watch_many";
  if (metrics.warningCount === 1) return "watch_single";
  return "stable";
}

function classifyCoordinationBand(commonOffCount: number): BriefCoordinationBand {
  if (commonOffCount >= 3) return "dense";
  if (commonOffCount >= 1) return "some";
  return "sparse";
}

function classifyNightBand(nightCountToday: number): BriefNightBand {
  if (nightCountToday >= 2) return "clustered";
  if (nightCountToday === 1) return "single";
  return "none";
}

function classifyTodayModifier(metrics: GroupBriefContext["metrics"]): BriefNarrativeSpec["todayModifier"] {
  if (metrics.nightCountToday > 0 && metrics.offCountToday > 0) return "night_and_off";
  if (metrics.nightCountToday > 0) return "night_only";
  if (metrics.offCountToday > 0) return "off_only";
  return "neutral";
}

function pickDominantAxis(args: {
  riskBand: BriefRiskBand;
  sleepBand: BriefSleepBand;
  driftBand: BriefDriftBand;
  bodyBand: BriefBodyBand;
  coordinationBand: BriefCoordinationBand;
  nightBand: BriefNightBand;
}): BriefNarrativeAxis {
  if (args.riskBand === "recover") return "recover_risk";
  if (args.sleepBand === "very_short") return "sleep_short";
  if (args.driftBand === "wide" || args.driftBand === "visible") return "mental_drift";
  if (args.bodyBand === "very_low" || args.bodyBand === "low") return "body_low";
  if (args.coordinationBand === "sparse") return "coordination_gap";
  if (args.nightBand !== "none") return "night_reset";
  return "steady_maintain";
}

function pickSecondaryAxis(args: {
  dominantAxis: BriefNarrativeAxis;
  riskBand: BriefRiskBand;
  sleepBand: BriefSleepBand;
  driftBand: BriefDriftBand;
  bodyBand: BriefBodyBand;
  coordinationBand: BriefCoordinationBand;
  nightBand: BriefNightBand;
}): BriefSecondaryAxis {
  const candidates: BriefSecondaryAxis[] = [];
  if (args.riskBand === "watch_many" || args.riskBand === "watch_single") candidates.push("risk_watch");
  if (args.sleepBand === "short" || args.sleepBand === "very_short") candidates.push("sleep_guard");
  if (args.driftBand === "visible" || args.driftBand === "wide") candidates.push("mental_guard");
  if (args.bodyBand === "low" || args.bodyBand === "very_low") candidates.push("body_low");
  if (args.coordinationBand === "some" || args.coordinationBand === "sparse") {
    candidates.push(args.coordinationBand === "some" ? "coordination_some" : "coordination_gap");
  }
  if (args.nightBand !== "none") candidates.push("night_reset");
  candidates.push("steady_maintain");
  return candidates.find((candidate) => candidate !== args.dominantAxis) ?? "none";
}

function pickActionPriorityProfile(dominantAxis: BriefNarrativeAxis): BriefActionPriorityProfile {
  if (dominantAxis === "recover_risk") return "risk_first";
  if (dominantAxis === "sleep_short") return "sleep_first";
  if (dominantAxis === "mental_drift") return "mental_first";
  if (dominantAxis === "body_low") return "body_first";
  if (dominantAxis === "coordination_gap") return "coordination_first";
  if (dominantAxis === "night_reset") return "night_first";
  return "steady_first";
}

function buildNarrativeOutline(context: GroupBriefContext) {
  const tone = toneFromMetrics(context.metrics);
  const severityBand = classifySeverityBand(context.metrics);
  const sleepBand = classifySleepBand(context.metrics.avgSleep);
  const bodyBand = classifyBodyBand(context.metrics.avgBattery);
  const mentalBand = classifyMentalBand(context.metrics.avgMental);
  const driftBand = classifyDriftBand(context.metrics.avgBattery, context.metrics.avgMental);
  const riskBand = classifyRiskBand(context.metrics);
  const coordinationBand = classifyCoordinationBand(context.metrics.commonOffCount);
  const nightBand = classifyNightBand(context.metrics.nightCountToday);
  const dominantAxis = pickDominantAxis({
    riskBand,
    sleepBand,
    driftBand,
    bodyBand,
    coordinationBand,
    nightBand,
  });
  const secondaryAxis = pickSecondaryAxis({
    dominantAxis,
    riskBand,
    sleepBand,
    driftBand,
    bodyBand,
    coordinationBand,
    nightBand,
  });
  return {
    tone,
    dominantAxis,
    secondaryAxis,
    severityBand,
    sleepBand,
    bodyBand,
    mentalBand,
    driftBand,
    riskBand,
    coordinationBand,
    nightBand,
    todayModifier: classifyTodayModifier(context.metrics),
    actionPriorityProfile: pickActionPriorityProfile(dominantAxis),
    copySlotKey: resolveCopySlotKey(),
  };
}

function composeOptions(leads: CopyLead[], tails: CopyTail[]) {
  return leads.flatMap((lead) =>
    tails.map<CopyOption>((tail) => ({
      id: `${lead.id}.${tail.id}`,
      opener: lead.opener,
      noun: lead.noun,
      text: `${lead.text} ${tail.text}`.replace(/\s+/g, " ").trim(),
    }))
  );
}

function pickCopyOption(args: {
  bank: CopyOption[];
  selectionKey: string;
  rotation: number;
  usedOpeners: Set<string>;
  usedNouns: Set<string>;
}) {
  const start = (stableHashInt(args.selectionKey) + args.rotation) % args.bank.length;
  const ordered = Array.from({ length: args.bank.length }, (_, offset) => args.bank[(start + offset) % args.bank.length]);
  const strict = ordered.find((item) => !args.usedOpeners.has(item.opener) && !args.usedNouns.has(item.noun));
  const soft = ordered.find((item) => !args.usedOpeners.has(item.opener));
  const selected = strict ?? soft ?? ordered[0];
  args.usedOpeners.add(selected.opener);
  args.usedNouns.add(selected.noun);
  return selected;
}

function buildCopyFingerprint(args: {
  outline: ReturnType<typeof buildNarrativeOutline>;
  topActionIds: string[];
  context: GroupBriefContext;
}) {
  return stableHashHex(
    JSON.stringify({
      dominantAxis: args.outline.dominantAxis,
      secondaryAxis: args.outline.secondaryAxis,
      severityBand: args.outline.severityBand,
      sleepBand: args.outline.sleepBand,
      bodyBand: args.outline.bodyBand,
      mentalBand: args.outline.mentalBand,
      driftBand: args.outline.driftBand,
      riskBand: args.outline.riskBand,
      coordinationBand: args.outline.coordinationBand,
      nightBand: args.outline.nightBand,
      todayModifier: args.outline.todayModifier,
      actionPriorityProfile: args.outline.actionPriorityProfile,
      topActionIds: args.topActionIds,
      commonOffCount: args.context.metrics.commonOffCount,
      dangerCount: args.context.metrics.dangerCount,
      warningCount: args.context.metrics.warningCount,
    })
  );
}

function buildVariationSeed(args: {
  groupId: number;
  weekStartISO: string;
  copySlotKey: BriefCopySlotKey;
  archetypeId: BriefNarrativeAxis;
  topActionIds: string[];
}) {
  return stableHashHex(
    `${args.groupId}:${args.weekStartISO}:${args.copySlotKey}:${args.archetypeId}:${args.topActionIds.join(",")}`
  );
}

function readBriefUsageMeta(row: SocialGroupAIBriefRow | null | undefined): BriefUsageMeta | null {
  const usage = row?.usage;
  if (!usage || typeof usage !== "object") return null;
  const copyFingerprint = String((usage as any).copyFingerprint ?? "").trim();
  if (!copyFingerprint) return null;
  return usage as BriefUsageMeta;
}

function readStoredTraceMeta(row: SocialGroupAIBriefRow | null | undefined) {
  const usage = row?.usage;
  if (!usage || typeof usage !== "object") {
    return {
      traceId: null,
      responseId: null,
      storeResponses: null,
      requestUrl: null,
      authMode: null,
      usesCloudflareGateway: null,
    };
  }
  return {
    traceId: String((usage as any).traceId ?? "").trim() || null,
    responseId: String((usage as any).responseId ?? "").trim() || null,
    storeResponses: typeof (usage as any).storeResponses === "boolean" ? (usage as any).storeResponses : null,
    requestUrl: String((usage as any).requestUrl ?? "").trim() || null,
    authMode: String((usage as any).authMode ?? "").trim() || null,
    usesCloudflareGateway:
      typeof (usage as any).usesCloudflareGateway === "boolean" ? (usage as any).usesCloudflareGateway : null,
  };
}

function readPreviousCopySummary(row: SocialGroupAIBriefRow | null | undefined) {
  const usage = readBriefUsageMeta(row);
  return {
    fingerprint: usage?.copyFingerprint ?? null,
    heroHeadline: row?.payload?.hero?.headline ?? null,
    actionTitles: Array.isArray(row?.payload?.actions) ? row!.payload!.actions.map((item) => item.title) : [],
  };
}

function extractVariantRotation(previousUsage: BriefUsageMeta | null, nextFingerprint: string) {
  if (!previousUsage || previousUsage.copyFingerprint !== nextFingerprint) return 0;
  const match = /(\d+)$/.exec(previousUsage.variantIds?.heroHeadline ?? "");
  return match ? Number(match[1]) + 1 : 1;
}

function applyPriorityProfileBoost(profile: BriefActionPriorityProfile, actionId: ActionBlueprint["id"]) {
  if (profile === "risk_first" && actionId === "load_guard") return -3;
  if (profile === "sleep_first" && (actionId === "sleep_restore" || actionId === "sleep_guard")) return -3;
  if (profile === "mental_first" && actionId === "mental_buffer") return -3;
  if (profile === "body_first" && actionId === "body_buffer") return -3;
  if (profile === "coordination_first" && (actionId === "shared_window" || actionId === "micro_window")) return -3;
  if (profile === "night_first" && actionId === "night_reset") return -3;
  if (profile === "steady_first" && (actionId === "maintain_rhythm" || actionId === "anchor_window")) return -2;
  return 0;
}

function buildCopyLabels(context: GroupBriefContext) {
  return {
    avgBattery: formatPointText(context.metrics.avgBattery),
    avgMental: formatPointText(context.metrics.avgMental),
    avgSleep: formatHourText(context.metrics.avgSleep),
    risk: `주의 ${context.metrics.warningCount}명 · 회복 우선 ${context.metrics.dangerCount}명`,
    sharedWindow: `겹치는 회복 창 ${context.metrics.commonOffCount}일`,
    night: `오늘 야간 ${context.metrics.nightCountToday}명`,
    off: `오늘 OFF/VAC ${context.metrics.offCountToday}명`,
  };
}

function buildHeroHeadlineOptions(context: GroupBriefContext, spec: BriefNarrativeSpec) {
  const labels = buildCopyLabels(context);
  switch (spec.dominantAxis) {
    case "recover_risk":
      return composeOptions(
        [
          { id: "recover", opener: "회복", noun: "회복", text: "회복 우선 신호를 먼저 기준으로 잡아야 하는" },
          { id: "risk", opener: "경고", noun: "경고", text: "경고 신호를 평균보다 크게 읽어야 하는" },
          { id: "pace", opener: "속도", noun: "속도", text: "운영 속도를 낮춰야 버틸 수 있는" },
          { id: "buffer", opener: "완충", noun: "완충", text: "완충 여백을 먼저 열어 둬야 하는" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "zone", text: "구간입니다." },
        ]
      );
    case "sleep_short":
      return composeOptions(
        [
          { id: "sleep", opener: "수면", noun: "수면", text: "수면 길이가 리듬을 붙잡고 있는" },
          { id: "restore", opener: "회복", noun: "수면", text: "회복 속도보다 수면 부족이 먼저 보이는" },
          { id: "night", opener: "야간", noun: "야간", text: spec.nightBand !== "none" ? "야간 변수와 짧은 수면이 같이 올라온" : "짧은 수면을 먼저 복구해야 하는" },
          { id: "guard", opener: "취침", noun: "취침", text: "취침 리듬을 먼저 보호해야 하는" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "phase", text: "흐름입니다." },
        ]
      );
    case "mental_drift":
      return composeOptions(
        [
          { id: "mental", opener: "멘탈", noun: "멘탈", text: "체력보다 멘탈 소모를 먼저 다뤄야 하는" },
          { id: "focus", opener: "집중", noun: "집중", text: "집중 소모 관리가 핵심이 되는" },
          { id: "drift", opener: "리듬", noun: "멘탈", text: "버티는 힘과 체감 피로의 간격이 벌어진" },
          { id: "response", opener: "응답", noun: "응답", text: "응답 밀도와 깊은 일 배치를 조절해야 하는" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "zone", text: "구간입니다." },
        ]
      );
    case "body_low":
      return composeOptions(
        [
          { id: "body", opener: "체력", noun: "체력", text: "체력 소모를 먼저 줄여야 하는" },
          { id: "battery", opener: "body", noun: "body", text: "body 배터리 하강폭을 먼저 멈춰야 하는" },
          { id: "load", opener: "부담", noun: "부담", text: "부하를 낮춰 회복량을 살려야 하는" },
          { id: "anchor", opener: "휴식", noun: "휴식", text: "쉬는 블록 하나를 먼저 지켜야 하는" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "phase", text: "흐름입니다." },
        ]
      );
    case "coordination_gap":
      return composeOptions(
        [
          { id: "window", opener: "회복", noun: "회복 창", text: "겹치는 회복 창을 먼저 맞춰야 하는" },
          { id: "timing", opener: "타이밍", noun: "타이밍", text: "쉬는 타이밍 조율이 핵심이 되는" },
          { id: "coordination", opener: "조율", noun: "조율", text: "리듬 차이를 짧게 조율해야 하는" },
          { id: "slot", opener: "슬롯", noun: "회복 슬롯", text: "짧은 회복 슬롯부터 고정해야 하는" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "zone", text: "구간입니다." },
        ]
      );
    case "night_reset":
      return composeOptions(
        [
          { id: "night", opener: "야간", noun: "야간", text: "야간 뒤 리듬 정리가 우선인" },
          { id: "reset", opener: "리듬", noun: "리듬", text: "다음날 회복 리듬을 단순하게 잡아야 하는" },
          { id: "after", opener: "다음날", noun: "다음날", text: "야간 다음날 변수를 줄여야 하는" },
          { id: "buffer", opener: "완충", noun: "야간", text: "야간 뒤 완충 여백이 필요한" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "phase", text: "흐름입니다." },
        ]
      );
    default:
      return composeOptions(
        [
          { id: "steady", opener: "안정", noun: "안정", text: "안정 흐름을 크게 흔들지 않는 것이 맞는" },
          { id: "maintain", opener: "유지", noun: "리듬", text: "지금 리듬을 유지하는 편이 유리한" },
          { id: "base", opener: "기본", noun: "회복", text: "기본 회복 리듬이 비교적 잘 유지되는" },
          { id: "balance", opener: "균형", noun: "균형", text: "무리한 변화보다 균형 유지가 맞는" },
        ],
        [
          { id: "week", text: "한 주예요." },
          { id: "zone", text: "구간입니다." },
        ]
      );
  }
}

function buildHeroSubheadlineOptions(context: GroupBriefContext, spec: BriefNarrativeSpec) {
  const labels = buildCopyLabels(context);
  switch (spec.dominantAxis) {
    case "recover_risk":
      return composeOptions(
        [
          { id: "risk", opener: "위험", noun: "위험", text: `${labels.risk} 흐름이라` },
          { id: "recover", opener: "회복", noun: "회복 신호", text: `회복 우선 ${context.metrics.dangerCount}명과 주의 ${context.metrics.warningCount}명이 같이 보여` },
          { id: "load", opener: "부담", noun: "부담", text: `이번 주는 평균보다 부담을 낮게 잡아야 해서` },
          { id: "signal", opener: "신호", noun: "경고 신호", text: `경고 신호가 겹치는 주라` },
        ],
        [
          { id: "direction", text: "새 계획보다 응답 속도와 일정 길이부터 낮추는 편이 안전합니다." },
          { id: "safety", text: "긴 일정과 과한 체크인보다 완충 여백을 먼저 확보하는 편이 맞습니다." },
        ]
      );
    case "sleep_short":
      return composeOptions(
        [
          { id: "sleep", opener: "수면", noun: "수면", text: `평균 수면 ${labels.avgSleep} 구간이라` },
          { id: "body", opener: "회복", noun: "회복 속도", text: `평균 body ${labels.avgBattery}여도 수면 ${labels.avgSleep}가 먼저 걸려서` },
          { id: "night", opener: "야간", noun: "야간", text: spec.nightBand !== "none" ? `${labels.night}에 수면 ${labels.avgSleep} 흐름이 겹쳐` : `짧은 수면이 이어지는 주라` },
          { id: "rhythm", opener: "취침", noun: "취침 리듬", text: `취침 흐름을 지키지 않으면 회복이 더 밀릴 수 있어` },
        ],
        [
          { id: "guard", text: "일정보다 취침 시각과 카페인 컷오프를 먼저 고정하는 편이 좋습니다." },
          { id: "restore", text: "활동량을 늘리기보다 수면이 더 짧아지지 않게 막는 방향이 우선입니다." },
        ]
      );
    case "mental_drift":
      return composeOptions(
        [
          { id: "gap", opener: "격차", noun: "멘탈 격차", text: `평균 body ${labels.avgBattery}, mental ${labels.avgMental} 흐름이라` },
          { id: "mental", opener: "멘탈", noun: "멘탈 배터리", text: `멘탈 배터리가 body보다 먼저 떨어지는 패턴이 보여` },
          { id: "response", opener: "집중", noun: "집중 소모", text: `집중 소모가 먼저 커지는 주라` },
          { id: "drift", opener: "리듬", noun: "리듬 차이", text: `버티는 체력과 체감 피로 사이 간격이 벌어져` },
        ],
        [
          { id: "direction", text: "깊은 일과 잦은 응답을 몰아넣기보다 완충 시간을 앞에 배치하는 편이 좋습니다." },
          { id: "guard", text: "긴 집중 블록보다 짧은 회복 슬롯을 먼저 확보하는 운영이 더 잘 맞습니다." },
        ]
      );
    case "body_low":
      return composeOptions(
        [
          { id: "body", opener: "체력", noun: "체력", text: `평균 body ${labels.avgBattery} 흐름이라` },
          { id: "load", opener: "부하", noun: "부하", text: `body 배터리가 먼저 깎이는 주라` },
          { id: "energy", opener: "소모", noun: "소모", text: `회복량보다 소모가 조금 앞서는 구간이라` },
          { id: "rest", opener: "휴식", noun: "휴식 블록", text: `쉬는 블록을 고정하지 않으면 체력 하강이 이어질 수 있어` },
        ],
        [
          { id: "direction", text: "새 일정 추가보다 완전히 쉬는 시간 하나를 먼저 지키는 편이 좋습니다." },
          { id: "guard", text: "일정 길이를 줄이고 회복 블록을 끊기지 않게 두는 운영이 맞습니다." },
        ]
      );
    case "coordination_gap":
      return composeOptions(
        [
          { id: "shared", opener: "회복", noun: "회복 창", text: `${labels.sharedWindow} 흐름이라` },
          { id: "timing", opener: "타이밍", noun: "타이밍", text: `같이 쉬는 타이밍이 흩어지는 주라` },
          { id: "slot", opener: "슬롯", noun: "회복 슬롯", text: `겹치는 회복 슬롯이 적어서` },
          { id: "adjust", opener: "조율", noun: "짧은 조율", text: `긴 계획보다 짧은 조율이 더 중요한 주라` },
        ],
        [
          { id: "direction", text: "전원 일정보다 15~30분이라도 겹치는 회복 슬롯을 먼저 올려 두는 편이 낫습니다." },
          { id: "guard", text: "길게 맞추려 하기보다 둘 이상 겹치는 쉬는 창부터 고정하는 편이 효율적입니다." },
        ]
      );
    case "night_reset":
      return composeOptions(
        [
          { id: "night", opener: "야간", noun: "야간", text: `${labels.night}이라` },
          { id: "after", opener: "다음날", noun: "다음날", text: `야간 다음날 리듬이 깨지기 쉬운 주라` },
          { id: "reset", opener: "리듬", noun: "리듬 정리", text: `야간 뒤 회복 루틴을 단순하게 둘 필요가 있어` },
          { id: "buffer", opener: "완충", noun: "완충 시간", text: `야간 뒤 완충 시간을 미리 열어 둬야 해서` },
        ],
        [
          { id: "direction", text: "다음날은 활동량보다 수면과 식사 타이밍을 단순하게 유지하는 편이 더 안정적입니다." },
          { id: "guard", text: "새 약속을 얹기보다 야간 뒤 회복 루틴을 짧고 반복되게 두는 편이 좋습니다." },
        ]
      );
    default:
      return composeOptions(
        [
          { id: "steady", opener: "안정", noun: "안정 흐름", text: `평균 body ${labels.avgBattery}, mental ${labels.avgMental}, 수면 ${labels.avgSleep} 흐름이라` },
          { id: "maintain", opener: "리듬", noun: "리듬 유지", text: `지금 회복 리듬이 크게 흔들리지 않는 주라` },
          { id: "shared", opener: "균형", noun: "균형", text: context.metrics.commonOffCount > 0 ? `${labels.sharedWindow}도 보이는 편이라` : `큰 경고 없이 균형이 유지되는 편이라` },
          { id: "base", opener: "기본", noun: "기본 회복", text: `기본 회복 루틴을 유지하기 좋은 주라` },
        ],
        [
          { id: "direction", text: "새 전략을 더 얹기보다 이미 맞는 회복 패턴을 그대로 지키는 편이 좋습니다." },
          { id: "guard", text: "큰 변화를 주기보다 쉬는 창 하나만 일정하게 고정해도 충분합니다." },
        ]
      );
  }
}

function buildActionBlueprintsV2(
  context: GroupBriefContext,
  outline: ReturnType<typeof buildNarrativeOutline>
): ActionBlueprint[] {
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
  const mentalGap = avgBattery != null && avgMental != null ? Math.round((avgBattery - avgMental) * 10) / 10 : null;
  const candidates: ActionBlueprint[] = [];
  const push = (candidate: ActionBlueprint) => {
    if (candidates.some((item) => item.id === candidate.id)) return;
    candidates.push({
      ...candidate,
      priority: candidate.priority + applyPriorityProfileBoost(outline.actionPriorityProfile, candidate.id),
    });
  };

  if (dangerCount > 0 || warningCount > 0) {
    push({
      id: "load_guard",
      priority: 10,
      reasonFact: `주의 ${warningCount}명 · 회복 우선 ${dangerCount}명`,
      factText:
        dangerCount > 0
          ? `회복 우선 ${dangerCount}명이 보여 이번 주는 팀 평균보다 회복이 느린 멤버를 기준으로 속도를 잡는 편이 안전합니다.`
          : `주의 ${warningCount}명이 보여 이번 주는 체크인 빈도와 일정 밀도를 조금 낮춰 두는 편이 좋습니다.`,
    });
  }

  if (avgSleep != null && avgSleep < 6.2) {
    push({
      id: "sleep_restore",
      priority: 12,
      reasonFact: `평균 수면 ${avgSleepLabel}`,
      factText: `평균 수면 ${avgSleepLabel} 구간이라 취침 시각과 카페인 컷오프를 먼저 복구하는 편이 핵심입니다.`,
    });
  } else if (avgSleep != null && avgSleep < 6.8) {
    push({
      id: "sleep_guard",
      priority: 18,
      reasonFact: `평균 수면 ${avgSleepLabel}`,
      factText: `수면 ${avgSleepLabel}를 더 깎지 않는 편이 우선이라 늦은 약속과 자극을 먼저 줄이는 편이 맞습니다.`,
    });
  }

  if (mentalGap != null && mentalGap >= 7) {
    push({
      id: "mental_buffer",
      priority: 14,
      reasonFact: `body ${avgBatteryLabel} · mental ${avgMentalLabel}`,
      factText: `body ${avgBatteryLabel}보다 mental ${avgMentalLabel} 하강폭이 커서 긴 집중 블록을 먼저 줄이는 편이 좋습니다.`,
    });
  } else if (avgBattery != null && avgBattery < 58) {
    push({
      id: "body_buffer",
      priority: 16,
      reasonFact: `평균 body ${avgBatteryLabel}`,
      factText: `평균 body ${avgBatteryLabel} 구간이라 완전히 쉬는 블록 하나를 먼저 지키는 쪽이 더 안정적입니다.`,
    });
  }

  if (commonOffCount > 0) {
    push({
      id: "shared_window",
      priority: 20,
      reasonFact: `겹치는 회복 창 ${commonOffCount}일`,
      factText: `이번 주는 둘 이상 겹치는 회복 창이 ${commonOffCount}일 보여 회복성 일정 하나를 먼저 고정해 두기 좋습니다.`,
    });
  } else {
    push({
      id: "micro_window",
      priority: 22,
      reasonFact: "겹치는 회복 창이 적습니다.",
      factText: "길게 맞추기 어려운 주라면 15~30분이라도 겹치는 회복 슬롯을 먼저 확보하는 편이 전체 흐름에 더 도움이 됩니다.",
    });
  }

  if (nightCountToday > 0) {
    push({
      id: "night_reset",
      priority: 24,
      reasonFact: `오늘 야간 ${nightCountToday}명`,
      factText: `오늘 야간 ${nightCountToday}명이 있어 다음날은 활동량보다 수면과 식사 타이밍을 단순하게 유지하는 편이 더 안정적입니다.`,
    });
  }

  push({
    id: "anchor_window",
    priority: 32,
    reasonFact: commonOffCount > 0 ? `겹치는 회복 창 ${commonOffCount}일` : "짧은 회복 슬롯 유지",
    factText:
      commonOffCount > 0
        ? "겹치는 회복 창이 있더라도 각자 회복 타이밍 하나는 비슷한 시간대로 고정해 두는 편이 주간 리듬을 덜 흔들리게 만듭니다."
        : "같이 쉬는 날이 적더라도 하루에 한 번은 겹치는 회복 슬롯을 정해 두면 짧은 회복이 안정적으로 쌓입니다.",
  });

  push({
    id: "maintain_rhythm",
    priority: 40,
    reasonFact: "기본 회복 리듬 유지",
    factText: "이번 주는 새 전략을 여러 개 얹기보다 이미 맞는 취침 흐름과 쉬는 창 하나만 꾸준히 지키는 편이 더 효율적입니다.",
  });

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates.slice(0, 3);
}

function buildActionTitleOptions(context: GroupBriefContext, action: ActionBlueprint): CopyOption[] {
  switch (action.id) {
    case "load_guard":
      return composeOptions(
        [
          { id: "pace", opener: "속도", noun: "운영 속도", text: "이번 주 운영 속도부터 낮추기" },
          { id: "load", opener: "부담", noun: "부담", text: "팀 전체 부담 신호 먼저 낮추기" },
        ],
        [
          { id: "safe", text: "기준으로 두기" },
          { id: "guard", text: "운영으로 전환" },
        ]
      );
    case "sleep_restore":
      return composeOptions(
        [
          { id: "sleep", opener: "수면", noun: "수면", text: "평균 수면부터 먼저 복구" },
          { id: "bedtime", opener: "취침", noun: "취침 시각", text: "취침 시각부터 다시 고정" },
        ],
        [
          { id: "restore", text: "흐름으로 돌리기" },
          { id: "guard", text: "구간으로 올리기" },
        ]
      );
    case "sleep_guard":
      return composeOptions(
        [
          { id: "sleep", opener: "수면", noun: "수면", text: "지금 수면 길이 더 깎지 않기" },
          { id: "night", opener: "야간", noun: "늦은 자극", text: "늦은 자극부터 먼저 덜기" },
        ],
        [
          { id: "guard", text: "운영으로 가기" },
          { id: "steady", text: "기준 세우기" },
        ]
      );
    case "mental_buffer":
      return composeOptions(
        [
          { id: "mental", opener: "멘탈", noun: "멘탈", text: "멘탈 하강폭부터 먼저 완충" },
          { id: "focus", opener: "집중", noun: "집중 블록", text: "긴 집중 블록부터 잘라내기" },
        ],
        [
          { id: "guard", text: "기준 세우기" },
          { id: "buffer", text: "흐름으로 바꾸기" },
        ]
      );
    case "body_buffer":
      return composeOptions(
        [
          { id: "body", opener: "체력", noun: "체력", text: "체력 소모 구간부터 줄이기" },
          { id: "rest", opener: "휴식", noun: "휴식 블록", text: "쉬는 블록 하나 먼저 확보" },
        ],
        [
          { id: "guard", text: "운영으로 전환" },
          { id: "buffer", text: "기준 세우기" },
        ]
      );
    case "shared_window":
      return composeOptions(
        [
          { id: "shared", opener: "겹침", noun: "겹치는 회복 창", text: "겹치는 회복 창에 일정 먼저 올리기" },
          { id: "window", opener: "회복", noun: "회복 창", text: "같이 맞추기 쉬운 창부터 고정" },
        ],
        [
          { id: "anchor", text: "운영으로 가기" },
          { id: "slot", text: "순서로 두기" },
        ]
      );
    case "micro_window":
      return composeOptions(
        [
          { id: "micro", opener: "짧은", noun: "짧은 회복 슬롯", text: "15~30분 회복 슬롯부터 맞추기" },
          { id: "slot", opener: "회복", noun: "회복 슬롯", text: "짧게라도 겹치는 창 먼저 만들기" },
        ],
        [
          { id: "anchor", text: "순서로 두기" },
          { id: "first", text: "기준 세우기" },
        ]
      );
    case "night_reset":
      return composeOptions(
        [
          { id: "night", opener: "야간", noun: "야간", text: "야간 뒤 리듬부터 단순화" },
          { id: "nextday", opener: "다음날", noun: "다음날 루틴", text: "야간 다음날 루틴 먼저 정리" },
        ],
        [
          { id: "guard", text: "기준 두기" },
          { id: "reset", text: "운영으로 맞추기" },
        ]
      );
    case "anchor_window":
      return composeOptions(
        [
          { id: "anchor", opener: "앵커", noun: "회복 앵커", text: "하루 회복 앵커 하나는 고정" },
          { id: "daily", opener: "매일", noun: "반복 루틴", text: "매일 같은 회복 루틴 하나 만들기" },
        ],
        [
          { id: "keep", text: "흐름으로 가기" },
          { id: "anchor", text: "기준 세우기" },
        ]
      );
    default:
      return composeOptions(
        [
          { id: "maintain", opener: "유지", noun: "리듬 유지", text: "지금 맞는 리듬부터 유지" },
          { id: "steady", opener: "안정", noun: "안정 흐름", text: "큰 변화보다 현재 흐름 지키기" },
        ],
        [
          { id: "first", text: "순서로 두기" },
          { id: "keep", text: "운영으로 가기" },
        ]
      );
  }
}

function buildActionBodyOptions(context: GroupBriefContext, action: ActionBlueprint): CopyOption[] {
  switch (action.id) {
    case "load_guard":
      return composeOptions(
        [
          { id: "status", opener: "경고", noun: "경고 신호", text: action.factText },
          { id: "direction", opener: "이번", noun: "운영 강도", text: "이번 주는 회복이 느린 멤버 기준으로 속도를 잡아야 해서" },
        ],
        [
          { id: "safe", text: "새 과제보다 응답 속도와 일정 길이부터 낮추는 편이 안전합니다." },
          { id: "buffer", text: "긴 모임보다 낮은 부담 운영과 짧은 완충 시간을 먼저 여는 편이 맞습니다." },
        ]
      );
    case "sleep_restore":
      return composeOptions(
        [
          { id: "status", opener: "수면", noun: "수면", text: action.factText },
          { id: "direction", opener: "취침", noun: "취침 시각", text: "수면 시간이 짧은 주라" },
        ],
        [
          { id: "guard", text: "취침 시각과 카페인 컷오프를 먼저 고정하는 편이 중요합니다." },
          { id: "restore", text: "늦은 약속보다 회복이 더 밀리지 않게 막는 방향이 우선입니다." },
        ]
      );
    case "sleep_guard":
      return composeOptions(
        [
          { id: "status", opener: "수면", noun: "수면", text: action.factText },
          { id: "direction", opener: "자극", noun: "늦은 자극", text: "수면 여유가 넉넉하지 않은 구간이라" },
        ],
        [
          { id: "guard", text: "늦은 자극과 길게 늘어지는 일정부터 먼저 덜어내는 편이 좋습니다." },
          { id: "steady", text: "지금 확보된 수면 시간만이라도 그대로 지키는 운영이 더 잘 맞습니다." },
        ]
      );
    case "mental_buffer":
      return composeOptions(
        [
          { id: "status", opener: "멘탈", noun: "멘탈", text: action.factText },
          { id: "direction", opener: "집중", noun: "집중 소모", text: "체력보다 멘탈 소모가 먼저 커지는 흐름이라" },
        ],
        [
          { id: "buffer", text: "긴 집중 블록과 잦은 응답을 줄이고 짧은 완충 시간을 앞에 두는 편이 좋습니다." },
          { id: "guard", text: "깊은 일을 몰아넣기보다 회복 슬롯을 먼저 확보하는 운영이 더 안정적입니다." },
        ]
      );
    case "body_buffer":
      return composeOptions(
        [
          { id: "status", opener: "체력", noun: "체력", text: action.factText },
          { id: "direction", opener: "소모", noun: "소모 구간", text: "body 배터리가 먼저 깎이는 주라" },
        ],
        [
          { id: "guard", text: "하루 중 완전히 쉬는 블록 하나를 끊기지 않게 두는 편이 좋습니다." },
          { id: "buffer", text: "일정을 더 채우기보다 회복량을 살리는 운영이 더 효과적입니다." },
        ]
      );
    case "shared_window":
      return composeOptions(
        [
          { id: "status", opener: "회복", noun: "회복 창", text: action.factText },
          { id: "direction", opener: "겹침", noun: "겹치는 창", text: "같이 맞추기 쉬운 날이 보이는 주라" },
        ],
        [
          { id: "anchor", text: "새로운 약속보다 회복성 일정 하나를 그 창에 먼저 올려 두는 편이 유지에 유리합니다." },
          { id: "slot", text: "긴 계획보다 같은 타이밍에 쉬는 창을 먼저 고정하는 편이 더 효과적입니다." },
        ]
      );
    case "micro_window":
      return composeOptions(
        [
          { id: "status", opener: "슬롯", noun: "짧은 회복 슬롯", text: action.factText },
          { id: "direction", opener: "조율", noun: "짧은 조율", text: "길게 맞추기 어려운 주라" },
        ],
        [
          { id: "anchor", text: "15~30분이라도 겹치는 쉬는 시간을 먼저 확보하는 편이 전체 흐름을 덜 흔듭니다." },
          { id: "first", text: "전원 일정보다 둘 이상 맞는 짧은 회복 슬롯부터 만드는 쪽이 현실적입니다." },
        ]
      );
    case "night_reset":
      return composeOptions(
        [
          { id: "status", opener: "야간", noun: "야간", text: action.factText },
          { id: "direction", opener: "다음날", noun: "다음날 루틴", text: "야간 뒤 리듬이 깨지기 쉬운 흐름이라" },
        ],
        [
          { id: "reset", text: "다음날은 활동량보다 수면과 식사 타이밍을 단순하게 유지하는 편이 더 안정적입니다." },
          { id: "guard", text: "새 약속을 얹기보다 회복 루틴을 짧고 반복되게 두는 방향이 맞습니다." },
        ]
      );
    case "anchor_window":
      return composeOptions(
        [
          { id: "status", opener: "앵커", noun: "회복 앵커", text: action.factText },
          { id: "direction", opener: "반복", noun: "반복 루틴", text: "하루에 한 번 같은 회복 타이밍을 두는 편이" },
        ],
        [
          { id: "steady", text: "주간 리듬을 덜 흔들리게 만들고 짧은 회복도 더 안정적으로 쌓이게 합니다." },
          { id: "guard", text: "각자 리듬이 달라도 기본 회복 루틴 하나는 묶어 두는 편이 좋습니다." },
        ]
      );
    default:
      return composeOptions(
        [
          { id: "status", opener: "유지", noun: "리듬 유지", text: action.factText },
          { id: "direction", opener: "안정", noun: "안정 흐름", text: "이번 주는 큰 변화보다 현재 흐름을 지키는 편이" },
        ],
        [
          { id: "keep", text: "체감 부담을 더 낮추는 데 도움이 됩니다." },
          { id: "steady", text: "새 전략을 얹는 것보다 결과가 더 안정적입니다." },
        ]
      );
  }
}

function buildActionReasonOptions(context: GroupBriefContext, action: ActionBlueprint): CopyOption[] {
  const base = action.reasonFact;
  const options =
    action.id === "load_guard"
      ? ["경고 신호가 겹칩니다.", "낮은 부담 운영이 맞습니다.", base]
      : action.id === "sleep_restore"
        ? [base, "수면 복구가 급합니다.", "취침 루틴 복원이 우선입니다."]
        : action.id === "sleep_guard"
          ? [base, "수면 하락 방지가 핵심입니다.", "늦은 자극을 덜어야 합니다."]
          : action.id === "mental_buffer"
            ? [base, "멘탈 완충이 먼저입니다.", "집중 소모를 낮춰야 합니다."]
            : action.id === "body_buffer"
              ? [base, "체력 소모를 먼저 줄입니다.", "완전 휴식 블록이 필요합니다."]
              : action.id === "shared_window"
                ? [base, "같이 맞추기 쉬운 날입니다.", "회복 창을 먼저 고정합니다."]
                : action.id === "micro_window"
                  ? [base, "짧은 조율이 더 현실적입니다.", "15~30분 슬롯이 먼저입니다."]
                  : action.id === "night_reset"
                    ? [base, "야간 뒤 리듬 정리가 필요합니다.", "다음날 루틴이 중요합니다."]
                    : action.id === "anchor_window"
                      ? [base, "하루 회복 앵커가 필요합니다.", "반복 루틴 유지가 맞습니다."]
                      : [base, "현재 리듬 유지가 우선입니다.", "큰 변화보다 유지가 맞습니다."];
  return options.map((text, index) => ({
    id: `reason-${index}`,
    opener: `reason-${index}`,
    noun: `reason-${index}`,
    text,
  }));
}

function buildDeterministicNarrative(args: {
  context: GroupBriefContext;
  promptVersion: string;
  existingRow?: SocialGroupAIBriefRow | null;
}) {
  const outline = buildNarrativeOutline(args.context);
  const actionsBlueprint = buildActionBlueprintsV2(args.context, outline);
  const topActionIds = actionsBlueprint.map((item) => item.id);
  const copyFingerprint = buildCopyFingerprint({
    outline,
    topActionIds,
    context: args.context,
  });
  const previousUsage = readBriefUsageMeta(args.existingRow ?? null);
  const rotation = extractVariantRotation(previousUsage, copyFingerprint);
  const spec: BriefNarrativeSpec = {
    ...outline,
    variationSeed: buildVariationSeed({
      groupId: args.context.groupId,
      weekStartISO: args.context.week.startISO,
      copySlotKey: outline.copySlotKey,
      archetypeId: outline.dominantAxis,
      topActionIds,
    }),
  };
  const usedOpeners = new Set<string>();
  const usedNouns = new Set<string>();
  const heroHeadline = pickCopyOption({
    bank: buildHeroHeadlineOptions(args.context, spec),
    selectionKey: `${spec.variationSeed}:hero-headline`,
    rotation,
    usedOpeners,
    usedNouns,
  });
  const heroSubheadline = pickCopyOption({
    bank: buildHeroSubheadlineOptions(args.context, spec),
    selectionKey: `${spec.variationSeed}:hero-subheadline`,
    rotation,
    usedOpeners,
    usedNouns,
  });

  const actionTitles: Record<string, string> = {};
  const actionBodies: Record<string, string> = {};
  const actionReasons: Record<string, string> = {};
  const actions = actionsBlueprint.map((action, index) => {
    const title = pickCopyOption({
      bank: buildActionTitleOptions(args.context, action),
      selectionKey: `${spec.variationSeed}:${action.id}:title:${index}`,
      rotation,
      usedOpeners,
      usedNouns,
    });
    const body = buildActionBodyOptions(args.context, action)[
      (stableHashInt(`${spec.variationSeed}:${action.id}:body:${index}`) + rotation) % 4
    ];
    const reason = buildActionReasonOptions(args.context, action)[
      (stableHashInt(`${spec.variationSeed}:${action.id}:reason:${index}`) + rotation) % 3
    ];
    actionTitles[action.id] = title.id;
    actionBodies[action.id] = body.id;
    actionReasons[action.id] = reason.id;
    return {
      id: action.id,
      reason: reason.text,
      factText: action.factText,
      defaultTitle: title.text,
      defaultBody: body.text,
    };
  });

  const variantIds: BriefVariantIds = {
    heroHeadline: `${heroHeadline.id}.${rotation % buildHeroHeadlineOptions(args.context, spec).length}`,
    heroSubheadline: `${heroSubheadline.id}.${rotation % buildHeroSubheadlineOptions(args.context, spec).length}`,
    actionTitles,
    actionBodies,
    actionReasons,
  };

  const usageMeta: BriefUsageMeta = {
    archetypeId: spec.dominantAxis,
    dominantAxis: spec.dominantAxis,
    secondaryAxis: spec.secondaryAxis,
    copySlotKey: spec.copySlotKey,
    variantIds,
    copyFingerprint,
    previousFingerprint: previousUsage?.copyFingerprint ?? null,
    topActionIds,
    promptVersion: args.promptVersion,
  };

  return {
    spec,
    usageMeta,
    hero: {
      headline: heroHeadline.text,
      subheadline: heroSubheadline.text,
    },
    actions,
  };
}

function buildSnapshot(args: {
  context: GroupBriefContext;
  promptVersion: string;
  existingRow?: SocialGroupAIBriefRow | null;
}): SocialGroupAIBriefSnapshot {
  const narrative = buildDeterministicNarrative({
    context: args.context,
    promptVersion: args.promptVersion,
    existingRow: args.existingRow,
  });
  return {
    week: {
      startISO: args.context.week.startISO,
      endISO: args.context.week.endISO,
      label: args.context.week.label,
    },
    metrics: args.context.metrics,
    narrativeSpec: narrative.spec,
    factBundle: formatFactBundle(args.context),
    previousCopy: readPreviousCopySummary(args.existingRow ?? null),
    copyMeta: narrative.usageMeta,
    hero: {
      tone: narrative.spec.tone,
      defaultHeadline: narrative.hero.headline,
      defaultSubheadline: narrative.hero.subheadline,
    },
    findings: [
      buildEnergyFinding(args.context, narrative.spec.tone),
      buildRiskFinding(args.context),
      buildScheduleFinding(args.context),
    ],
    actions: narrative.actions,
    windows: args.context.sharedWindows.map((item) => ({
      dateISO: item.dateISO,
      label: formatMonthDay(item.dateISO),
      reason: `공개 일정 기준으로 ${item.members.length}명이 OFF/VAC인 날입니다.`,
      members: item.members,
    })),
    personalCards: args.context.cardCandidates.map((member) => buildPersonalCardSnapshot(member)),
  };
}

function buildDeterministicBriefPayload(args: {
  context: GroupBriefContext;
  promptVersion: string;
  existingRow?: SocialGroupAIBriefRow | null;
}): SocialGroupAIBriefPayload {
  const snapshot = buildSnapshot(args);
  return {
    week: snapshot.week,
    hero: {
      headline: snapshot.hero.defaultHeadline,
      subheadline: snapshot.hero.defaultSubheadline,
      tone: snapshot.hero.tone,
    },
    metrics: buildMetricsPayload(args.context.metrics),
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
      subheadline: `평균 body ${avgBatteryLabel} 흐름이지만 겹치는 회복 창이 ${commonOffCount}일 보여 쉬는 타이밍만 잘 맞춰도 부담을 줄일 수 있습니다.`,
    };
  }
  if (warningCount > 0 && noSharedWindow) {
    return {
      headline: "큰 위험 신호는 아니지만 리듬 차이를 방치하면 피로가 커질 수 있어요.",
      subheadline: `주의 ${warningCount}명 흐름에 겹치는 회복 창이 적어, 길게 맞추기보다 짧은 회복 슬롯을 먼저 맞추는 편이 안전합니다.`,
    };
  }
  if (tone === "steady" && strongSharedWindow) {
    return {
      headline: "이번 주는 안정 흐름 위에 같이 쉬는 창도 꽤 잡혀 있어요.",
      subheadline: `평균 body ${avgBatteryLabel}, 수면 ${avgSleepLabel}, 겹치는 회복 창 ${commonOffCount}일 흐름이라 지금 리듬을 유지하면서 회복 슬롯만 고정하면 충분합니다.`,
    };
  }
  if (tone === "steady" && noSharedWindow) {
    return {
      headline: "전체 흐름은 안정적이지만 쉬는 타이밍은 조금 흩어져 있어요.",
      subheadline: `평균 body ${avgBatteryLabel}, mental ${avgMentalLabel}로 크게 흔들리진 않지만 겹치는 회복 창이 적어 짧은 회복 창을 먼저 잡아 두는 편이 좋습니다.`,
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
      ? `겹치는 회복 창 ${context.commonOffDays.length}일`
      : `오늘 OFF ${context.metrics.offCountToday}명 · 야간 ${context.metrics.nightCountToday}명`;
  return {
    id: "schedule",
    tone: context.commonOffDays.length > 0 ? "steady" : context.metrics.nightCountToday > 0 ? "watch" : "steady",
    factLabel: scheduleLabel,
    factText:
      context.commonOffDays.length > 0
        ? `이번 주 공개 일정 기준으로 둘 이상 겹치는 회복 창이 ${context.commonOffDays.length}일 있습니다.`
        : `오늘 공개 일정 기준으로 OFF/VAC ${context.metrics.offCountToday}명, 야간 ${context.metrics.nightCountToday}명입니다.`,
    defaultTitle: context.commonOffDays.length > 0 ? "같이 맞추기 좋은 회복 창이 보이는 흐름" : "리듬 차이가 있어 짧은 조율이 필요한 흐름",
    defaultBody:
      context.commonOffDays.length > 0
        ? `이번 주 공개 일정 기준으로 둘 이상 겹치는 회복 창이 ${context.commonOffDays.length}일 있습니다. 긴 계획보다 같은 타이밍에 쉬는 창을 먼저 고정하는 편이 더 효과적입니다.`
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
      reason: `겹치는 회복 창 ${commonOffCount}일`,
      factText: `이번 주는 둘 이상 겹치는 회복 창을 먼저 고정하는 편이 좋습니다.`,
      defaultTitle: `겹치는 회복 창 ${commonOffCount}일에 회복 슬롯 고정`,
      defaultBody: `공개 일정 기준으로 둘 이상 겹치는 회복 창이 ${commonOffCount}일 있습니다. 새로운 약속보다 회복성 일정 하나를 그 창에 먼저 올려 두는 편이 유지에 유리합니다.`,
    });
  } else {
    push({
      id: "micro_window",
      priority: 22,
      reason: "겹치는 회복 창이 거의 없습니다.",
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
    reason: commonOffCount > 0 ? `겹치는 회복 창 ${commonOffCount}일` : "짧은 회복 슬롯 유지",
    factText: "하루 회복 앵커 하나를 먼저 고정하는 편이 좋습니다.",
    defaultTitle: "하루 회복 앵커 하나는 매일 고정",
    defaultBody:
      commonOffCount > 0
        ? "겹치는 회복 창이 있더라도 각자 회복 타이밍 하나는 비슷한 시간대로 고정해 두는 편이 주간 리듬을 덜 흔들리게 만듭니다."
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

function buildStoredFlowRowLevel(
  id: SocialGroupAIBriefFlowRow["id"],
  payload: SocialGroupAIBriefPayload
): 1 | 2 | 3 | 4 | 5 {
  if (id === "energy") {
    if ((payload.metrics.avgBattery ?? 100) < 40 || (payload.metrics.avgSleep ?? 99) < 5.8) return 2;
    if ((payload.metrics.avgBattery ?? 100) < 62 || (payload.metrics.avgSleep ?? 99) < 6.7) return 3;
    if ((payload.metrics.avgBattery ?? 100) < 74 || (payload.metrics.avgSleep ?? 99) < 7.2) return 4;
    return 5;
  }
  if (id === "risk") {
    if (payload.metrics.dangerCount > 0) return 5;
    if (payload.metrics.warningCount > 1) return 4;
    if (payload.metrics.warningCount > 0) return 3;
    return 2;
  }
  if (payload.metrics.commonOffCount >= 2 || payload.windows.length >= 2) return 5;
  if (payload.metrics.commonOffCount >= 1 || payload.windows.length >= 1) return 4;
  if (payload.metrics.nightCountToday === 0) return 3;
  return 2;
}

function buildLivePanel(args: {
  row: SocialGroupAIBriefRow | null;
  context: GroupBriefContext | null;
}): NonNullable<SocialGroupAIBriefResponse["live"]> {
  const payload = args.row?.payload && hasRenderableBrief(args.row.payload) ? args.row.payload : null;
  const snapshot = !payload && args.context
    ? buildSnapshot({
        context: args.context,
        promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
        existingRow: args.row,
      })
    : null;
  const flowSource: Array<{
    id: string;
    title: string;
    body: string;
    tone: SocialGroupAIBriefTone;
    factLabel: string;
  }> =
    payload?.findings && payload.findings.length === 3
      ? payload.findings
      : (snapshot?.findings ?? []).map((item) => ({
          id: item.id,
          title: item.defaultTitle,
          body: item.defaultBody,
          tone: item.tone,
          factLabel: item.factLabel,
        }));
  const windowSource = payload?.windows ?? snapshot?.windows ?? [];
  const personalCardSource =
    payload?.personalCards ??
    (snapshot?.personalCards ?? []).map((item) => ({
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
    }));
  const metricsSource =
    payload?.metrics ??
    (args.context
      ? buildMetricsPayload(args.context.metrics)
      : {
          contributorCount: 0,
          optInCardCount: 0,
          avgBattery: null,
          avgSleep: null,
          warningCount: 0,
          dangerCount: 0,
          commonOffCount: 0,
          nightCountToday: 0,
          offCountToday: 0,
        });
  const liveFlowSource = flowSource.reduce<
    Array<{
      id: "energy" | "risk";
      title: string;
      body: string;
      tone: SocialGroupAIBriefTone;
      factLabel: string;
    }>
  >((list, item) => {
    if (item.id === "energy" || item.id === "risk") {
      list.push({
        id: item.id,
        title: item.title,
        body: item.body,
        tone: item.tone,
        factLabel: item.factLabel,
      });
    }
    return list;
  }, []);
  const weekSource = payload?.week ?? snapshot?.week ?? args.context?.week;
  return {
    week: weekSource ?? {
      startISO: todayISO(),
      endISO: todayISO(),
      label: formatMonthDay(todayISO()),
    },
    updatedAt: args.row?.generated_at ?? new Date().toISOString(),
    metrics: metricsSource,
    flowRows: liveFlowSource.map((item) => ({
      id: item.id,
      label: item.id === "energy" ? "에너지" : "리스크",
      title: item.title,
      summary: item.body,
      factLabel: item.factLabel,
      tone: item.tone,
      level: payload
        ? buildStoredFlowRowLevel(item.id as SocialGroupAIBriefFlowRow["id"], payload)
        : buildFlowRowLevel(item.id as SocialGroupAIBriefFlowRow["id"], args.context as GroupBriefContext),
    })),
    windows: windowSource,
    personalCards: personalCardSource,
  };
}

function buildSnapshotPanel(args: {
  row: SocialGroupAIBriefRow | null;
  context: GroupBriefContext | null;
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

  if (!args.context) {
    return {
      snapshot: {
        hero: {
          headline: "이번 주 그룹 흐름을 준비 중이에요.",
          subheadline: "브리프를 생성하면 이번 주 회복 패턴을 한눈에 볼 수 있어요.",
          tone: "steady",
        },
        actions: [],
        generatedAt: null,
      },
      stale: true,
      errorCode: "group_ai_brief_missing",
    };
  }

  const fallback = buildDeterministicBriefPayload({
    context: args.context,
    promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
    existingRow: args.row,
  });
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

function buildStoredUsageRecord(args: {
  snapshot: SocialGroupAIBriefSnapshot;
  providerUsage?: unknown;
  llmMode: string;
  responseId?: string | null;
  traceId?: string | null;
  storeResponses?: boolean;
  requestUrl?: string | null;
  authMode?: string | null;
  usesCloudflareGateway?: boolean;
  requestMetadata?: Record<string, string> | null;
  extras?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...args.snapshot.copyMeta,
    llmMode: args.llmMode,
    providerUsage: args.providerUsage ?? null,
    responseId: args.responseId ?? null,
    traceId: args.traceId ?? null,
    storeResponses: args.storeResponses ?? null,
    requestUrl: args.requestUrl ?? null,
    authMode: args.authMode ?? null,
    usesCloudflareGateway: args.usesCloudflareGateway ?? null,
    requestMetadata: args.requestMetadata ?? null,
    ...(args.extras ?? {}),
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
  const existingRow =
    args.existingRow !== undefined || !admin ? args.existingRow ?? null : await readBriefRow(admin, args.groupId, context.week.startISO);

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

  const snapshot = buildSnapshot({
    context,
    promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
    existingRow,
  });
  const model = resolveSocialGroupAIBriefModel();
  const controller = new AbortController();
  try {
    const { generateSocialGroupBriefCopy } = await import("@/lib/server/openaiSocialGroupBrief");
    const aiResult = await generateSocialGroupBriefCopy({
      snapshot,
      model,
      signal: controller.signal,
      groupId: args.groupId,
      generatorType: args.generatorType,
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
    });

    if (aiResult.ok) {
      console.info("[SocialGroupAIBrief] generation_ready", {
        groupId: args.groupId,
        generatorType: args.generatorType,
        model: aiResult.model,
        generatedAt: snapshot.week.startISO,
        traceId: aiResult.traceId,
        responseId: aiResult.responseId,
        storeResponses: aiResult.storeResponses,
        authMode: aiResult.authMode,
        usesCloudflareGateway: aiResult.usesCloudflareGateway,
      });
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
        usage: buildStoredUsageRecord({
          snapshot,
          providerUsage: aiResult.usage,
          llmMode: "hero_actions_refine_v2",
          responseId: aiResult.responseId,
          traceId: aiResult.traceId,
          storeResponses: aiResult.storeResponses,
          requestUrl: aiResult.requestUrl,
          authMode: aiResult.authMode,
          usesCloudflareGateway: aiResult.usesCloudflareGateway,
          requestMetadata: aiResult.requestMetadata,
        }),
        cooldownUntil,
      });
    }

    const fallbackPayload = buildDeterministicBriefPayload({
      context,
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
      existingRow,
    });
    console.warn("[SocialGroupAIBrief] generation_fallback", {
      groupId: args.groupId,
      generatorType: args.generatorType,
      model: aiResult.model,
      traceId: aiResult.traceId,
      responseId: aiResult.responseId,
      storeResponses: aiResult.storeResponses,
      authMode: aiResult.authMode,
      usesCloudflareGateway: aiResult.usesCloudflareGateway,
      error: aiResult.error,
    });
    return buildRow({
      groupId: args.groupId,
      context,
      status: "ready",
      generatorType: args.generatorType,
      model: aiResult.model,
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
      payload: fallbackPayload,
      usage: buildStoredUsageRecord({
        snapshot,
        llmMode: "hero_actions_refine_v2",
        responseId: aiResult.responseId,
        traceId: aiResult.traceId,
        storeResponses: aiResult.storeResponses,
        requestUrl: aiResult.requestUrl,
        authMode: aiResult.authMode,
        usesCloudflareGateway: aiResult.usesCloudflareGateway,
        requestMetadata: aiResult.requestMetadata,
        extras: {
          fallbackReason: aiResult.error,
        },
      }),
      cooldownUntil,
    });
  } catch (error) {
    if (existingRow && hasRenderableBrief(existingRow.payload)) {
      return {
        ...existingRow,
        status: "failed",
        generator_type: args.generatorType,
        model,
        prompt_version: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
        cooldown_until: cooldownUntil,
        usage: {
          ...(existingRow.usage ?? {}),
          ...snapshot.copyMeta,
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
      model,
      promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
      payload: buildDeterministicBriefPayload({
        context,
        promptVersion: SOCIAL_GROUP_AI_BRIEF_PROMPT_VERSION,
        existingRow,
      }),
      usage: {
        ...snapshot.copyMeta,
        error: String((error as any)?.message ?? error ?? "group_ai_brief_generation_failed"),
      },
      cooldownUntil,
    });
  }
}

function buildResponse(args: {
  row: SocialGroupAIBriefRow | null;
  viewer: ViewerPrefs;
  context: GroupBriefContext | null;
}): SocialGroupAIBriefResponse {
  const hasStoredRow = Boolean(args.row?.payload && hasRenderableBrief(args.row.payload));
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

  if (args.context && !hasMinimumContributorCount(args.context) && !hasStoredRow) {
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

  if (!args.context && !hasStoredRow) {
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
  const traceMeta = readStoredTraceMeta(args.row);
  const hasStoredPayload = Boolean(args.row?.payload && hasRenderableBrief(args.row.payload));
  console.info("[SocialGroupAIBrief] response_ready", {
    groupId: args.context?.groupId ?? args.row?.group_id ?? null,
    rowStatus: args.row?.status ?? null,
    generatedAt: args.row?.generated_at ?? null,
    stale: snapshotPanel.stale,
    errorCode: snapshotPanel.errorCode,
    canRefresh,
    snapshotSource: hasStoredPayload ? "stored_payload" : "deterministic_fallback",
    liveUsesStoredFindings: Boolean(args.row?.payload?.findings && args.row.payload.findings.length === 3),
    liveUsesStoredWindows: Array.isArray(args.row?.payload?.windows),
    liveUsesStoredPersonalCards: Array.isArray(args.row?.payload?.personalCards),
    traceId: traceMeta.traceId,
    responseId: traceMeta.responseId,
    storeResponses: traceMeta.storeResponses,
    requestUrl: traceMeta.requestUrl,
    authMode: traceMeta.authMode,
    usesCloudflareGateway: traceMeta.usesCloudflareGateway,
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
    live: buildLivePanel({ row: args.row, context: args.context }),
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
  let currentWeekRow: SocialGroupAIBriefRow | null = null;
  let row: SocialGroupAIBriefRow | null = null;
  try {
    currentWeekRow = await readBriefRow(args.admin, args.groupId, week.startISO);
    row = currentWeekRow;
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
  const currentWeekRow = await readBriefRow(args.admin, args.groupId, week.startISO);
  const existingRow = currentWeekRow ?? (await readLatestStoredDisplayRow(args.admin, args.groupId));
  const currentContext = await loadGroupBriefContext({
    admin: args.admin,
    groupId: args.groupId,
    subscriptionCache,
  });
  const existingTraceMeta = readStoredTraceMeta(existingRow);
  console.info("[SocialGroupAIBrief] manual_refresh_start", {
    groupId: args.groupId,
    userId: String(args.userId).slice(0, 8),
    existingStatus: existingRow?.status ?? null,
    existingGeneratedAt: existingRow?.generated_at ?? null,
    existingTraceId: existingTraceMeta.traceId,
    existingResponseId: existingTraceMeta.responseId,
  });
  if (
    currentWeekRow?.cooldown_until &&
    Date.parse(currentWeekRow.cooldown_until) > Date.now() &&
    !shouldBypassCooldownForCurrentContext(currentWeekRow, currentContext)
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
  const savedTraceMeta = readStoredTraceMeta(generated);
  console.info("[SocialGroupAIBrief] manual_refresh_saved", {
    groupId: args.groupId,
    rowStatus: generated.status,
    generatedAt: generated.generated_at,
    traceId: savedTraceMeta.traceId,
    responseId: savedTraceMeta.responseId,
    storeResponses: savedTraceMeta.storeResponses,
    requestUrl: savedTraceMeta.requestUrl,
    authMode: savedTraceMeta.authMode,
    usesCloudflareGateway: savedTraceMeta.usesCloudflareGateway,
  });

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

async function autoGenerateGroupAIBriefForGroup(args: {
  admin: any;
  groupId: number;
  subscriptionCache: Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>;
}) {
  const week = getCurrentWeekWindow();
  const currentWeekRow = await readBriefRow(args.admin, args.groupId, week.startISO);
  if (isSuccessfulStoredBriefRow(currentWeekRow) && wasRowGeneratedOnDay(currentWeekRow, week.todayISO)) {
    return { status: "already_generated_today" as const, row: currentWeekRow };
  }

  const context = await loadGroupBriefContext({
    admin: args.admin,
    groupId: args.groupId,
    subscriptionCache: args.subscriptionCache,
  });

  if (!context.hasPaidEligibleMember) {
    return { status: "no_paid_member" as const, row: null };
  }
  if (!hasMinimumContributorCount(context)) {
    return { status: "insufficient_contributors" as const, row: null };
  }
  if (!hasAutoGenerateReadyContributors(context)) {
    return {
      status: "today_threshold_not_met" as const,
      row: null,
      contributorCount: context.metrics.contributorCount,
      todayContributorRecordCount: context.metrics.todayContributorRecordCount,
      autoGenerateRequiredCount: context.metrics.autoGenerateRequiredCount,
    };
  }

  const seedRow = currentWeekRow ?? (await readLatestStoredDisplayRow(args.admin, args.groupId));
  const generated = await generateGroupAIBriefArtifact({
    admin: args.admin,
    groupId: args.groupId,
    generatorType: "cron",
    subscriptionCache: args.subscriptionCache,
    existingRow: seedRow,
  });

  if (!generated) {
    return { status: "generation_skipped" as const, row: null };
  }
  if (generated.status !== "ready" || readStoredFallbackReason(generated)) {
    return { status: "preserved_existing_output" as const, row: generated };
  }

  await upsertBriefRow(args.admin, generated);
  return { status: "processed" as const, row: generated };
}

export async function maybeAutoRefreshGroupAIBriefsForUserStateChange(args: {
  admin: any;
  userId: string;
  previousPayload: unknown;
  nextPayload: unknown;
}) {
  const dayISO = todayISO();
  if (!didTrackedHealthInputChange(args.previousPayload, args.nextPayload, dayISO)) {
    return {
      dayISO,
      triggered: false,
      reason: "no_relevant_today_health_change",
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  const { data: memberships, error } = await (args.admin as any)
    .from("rnest_social_group_members")
    .select("group_id")
    .eq("user_id", args.userId);
  if (error) throw error;

  const groupIds = Array.from(
    new Set<number>(
      (memberships ?? [])
        .map((row: any) => Number(row.group_id))
        .filter((value: number) => Number.isFinite(value) && value > 0)
    )
  );
  if (groupIds.length === 0) {
    return {
      dayISO,
      triggered: false,
      reason: "no_group_membership",
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  const subscriptionCache = new Map<string, SocialGroupAIBriefSubscriptionSnapshot | null>();
  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const groupId of groupIds) {
    try {
      const result = await autoGenerateGroupAIBriefForGroup({
        admin: args.admin,
        groupId,
        subscriptionCache,
      });
      if (result.status === "processed") {
        processedCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error(
        "[SocialGroupAIBrief] auto generation failed group=%d userId=%s err=%s",
        groupId,
        String(args.userId).slice(0, 8),
        String((error as any)?.message ?? error)
      );
    }
  }

  return {
    dayISO,
    triggered: processedCount > 0,
    reason: processedCount > 0 ? "processed" : "threshold_not_met_or_preserved",
    processedCount,
    skippedCount,
    failedCount,
  };
}

export async function generateWeeklyGroupAIBriefs(args: { admin: any }) {
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
      const result = await autoGenerateGroupAIBriefForGroup({
        admin: args.admin,
        groupId,
        subscriptionCache,
      });
      if (result.status !== "processed") {
        skippedCount += 1;
        continue;
      }
      processedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error("[SocialGroupAIBrief] cron generation failed group=%d err=%s", groupId, String((error as any)?.message ?? error));
    }
  }

  return {
    weekStartISO: getCurrentWeekWindow().startISO,
    processedCount,
    skippedCount,
    failedCount,
  };
}
