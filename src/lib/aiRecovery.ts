import type { ISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";

export const AI_RECOVERY_PROMPT_VERSION = "2026-03-22.v1";
export const AI_RECOVERY_RETENTION_DAYS = 8;
export const AI_RECOVERY_MAX_CANDIDATES = 5;

export type AIRecoverySlot = "wake" | "postShift";
export type AIRecoveryStatus = "ready" | "fallback" | "failed";
export type AIRecoveryTone = "stable" | "noti" | "warning";
export type AIRecoveryEffort = "low" | "medium" | "high";
export type AIRecoveryLanguage = "ko" | "en";
export type AIRecoveryCandidateEffort = "low" | "medium" | "high";
export type AIRecoverySlotFit = "wake" | "postShift" | "both";

export type AIRecoveryBriefSection = {
  key: "focus" | "signal" | "weekly";
  title: string;
  body: string;
};

export type AIRecoveryCandidate = {
  id: string;
  title: string;
  why: string;
  expectedBenefit: string;
  effort: AIRecoveryCandidateEffort;
  minutes: number;
  slotFit: AIRecoverySlotFit;
  driverRefs: string[];
};

export type AIRecoveryBrief = {
  headline: string;
  summary: string;
  tone: AIRecoveryTone;
  topDrivers: string[];
  sections: AIRecoveryBriefSection[];
  weeklyNote: string;
  candidateActions: AIRecoveryCandidate[];
  defaultSelectionIds: string[];
  dataGaps: string[];
};

export type AIRecoveryResult = AIRecoveryBrief;

export type AIRecoveryOrder = {
  id: string;
  candidateId: string;
  title: string;
  whyNow: string;
  executionWindow: string;
  steps: string[];
  successCheck: string;
  avoid: string;
  workHint: string;
  minutes: number;
  safetyNote: string;
};

export type AIRecoveryContextMeta = {
  historyStart: ISODate;
  historyEnd: ISODate;
  todayShift: Shift;
  nextDuty: Shift | null;
  todaySleepHours: number | null;
  plannerTone: AIRecoveryTone;
  topFactorKeys: string[];
  todayVitalScore: number | null;
};

export type AIRecoverySelection = {
  selectedCandidateIds: string[];
  updatedAt: string;
};

export type AIRecoveryUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
};

export type AIRecoveryGenerationCounts = {
  brief: number;
  orders: number;
};

export type AIRecoveryGenerationQuota = {
  used: AIRecoveryGenerationCounts;
  limit: AIRecoveryGenerationCounts;
  canGenerateSession: boolean;
  canRegenerateOrders: boolean;
};

export type AIRecoveryOpenAIMeta = {
  briefResponseId: string | null;
  ordersResponseId: string | null;
  usage: {
    brief: AIRecoveryUsage | null;
    orders: AIRecoveryUsage | null;
    total: AIRecoveryUsage | null;
  };
  fallbackReason: string | null;
  gatewayProfile: "med_safety_shared";
};

export type AIRecoverySlotPayload = {
  status: AIRecoveryStatus;
  generatedAt: string;
  model: string;
  reasoningEffort: AIRecoveryEffort;
  language: AIRecoveryLanguage;
  promptVersion: string;
  inputSignature: string;
  context: AIRecoveryContextMeta;
  brief: AIRecoveryBrief | null;
  selection: AIRecoverySelection | null;
  orders: AIRecoveryOrder[];
  generationCounts: AIRecoveryGenerationCounts;
  openaiMeta: AIRecoveryOpenAIMeta;
};

export type AIRecoveryDayPayload = {
  version: 1;
  wake?: AIRecoverySlotPayload;
  postShift?: AIRecoverySlotPayload;
};

export type AIRecoveryDaily = Record<ISODate, AIRecoveryDayPayload | undefined>;

export type AIRecoveryGate = {
  allowed: boolean;
  code: string | null;
  message: string | null;
};

export type AIRecoverySessionResponse = {
  ok: true;
  data: {
    dateISO: ISODate;
    slot: AIRecoverySlot;
    slotLabel: string;
    slotDescription: string;
    language: AIRecoveryLanguage;
    gate: AIRecoveryGate;
    session: AIRecoverySlotPayload | null;
    stale: boolean;
    completions: string[];
    quota: AIRecoveryGenerationQuota;
    hasAIEntitlement: boolean;
    model: string | null;
    tier: string | null;
  };
};

export function isAIRecoverySlot(value: unknown): value is AIRecoverySlot {
  return value === "wake" || value === "postShift";
}

export function getAIRecoverySlotLabel(slot: AIRecoverySlot, todayShift: Shift | null | undefined) {
  if (slot === "wake") return "기상 후";
  return todayShift === "OFF" || todayShift === "VAC" ? "저녁 회복" : "퇴근 후";
}

export function getAIRecoverySlotDescription(slot: AIRecoverySlot, todayShift: Shift | null | undefined) {
  if (slot === "wake") return "오늘 수면과 최근 14일 기록으로 아침 회복 포인트를 정리합니다.";
  return todayShift === "OFF" || todayShift === "VAC" ? "저녁에 바로 할 회복 행동을 정리합니다." : "퇴근 후 바로 할 회복 행동을 정리합니다.";
}

export function normalizeAIRecoveryLanguage(value: unknown): AIRecoveryLanguage {
  return value === "en" ? "en" : "ko";
}

export function filterCompletionIdsForOrders(completions: unknown, orderIds: string[]) {
  if (!Array.isArray(completions) || orderIds.length === 0) return [];
  const allowed = new Set(orderIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of completions) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || !allowed.has(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function getAIRecoveryErrorMessage(code: unknown) {
  const value = typeof code === "string" ? code.trim() : "";
  if (!value) return "잠시 후 다시 시도해 주세요.";
  if (value === "login_required") return "로그인이 필요해요.";
  if (value === "plan_upgrade_required") return "Plus 또는 Pro에서 사용할 수 있어요.";
  if (value === "service_consent_required") return "서비스 동의 후 사용할 수 있어요.";
  if (value === "needs_more_records") return "건강 기록이 3일 이상 필요해요.";
  if (value === "wake_sleep_required") return "오늘 수면을 먼저 기록해 주세요.";
  if (value === "slot_not_available") return "아직 이 시간대가 아니에요.";
  if (value === "session_generation_limit_reached") return "오늘 해설 다시 만들기는 끝났어요.";
  if (value === "orders_generation_limit_reached") return "오늘 오더 다시 만들기는 끝났어요.";
  if (value === "candidate_ids_invalid_count") return "후보는 1개부터 5개까지 고를 수 있어요.";
  if (value === "candidate_ids_not_found") return "후보를 다시 골라 주세요.";
  if (value === "ai_recovery_session_missing") return "먼저 AI 맞춤회복을 만들어 주세요.";
  if (value === "order_id_invalid" || value === "order_id_not_found") return "오더를 다시 불러와 주세요.";
  if (value === "ai_recovery_openai_failed" || value === "ai_recovery_orders_failed") return "AI 연결이 잠시 불안정해요. 다시 시도해 주세요.";
  if (value.startsWith("http_")) return "잠시 후 다시 시도해 주세요.";
  if (value.startsWith("ai_recovery_")) return "AI 연결이 잠시 불안정해요. 다시 시도해 주세요.";
  return "잠시 후 다시 시도해 주세요.";
}
