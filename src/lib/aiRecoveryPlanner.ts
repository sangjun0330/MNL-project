import type { AIRecoveryResult } from "@/lib/aiRecovery";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { ProfileSettings } from "@/lib/model";
import type { PlannerContext, PlannerTimelinePreview } from "@/lib/recoveryPlanner";
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
