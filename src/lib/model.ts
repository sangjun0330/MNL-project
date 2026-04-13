import type { ISODate } from "@/lib/date";
import { todayISO } from "@/lib/date";
import {
  defaultMemoState,
  defaultRecordState,
  type RNestMemoState,
  type RNestRecordState,
} from "@/lib/notebook";
import type { Shift } from "@/lib/types";

// =========================
// 커스텀 근무 타입
// =========================

/** 의미 타입 — AI/회복 분석 + 통계 기반 */
export type CoreShift = "D" | "E" | "N" | "M" | "OFF" | "VAC";

/**
 * 병원별 커스텀 근무 정의.
 * schedule[date]에는 semanticType이 저장되고,
 * shiftNames[date]에 displayName이 저장되므로 기존 코드 변경 없음.
 */
export type CustomShiftDef = {
  /** crypto.randomUUID()로 생성된 고유 ID */
  id: string;
  /** 표시 이름: "낮번", "야간특", "PM" 등 */
  displayName: string;
  /** AI/회복 분석에 사용할 의미 타입 */
  semanticType: CoreShift;
  /** OCR 인식 별칭: ["낮", "AM", "오전", "D번"] */
  aliases: string[];
};

// =========================
// Domain types (UI에서 직접 사용)
// =========================

export type MoodScore = 1 | 2 | 3 | 4 | 5;
export type StressLevel = 0 | 1 | 2 | 3;
export type ActivityLevel = 0 | 1 | 2 | 3;

export type EmotionEntry = {
  mood: MoodScore; // 1..5
  tags?: string[];
  note?: string;
  createdAt?: number;
};

export type BioInputs = {
  // Active ScheduleRecordSheet inputs
  sleepHours?: number | null; // 0..16
  napHours?: number | null; // 0..4
  stress?: StressLevel | null; // 0..3
  activity?: ActivityLevel | null; // 0..3
  caffeineMg?: number | null; // 0..1000
  // Compatibility field: current product still mirrors mood into bio for legacy readers.
  mood?: MoodScore | null; // 1..5
  // 0=없음, 1~3=강도
  symptomSeverity?: 0 | 1 | 2 | 3 | null;
  menstrualStatus?: "none" | "pms" | "period" | null;
  menstrualFlow?: 0 | 1 | 2 | 3 | null;
  // v3.0: 근무 이벤트 태그(다중 선택 + 직접 입력)
  workEventTags?: string[] | null;
  // v3.0: 근무 이벤트 상세 메모
  workEventNote?: string | null;

  // Compatibility-only / legacy-extended-log fields
  // The primary ScheduleRecordSheet UI does not actively collect these values.
  // They are still accepted for legacy payloads and the DailyLogSheet extended editor.
  sleepQuality?: 1 | 2 | 3 | 4 | 5 | null;
  sleepTiming?: "auto" | "night" | "day" | "mixed" | null;
  caffeineLastAt?: string | null;
  fatigueLevel?: number | null;
  shiftOvertimeHours?: number | null;
};

export type ProfileSettings = {
  // 0.0(아침형) ~ 1.0(야행성)
  chronotype: number;
  // 0.5~1.5 (카페인 반감기 승수)
  caffeineSensitivity: number;
};

export type MenstrualSettings = {
  enabled: boolean;
  // ✅ SettingsPage / menstrual.ts가 기대하는 키
  lastPeriodStart: ISODate | null;
  cycleLength: number; // 20~45
  periodLength: number; // 2~10

  // 확장(선택)
  lutealLength?: number;
  pmsDays?: number;
  sensitivity?: number;

  // 🔁 구버전 호환(있어도 무시 가능)
  startISO?: ISODate | null;
};

export type CustomShiftType = {
  id: string;
  displayName: string;
  semanticType: Shift;
  aliases: string[];
};

export type AppSettings = {
  schedulePatternEnabled?: boolean;
  defaultSchedulePattern?: string; // e.g. D2E2N2OFF2
  schedulePatternAppliedFrom?: ISODate | null;
  customShiftTypes?: CustomShiftType[];
  ocrLastUserName?: string;

  emotionTagsPositive?: string[];
  emotionTagsNegative?: string[];

  menstrual: MenstrualSettings;

  // v2.0 personalization
  profile?: ProfileSettings;
  // UI preferences
  language?: "ko" | "en";
  // onboarding
  hasSeenOnboarding?: boolean;

  // v3.1 커스텀 근무 타입 (병원별 이름 설정)
  customShiftTypes?: CustomShiftDef[];
  /** 다인 근무표 OCR 시 마지막으로 사용한 이름 */
  ocrLastUserName?: string;
};

export type AppState = {
  selected?: ISODate;
  schedule: Record<ISODate, Shift | undefined>;
  shiftNames: Record<ISODate, string | undefined>;
  notes: Record<ISODate, string | undefined>;
  emotions: Record<ISODate, EmotionEntry | undefined>;
  bio: Record<ISODate, BioInputs | undefined>;
  memo: RNestMemoState;
  records: RNestRecordState;
  settings: AppSettings;
};

export type AppStore = AppState & {
  // 상태 전체(필요한 화면에서 사용)
  getState: () => AppState;

  // actions
  setSelected: (iso: ISODate) => void;
  setSettings: (patch: Partial<AppSettings>) => void;

  setShiftForDate: (iso: ISODate, shift: Shift) => void;
  batchSetSchedule: (patch: Record<ISODate, Shift>) => void;
  setShiftNameForDate: (iso: ISODate, name: string) => void;
  batchSetShiftNames: (patch: Record<ISODate, string>) => void;
  clearShiftNameForDate: (iso: ISODate) => void;
  /** OCR 결과 일괄 적용: shiftNames를 한 번에 병합 */
  batchSetShiftNames: (patch: Record<ISODate, string>) => void;

  setNoteForDate: (iso: ISODate, note: string) => void;
  clearNoteForDate: (iso: ISODate) => void;

  setEmotionForDate: (iso: ISODate, emo: EmotionEntry) => void;
  clearEmotionForDate: (iso: ISODate) => void;

  setBioForDate: (iso: ISODate, patch: Partial<BioInputs>) => void;
  clearBioForDate: (iso: ISODate) => void;

  setMemoState: (next: RNestMemoState) => void;
  setRecordState: (next: RNestRecordState) => void;
};

// =========================
// Defaults
// =========================

export function defaultMenstrualSettings(): MenstrualSettings {
  return {
    enabled: false,
    lastPeriodStart: null,
    cycleLength: 28,
    periodLength: 5,
    lutealLength: 14,
    pmsDays: 4,
    sensitivity: 1,
  };
}

export function defaultSettings(): AppSettings {
  return {
    schedulePatternEnabled: true,
    defaultSchedulePattern: "D2E2N2M2OFF2",
    schedulePatternAppliedFrom: null,
    customShiftTypes: [],
    ocrLastUserName: "",
    emotionTagsPositive: [],
    emotionTagsNegative: [],
    menstrual: defaultMenstrualSettings(),
    profile: {
      chronotype: 0.5,
      caffeineSensitivity: 1.0,
    },
    language: "ko",
    hasSeenOnboarding: false,
    customShiftTypes: [],
    ocrLastUserName: "",
  };
}

export function defaultBio(): BioInputs {
  return {
    sleepHours: 7,
    napHours: 0,
    stress: 1,
    activity: 1,
    caffeineMg: 0,
    mood: 3,
    symptomSeverity: 0,
  };
}

export function emptyState(): AppState {
  return {
    selected: todayISO(),
    schedule: {},
    shiftNames: {},
    notes: {},
    emotions: {},
    bio: {},
    memo: defaultMemoState(),
    records: defaultRecordState(),
    settings: defaultSettings(),
  };
}
