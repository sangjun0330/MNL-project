import type { AIRecoveryResult, CompoundAlert, RecoverySection, WeeklySummary } from "@/lib/aiRecovery";
import type { AIRecoveryPlannerModules, AIPlannerChecklistItem, AIPlannerChecklistModule } from "@/lib/aiRecoveryPlanner";
import type { Language } from "@/lib/i18n";
import type { ProfileSettings } from "@/lib/model";
import type { PlannerContext } from "@/lib/recoveryPlanner";
import type { RecoveryPhase } from "@/lib/recoveryPhases";
import type { Shift } from "@/lib/types";
import type { DailyVital } from "@/lib/vitals";
import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";

type RecoveryHistorySummary = {
  totalRecords: number;
  firstRecord: string | null;
  lastRecord: string | null;
  avgVital: number | "-";
  avgSleepHours: number | "-";
  avgStress: number | "-";
  avgCaffeineMg: number | "-";
  avgMood: number | "-";
  nightShiftDays: number;
  offDays: number;
  topWorkTags: Array<{ tag: string; count: number }>;
  recurringSignals: Array<{ label: string; count: number }>;
};

type GenerateOpenAIRecoveryParams = {
  language: Language;
  todayISO: string;
  phase?: RecoveryPhase;
  todayShift: Shift;
  nextShift: Shift | null;
  todayVital: DailyVital | null;
  vitals7: DailyVital[];
  prevWeekVitals: DailyVital[];
  allVitals?: DailyVital[];
  plannerContext?: PlannerContext | null;
  profile?: ProfileSettings | null;
  recoveryThread?: RecoveryThreadReference | null;
};

type RecoveryThreadReference = {
  startRecoveryHeadline?: string | null;
  startFocusLabel?: string | null;
  startPrimaryAction?: string | null;
  startAvoidAction?: string | null;
  totalStartOrderCount?: number;
  completedStartOrderCount?: number;
  completedStartOrders?: Array<{ id: string; title: string }>;
  pendingStartOrders?: Array<{ id: string; title: string }>;
};

export type OpenAIRecoveryOutput = {
  result: AIRecoveryResult;
  generatedText: string;
  engine: "openai";
  model: string | null;
  debug: string | null;
};

type TextAttempt = {
  text: string | null;
  error: string | null;
};

type RecoveryOpenAILogFeature =
  | "recovery_explanation"
  | "recovery_translate"
  | "planner_orders";

const DEFAULT_PLANNER_ORDER_COUNT = 3;

type CategoryMeta = {
  category: RecoverySection["category"];
  titleKo: string;
  titleEn: string;
  hints: string[];
};

const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

const CATEGORY_ORDER: CategoryMeta[] = [
  { category: "sleep", titleKo: "수면", titleEn: "Sleep", hints: ["수면", "sleep", "sleep debt"] },
  { category: "shift", titleKo: "교대근무", titleEn: "Shift", hints: ["교대", "나이트", "근무", "shift", "night"] },
  { category: "caffeine", titleKo: "카페인", titleEn: "Caffeine", hints: ["카페인", "coffee", "caffeine"] },
  { category: "menstrual", titleKo: "생리주기", titleEn: "Menstrual", hints: ["생리", "주기", "period", "pms"] },
  {
    category: "stress",
    titleKo: "스트레스 & 감정",
    titleEn: "Stress & Mood",
    hints: ["스트레스", "감정", "기분", "stress", "mood", "emotion"],
  },
  { category: "activity", titleKo: "신체활동", titleEn: "Activity", hints: ["활동", "운동", "activity", "exercise"] },
];

function clamp(value: number, min: number, max: number) {
  const n = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function roundNumber(value: unknown, digits = 1): number | "-" {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function roundInteger(value: unknown): number | "-" {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return Math.round(n);
}

function normalizeWorkEventTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function summarizeWorkEvents(vitals: DailyVital[]) {
  const tagCount = new Map<string, number>();
  const notes: Array<{ dateISO: string; note: string }> = [];
  let daysWithEvents = 0;

  for (const vital of vitals) {
    const tags = normalizeWorkEventTags(vital.inputs.workEventTags);
    for (const tag of tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
    const note =
      typeof vital.inputs.workEventNote === "string"
        ? vital.inputs.workEventNote.replace(/\s+/g, " ").trim()
        : "";
    if (note) {
      notes.push({
        dateISO: vital.dateISO,
        note: note.slice(0, 180),
      });
    }
    if (tags.length || note) daysWithEvents += 1;
  }

  const topTags = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  return {
    daysWithEvents,
    topTags,
    notes: notes.slice(-7),
  };
}

function averageFromVitals(vitals: DailyVital[], selector: (vital: DailyVital) => number | null | undefined): number | "-" {
  const values = vitals
    .map((vital) => selector(vital))
    .filter((value): value is number => Number.isFinite(value as number));
  if (!values.length) return "-";
  return roundNumber(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
}

function summarizeRecurringSignals(vitals: DailyVital[]) {
  const signals = [
    {
      label: "sleep_debt_high",
      count: vitals.filter((vital) => (vital.engine?.sleepDebtHours ?? 0) >= 3).length,
    },
    {
      label: "stress_high",
      count: vitals.filter((vital) => (vital.inputs.stress ?? -1) >= 2).length,
    },
    {
      label: "caffeine_high",
      count: vitals.filter((vital) => (vital.inputs.caffeineMg ?? 0) >= 200).length,
    },
    {
      label: "mood_low",
      count: vitals.filter((vital) => (vital.inputs.mood ?? vital.emotion?.mood ?? 99) <= 2).length,
    },
    {
      label: "night_shift",
      count: vitals.filter((vital) => vital.shift === "N").length,
    },
  ];

  return signals.filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
}

function buildHistorySummary(vitals: DailyVital[]): RecoveryHistorySummary | null {
  if (!vitals.length) return null;
  const sorted = [...vitals].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const workEvents = summarizeWorkEvents(sorted);

  return {
    totalRecords: sorted.length,
    firstRecord: sorted[0]?.dateISO ?? null,
    lastRecord: sorted[sorted.length - 1]?.dateISO ?? null,
    avgVital: averageFromVitals(sorted, (vital) => Math.min(vital.body.value, vital.mental.ema)),
    avgSleepHours: averageFromVitals(sorted, (vital) => vital.inputs.sleepHours ?? null),
    avgStress: averageFromVitals(sorted, (vital) => vital.inputs.stress ?? null),
    avgCaffeineMg: averageFromVitals(sorted, (vital) => vital.inputs.caffeineMg ?? null),
    avgMood: averageFromVitals(sorted, (vital) => vital.inputs.mood ?? vital.emotion?.mood ?? null),
    nightShiftDays: sorted.filter((vital) => vital.shift === "N").length,
    offDays: sorted.filter((vital) => vital.shift === "OFF" || vital.shift === "VAC").length,
    topWorkTags: workEvents.topTags,
    recurringSignals: summarizeRecurringSignals(sorted),
  };
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.round(clamp(raw, 700, 3500));
}

function resolveStoreResponses() {
  const raw = String(process.env.OPENAI_RECOVERY_STORE ?? "true")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

function normalizeApiKey() {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.OPENAI_API_TOKEN ??
    process.env.OPENAI_SECRET_KEY ??
    "";
  return String(key).trim();
}

function resolveModel() {
  const model = String(process.env.OPENAI_MODEL ?? "gpt-5.4").trim();
  return model || "gpt-5.4";
}

// OPENAI_RECOVERY_BASE_URL → OPENAI_BASE_URL 순서로 폴백
// 프록시/대체 엔드포인트 설정 시 사용 (와이파이 지역 정책 우회 등)
function resolveApiBaseUrl(): string {
  const raw = String(
    process.env.OPENAI_RECOVERY_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    "https://api.openai.com/v1"
  ).trim();
  return normalizeOpenAIResponsesBaseUrl(raw || "https://api.openai.com/v1");
}

// 재시도 가능한 에러 여부 판단
function isRetryableRecoveryError(error: string): boolean {
  const e = String(error ?? "").toLowerCase();
  if (!e) return false;
  // 네트워크 수준 오류 (DNS, 연결 거부 등)
  if (e.startsWith("openai_network_")) return true;
  // 빈 응답
  if (e.includes("openai_empty_text_")) return true;
  // 재시도 가능한 HTTP 상태 코드
  if (/openai_responses_(408|409|425|429|500|502|503|504)/.test(e)) return true;
  // 프록시/방화벽이 HTML 403으로 응답하는 케이스
  if (/openai_responses_403/.test(e) && /(html|forbidden|proxy|firewall|blocked|access denied|cloudflare)/.test(e)) return true;
  return false;
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function buildUserContext(params: GenerateOpenAIRecoveryParams) {
  const { todayISO, language, phase = "start", todayShift, nextShift, todayVital, vitals7, prevWeekVitals, allVitals } = params;
  const includeSameDayDynamicInputs = phase === "after_work";
  const menstrualTrackingEnabled =
    typeof todayVital?.menstrual?.enabled === "boolean"
      ? todayVital.menstrual.enabled
      : (vitals7.find((vital) => typeof vital.menstrual?.enabled === "boolean")?.menstrual?.enabled ??
        prevWeekVitals.find((vital) => typeof vital.menstrual?.enabled === "boolean")?.menstrual?.enabled ??
        false);
  const avg7 = vitals7.length
    ? Math.round(
        vitals7.reduce((sum, vital) => sum + Math.min(vital.body.value, vital.mental.ema), 0) / vitals7.length
      )
    : null;
  const avgPrev = prevWeekVitals.length
    ? Math.round(
        prevWeekVitals.reduce((sum, vital) => sum + Math.min(vital.body.value, vital.mental.ema), 0) /
          prevWeekVitals.length
      )
    : null;
  const eventSummary7 = summarizeWorkEvents(vitals7);
  const historySummary = buildHistorySummary(allVitals ?? []);

  return {
    language,
    dateISO: todayISO,
    phase: {
      id: phase,
      title:
        language === "en"
          ? phase === "after_work"
            ? "After-work recovery update"
            : "Start-of-day recovery"
          : phase === "after_work"
            ? "퇴근 후 회복 업데이트"
            : "오늘 시작 회복",
      purpose:
        language === "en"
          ? phase === "after_work"
            ? "Use today's actual logs and the morning recovery thread to update tonight's recovery."
            : "Use yesterday's records and today's sleep only to set a safe recovery direction for starting the day."
          : phase === "after_work"
            ? "오늘 실제 기록과 아침 회복 흐름을 이어 받아 오늘 밤 회복을 업데이트합니다."
            : "전날 기록과 오늘 수면만 기준으로 하루 시작 회복 방향을 정합니다.",
      todayInputPolicy:
        language === "en"
          ? phase === "after_work"
            ? "Today's actual dynamic inputs may be included."
            : "Only today's sleep is included. Same-day stress, caffeine, activity, mood, and work-event inputs are intentionally excluded."
          : phase === "after_work"
            ? "오늘 실제 입력이 함께 반영됩니다."
            : "오늘은 수면만 포함하고, 같은 날 스트레스·카페인·활동·기분·근무메모는 의도적으로 제외했습니다.",
    },
    menstrualTrackingEnabled,
    shift: {
      today: todayShift,
      next: nextShift,
    },
    today: todayVital
      ? {
          sleepHours: roundNumber(todayVital.inputs.sleepHours, 1),
          napHours: roundNumber(todayVital.inputs.napHours, 1),
          symptomSeverity: roundInteger(todayVital.inputs.symptomSeverity),
          menstrualLabel: todayVital.menstrual?.label ?? "-",
          menstrualTracking: Boolean(todayVital.menstrual?.enabled),
          sleepDebtHours: roundNumber(todayVital.engine?.sleepDebtHours, 1),
          nightStreak: roundInteger(todayVital.engine?.nightStreak),
          ...(includeSameDayDynamicInputs
            ? {
                vitalScore: roundInteger(Math.min(todayVital.body.value, todayVital.mental.ema)),
                body: roundInteger(todayVital.body.value),
                mental: roundInteger(todayVital.mental.ema),
                stress: roundInteger(todayVital.inputs.stress),
                activity: roundInteger(todayVital.inputs.activity),
                mood: roundInteger(todayVital.inputs.mood ?? todayVital.emotion?.mood),
                caffeineMg: roundInteger(todayVital.inputs.caffeineMg),
                workEventTags: normalizeWorkEventTags(todayVital.inputs.workEventTags),
                workEventNote:
                  typeof todayVital.inputs.workEventNote === "string"
                    ? todayVital.inputs.workEventNote.replace(/\s+/g, " ").trim().slice(0, 180)
                    : "-",
                note: typeof todayVital.note === "string" ? todayVital.note.replace(/\s+/g, " ").trim().slice(0, 180) : "-",
                csi: roundNumber(todayVital.engine?.CSI, 2),
                sri: roundNumber(todayVital.engine?.SRI, 2),
                cif: roundNumber(todayVital.engine?.CIF, 2),
                slf: roundNumber(todayVital.engine?.SLF, 2),
                mif: roundNumber(todayVital.engine?.MIF, 2),
              }
            : {}),
        }
      : null,
    weekly: {
      avgVital7: avg7,
      avgVitalPrev7: avgPrev,
      recordsIn7Days: vitals7.length,
      workEvents: eventSummary7,
      recentVitals7: vitals7.map((vital) => {
        const isCurrentDayStartRow = phase === "start" && vital.dateISO === todayISO;
        return {
          dateISO: vital.dateISO,
          shift: vital.shift,
          sleepHours: roundNumber(vital.inputs.sleepHours, 1),
          napHours: roundNumber(vital.inputs.napHours, 1),
          symptomSeverity: roundInteger(vital.inputs.symptomSeverity),
          ...(isCurrentDayStartRow
            ? {}
            : {
                stress: roundInteger(vital.inputs.stress),
                activity: roundInteger(vital.inputs.activity),
                mood: roundInteger(vital.inputs.mood ?? vital.emotion?.mood),
                caffeineMg: roundInteger(vital.inputs.caffeineMg),
                workEventTags: normalizeWorkEventTags(vital.inputs.workEventTags),
                workEventNote:
                  typeof vital.inputs.workEventNote === "string"
                    ? vital.inputs.workEventNote.replace(/\s+/g, " ").trim().slice(0, 160)
                    : "-",
                note: typeof vital.note === "string" ? vital.note.replace(/\s+/g, " ").trim().slice(0, 160) : "-",
              }),
        };
      }),
    },
    profile: {
      chronotype: roundNumber(params.profile?.chronotype ?? 0.5, 2),
      caffeineSensitivity: roundNumber(params.profile?.caffeineSensitivity ?? 1, 2),
    },
    plannerContext: params.plannerContext ?? null,
    history: historySummary,
    recoveryThread:
      params.recoveryThread
        ? {
            startRecoveryHeadline: params.recoveryThread.startRecoveryHeadline ?? null,
            startFocusLabel: params.recoveryThread.startFocusLabel ?? null,
            startPrimaryAction: params.recoveryThread.startPrimaryAction ?? null,
            startAvoidAction: params.recoveryThread.startAvoidAction ?? null,
            totalStartOrderCount: params.recoveryThread.totalStartOrderCount ?? 0,
            completedStartOrderCount: params.recoveryThread.completedStartOrderCount ?? 0,
            completedStartOrders: params.recoveryThread.completedStartOrders ?? [],
            pendingStartOrders: params.recoveryThread.pendingStartOrders ?? [],
          }
        : null,
  };
}

function buildDeveloperPrompt(language: Language, phase: RecoveryPhase = "start") {
  if (language === "ko") {
    return phase === "after_work"
      ? "너는 교대근무 간호사를 위한 프리미엄 AI 퇴근 후 회복 해설 엔진이야. 아침 회복 흐름과 오더 진행을 반드시 이어 받아, 오늘 실제 기록을 반영해 오늘 밤 회복과 다음날 보호 방향만 정교하게 업데이트한다. 새 계획을 처음부터 다시 만들지 말고, 아침 기준을 보정하는 설명이어야 한다. 출력은 반드시 JSON 하나만 반환한다. 전문적이고 신뢰 가능한 회복 코칭 톤을 유지하되, 문장은 짧고 정확하며 바로 실행 장면이 떠오르게 써라. generic한 문장, 반복 문장, 빈약한 요약, '꾸준한 관리가 중요합니다'처럼 힘 빠진 마무리, 같은 내용의 재진술을 금지한다. 각 section은 정말 중요한 카테고리만 고르고, description은 왜 지금 중요한지 한 문장, tips는 서로 겹치지 않는 실행 행동 2개만 작성한다. plannerContext와 recoveryThread에 반드시 정렬하고, 내부 시스템 용어(planner, plannerContext, recoveryThread, focusFactor, primaryAction 등)와 데이터 필드명(napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity 등)은 절대 사용자 문구에 노출하지 마라. ISO 날짜(2026-03-13 등)를 괄호 안에 넣거나 본문에 직접 쓰지 말고, '오늘', '내일', '모레', '다음 근무일' 같은 자연어로만 표현하라."
      : "너는 교대근무 간호사를 위한 프리미엄 AI 시작 회복 해설 엔진이야. 전날 기록과 오늘 수면만 기준으로 오늘 하루를 어떻게 시작해야 하는지 정교하게 설명한다. 같은 날 스트레스·카페인·활동·기분·근무메모는 시작 회복 입력에서 제외된 항목이므로, 오늘 상태를 추정하거나 단정하지 말고 그 미입력 사실을 설명의 중심으로 끌어오지도 마라. 출력은 반드시 JSON 하나만 반환한다. 전문적이고 신뢰 가능한 회복 코칭 톤을 유지하되, 문장은 짧고 정확하며 바로 실행 장면이 떠오르게 써라. generic한 문장, 반복 문장, 빈약한 요약, '꾸준한 관리가 중요합니다'처럼 힘 빠진 마무리, 같은 내용의 재진술을 금지한다. 각 section은 정말 중요한 카테고리만 고르고, description은 왜 지금 중요한지 한 문장, tips는 서로 겹치지 않는 실행 행동 2개만 작성한다. plannerContext가 이미 정한 우선순위와 충돌하는 새 계획을 만들지 말고, 내부 시스템 용어(planner, plannerContext, recoveryThread, focusFactor, primaryAction 등)와 데이터 필드명(napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity 등)은 절대 사용자 문구에 노출하지 마라. ISO 날짜(2026-03-13 등)를 괄호 안에 넣거나 본문에 직접 쓰지 말고, '오늘', '내일', '모레', '다음 근무일' 같은 자연어로만 표현하라.";
  }
  return phase === "after_work"
    ? "You are a premium after-work recovery explanation engine for shift-working nurses. Continue the morning recovery thread instead of restarting it, then update only tonight's recovery and protection for tomorrow using today's actual logs. Return exactly one JSON object. Keep the tone clinically grounded, precise, and human. Ban generic filler, repeated sentences, weak summaries, and vague wording such as 'consistency matters' unless a specific action follows. Each section must be high-signal only: one why-now sentence plus exactly two distinct actionable tips. Stay tightly aligned with plannerContext and recoveryThread, and never expose internal system terms (planner, plannerContext, recoveryThread, focusFactor, primaryAction, etc.) or data field names (napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity, etc.) in user-facing text. Never put ISO dates (e.g. 2026-03-13) in parentheses or inline — use natural language like 'today', 'tomorrow', 'the next shift day' instead."
    : "You are a premium start-of-day recovery explanation engine for shift-working nurses. Use yesterday's records and today's sleep only to explain how the day should start. Same-day stress, caffeine, activity, mood, and work-event inputs are intentionally excluded in this phase, so do not infer them, do not describe them as today's state, and do not make their absence a main talking point. Return exactly one JSON object. Keep the tone clinically grounded, precise, and human. Ban generic filler, repeated sentences, weak summaries, and vague wording such as 'consistency matters' unless a specific action follows. Each section must be high-signal only: one why-now sentence plus exactly two distinct actionable tips. Stay aligned with plannerContext and do not invent a conflicting plan. Never expose internal system terms (planner, plannerContext, recoveryThread, focusFactor, primaryAction, etc.) or data field names (napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity, etc.) in user-facing text. Never put ISO dates (e.g. 2026-03-13) in parentheses or inline — use natural language like 'today', 'tomorrow', 'the next shift day' instead.";
}

function buildUserPrompt(language: Language, context: ReturnType<typeof buildUserContext>, phase: RecoveryPhase = "start") {
  if (language === "ko") {
    const shape = {
      headline: "string",
      compoundAlert: {
        factors: ["string"],
        message: "string",
      },
      sections: [
        {
          category: "sleep|shift|caffeine|menstrual|stress|activity",
          severity: "info|caution|warning",
          title: "string",
          description: "string",
          tips: ["string", "string"],
        },
      ],
      weeklySummary: {
        avgBattery: "number",
        prevAvgBattery: "number",
        topDrains: [{ label: "string", pct: "number" }],
        personalInsight: "string",
        nextWeekPreview: "string",
      },
    };
    return [
      "사용자의 기록과 계산된 회복 지표를 바탕으로 AI 맞춤회복 JSON을 작성하세요.",
      "반드시 JSON 하나만 출력하세요. 코드펜스, 설명문, 마크다운 금지.",
      "- plannerContext가 있으면 그 우선순위와 반드시 정렬하세요.",
      "- plannerContext.focusFactor 또는 plannerContext.primaryAction과 충돌하는 새 계획을 만들지 마세요.",
      phase === "after_work"
        ? "- 지금은 퇴근 후 회복 업데이트 단계입니다. 아침 회복 흐름과 오더 진행을 반드시 이어 받아, 오늘 밤 회복과 다음날 보호 중심으로 업데이트하세요."
        : "- 지금은 오늘 시작 회복 단계입니다. 오늘 수면을 제외한 같은 날 동적 입력은 분석 입력에서 제외됐으므로, 오늘 상태를 추정하지도 말고 그 미입력 사실 자체를 설명의 중심으로 끌어오지도 마세요.",
      "",
      "[핵심 목표]",
      phase === "after_work"
        ? "- headline은 오늘 밤 회복에서 가장 중요한 축을 1~2문장으로 정리"
        : "- headline은 오늘 시작에서 가장 중요한 축을 1~2문장으로 정리",
      "- headline에는 가능하면 focusFactor 또는 primaryAction의 맥락을 자연스럽게 녹일 것",
      "- sections는 정말 중요한 카테고리만 2~4개 선택",
      "- 각 section.description은 왜 이 카테고리가 지금 중요한지 실제 데이터 2가지 이상에 기대어 1문장으로 설명",
      "- 각 section.tips는 정확히 2개, 서로 겹치지 않는 실행 행동으로 작성",
      "- tips는 추상 조언이 아니라 시작 타이밍/장소/시간/방법 중 최소 2개가 보이게 작성",
      "- description과 tips는 같은 문장을 반복하지 말 것",
      "",
      "[품질 기준]",
      "- '꾸준한 관리가 중요합니다', '신경 쓰세요', '활용해보세요' 같은 generic 마무리 금지",
      "- 같은 의미를 문장만 바꿔 반복 금지",
      "- 카테고리 title은 맥락이 보이는 짧은 제목으로 작성",
      "- 수치(수면, 카페인, 활동, 기분, 스트레스)는 Data JSON에 있는 값만 사용하고 임의 수치 금지",
      "- 숫자 태그형 표현 금지. 예: 스트레스(2), 기분4 금지",
      "- 데이터 필드명을 괄호에 넣어 노출 금지. 예: 낮잠이 있었던 날이라(napHours), 기분과 스트레스가(mood, stress), 다음 근무가 D(next), 오늘은 OFF이며(today) → 이런 괄호 주석 절대 금지",
      "- ISO 날짜(2026-03-13 등)를 본문/괄호에 직접 쓰지 말고 '오늘', '내일', '다음 근무일' 같은 자연어만 사용",
      "- 카페인 수치는 필요할 때만 자연어로 한 번만 설명",
      phase === "after_work"
        ? "- recoveryThread가 있으면 아침 headline, 완료/미완료 오더와 연결된 문맥이 section 또는 headline에 드러나야 함"
        : "- 시작 회복 단계에서는 같은 날 스트레스/카페인/활동/기분을 오늘 상태처럼 말하지 말 것",
      "",
      "[JSON 규칙]",
      "- compoundAlert는 위험 요소 2개 이상이 동시에 뚜렷할 때만 작성, 아니면 null",
      `- sections.category 값은 sleep, shift, caffeine, ${context.menstrualTrackingEnabled ? "menstrual, " : ""}stress, activity 중에서만 선택`,
      `- menstrualTrackingEnabled가 ${context.menstrualTrackingEnabled ? "true" : "false"}이므로 생리주기 섹션 포함 여부를 이에 맞출 것`,
      "- sections는 우선순위가 높은 순서대로 배열",
      "- weeklySummary.personalInsight와 weeklySummary.nextWeekPreview는 서로 다른 내용으로 작성",
      "- weeklySummary.topDrains는 0~3개",
      "",
      "[JSON shape]",
      JSON.stringify(shape, null, 2),
      "",
      "[데이터(JSON)]",
      JSON.stringify(context, null, 2),
    ].join("\n");
  }

  return [
    "Create a premium AI recovery JSON from the user's Supabase-backed records and computed trends.",
    "Return JSON only. No markdown, no code fences, no commentary.",
    "If plannerContext exists, stay aligned with it. Do not invent a conflicting plan.",
    phase === "after_work"
      ? "This is the after-work recovery update. Continue the morning recovery thread and adjust tonight's recovery with today's actual logs."
      : "This is the start-of-day recovery. Same-day stress, caffeine, activity, mood, and work-event inputs are intentionally excluded here, so do not infer them or talk about them as observed today.",
    "headline must summarize today's highest-priority recovery direction in 1-2 sentences.",
    "sections must include only the most decision-useful categories, ideally 2 to 4.",
    "Each section.description must explain why the category matters now in exactly one strong sentence grounded in real data.",
    "Each section.tips must contain exactly two distinct actions. They must not repeat the description in different words.",
    "Ban generic filler such as 'consistency matters', 'pay attention', or 'keep managing it' unless a concrete action immediately follows.",
    "Use specific, professional, easy-to-execute guidance that fits a shift-working nurse.",
    "When workEventTags/workEventNote/note exist in Data JSON, reflect those shift events in prioritization.",
    phase === "after_work"
      ? "If recoveryThread exists, carry the morning recovery headline and order progress into the evening update."
      : "Do not describe excluded same-day inputs as if they were observed today.",
    "compoundAlert must be null unless there are at least two simultaneous meaningful risks.",
    `menstrualTrackingEnabled is ${context.menstrualTrackingEnabled ? "true" : "false"}; follow that strictly.`,
    "weeklySummary.personalInsight and weeklySummary.nextWeekPreview must not repeat the same message.",
    "Do not expose internal system words (planner, plannerContext, recoveryThread, focusFactor, primaryAction) or data field names (napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity) in parentheses or inline text.",
    "Never put ISO dates (e.g. 2026-03-13) in parentheses or body text — use natural language like 'today', 'tomorrow', 'the next shift day' instead.",
    "",
    "[JSON shape]",
    JSON.stringify(
      {
        headline: "string",
        compoundAlert: { factors: ["string"], message: "string" },
        sections: [
          {
            category: "sleep|shift|caffeine|menstrual|stress|activity",
            severity: "info|caution|warning",
            title: "string",
            description: "string",
            tips: ["string", "string"],
          },
        ],
        weeklySummary: {
          avgBattery: "number",
          prevAvgBattery: "number",
          topDrains: [{ label: "string", pct: "number" }],
          personalInsight: "string",
          nextWeekPreview: "string",
        },
      },
      null,
      2
    ),
    "",
    "[Data JSON]",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function extractResponsesText(json: any): string {
  const direct = json?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (Array.isArray(direct)) {
    const joined = direct
      .map((item) => (typeof item === "string" ? item : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  const output = Array.isArray(json?.output) ? json.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (typeof item?.text === "string" && item.text.trim()) {
      chunks.push(item.text.trim());
    }
    if (item?.json && typeof item.json === "object") {
      chunks.push(JSON.stringify(item.json));
    }
    if (item?.parsed && typeof item.parsed === "object") {
      chunks.push(JSON.stringify(item.parsed));
    }
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = typeof part?.text === "string" ? part.text : "";
      if (text) chunks.push(text);
      if (part?.json && typeof part.json === "object") {
        chunks.push(JSON.stringify(part.json));
      }
      if (part?.parsed && typeof part.parsed === "object") {
        chunks.push(JSON.stringify(part.parsed));
      }
    }
  }
  return chunks.join("").trim();
}

async function callResponsesApi(args: {
  apiKey: string;
  model: string;
  developerPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
  maxOutputTokens: number;
  logFeature: RecoveryOpenAILogFeature;
  language: Language;
  dateISO: string;
  phase?: RecoveryPhase;
}): Promise<TextAttempt> {
  const { apiKey, model, developerPrompt, userPrompt, signal, maxOutputTokens, logFeature, language, dateISO, phase = "start" } = args;
  const storeResponses = resolveStoreResponses();
  const reasoningEffort = "low";
  const verbosity = logFeature === "recovery_translate" ? "low" : "medium";
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: resolveApiBaseUrl(),
    apiKey,
    model,
    scope: "recovery",
  });
  if (requestConfig.missingCredential) {
    return {
      text: null,
      error: requestConfig.missingCredential,
    };
  }

  const payload = {
    model: requestConfig.model,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: developerPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    text: {
      format: { type: "text" },
      verbosity,
    },
    reasoning: {
      effort: reasoningEffort,
    },
    max_output_tokens: maxOutputTokens,
    tools: [],
    store: storeResponses,
    metadata: {
      app: "rnest",
      surface: "insights_recovery",
      feature: logFeature,
      language,
      date_iso: dateISO,
      phase,
    },
  };

  // 네트워크 수준 오류(DNS 실패, 연결 거부, 타임아웃 등)를 catch해 에러 문자열로 반환
  let response: Response;
  try {
    response = await fetch(requestConfig.requestUrl, {
      method: "POST",
      headers: requestConfig.headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (cause: any) {
    // AbortError는 상위에서 처리하므로 그대로 throw
    if (cause?.name === "AbortError") throw cause;
    return {
      text: null,
      error: `openai_network_${truncateError(String(cause?.message ?? cause ?? "fetch_failed"))}`,
    };
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      text: null,
      error: `openai_responses_${response.status}_model:${requestConfig.model}_${truncateError(raw || "unknown_error")}`,
    };
  }

  const json = await response.json().catch(() => null);
  const text = extractResponsesText(json);
  if (!text) {
    const status = typeof json?.status === "string" ? json.status : "unknown";
    const incompleteReason =
      typeof json?.incomplete_details?.reason === "string" ? json.incomplete_details.reason : "none";
    return {
      text: null,
      error: `openai_empty_text_model:${requestConfig.model}_status:${status}_incomplete:${incompleteReason}`,
    };
  }

  return { text, error: null };
}

function cleanLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripHeadingPrefix(line: string) {
  return line
    .replace(/^\[(?:A|B|C|D)\]\s*/i, "")
    .replace(/^(?:A|B|C|D)\s*[).:\-]\s*/i, "")
    .replace(/^\d\s*[).:\-]\s*/, "")
    .trim();
}

function findSectionStart(text: string, label: "A" | "B" | "C" | "D") {
  const patterns = [new RegExp(`(?:^|\\n)\\s*\\[${label}\\]`, "i"), new RegExp(`(?:^|\\n)\\s*${label}\\s*[).:\\-]`, "i")];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match.index + (match[0].startsWith("\n") ? 1 : 0);
  }
  return -1;
}

function extractSection(text: string, label: "A" | "B" | "C" | "D") {
  const start = findSectionStart(text, label);
  if (start < 0) return "";

  const ends = (["A", "B", "C", "D"] as const)
    .filter((v) => v !== label)
    .map((v) => findSectionStart(text.slice(start + 1), v))
    .filter((idx) => idx >= 0)
    .map((idx) => idx + start + 1);

  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).trim();
}

function parseCategoryFromLabel(label: string): CategoryMeta | null {
  const normalized = label.toLowerCase();
  for (const meta of CATEGORY_ORDER) {
    if (meta.hints.some((hint) => normalized.includes(hint.toLowerCase()))) {
      return meta;
    }
  }
  return null;
}

function parseSeverity(text: string): RecoverySection["severity"] {
  const n = text.toLowerCase();
  if (
    n.includes("위험") ||
    n.includes("경고") ||
    n.includes("주의가 필요") ||
    n.includes("urgent") ||
    n.includes("warning") ||
    n.includes("critical")
  ) {
    return "warning";
  }
  if (n.includes("주의") || n.includes("부담") || n.includes("caution")) return "caution";
  return "info";
}

function parseCategoryBlocks(cBlock: string, language: Language): RecoverySection[] {
  const normalizedBlock = cBlock
    .replace(/([^\n])\s+(?=(?:\d+\s*[).:\-]\s*)?\[[^\]]+\])/g, "$1\n")
    .replace(/\s*\/\s*/g, "\n");
  const lines = cleanLines(normalizedBlock);
  const sections: RecoverySection[] = [];

  type Builder = {
    meta: CategoryMeta;
    description: string[];
    tips: string[];
  };

  let current: Builder | null = null;

  const pushDescription = (raw: string) => {
    if (!current) return;
    const value = stripHeadingPrefix(raw).replace(/^상태\s*[:：]\s*/i, "").replace(/^status\s*[:：]\s*/i, "").trim();
    if (!value) return;
    current.description.push(value);
  };

  const pushTip = (raw: string) => {
    if (!current) return;
    const value = raw
      .replace(/^(?:추천|권장|recommendation|action)\s*\d*\s*[:：]\s*/i, "")
      .replace(/^(?:[-*•·]|\d+[).])\s*/, "")
      .trim();
    if (!value) return;
    current.tips.push(value);
  };

  const flush = () => {
    if (!current) return;
    const descriptionText = current.description.join(" ").trim();
    const dedupedTips: string[] = [];
    const seenTips = new Set<string>();
    for (const tip of current.tips) {
      const clean = tip.replace(/\s+/g, " ").trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seenTips.has(key)) continue;
      seenTips.add(key);
      dedupedTips.push(clean);
    }
    const finalTips = dedupedTips.slice(0, 3);
    const title = language === "ko" ? current.meta.titleKo : current.meta.titleEn;
    if (descriptionText || finalTips.length) {
      sections.push({
        category: current.meta.category,
        severity: parseSeverity(`${title} ${descriptionText} ${finalTips.join(" ")}`),
        title,
        description: descriptionText || (language === "ko" ? "오늘 컨디션에 맞춘 보정 조언입니다." : "Adjusted guidance for today."),
        tips: finalTips,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const inlineHeading = line.match(/^(?:\d+\s*[).:\-]\s*)?\[(.+?)\]\s*(.*)$/);
    if (inlineHeading) {
      const meta = parseCategoryFromLabel(inlineHeading[1]);
      if (meta) {
        flush();
        current = { meta, description: [], tips: [] };
        const trailing = inlineHeading[2]?.trim();
        if (trailing) {
          if (/^(?:추천|권장|recommendation|action)\s*\d*\s*[:：]/i.test(trailing)) pushTip(trailing);
          else pushDescription(trailing);
        }
      }
      continue;
    }

    const numberedHeading = line.match(/^\d+\s*[).:\-]\s*(.+)$/);
    if (numberedHeading) {
      const maybeHeading = numberedHeading[1].trim();
      const meta = parseCategoryFromLabel(maybeHeading);
      if (meta) {
        flush();
        current = { meta, description: [], tips: [] };
        const trailing = maybeHeading.replace(/^상태\s*[:：]\s*/i, "").trim();
        if (trailing && trailing.length <= 28 && !/[.!?]/.test(trailing)) {
          // short heading text only; keep as heading and do not store description.
        } else if (trailing) {
          pushDescription(trailing);
        }
      }
      continue;
    }

    const plainCandidate = line
      .replace(/^[\d.\-•·\s]+/, "")
      .replace(/[()[\]]/g, "")
      .trim();
    const plainMeta = parseCategoryFromLabel(plainCandidate);
    const shortHeading = plainCandidate.length > 0 && plainCandidate.length <= 16 && !/[.!?]/.test(plainCandidate);
    if (plainMeta && shortHeading) {
      flush();
      current = { meta: plainMeta, description: [], tips: [] };
      continue;
    }

    if (!current) {
      continue;
    }

    const actionLikeTip = line.match(/^(?:추천|권장|recommendation|action)\s*\d*\s*[:：]\s*(.+)$/i);
    if (actionLikeTip) {
      pushTip(actionLikeTip[1]);
      continue;
    }

    const tipMatch = line.match(/^(?:[-*•·]|\d+[).])\s*(.+)$/);
    if (tipMatch) {
      pushTip(tipMatch[1]);
      continue;
    }

    const statusMatch = line.match(/^(?:상태|status)\s*[:：]\s*(.+)$/i);
    if (statusMatch) {
      pushDescription(statusMatch[1]);
      continue;
    }

    const plain = stripHeadingPrefix(line);
    if (plain && !/^\[C\]/i.test(plain)) {
      if (current.description.length === 0) pushDescription(plain);
      else pushTip(plain);
    }
  }

  flush();

  if (sections.length) return sections;

  const fallbackLines = lines.filter((line) => !/^\[(?:C|D)\]/i.test(line));
  if (!fallbackLines.length) return [];

  return [
    {
      category: "sleep",
      severity: parseSeverity(fallbackLines.join(" ")),
      title: language === "ko" ? "오늘의 회복 추천" : "Recovery Recommendations",
      description: fallbackLines.slice(0, 2).map(stripHeadingPrefix).join(" ").trim() || (language === "ko" ? "맞춤 추천을 확인하세요." : "Check your tailored recommendations."),
      tips: fallbackLines
        .slice(2)
        .map((line) => line.replace(/^(?:[-*•·]|\d+\.)\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 3),
    },
  ];
}

function parseCompoundAlertFromText(bBlock: string): CompoundAlert | null {
  const lines = cleanLines(bBlock)
    .map(stripHeadingPrefix)
    .filter((line) => !/^긴급\s*알림/i.test(line) && !/^urgent/i.test(line));

  if (!lines.length) return null;
  if (lines.some((line) => /^없음$/i.test(line) || /^none$/i.test(line))) return null;

  const factors: string[] = [];
  const factorRegex = /\[([^\]]+)\]/g;
  const joined = lines.join(" ");
  let m: RegExpExecArray | null = null;
  while ((m = factorRegex.exec(joined)) !== null) {
    const tag = m[1].trim();
    if (tag && !factors.includes(tag)) factors.push(tag);
  }

  const message = joined.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  if (!message) return null;
  return {
    factors: factors.slice(0, 5),
    message,
  };
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9가-힣\s]/gi, "").trim();
}

function formatSignedDelta(value: number) {
  if (!Number.isFinite(value)) return "±0";
  if (value === 0) return "±0";
  return value > 0 ? `+${value}` : `${value}`;
}

function looksIncompleteNarrativeText(value: string) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/[.!?]$/.test(text)) return false;
  if (/(요|다|니다|세요|해요|돼요|이에요|예요)$/.test(text)) return false;
  if (/(는|은|이|가|을|를|와|과|도|만|에|에서|에게|로|으로|보다|및|또는|혹은|기준|대비|중심|수준|범위|전후|전후로|때문|위해)$/.test(text)) {
    return true;
  }
  return text.length >= 12;
}

function extractLabeledBlock(text: string, startPattern: RegExp, endPatterns: RegExp[]) {
  const startIndex = text.search(startPattern);
  if (startIndex < 0) return "";
  const sliced = text.slice(startIndex);
  const startMatch = sliced.match(startPattern);
  if (!startMatch) return "";
  const from = startIndex + startMatch[0].length;

  let end = text.length;
  for (const endPattern of endPatterns) {
    const idx = text.slice(from).search(endPattern);
    if (idx >= 0) end = Math.min(end, from + idx);
  }
  return text.slice(from, end).trim();
}

function splitWeeklyItems(raw: string): string[] {
  const source = raw
    .replace(/\r/g, "\n")
    .replace(/\s*\/\s*/g, "\n")
    .replace(/\s*•\s*/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!source) return [];

  const numbered = Array.from(
    source.matchAll(/(?:^|\n)\s*\d+\s*[).:\-]\s*([\s\S]*?)(?=(?:\n\s*\d+\s*[).:\-]\s*)|$)/g)
  )
    .map((match) =>
      match[1]
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  if (numbered.length) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const line of numbered) {
      const key = normalizeComparableText(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(line);
    }
    return deduped;
  }

  const rawLines = source
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const lines: string[] = [];
  for (const line of rawLines) {
    const cleaned = line.replace(/^(?:[-*•·]|\d+[).:\-])\s*/, "").trim();
    if (!cleaned) continue;

    const lastIndex = lines.length - 1;
    const shouldAppend =
      lastIndex >= 0 &&
      !/^(?:개인\s*패턴|personal\s*pattern|다음\s*주\s*예측|next\s*week\s*preview|이번\s*주\s*요약|weekly\s*summary)\s*[:：]?$/i.test(
        cleaned
      ) &&
      !/[.!?]$/.test(lines[lastIndex]);

    if (shouldAppend) {
      lines[lastIndex] = `${lines[lastIndex]} ${cleaned}`.replace(/\s+/g, " ").trim();
      continue;
    }
    lines.push(cleaned);
  }

  const expanded =
    lines.length <= 1
      ? lines
          .join(" ")
          .split(/(?<=[.!?]|다\.|요\.)\s+/)
          .map((line) => line.trim())
          .filter(Boolean)
      : lines;

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of expanded) {
    const key = normalizeComparableText(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }
  return deduped;
}

function hasIncompleteWeeklyItems(raw: string) {
  return splitWeeklyItems(raw).some((line) => looksIncompleteNarrativeText(line));
}

function parseWeeklySummaryFromText(dBlock: string): WeeklySummary | null {
  const normalized = dBlock
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .trim();

  const lines = cleanLines(normalized)
    .map(stripHeadingPrefix)
    .filter((line) => !/^이번\s*주\s*AI\s*한마디/i.test(line) && !/^weekly/i.test(line));

  if (!lines.length) return null;

  const joined = lines.join(" ");
  const avgMatch = joined.match(/(?:평균\s*배터리|average\s*battery)\D*(\d{1,3})/i);
  const deltaMatch = joined.match(/(?:지난주\D*|vs\s*last\s*week\D*)([-+]?\d{1,3})/i);
  const avgBattery = avgMatch ? clamp(Number(avgMatch[1]), 0, 100) : 0;
  const delta = Number(deltaMatch?.[1] ?? 0);
  const prevAvgBattery = clamp(avgBattery - delta, 0, 100);

  const drainMatches = [...joined.matchAll(/([가-힣A-Za-z\s&]+?)\s*(\d{1,3})%/g)];
  const topDrains = drainMatches
    .map((hit) => ({ label: hit[1].trim(), pct: clamp(Number(hit[2]), 0, 100) }))
    .filter((v) => v.label)
    .slice(0, 3);

  const personalBlock = extractLabeledBlock(
    normalized,
    /(?:개인\s*패턴|personal\s*pattern)\s*[:：]?\s*/i,
    [/(?:다음\s*주\s*예측|next\s*week\s*preview)\s*[:：]?\s*/i]
  );
  const nextBlock = extractLabeledBlock(normalized, /(?:다음\s*주\s*예측|next\s*week\s*preview)\s*[:：]?\s*/i, []);

  let personalLines = splitWeeklyItems(personalBlock);
  let nextLines = splitWeeklyItems(nextBlock);

  if (!personalLines.length || !nextLines.length) {
    const narrative = lines.filter(
      (line) =>
        !/^(?:이번\s*주\s*요약|weekly\s*summary|개인\s*패턴|personal\s*pattern|다음\s*주\s*예측|next\s*week\s*preview)\s*[:：]?$/i.test(
          line
        ) && !/^(?:평균\s*배터리|average\s*battery)/i.test(line)
    );
    const half = Math.ceil(narrative.length / 2);
    if (!personalLines.length) {
      personalLines = narrative.slice(0, Math.max(half, 1));
    }
    if (!nextLines.length) {
      nextLines = narrative.slice(half);
    }
    if (!nextLines.length && narrative.length) {
      nextLines = narrative.slice(-Math.min(4, narrative.length));
    }
  }

  let personalInsight = personalLines.join("\n").trim();
  let nextWeekPreview = nextLines.join("\n").trim();
  if (
    personalInsight &&
    nextWeekPreview &&
    normalizeComparableText(personalInsight) === normalizeComparableText(nextWeekPreview)
  ) {
    nextWeekPreview = "";
  }

  if (!personalInsight && !nextWeekPreview) return null;

  return {
    avgBattery: Math.round(avgBattery),
    prevAvgBattery: Math.round(prevAvgBattery),
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

function parseHeadlineFromText(aBlock: string, wholeText: string): string {
  const candidateLines = cleanLines(aBlock)
    .map(stripHeadingPrefix)
    .filter((line) => !/^한줄\s*요약/i.test(line) && !/^one-line\s*summary/i.test(line));
  if (candidateLines.length) {
    return candidateLines[0].replace(/^"|"$/g, "").trim();
  }

  const wholeLines = cleanLines(wholeText)
    .map(stripHeadingPrefix)
    .filter((line) => !/^\[[A-D]\]/i.test(line));
  return wholeLines[0] ?? "오늘은 회복 우선순위를 같이 점검해 볼게요.";
}

export function parseResultFromGeneratedText(text: string, language: Language): AIRecoveryResult {
  const aBlock = extractSection(text, "A");
  const bBlock = extractSection(text, "B");
  const cBlock = extractSection(text, "C");
  const dBlock = extractSection(text, "D");

  return {
    headline: parseHeadlineFromText(aBlock, text),
    compoundAlert: parseCompoundAlertFromText(bBlock),
    sections: parseCategoryBlocks(cBlock, language),
    weeklySummary: parseWeeklySummaryFromText(dBlock),
  };
}

function roundToInt(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, 100));
}

function avgVitalScore(vitals: DailyVital[]) {
  if (!vitals.length) return null;
  const sum = vitals.reduce((acc, vital) => acc + Math.min(vital.body.value, vital.mental.ema), 0);
  return sum / vitals.length;
}

function buildFallbackWeeklySummary(params: GenerateOpenAIRecoveryParams): WeeklySummary | null {
  const avg7Raw = avgVitalScore(params.vitals7);
  if (avg7Raw == null) return null;
  const prevRaw = avgVitalScore(params.prevWeekVitals);
  const avgBattery = roundToInt(avg7Raw);
  const prevAvgBattery = roundToInt(prevRaw ?? avg7Raw);

  const total = Math.max(params.vitals7.length, 1);
  const sleepLowDays = params.vitals7.filter((v) => (v.inputs.sleepHours ?? 0) < 6).length;
  const caffeineHighDays = params.vitals7.filter((v) => (v.inputs.caffeineMg ?? 0) > 200).length;
  const stressHighDays = params.vitals7.filter((v) => {
    const stress = v.inputs.stress ?? 0;
    const mood = v.inputs.mood ?? v.emotion?.mood ?? 3;
    return stress >= 2 || mood <= 2;
  }).length;

  const drains = [
    { label: params.language === "ko" ? "수면 부족" : "Sleep debt", days: sleepLowDays },
    { label: params.language === "ko" ? "카페인 부담" : "Caffeine load", days: caffeineHighDays },
    { label: params.language === "ko" ? "스트레스/감정" : "Stress & mood", days: stressHighDays },
  ]
    .filter((item) => item.days > 0)
    .map((item) => ({ label: item.label, pct: roundToInt((item.days / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  if (params.language === "ko") {
    return {
      avgBattery,
      prevAvgBattery,
      topDrains: drains,
      personalInsight:
        sleepLowDays >= 2
          ? "이번 주에는 수면이 6시간 미만인 날 뒤에 컨디션이 같이 내려가는 흐름이 반복됐어요. 수면부터 먼저 보완하면 전체 회복 지표가 함께 좋아지는 패턴이 보여요."
          : "이번 주는 전반적으로 안정적이었고, 피로가 올라가는 날에 휴식 시간을 먼저 확보했을 때 회복 속도가 더 빨랐어요.",
      nextWeekPreview:
        "다음 주에는 교대 전환일 전후로 취침 시각과 카페인 마감 시각을 먼저 고정해 두면 배터리 하락 폭을 줄이는 데 도움이 돼요.",
    };
  }

  return {
    avgBattery,
    prevAvgBattery,
    topDrains: drains,
    personalInsight:
      sleepLowDays >= 2
        ? "This week, low-sleep days were followed by lower condition scores. Prioritizing sleep first appears to lift overall recovery."
        : "This week was relatively stable, and recovery improved when rest was protected early on demanding days.",
    nextWeekPreview:
      "Next week, locking sleep and caffeine timing around shift-transition days should reduce battery dips.",
  };
}

function mergeWeeklySummary(
  parsed: WeeklySummary | null,
  fallback: WeeklySummary | null
): WeeklySummary | null {
  if (!parsed && !fallback) return null;
  if (!parsed) return fallback;
  if (!fallback) return parsed;

  const avgBattery = parsed.avgBattery > 0 ? parsed.avgBattery : fallback.avgBattery;
  const prevAvgBattery =
    parsed.prevAvgBattery > 0 ? parsed.prevAvgBattery : fallback.prevAvgBattery;
  const topDrains = parsed.topDrains.length ? parsed.topDrains : fallback.topDrains;
  let personalInsight =
    parsed.personalInsight?.trim() ? parsed.personalInsight : fallback.personalInsight;
  let nextWeekPreview =
    parsed.nextWeekPreview?.trim() ? parsed.nextWeekPreview : fallback.nextWeekPreview;

  if (looksIncompleteNarrativeText(personalInsight) && fallback.personalInsight?.trim()) {
    personalInsight = fallback.personalInsight;
  }
  if (looksIncompleteNarrativeText(nextWeekPreview) && fallback.nextWeekPreview?.trim()) {
    nextWeekPreview = fallback.nextWeekPreview;
  }
  if (hasIncompleteWeeklyItems(personalInsight) && fallback.personalInsight?.trim()) {
    personalInsight = fallback.personalInsight;
  }
  if (hasIncompleteWeeklyItems(nextWeekPreview) && fallback.nextWeekPreview?.trim()) {
    nextWeekPreview = fallback.nextWeekPreview;
  }

  if (
    personalInsight.trim() &&
    nextWeekPreview.trim() &&
    normalizeComparableText(personalInsight) === normalizeComparableText(nextWeekPreview)
  ) {
    nextWeekPreview = fallback.nextWeekPreview;
    if (normalizeComparableText(personalInsight) === normalizeComparableText(nextWeekPreview)) {
      personalInsight = fallback.personalInsight;
    }
  }

  return {
    avgBattery: roundToInt(avgBattery),
    prevAvgBattery: roundToInt(prevAvgBattery),
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

function buildStructuredTextFromResult(result: AIRecoveryResult, language: Language): string {
  const lines: string[] = [];
  const sectionTitle = language === "ko" ? "오늘의 회복 추천" : "Today's Recovery Recommendations";
  const weeklyTitle = language === "ko" ? "이번 주 AI 한마디" : "Weekly AI Note";
  const noAlert = language === "ko" ? "없음" : "none";

  lines.push("[A] 한줄 요약");
  lines.push(result.headline || (language === "ko" ? "오늘의 핵심 회복 포인트를 확인해요." : "Check today's key recovery focus."));
  lines.push("");

  lines.push("[B] 긴급 알림");
  if (result.compoundAlert?.message?.trim()) {
    lines.push(result.compoundAlert.message.trim());
    if (result.compoundAlert.factors?.length) {
      lines.push(result.compoundAlert.factors.map((factor) => `[${factor}]`).join(" "));
    }
  } else {
    lines.push(noAlert);
  }
  lines.push("");

  lines.push("[C] " + sectionTitle);
  for (const section of result.sections ?? []) {
    lines.push(`[${section.title}]`);
    if (section.description?.trim()) lines.push(section.description.trim());
    for (const tip of section.tips ?? []) {
      const clean = String(tip ?? "").trim();
      if (clean) lines.push(`- ${clean}`);
    }
    lines.push("");
  }
  if (!result.sections?.length) {
    lines.push(language === "ko" ? "오늘은 추가 추천이 없어요." : "No additional recommendations for today.");
    lines.push("");
  }

  lines.push("[D] " + weeklyTitle);
  if (result.weeklySummary) {
    const deltaText = formatSignedDelta(result.weeklySummary.avgBattery - result.weeklySummary.prevAvgBattery);
    lines.push(
      `${language === "ko" ? "평균 배터리" : "Average battery"} ${result.weeklySummary.avgBattery} · ${
        language === "ko" ? "지난주 대비" : "vs last week"
      } ${deltaText}`
    );
    if (result.weeklySummary.personalInsight?.trim()) {
      lines.push(`- ${result.weeklySummary.personalInsight.trim()}`);
    }
    if (result.weeklySummary.nextWeekPreview?.trim()) {
      lines.push(`- ${result.weeklySummary.nextWeekPreview.trim()}`);
    }
  } else {
    lines.push(language === "ko" ? "데이터 부족" : "not enough data");
  }

  return lines.join("\n").trim();
}

function translateFallbackResult(source: AIRecoveryResult): AIRecoveryResult {
  return {
    headline: source.headline,
    compoundAlert: source.compoundAlert,
    sections: (source.sections ?? []).map((section) => {
      const meta = CATEGORY_ORDER.find((item) => item.category === section.category);
      return {
        ...section,
        title: meta?.titleEn ?? section.title,
      };
    }),
    weeklySummary: source.weeklySummary,
  };
}

type TranslationBundle = {
  headline: string;
  compoundAlert: {
    factors: string[];
    message: string;
  } | null;
  sections: Array<{
    category: RecoverySection["category"];
    title: string;
    description: string;
    tips: string[];
  }>;
  weeklySummary: {
    topDrains: Array<{ label: string; pct: number }>;
    personalInsight: string;
    nextWeekPreview: string;
  } | null;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;

  const direct = (() => {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  })();
  if (direct) return direct;

  const fenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(fenced);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function asRecoveryCategory(value: unknown): RecoverySection["category"] | null {
  return value === "sleep" ||
    value === "shift" ||
    value === "caffeine" ||
    value === "menstrual" ||
    value === "stress" ||
    value === "activity"
    ? (value as RecoverySection["category"])
    : null;
}

function asRecoverySeverity(value: unknown, fallbackText: string): RecoverySection["severity"] {
  return value === "info" || value === "caution" || value === "warning"
    ? (value as RecoverySection["severity"])
    : parseSeverity(fallbackText);
}

function dedupeNarrativeStrings(values: string[], limit: number, blocked: string[] = []) {
  const blockedKeys = new Set(blocked.map(normalizeComparableText).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = normalizeComparableText(clean);
    if (!key || seen.has(key) || blockedKeys.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function parseRecoveryJsonResult(candidate: Record<string, unknown>): AIRecoveryResult | null {
  const headline = asString(candidate.headline);
  if (!headline) return null;

  const sectionsRaw = Array.isArray(candidate.sections) ? candidate.sections : [];
  const sections = sectionsRaw
    .map((item) => {
      const row = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
      if (!row) return null;
      const category = asRecoveryCategory(row.category);
      const title = asString(row.title);
      const description = asString(row.description);
      const tips = dedupeNarrativeStrings(asStringArray(row.tips), 2, [description]);
      if (!category || !title || !description || !tips.length) return null;
      return {
        category,
        severity: asRecoverySeverity(row.severity, `${title} ${description} ${tips.join(" ")}`),
        title,
        description,
        tips,
      } satisfies RecoverySection;
    })
    .filter((section): section is RecoverySection => Boolean(section))
    .slice(0, 4);

  if (!sections.length) return null;

  const compoundRaw =
    typeof candidate.compoundAlert === "object" && candidate.compoundAlert !== null
      ? (candidate.compoundAlert as Record<string, unknown>)
      : null;
  const compoundAlert =
    compoundRaw && asString(compoundRaw.message)
      ? {
          factors: dedupeNarrativeStrings(asStringArray(compoundRaw.factors), 4),
          message: asString(compoundRaw.message),
        }
      : null;

  const weeklyRaw =
    typeof candidate.weeklySummary === "object" && candidate.weeklySummary !== null
      ? (candidate.weeklySummary as Record<string, unknown>)
      : null;
  const topDrains = Array.isArray(weeklyRaw?.topDrains)
    ? weeklyRaw!.topDrains
        .map((item) => {
          const row = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
          if (!row) return null;
          const label = asString(row.label);
          const pct = Number(row.pct);
          if (!label || !Number.isFinite(pct)) return null;
          return {
            label,
            pct: Math.round(clamp(pct, 0, 100)),
          };
        })
        .filter((item): item is { label: string; pct: number } => Boolean(item))
        .slice(0, 3)
    : [];
  const weeklySummary =
    weeklyRaw && (asString(weeklyRaw.personalInsight) || asString(weeklyRaw.nextWeekPreview) || topDrains.length)
      ? {
          avgBattery: Math.round(clamp(Number(weeklyRaw.avgBattery), 0, 100)),
          prevAvgBattery: Math.round(clamp(Number(weeklyRaw.prevAvgBattery), 0, 100)),
          topDrains,
          personalInsight: asString(weeklyRaw.personalInsight),
          nextWeekPreview: asString(weeklyRaw.nextWeekPreview),
        }
      : null;

  return {
    headline,
    compoundAlert,
    sections,
    weeklySummary,
  };
}

function shapeMatches(source: TranslationBundle, translated: TranslationBundle) {
  if (source.sections.length !== translated.sections.length) return false;
  for (let i = 0; i < source.sections.length; i++) {
    if (source.sections[i].tips.length !== translated.sections[i].tips.length) return false;
  }
  const srcAlert = source.compoundAlert;
  const trAlert = translated.compoundAlert;
  if (Boolean(srcAlert) !== Boolean(trAlert)) return false;
  if (srcAlert && trAlert && srcAlert.factors.length !== trAlert.factors.length) return false;
  const srcWeekly = source.weeklySummary;
  const trWeekly = translated.weeklySummary;
  if (Boolean(srcWeekly) !== Boolean(trWeekly)) return false;
  if (srcWeekly && trWeekly && srcWeekly.topDrains.length !== trWeekly.topDrains.length) return false;
  return true;
}

function bundleFromResult(result: AIRecoveryResult): TranslationBundle {
  return {
    headline: result.headline ?? "",
    compoundAlert: result.compoundAlert
      ? {
          factors: result.compoundAlert.factors ?? [],
          message: result.compoundAlert.message ?? "",
        }
      : null,
    sections: (result.sections ?? []).map((section) => ({
      category: section.category,
      title: section.title ?? "",
      description: section.description ?? "",
      tips: section.tips ?? [],
    })),
    weeklySummary: result.weeklySummary
      ? {
          topDrains: result.weeklySummary.topDrains ?? [],
          personalInsight: result.weeklySummary.personalInsight ?? "",
          nextWeekPreview: result.weeklySummary.nextWeekPreview ?? "",
        }
      : null,
  };
}

function parseTranslatedBundle(candidate: Record<string, unknown>): TranslationBundle | null {
  const sectionsRaw = candidate.sections;
  const sections = Array.isArray(sectionsRaw)
    ? sectionsRaw.map((item) => {
        const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
        const categoryRaw = row.category;
        const category =
          categoryRaw === "sleep" ||
          categoryRaw === "shift" ||
          categoryRaw === "caffeine" ||
          categoryRaw === "menstrual" ||
          categoryRaw === "stress" ||
          categoryRaw === "activity"
            ? categoryRaw
            : "sleep";
        return {
          category: category as RecoverySection["category"],
          title: asString(row.title),
          description: asString(row.description),
          tips: asStringArray(row.tips),
        };
      })
    : [];

  const compoundRaw =
    typeof candidate.compoundAlert === "object" && candidate.compoundAlert !== null
      ? (candidate.compoundAlert as Record<string, unknown>)
      : null;
  const weeklyRaw =
    typeof candidate.weeklySummary === "object" && candidate.weeklySummary !== null
      ? (candidate.weeklySummary as Record<string, unknown>)
      : null;

  const topDrains = Array.isArray(weeklyRaw?.topDrains)
    ? weeklyRaw.topDrains
        .map((item) => {
          const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
          const pct = Number(row.pct);
          return {
            label: asString(row.label),
            pct: Number.isFinite(pct) ? Math.round(clamp(pct, 0, 100)) : 0,
          };
        })
        .filter((item) => item.label)
    : [];

  return {
    headline: asString(candidate.headline),
    compoundAlert: compoundRaw
      ? {
          factors: asStringArray(compoundRaw.factors),
          message: asString(compoundRaw.message),
        }
      : null,
    sections,
    weeklySummary: weeklyRaw
      ? {
          topDrains,
          personalInsight: asString(weeklyRaw.personalInsight),
          nextWeekPreview: asString(weeklyRaw.nextWeekPreview),
        }
      : null,
  };
}

function mergeTranslatedResult(source: AIRecoveryResult, translated: TranslationBundle): AIRecoveryResult {
  const fallback = translateFallbackResult(source);
  const mergedSections = source.sections.map((sourceSection, idx) => {
    const translatedSection = translated.sections[idx];
    const meta = CATEGORY_ORDER.find((item) => item.category === sourceSection.category);
    const translatedTips = sourceSection.tips.map((tip, tipIdx) => {
      const translatedTip = translatedSection?.tips?.[tipIdx] ?? "";
      return translatedTip.trim() || tip;
    });

    return {
      ...sourceSection,
      title: translatedSection?.title?.trim() || meta?.titleEn || sourceSection.title,
      description: translatedSection?.description?.trim() || sourceSection.description,
      tips: translatedTips,
    };
  });

  const mergedCompoundAlert = source.compoundAlert
    ? {
        factors: source.compoundAlert.factors.map((factor, idx) => translated.compoundAlert?.factors?.[idx]?.trim() || factor),
        message: translated.compoundAlert?.message?.trim() || source.compoundAlert.message,
      }
    : null;

  const mergedWeeklySummary = source.weeklySummary
    ? {
        avgBattery: source.weeklySummary.avgBattery,
        prevAvgBattery: source.weeklySummary.prevAvgBattery,
        topDrains: source.weeklySummary.topDrains.map((drain, idx) => ({
          label: translated.weeklySummary?.topDrains?.[idx]?.label?.trim() || drain.label,
          pct: drain.pct,
        })),
        personalInsight: translated.weeklySummary?.personalInsight?.trim() || source.weeklySummary.personalInsight,
        nextWeekPreview: translated.weeklySummary?.nextWeekPreview?.trim() || source.weeklySummary.nextWeekPreview,
      }
    : null;

  return {
    headline: translated.headline?.trim() || fallback.headline,
    compoundAlert: mergedCompoundAlert,
    sections: mergedSections,
    weeklySummary: mergedWeeklySummary,
  };
}

export async function generateAIRecoveryWithOpenAI(
  params: GenerateOpenAIRecoveryParams
): Promise<OpenAIRecoveryOutput> {
  const apiKey = normalizeApiKey();
  const baseUrl = resolveApiBaseUrl();
  const model = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: baseUrl,
    apiKey,
    model: resolveModel(),
    scope: "recovery",
  }).model;

  const context = buildUserContext(params);
  const developerPrompt = buildDeveloperPrompt(params.language, params.phase ?? "start");
  const userPrompt = buildUserPrompt(params.language, context, params.phase ?? "start");
  const maxOutputTokens = Math.max(resolveMaxOutputTokens(), 2200);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    let lastError = `openai_request_failed_model:${model}`;
    for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
      const attempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt,
        userPrompt,
        signal: controller.signal,
        maxOutputTokens: Math.min(3400, maxOutputTokens + attemptIndex * 500),
        logFeature: "recovery_explanation",
        language: params.language,
        dateISO: params.todayISO,
        phase: params.phase ?? "start",
      });

      if (!attempt.text) {
        lastError = attempt.error ?? `openai_request_failed_model:${model}`;
        // 지역 제한·인증 오류처럼 재시도가 의미 없는 영구 오류는 즉시 종료
        if (!isRetryableRecoveryError(lastError)) break;
        // 재시도 가능한 오류는 짧은 딜레이 후 재시도
        if (attemptIndex < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attemptIndex + 1)));
        }
        continue;
      }

      const rawText = attempt.text.trim();
      const parsedObject = parseJsonObject(rawText);
      if (!parsedObject) {
        lastError = `openai_recovery_non_json_model:${model}`;
        continue;
      }
      const parsed = parseRecoveryJsonResult(parsedObject);
      if (!parsed) {
        lastError = `openai_recovery_invalid_shape_model:${model}`;
        continue;
      }
      const safeSections = context.menstrualTrackingEnabled
        ? parsed.sections
        : parsed.sections.filter((section) => section.category !== "menstrual");
      if (!safeSections.length) {
        lastError = `openai_recovery_empty_sections_model:${model}`;
        continue;
      }
      const weeklyFallback = buildFallbackWeeklySummary(params);
      const mergedResult: AIRecoveryResult = {
        ...parsed,
        sections: safeSections,
        weeklySummary: mergeWeeklySummary(parsed.weeklySummary, weeklyFallback),
      };
      const generatedText = buildStructuredTextFromResult(mergedResult, params.language);
      return {
        result: mergedResult,
        generatedText,
        engine: "openai",
        model,
        debug: null,
      };
    }
    throw new Error(lastError);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`openai_timeout_model:${model}`);
    }
    if (typeof err?.message === "string" && err.message.trim()) {
      throw new Error(err.message.trim());
    }
    throw new Error(`openai_fetch_model:${model}_${truncateError(err?.message ?? "unknown")}`);
  } finally {
    clearTimeout(timer);
  }
}
export async function translateAIRecoveryToEnglish(
  source: OpenAIRecoveryOutput
): Promise<OpenAIRecoveryOutput> {
  const apiKey = normalizeApiKey();
  const baseUrl = resolveApiBaseUrl();
  const model = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: baseUrl,
    apiKey,
    model: resolveModel(),
    scope: "recovery",
  }).model;

  type Pointer =
    | { kind: "headline" }
    | { kind: "alertMessage" }
    | { kind: "alertFactor"; factorIndex: number }
    | { kind: "sectionTitle"; sectionIndex: number }
    | { kind: "sectionDescription"; sectionIndex: number }
    | { kind: "sectionTip"; sectionIndex: number; tipIndex: number }
    | { kind: "weeklyDrainLabel"; drainIndex: number }
    | { kind: "weeklyPersonalInsight" }
    | { kind: "weeklyNextWeekPreview" };

  const lines: string[] = [];
  const pointers: Pointer[] = [];
  const push = (value: string, pointer: Pointer) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    lines.push(text);
    pointers.push(pointer);
  };

  push(source.result.headline, { kind: "headline" });
  if (source.result.compoundAlert) {
    push(source.result.compoundAlert.message, { kind: "alertMessage" });
    source.result.compoundAlert.factors.forEach((factor, factorIndex) =>
      push(factor, { kind: "alertFactor", factorIndex })
    );
  }
  source.result.sections.forEach((section, sectionIndex) => {
    push(section.title, { kind: "sectionTitle", sectionIndex });
    push(section.description, { kind: "sectionDescription", sectionIndex });
    section.tips.forEach((tip, tipIndex) =>
      push(tip, { kind: "sectionTip", sectionIndex, tipIndex })
    );
  });
  if (source.result.weeklySummary) {
    source.result.weeklySummary.topDrains.forEach((drain, drainIndex) =>
      push(drain.label, { kind: "weeklyDrainLabel", drainIndex })
    );
    push(source.result.weeklySummary.personalInsight, { kind: "weeklyPersonalInsight" });
    push(source.result.weeklySummary.nextWeekPreview, { kind: "weeklyNextWeekPreview" });
  }

  if (!lines.length) {
    return {
      result: translateFallbackResult(source.result),
      generatedText: buildStructuredTextFromResult(translateFallbackResult(source.result), "en"),
      engine: "openai",
      model,
      debug: "translate_empty_source",
    };
  }

  const parseArray = (raw: string): string[] | null => {
    const text = raw.trim();
    const tryParse = (candidate: string) => {
      try {
        const parsed = JSON.parse(candidate);
        if (!Array.isArray(parsed)) return null;
        return parsed.map((item) => String(item ?? "").trim());
      } catch {
        return null;
      }
    };
    const direct = tryParse(text);
    if (direct) return direct;

    const fenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const fencedParsed = tryParse(fenced);
    if (fencedParsed) return fencedParsed;

    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first >= 0 && last > first) {
      return tryParse(text.slice(first, last + 1));
    }
    return null;
  };

  const buildTranslatePrompt = (targetLines: string[], strictNoKorean = false) =>
    [
      "Translate each input string from Korean to natural English.",
      "Return ONLY a JSON array of strings.",
      `Array length must be exactly ${targetLines.length}.`,
      "Keep order exactly the same.",
      "Do not merge or split lines.",
      "Do not alter numbers, units, dates, or punctuation meaning.",
      strictNoKorean ? "Final output must contain no Korean characters." : "",
      "",
      JSON.stringify(targetLines, null, 2),
    ]
      .filter(Boolean)
      .join("\n");

  const translateChunk = async (targetLines: string[], strictNoKorean = false) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const attempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt: "You are a professional Korean-to-English translator for nurse wellness content.",
        userPrompt: buildTranslatePrompt(targetLines, strictNoKorean),
        signal: controller.signal,
        // 번역은 길이가 길어지기 쉬워 생성보다 넉넉하게 허용
        maxOutputTokens: Math.max(resolveMaxOutputTokens(), 2600),
        logFeature: "recovery_translate",
        language: "en",
        dateISO: "translation",
      });
      if (!attempt.text) {
        throw new Error(attempt.error ?? `openai_request_failed_model:${model}`);
      }
      const parsed = parseArray(attempt.text);
      if (!parsed) throw new Error(`openai_translate_non_json_array_model:${model}`);
      if (parsed.length !== targetLines.length) {
        throw new Error(`openai_translate_count_mismatch_model:${model}_${parsed.length}/${targetLines.length}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };

  const hangulRatio = (arr: string[]) => {
    const text = arr.join(" ");
    const total = (text.match(/[A-Za-z가-힣]/g) ?? []).length;
    if (!total) return 0;
    const hangul = (text.match(/[가-힣]/g) ?? []).length;
    return hangul / total;
  };

  const splitChunks = <T,>(arr: T[], size: number): T[][] => {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const translateInBatches = async () => {
    // 섹션이 길어도 실패하지 않도록 분할 번역
    const chunks = splitChunks(lines, 12);
    const output: string[] = [];
    for (const chunk of chunks) {
      let translated = await translateChunk(chunk, false);
      if (hangulRatio(translated) > 0.08) {
        translated = await translateChunk(chunk, true);
      }
      output.push(...translated);
    }
    if (output.length !== lines.length) {
      throw new Error(`openai_translate_count_mismatch_model:${model}_${output.length}/${lines.length}`);
    }
    return output;
  };

  try {
    const translatedLines = await translateInBatches();

    const mergedResult: AIRecoveryResult = {
      ...source.result,
      compoundAlert: source.result.compoundAlert
        ? {
            ...source.result.compoundAlert,
            factors: [...source.result.compoundAlert.factors],
          }
        : null,
      sections: source.result.sections.map((section) => ({
        ...section,
        tips: [...section.tips],
      })),
      weeklySummary: source.result.weeklySummary
        ? {
            ...source.result.weeklySummary,
            topDrains: source.result.weeklySummary.topDrains.map((drain) => ({ ...drain })),
          }
        : null,
    };

    pointers.forEach((pointer, idx) => {
      const value = translatedLines[idx]?.trim();
      if (!value) return;
      if (pointer.kind === "headline") {
        mergedResult.headline = value;
        return;
      }
      if (pointer.kind === "alertMessage") {
        if (mergedResult.compoundAlert) mergedResult.compoundAlert.message = value;
        return;
      }
      if (pointer.kind === "alertFactor") {
        if (mergedResult.compoundAlert && mergedResult.compoundAlert.factors[pointer.factorIndex] != null) {
          mergedResult.compoundAlert.factors[pointer.factorIndex] = value;
        }
        return;
      }
      if (pointer.kind === "sectionTitle") {
        if (mergedResult.sections[pointer.sectionIndex]) mergedResult.sections[pointer.sectionIndex].title = value;
        return;
      }
      if (pointer.kind === "sectionDescription") {
        if (mergedResult.sections[pointer.sectionIndex]) mergedResult.sections[pointer.sectionIndex].description = value;
        return;
      }
      if (pointer.kind === "sectionTip") {
        if (
          mergedResult.sections[pointer.sectionIndex] &&
          mergedResult.sections[pointer.sectionIndex].tips[pointer.tipIndex] != null
        ) {
          mergedResult.sections[pointer.sectionIndex].tips[pointer.tipIndex] = value;
        }
        return;
      }
      if (pointer.kind === "weeklyDrainLabel") {
        if (mergedResult.weeklySummary?.topDrains[pointer.drainIndex]) {
          mergedResult.weeklySummary.topDrains[pointer.drainIndex].label = value;
        }
        return;
      }
      if (pointer.kind === "weeklyPersonalInsight") {
        if (mergedResult.weeklySummary) mergedResult.weeklySummary.personalInsight = value;
        return;
      }
      if (pointer.kind === "weeklyNextWeekPreview") {
        if (mergedResult.weeklySummary) mergedResult.weeklySummary.nextWeekPreview = value;
      }
    });

    const translatedText = buildStructuredTextFromResult(mergedResult, "en");

    return {
      result: mergedResult,
      generatedText: translatedText,
      engine: "openai",
      model,
      debug: null,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error(`openai_timeout_model:${model}`);
    if (typeof err?.message === "string" && err.message.trim()) throw new Error(err.message.trim());
    throw new Error(`openai_fetch_model:${model}_${truncateError(err?.message ?? "unknown")}`);
  }
}

export type OpenAIRecoveryPlannerModulesOutput = {
  result: AIRecoveryPlannerModules;
  generatedText: string;
  engine: "openai";
  model: string | null;
  debug: string | null;
};

type GenerateOpenAIRecoveryPlannerParams = GenerateOpenAIRecoveryParams & {
  recoveryResult?: AIRecoveryResult | null;
  requestedOrderCount?: number | null;
};

function buildPlannerRecoveryReference(result: AIRecoveryResult | null | undefined) {
  if (!result) return null;
  return {
    headline: result.headline,
    compoundAlert: result.compoundAlert,
    sections: result.sections.map((section) => ({
      category: section.category,
      title: section.title,
      description: section.description,
      tips: section.tips,
    })),
    weeklySummary: result.weeklySummary,
  };
}

function buildPlannerOrdersDeveloperPrompt(
  language: Language,
  phase: RecoveryPhase = "start",
  requestedOrderCount?: number | null
) {
  const requestedCountClause =
    requestedOrderCount != null
      ? language === "en"
        ? `Return exactly ${requestedOrderCount} orders unless the data truly supports fewer.`
        : `가능하면 정확히 ${requestedOrderCount}개의 오더를 반환하고, 데이터가 정말 부족할 때만 더 적게 작성한다.`
      : language === "en"
        ? `Return exactly ${DEFAULT_PLANNER_ORDER_COUNT} orders by default, unless the data truly supports fewer.`
        : `기본값은 ${DEFAULT_PLANNER_ORDER_COUNT}개의 오더를 작성하고, 데이터가 정말 부족할 때만 더 적게 작성한다.`;
  if (language === "ko") {
    return [
      "너는 RNest의 AI 오늘의 오더 생성 엔진이야.",
      "AI 맞춤회복 결과를 최상위 기준으로 삼고, 전체 건강기록 히스토리와 오늘 상태를 함께 읽어 회복 행동 체크리스트를 만든다.",
      phase === "after_work"
        ? "지금은 퇴근 후 오더 단계다. 아침에 만든 회복 흐름과 오더 진행 상황을 이어 받아, 오늘 밤 회복과 다음날 보호에 맞는 오더를 만든다."
        : "지금은 오늘 시작 오더 단계다. 아침에 바로 실행할 수 있는 낮은 마찰의 스타터 오더를 우선 만든다.",
      phase === "after_work"
        ? "퇴근 후 단계에서는 오늘 실제 동적 입력을 반영해도 된다."
        : "시작 단계에서는 오늘 수면 외의 같은 날 스트레스·카페인·활동·기분·근무메모를 분석 근거나 오더 설명 중심으로 끌어오지 말고, 그 미입력 사실을 오더 문구에 굳이 적지 않는다.",
      "오더는 추상적인 조언이 아니라 실제로 체크 가능한 행동이어야 한다.",
      requestedCountClause,
      "중요하지 않은 항목은 과감히 제외하되, 선택한 개수 안에서 우선순위가 분명해야 한다.",
      "응답은 JSON 하나만 반환하고, title/headline/summary/items를 모두 채워야 한다.",
      "headline은 오늘 오더 흐름의 핵심을 한 문장으로, summary는 왜 이 오더 구성이 맞는지 한 문장으로 적는다.",
      "각 오더는 title, body, when, reason을 가져야 하고, id는 영어 snake_case로 안정적으로 작성한다.",
      "when은 긴 문장이 아니라 '지금', '근무 중', '퇴근 직후', '잠들기 전'처럼 아주 짧은 타이밍 라벨만 쓴다.",
      "chips는 선택 사항이며 0~3개, 한두 단어 수준의 짧은 태그만 쓴다.",
      "오더는 지금 컨디션에서도 실행할 수 있을 정도로 낮은 마찰이어야 하고, 한 번에 하나씩 끝낼 수 있어야 한다.",
      "body는 실제 실행 문장으로 쓰고, 가능하면 시간/횟수/조건을 포함해 바로 행동할 수 있게 만든다.",
      "body에는 시작 트리거를 넣어 사용자가 언제 시작할지 바로 알 수 있게 한다. 예: 출근 전, 다음 투약 전, 퇴근 직후, 잠들기 전.",
      "제네릭한 '쉬기/눕기/눈감기' 표현만으로 끝내지 말고, 언제/어디서/무엇을/얼마나 중 최소 2개를 드러내 실행 장면이 그려지게 만든다.",
      "reason은 사용자의 개인 상태(수면, 교대, 기분, 스트레스, 활동, 카페인, 생리주기, 최근 반복 패턴)와 연결해 왜 이 행동이 회복에 유리한지 설명한다.",
      phase === "after_work"
        ? "퇴근 후 오더는 '퇴근 직후', '잠들기 전' 타이밍 중심으로 구성하고, 이미 완료된 시작 오더를 반복하지 않는다."
        : "시작 오더는 '지금', '출근 전', '근무 중' 타이밍 중심으로 구성하고, 하루 시작에 과한 행동을 요구하지 않는다.",
      "오늘 데이터가 극심한 피로나 수면부채를 분명히 가리키는 경우가 아니면 막연한 휴식 오더를 남발하지 않는다.",
      "오더가 3개 이상이면 실수 방지/집중 리셋, 짧은 신체 회복, 정서 안정 또는 수면 전환 중 최소 2개 이상 영역이 섞이게 만든다.",
      "title은 행동만 적지 말고 맥락이 보이게 만든다. 예: '근무 중 3분 걷기 리셋', '퇴근 후 10분 감각 낮추기'.",
      "서로 거의 같은 행동을 다른 말로 반복하지 말고, 같은 타이밍 오더가 과하게 몰리지 않게 조정한다.",
      "generic한 문장('휴식하기', '컨디션 관리하기', '꾸준히 해보기')만으로는 절대 끝내지 말고, 왜 지금 필요한지와 실행 장면이 보여야 한다.",
      "reason은 description 재진술처럼 짧게 얼버무리지 말고, 개인 기록 패턴 2가지 이상과 연결되면 더 좋다.",
      "타임라인은 별도 섹션으로 만들지 말고 when/reason 안에 녹여라.",
      "내부 시스템 용어(planner, plannerContext, recoveryThread, focusFactor 등)와 데이터 필드명(napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity 등)을 title, body, reason, headline, summary 어디에도 괄호나 본문에 노출하지 마라.",
      "ISO 날짜(2026-03-13 등)를 괄호나 본문에 직접 쓰지 말고, '오늘', '내일', '다음 근무일' 같은 자연어로만 표현하라.",
      "출력은 JSON 하나만 반환한다.",
    ].join(" ");
  }
  return [
    "You are RNest's AI today-orders generation engine.",
    "Use the AI customized recovery result as the top-level source of truth, then read the full health-record history and today's condition to build an actionable checklist.",
    phase === "after_work"
      ? "This is the after-work orders phase. Continue the morning recovery thread and order progress, then focus the checklist on tonight's recovery and protection for tomorrow."
      : "This is the start-of-day orders phase. Prioritize low-friction actions that help the user begin the day safely and clearly.",
    "Orders must be concrete actions that can be checked off, not generic advice.",
    requestedCountClause,
    "Keep priority sharp within the selected count and cut lower-value suggestions.",
    "Return one JSON object with non-empty title, headline, summary, and items.",
    "Each order must include title, body, when, and reason, and id must be stable snake_case English.",
    "Use when as a very short timing label only, such as 'Now', 'During shift', 'After work', or 'Before bed'.",
    "chips are optional, must stay between 0 and 3, and should be very short keyword tags.",
    "Orders must stay low-friction for today's condition and feel realistically finishable one by one.",
    "Write body as an immediate execution sentence, preferably with a small duration, count, or trigger.",
    "Include a start trigger in body so the user knows exactly when to begin, such as before the next med pass, during a short break, right after arriving home, or before bed.",
    "Do not stop at vague rest wording. Make the scene concrete with at least two of timing, place, action, or duration.",
    "Write reason in a personalized way that ties the action to sleep, shift pattern, mood, stress, activity, caffeine, menstrual timing, or repeating blockers in the history.",
    phase === "after_work"
      ? "After-work orders should lean toward after work and before-bed timing, and should not repeat morning orders already completed."
      : "Start-of-day orders should lean toward now, before work, and during shift timing, and should stay easy enough to start immediately.",
    "Unless today's data clearly points to acute exhaustion or sleep debt, avoid filling the list with generic lie-down or rest-only actions.",
    "When returning 3 or more orders, mix at least two domains across safety or focus reset, light body recovery, and emotional downshift or sleep transition.",
    "Make title action-first but contextual, such as '3-minute reset walk during shift' or '10-minute wind-down after work'.",
    "Avoid near-duplicate actions and avoid stacking too many orders into the same timing window unless clearly necessary.",
    "Do not settle for thin phrases like 'rest more' or 'manage your condition'. The user must be able to picture exactly what to do next.",
    "Do not create a separate timeline section. Fold timing into when and reason.",
    "Never expose internal system terms (planner, plannerContext, recoveryThread, focusFactor) or data field names (napHours, menstrualLabel, sleepDebtHours, nightStreak, caffeineMg, symptomSeverity, vitalScore, csi, sri, cif, slf, mif, next, today, mood, stress, activity) in title, body, reason, headline, or summary — not in parentheses, not inline.",
    "Never put ISO dates (e.g. 2026-03-13) in parentheses or body text — use natural language like 'today', 'tomorrow', 'the next shift day' instead.",
    "Return one JSON object only.",
  ].join(" ");
}

function buildPlannerOrdersUserPrompt(args: {
  language: Language;
  context: ReturnType<typeof buildUserContext>;
  recoveryResult: AIRecoveryResult | null | undefined;
  phase?: RecoveryPhase;
  requestedOrderCount?: number | null;
}) {
  const { language, context, recoveryResult, phase = "start", requestedOrderCount } = args;
  const recoveryReference = buildPlannerRecoveryReference(recoveryResult);
  const shape = {
    eyebrow: "string",
    title: "string",
    headline: "string",
    summary: "string",
    items: [
      {
        id: "string_snake_case",
        title: "string",
        body: "string",
        when: "string",
        reason: "string",
        chips: ["string"],
      },
    ],
  };

  if (language === "ko") {
    return [
      "오늘의 오더 체크리스트용 JSON을 작성하세요.",
      "반드시 JSON 하나만 출력하세요. 코드펜스 금지, 설명문 금지.",
      "",
      "[목표]",
      phase === "after_work" ? "- 퇴근 후 회복 업데이트를 실제 행동 체크리스트로 바꾸기" : "- AI 맞춤회복을 실제 행동 체크리스트로 바꾸기",
      requestedOrderCount != null
        ? `- 오늘 가장 중요한 오더를 ${requestedOrderCount}개로 맞춰 고르기`
        : `- 오늘 가장 중요한 오더 ${DEFAULT_PLANNER_ORDER_COUNT}개를 기본값으로 고르기`,
      "- 타이밍 정보는 when과 reason에 자연스럽게 녹이기",
      "- 사용자가 지금 컨디션에서도 바로 실천할 수 있게 마찰을 낮추기",
      phase === "after_work"
        ? "- recoveryThread를 참고해 아침 흐름을 이어받되, 오늘 밤 회복과 잠들기 전 전환을 위한 오더로 업데이트하기"
        : "- 하루를 시작할 때 바로 실행할 수 있는 스타터 오더가 되게 만들기",
      "",
      "[제약]",
      requestedOrderCount != null
        ? `- items 길이는 정확히 ${requestedOrderCount}`
        : `- items 길이는 기본적으로 정확히 ${DEFAULT_PLANNER_ORDER_COUNT}`,
      "- id는 영어 snake_case",
      "- title, headline, summary는 모두 비워 두지 말 것",
      "- title은 행동 중심의 짧은 문장",
      "- headline은 오늘 오더 흐름의 핵심을 한 문장으로 정리",
      "- summary는 왜 이 오더 구성이 맞는지 한 문장으로 정리",
      "- body는 체크리스트 한 줄처럼 짧고 분명하게, 가능하면 시간/횟수/조건을 포함",
      "- body 안에 시작 트리거를 넣어 언제 시작하는지 바로 보이게 할 것",
      "- when은 12자 안팎의 아주 짧은 타이밍 라벨만 사용",
      "- reason은 왜 지금 필요한지, 사용자의 현재 패턴과 연결해 한 문장으로 설명",
      "- chips는 0~3개, 짧은 키워드만 사용",
      "- today / weekly / history / plannerContext / AI Recovery Brief JSON을 모두 보고 판단",
      phase === "after_work"
        ? "- 퇴근 후 단계에서는 오늘 실제 입력을 reason에 반영할 수 있음"
        : "- 시작 단계에서는 오늘 수면 외 같은 날 동적 입력을 reason의 근거로 끌어오지 말 것",
      "- 전체 건강기록을 봤을 때 반복적으로 회복을 방해하는 패턴이 있으면 우선순위에 반영",
      "- 작은 행동이지만 회복 효과가 크고 실수/소진을 줄이는 방향을 우선",
      "- 막연한 '쉬기/눕기/눈감기' 표현만 쓰지 말고, 왜 지금 그 행동을 해야 하는지 실행 장면이 보이게 작성",
      "- '컨디션 관리하기', '회복하기', '휴식하기'처럼 generic한 제목/문장 금지",
      "- items가 3개 이상이면 집중·안전, 짧은 움직임, 정서 안정/수면 전환 중 최소 2개 이상 영역이 섞이게 구성",
      phase === "after_work"
        ? "- 퇴근 후 단계에서는 when이 '퇴근 직후', '잠들기 전' 쪽으로 자연스럽게 분산되게 구성"
        : "- 시작 단계에서는 when이 '지금', '출근 전', '근무 중' 쪽으로 자연스럽게 분산되게 구성",
      "- 같은 행동을 표현만 바꿔 중복 생성하지 말 것",
      "- Data JSON에 없는 수치를 새로 만들지 말 것",
      requestedOrderCount != null ? `[선택된 오더 개수]\n${requestedOrderCount}` : "",
      "",
      "[JSON shape]",
      JSON.stringify(shape, null, 2),
      "",
      "[AI Recovery Brief JSON]",
      JSON.stringify(recoveryReference, null, 2),
      "",
      "[Data JSON]",
      JSON.stringify(context, null, 2),
    ].join("\n");
  }

  return [
    "Create a JSON object for today's checklist orders.",
    "Return JSON only. No code fences and no commentary.",
    "[Goal]",
    phase === "after_work"
      ? "- Turn the after-work recovery update into an actionable checklist"
      : "- Turn AI customized recovery into an actionable checklist",
    requestedOrderCount != null
      ? `- Choose exactly ${requestedOrderCount} important orders for today`
      : `- Choose exactly ${DEFAULT_PLANNER_ORDER_COUNT} important orders for today by default`,
    "- Fold timing into when and reason instead of creating a separate timeline section",
    "- Keep the actions easy to start in the user's current condition",
    phase === "after_work"
      ? "- Carry the morning recovery thread forward while focusing on after-work and bedtime recovery"
      : "- Make the checklist feel like a clean start-of-day launch sequence",
    "[Constraints]",
    requestedOrderCount != null
      ? `- items length must be exactly ${requestedOrderCount}`
      : `- items length should default to exactly ${DEFAULT_PLANNER_ORDER_COUNT}`,
    "- id must be English snake_case",
    "- title, headline, and summary must all be present",
    "- title must be short and action-first",
    "- headline must summarize the core order theme in one sentence",
    "- summary must explain why this order mix fits today in one sentence",
    "- body must read like a checklist line and should include a small duration, count, or trigger when helpful",
    "- body must include a clear start trigger so the user knows when to begin",
    "- when must stay short, ideally a timing label under about 16 characters",
    "- reason must explain why it matters now in one sentence and tie back to the user's current pattern",
    "- chips are optional, between 0 and 3, and should be short keyword tags",
    "- use today / weekly / history / plannerContext / AI Recovery Brief JSON together",
    "- reflect recurring blockers found across the full health record history",
    "- prefer low-friction, high-impact, non-duplicated actions",
    "- avoid vague rest-only wording unless today's data strongly supports acute exhaustion or sleep debt",
    "- ban generic headings or filler such as 'manage your condition' or 'recover well'",
    "- if there are 3 or more items, mix at least two domains across focus or safety reset, light movement, and emotional or sleep recovery",
    phase === "after_work"
      ? "- after-work timing should lean toward after work and before bed"
      : "- start-of-day timing should lean toward now, before work, and during shift",
    "- do not invent numbers missing from Data JSON",
    requestedOrderCount != null ? `[Requested order count]\n${requestedOrderCount}` : "",
    "[JSON shape]",
    JSON.stringify(shape, null, 2),
    "[AI Recovery Brief JSON]",
    JSON.stringify(recoveryReference, null, 2),
    "[Data JSON]",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function slugifyChecklistId(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

function normalizeChecklistWhen(value: string | null | undefined, language: Language) {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return language === "en" ? "Today" : "오늘";
  if (raw.length <= (language === "en" ? 18 : 12)) return raw;

  if (language === "en") {
    if (/now|right away|immediately/i.test(raw)) return "Now";
    if (/before bed|sleep|night/i.test(raw)) return "Before bed";
    if (/after work|after shift|post shift/i.test(raw)) return "After work";
    if (/during shift|at work|while working/i.test(raw)) return "During shift";
    if (/before work|before shift|morning/i.test(raw)) return "Before work";
    return "Later today";
  }

  if (/지금|바로|즉시/.test(raw)) return "지금";
  if (/잠|취침|자기|잠들기/.test(raw)) return "잠들기 전";
  if (/퇴근|근무 후|집에/.test(raw)) return "퇴근 직후";
  if (/근무|업무|교대/.test(raw)) return "근무 중";
  if (/출근|아침|근무 전/.test(raw)) return "출근 전";
  return "오늘 안에";
}

function normalizeChecklistChip(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 18);
}

function normalizeRequestedOrderCount(value: number | null | undefined) {
  if (value == null || String(value).trim() === "") return DEFAULT_PLANNER_ORDER_COUNT;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_PLANNER_ORDER_COUNT;
  return Math.max(1, Math.min(5, parsed));
}

export function buildFallbackChecklistItems(
  plannerContext: PlannerContext | null | undefined,
  language: Language,
  phase: RecoveryPhase,
  requestedOrderCount?: number | null
): AIPlannerChecklistItem[] {
  const targetCount =
    normalizeRequestedOrderCount(requestedOrderCount) ??
    Math.max(DEFAULT_PLANNER_ORDER_COUNT, Math.min(5, plannerContext?.ordersTop3?.length ?? DEFAULT_PLANNER_ORDER_COUNT));
  const orders = plannerContext?.ordersTop3 ?? [];
  const baseItems: AIPlannerChecklistItem[] = orders.slice(0, 5).map((order, index) => ({
    id: slugifyChecklistId(order.title || order.text, `order_${index + 1}`),
    title: order.title,
    body: order.text,
    when:
      language === "en"
        ? index === 0
          ? "Now"
          : "Later today"
        : index === 0
          ? "지금"
          : "오늘 안에",
    reason:
      language === "en"
        ? "This order stays aligned with the AI recovery priority."
        : "AI 맞춤회복 우선순위와 같은 방향으로 실행되는 오더입니다.",
    chips: [],
  }));

  if (!baseItems.length) {
    baseItems.push({
      id: "protect_recovery_routine",
      title: language === "en" ? "Protect one recovery routine" : "회복 루틴 하나 지키기",
      body:
        plannerContext?.primaryAction ??
        (language === "en"
          ? "Keep the first recovery action small enough to complete today."
          : "오늘 끝낼 수 있을 만큼 작은 회복 행동 하나만 먼저 실행하세요."),
      when: language === "en" ? "Now" : "지금",
      reason:
        plannerContext?.avoidAction ??
        (language === "en"
          ? "Reducing late stimulation keeps the rest of the day more stable."
          : "늦은 자극을 줄이면 오늘 회복 흐름이 덜 흔들립니다."),
      chips: [],
    });
  }

  const supplementalTemplates: AIPlannerChecklistItem[] =
    language === "en"
      ? phase === "after_work"
        ? [
            {
              id: "after_work_unload",
              title: "10-minute unload right after work",
              body: "Right after arriving home, put the phone down, wash up, and sit quietly for 10 minutes before doing anything else.",
              when: "After work",
              reason: "A short landing helps your nervous system stop carrying shift tension straight into the evening.",
              chips: ["wind_down", "after_work"],
            },
            {
              id: "light_recovery_walk_home",
              title: "5-minute light body reset after shift",
              body: "After work, set a 5-minute timer and walk slowly indoors while releasing your shoulders and jaw.",
              when: "After work",
              reason: "A brief movement reset helps circulation and mental decompression without feeling like full exercise.",
              chips: ["movement", "reset"],
            },
            {
              id: "bedtime_landing",
              title: "5-minute quiet landing before bed",
              body: "Before bed, lower the screen brightness, put the phone away, and sit still for 5 minutes before lying down.",
              when: "Before bed",
              reason: "Lowering stimulation makes it easier to shift from work mode into real recovery sleep.",
              chips: ["sleep"],
            },
          ]
        : [
            {
              id: "pause_before_next_task",
              title: "10-second safety pause before the next key task",
              body: "Before the next important task, stop for 10 seconds and quietly recheck the name, order, or next step once.",
              when: "During shift",
              reason: "A brief pause protects focus and reduces errors on days when recovery margin is already thin.",
              chips: ["safety", "focus"],
            },
            {
              id: "reset_with_small_movement",
              title: "Add one 3-minute reset walk",
              body: "During one short break today, set a 3-minute timer and walk slowly until your shoulders and jaw loosen.",
              when: "During shift",
              reason: "A brief walk is easier to start than full exercise and still helps circulation, mood, and mental reset.",
              chips: ["movement", "reset"],
            },
            {
              id: "close_day_gently",
              title: "Close the day with a quiet 5-minute landing",
              body: "Before bed, lower the phone brightness, put it down, and sit quietly for 5 minutes before lying down.",
              when: "Before bed",
              reason: "A softer landing helps keep the nervous system from carrying the day too far into sleep.",
              chips: ["sleep"],
            },
          ]
      : phase === "after_work"
        ? [
            {
              id: "after_work_unload",
              title: "퇴근 직후 10분 감각 낮추기",
              body: "집에 도착하면 휴대폰을 내려두고 세안이나 샤워만 한 뒤, 10분만 조용히 앉아 속도를 낮춥니다.",
              when: "퇴근 직후",
              reason: "근무 긴장을 바로 끌고 가지 않게 짧게 착지하면 저녁 회복이 훨씬 부드럽게 시작됩니다.",
              chips: ["정서 안정", "퇴근 후"],
            },
            {
              id: "light_recovery_walk_home",
              title: "퇴근 후 5분 몸 풀기",
              body: "퇴근 후 5분 타이머를 맞추고 실내를 천천히 오가며 어깨와 턱 힘을 풀어 줍니다.",
              when: "퇴근 직후",
              reason: "짧은 움직임은 근무 중 쌓인 긴장을 낮추고 바로 눕는 것보다 회복 전환에 유리합니다.",
              chips: ["움직임", "회복"],
            },
            {
              id: "bedtime_landing",
              title: "잠들기 전 5분 조용히 착지하기",
              body: "잠들기 전 휴대폰을 내려두고 밝기를 낮춘 뒤, 5분만 조용히 앉아 호흡을 고르고 눕습니다.",
              when: "잠들기 전",
              reason: "하루 자극을 조금 낮춰 두면 몸이 잠으로 넘어가는 데 필요한 브레이크가 걸립니다.",
              chips: ["수면"],
            },
          ]
        : [
            {
              id: "pause_before_next_task",
              title: "다음 핵심 업무 전 10초 확인 루틴",
              body: "다음 투약·처치·인계 전 10초만 멈추고 이름·순서·속도를 속으로 한 번 다시 짚습니다.",
              when: "근무 중",
              reason: "회복 여유가 얇은 날일수록 짧은 확인 루틴이 실수와 멘탈 소모를 줄이는 데 직접 도움이 됩니다.",
              chips: ["실수 방지", "집중"],
            },
            {
              id: "reset_with_small_movement",
              title: "복도 한 바퀴 3분 리셋 걷기",
              body: "근무 중 한 번, 3분 타이머를 맞추고 복도나 휴게실을 천천히 걸으며 어깨와 턱 힘을 풉니다.",
              when: "근무 중",
              reason: "짧은 움직임은 부담이 낮으면서도 순환, 기분, 집중 회복을 같이 끌어올리기 좋습니다.",
              chips: ["움직임", "리셋"],
            },
            {
              id: "close_day_gently",
              title: "잠들기 전 5분 조용히 마감하기",
              body: "잠들기 전 휴대폰을 내려두고 밝기를 낮춘 뒤, 5분만 조용히 앉아 호흡을 고르고 눕습니다.",
              when: "잠들기 전",
              reason: "하루 자극을 조금만 낮춰도 신경계가 덜 들뜬 상태로 잠에 들어가기 쉬워집니다.",
              chips: ["수면"],
            },
          ];

  const items = [...baseItems];
  for (const extra of supplementalTemplates) {
    if (items.length >= targetCount) break;
    if (items.some((item) => item.id === extra.id)) continue;
    items.push(extra);
  }

  return items.slice(0, targetCount);
}

function parsePlannerChecklistItems(
  value: unknown,
  language: Language,
  requestedOrderCount?: number | null
): AIPlannerChecklistItem[] {
  const targetCount = normalizeRequestedOrderCount(requestedOrderCount);
  if (!Array.isArray(value)) return [];

  const items: AIPlannerChecklistItem[] = [];
  for (const item of value) {
    const row = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
    if (!row) continue;
    const title = asString(row.title);
    const body = asString(row.body);
    const reason = asString(row.reason);
    if (!title || !body || !reason) continue;
    const rawId = asString(row.id) || title;
    const id = slugifyChecklistId(rawId, slugifyChecklistId(title, `order_${items.length + 1}`));
    items.push({
      id,
      title,
      body,
      when: normalizeChecklistWhen(asString(row.when), language),
      reason,
      chips: asStringArray(row.chips)
        .map(normalizeChecklistChip)
        .filter(Boolean)
        .slice(0, 3),
    });
    if (items.length >= 5) break;
  }

  const deduped = items.filter((item, index) => items.findIndex((candidate) => candidate.id === item.id) === index);
  if (!deduped.length) return [];
  if (targetCount != null && deduped.length !== targetCount) return [];
  return deduped.slice(0, targetCount ?? 5);
}

function parsePlannerChecklistModule(
  value: unknown,
  language: Language,
  requestedOrderCount?: number | null
): AIPlannerChecklistModule {
  const row = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const items = parsePlannerChecklistItems(row.items, language, requestedOrderCount);
  return {
    eyebrow: asString(row.eyebrow) || "Today Orders",
    title: asString(row.title),
    headline: asString(row.headline),
    summary: asString(row.summary),
    items,
  };
}

async function generatePlannerOrdersWithOpenAI(
  params: GenerateOpenAIRecoveryPlannerParams
): Promise<{
  generatedText: string;
  model: string | null;
  module: AIPlannerChecklistModule;
}> {
  const apiKey = normalizeApiKey();
  const baseUrl = resolveApiBaseUrl();
  const model = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: baseUrl,
    apiKey,
    model: resolveModel(),
    scope: "recovery",
  }).model;

  const context = buildUserContext(params);
  const developerPrompt = buildPlannerOrdersDeveloperPrompt(
    params.language,
    params.phase ?? "start",
    params.requestedOrderCount
  );
  const userPrompt = buildPlannerOrdersUserPrompt({
    language: params.language,
    context,
    recoveryResult: params.recoveryResult,
    phase: params.phase ?? "start",
    requestedOrderCount: params.requestedOrderCount,
  });
  const maxOutputTokens = Math.max(resolveMaxOutputTokens(), 2200);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);

  try {
    let lastError = `openai_request_failed_model:${model}`;
    for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
      const attempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt,
        userPrompt,
        signal: controller.signal,
        maxOutputTokens: Math.min(3200, maxOutputTokens + attemptIndex * 400),
        logFeature: "planner_orders",
        language: params.language,
        dateISO: params.todayISO,
        phase: params.phase ?? "start",
      });

      if (!attempt.text) {
        lastError = attempt.error ?? `openai_request_failed_model:${model}`;
        if (!isRetryableRecoveryError(lastError)) break;
        if (attemptIndex < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attemptIndex + 1)));
        }
        continue;
      }

      const generatedText = attempt.text.trim();
      const parsed = parseJsonObject(generatedText);
      if (!parsed) {
        lastError = `openai_planner_orders_non_json_model:${model}`;
        continue;
      }

      const checklistModule = parsePlannerChecklistModule(
        parsed,
        params.language,
        params.requestedOrderCount
      );
      const targetCount = normalizeRequestedOrderCount(params.requestedOrderCount);
      if (
        !checklistModule.title ||
        !checklistModule.headline ||
        !checklistModule.summary ||
        checklistModule.items.length < 1 ||
        checklistModule.items.length > 5 ||
        (targetCount != null && checklistModule.items.length !== targetCount)
      ) {
        lastError = `openai_planner_orders_incomplete_model:${model}`;
        continue;
      }

      return { generatedText, model, module: checklistModule };
    }
    throw new Error(lastError);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`openai_timeout_model:${model}`);
    }
    if (typeof err?.message === "string" && err.message.trim()) {
      throw new Error(err.message.trim());
    }
    throw new Error(`openai_fetch_model:${model}_${truncateError(err?.message ?? "unknown")}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateAIRecoveryPlannerModulesWithOpenAI(
  params: GenerateOpenAIRecoveryPlannerParams
): Promise<OpenAIRecoveryPlannerModulesOutput> {
  const result = await generatePlannerOrdersWithOpenAI(params);
  return {
    result: {
      heroTitle: params.language === "en" ? "AI Customized Recovery" : "AI 맞춤회복",
      heroSummary:
        params.language === "en"
          ? params.phase === "after_work"
            ? "The morning recovery thread now continues into after-work checklist orders."
            : "Start-of-day recovery now flows directly into today's checklist orders."
          : params.phase === "after_work"
            ? "아침 회복 흐름을 이어 받아 퇴근 후 오더로 연결합니다."
            : "오늘 시작 회복을 바로 체크리스트 오더로 이어서 봅니다.",
      orders: result.module,
    },
    generatedText: result.generatedText,
    engine: "openai",
    model: result.model,
    debug: null,
  };
}
