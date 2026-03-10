import type { ISODate } from "@/lib/date";
import type { AppState, BioInputs, EmotionEntry } from "@/lib/model";
import type { DailyVital } from "@/lib/vitals";

export type RecoveryPhase = "start" | "after_work";

export const DEFAULT_RECOVERY_PHASE: RecoveryPhase = "start";

export type AfterWorkReadiness = {
  ready: boolean;
  recordedCount: number;
  recordedLabels: string[];
};

function hasNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasText(value: unknown) {
  return typeof value === "string" && value.replace(/\s+/g, " ").trim().length > 0;
}

export function normalizeRecoveryPhase(value: unknown): RecoveryPhase {
  return value === "after_work" ? "after_work" : DEFAULT_RECOVERY_PHASE;
}

export function recoveryPhaseTitle(phase: RecoveryPhase, language: "ko" | "en" = "ko") {
  if (language === "en") {
    return phase === "after_work" ? "After-work Recovery" : "Start-of-day Recovery";
  }
  return phase === "after_work" ? "퇴근 후 회복" : "오늘 시작 회복";
}

export function recoveryPhaseEyebrow(phase: RecoveryPhase, language: "ko" | "en" = "ko") {
  if (language === "en") {
    return phase === "after_work" ? "AFTER WORK RECOVERY" : "START OF DAY RECOVERY";
  }
  return phase === "after_work" ? "퇴근 후 회복 업데이트" : "오늘 시작 회복";
}

export function recoveryPhaseDescription(phase: RecoveryPhase, language: "ko" | "en" = "ko") {
  if (language === "en") {
    return phase === "after_work"
      ? "Use today's actual logs, the morning recovery brief, and order progress to update tonight's recovery."
      : "Use yesterday's records and today's sleep only to set a safe recovery direction for starting the day.";
  }
  return phase === "after_work"
    ? "오늘 실제 기록과 아침 회복 흐름, 오더 진행 상황을 반영해 오늘 밤 회복과 내일 보호 방향을 업데이트합니다."
    : "전날 기록과 오늘 수면만 기준으로 오늘 하루를 어떻게 시작할지 안전하게 정리합니다.";
}

export function buildRecoveryOrderProgressId(phase: RecoveryPhase, itemId: string) {
  const value = String(itemId ?? "").trim();
  return value ? `${phase}:${value}` : phase;
}

export function parseRecoveryOrderProgressId(value: string | null | undefined): {
  phase: RecoveryPhase;
  itemId: string;
} | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const [phaseRaw, ...rest] = raw.split(":");
  const itemId = rest.join(":").trim();
  if (!itemId) return null;
  return {
    phase: normalizeRecoveryPhase(phaseRaw),
    itemId,
  };
}

function sanitizeStartBioInput(bio: BioInputs | undefined | null): BioInputs | undefined {
  if (!bio) return undefined;
  return {
    sleepHours: bio.sleepHours ?? null,
    napHours: bio.napHours ?? null,
  };
}

export function buildRecoveryPhaseState(state: AppState, todayISO: ISODate, phase: RecoveryPhase): AppState {
  if (phase === "after_work") return state;

  const nextBio = { ...state.bio };
  const nextEmotions = { ...state.emotions };

  nextBio[todayISO] = sanitizeStartBioInput(state.bio?.[todayISO]);
  delete nextEmotions[todayISO];

  return {
    ...state,
    bio: nextBio,
    emotions: nextEmotions,
  };
}

export function getAfterWorkReadiness(state: Pick<AppState, "bio" | "emotions">, todayISO: ISODate): AfterWorkReadiness {
  const todayBio = state.bio?.[todayISO] ?? null;
  const todayEmotion = state.emotions?.[todayISO] ?? null;
  const labels: string[] = [];

  if (hasNumber(todayBio?.stress)) labels.push("스트레스");
  if (hasNumber(todayBio?.activity)) labels.push("활동");
  if (hasNumber(todayBio?.caffeineMg)) labels.push("카페인");
  if (hasNumber(todayBio?.mood) || hasNumber(todayEmotion?.mood)) labels.push("기분");
  if (
    (Array.isArray(todayBio?.workEventTags) && todayBio.workEventTags.filter(Boolean).length > 0) ||
    hasText(todayBio?.workEventNote)
  ) {
    labels.push("근무 메모");
  }

  const recordedLabels = Array.from(new Set(labels));
  return {
    ready: recordedLabels.length >= 2,
    recordedCount: recordedLabels.length,
    recordedLabels,
  };
}

export function buildAfterWorkMissingLabels(recordedLabels: string[]) {
  const keep = new Set(recordedLabels);
  return ["스트레스", "카페인", "활동", "기분", "근무 메모"].filter((label) => !keep.has(label));
}

export function stripStartPhaseDynamicInputs(vital: DailyVital | null): DailyVital | null {
  if (!vital) return null;

  return {
    ...vital,
    note: undefined,
    emotion: undefined,
    inputs: {
      ...vital.inputs,
      stress: undefined,
      activity: undefined,
      mood: undefined,
      caffeineMg: undefined,
      workEventTags: undefined,
      workEventNote: undefined,
    },
    factors: vital.factors
      ? {
          ...vital.factors,
          stress: 0,
          activity: 0,
          caffeine: 0,
          mood: 0,
        }
      : vital.factors,
  };
}

export function stripStartPhaseDynamicInputsFromVitals(vitals: DailyVital[], todayISO: ISODate) {
  return vitals.map((vital) => (vital.dateISO === todayISO ? stripStartPhaseDynamicInputs(vital) ?? vital : vital));
}
