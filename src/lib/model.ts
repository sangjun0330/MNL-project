import type { ISODate } from "@/lib/date";
import { todayISO } from "@/lib/date";
import type { Shift } from "@/lib/types";

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
  sleepHours?: number | null; // 0..16
  // v2.0: 낮잠(쪽잠) 시간
  napHours?: number | null; // 0..4
  // v3.0: 수면 품질(1..5, 5가 최고)
  sleepQuality?: 1 | 2 | 3 | 4 | 5 | null;
  // v3.0: 수면 타이밍 (auto = 미입력/자동 추정)
  sleepTiming?: "auto" | "night" | "day" | "mixed" | null;
  stress?: StressLevel | null; // 0..3
  activity?: ActivityLevel | null; // 0..3
  caffeineMg?: number | null; // 0..1000
  // v3.0: 마지막 카페인 섭취 시각 (HH:mm)
  caffeineLastAt?: string | null;
  // v3.0: 주관적 피로도 (0..10)
  fatigueLevel?: number | null;
  // v2.0: (여성) 통증/증상 강도
  // 0=없음, 1~3=강도
  symptomSeverity?: 0 | 1 | 2 | 3 | null;
  // v3.0: 생리 상태/출혈 강도
  menstrualStatus?: "none" | "pms" | "period" | null;
  menstrualFlow?: 0 | 1 | 2 | 3 | null;
  // v3.0: 근무 연장 시간(시간 단위)
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

export type AppSettings = {
  defaultSchedulePattern?: string; // e.g. D2E2N2OFF2
  schedulePatternAppliedFrom?: ISODate | null;

  emotionTagsPositive?: string[];
  emotionTagsNegative?: string[];

  menstrual: MenstrualSettings;

  // v2.0 personalization
  profile?: ProfileSettings;
  // UI preferences
  theme?: "light" | "dark";
  language?: "ko" | "en";
};

export type AppState = {
  selected?: ISODate;
  schedule: Record<ISODate, Shift | undefined>;
  shiftNames: Record<ISODate, string | undefined>;
  notes: Record<ISODate, string | undefined>;
  emotions: Record<ISODate, EmotionEntry | undefined>;
  bio: Record<ISODate, BioInputs | undefined>;
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
  clearShiftNameForDate: (iso: ISODate) => void;

  setNoteForDate: (iso: ISODate, note: string) => void;
  clearNoteForDate: (iso: ISODate) => void;

  setEmotionForDate: (iso: ISODate, emo: EmotionEntry) => void;
  clearEmotionForDate: (iso: ISODate) => void;

  setBioForDate: (iso: ISODate, patch: Partial<BioInputs>) => void;
  clearBioForDate: (iso: ISODate) => void;
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
    defaultSchedulePattern: "D2E2N2M2OFF2",
    schedulePatternAppliedFrom: null,
    emotionTagsPositive: [],
    emotionTagsNegative: [],
    menstrual: defaultMenstrualSettings(),
    profile: {
      chronotype: 0.5,
      caffeineSensitivity: 1.0,
    },
    theme: "light",
    language: "ko",
  };
}

export function defaultBio(): BioInputs {
  return {
    sleepHours: 7,
    napHours: 0,
    sleepQuality: null,
    sleepTiming: "auto",
    stress: 1,
    activity: 1,
    caffeineMg: 0,
    caffeineLastAt: null,
    fatigueLevel: null,
    symptomSeverity: 0,
    menstrualStatus: "none",
    menstrualFlow: 0,
    shiftOvertimeHours: 0,
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
    settings: defaultSettings(),
  };
}
