import type { AIRecoveryResult } from "@/lib/aiRecovery";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { ProfileSettings } from "@/lib/model";
import type { PlannerContext, PlannerTimelinePreview } from "@/lib/recoveryPlanner";
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

export type AIRecoveryPlannerModules = {
  heroTitle: string;
  heroSummary: string;
  prescription: AIPlannerModule;
  orders: AIPlannerModule;
  timeline: AIPlannerTimelineModule;
};

export type AIRecoveryPlannerResult = AIRecoveryPlannerModules & {
  explanation: AIPlannerExplanationModule;
};

export type AIRecoveryPlannerPayload = {
  dateISO: ISODate;
  language: Language;
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

export function buildExplanationModule(result: AIRecoveryResult, language: Language): AIPlannerExplanationModule {
  return {
    eyebrow: language === "en" ? "AI Recovery Brief" : "AI Recovery Brief",
    title: language === "en" ? "AI Recovery Brief" : "AI 회복 해설",
    headline: result.headline || (language === "en" ? "Today’s recovery priorities" : "오늘 회복 우선순위"),
    summary:
      language === "en"
        ? "AI explains why the planner prioritized these actions and what to adjust first."
        : "회복 플래너가 왜 이런 우선순위를 잡았는지, 무엇을 먼저 조정해야 하는지 AI가 설명합니다.",
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
  const avoidAction = plannerContext.avoidAction ?? (language === "en" ? "Reduce late stimulation." : "늦은 자극을 줄여요.");

  return {
    heroTitle: language === "en" ? "Today Recovery Planner" : "오늘의 회복 플래너",
    heroSummary:
      language === "en"
        ? `Before ${nextDutyLabel}, prioritize ${focusLabel.toLowerCase()} and act on one step right now.`
        : `${nextDutyLabel} 전까지 ${focusLabel}를 우선 회복하고, 지금 할 1개부터 바로 실행하세요.`,
    prescription: {
      eyebrow: "Recovery Strategy",
      title: language === "en" ? "Recovery Strategy" : "회복 처방",
      headline: focusLabel,
      summary:
        language === "en"
          ? "This is the main recovery target the planner wants you to protect before the next shift."
          : "다음 근무 전까지 가장 먼저 지켜야 할 회복 우선순위를 정리했습니다.",
      items: [
        {
          label: language === "en" ? "Goal" : "이번 회복 목표",
          title: focusLabel,
          body:
            language === "en"
              ? "Keep the plan narrow and protect the most fragile recovery factor first."
              : "오늘은 한 번에 많이 바꾸기보다 가장 흔들린 회복 요소를 먼저 안정화하세요.",
        },
        {
          label: language === "en" ? "Action" : "지금 할 1개",
          title: primaryAction,
          body:
            language === "en"
              ? "Do this first before adding more tasks."
              : "추가 계획보다 이 행동을 먼저 실행하는 것이 우선입니다.",
        },
        {
          label: language === "en" ? "Avoid" : "피해야 할 것",
          title: avoidAction,
          body:
            language === "en"
              ? "If this slips, the whole recovery flow gets weaker."
              : "이 포인트가 무너지면 전체 회복 흐름이 같이 흔들릴 수 있어요.",
        },
      ],
    },
    orders: {
      eyebrow: "Today Orders",
      title: language === "en" ? "Today Orders" : "오늘 오더",
      headline: language === "en" ? "Start with the smallest executable actions." : "바로 실행 가능한 작은 행동부터 시작하세요.",
      summary:
        language === "en"
          ? "Short, concrete actions help recovery stick through a busy shift."
          : "짧고 구체적인 행동부터 실행하면 바쁜 근무 중에도 회복 루틴이 더 잘 지켜집니다.",
      items: plannerContext.ordersTop3.map((item) => ({
        label: language === "en" ? `Order ${item.rank}` : `오더 ${item.rank}`,
        title: item.title,
        body: item.text,
      })),
    },
    timeline: {
      eyebrow: "Timeline Forecast",
      title: language === "en" ? "Timeline" : "타임라인",
      headline:
        language === "en"
          ? "Protect recovery in the order your day actually unfolds."
          : "하루가 실제로 흘러가는 순서대로 회복 포인트를 배치했어요.",
      summary:
        language === "en"
          ? "Timing matters as much as the action itself."
          : "무엇을 하느냐만큼 언제 하느냐도 중요합니다.",
      items: timelinePreview.map((item) => ({
        phase: item.phase,
        focus: item.phase,
        body: item.text,
      })),
    },
  };
}
