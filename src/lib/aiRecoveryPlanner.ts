import type { AIRecoveryResult } from "@/lib/aiRecovery";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { ProfileSettings } from "@/lib/model";
import { buildPlannerTimelinePreview, type PlannerContext, type PlannerTimelinePreview } from "@/lib/recoveryPlanner";
import type { RecoveryPhase } from "@/lib/recoveryPhases";
import type { Shift } from "@/lib/types";

export type AIPlannerModuleItem = {
  label: string;
  title: string;
  body: string;
  chips?: string[];
};

export type AIPlannerModule = {
  eyebrow: string;
  title: string;
  headline: string;
  summary: string;
  items: AIPlannerModuleItem[];
};

export type AIPlannerTimelineItem = {
  phase: string;
  focus: string;
  body: string;
  caution?: string | null;
};

export type AIPlannerTimelineModule = {
  eyebrow: string;
  title: string;
  headline: string;
  summary: string;
  items: AIPlannerTimelineItem[];
};

export type AIPlannerExplanationModule = {
  eyebrow: string;
  title: string;
  headline: string;
  summary: string;
  recovery: AIRecoveryResult;
};

export type AIPlannerChecklistItem = {
  id: string;
  title: string;
  body: string;
  when: string;
  reason?: string | null;
  chips?: string[];
};

export type AIPlannerChecklistModule = {
  eyebrow: string;
  title: string;
  headline: string;
  summary: string;
  items: AIPlannerChecklistItem[];
};

export type AIRecoveryPlannerModules = {
  heroTitle: string;
  heroSummary: string;
  orders: AIPlannerChecklistModule;
};

export type AIRecoveryPlannerResult = AIRecoveryPlannerModules & {
  explanation: AIPlannerExplanationModule;
};

export type AIRecoveryPlannerPayload = {
  dateISO: ISODate;
  language: Language;
  phase: RecoveryPhase;
  requestedOrderCount?: number | null;
  todayShift: Shift;
  nextShift: Shift | null;
  todayVitalScore: number | null;
  source: "supabase" | "local";
  engine: "openai" | "rule";
  model: string | null;
  debug?: string | null;
  generatedText?: string;
  explanationGeneratedText?: string;
  plannerContext?: PlannerContext;
  profileSnapshot?: Pick<ProfileSettings, "chronotype" | "caffeineSensitivity">;
  result: AIRecoveryPlannerResult;
};

export type AIRecoveryPlannerApiSuccess = {
  ok: true;
  data: AIRecoveryPlannerPayload | null;
};

export type AIRecoveryPlannerApiError = {
  ok: false;
  error: string;
};

function compactNarrative(value: string, fallback: string) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const first = sentences[0] ?? text;
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}...` : first;
}

function buildExplanationSummary(result: AIRecoveryResult, language: Language) {
  const fallback =
    language === "en"
      ? "AI explains what recovery should come first today and why that matters."
      : "오늘 어떤 회복을 먼저 잡아야 하는지, 왜 그게 중요한지 AI가 설명합니다.";
  const candidate =
    result.compoundAlert?.message ||
    result.sections?.[0]?.description ||
    result.sections?.[0]?.tips?.[0] ||
    "";
  return compactNarrative(candidate, fallback);
}

function sanitizeChecklistId(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function normalizeRequestedOrderCount(value: number | null | undefined) {
  if (value == null || String(value).trim() === "") return 3;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, parsed));
}

function describeNextDutyLabel(shift: Shift | null, language: Language) {
  if (language === "en") {
    if (shift === "D") return "the next day shift";
    if (shift === "E") return "the next evening shift";
    if (shift === "N") return "the next night shift";
    if (shift === "M") return "the next middle shift";
    return "the next duty";
  }
  if (shift === "D") return "다음 데이 근무";
  if (shift === "E") return "다음 이브 근무";
  if (shift === "N") return "다음 나이트 근무";
  if (shift === "M") return "다음 미들 근무";
  return "다음 근무";
}

function derivePlannerContextFromRecoveryPayload(
  recoveryPayload: AIRecoveryPayload,
  requestedOrderCount: number
): PlannerContext {
  if (recoveryPayload.plannerContext) return recoveryPayload.plannerContext;

  const firstSection = recoveryPayload.result.sections?.[0] ?? null;
  const ordersTop3 = (recoveryPayload.result.sections ?? [])
    .flatMap((section) => {
      const tips = section.tips?.length ? section.tips : section.description ? [section.description] : [];
      return tips.map((tip, index) => ({
        rank: index + 1,
        title: section.title,
        text: tip,
      }));
    })
    .slice(0, Math.max(1, Math.min(5, requestedOrderCount)));

  return {
    focusFactor: null,
    primaryAction: firstSection?.tips?.[0] ?? firstSection?.description ?? null,
    avoidAction:
      recoveryPayload.result.sections
        .flatMap((section) => section.tips ?? [])
        .find((tip) => /(피하|줄이|미루|보류|중단|낮추|avoid|skip|limit|hold|pause|reduce|delay)/i.test(tip)) ?? null,
    nextDuty: recoveryPayload.nextShift ?? null,
    nextDutyDate: null,
    plannerTone: "stable",
    ordersTop3,
  };
}

export function buildExplanationModule(result: AIRecoveryResult, language: Language): AIPlannerExplanationModule {
  return {
    eyebrow: language === "en" ? "AI Recovery" : "AI Recovery",
    title: language === "en" ? "AI Customized Recovery" : "AI 맞춤회복",
    headline: result.headline || (language === "en" ? "Today’s recovery priorities" : "오늘 회복 우선순위"),
    summary: buildExplanationSummary(result, language),
    recovery: result,
  };
}

export function buildFallbackModules(args: {
  language: Language;
  plannerContext: PlannerContext;
  nextDutyLabel: string;
  timelinePreview: PlannerTimelinePreview[];
}): AIRecoveryPlannerModules {
  const { language, plannerContext, nextDutyLabel, timelinePreview } = args;
  const focusLabel = plannerContext.focusFactor?.label ?? (language === "en" ? "Today’s recovery" : "오늘 회복");
  const primaryAction = plannerContext.primaryAction ?? (language === "en" ? "Lock one recovery routine first." : "회복 루틴 하나를 먼저 고정해요.");
  const fallbackOrders = plannerContext.ordersTop3.length
    ? plannerContext.ordersTop3
    : [{ rank: 1, title: focusLabel, text: primaryAction }];

  const orders = fallbackOrders.slice(0, 5).map((item, index) => {
    const timeline = timelinePreview[index] ?? timelinePreview[timelinePreview.length - 1] ?? null;
    const when =
      timeline?.phase ??
      (language === "en"
        ? index === 0
          ? "Now"
          : "Today"
        : index === 0
          ? "지금"
          : "오늘");
    return {
      id: sanitizeChecklistId(item.title || item.text, `order_${index + 1}`),
      title: item.title || (language === "en" ? `Recovery order ${index + 1}` : `회복 오더 ${index + 1}`),
      body: item.text,
      when,
      reason:
        timeline?.text ??
        (language === "en"
          ? "Keep the order small enough to finish today."
          : "오늘 안에 끝낼 수 있을 정도로 작게 실행하세요."),
      chips: timeline ? [timeline.phase] : [],
    };
  });

  return {
    heroTitle: language === "en" ? "AI Customized Recovery" : "AI 맞춤회복",
    heroSummary:
      language === "en"
        ? `Before ${nextDutyLabel}, protect ${focusLabel.toLowerCase()} first and move it into a checklist.`
        : `${nextDutyLabel} 전까지 ${focusLabel}를 먼저 지키고, 그 흐름을 오늘의 오더 체크리스트로 옮깁니다.`,
    orders: {
      eyebrow: "Today Orders",
      title: language === "en" ? "Today Orders" : "오늘의 오더",
      headline:
        language === "en"
          ? "Move the AI recovery plan into a simple checklist."
          : "AI 맞춤회복을 바로 실행할 수 있는 체크리스트로 옮겼어요.",
      summary:
        language === "en"
          ? "Each order is concrete, small enough to finish today, and includes timing context."
          : "각 오더는 오늘 안에 실행 가능한 크기로 만들고, 언제 하면 좋은지도 함께 붙였습니다.",
      items: orders,
    },
  };
}

export function buildPlannerPayloadFromRecoveryPayload(
  recoveryPayload: AIRecoveryPayload | null | undefined,
  requestedOrderCount?: number | null,
  debugTag?: string | null
): AIRecoveryPlannerPayload | null {
  if (!recoveryPayload || recoveryPayload.engine !== "openai" || !recoveryPayload.generatedText?.trim()) {
    return null;
  }

  const normalizedOrderCount = normalizeRequestedOrderCount(requestedOrderCount);
  const plannerContext = derivePlannerContextFromRecoveryPayload(recoveryPayload, normalizedOrderCount);
  const fallbackModules = buildFallbackModules({
    language: recoveryPayload.language,
    plannerContext,
    nextDutyLabel: describeNextDutyLabel(recoveryPayload.nextShift, recoveryPayload.language),
    timelinePreview: buildPlannerTimelinePreview(
      recoveryPayload.todayShift,
      null,
      recoveryPayload.profileSnapshot
        ? {
            chronotype: recoveryPayload.profileSnapshot.chronotype,
            caffeineSensitivity: recoveryPayload.profileSnapshot.caffeineSensitivity,
          }
        : undefined
    ),
  });

  return {
    dateISO: recoveryPayload.dateISO,
    language: recoveryPayload.language,
    phase: recoveryPayload.phase,
    requestedOrderCount: normalizedOrderCount,
    todayShift: recoveryPayload.todayShift,
    nextShift: recoveryPayload.nextShift,
    todayVitalScore: recoveryPayload.todayVitalScore,
    source: recoveryPayload.source,
    engine: "openai",
    model: recoveryPayload.model,
    debug: [recoveryPayload.debug, debugTag].filter(Boolean).join("|") || null,
    generatedText: recoveryPayload.generatedText,
    explanationGeneratedText: recoveryPayload.generatedText,
    plannerContext,
    profileSnapshot: recoveryPayload.profileSnapshot,
    result: {
      ...fallbackModules,
      explanation: buildExplanationModule(recoveryPayload.result, recoveryPayload.language),
    },
  };
}
