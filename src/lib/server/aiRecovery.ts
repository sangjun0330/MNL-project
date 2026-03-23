import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, isISODate, toISODate, todayISO } from "@/lib/date";
import {
  AI_RECOVERY_ORDER_COUNT,
  AI_RECOVERY_PROMPT_VERSION,
  filterCompletionIdsForOrders,
  getAIRecoverySlotDescription,
  getAIRecoverySlotLabel,
  normalizeAIRecoveryLanguage,
  type AIRecoveryBrief,
  type AIRecoveryBriefSection,
  type AIRecoveryContextMeta,
  type AIRecoveryEffort,
  type AIRecoveryGate,
  type AIRecoveryGenerationCounts,
  type AIRecoveryGenerationQuota,
  type AIRecoveryLanguage,
  type AIRecoveryOpenAIMeta,
  type AIRecoveryOrder,
  type AIRecoveryOrdersPayload,
  type AIRecoverySlot,
  type AIRecoverySlotPayload,
  type AIRecoveryStatus,
  type AIRecoveryTone,
} from "@/lib/aiRecovery";
import { buildBillingEntitlements } from "@/lib/billing/entitlements";
import { getAIRecoveryModelForTier, type PlanTier } from "@/lib/billing/plans";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import { computePersonalizationAccuracy, topFactors, type FactorKey } from "@/lib/insightsV2";
import type { AppState, BioInputs, EmotionEntry } from "@/lib/model";
import { buildRecoveryPhaseState } from "@/lib/recoveryPhases";
import {
  buildPlannerContext,
  formatRelativeDutyKorean,
  normalizeProfileSettings,
  type PlannerContext,
} from "@/lib/recoveryPlanner";
import { statusFromScore, vitalDisplayScore } from "@/lib/rnestInsight";
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore";
import { loadAIRecoveryDomains, readAIRecoverySlot, writeAIRecoveryCompletions, writeAIRecoverySlot } from "@/lib/server/aiRecoveryStateStore";
import { readSubscription } from "@/lib/server/billingStore";
import { combineAIRecoveryUsages, runAIRecoveryStructuredRequest } from "@/lib/server/openaiRecovery";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import type { Shift } from "@/lib/types";
import { computeVitalsRange, type DailyVital } from "@/lib/vitals";

const INSIGHTS_MIN_DAYS = 3;
type RecoverySnapshot = {
  state: AppState;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  language: AIRecoveryLanguage;
  historyStart: ISODate;
  historyEnd: ISODate;
  historyRows: Array<Record<string, unknown>>;
  todayRow: Record<string, unknown>;
  recordedDays: number;
  todayShift: Shift;
  todayVital: DailyVital | null;
  todayDisplay: number | null;
  status: ReturnType<typeof statusFromScore>;
  fastCharge: boolean;
  accuracyPercent: number;
  topFactorRows: Array<{ key: FactorKey; label: string; pct: number }>;
  plannerContext: PlannerContext;
  sleepDebtHours: number;
  nightStreak: number;
  derivedMetrics: Record<string, unknown>;
  cycleContext: Record<string, unknown>;
  workConstraints: Record<string, unknown>;
  inputSignature: string;
  contextMeta: AIRecoveryContextMeta;
};

type OpenAIFlowResult = {
  status: AIRecoveryStatus;
  brief: AIRecoveryBrief;
  orders: AIRecoveryOrdersPayload;
  reasoningEffort: AIRecoveryEffort;
  model: string;
  openaiMeta: AIRecoveryOpenAIMeta;
};

type RecoverySubscriptionSnapshot = {
  tier: PlanTier;
  hasPaidAccess: boolean;
  entitlements: {
    recoveryPlannerAI: boolean;
  };
  aiRecoveryModel: string | null;
};

type LoadedRecoveryDomains = Awaited<ReturnType<typeof loadAIRecoveryDomains>>;
type LoadedRecoverySlot = Awaited<ReturnType<typeof readAIRecoverySlot>>;

type SafeLoadedRecoveryDomains = LoadedRecoveryDomains & {
  storageAvailable: boolean;
};

type SafeLoadedRecoverySlot = LoadedRecoverySlot & {
  storageAvailable: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}

function trimText(value: unknown, maxLength = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function asStringArray(value: unknown, maxItems = 8, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = trimText(item, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function buildAsciiSlug(raw: string, fallback: string) {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

function buildOrderId(slot: AIRecoverySlot, source: string, index: number) {
  return `${slot}_${buildAsciiSlug(source, `order_${index + 1}`)}`;
}

function normalizedMood(bio: BioInputs | null | undefined, emotion: EmotionEntry | null | undefined) {
  if (bio?.mood != null) return bio.mood;
  if (emotion?.mood != null) return emotion.mood;
  return null;
}

function shiftLabel(shift: Shift | null) {
  if (shift === "D") return "D";
  if (shift === "E") return "E";
  if (shift === "N") return "N";
  if (shift === "M") return "M";
  if (shift === "VAC") return "VAC";
  return "OFF";
}

function readDailyPersistedRow(state: AppState, iso: ISODate) {
  const bio = state.bio?.[iso] ?? null;
  const emotion = state.emotions?.[iso] ?? null;
  const workEventTags = Array.isArray(bio?.workEventTags)
    ? bio.workEventTags
        .map((item) => trimText(item, 40))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const workEventNote = trimText(bio?.workEventNote, 280);
  const note = trimText(state.notes?.[iso], 280);
  return {
    dateISO: iso,
    sleepHours: bio?.sleepHours ?? null,
    napHours: bio?.napHours ?? null,
    stress: bio?.stress ?? null,
    activity: bio?.activity ?? null,
    caffeineMg: bio?.caffeineMg ?? null,
    mood: normalizedMood(bio, emotion),
    symptomSeverity: bio?.symptomSeverity ?? null,
    workEventTags,
    workEventNote: workEventNote || "-",
    note: note || "-",
  };
}

function listHistoryDates(endISO: ISODate, days = 14) {
  const end = fromISODate(endISO);
  const out: ISODate[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    out.push(toISODate(addDays(end, -index)));
  }
  return out;
}

function buildSignature(value: unknown) {
  const source = JSON.stringify(value);
  let hashA = 2166136261;
  let hashB = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 16777619);
    hashB ^= code + (index & 255);
    hashB = Math.imul(hashB, 16777619);
  }
  const hexA = (hashA >>> 0).toString(16).padStart(8, "0");
  const hexB = (hashB >>> 0).toString(16).padStart(8, "0");
  return `sig:${hexA}${hexB}`;
}

function safeUserLogId(userId: string) {
  return String(userId ?? "").slice(0, 8);
}

function asRecoveryPlanTier(value: unknown): PlanTier {
  if (value === "plus" || value === "pro") return value;
  return "free";
}

function asRecoverySubscriptionStatus(value: unknown): "inactive" | "active" | "expired" {
  if (value === "active" || value === "expired") return value;
  return "inactive";
}

function hasPaidAccessForRecovery(args: {
  tier: PlanTier;
  status: "inactive" | "active" | "expired";
  currentPeriodEnd: string | null;
}) {
  if (args.tier === "free") return false;
  if (args.status !== "active") return false;
  const endMs = args.currentPeriodEnd ? Date.parse(args.currentPeriodEnd) : NaN;
  if (!Number.isFinite(endMs)) return true;
  return endMs > Date.now();
}

function projectRecoverySubscription(args: {
  tier: PlanTier;
  status: "inactive" | "active" | "expired";
  currentPeriodEnd: string | null;
}): RecoverySubscriptionSnapshot {
  const hasPaidAccess = hasPaidAccessForRecovery(args);
  return {
    tier: args.tier,
    hasPaidAccess,
    entitlements: {
      recoveryPlannerAI: buildBillingEntitlements({
        tier: args.tier,
        hasPaidAccess,
        medSafetyTotalRemaining: 0,
      }).recoveryPlannerAI,
    },
    aiRecoveryModel: getAIRecoveryModelForTier(args.tier),
  };
}

async function readRecoverySubscriptionSnapshot(userId: string): Promise<RecoverySubscriptionSnapshot | null> {
  try {
    const subscription = await readSubscription(userId);
    return {
      tier: subscription.tier,
      hasPaidAccess: subscription.hasPaidAccess,
      entitlements: {
        recoveryPlannerAI: Boolean(subscription.entitlements.recoveryPlannerAI),
      },
      aiRecoveryModel: subscription.aiRecoveryModel,
    };
  } catch (error) {
    console.error("[AIRecovery] read_subscription_failed_primary", {
      userId: safeUserLogId(userId),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("rnest_users")
      .select("subscription_tier, subscription_status, subscription_current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return projectRecoverySubscription({ tier: "free", status: "inactive", currentPeriodEnd: null });
    return projectRecoverySubscription({
      tier: asRecoveryPlanTier(data.subscription_tier),
      status: asRecoverySubscriptionStatus(data.subscription_status),
      currentPeriodEnd: typeof data.subscription_current_period_end === "string" ? data.subscription_current_period_end : null,
    });
  } catch (error) {
    console.error("[AIRecovery] read_subscription_failed_fallback", {
      userId: safeUserLogId(userId),
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function safeLoadRecoveryDomains(userId: string): Promise<SafeLoadedRecoveryDomains> {
  try {
    return {
      ...(await loadAIRecoveryDomains(userId)),
      storageAvailable: true,
    };
  } catch (error) {
    console.error("[AIRecovery] load_domains_failed", {
      userId: safeUserLogId(userId),
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      payload: {},
      aiRecoveryDaily: {},
      recoveryOrderCompletions: {},
      storageAvailable: false,
    };
  }
}

async function safeReadRecoverySlot(args: {
  userId: string;
  dateISO: ISODate;
  slot: AIRecoverySlot;
}): Promise<SafeLoadedRecoverySlot> {
  try {
    return {
      ...(await readAIRecoverySlot(args)),
      storageAvailable: true,
    };
  } catch (error) {
    console.error("[AIRecovery] read_slot_failed", {
      userId: safeUserLogId(args.userId),
      dateISO: args.dateISO,
      slot: args.slot,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      session: null,
      completions: [],
      aiRecoveryDaily: {},
      recoveryOrderCompletions: {},
      storageAvailable: false,
    };
  }
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toFiniteNumbers(values: unknown[]) {
  return values.flatMap((value) => (typeof value === "number" && Number.isFinite(value) ? [value] : []));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function listRecordedDates(state: AppState, endISO: ISODate) {
  const dates = new Set<ISODate>();
  for (const raw of new Set([...Object.keys(state.bio ?? {}), ...Object.keys(state.emotions ?? {})])) {
    if (!isISODate(raw)) continue;
    const iso = raw as ISODate;
    if (iso > endISO) continue;
    if (!hasHealthInput(state.bio?.[iso] ?? null, state.emotions?.[iso] ?? null)) continue;
    dates.add(iso);
  }
  return [...dates].sort();
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function collectTopTags(tags: string[], limit = 3) {
  return [...countBy(tags).entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function slotToRecoveryPhase(slot: AIRecoverySlot) {
  return slot === "postShift" ? "after_work" : "start";
}

function normalizeBriefCategory(key: string | null | undefined): AIRecoveryBriefSection["category"] {
  if (key === "sleep" || key === "shift" || key === "caffeine" || key === "menstrual" || key === "stress" || key === "activity") {
    return key;
  }
  if (key === "mood") return "stress";
  return "sleep";
}

function resolveSectionCategory(value: unknown, fallback: AIRecoveryBriefSection["category"]): AIRecoveryBriefSection["category"] {
  if (value === "sleep" || value === "shift" || value === "caffeine" || value === "menstrual" || value === "stress" || value === "activity") {
    return value;
  }
  return fallback;
}

function resolveSectionSeverity(value: unknown, fallback: AIRecoveryBriefSection["severity"]): AIRecoveryBriefSection["severity"] {
  if (value === "info" || value === "caution" || value === "warning") return value;
  return fallback;
}

function shouldIncludeMenstrualBriefCategory(snapshot: RecoverySnapshot, data?: ReturnType<typeof buildStartRecoveryPromptData>) {
  if (data) return Boolean(data.menstrualCategoryVisible);
  return Boolean(snapshot.state.settings?.menstrual?.enabled && snapshot.todayVital?.menstrual?.enabled && snapshot.todayVital?.menstrual?.label);
}

function getFixedBriefCategories(snapshot: RecoverySnapshot, data: ReturnType<typeof buildStartRecoveryPromptData>) {
  return [
    "sleep",
    "shift",
    "caffeine",
    ...(shouldIncludeMenstrualBriefCategory(snapshot, data) ? (["menstrual"] as const) : []),
    "stress",
    "activity",
  ] satisfies AIRecoveryBriefSection["category"][];
}

function getBriefCategoryTitle(category: AIRecoveryBriefSection["category"]) {
  switch (category) {
    case "sleep":
      return "수면";
    case "shift":
      return "교대근무";
    case "caffeine":
      return "카페인";
    case "menstrual":
      return "생리주기";
    case "stress":
      return "스트레스&감정";
    case "activity":
      return "신체활동";
    default:
      return "해설";
  }
}

function buildStartRecoveryPromptData(snapshot: RecoverySnapshot) {
  const state = snapshot.state;
  const recordedDates = listRecordedDates(state, snapshot.dateISO);
  const firstRecorded = recordedDates[0] ?? snapshot.dateISO;
  const allVitals = computeVitalsRange({ state, start: firstRecorded, end: snapshot.dateISO });
  const vitalByISO = new Map(allVitals.map((item) => [item.dateISO, item] as const));
  const recent7Dates = listHistoryDates(snapshot.dateISO, 7);
  const prev7End = toISODate(addDays(fromISODate(snapshot.dateISO), -7));
  const prev7Dates = listHistoryDates(prev7End, 7);
  const todayBio = state.bio?.[snapshot.dateISO] ?? null;
  const profile = normalizeProfileSettings(state.settings?.profile);
  const recentVitalsRows = recent7Dates.map((iso) => {
    const bio = state.bio?.[iso] ?? null;
    const emotion = state.emotions?.[iso] ?? null;
    const vital = vitalByISO.get(iso) ?? null;
    const row: Record<string, unknown> = {
      dateISO: iso,
      shift: shiftLabel((state.schedule?.[iso] as Shift | undefined) ?? vital?.shift ?? "OFF"),
      sleepHours: bio?.sleepHours ?? null,
      napHours: bio?.napHours ?? null,
      symptomSeverity: bio?.symptomSeverity ?? null,
    };
    if (iso !== snapshot.dateISO) {
      row.stress = bio?.stress ?? null;
      row.activity = bio?.activity ?? null;
      row.mood = normalizedMood(bio, emotion) ?? "-";
      row.caffeineMg = bio?.caffeineMg ?? null;
      row.workEventTags = Array.isArray(bio?.workEventTags) ? bio?.workEventTags.filter(Boolean).slice(0, 8) : [];
      row.workEventNote = trimText(bio?.workEventNote, 280) || "-";
      row.note = trimText(state.notes?.[iso], 280) || "-";
    }
    return row;
  });
  const weeklyWorkRows = recent7Dates
    .filter((iso) => iso !== snapshot.dateISO)
    .map((iso) => ({
      tags: Array.isArray(state.bio?.[iso]?.workEventTags) ? (state.bio?.[iso]?.workEventTags ?? []).filter(Boolean) : [],
      workEventNote: trimText(state.bio?.[iso]?.workEventNote, 280),
      note: trimText(state.notes?.[iso], 280),
    }));
  const weeklyEventTags = weeklyWorkRows.flatMap((row) => row.tags);
  const weeklyNotes = weeklyWorkRows
    .flatMap((row) => [row.workEventNote, row.note])
    .filter(Boolean)
    .slice(0, 3);
  const recentScores = recent7Dates
    .map((iso) => vitalByISO.get(iso))
    .filter((vital): vital is DailyVital => Boolean(vital))
    .map((vital) => vitalDisplayScore(vital));
  const prevScores = prev7Dates
    .map((iso) => vitalByISO.get(iso))
    .filter((vital): vital is DailyVital => Boolean(vital))
    .map((vital) => vitalDisplayScore(vital));
  const historyVitals = recordedDates
    .map((iso) => vitalByISO.get(iso))
    .filter((vital): vital is DailyVital => Boolean(vital));
  const menstrualCategoryVisible = Boolean(state.settings?.menstrual?.enabled && snapshot.todayVital?.menstrual?.enabled && snapshot.todayVital?.menstrual?.label);
  const topWorkTags = collectTopTags(
    recordedDates.flatMap((iso) => (Array.isArray(state.bio?.[iso]?.workEventTags) ? (state.bio?.[iso]?.workEventTags ?? []).filter(Boolean) : [])),
    5
  );
  const recurringSignals = [
    {
      label: "mood_low",
      count: recordedDates.filter((iso) => {
        const mood = normalizedMood(state.bio?.[iso] ?? null, state.emotions?.[iso] ?? null);
        return mood != null && mood <= 2;
      }).length,
    },
    {
      label: "stress_high",
      count: recordedDates.filter((iso) => (state.bio?.[iso]?.stress ?? -1) >= 2).length,
    },
    {
      label: "caffeine_high",
      count: recordedDates.filter((iso) => (state.bio?.[iso]?.caffeineMg ?? -1) >= 200).length,
    },
    {
      label: "night_shift",
      count: recordedDates.filter((iso) => ((state.schedule?.[iso] as Shift | undefined) ?? vitalByISO.get(iso)?.shift ?? "OFF") === "N").length,
    },
    {
      label: "sleep_short",
      count: recordedDates.filter((iso) => {
        const value = state.bio?.[iso]?.sleepHours;
        return typeof value === "number" && value < 6;
      }).length,
    },
  ]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return {
    language: snapshot.language,
    dateISO: snapshot.dateISO,
    phase: {
      id: "start",
      title: "오늘 시작 회복",
      purpose: "전날 기록과 오늘 수면만 기준으로 하루 시작 회복 방향을 정합니다.",
      todayInputPolicy: "오늘은 수면만 포함하고, 같은 날 스트레스·카페인·활동·기분·근무메모는 의도적으로 제외했습니다.",
    },
    menstrualTrackingEnabled: Boolean(state.settings?.menstrual?.enabled),
    menstrualCategoryVisible,
    shift: {
      today: shiftLabel(snapshot.todayShift),
      next: snapshot.plannerContext.nextDuty ? shiftLabel(snapshot.plannerContext.nextDuty) : null,
    },
    today: {
      sleepHours: todayBio?.sleepHours ?? null,
      napHours: todayBio?.napHours ?? null,
      symptomSeverity: todayBio?.symptomSeverity ?? null,
      menstrualLabel: snapshot.todayVital?.menstrual?.label ?? null,
      menstrualTracking: Boolean(state.settings?.menstrual?.enabled),
      sleepDebtHours: round1(snapshot.sleepDebtHours),
      nightStreak: snapshot.nightStreak,
    },
    weekly: {
      avgVital7: Math.round(average(recentScores) ?? 0),
      avgVitalPrev7: Math.round(average(prevScores) ?? 0),
      recordsIn7Days: recent7Dates.filter((iso) => hasHealthInput(state.bio?.[iso] ?? null, state.emotions?.[iso] ?? null)).length,
      workEvents: {
        daysWithEvents: weeklyWorkRows.filter((row) => row.tags.length > 0 || row.workEventNote || row.note).length,
        topTags: collectTopTags(weeklyEventTags, 3),
        notes: weeklyNotes,
      },
      recentVitals7: recentVitalsRows,
    },
    profile: {
      chronotype: profile.chronotype,
      caffeineSensitivity: profile.caffeineSensitivity,
    },
    plannerContext: {
      focusFactor: snapshot.plannerContext.focusFactor,
      primaryAction: snapshot.plannerContext.primaryAction,
      avoidAction: snapshot.plannerContext.avoidAction,
      nextDuty: snapshot.plannerContext.nextDuty,
      nextDutyDate: snapshot.plannerContext.nextDutyDate,
      plannerTone: snapshot.plannerContext.plannerTone,
      ordersTop3: snapshot.plannerContext.ordersTop3,
    },
    fixedSectionOrder: [
      "sleep",
      "shift",
      "caffeine",
      ...(menstrualCategoryVisible ? ["menstrual"] : []),
      "stress",
      "activity",
    ],
    history: {
      totalRecords: recordedDates.length,
      firstRecord: recordedDates[0] ?? null,
      lastRecord: recordedDates.at(-1) ?? null,
      avgVital: round1(average(historyVitals.map((vital) => vitalDisplayScore(vital))) ?? 0),
      avgSleepHours: round1(
        average(toFiniteNumbers(recordedDates.map((iso) => state.bio?.[iso]?.sleepHours))) ?? 0
      ),
      avgStress: round1(
        average(toFiniteNumbers(recordedDates.map((iso) => state.bio?.[iso]?.stress))) ?? 0
      ),
      avgCaffeineMg: round1(
        average(toFiniteNumbers(recordedDates.map((iso) => state.bio?.[iso]?.caffeineMg))) ?? 0
      ),
      avgMood: round1(
        average(toFiniteNumbers(recordedDates.map((iso) => normalizedMood(state.bio?.[iso] ?? null, state.emotions?.[iso] ?? null)))) ?? 0
      ),
      nightShiftDays: recordedDates.filter(
        (iso) => ((state.schedule?.[iso] as Shift | undefined) ?? vitalByISO.get(iso)?.shift ?? "OFF") === "N"
      ).length,
      offDays: recordedDates.filter(
        (iso) => ((state.schedule?.[iso] as Shift | undefined) ?? vitalByISO.get(iso)?.shift ?? "OFF") === "OFF"
      ).length,
      topWorkTags,
      recurringSignals,
    },
    recoveryThread: null,
  };
}

function buildSectionSeverity(snapshot: RecoverySnapshot, category: AIRecoveryBriefSection["category"]): AIRecoveryBriefSection["severity"] {
  if (category === "sleep") {
    if ((snapshot.contextMeta.todaySleepHours ?? 0) < 6 || snapshot.sleepDebtHours >= 3) return "warning";
    if ((snapshot.contextMeta.todaySleepHours ?? 0) < 7 || snapshot.sleepDebtHours >= 1.5) return "caution";
    return "info";
  }
  if (category === "menstrual") {
    if ((snapshot.state.bio?.[snapshot.dateISO]?.symptomSeverity ?? 0) >= 2) return "warning";
    return snapshot.plannerContext.focusFactor?.key === "menstrual" ? "caution" : "info";
  }
  if (category === "shift") {
    if (snapshot.nightStreak >= 2) return "warning";
    return snapshot.plannerContext.nextDuty && snapshot.plannerContext.nextDuty !== "OFF" ? "caution" : "info";
  }
  if (category === "caffeine") {
    return snapshot.topFactorRows.some((item) => item.key === "caffeine" && item.pct >= 0.18) ? "caution" : "info";
  }
  if (category === "stress") {
    return snapshot.topFactorRows.some((item) => item.key === "stress" && item.pct >= 0.18) ? "caution" : "info";
  }
  return "info";
}

function buildSectionDescription(snapshot: RecoverySnapshot, data: ReturnType<typeof buildStartRecoveryPromptData>, category: AIRecoveryBriefSection["category"]) {
  const nextDutyText = snapshot.plannerContext.nextDuty ? shiftLabel(snapshot.plannerContext.nextDuty) : "다음 근무";
  const stressHighCount = data.history.recurringSignals.find((item) => item.label === "stress_high")?.count ?? 0;
  const moodLowCount = data.history.recurringSignals.find((item) => item.label === "mood_low")?.count ?? 0;
  const lowActivityCount = data.weekly.recentVitals7.filter((item) => typeof item.activity === "number" && item.activity <= 1).length;
  switch (category) {
    case "sleep":
      return `오늘 수면이 ${data.today.sleepHours ?? 0}시간이고 남아 있는 수면부채가 ${data.today.sleepDebtHours}시간이라, 지난주보다 내려간 주간 배터리를 아침부터 덜 쓰는 편이 좋습니다.`;
    case "shift":
      return `오늘 일정이 ${shiftLabel(snapshot.todayShift)}이고 다음 근무가 ${nextDutyText}라, 최근 7일 배터리 ${data.weekly.avgVital7} 흐름을 흔들지 않도록 시작 기준을 먼저 잡는 편이 중요합니다.`;
    case "caffeine":
      return `최근 반복 패턴에 카페인 소모가 자주 잡혔고 평균 섭취량도 ${data.history.avgCaffeineMg}mg 수준이라, 오늘 첫 각성 전략을 가볍게 가져가는 편이 수면 흐름을 지키기 쉽습니다.`;
    case "menstrual":
      return `오늘은 ${data.today.menstrualLabel ?? "주기 흐름"} 구간으로 표시되고 증상 강도도 ${data.today.symptomSeverity ?? 0}으로 기록돼 있어, 따뜻함과 수분 쪽 시작 루틴이 회복 버퍼를 만들기 좋습니다.`;
    case "stress":
      return `최근 기록에서 스트레스가 높은 날이 ${stressHighCount}번 있었고 기분이 가라앉은 날도 ${moodLowCount}번 겹쳐, 시작 순간의 긴장을 낮추는 편이 하루 소모를 줄입니다.`;
    case "activity":
      return `최근 7일에 움직임이 낮은 날이 ${lowActivityCount}번 있었고 주간 배터리도 ${data.weekly.avgVital7}로 내려와 있어, 몸을 세게 쓰지 않는 짧은 순환 자극이 먼저 필요합니다.`;
    default:
      return `오늘 수면과 최근 배터리 흐름을 보면, 시작 리듬을 조용하게 고정하는 편이 회복에 유리합니다.`;
  }
}

function buildSectionTips(snapshot: RecoverySnapshot, category: AIRecoveryBriefSection["category"]): [string, string] {
  const workday = snapshot.todayShift !== "OFF" && snapshot.todayShift !== "VAC";
  switch (category) {
    case "sleep":
      return [
        "지금 물 한 컵을 마신 뒤 창가나 밝은 복도에서 3분만 서서 몸을 천천히 깨우세요.",
        workday
          ? "출근 전 씻고 나와 앉은 자리에서 2분만 목과 어깨를 천천히 풀어 수면 관성을 떼세요."
          : "세수나 샤워를 마친 뒤 소파 대신 의자에 앉아 2분만 목과 어깨를 천천히 풀어 주세요.",
      ];
    case "shift":
      return [
        workday
          ? "출근 준비를 시작할 때 가방 앞주머니에 물병을 넣고, 근무 시작 전 첫 휴식 타이밍 하나만 미리 정하세요."
          : "오전 일정을 시작하기 전에 물병과 필요한 물건을 한곳에 모아 두고, 오늘 꼭 할 일 한 가지만 남기세요.",
        workday
          ? "집을 나서기 전 일정 앱이나 메모를 1분만 보고 오늘 꼭 필요한 일 한 가지를 정한 뒤 출발하세요."
          : "오전 외출이나 집안일을 시작하기 전에 1분만 서서 동선을 정리하고, 무거운 일정은 한 칸 뒤로 미루세요.",
      ];
    case "caffeine":
      return [
        "지금 첫 음료를 고를 때 큰 컵 커피보다 물 한 컵이나 연한 음료를 먼저 마시고 20분 뒤 필요하면 결정하세요.",
        "출근 전 카페인을 마신다면 오늘은 한 번만 정하고, 점심 이후 추가 섭취는 메모에 막아 두세요.",
      ];
    case "menstrual":
      return [
        "지금 물이나 미지근한 차를 먼저 마시고, 가능하면 배를 덮을 수 있는 얇은 겉옷을 바로 챙기세요.",
        "세수나 샤워 뒤 2분 동안 허리와 골반 주변을 가볍게 늘려 몸을 부드럽게 깨우세요.",
      ];
    case "stress":
      return [
        "현관을 나서기 전 60초만 서서 숨을 길게 내쉬는 호흡을 6번 반복하고, 첫 업무 한 가지를 머릿속으로 정하세요.",
        workday
          ? "출근 전 이동 중에는 메신저를 닫고, 엘리베이터나 복도에서 어깨를 세 번 천천히 내리세요."
          : "오전 할 일을 시작하기 전 휴대폰 알림을 10분만 끄고, 의자에서 어깨를 세 번 천천히 내리세요.",
      ];
    case "activity":
      return [
        "양치 후 제자리에서 2분만 걷거나 발목을 번갈아 들어 혈액순환을 먼저 올리세요.",
        "집을 나서기 전 문 옆에서 종아리와 가슴을 30초씩 늘려 몸이 굳지 않게 시작하세요.",
      ];
    default:
      return [
        "지금 물 한 컵을 먼저 마신 뒤 1분만 숨을 길게 내쉬며 속도를 늦추세요.",
        "앉은 자리에서 2분만 목과 어깨를 풀고, 오늘 첫 일정 하나만 정한 뒤 움직이세요.",
      ];
  }
}

function buildNormalizedBriefSections(
  snapshot: RecoverySnapshot,
  sections: AIRecoveryBriefSection[],
  data = buildStartRecoveryPromptData(snapshot)
): AIRecoveryBriefSection[] {
  const byCategory = new Map<AIRecoveryBriefSection["category"], AIRecoveryBriefSection>();
  for (const section of sections) {
    if (!byCategory.has(section.category)) {
      byCategory.set(section.category, section);
    }
  }

  return getFixedBriefCategories(snapshot, data).map((category) => {
    const source = byCategory.get(category);
    const fallbackTips = buildSectionTips(snapshot, category);
    return {
      category,
      severity: resolveSectionSeverity(source?.severity, buildSectionSeverity(snapshot, category)),
      title: trimText(source?.title, 40) || getBriefCategoryTitle(category),
      description: trimText(source?.description, 240) || buildSectionDescription(snapshot, data, category),
      tips: [
        trimText(source?.tips?.[0], 160) || fallbackTips[0],
        trimText(source?.tips?.[1], 160) || fallbackTips[1],
      ] as [string, string],
    };
  });
}

function buildFallbackCompoundAlert(snapshot: RecoverySnapshot, data: ReturnType<typeof buildStartRecoveryPromptData>) {
  const factors: string[] = [];
  if ((data.today.sleepHours ?? 0) < 6.5) factors.push("수면 압박");
  if (data.today.sleepDebtHours >= 2.5) factors.push("수면부채");
  if (data.weekly.avgVitalPrev7 - data.weekly.avgVital7 >= 5) factors.push("주간 배터리 하락");
  if ((data.today.symptomSeverity ?? 0) >= 2) factors.push("증상 강도");
  if (snapshot.nightStreak >= 2) factors.push("야간 연속 근무");
  if (factors.length < 2) return null;
  return {
    factors: factors.slice(0, 3),
    message:
      factors.includes("증상 강도") || factors.includes("야간 연속 근무")
        ? "오늘 시작은 속도를 올리기보다 자극과 소모를 먼저 낮추는 쪽이 안전합니다."
        : "오늘은 회복 버퍼를 먼저 만들어 두는 편이 하루 전체 페이스를 지키기 쉽습니다.",
  };
}

function buildFallbackSections(snapshot: RecoverySnapshot, data: ReturnType<typeof buildStartRecoveryPromptData>): AIRecoveryBriefSection[] {
  return buildNormalizedBriefSections(snapshot, [], data);
}

function buildFallbackBrief(snapshot: RecoverySnapshot): AIRecoveryBrief {
  const data = buildStartRecoveryPromptData(snapshot);
  const focusLine = snapshot.plannerContext.primaryAction ?? "오늘은 아침 자극을 낮추는 쪽으로 시작하세요.";
  return {
    headline:
      snapshot.slot === "wake"
        ? `${focusLine}`
        : "저녁에는 자극을 줄이고 회복 모드로 천천히 전환하세요.",
    compoundAlert: buildFallbackCompoundAlert(snapshot, data),
    sections: buildFallbackSections(snapshot, data),
    weeklySummary: {
      avgBattery: data.weekly.avgVital7,
      prevAvgBattery: data.weekly.avgVitalPrev7,
      topDrains: snapshot.topFactorRows.slice(0, 3).map((item) => ({ label: item.label, pct: round1(item.pct) })),
      personalInsight:
        snapshot.plannerContext.focusFactor?.label != null
          ? `최근 흐름에서는 ${snapshot.plannerContext.focusFactor.label} 쪽 소모가 반복될수록 배터리가 빨리 내려가, 시작 10분을 조용하게 쓰는 날이 더 안정적입니다.`
          : "최근 흐름에서는 아침 첫 10분을 조용하게 쓰는 날이 배터리 낭비를 덜 만들었습니다.",
      nextWeekPreview: snapshot.plannerContext.nextDutyDate
        ? `${formatRelativeDutyKorean(snapshot.plannerContext.nextDutyDate, snapshot.dateISO)} ${shiftLabel(snapshot.plannerContext.nextDuty)} 대비로 오늘 시작 루틴을 가볍게 고정해 두면 다음 리듬 전환이 덜 거칠어집니다.`
        : "다음 근무가 가까워질수록 오늘처럼 시작 루틴을 짧게 고정하는 편이 배터리 하락을 막기 쉽습니다.",
    },
  };
}

function buildFallbackOrders(snapshot: RecoverySnapshot): AIRecoveryOrdersPayload {
  const data = buildStartRecoveryPromptData(snapshot);
  const focusCategory = normalizeBriefCategory(snapshot.plannerContext.focusFactor?.key);
  const workday = snapshot.todayShift !== "OFF" && snapshot.todayShift !== "VAC";
  const items: AIRecoveryOrder[] = [
    focusCategory === "menstrual"
      ? {
          id: buildOrderId(snapshot.slot, "warm_start", 0),
          title: "따뜻한 시작 루틴",
          body: "지금 물이나 미지근한 차를 먼저 마시고, 씻은 뒤 2분만 허리와 골반 주변을 천천히 풀어 주세요.",
          when: "지금",
          reason: `오늘은 ${data.today.menstrualLabel ?? "주기 흐름"} 구간이고 증상 강도도 ${data.today.symptomSeverity ?? 0}으로 기록돼 있어, 따뜻함과 수분으로 자극을 낮추는 시작이 회복 버퍼를 만들기 좋습니다.`,
          chips: ["온기", "수분"],
        }
      : {
          id: buildOrderId(snapshot.slot, "light_wake_up", 0),
          title: "빛으로 몸 깨우기",
          body: "지금 물 한 컵을 마신 뒤 창가나 밝은 복도에서 3분만 서서 몸을 천천히 깨우세요.",
          when: "지금",
          reason: `오늘 수면은 ${data.today.sleepHours ?? 0}시간이지만 수면부채가 ${data.today.sleepDebtHours}시간 남아 있어, 강한 자극보다 부드러운 각성 전환이 집중력을 지키기 쉽습니다.`,
          chips: ["빛", "수분"],
        },
    {
      id: buildOrderId(snapshot.slot, "short_mobility", 1),
      title: "2분 순환 깨우기",
      body: "양치나 세수 뒤 제자리에서 2분만 걷거나 발목을 번갈아 들어 몸의 순환을 먼저 올리세요.",
      when: workday ? "지금" : "오전 중",
      reason: `최근 7일에 움직임이 낮은 날이 ${data.weekly.recentVitals7.filter((item) => typeof item.activity === "number" && item.activity <= 1).length}번 있었고 주간 배터리도 ${data.weekly.avgVital7}로 내려와 있어, 짧은 움직임이 회복 스위치를 켜는 데 유리합니다.`,
      chips: ["움직임"],
    },
    {
      id: buildOrderId(snapshot.slot, "one_priority", 2),
      title: workday ? "출근 전 한 가지 기준" : "오전 한 가지 기준",
      body: workday
        ? "출근 준비를 시작할 때 일정 앱이나 메모를 1분만 보고, 오늘 꼭 필요한 일 한 가지만 정한 뒤 집을 나서세요."
        : "오전 일정을 시작하기 전에 메모를 1분만 보고, 오늘 꼭 끝낼 일 한 가지만 남겨 두세요.",
      when: workday ? "출근 전" : "오후 전",
      reason: `다음 근무가 ${snapshot.plannerContext.nextDuty ? shiftLabel(snapshot.plannerContext.nextDuty) : "예정된 일정"}이고 최근 배터리 흐름도 지난주보다 낮아, 시작 단계에서 해야 할 일을 줄여 두는 편이 과소모를 막기 쉽습니다.`,
      chips: ["우선순위", "안전"],
    },
    {
      id: buildOrderId(snapshot.slot, "micro_reset", 3),
      title: workday ? "근무 중 60초 리셋" : "오전 60초 리셋",
      body: workday
        ? "근무 중 첫 숨 고를 틈이 오면 벽이나 의자 옆에 서서 60초만 숨을 길게 내쉬고 어깨를 세 번 천천히 내리세요."
        : "오전 중 한 번은 의자에서 일어나 60초만 숨을 길게 내쉬고 어깨를 세 번 천천히 내리세요.",
      when: workday ? "근무 중" : "저녁 전",
      reason: `최근 기록에서 스트레스 높은 날이 ${data.history.recurringSignals.find((item) => item.label === "stress_high")?.count ?? 0}번 있었고 기분 저하도 반복돼, 짧은 감압 신호를 중간에 넣는 편이 소진을 늦춥니다.`,
      chips: ["리셋"],
    },
  ];
  return {
    title: "오늘의 오더",
    headline: snapshot.plannerContext.primaryAction ?? "자극을 낮추는 가벼운 시작부터 잡아주세요.",
    summary: "오늘 수면, 주간 배터리 흐름, 반복 소모 패턴을 함께 보면 아침에 마찰이 낮은 네 가지 행동부터 고르는 편이 맞습니다.",
    items: items.slice(0, AI_RECOVERY_ORDER_COUNT),
  };
}

function buildFallbackFlow(snapshot: RecoverySnapshot, model: string): OpenAIFlowResult {
  return {
    status: "ready",
    brief: buildFallbackBrief(snapshot),
    orders: buildFallbackOrders(snapshot),
    reasoningEffort: "low",
    model,
    openaiMeta: {
      briefResponseId: null,
      ordersResponseId: null,
      usage: {
        brief: null,
        orders: null,
        total: null,
      },
      fallbackReason: "wake_only_prompt_contract",
      gatewayProfile: "med_safety_shared",
    },
  };
}

function resolveGenerationLimit(tier: PlanTier | null | undefined): AIRecoveryGenerationCounts {
  if (tier === "pro") return { brief: 2, orders: 2 };
  if (tier === "plus") return { brief: 1, orders: 1 };
  return { brief: 0, orders: 0 };
}

function readGenerationCounts(session: AIRecoverySlotPayload | null | undefined): AIRecoveryGenerationCounts {
  if (!session) return { brief: 0, orders: 0 };
  if (session.promptVersion !== AI_RECOVERY_PROMPT_VERSION) return { brief: 0, orders: 0 };
  const raw = isRecord((session as { generationCounts?: unknown }).generationCounts)
    ? ((session as { generationCounts?: Record<string, unknown> }).generationCounts ?? {})
    : null;
  if (!raw) {
    return {
      brief: session.status === "ready" || Boolean(session.openaiMeta?.briefResponseId) ? 1 : 0,
      orders: session.status === "ready" || Boolean(session.openaiMeta?.ordersResponseId) ? 1 : 0,
    };
  }
  let brief = Math.max(0, Math.round(Number(raw.brief) || 0));
  let orders = Math.max(0, Math.round(Number(raw.orders) || 0));

  if (session.status !== "ready") {
    if (!session.openaiMeta?.briefResponseId) brief = 0;
    if (!session.openaiMeta?.ordersResponseId) orders = 0;
  }

  if (brief === 0 && orders === 0) {
    return session.status === "ready" ? { brief: 1, orders: 1 } : { brief: 0, orders: 0 };
  }
  return { brief, orders };
}

function buildGenerationQuota(tier: PlanTier | null | undefined, session: AIRecoverySlotPayload | null | undefined): AIRecoveryGenerationQuota {
  const used = readGenerationCounts(session);
  const limit = resolveGenerationLimit(tier);
  return {
    used,
    limit,
    canGenerateSession: used.brief < limit.brief && used.orders < limit.orders,
    canRegenerateOrders: used.orders < limit.orders,
  };
}

function resolveReasoningEffort(model: string, kind: "brief" | "orders"): AIRecoveryEffort {
  if (kind === "brief") return model === "gpt-5.4" ? "medium" : "low";
  return "low";
}

function publicErrorMessage(code: string | null) {
  if (!code) return null;
  if (code === "plan_upgrade_required") return "Plus 또는 Pro에서 사용할 수 있어요.";
  if (code === "service_consent_required") return "서비스 동의 후 사용할 수 있어요.";
  if (code === "needs_more_records") return "건강 기록이 3일 이상 필요해요.";
  if (code === "wake_sleep_required") return "오늘 수면을 먼저 기록해 주세요.";
  if (code === "slot_not_available") return "아직 이 시간대가 아니에요.";
  return "지금은 만들 수 없어요.";
}

function parseLooseJson(text: string) {
  const normalized = String(text ?? "").trim();
  const codeFence = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() ?? normalized;
  const candidates = [
    codeFence,
    (() => {
      const start = codeFence.indexOf("{");
      const end = codeFence.lastIndexOf("}");
      return start >= 0 && end > start ? codeFence.slice(start, end + 1) : "";
    })(),
    (() => {
      const start = codeFence.indexOf("[");
      const end = codeFence.lastIndexOf("]");
      return start >= 0 && end > start ? codeFence.slice(start, end + 1) : "";
    })(),
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    try {
      return JSON.parse(trimmed);
    } catch {
      // Try next candidate shape.
    }
  }
  throw new Error("json_parse_failed");
}

function parseBriefJson(text: string, snapshot: RecoverySnapshot): AIRecoveryBrief {
  const parsed = parseLooseJson(text);
  if (!isRecord(parsed)) throw new Error("brief_not_object");
  const sectionsSource = Array.isArray(parsed.sections) ? parsed.sections : [];
  if (sectionsSource.length < 2 || sectionsSource.length > 6) throw new Error("brief_sections_invalid");
  const fallbackCategory = normalizeBriefCategory(snapshot.plannerContext.focusFactor?.key);
  const sections = sectionsSource.map((source, index) => {
    if (!isRecord(source)) throw new Error(`brief_section_invalid_${index + 1}`);
    const title = trimText(source.title, 40);
    const description = trimText(source.description, 240);
    const tips = asStringArray(source.tips, 2, 160);
    if (!title || !description || tips.length !== 2) throw new Error(`brief_section_invalid_${index + 1}`);
    const firstFallback = index === 0 ? fallbackCategory : index === 1 ? "sleep" : "shift";
    return {
      category: resolveSectionCategory(source.category, firstFallback),
      severity: resolveSectionSeverity(source.severity, "info"),
      title,
      description,
      tips: [tips[0]!, tips[1]!] as [string, string],
    };
  });
  const normalizedSections = buildNormalizedBriefSections(snapshot, sections);
  const headline = trimText(parsed.headline, 120);
  if (!headline) throw new Error("brief_headline_missing");
  const compoundAlert = (() => {
    if (parsed.compoundAlert == null) return null;
    if (!isRecord(parsed.compoundAlert)) throw new Error("brief_compound_alert_invalid");
    const factors = asStringArray(parsed.compoundAlert.factors, 3, 60);
    const message = trimText(parsed.compoundAlert.message, 200);
    if (factors.length < 2 || !message) throw new Error("brief_compound_alert_invalid");
    return { factors, message };
  })();
  const weeklySummarySource = isRecord(parsed.weeklySummary) ? parsed.weeklySummary : null;
  if (!weeklySummarySource) throw new Error("brief_weekly_summary_missing");
  const personalInsight = trimText(weeklySummarySource.personalInsight, 220);
  const nextWeekPreview = trimText(weeklySummarySource.nextWeekPreview, 220);
  if (!personalInsight || !nextWeekPreview) throw new Error("brief_weekly_summary_text_missing");
  const avgBattery = Number(weeklySummarySource.avgBattery);
  const prevAvgBattery = Number(weeklySummarySource.prevAvgBattery);
  if (!Number.isFinite(avgBattery) || !Number.isFinite(prevAvgBattery)) throw new Error("brief_weekly_summary_numbers_invalid");
  const topDrains = Array.isArray(weeklySummarySource.topDrains)
    ? weeklySummarySource.topDrains
        .map((item) => {
          if (!isRecord(item)) return null;
          const label = trimText(item.label, 40);
          const pct = Number(item.pct);
          if (!label || !Number.isFinite(pct)) return null;
          return { label, pct };
        })
        .filter((item): item is { label: string; pct: number } => Boolean(item))
        .slice(0, 3)
    : [];
  return {
    headline,
    compoundAlert,
    sections: normalizedSections,
    weeklySummary: {
      avgBattery: round1(avgBattery),
      prevAvgBattery: round1(prevAvgBattery),
      topDrains,
      personalInsight,
      nextWeekPreview,
    },
  };
}

function parseOrderRecord(raw: unknown, slot: AIRecoverySlot, index: number): AIRecoveryOrder | null {
  if (!isRecord(raw)) return null;
  const title = trimText(raw.title, 80);
  const body = trimText(raw.body, 220);
  const when = trimText(raw.when, 24);
  const reason = trimText(raw.reason, 220);
  if (!title || !body || !when || !reason) return null;
  return {
    id: buildOrderId(slot, trimText(raw.id, 48) || title, index),
    title,
    body,
    when,
    reason,
    chips: asStringArray(raw.chips, 3, 24),
  };
}

function isOrder(value: AIRecoveryOrder | null): value is AIRecoveryOrder {
  return Boolean(value);
}

function parseOrdersJson(text: string, slot: AIRecoverySlot): AIRecoveryOrdersPayload {
  const parsed = parseLooseJson(text);
  if (!isRecord(parsed)) throw new Error("orders_not_object");
  const title = trimText(parsed.title, 80);
  const headline = trimText(parsed.headline, 180);
  const summary = trimText(parsed.summary, 220);
  if (!title || !headline || !summary) throw new Error("orders_meta_missing");
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems
    .map((item: unknown, index: number) => parseOrderRecord(item, slot, index))
    .filter(isOrder);
  if (items.length !== AI_RECOVERY_ORDER_COUNT) throw new Error("orders_count_mismatch");
  return {
    title,
    headline,
    summary,
    items,
  };
}

function buildBriefSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" },
      compoundAlert: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              factors: {
                type: "array",
                items: { type: "string" },
              },
              message: { type: "string" },
            },
            required: ["factors", "message"],
          },
        ],
      },
      sections: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: { type: "string", enum: ["sleep", "shift", "caffeine", "menstrual", "stress", "activity"] },
            severity: { type: "string", enum: ["info", "caution", "warning"] },
            title: { type: "string" },
            description: { type: "string" },
            tips: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              items: { type: "string" },
            },
          },
          required: ["category", "severity", "title", "description", "tips"],
        },
      },
      weeklySummary: {
        type: "object",
        additionalProperties: false,
        properties: {
          avgBattery: { type: "number" },
          prevAvgBattery: { type: "number" },
          topDrains: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                pct: { type: "number" },
              },
              required: ["label", "pct"],
            },
          },
          personalInsight: { type: "string" },
          nextWeekPreview: { type: "string" },
        },
        required: ["avgBattery", "prevAvgBattery", "topDrains", "personalInsight", "nextWeekPreview"],
      },
    },
    required: ["headline", "compoundAlert", "sections", "weeklySummary"],
  };
}

function buildOrdersSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      headline: { type: "string" },
      summary: { type: "string" },
      items: {
        type: "array",
        minItems: AI_RECOVERY_ORDER_COUNT,
        maxItems: AI_RECOVERY_ORDER_COUNT,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
            when: { type: "string" },
            reason: { type: "string" },
            chips: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["id", "title", "body", "when", "reason"],
        },
      },
    },
    required: ["title", "headline", "summary", "items"],
  };
}

function buildBriefDeveloperPrompt(_slot: AIRecoverySlot) {
  return `너는 교대근무 간호사를 위한 프리미엄 AI 시작 회복 해설 엔진이야. 전날 기록과 오늘 수면만 기준으로 오늘 하루를 어떻게 시작해야 하는지 정교하게 설명한다. 같은 날 스트레스·카페인·활동·기분·근무메모는 시작 회복 입력에서 제외된 항목이므로, 오늘 상태를 추정하거나 단정하지 말고 그 미입력 사실을 설명의 중심으로 끌어오지도 마라. 출력은 반드시 JSON 하나만 반환한다. 전문적이고 신뢰 가능한 회복 코칭 톤을 유지하되, 문장은 짧고 정확하며 바로 실행 장면이 떠오르게 써라. generic한 문장, 반복 문장, 빈약한 요약, '꾸준한 관리가 중요합니다'처럼 힘 빠진 마무리, 같은 내용의 재진술을 금지한다. 각 section은 정말 중요한 카테고리만 고르고, description은 왜 지금 중요한지 한 문장, tips는 서로 겹치지 않는 실행 행동 2개만 작성한다. plannerContext가 이미 정한 우선순위와 충돌하는 새 계획을 만들지 말고, 내부 시스템 용어(planner, plannerContext, recoveryThread, focusFactor, primaryAction 등)와 데이터 필드명(napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity 등)은 절대 사용자 문구에 노출하지 마라. ISO 날짜(2026-03-13 등)를 괄호 안에 넣거나 본문에 직접 쓰지 말고, '오늘', '내일', '모레', '다음 근무일' 같은 자연어로만 표현하라.`;
}

function buildBriefUserPrompt(snapshot: RecoverySnapshot) {
  return [
    "사용자의 기록과 계산된 회복 지표를 바탕으로 AI 맞춤회복 JSON을 작성하세요.",
    "반드시 JSON 하나만 출력하세요. 코드펜스, 설명문, 마크다운 금지.",
    "",
    "plannerContext가 있으면 그 우선순위와 반드시 정렬하세요.",
    "plannerContext.focusFactor 또는 plannerContext.primaryAction과 충돌하는 새 계획을 만들지 마세요.",
    "지금은 오늘 시작 회복 단계입니다. 오늘 수면을 제외한 같은 날 동적 입력은 분석 입력에서 제외됐으므로, 오늘 상태를 추정하지도 말고 그 미입력 사실 자체를 설명의 중심으로 끌어오지도 마세요.",
    "[핵심 목표]",
    "",
    "headline은 오늘 시작에서 가장 중요한 축을 1~2문장으로 정리",
    "headline에는 가능하면 focusFactor 또는 primaryAction의 맥락을 자연스럽게 녹일 것",
    "sections는 고정 카테고리 순서대로 작성",
    "필수 카테고리 순서: sleep, shift, caffeine, stress, activity",
    "menstrualCategoryVisible가 true면 menstrual을 caffeine 다음에 포함, false면 menstrual 제외",
    "같은 카테고리 중복 금지",
    "각 section.description은 왜 이 카테고리가 지금 중요한지 실제 데이터 2가지 이상에 기대어 1문장으로 설명",
    "각 section.tips는 정확히 2개, 서로 겹치지 않는 실행 행동으로 작성",
    "tips는 추상 조언이 아니라 시작 타이밍/장소/시간/방법 중 최소 2개가 보이게 작성",
    "description과 tips는 같은 문장을 반복하지 말 것",
    "[품질 기준]",
    "",
    "'꾸준한 관리가 중요합니다', '신경 쓰세요', '활용해보세요' 같은 generic 마무리 금지",
    "같은 의미를 문장만 바꿔 반복 금지",
    "카테고리 title은 맥락이 보이는 짧은 제목으로 작성",
    "수치(수면, 카페인, 활동, 기분, 스트레스)는 Data JSON에 있는 값만 사용하고 임의 수치 금지",
    "숫자 태그형 표현 금지. 예: 스트레스(2), 기분4 금지",
    "데이터 필드명을 괄호에 넣어 노출 금지. 예: 낮잠이 있었던 날이라(napHours), 기분과 스트레스가(mood, stress), 다음 근무가 D(next), 오늘은 OFF이며(today) → 이런 괄호 주석 절대 금지",
    "ISO 날짜(2026-03-13 등)를 본문/괄호에 직접 쓰지 말고 '오늘', '내일', '다음 근무일' 같은 자연어만 사용",
    "카페인 수치는 필요할 때만 자연어로 한 번만 설명",
    "시작 회복 단계에서는 같은 날 스트레스/카페인/활동/기분을 오늘 상태처럼 말하지 말 것",
    "[JSON 규칙]",
    "",
    "compoundAlert는 위험 요소 2개 이상이 동시에 뚜렷할 때만 작성, 아니면 null",
    "sections.category 값은 sleep, shift, caffeine, menstrual, stress, activity 중에서만 선택",
    "sections는 위 고정 순서대로 배열",
    "weeklySummary.personalInsight와 weeklySummary.nextWeekPreview는 서로 다른 내용으로 작성",
    "weeklySummary.topDrains는 0~3개",
    "[JSON shape]",
    "{",
    "\"headline\": \"string\",",
    "\"compoundAlert\": {",
    "\"factors\": [",
    "\"string\"",
    "],",
    "\"message\": \"string\"",
    "},",
    "\"sections\": [",
    "{",
    "\"category\": \"sleep|shift|caffeine|menstrual|stress|activity\",",
    "\"severity\": \"info|caution|warning\",",
    "\"title\": \"string\",",
    "\"description\": \"string\",",
    "\"tips\": [",
    "\"string\",",
    "\"string\"",
    "]",
    "}",
    "],",
    "\"weeklySummary\": {",
    "\"avgBattery\": \"number\",",
    "\"prevAvgBattery\": \"number\",",
    "\"topDrains\": [",
    "{",
    "\"label\": \"string\",",
    "\"pct\": \"number\"",
    "}",
    "],",
    "\"personalInsight\": \"string\",",
    "\"nextWeekPreview\": \"string\"",
    "}",
    "}",
    "",
    "[데이터(JSON)]",
    JSON.stringify(buildStartRecoveryPromptData(snapshot), null, 2),
  ].join("\n");
}

function buildOrdersDeveloperPrompt(_slot: AIRecoverySlot) {
  return `너는 RNest의 AI 오늘의 오더 생성 엔진이야. AI 맞춤회복 결과를 최상위 기준으로 삼고, 전체 건강기록 히스토리와 오늘 상태를 함께 읽어 회복 행동 체크리스트를 만든다. 지금은 오늘 시작 오더 단계다. 아침에 바로 실행할 수 있는 낮은 마찰의 스타터 오더를 우선 만든다. 시작 단계에서는 오늘 수면 외의 같은 날 스트레스·카페인·활동·기분·근무메모를 분석 근거나 오더 설명 중심으로 끌어오지 말고, 그 미입력 사실을 오더 문구에 굳이 적지 않는다. 오더는 추상적인 조언이 아니라 실제로 체크 가능한 행동이어야 한다. 가능하면 정확히 4개의 오더를 반환하고, 데이터가 정말 부족할 때만 더 적게 작성한다. 중요하지 않은 항목은 과감히 제외하되, 선택한 개수 안에서 우선순위가 분명해야 한다. 응답은 JSON 하나만 반환하고, title/headline/summary/items를 모두 채워야 한다. headline은 오늘 오더 흐름의 핵심을 한 문장으로, summary는 왜 이 오더 구성이 맞는지 한 문장으로 적는다. 각 오더는 title, body, when, reason을 가져야 하고, id는 영어 snake_case로 안정적으로 작성한다. when은 긴 문장이 아니라 '지금', '근무 중', '퇴근 직후', '잠들기 전'처럼 아주 짧은 타이밍 라벨만 쓴다. chips는 선택 사항이며 0~3개, 한두 단어 수준의 짧은 태그만 쓴다. 오더는 지금 컨디션에서도 실행할 수 있을 정도로 낮은 마찰이어야 하고, 한 번에 하나씩 끝낼 수 있어야 한다. body는 실제 실행 문장으로 쓰고, 가능하면 시간/횟수/조건을 포함해 바로 행동할 수 있게 만든다. body에는 시작 트리거를 넣어 사용자가 언제 시작할지 바로 알 수 있게 한다. 예: 출근 전, 다음 투약 전, 퇴근 직후, 잠들기 전. 제네릭한 '쉬기/눕기/눈감기' 표현만으로 끝내지 말고, 언제/어디서/무엇을/얼마나 중 최소 2개를 드러내 실행 장면이 그려지게 만든다. reason은 사용자의 개인 상태(수면, 교대, 기분, 스트레스, 활동, 카페인, 생리주기, 최근 반복 패턴)와 연결해 왜 이 행동이 회복에 유리한지 설명한다. 시작 오더는 '지금', '출근 전', '근무 중' 타이밍 중심으로 구성하고, 하루 시작에 과한 행동을 요구하지 않는다. 오늘 데이터가 극심한 피로나 수면부채를 분명히 가리키는 경우가 아니면 막연한 휴식 오더를 남발하지 않는다. 오더가 3개 이상이면 실수 방지/집중 리셋, 짧은 신체 회복, 정서 안정 또는 수면 전환 중 최소 2개 이상 영역이 섞이게 만든다. title은 행동만 적지 말고 맥락이 보이게 만든다. 예: '근무 중 3분 걷기 리셋', '퇴근 후 10분 감각 낮추기'. 서로 거의 같은 행동을 다른 말로 반복하지 말고, 같은 타이밍 오더가 과하게 몰리지 않게 조정한다. generic한 문장('휴식하기', '컨디션 관리하기', '꾸준히 해보기')만으로는 절대 끝내지 말고, 왜 지금 필요한지와 실행 장면이 보여야 한다. reason은 description 재진술처럼 짧게 얼버무리지 말고, 개인 기록 패턴 2가지 이상과 연결되면 더 좋다. 타임라인은 별도 섹션으로 만들지 말고 when/reason 안에 녹여라. 내부 시스템 용어(planner, plannerContext, recoveryThread, focusFactor 등)와 데이터 필드명(napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity 등)을 title, body, reason, headline, summary 어디에도 괄호나 본문에 노출하지 마라. ISO 날짜(2026-03-13 등)를 괄호나 본문에 직접 쓰지 말고, '오늘', '내일', '다음 근무일' 같은 자연어로만 표현하라. 출력은 JSON 하나만 반환한다.`;
}

function buildOrdersUserPrompt(snapshot: RecoverySnapshot, brief: AIRecoveryBrief) {
  return [
    "오늘의 오더 체크리스트용 JSON을 작성하세요.",
    "반드시 JSON 하나만 출력하세요. 코드펜스 금지, 설명문 금지.",
    "",
    "[목표]",
    "",
    "AI 맞춤회복을 실제 행동 체크리스트로 바꾸기",
    "오늘 가장 중요한 오더를 4개로 맞춰 고르기",
    "타이밍 정보는 when과 reason에 자연스럽게 녹이기",
    "사용자가 지금 컨디션에서도 바로 실천할 수 있게 마찰을 낮추기",
    "하루를 시작할 때 바로 실행할 수 있는 스타터 오더가 되게 만들기",
    "[제약]",
    "",
    "items 길이는 정확히 4",
    "id는 영어 snake_case",
    "title, headline, summary는 모두 비워 두지 말 것",
    "title은 행동 중심의 짧은 문장",
    "headline은 오늘 오더 흐름의 핵심을 한 문장으로 정리",
    "summary는 왜 이 오더 구성이 맞는지 한 문장으로 정리",
    "body는 체크리스트 한 줄처럼 짧고 분명하게, 가능하면 시간/횟수/조건을 포함",
    "body 안에 시작 트리거를 넣어 언제 시작하는지 바로 보이게 할 것",
    "when은 12자 안팎의 아주 짧은 타이밍 라벨만 사용",
    "reason은 왜 지금 필요한지, 사용자의 현재 패턴과 연결해 한 문장으로 설명",
    "chips는 0~3개, 짧은 키워드만 사용",
    "today / weekly / history / plannerContext / AI Recovery Brief JSON을 모두 보고 판단",
    "시작 단계에서는 오늘 수면 외 같은 날 동적 입력을 reason의 근거로 끌어오지 말 것",
    "전체 건강기록을 봤을 때 반복적으로 회복을 방해하는 패턴이 있으면 우선순위에 반영",
    "작은 행동이지만 회복 효과가 크고 실수/소진을 줄이는 방향을 우선",
    "막연한 '쉬기/눕기/눈감기' 표현만 쓰지 말고, 왜 지금 그 행동을 해야 하는지 실행 장면이 보이게 작성",
    "'컨디션 관리하기', '회복하기', '휴식하기'처럼 generic한 제목/문장 금지",
    "items가 3개 이상이면 집중·안전, 짧은 움직임, 정서 안정/수면 전환 중 최소 2개 이상 영역이 섞이게 구성",
    "시작 단계에서는 when이 '지금', '출근 전', '근무 중' 쪽으로 자연스럽게 분산되게 구성",
    "같은 행동을 표현만 바꿔 중복 생성하지 말 것",
    "Data JSON에 없는 수치를 새로 만들지 말 것 [선택된 오더 개수] 4",
    "",
    "+ 앞에서 생성된 ai맞춤회복 해설",
    "",
    "[데이터(JSON)]",
    JSON.stringify(buildStartRecoveryPromptData(snapshot), null, 2),
    "",
    "[AI Recovery Brief JSON]",
    JSON.stringify(brief, null, 2),
  ].join("\n");
}

function buildJsonRepairDeveloperPrompt(schemaName: string, schema: Record<string, unknown>) {
  return [
    "너는 JSON 정리기다.",
    "사용자 입력의 의미를 바꾸지 마라.",
    "새 정보, 새 해석, 새 문장을 추가하지 마라.",
    "입력 텍스트에서 확인되는 내용만 사용해 정확한 JSON 하나만 출력하라.",
    "설명, 코드블록, 머리말, 마크다운, 주석을 붙이지 마라.",
    `대상 schema 이름: ${schemaName}`,
    JSON.stringify(schema),
  ].join("\n");
}

function buildJsonRepairUserPrompt(rawText: string) {
  return ["<rawOutput>", rawText, "</rawOutput>"].join("\n");
}

async function repairAIRecoveryJson(args: {
  model: string;
  schemaName: string;
  schema: Record<string, unknown>;
  rawText: string;
  signal: AbortSignal;
  maxOutputTokens: number;
}) {
  return await runAIRecoveryStructuredRequest({
    model: args.model,
    reasoningEffort: "low",
    developerPrompt: buildJsonRepairDeveloperPrompt(args.schemaName, args.schema),
    userPrompt: buildJsonRepairUserPrompt(args.rawText),
    schemaName: `${args.schemaName}_repair`,
    schema: args.schema,
    signal: args.signal,
    maxOutputTokens: args.maxOutputTokens,
  });
}

function deriveWorkConstraints(input: {
  slot: AIRecoverySlot;
  todayShift: Shift;
  plannerContext: PlannerContext;
}) {
  return {
    todayShift: input.todayShift,
    nextDuty: input.plannerContext.nextDuty,
    workday: input.todayShift !== "OFF" && input.todayShift !== "VAC",
    preferredMinutes: input.slot === "wake" ? "3-15" : "5-30",
    focus: input.slot === "wake" ? "출근 전 세팅" : "감압 + 수면 보호",
  };
}

function buildSnapshotSignaturePayload(snapshot: Omit<RecoverySnapshot, "inputSignature">) {
  return {
    dateISO: snapshot.dateISO,
    slot: snapshot.slot,
    language: snapshot.language,
    todayRow: snapshot.todayRow,
    historyRows: snapshot.historyRows,
    derivedMetrics: snapshot.derivedMetrics,
    cycleContext: snapshot.cycleContext,
    workConstraints: snapshot.workConstraints,
    plannerContext: {
      plannerTone: snapshot.plannerContext.plannerTone,
      focusFactor: snapshot.plannerContext.focusFactor,
      primaryAction: snapshot.plannerContext.primaryAction,
      avoidAction: snapshot.plannerContext.avoidAction,
      nextDuty: snapshot.plannerContext.nextDuty,
      nextDutyDate: snapshot.plannerContext.nextDutyDate,
    },
  };
}

function buildRecoverySnapshot(args: { payload: unknown; dateISO: ISODate; slot: AIRecoverySlot }): RecoverySnapshot {
  const rawState = sanitizeStatePayload(args.payload);
  const phase = slotToRecoveryPhase(args.slot);
  const state = buildRecoveryPhaseState(rawState, args.dateISO, phase);
  const language = normalizeAIRecoveryLanguage(state.settings?.language);
  const recordedDays = countHealthRecordedDays({ bio: state.bio, emotions: state.emotions });
  const historyDates = listHistoryDates(args.dateISO, 14);
  const historyStart = historyDates[0] ?? args.dateISO;
  const historyEnd = historyDates[historyDates.length - 1] ?? args.dateISO;
  const vitals = computeVitalsRange({ state, start: historyStart, end: historyEnd });
  const vitalMap = new Map(vitals.map((item) => [item.dateISO, item]));

  const recordedDateSet = new Set<ISODate>();
  for (const iso of historyDates) {
    if (hasHealthInput(state.bio?.[iso] ?? null, state.emotions?.[iso] ?? null)) recordedDateSet.add(iso);
  }
  const vitalsRecorded = vitals.filter((vital) => {
    if (recordedDateSet.has(vital.dateISO)) return true;
    const gap = vital.engine?.daysSinceAnyInput ?? 99;
    const reliability = vital.engine?.inputReliability ?? 0;
    return gap <= 2 && reliability >= 0.45;
  });
  const todayVitalCandidate = vitalMap.get(args.dateISO) ?? null;
  const todayHasInput = (() => {
    if (recordedDateSet.has(args.dateISO)) return true;
    if (!todayVitalCandidate) return false;
    const gap = todayVitalCandidate.engine?.daysSinceAnyInput ?? 99;
    const reliability = todayVitalCandidate.engine?.inputReliability ?? 0;
    return gap <= 2 && reliability >= 0.45;
  })();
  const todayVital = todayHasInput ? todayVitalCandidate : null;
  const todayShift = (state.schedule?.[args.dateISO] as Shift | undefined) ?? todayVital?.shift ?? "OFF";
  const accuracy = computePersonalizationAccuracy({ state, start: historyStart, end: historyEnd, vitals });
  const topFactorRows = topFactors(vitalsRecorded.length ? vitalsRecorded : todayVital ? [todayVital] : [], 3).map((item) => ({
    key: item.key as FactorKey,
    label: item.label,
    pct: item.pct,
  }));
  const todayDisplay = todayVital ? vitalDisplayScore(todayVital) : null;
  const plannerContext = buildPlannerContext({
    pivotISO: args.dateISO,
    schedule: state.schedule,
    todayVital,
    factorVitals: vitalsRecorded.length ? vitalsRecorded : todayVital ? [todayVital] : [],
    profile: normalizeProfileSettings(state.settings?.profile),
  });
  const todayRow = readDailyPersistedRow(state, args.dateISO);
  const historyRows = historyDates.map((iso) => readDailyPersistedRow(state, iso));
  const sleepDebtHours = todayVital?.engine?.sleepDebtHours ?? 0;
  const nightStreak = todayVital?.engine?.nightStreak ?? 0;
  const derivedMetrics = {
    body: todayVital ? Math.round(todayVital.body.value) : null,
    mental: todayVital ? Math.round(todayVital.mental.ema) : null,
    todayDisplay,
    status: statusFromScore(todayDisplay ?? 0),
    fastCharge: todayDisplay == null ? false : todayDisplay < 30,
    sleepDebtHours: Math.round(sleepDebtHours * 10) / 10,
    nightStreak,
    CSI: todayVital?.engine?.CSI ?? null,
    SRI: todayVital?.engine?.SRI ?? null,
    CIF: todayVital?.engine?.CIF ?? null,
    SLF: todayVital?.engine?.SLF ?? null,
    MIF: todayVital?.engine?.MIF ?? null,
    topFactors: topFactorRows,
    accuracy: { percent: accuracy.percent },
    plannerTone: plannerContext.plannerTone,
    nextDuty: plannerContext.nextDuty,
  };
  const cycleContext = {
    enabled: Boolean(state.settings?.menstrual?.enabled),
    lastPeriodStart: state.settings?.menstrual?.lastPeriodStart ?? null,
    cycleLength: state.settings?.menstrual?.cycleLength ?? null,
    periodLength: state.settings?.menstrual?.periodLength ?? null,
    lutealLength: state.settings?.menstrual?.lutealLength ?? null,
    pmsDays: state.settings?.menstrual?.pmsDays ?? null,
    sensitivity: state.settings?.menstrual?.sensitivity ?? null,
    todaySymptomSeverity: state.bio?.[args.dateISO]?.symptomSeverity ?? null,
    todayLabel: todayVital?.menstrual?.label ?? null,
  };
  const baseSnapshot = {
    state,
    dateISO: args.dateISO,
    slot: args.slot,
    language,
    historyStart,
    historyEnd,
    historyRows,
    todayRow,
    recordedDays,
    todayShift,
    todayVital,
    todayDisplay,
    status: statusFromScore(todayDisplay ?? 0),
    fastCharge: todayDisplay == null ? false : todayDisplay < 30,
    accuracyPercent: accuracy.percent,
    topFactorRows,
    plannerContext,
    sleepDebtHours,
    nightStreak,
    derivedMetrics,
    cycleContext,
    workConstraints: {} as Record<string, unknown>,
    contextMeta: {
      historyStart,
      historyEnd,
      todayShift,
      nextDuty: plannerContext.nextDuty,
      todaySleepHours: state.bio?.[args.dateISO]?.sleepHours ?? null,
      plannerTone: plannerContext.plannerTone,
      topFactorKeys: topFactorRows.map((item) => item.key),
      todayVitalScore: todayDisplay,
    },
  } satisfies Omit<RecoverySnapshot, "inputSignature">;
  const workConstraints = deriveWorkConstraints({
    slot: baseSnapshot.slot,
    todayShift: baseSnapshot.todayShift,
    plannerContext: baseSnapshot.plannerContext,
  });
  const inputSignature = buildSignature(buildSnapshotSignaturePayload({ ...baseSnapshot, workConstraints }));
  return {
    ...baseSnapshot,
    workConstraints,
    inputSignature,
  };
}

async function resolveGate(args: {
  userId: string;
  slot: AIRecoverySlot;
  dateISO: ISODate;
  payload: unknown;
}) {
  const snapshot = buildRecoverySnapshot({ payload: args.payload, dateISO: args.dateISO, slot: args.slot });
  const consentOk = await userHasCompletedServiceConsent(args.userId);
  if (!consentOk) {
    return {
      gate: {
        allowed: false,
        code: "service_consent_required",
        message: publicErrorMessage("service_consent_required"),
      } satisfies AIRecoveryGate,
      snapshot,
      subscription: null,
    };
  }

  const subscription = await readRecoverySubscriptionSnapshot(args.userId);
  const hasAIEntitlement = Boolean(
    subscription?.hasPaidAccess && subscription?.entitlements.recoveryPlannerAI && subscription?.aiRecoveryModel
  );
  if (!hasAIEntitlement) {
    return {
      gate: {
        allowed: false,
        code: "plan_upgrade_required",
        message: publicErrorMessage("plan_upgrade_required"),
      } satisfies AIRecoveryGate,
      snapshot,
      subscription,
    };
  }

  if (snapshot.recordedDays < INSIGHTS_MIN_DAYS) {
    return {
      gate: {
        allowed: false,
        code: "needs_more_records",
        message: publicErrorMessage("needs_more_records"),
      } satisfies AIRecoveryGate,
      snapshot,
      subscription,
    };
  }

  if (args.slot === "wake" && snapshot.contextMeta.todaySleepHours == null) {
    return {
      gate: {
        allowed: false,
        code: "wake_sleep_required",
        message: publicErrorMessage("wake_sleep_required"),
      } satisfies AIRecoveryGate,
      snapshot,
      subscription,
    };
  }

  return {
    gate: {
      allowed: true,
      code: null,
      message: null,
    } satisfies AIRecoveryGate,
    snapshot,
    subscription,
  };
}

async function runOpenAIFlow(args: {
  snapshot: RecoverySnapshot;
  model: string;
  signal: AbortSignal;
}) {
  if (args.snapshot.slot !== "wake") {
    return buildFallbackFlow(args.snapshot, args.model);
  }
  const briefReasoningEffort = resolveReasoningEffort(args.model, "brief");
  const ordersReasoningEffort = resolveReasoningEffort(args.model, "orders");

  const baseMeta = {
    briefResponseId: null,
    ordersResponseId: null,
    usage: {
      brief: null,
      orders: null,
      total: null,
    },
    fallbackReason: null,
    gatewayProfile: "med_safety_shared" as const,
  };

  const briefResult = await runAIRecoveryStructuredRequest({
    model: args.model,
    reasoningEffort: briefReasoningEffort,
    developerPrompt: buildBriefDeveloperPrompt(args.snapshot.slot),
    userPrompt: buildBriefUserPrompt(args.snapshot),
    schemaName: "ai_recovery_brief",
    schema: buildBriefSchema(),
    signal: args.signal,
    maxOutputTokens: 2600,
  });

  if (!briefResult.ok) {
    console.error("[AIRecovery] brief_request_failed", {
      model: args.model,
      slot: args.snapshot.slot,
      dateISO: args.snapshot.dateISO,
      error: briefResult.error,
    });
    throw new Error(`ai_recovery_openai_failed:${briefResult.error}`);
  }

  let brief: AIRecoveryBrief;
  try {
    brief = parseBriefJson(briefResult.text, args.snapshot);
  } catch (error) {
    console.error("[AIRecovery] brief_parse_failed", {
      model: args.model,
      slot: args.snapshot.slot,
      dateISO: args.snapshot.dateISO,
      responseId: briefResult.responseId,
      error: trimText((error as Error)?.message ?? error, 160),
    });
    const repairedBrief = await repairAIRecoveryJson({
      model: args.model,
      schemaName: "ai_recovery_brief",
      schema: buildBriefSchema(),
      rawText: briefResult.text,
      signal: args.signal,
      maxOutputTokens: 2600,
    });
    if (!repairedBrief.ok) {
      console.error("[AIRecovery] brief_repair_failed", {
        model: args.model,
        slot: args.snapshot.slot,
        dateISO: args.snapshot.dateISO,
        responseId: briefResult.responseId,
        error: repairedBrief.error,
      });
      throw new Error(`ai_recovery_openai_failed:${repairedBrief.error}`);
    }
    try {
      brief = parseBriefJson(repairedBrief.text, args.snapshot);
    } catch (repairParseError) {
      console.error("[AIRecovery] brief_repair_parse_failed", {
        model: args.model,
        slot: args.snapshot.slot,
        dateISO: args.snapshot.dateISO,
        responseId: repairedBrief.responseId,
        error: trimText((repairParseError as Error)?.message ?? repairParseError, 160),
      });
      throw new Error(`ai_recovery_openai_failed:brief_repair_parse_failed`);
    }
  }

  const ordersResult = await runAIRecoveryStructuredRequest({
    model: args.model,
    reasoningEffort: ordersReasoningEffort,
    developerPrompt: buildOrdersDeveloperPrompt(args.snapshot.slot),
    userPrompt: buildOrdersUserPrompt(args.snapshot, brief),
    schemaName: "ai_recovery_orders",
    schema: buildOrdersSchema(),
    signal: args.signal,
    maxOutputTokens: 2200,
  });

  if (!ordersResult.ok) {
    console.error("[AIRecovery] orders_request_failed", {
      model: args.model,
      slot: args.snapshot.slot,
      dateISO: args.snapshot.dateISO,
      briefResponseId: briefResult.responseId,
      error: ordersResult.error,
    });
    throw new Error(`ai_recovery_openai_failed:${ordersResult.error}`);
  }

  try {
    const orders = parseOrdersJson(ordersResult.text, args.snapshot.slot);
    return {
      status: "ready",
      brief,
      orders,
      reasoningEffort: briefReasoningEffort,
      model: args.model,
      openaiMeta: {
        ...baseMeta,
        briefResponseId: briefResult.responseId,
        ordersResponseId: ordersResult.responseId,
        usage: {
          brief: briefResult.usage,
          orders: ordersResult.usage,
          total: combineAIRecoveryUsages(briefResult.usage, ordersResult.usage),
        },
        fallbackReason: null,
      },
    } satisfies OpenAIFlowResult;
  } catch (error) {
    console.error("[AIRecovery] orders_parse_failed", {
      model: args.model,
      slot: args.snapshot.slot,
      dateISO: args.snapshot.dateISO,
      briefResponseId: briefResult.responseId,
      ordersResponseId: ordersResult.responseId,
      error: trimText((error as Error)?.message ?? error, 160),
    });
    const repairedOrders = await repairAIRecoveryJson({
      model: args.model,
      schemaName: "ai_recovery_orders",
      schema: buildOrdersSchema(),
      rawText: ordersResult.text,
      signal: args.signal,
      maxOutputTokens: 2200,
    });
    if (!repairedOrders.ok) {
      console.error("[AIRecovery] orders_repair_failed", {
        model: args.model,
        slot: args.snapshot.slot,
        dateISO: args.snapshot.dateISO,
        briefResponseId: briefResult.responseId,
        ordersResponseId: ordersResult.responseId,
        error: repairedOrders.error,
      });
      throw new Error(`ai_recovery_openai_failed:${repairedOrders.error}`);
    }
    try {
      const orders = parseOrdersJson(repairedOrders.text, args.snapshot.slot);
      return {
        status: "ready",
        brief,
        orders,
        reasoningEffort: briefReasoningEffort,
        model: args.model,
        openaiMeta: {
          ...baseMeta,
          briefResponseId: briefResult.responseId,
          ordersResponseId: repairedOrders.responseId,
          usage: {
            brief: briefResult.usage,
            orders: repairedOrders.usage,
            total: combineAIRecoveryUsages(briefResult.usage, repairedOrders.usage),
          },
          fallbackReason: null,
        },
      } satisfies OpenAIFlowResult;
    } catch (repairParseError) {
      console.error("[AIRecovery] orders_repair_parse_failed", {
        model: args.model,
        slot: args.snapshot.slot,
        dateISO: args.snapshot.dateISO,
        briefResponseId: briefResult.responseId,
        ordersResponseId: repairedOrders.responseId,
        error: trimText((repairParseError as Error)?.message ?? repairParseError, 160),
      });
      throw new Error("ai_recovery_openai_failed:orders_repair_parse_failed");
    }
  }
}

function buildStoredSession(args: {
  snapshot: RecoverySnapshot;
  flow: OpenAIFlowResult;
  previousSession?: AIRecoverySlotPayload | null;
}) {
  const now = new Date().toISOString();
  const previousCounts = readGenerationCounts(args.previousSession);
  const shouldCountGeneration =
    args.flow.status === "ready" && Boolean(args.flow.openaiMeta.briefResponseId || args.flow.openaiMeta.ordersResponseId);
  const normalizedBrief = {
    ...args.flow.brief,
    sections: buildNormalizedBriefSections(args.snapshot, Array.isArray(args.flow.brief.sections) ? args.flow.brief.sections : []),
  };
  return {
    status: args.flow.status,
    generatedAt: now,
    model: args.flow.model,
    reasoningEffort: args.flow.reasoningEffort,
    language: args.snapshot.language,
    promptVersion: AI_RECOVERY_PROMPT_VERSION,
    inputSignature: args.snapshot.inputSignature,
    context: args.snapshot.contextMeta,
    brief: normalizedBrief,
    selection: {
      selectedCandidateIds: [],
      updatedAt: now,
    },
    orders: args.flow.orders,
    generationCounts: {
      brief: shouldCountGeneration ? previousCounts.brief + 1 : previousCounts.brief,
      orders: shouldCountGeneration ? previousCounts.orders + 1 : previousCounts.orders,
    },
    openaiMeta: args.flow.openaiMeta,
  } satisfies AIRecoverySlotPayload;
}

function normalizeStoredSession(snapshot: RecoverySnapshot, session: AIRecoverySlotPayload): AIRecoverySlotPayload;
function normalizeStoredSession(snapshot: RecoverySnapshot, session: AIRecoverySlotPayload | null | undefined): AIRecoverySlotPayload | null;
function normalizeStoredSession(snapshot: RecoverySnapshot, session: AIRecoverySlotPayload | null | undefined) {
  if (!session?.brief) return session ?? null;
  return {
    ...session,
    brief: {
      ...session.brief,
      sections: buildNormalizedBriefSections(snapshot, Array.isArray(session.brief.sections) ? session.brief.sections : []),
    },
  } satisfies AIRecoverySlotPayload;
}

export async function readAIRecoverySessionView(args: {
  userId: string;
  dateISO?: string | null;
  slot?: string | null;
}) {
  const dateISO = isISODate(args.dateISO ?? "") ? (args.dateISO as ISODate) : todayISO();
  const slot = args.slot === "postShift" ? "postShift" : "wake";
  const { payload } = await safeLoadRecoveryDomains(args.userId);
  const { gate, snapshot, subscription } = await resolveGate({
    userId: args.userId,
    slot,
    dateISO,
    payload,
  });
  const { session, completions } = await safeReadRecoverySlot({ userId: args.userId, dateISO, slot });
  const visibleSession =
    gate.allowed && session?.status === "ready" && session.promptVersion === AI_RECOVERY_PROMPT_VERSION ? normalizeStoredSession(snapshot, session) : null;
  const orderIds = visibleSession?.orders?.items.map((item) => item.id) ?? [];
  const filteredCompletions = filterCompletionIdsForOrders(completions, orderIds);
  const quota = buildGenerationQuota(subscription?.tier ?? null, session);
  return {
    dateISO,
    slot,
    slotLabel: getAIRecoverySlotLabel(slot, snapshot.todayShift),
    slotDescription: getAIRecoverySlotDescription(slot, snapshot.todayShift),
    language: snapshot.language,
    gate,
    session: visibleSession,
    stale: Boolean(
      visibleSession &&
        (visibleSession.inputSignature !== snapshot.inputSignature ||
          visibleSession.language !== snapshot.language ||
          visibleSession.promptVersion !== AI_RECOVERY_PROMPT_VERSION)
    ),
    completions: filteredCompletions,
    quota,
    hasAIEntitlement: Boolean(subscription?.hasPaidAccess && subscription?.entitlements.recoveryPlannerAI),
    model: subscription?.aiRecoveryModel ?? (subscription?.tier ? getAIRecoveryModelForTier(subscription.tier) : null),
    tier: subscription?.tier ?? null,
  };
}

export async function generateAIRecoverySession(args: {
  userId: string;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  force?: boolean;
  payloadOverride?: unknown;
  signal: AbortSignal;
}) {
  let payload = args.payloadOverride ?? {};
  let existingSession: AIRecoverySlotPayload | null = null;
  let existingCompletions: string[] = [];
  let canPersistSession = false;

  if (args.payloadOverride == null) {
    const loaded = await safeLoadRecoveryDomains(args.userId);
    payload = loaded.payload;
    const existing = await safeReadRecoverySlot({ userId: args.userId, dateISO: args.dateISO, slot: args.slot });
    existingSession = existing.session;
    existingCompletions = existing.completions;
    canPersistSession = loaded.storageAvailable && existing.storageAvailable;
  } else {
    const existing = await safeReadRecoverySlot({ userId: args.userId, dateISO: args.dateISO, slot: args.slot });
    existingSession = existing.session;
    existingCompletions = existing.completions;
    canPersistSession = existing.storageAvailable;
  }

  const { gate, snapshot, subscription } = await resolveGate({
    userId: args.userId,
    slot: args.slot,
    dateISO: args.dateISO,
    payload,
  });
  if (!gate.allowed) {
    return {
      gate,
      session: null,
      completions: [] as string[],
      quota: buildGenerationQuota(subscription?.tier ?? null, null),
      slotLabel: getAIRecoverySlotLabel(args.slot, snapshot.todayShift),
      slotDescription: getAIRecoverySlotDescription(args.slot, snapshot.todayShift),
      stale: false,
      language: snapshot.language,
      model: subscription?.aiRecoveryModel ?? null,
      tier: subscription?.tier ?? null,
    };
  }

  const quota = buildGenerationQuota(subscription?.tier ?? null, existingSession);
  if (
    !args.force &&
    existingSession?.status === "ready" &&
    existingSession.inputSignature === snapshot.inputSignature &&
    existingSession.language === snapshot.language &&
    existingSession.promptVersion === AI_RECOVERY_PROMPT_VERSION
  ) {
    const normalizedSession = normalizeStoredSession(snapshot, existingSession);
    return {
      gate,
      session: normalizedSession,
      completions: filterCompletionIdsForOrders(existingCompletions, normalizedSession?.orders?.items.map((item) => item.id) ?? []),
      quota,
      slotLabel: getAIRecoverySlotLabel(args.slot, snapshot.todayShift),
      slotDescription: getAIRecoverySlotDescription(args.slot, snapshot.todayShift),
      stale: false,
      language: snapshot.language,
      model: subscription?.aiRecoveryModel ?? null,
      tier: subscription?.tier ?? null,
    };
  }

  const model = subscription?.aiRecoveryModel ?? (subscription?.tier ? getAIRecoveryModelForTier(subscription.tier) : null);
  if (!model) {
    return {
      gate: {
        allowed: false,
        code: "plan_upgrade_required",
        message: publicErrorMessage("plan_upgrade_required"),
      },
      session: null,
      completions: [] as string[],
      quota,
      slotLabel: getAIRecoverySlotLabel(args.slot, snapshot.todayShift),
      slotDescription: getAIRecoverySlotDescription(args.slot, snapshot.todayShift),
      stale: false,
      language: snapshot.language,
      model: null,
      tier: subscription?.tier ?? null,
    };
  }

  if (existingSession?.status === "ready" && !quota.canGenerateSession) {
    throw new Error("session_generation_limit_reached");
  }

  const flow = await runOpenAIFlow({
    snapshot,
    model,
    signal: args.signal,
  });
  const session = normalizeStoredSession(snapshot, buildStoredSession({ snapshot, flow, previousSession: existingSession }));
  const nextQuota = buildGenerationQuota(subscription?.tier ?? null, session);
  if (canPersistSession) {
    try {
      await writeAIRecoverySlot({
        userId: args.userId,
        dateISO: args.dateISO,
        slot: args.slot,
        session,
      });
    } catch (error) {
      console.error("[AIRecovery] storage_write_failed_returning_transient_session", {
        userId: args.userId.slice(0, 8),
        dateISO: args.dateISO,
        slot: args.slot,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    gate,
    session,
    completions: filterCompletionIdsForOrders(existingCompletions, session.orders?.items.map((item) => item.id) ?? []),
    quota: nextQuota,
    slotLabel: getAIRecoverySlotLabel(args.slot, snapshot.todayShift),
    slotDescription: getAIRecoverySlotDescription(args.slot, snapshot.todayShift),
    stale: false,
    language: snapshot.language,
    model,
    tier: subscription?.tier ?? null,
  };
}

export async function regenerateAIRecoveryOrders(args: {
  userId: string;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  signal: AbortSignal;
}) {
  const { payload } = await safeLoadRecoveryDomains(args.userId);
  const { gate, snapshot, subscription } = await resolveGate({
    userId: args.userId,
    slot: args.slot,
    dateISO: args.dateISO,
    payload,
  });
  if (!gate.allowed) {
    throw new Error(gate.code ?? "ai_recovery_gate_blocked");
  }

  const { session, completions } = await safeReadRecoverySlot({ userId: args.userId, dateISO: args.dateISO, slot: args.slot });
  if (!session?.brief) throw new Error("ai_recovery_session_missing");
  const quota = buildGenerationQuota(subscription?.tier ?? null, session);
  if (!quota.canRegenerateOrders) throw new Error("orders_generation_limit_reached");
  const brief = normalizeStoredSession(snapshot, session)?.brief ?? session.brief;
  if (args.slot !== "wake") {
    const orders = buildFallbackOrders(snapshot);
    const nextSession = normalizeStoredSession(snapshot, {
      ...session,
      status: "ready",
      selection: {
        selectedCandidateIds: [],
        updatedAt: new Date().toISOString(),
      },
      orders,
      generationCounts: {
        ...readGenerationCounts(session),
      },
      openaiMeta: {
        ...session.openaiMeta,
        fallbackReason: "wake_only_prompt_contract",
      },
    });
    await writeAIRecoverySlot({
      userId: args.userId,
      dateISO: args.dateISO,
      slot: args.slot,
      session: nextSession,
    });
    return {
      gate,
      session: nextSession,
      completions: filterCompletionIdsForOrders(completions, nextSession.orders?.items.map((item) => item.id) ?? []),
      quota: buildGenerationQuota(subscription?.tier ?? null, nextSession),
      slotLabel: getAIRecoverySlotLabel(args.slot, snapshot.todayShift),
      slotDescription: getAIRecoverySlotDescription(args.slot, snapshot.todayShift),
      stale: false,
      language: snapshot.language,
      model: session.model,
    };
  }

  const model = session.model;
  const ordersReasoningEffort = resolveReasoningEffort(model, "orders");
  const ordersResult = await runAIRecoveryStructuredRequest({
    model,
    reasoningEffort: ordersReasoningEffort,
    developerPrompt: buildOrdersDeveloperPrompt(snapshot.slot),
    userPrompt: buildOrdersUserPrompt(snapshot, brief),
    schemaName: "ai_recovery_orders",
    schema: buildOrdersSchema(),
    signal: args.signal,
    maxOutputTokens: 2200,
  });

  if (!ordersResult.ok) {
    console.error("[AIRecovery] regenerate_orders_request_failed", {
      model,
      slot: args.slot,
      dateISO: args.dateISO,
      error: ordersResult.error,
    });
    throw new Error(`ai_recovery_orders_failed:${ordersResult.error}`);
  }

  let orders: AIRecoveryOrdersPayload;
  try {
    orders = parseOrdersJson(ordersResult.text, args.slot);
  } catch (error) {
    console.error("[AIRecovery] regenerate_orders_parse_failed", {
      model,
      slot: args.slot,
      dateISO: args.dateISO,
      responseId: ordersResult.responseId,
      error: trimText((error as Error)?.message ?? error, 160),
    });
    const repairedOrders = await repairAIRecoveryJson({
      model,
      schemaName: "ai_recovery_orders",
      schema: buildOrdersSchema(),
      rawText: ordersResult.text,
      signal: args.signal,
      maxOutputTokens: 2200,
    });
    if (!repairedOrders.ok) {
      console.error("[AIRecovery] regenerate_orders_repair_failed", {
        model,
        slot: args.slot,
        dateISO: args.dateISO,
        responseId: ordersResult.responseId,
        error: repairedOrders.error,
      });
      throw new Error(`ai_recovery_orders_failed:${repairedOrders.error}`);
    }
    try {
      orders = parseOrdersJson(repairedOrders.text, args.slot);
    } catch (repairParseError) {
      console.error("[AIRecovery] regenerate_orders_repair_parse_failed", {
        model,
        slot: args.slot,
        dateISO: args.dateISO,
        responseId: repairedOrders.responseId,
        error: trimText((repairParseError as Error)?.message ?? repairParseError, 160),
      });
      throw new Error("ai_recovery_orders_failed:orders_repair_parse_failed");
    }
  }

  const nextSession = normalizeStoredSession(snapshot, {
    ...session,
    status: "ready",
    selection: {
      selectedCandidateIds: [],
      updatedAt: new Date().toISOString(),
    },
    orders,
    generationCounts: {
      ...readGenerationCounts(session),
      orders: readGenerationCounts(session).orders + 1,
    },
    openaiMeta: {
      ...session.openaiMeta,
      ordersResponseId: ordersResult.responseId,
      usage: {
        brief: session.openaiMeta.usage.brief,
        orders: ordersResult.usage,
        total: combineAIRecoveryUsages(session.openaiMeta.usage.brief, ordersResult.usage),
      },
      fallbackReason: null,
    },
  });
  await writeAIRecoverySlot({
    userId: args.userId,
    dateISO: args.dateISO,
    slot: args.slot,
    session: nextSession,
  });
  return {
    gate,
    session: nextSession,
    completions: filterCompletionIdsForOrders(completions, nextSession.orders?.items.map((item) => item.id) ?? []),
    quota: buildGenerationQuota(subscription?.tier ?? null, nextSession),
    slotLabel: getAIRecoverySlotLabel(args.slot, snapshot.todayShift),
    slotDescription: getAIRecoverySlotDescription(args.slot, snapshot.todayShift),
    stale: false,
    language: snapshot.language,
    model,
  };
}

export async function toggleAIRecoveryCompletion(args: {
  userId: string;
  dateISO: ISODate;
  orderId: string;
  completed: boolean;
}) {
  const orderId = trimText(args.orderId, 180);
  if (!orderId.startsWith("aiRecovery:")) {
    throw new Error("order_id_invalid");
  }
  const { aiRecoveryDaily } = await safeLoadRecoveryDomains(args.userId);
  const day = aiRecoveryDaily[args.dateISO];
  const allowedOrderIds = [
    ...(day?.wake?.orders?.items ?? []),
    ...(day?.postShift?.orders?.items ?? []),
  ].map((item) => item.id);
  if (!allowedOrderIds.includes(orderId)) {
    throw new Error("order_id_not_found");
  }
  const nextCompletions = await writeAIRecoveryCompletions({
    ...args,
    orderId,
  });
  return {
    completions: filterCompletionIdsForOrders(nextCompletions, allowedOrderIds),
  };
}
