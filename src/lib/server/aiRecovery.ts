import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, isISODate, toISODate, todayISO } from "@/lib/date";
import {
  AI_RECOVERY_MAX_CANDIDATES,
  AI_RECOVERY_PROMPT_VERSION,
  filterCompletionIdsForOrders,
  getAIRecoverySlotDescription,
  getAIRecoverySlotLabel,
  normalizeAIRecoveryLanguage,
  type AIRecoveryBrief,
  type AIRecoveryBriefSection,
  type AIRecoveryCandidate,
  type AIRecoveryCandidateEffort,
  type AIRecoveryContextMeta,
  type AIRecoveryEffort,
  type AIRecoveryGate,
  type AIRecoveryGenerationCounts,
  type AIRecoveryGenerationQuota,
  type AIRecoveryLanguage,
  type AIRecoveryOpenAIMeta,
  type AIRecoveryOrder,
  type AIRecoverySlot,
  type AIRecoverySlotFit,
  type AIRecoverySlotPayload,
  type AIRecoveryStatus,
  type AIRecoveryTone,
} from "@/lib/aiRecovery";
import { buildBillingEntitlements } from "@/lib/billing/entitlements";
import { getAIRecoveryModelForTier, type PlanTier } from "@/lib/billing/plans";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import { computePersonalizationAccuracy, topFactors, type FactorKey } from "@/lib/insightsV2";
import type { AppState, BioInputs, EmotionEntry } from "@/lib/model";
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
  orders: AIRecoveryOrder[];
  selectionIds: string[];
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

function normalizeTone(value: unknown, fallback: AIRecoveryTone): AIRecoveryTone {
  return value === "stable" || value === "noti" || value === "warning" ? value : fallback;
}

function normalizeEffort(value: unknown, fallback: AIRecoveryCandidateEffort): AIRecoveryCandidateEffort {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function normalizeSlotFit(value: unknown, slot: AIRecoverySlot): AIRecoverySlotFit {
  if (value === "wake" || value === "postShift" || value === "both") return value;
  return slot;
}

function buildAsciiSlug(raw: string, fallback: string) {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

function buildCandidateId(slot: AIRecoverySlot, source: string, index: number) {
  return `aiRecovery:${slot}:candidate:${buildAsciiSlug(source, `candidate_${index + 1}`)}`;
}

function buildOrderId(slot: AIRecoverySlot, source: string, index: number) {
  return `aiRecovery:${slot}:${buildAsciiSlug(source, `order_${index + 1}`)}`;
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
  return {
    dateISO: iso,
    sleepHours: bio?.sleepHours ?? null,
    napHours: bio?.napHours ?? null,
    stress: bio?.stress ?? null,
    activity: bio?.activity ?? null,
    caffeineMg: bio?.caffeineMg ?? null,
    mood: normalizedMood(bio, emotion),
    symptomSeverity: bio?.symptomSeverity ?? null,
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

function computeDefaultSelectionCount(args: {
  tone: AIRecoveryTone;
  candidateCount: number;
  todayVitalScore: number | null;
  sleepDebtHours: number;
  nightStreak: number;
}) {
  if (args.candidateCount <= 0) return 0;
  let desired = args.tone === "warning" ? 4 : args.tone === "noti" ? 3 : 2;
  if ((args.todayVitalScore ?? 100) <= 45 || args.sleepDebtHours >= 6 || args.nightStreak >= 2) desired = 5;
  return clamp(desired, 1, args.candidateCount);
}

function resolveGenerationLimit(tier: PlanTier | null | undefined): AIRecoveryGenerationCounts {
  if (tier === "pro") return { brief: 2, orders: 2 };
  if (tier === "plus") return { brief: 1, orders: 1 };
  return { brief: 0, orders: 0 };
}

function readGenerationCounts(session: AIRecoverySlotPayload | null | undefined): AIRecoveryGenerationCounts {
  if (!session) return { brief: 0, orders: 0 };
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
  const isProModel = model === "gpt-5.4";
  if (kind === "brief") return isProModel ? "high" : "medium";
  return isProModel ? "medium" : "low";
}

function getCandidateTemplate(key: string, slot: AIRecoverySlot) {
  const wake = slot === "wake";
  const common = {
    effort: "low" as const,
    minutes: wake ? 8 : 15,
    slotFit: slot,
  };
  switch (key) {
    case "sleep":
      return {
        ...common,
        title: wake ? "수면 회복 앵커" : "수면 모드 복구",
        why: wake ? "수면부채와 리듬 흔들림이 오늘 집중력을 먼저 떨어뜨릴 수 있습니다." : "퇴근 후 각성 잔존을 빨리 낮춰야 실제 회복 수면으로 이어집니다.",
        expectedBenefit: wake ? "근무 초반 집중력과 피로 버퍼를 조금 더 확보합니다." : "잠들기 전 긴장을 낮추고 다음 듀티까지 회복 여유를 만듭니다.",
      };
    case "stress":
      return {
        ...common,
        title: wake ? "60초 감압 리셋" : "퇴근 후 긴장 해제",
        why: "스트레스 부하가 높아 과소모를 막는 짧은 감압 루틴이 필요합니다.",
        expectedBenefit: "실수 가능성을 낮추고 에너지 분산을 줄입니다.",
      };
    case "activity":
      return {
        ...common,
        title: wake ? "가벼운 순환 깨우기" : "가벼운 회복 걷기",
        why: "활동 리듬이 내려가 있어 아주 짧은 움직임으로 회복 스위치를 켜는 편이 유리합니다.",
        expectedBenefit: "몸이 덜 무겁고 멘탈 회복 속도가 안정됩니다.",
      };
    case "caffeine":
      return {
        ...common,
        title: wake ? "카페인 컷오프 정리" : "저녁 카페인 종료",
        why: "카페인 잔존이 수면 회복을 방해할 가능성이 있습니다.",
        expectedBenefit: "필요한 각성만 쓰고 늦은 시간 회복 방해를 줄입니다.",
      };
    case "shift":
      return {
        ...common,
        title: wake ? "교대 리듬 준비" : "다음 듀티 버퍼 준비",
        why: "교대 스케줄 영향이 커서 오늘 리듬을 작은 기준점으로 잡는 것이 중요합니다.",
        expectedBenefit: "근무 전환 피로를 줄이고 다음 듀티 적응을 돕습니다.",
      };
    case "menstrual":
      return {
        ...common,
        title: wake ? "따뜻한 완화 루틴" : "증상 완화 루틴",
        why: "주기/증상 영향이 회복 체감에 반영되고 있습니다.",
        expectedBenefit: "불편감이 덜 올라오고 회복 루틴을 유지하기 쉬워집니다.",
      };
    case "mood":
      return {
        ...common,
        title: wake ? "멘탈 배터리 보호" : "감정 부하 낮추기",
        why: "기분 저하가 에너지 회복 체감과 업무 페이스에 함께 영향을 줍니다.",
        expectedBenefit: "오늘 할 일을 덜 버겁게 느끼고 페이스를 지키기 쉽습니다.",
      };
    default:
      return {
        ...common,
        title: wake ? "회복 루틴 고정" : "저자극 회복 루틴",
        why: "오늘 회복 우선순위를 한 가지라도 고정하는 편이 컨디션 유지에 유리합니다.",
        expectedBenefit: "에너지 낭비를 줄이고 회복 흐름을 만듭니다.",
      };
  }
}

function buildFallbackCandidates(snapshot: RecoverySnapshot) {
  const sources = snapshot.topFactorRows.length
    ? snapshot.topFactorRows.map((item) => item.key)
    : (["sleep", "stress", "shift"] as FactorKey[]);
  return sources.slice(0, AI_RECOVERY_MAX_CANDIDATES).map((key, index) => {
    const template = getCandidateTemplate(key, snapshot.slot);
    return {
      id: buildCandidateId(snapshot.slot, key, index),
      title: template.title,
      why: template.why,
      expectedBenefit: template.expectedBenefit,
      effort: template.effort,
      minutes: template.minutes,
      slotFit: template.slotFit,
      driverRefs: [key],
    } satisfies AIRecoveryCandidate;
  });
}

function buildFallbackSections(snapshot: RecoverySnapshot): AIRecoveryBriefSection[] {
  const focusText =
    snapshot.plannerContext.primaryAction ??
    (snapshot.slot === "wake"
      ? "오늘은 출근 전 회복 기준점을 하나 먼저 잡아 두는 편이 안전합니다."
      : "오늘은 퇴근 후 자극을 줄이고 회복 모드 전환을 빨리 시작하는 편이 좋습니다.");
  const signalText =
    snapshot.plannerContext.avoidAction ??
    (snapshot.sleepDebtHours >= 3
      ? `수면부채 ${Math.round(snapshot.sleepDebtHours * 10) / 10}h가 누적되어 있어 무리한 일정 추가는 피하는 편이 좋습니다.`
      : "피로 신호가 커지기 전에 짧은 리셋과 저자극 루틴을 먼저 확보하는 편이 좋습니다.");
  const weeklyText = snapshot.topFactorRows.length
    ? `최근 2주 흐름에서는 ${snapshot.topFactorRows
        .slice(0, 2)
        .map((item) => item.label)
        .join(", ")} 영향이 상대적으로 크게 보였습니다.`
    : "최근 2주 흐름은 데이터가 충분하지 않아 보수적으로 해석해야 합니다.";

  return [
    { key: "focus", title: "회복 포커스", body: focusText },
    { key: "signal", title: "주의 신호", body: signalText },
    { key: "weekly", title: "이번 주 흐름", body: weeklyText },
  ];
}

function buildFallbackBrief(snapshot: RecoverySnapshot): AIRecoveryBrief {
  const candidates = buildFallbackCandidates(snapshot);
  const count = computeDefaultSelectionCount({
    tone: snapshot.plannerContext.plannerTone,
    candidateCount: candidates.length,
    todayVitalScore: snapshot.todayDisplay,
    sleepDebtHours: snapshot.sleepDebtHours,
    nightStreak: snapshot.nightStreak,
  });
  return {
    headline:
      snapshot.slot === "wake"
        ? snapshot.todayDisplay != null && snapshot.todayDisplay <= 45
          ? "오늘 아침은 회복 우선으로 시작하는 편이 안전합니다."
          : "오늘 아침은 회복 기준점을 먼저 잡아 두는 편이 좋습니다."
        : snapshot.todayShift === "OFF" || snapshot.todayShift === "VAC"
          ? "오늘 저녁은 자극을 줄이고 회복 흐름을 정리하는 편이 좋습니다."
          : "퇴근 후에는 감압과 수면 보호를 먼저 가져가는 편이 좋습니다.",
    summary:
      snapshot.slot === "wake"
        ? `오늘 수면 ${snapshot.contextMeta.todaySleepHours ?? "-"}시간과 최근 14일 흐름을 기준으로 보면 ${snapshot.plannerContext.focusFactor?.label ?? "회복 리듬"} 관리가 우선입니다. 근무 전에 짧고 확실한 회복 행동부터 고르는 편이 유리합니다.`
        : `${snapshot.todayShift === "OFF" || snapshot.todayShift === "VAC" ? "저녁 회복" : "퇴근 후 회복"}에서는 ${snapshot.plannerContext.focusFactor?.label ?? "과소모 방지"}가 핵심입니다. 자극을 낮추고 다음 듀티까지 이어질 회복 루틴을 짧게 고르는 편이 좋습니다.`,
    tone: snapshot.plannerContext.plannerTone,
    topDrivers: snapshot.topFactorRows.slice(0, 4).map((item) => `${item.label} ${Math.round(item.pct * 100)}%`),
    sections: buildFallbackSections(snapshot),
    weeklyNote: snapshot.plannerContext.nextDutyDate
      ? `${formatRelativeDutyKorean(snapshot.plannerContext.nextDutyDate, snapshot.dateISO)} ${shiftLabel(snapshot.plannerContext.nextDuty)} 대비로 회복 루틴을 가볍게 고정하는 편이 좋습니다.`
      : "다음 근무 일정이 가까우면 수면과 자극 조절부터 먼저 챙기는 편이 좋습니다.",
    candidateActions: candidates,
    defaultSelectionIds: candidates.slice(0, count).map((item) => item.id),
    dataGaps: [],
  };
}

function buildFallbackSteps(slot: AIRecoverySlot, candidate: AIRecoveryCandidate) {
  if (slot === "wake") {
    return [
      "물 1컵이나 물 5모금으로 몸을 먼저 깨웁니다.",
      `${candidate.title}에 맞는 짧은 행동을 ${Math.max(3, Math.min(candidate.minutes, 15))}분 안에 끝냅니다.`,
      "출근 전에는 오늘 꼭 지킬 한 가지 기준만 남깁니다.",
    ];
  }
  return [
    "집에 도착하면 조도와 소음을 먼저 낮춥니다.",
    `${candidate.title}에 맞는 회복 행동을 ${Math.max(5, Math.min(candidate.minutes, 30))}분 안에 끝냅니다.`,
    "다음 수면이나 다음 듀티 준비를 위해 화면/카페인 자극을 더 늘리지 않습니다.",
  ];
}

function buildFallbackOrders(slot: AIRecoverySlot, candidates: AIRecoveryCandidate[], snapshot: RecoverySnapshot) {
  return candidates.map((candidate, index) => ({
    id: buildOrderId(slot, candidate.title || candidate.id, index),
    candidateId: candidate.id,
    title: candidate.title,
    whyNow: candidate.why,
    executionWindow:
      slot === "wake"
        ? "기상 후 30분 안"
        : snapshot.todayShift === "OFF" || snapshot.todayShift === "VAC"
          ? "저녁 루틴 시작 전"
          : "퇴근 후 2시간 안",
    steps: buildFallbackSteps(slot, candidate).slice(0, slot === "wake" ? 3 : 3),
    successCheck: slot === "wake" ? "출근 전 한 가지 회복 행동을 실제로 끝냈습니다." : "잠들기 전 자극을 낮춘 회복 행동을 실제로 끝냈습니다.",
    avoid: slot === "wake" ? "아침부터 과한 목표를 추가하지 않습니다." : "퇴근 후 화면, 카페인, 추가 일정으로 각성을 다시 올리지 않습니다.",
    workHint:
      slot === "wake"
        ? "근무 초반 페이스를 낮추고 마이크로 브레이크를 더 믿어도 됩니다."
        : "다음 듀티를 위해 오늘은 완벽한 루틴보다 자극 감소가 우선입니다.",
    minutes: clamp(candidate.minutes, slot === "wake" ? 3 : 5, slot === "wake" ? 15 : 30),
    safetyNote: "생활 회복용 오더입니다. 증상이 심하거나 업무 안전이 흔들리면 현장 판단과 정식 도움 요청을 우선합니다.",
  })) satisfies AIRecoveryOrder[];
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

function getSelectionIds(brief: AIRecoveryBrief, requestedIds?: string[]) {
  const allowed = new Set(brief.candidateActions.map((item) => item.id));
  const input = Array.isArray(requestedIds) ? requestedIds : brief.defaultSelectionIds;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || !allowed.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= AI_RECOVERY_MAX_CANDIDATES) break;
  }
  return out;
}

function matchesCandidateAlias(candidateId: string, rawValue: unknown) {
  const trimmed = trimText(rawValue, 140);
  if (!trimmed) return false;
  if (candidateId === trimmed) return true;
  const slug = buildAsciiSlug(trimmed, "");
  return Boolean(slug) && candidateId.endsWith(`:${slug}`);
}

function resolveCandidateIdAlias(candidates: AIRecoveryCandidate[], rawValue: unknown) {
  for (const candidate of candidates) {
    if (matchesCandidateAlias(candidate.id, rawValue)) return candidate.id;
  }
  return null;
}

function parseCandidateRecord(raw: unknown, slot: AIRecoverySlot, index: number): AIRecoveryCandidate | null {
  if (!isRecord(raw)) return null;
  const title = trimText(raw.title, 80);
  const why = trimText(raw.why, 220);
  const expectedBenefit = trimText(raw.expectedBenefit, 220);
  if (!title || !why || !expectedBenefit) return null;
  const driverRefs = asStringArray(raw.driverRefs, 4, 40);
  const rawId = trimText(raw.id, 48) || title;
  return {
    id: buildCandidateId(slot, rawId, index),
    title,
    why,
    expectedBenefit,
    effort: normalizeEffort(raw.effort, "low"),
    minutes: clamp(Math.round(Number(raw.minutes) || (slot === "wake" ? 8 : 15)), slot === "wake" ? 3 : 5, slot === "wake" ? 15 : 30),
    slotFit: normalizeSlotFit(raw.slotFit, slot),
    driverRefs: driverRefs.length ? driverRefs : ["general"],
  };
}

function isCandidate(value: AIRecoveryCandidate | null): value is AIRecoveryCandidate {
  return Boolean(value);
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

  const candidateActions = Array.isArray(parsed.candidateActions)
    ? parsed.candidateActions.map((item, index) => parseCandidateRecord(item, snapshot.slot, index)).filter(isCandidate)
    : [];
  if (candidateActions.length === 0) throw new Error("brief_candidate_actions_empty");

  const sectionsSource = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sectionTitles = ["회복 포커스", "주의 신호", "이번 주 흐름"] as const;
  const sectionKeys: Array<AIRecoveryBriefSection["key"]> = ["focus", "signal", "weekly"];
  const sections = sectionTitles.map((title, index) => {
    const source = sectionsSource[index];
    return {
      key: sectionKeys[index],
      title,
      body: trimText(isRecord(source) ? source.body : source, 320) || buildFallbackSections(snapshot)[index].body,
    };
  });

  const brief: AIRecoveryBrief = {
    headline: trimText(parsed.headline, 120) || buildFallbackBrief(snapshot).headline,
    summary: trimText(parsed.summary, 360) || buildFallbackBrief(snapshot).summary,
    tone: normalizeTone(parsed.tone, snapshot.plannerContext.plannerTone),
    topDrivers: asStringArray(parsed.topDrivers, 4, 64),
    sections,
    weeklyNote: trimText(parsed.weeklyNote, 240) || buildFallbackBrief(snapshot).weeklyNote,
    candidateActions: candidateActions.slice(0, AI_RECOVERY_MAX_CANDIDATES),
    defaultSelectionIds: [],
    dataGaps: asStringArray(parsed.dataGaps, 8, 80),
  };

  const count = computeDefaultSelectionCount({
    tone: brief.tone,
    candidateCount: brief.candidateActions.length,
    todayVitalScore: snapshot.todayDisplay,
    sleepDebtHours: snapshot.sleepDebtHours,
    nightStreak: snapshot.nightStreak,
  });
  const requestedDefaultIds = asStringArray(parsed.defaultSelectionIds, AI_RECOVERY_MAX_CANDIDATES, 120);
  const normalizedDefaultIds: string[] = [];
  const seen = new Set<string>();
  for (const requestedId of requestedDefaultIds) {
    const resolvedId = resolveCandidateIdAlias(brief.candidateActions, requestedId);
    if (!resolvedId || seen.has(resolvedId)) continue;
    seen.add(resolvedId);
    normalizedDefaultIds.push(resolvedId);
    if (normalizedDefaultIds.length >= count) break;
  }
  brief.defaultSelectionIds = normalizedDefaultIds.length
    ? normalizedDefaultIds
    : brief.candidateActions.slice(0, count).map((item) => item.id);

  return brief;
}

function parseOrderRecord(
  raw: unknown,
  slot: AIRecoverySlot,
  selectedCandidates: AIRecoveryCandidate[],
  index: number
): AIRecoveryOrder | null {
  if (!isRecord(raw)) return null;
  const title = trimText(raw.title, 80);
  const whyNow = trimText(raw.whyNow, 220);
  const executionWindow = trimText(raw.executionWindow, 120);
  const successCheck = trimText(raw.successCheck, 160);
  const avoid = trimText(raw.avoid, 160);
  const workHint = trimText(raw.workHint, 160);
  const safetyNote = trimText(raw.safetyNote, 160);
  const candidateId = trimText(raw.candidateId, 140);
  const fallbackCandidate = selectedCandidates[index] ?? selectedCandidates[0];
  const resolvedCandidateId = resolveCandidateIdAlias(selectedCandidates, candidateId) ?? fallbackCandidate?.id;
  const steps = asStringArray(raw.steps, 4, 120).slice(0, 4);
  if (!title || !whyNow || !resolvedCandidateId) return null;
  return {
    id: buildOrderId(slot, trimText(raw.id, 48) || title, index),
    candidateId: resolvedCandidateId,
    title,
    whyNow,
    executionWindow: executionWindow || (slot === "wake" ? "기상 후 30분 안" : "퇴근 후 2시간 안"),
    steps: steps.length >= 2 ? steps : buildFallbackSteps(slot, fallbackCandidate).slice(0, 3),
    successCheck: successCheck || "체크 가능한 회복 행동을 실제로 마쳤습니다.",
    avoid: avoid || "과한 자극과 일정 추가는 피합니다.",
    workHint: workHint || "실행 가능한 범위만 남기고 페이스를 낮춥니다.",
    minutes: clamp(Math.round(Number(raw.minutes) || fallbackCandidate.minutes || 10), slot === "wake" ? 3 : 5, slot === "wake" ? 15 : 30),
    safetyNote:
      safetyNote || "생활 회복용 오더입니다. 증상이 심하거나 업무 안전이 흔들리면 현장 판단과 정식 도움 요청을 우선합니다.",
  };
}

function isOrder(value: AIRecoveryOrder | null): value is AIRecoveryOrder {
  return Boolean(value);
}

function parseOrdersJson(text: string, slot: AIRecoverySlot, selectedCandidates: AIRecoveryCandidate[]): AIRecoveryOrder[] {
  const parsed = parseLooseJson(text);
  const rawOrders: unknown[] | null = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.orders) ? parsed.orders : null;
  if (!rawOrders) throw new Error("orders_not_array");
  const out = rawOrders
    .map((item: unknown, index: number) => parseOrderRecord(item, slot, selectedCandidates, index))
    .filter(isOrder);
  if (out.length !== selectedCandidates.length) throw new Error("orders_count_mismatch");
  return out;
}

function buildBriefSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" },
      summary: { type: "string" },
      tone: { type: "string", enum: ["stable", "noti", "warning"] },
      topDrivers: {
        type: "array",
        items: { type: "string" },
      },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            body: { type: "string" },
          },
          required: ["body"],
        },
      },
      weeklyNote: { type: "string" },
      candidateActions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            why: { type: "string" },
            expectedBenefit: { type: "string" },
            effort: { type: "string", enum: ["low", "medium", "high"] },
            minutes: { type: "number" },
            slotFit: { type: "string", enum: ["wake", "postShift", "both"] },
            driverRefs: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["id", "title", "why", "expectedBenefit", "effort", "minutes", "slotFit", "driverRefs"],
        },
      },
      defaultSelectionIds: {
        type: "array",
        items: { type: "string" },
      },
      dataGaps: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["headline", "summary", "tone", "topDrivers", "sections", "weeklyNote", "candidateActions", "defaultSelectionIds", "dataGaps"],
  };
}

function buildOrdersSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      orders: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            candidateId: { type: "string" },
            title: { type: "string" },
            whyNow: { type: "string" },
            executionWindow: { type: "string" },
            steps: {
              type: "array",
              items: { type: "string" },
            },
            successCheck: { type: "string" },
            avoid: { type: "string" },
            workHint: { type: "string" },
            minutes: { type: "number" },
            safetyNote: { type: "string" },
          },
          required: ["id", "candidateId", "title", "whyNow", "executionWindow", "steps", "successCheck", "avoid", "workHint", "minutes", "safetyNote"],
        },
      },
    },
    required: ["orders"],
  };
}

function buildBriefDeveloperPrompt(slot: AIRecoverySlot) {
  return [
    "너는 간호사용 비의료 회복 코치다.",
    "이 기능은 생활 회복 + 비의료 업무조언만 제공한다.",
    "진단, 약물, 처치, 검사 지시를 절대 하지 마라.",
    "제공된 숫자와 사실만 사용하고, 없는 데이터를 추정하지 마라.",
    "개인 메모, 일정 노트, 근무 이벤트 텍스트 같은 사생활 정보는 입력에 포함되지 않는다. 건강 데이터와 시스템 지표만 해석하라.",
    "근무 지속 가능성과 회복 실행 가능성을 우선한다.",
    `현재 슬롯은 ${slot === "wake" ? "wake(기상 후)" : "postShift(퇴근 후/저녁 회복)"}다.`,
    "사용자가 고를 수 있는 실행 후보를 최대 5개 제안하라.",
    "sections는 정확히 3개여야 하며 body만 채운다. 제목은 시스템이 고정한다.",
    "candidateActions.id는 ASCII slug로 작성한다.",
    "defaultSelectionIds는 candidateActions 안에 있는 id만 사용한다.",
    "출력은 반드시 JSON schema를 정확히 따른다.",
  ].join("\n");
}

function buildBriefUserPrompt(snapshot: RecoverySnapshot) {
  return [
    "<task>",
    `${snapshot.slot === "wake" ? "오늘 아침 회복 우선순위를 설명하고 바로 고를 수 있는 후보를 제안해라." : "퇴근 후 또는 저녁 회복 우선순위를 설명하고 바로 고를 수 있는 후보를 제안해라."}`,
    "</task>",
    "<slotContext>",
    JSON.stringify(
      {
        slot: snapshot.slot,
        dateISO: snapshot.dateISO,
        todayShift: snapshot.todayShift,
        nextDuty: snapshot.plannerContext.nextDuty,
        nextDutyDate: snapshot.plannerContext.nextDutyDate,
        slotLabel: getAIRecoverySlotLabel(snapshot.slot, snapshot.todayShift),
      },
      null,
      2
    ),
    "</slotContext>",
    "<todayPersistedData>",
    JSON.stringify(snapshot.todayRow, null, 2),
    "</todayPersistedData>",
    "<history14dPersistedData>",
    JSON.stringify(snapshot.historyRows, null, 2),
    "</history14dPersistedData>",
    "<derivedMetrics>",
    JSON.stringify(snapshot.derivedMetrics, null, 2),
    "</derivedMetrics>",
    "<plannerContext>",
    JSON.stringify(
      {
        plannerTone: snapshot.plannerContext.plannerTone,
        focusFactor: snapshot.plannerContext.focusFactor,
        primaryAction: snapshot.plannerContext.primaryAction,
        avoidAction: snapshot.plannerContext.avoidAction,
        nextDuty: snapshot.plannerContext.nextDuty,
        nextDutyDate: snapshot.plannerContext.nextDutyDate,
        ordersTop3: snapshot.plannerContext.ordersTop3,
      },
      null,
      2
    ),
    "</plannerContext>",
    "<cycleContext>",
    JSON.stringify(snapshot.cycleContext, null, 2),
    "</cycleContext>",
    "<safetyScope>",
    "허용 범위: 수면, 수분, 카페인, 빛, 호흡, 스트레칭, 짧은 휴식, 업무 페이스 조절, 저자극 루틴, 실수 방지.",
    "금지 범위: 진단, 투약, 처치, 검사 지시, 임상 판단 대체, 제공되지 않은 숫자 생성.",
    "</safetyScope>",
  ].join("\n");
}

function buildOrdersDeveloperPrompt(slot: AIRecoverySlot) {
  return [
    "너는 선택된 회복 후보를 바로 실행 가능한 간호사 회복 오더로 변환하는 시스템이다.",
    "선택된 후보 외 새로운 후보를 만들지 마라.",
    "오더 수는 선택 수와 정확히 일치해야 한다.",
    "각 오더는 독립 체크가 가능해야 한다.",
    "각 오더의 steps는 2~4개여야 한다.",
    slot === "wake" ? "wake 오더는 3~15분 안에 가능한 짧은 실행 위주다." : "postShift 오더는 5~30분 안에 가능한 감압/수면 보호 위주다.",
    "개인 메모, 일정 노트, 근무 이벤트 텍스트 같은 사생활 정보는 입력에 포함되지 않는다. 건강 데이터와 시스템 지표만 사용하라.",
    "진단, 약물, 처치, 검사 지시는 절대 금지한다.",
    "candidateId는 입력으로 받은 selectedCandidates의 id만 써라.",
    "id는 ASCII slug로 작성한다.",
    "출력은 반드시 JSON schema를 정확히 따른다.",
  ].join("\n");
}

function buildOrdersUserPrompt(snapshot: RecoverySnapshot, brief: AIRecoveryBrief, selectedCandidates: AIRecoveryCandidate[]) {
  return [
    "<task>",
    "selectedCandidates를 바로 실행 가능한 오더로 변환해라.",
    "</task>",
    "<slotContext>",
    JSON.stringify(
      {
        slot: snapshot.slot,
        dateISO: snapshot.dateISO,
        todayShift: snapshot.todayShift,
        nextDuty: snapshot.plannerContext.nextDuty,
        nextDutyDate: snapshot.plannerContext.nextDutyDate,
      },
      null,
      2
    ),
    "</slotContext>",
    "<briefSummary>",
    JSON.stringify(
      {
        headline: brief.headline,
        summary: brief.summary,
        tone: brief.tone,
        topDrivers: brief.topDrivers,
      },
      null,
      2
    ),
    "</briefSummary>",
    "<selectedCandidates>",
    JSON.stringify(selectedCandidates, null, 2),
    "</selectedCandidates>",
    "<todayPersistedData>",
    JSON.stringify(snapshot.todayRow, null, 2),
    "</todayPersistedData>",
    "<derivedMetrics>",
    JSON.stringify(snapshot.derivedMetrics, null, 2),
    "</derivedMetrics>",
    "<workConstraints>",
    JSON.stringify(snapshot.workConstraints, null, 2),
    "</workConstraints>",
    "<safetyScope>",
    "선택된 후보만 변환한다. 새로운 후보/새 임상 추정 금지.",
    "생활 회복, 저자극 루틴, 짧은 실행, 실수 방지 중심으로 작성한다.",
    "</safetyScope>",
  ].join("\n");
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
  const state = sanitizeStatePayload(args.payload);
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
  selectedCandidateIds?: string[];
}) {
  const briefReasoningEffort = resolveReasoningEffort(args.model, "brief");
  const ordersReasoningEffort = resolveReasoningEffort(args.model, "orders");
  const fallbackBrief = buildFallbackBrief(args.snapshot);
  const fallbackSelectedIds = getSelectionIds(fallbackBrief, args.selectedCandidateIds);
  const fallbackSelectedCandidates = fallbackBrief.candidateActions.filter((item) => fallbackSelectedIds.includes(item.id));
  const fallbackOrders = buildFallbackOrders(args.snapshot.slot, fallbackSelectedCandidates, args.snapshot);

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
    return {
      status: "fallback",
      brief: fallbackBrief,
      orders: fallbackOrders,
      selectionIds: fallbackSelectedIds,
      reasoningEffort: briefReasoningEffort,
      model: args.model,
      openaiMeta: {
        ...baseMeta,
        fallbackReason: briefResult.error,
      },
    } satisfies OpenAIFlowResult;
  }

  let brief: AIRecoveryBrief;
  try {
    brief = parseBriefJson(briefResult.text, args.snapshot);
  } catch (error) {
    return {
      status: "fallback",
      brief: fallbackBrief,
      orders: fallbackOrders,
      selectionIds: fallbackSelectedIds,
      reasoningEffort: briefReasoningEffort,
      model: args.model,
      openaiMeta: {
        ...baseMeta,
        briefResponseId: briefResult.responseId,
        usage: {
          brief: briefResult.usage,
          orders: null,
          total: combineAIRecoveryUsages(briefResult.usage),
        },
        fallbackReason: `brief_parse_failed:${trimText((error as Error)?.message ?? error, 120)}`,
      },
    } satisfies OpenAIFlowResult;
  }

  const selectionIds = getSelectionIds(brief, args.selectedCandidateIds);
  const selectedCandidates = brief.candidateActions.filter((item) => selectionIds.includes(item.id));
  if (selectedCandidates.length === 0) {
    const fallbackSelectionIds = getSelectionIds(fallbackBrief, args.selectedCandidateIds);
    return {
      status: "fallback",
      brief: fallbackBrief,
      orders: buildFallbackOrders(args.snapshot.slot, fallbackBrief.candidateActions.filter((item) => fallbackSelectionIds.includes(item.id)), args.snapshot),
      selectionIds: fallbackSelectionIds,
      reasoningEffort: briefReasoningEffort,
      model: args.model,
      openaiMeta: {
        ...baseMeta,
        briefResponseId: briefResult.responseId,
        usage: {
          brief: briefResult.usage,
          orders: null,
          total: combineAIRecoveryUsages(briefResult.usage),
        },
        fallbackReason: "brief_selection_empty",
      },
    } satisfies OpenAIFlowResult;
  }

  const ordersResult = await runAIRecoveryStructuredRequest({
    model: args.model,
    reasoningEffort: ordersReasoningEffort,
    developerPrompt: buildOrdersDeveloperPrompt(args.snapshot.slot),
    userPrompt: buildOrdersUserPrompt(args.snapshot, brief, selectedCandidates),
    schemaName: "ai_recovery_orders",
    schema: buildOrdersSchema(),
    signal: args.signal,
    maxOutputTokens: 2200,
  });

  if (!ordersResult.ok) {
    return {
      status: "fallback",
      brief,
      orders: buildFallbackOrders(args.snapshot.slot, selectedCandidates, args.snapshot),
      selectionIds,
      reasoningEffort: briefReasoningEffort,
      model: args.model,
      openaiMeta: {
        ...baseMeta,
        briefResponseId: briefResult.responseId,
        usage: {
          brief: briefResult.usage,
          orders: null,
          total: combineAIRecoveryUsages(briefResult.usage),
        },
        fallbackReason: `orders:${ordersResult.error}`,
      },
    } satisfies OpenAIFlowResult;
  }

  try {
    const orders = parseOrdersJson(ordersResult.text, args.snapshot.slot, selectedCandidates);
    return {
      status: "ready",
      brief,
      orders,
      selectionIds,
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
    return {
      status: "fallback",
      brief,
      orders: buildFallbackOrders(args.snapshot.slot, selectedCandidates, args.snapshot),
      selectionIds,
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
        fallbackReason: `orders_parse_failed:${trimText((error as Error)?.message ?? error, 120)}`,
      },
    } satisfies OpenAIFlowResult;
  }
}

function buildStoredSession(args: {
  snapshot: RecoverySnapshot;
  flow: OpenAIFlowResult;
  previousSession?: AIRecoverySlotPayload | null;
}) {
  const now = new Date().toISOString();
  const previousCounts = readGenerationCounts(args.previousSession);
  const shouldCountGeneration = args.flow.status === "ready";
  return {
    status: args.flow.status,
    generatedAt: now,
    model: args.flow.model,
    reasoningEffort: args.flow.reasoningEffort,
    language: args.snapshot.language,
    promptVersion: AI_RECOVERY_PROMPT_VERSION,
    inputSignature: args.snapshot.inputSignature,
    context: args.snapshot.contextMeta,
    brief: args.flow.brief,
    selection: {
      selectedCandidateIds: args.flow.selectionIds,
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
  const visibleSession = gate.allowed ? session : null;
  const orderIds = visibleSession?.orders?.map((item) => item.id) ?? [];
  const filteredCompletions = filterCompletionIdsForOrders(completions, orderIds);
  const quota = buildGenerationQuota(subscription?.tier ?? null, visibleSession);
  return {
    dateISO,
    slot,
    slotLabel: getAIRecoverySlotLabel(slot, snapshot.todayShift),
    slotDescription: getAIRecoverySlotDescription(slot, snapshot.todayShift),
    language: snapshot.language,
    gate,
    session: visibleSession,
    stale: Boolean(visibleSession && (visibleSession.inputSignature !== snapshot.inputSignature || visibleSession.language !== snapshot.language)),
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
  if (!args.force && existingSession && existingSession.inputSignature === snapshot.inputSignature && existingSession.language === snapshot.language) {
    return {
      gate,
      session: existingSession,
      completions: filterCompletionIdsForOrders(existingCompletions, existingSession.orders.map((item) => item.id)),
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

  if (existingSession && !quota.canGenerateSession) {
    throw new Error("session_generation_limit_reached");
  }

  const flow = await runOpenAIFlow({
    snapshot,
    model,
    signal: args.signal,
  });
  const session = buildStoredSession({ snapshot, flow, previousSession: existingSession });
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
    completions: filterCompletionIdsForOrders(existingCompletions, session.orders.map((item) => item.id)),
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
  candidateIds: string[];
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
  const brief = session.brief;
  const selectedIds = getSelectionIds(brief, args.candidateIds);
  if (selectedIds.length < 1 || selectedIds.length > AI_RECOVERY_MAX_CANDIDATES) {
    throw new Error("candidate_ids_invalid_count");
  }
  const selectedCandidates = brief.candidateActions.filter((item) => selectedIds.includes(item.id));
  if (selectedCandidates.length !== selectedIds.length) throw new Error("candidate_ids_not_found");

  const model = session.model;
  const ordersReasoningEffort = resolveReasoningEffort(model, "orders");
  const ordersResult = await runAIRecoveryStructuredRequest({
    model,
    reasoningEffort: ordersReasoningEffort,
    developerPrompt: buildOrdersDeveloperPrompt(snapshot.slot),
    userPrompt: buildOrdersUserPrompt(snapshot, brief, selectedCandidates),
    schemaName: "ai_recovery_orders",
    schema: buildOrdersSchema(),
    signal: args.signal,
    maxOutputTokens: 2200,
  });

  let orders: AIRecoveryOrder[];
  let status: AIRecoveryStatus = session.status;
  let fallbackReason: string | null = session.openaiMeta.fallbackReason ?? null;
  let ordersResponseId: string | null = null;
  let ordersUsage = null;
  if (!ordersResult.ok) {
    orders = buildFallbackOrders(args.slot, selectedCandidates, snapshot);
    status = "fallback";
    fallbackReason = `orders:${ordersResult.error}`;
  } else {
    try {
      orders = parseOrdersJson(ordersResult.text, args.slot, selectedCandidates);
      ordersResponseId = ordersResult.responseId;
      ordersUsage = ordersResult.usage;
      fallbackReason = null;
    } catch (error) {
      orders = buildFallbackOrders(args.slot, selectedCandidates, snapshot);
      status = "fallback";
      fallbackReason = `orders_parse_failed:${trimText((error as Error)?.message ?? error, 120)}`;
      ordersResponseId = ordersResult.responseId;
      ordersUsage = ordersResult.usage;
    }
  }

  const nextSession: AIRecoverySlotPayload = {
    ...session,
    status,
    selection: {
      selectedCandidateIds: selectedIds,
      updatedAt: new Date().toISOString(),
    },
    orders,
    generationCounts: {
      ...readGenerationCounts(session),
      orders: status === "ready" ? readGenerationCounts(session).orders + 1 : readGenerationCounts(session).orders,
    },
    openaiMeta: {
      ...session.openaiMeta,
      ordersResponseId,
      usage: {
        brief: session.openaiMeta.usage.brief,
        orders: ordersUsage,
        total: combineAIRecoveryUsages(session.openaiMeta.usage.brief, ordersUsage),
      },
      fallbackReason,
    },
  };
  await writeAIRecoverySlot({
    userId: args.userId,
    dateISO: args.dateISO,
    slot: args.slot,
    session: nextSession,
  });
  return {
    gate,
    session: nextSession,
    completions: filterCompletionIdsForOrders(completions, nextSession.orders.map((item) => item.id)),
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
    ...(day?.wake?.orders ?? []),
    ...(day?.postShift?.orders ?? []),
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
