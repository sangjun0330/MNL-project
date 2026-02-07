// src/lib/mnlBatteryEngine.ts
// Nurse Shift-Work Recovery Engine v3.0
// - Implements SRI/CSI/SLF/MIF/CIF/MF based recovery model
// - Deterministic and profile-aware

import type { ISODate } from "@/lib/date";
import { diffDays } from "@/lib/date";
import type { Shift } from "@/lib/types";

export type MNLProfile = {
  chronotype: number; // 0..1
  caffeineSensitivity: number; // 0.5..1.5
};

export type MNLHiddenState = {
  BB: number; // 0..100
  MB: number; // 0..100
  prevShift: Shift;
  nightStreak: number; // 0..5
  sleepDebt: number; // 0..20 (hours)
};

export type MNLDailyInputs = {
  dateISO: ISODate;
  shift: Shift; // {D,E,N,M,OFF,VAC}
  sleepHours: number | null; // 0..14
  napHours: number | null; // 0..4
  sleepQuality?: 1 | 2 | 3 | 4 | 5 | null;
  sleepTiming?: "auto" | "night" | "day" | "mixed" | null;
  caffeineMg: number | null; // 0..1200
  caffeineLastAt?: string | null; // HH:mm
  stressLvl: number; // 1..4
  activityLvl: number; // 1..4
  moodLvl: number; // 1..5
  fatigueLvl?: number | null; // 0..10
  // menstrual
  lmpDateISO?: ISODate | null;
  cycleLenAvg?: number; // 20..45
  periodLen?: number; // 2..10
  symptomSeverity?: number; // 0..3
  menstrualStatus?: "none" | "pms" | "period" | null;
  menstrualFlow?: number | null; // 0..3
  // shift/circadian derived
  nightStreak?: number;
  nightsIn30?: number;
  quickReturnHours?: number | null;
  shiftLengthHours?: number | null;
  overtimeHours?: number | null;
  hasPriorSleepLog?: boolean;
  // imputation / confidence
  inputReliability?: number; // 0..1
  daysSinceAnyInput?: number | null;
  estimatedSleep?: boolean;
  estimatedCaffeine?: boolean;
  estimatedStress?: boolean;
  estimatedActivity?: boolean;
  estimatedMood?: boolean;
};

export type MNLDailyDiagnostics = {
  // normalized
  stress_n: number;
  activity_n: number;
  mood_bad_n: number;
  sleep_eff: number;
  sleep_n: number;
  caf_n: number;
  sym_n: number;

  // core indices
  SRI: number;
  CSI: number;
  SLF: number;
  MIF: number;
  CIF: number;
  MF: number;

  // intermediate
  sleep_debt_next: number;
  debt_n: number;
  caf_sleep: number;
  CSD: number;

  // legacy-ish fields for UI/insights
  CMF: number;
  MEN_PHYS: number;
  MEN_MOOD: number;
  SLEEP_SUPPRESS: number;
  SRS: number;
  PHYS_DEPL: number;
  MENT_DEPL: number;
  PHYS_RECV: number;
  MENT_RECV: number;
  sat_BB: number;
  sat_MB: number;

  // deltas
  dBB: number;
  dMB: number;
  inputReliability: number;
  uncertaintyPenalty: number;
  stalePenalty: number;
};

export type MNLDailyResult = {
  nextState: MNLHiddenState;
  diagnostics: MNLDailyDiagnostics;
};

function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function sat(batt: number) {
  const denom = Math.log(1 + 100 / 25);
  const num = Math.log(1 + (100 - batt) / 25);
  return clamp(num / denom, 0, 1);
}

function resolveSleepTiming(timing: MNLDailyInputs["sleepTiming"], shift: Shift) {
  if (timing === "night" || timing === "day" || timing === "mixed") return timing;
  if (shift === "N") return "day";
  return "night";
}

function circadianFactor(timing: "night" | "day" | "mixed") {
  if (timing === "night") return 1.0;
  if (timing === "mixed") return 0.9;
  return 0.8;
}

function defaultSleepStartHour(shift: Shift, timing: "night" | "day" | "mixed") {
  if (timing === "day") return 9; // day sleep after night shift
  if (timing === "mixed") return 1;
  // night sleep
  if (shift === "E") return 1;
  if (shift === "M") return 0;
  return 23;
}

function parseTimeHHMM(raw?: string | null) {
  if (!raw) return null;
  const [h, m] = raw.split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function hoursBetween(cafAt: { hh: number; mm: number }, sleepStartHour: number) {
  const cafHour = cafAt.hh + cafAt.mm / 60;
  let diff = sleepStartHour - cafHour;
  if (diff < 0) diff += 24;
  return diff;
}

function caffeineAtSleep(opts: {
  caffeineMg: number;
  caffeineLastAt?: string | null;
  shift: Shift;
  timing: "night" | "day" | "mixed";
  caffeineSensitivity: number;
}) {
  const { caffeineMg, caffeineLastAt, shift, timing, caffeineSensitivity } = opts;
  const halfLife = 5.0 * clamp(caffeineSensitivity, 0.5, 1.5);

  const parsed = parseTimeHHMM(caffeineLastAt);
  const sleepStartHour = defaultSleepStartHour(shift, timing);

  if (parsed) {
    const diff = hoursBetween(parsed, sleepStartHour);
    const remaining = caffeineMg * Math.pow(0.5, diff / halfLife);
    return Math.max(0, remaining);
  }

  // fallback gap (if time not provided)
  const gap = shift === "D" ? 6 : shift === "E" ? 4 : shift === "N" ? 2 : shift === "M" ? 5 : 5;
  const remaining = caffeineMg * Math.pow(0.5, gap / halfLife);
  return Math.max(0, remaining);
}

function targetSleepHours(shift: Shift) {
  return 7.0 + (shift === "N" ? 0.5 : shift === "E" ? 0.25 : shift === "M" ? 0.15 : 0.0);
}

function updateSleepDebt(opts: {
  shift: Shift;
  sleep_for_debt: number;
  sleepDebtPrev: number;
  hasSleepDurationLog: boolean;
  hasPriorSleepLog: boolean;
}) {
  const { shift, sleep_for_debt, sleepDebtPrev, hasSleepDurationLog, hasPriorSleepLog } = opts;

  // 기록이 없는 날: 과거 부채를 완만하게 유지하되, 장기 고착을 막기 위해
  // 아주 느린 자연 회복(감쇠)을 반영합니다.
  if (!hasSleepDurationLog) {
    // Sleep debt recovery is usually incomplete after one missed/short cycle.
    const carry = shift === "N" ? 0.992 : 0.978;
    const passiveRecover = shift === "OFF" || shift === "VAC" ? 0.22 : 0.08;
    const next = clamp(sleepDebtPrev * carry - passiveRecover, 0, 20);
    return { sleep_debt_next: next, debt_n: clamp(next / 10, 0, 1) };
  }

  const target_sleep = targetSleepHours(shift);
  const deficit = target_sleep - sleep_for_debt; // +: 부족, -: 초과 수면

  // 첫 유효 수면 기록은 "그날 부족분" 중심으로 보수적으로 시작
  if (!hasPriorSleepLog && sleepDebtPrev <= 0.01) {
    const seeded = clamp(Math.max(0, deficit), 0, 4.5);
    return { sleep_debt_next: seeded, debt_n: clamp(seeded / 10, 0, 1) };
  }

  // 실측 수면이 있는 날: 이전 부채를 일정 비율 유지 + 금일 부족분 누적 - 초과수면 회복
  const carry = 0.88;
  const add = Math.max(0, deficit) * 1.0;
  const recover = Math.max(0, -deficit) * 0.75;
  const sleep_debt_next = clamp(sleepDebtPrev * carry + add - recover, 0, 20);
  const debt_n = clamp(sleep_debt_next / 10, 0, 1);
  return { sleep_debt_next, debt_n };
}

function computeCSI(opts: {
  shift: Shift;
  nightStreak: number;
  nightsIn30: number;
  quickReturnHours?: number | null;
  shiftLengthHours?: number | null;
  overtimeHours?: number | null;
  chronotype: number;
}) {
  const {
    shift,
    nightStreak,
    nightsIn30,
    quickReturnHours,
    shiftLengthHours,
    overtimeHours,
    chronotype,
  } = opts;

  const nightFlag = shift === "N";
  const consecFactor = 1 + 0.2 * Math.max(0, nightStreak - 1);
  const quickPenalty = quickReturnHours != null && quickReturnHours < 11 ? 0.2 : 0;
  const monthlyPenalty = nightsIn30 > 15 ? 0.2 : nightsIn30 > 8 ? 0.1 : 0;
  const longPenalty = (shiftLengthHours ?? 0) + (overtimeHours ?? 0) >= 12 ? 0.1 : 0;
  const scheduleFactor = 1 + quickPenalty + monthlyPenalty + longPenalty;

  let csi = 0;
  if (nightFlag) {
    csi = 0.5 * consecFactor * scheduleFactor;
  } else {
    csi = quickPenalty * 0.5 + longPenalty * 0.4;
  }

  const chronoAdj = 1.1 - 0.2 * clamp(chronotype, 0, 1); // morning ↑, evening ↓
  return clamp(csi * chronoAdj, 0, 1);
}

function menstrualPhase(opts: {
  dateISO: ISODate;
  lmpDateISO?: ISODate | null;
  cycleLenAvg?: number;
  periodLen?: number;
}) {
  const { dateISO, lmpDateISO, cycleLenAvg, periodLen } = opts;
  if (!lmpDateISO) return { phase: "none" as const, dayIndex: 0 };
  const dayIndex = diffDays(dateISO, lmpDateISO);
  if (dayIndex < 0) return { phase: "none" as const, dayIndex: 0 };

  const cycle_len = clamp(Number(cycleLenAvg ?? 28), 20, 45);
  const period_len = clamp(Number(periodLen ?? 5), 2, 10);
  const cyc = ((dayIndex % cycle_len) + cycle_len) % cycle_len;

  const ovulationDay = clamp(cycle_len - 14, 6, cycle_len - 8);
  const pmsStart = Math.max(0, cycle_len - 5);

  if (cyc >= 0 && cyc <= period_len - 1) return { phase: "period" as const, dayIndex: cyc };
  if (cyc >= pmsStart) return { phase: "pms" as const, dayIndex: cyc };
  if (cyc === ovulationDay) return { phase: "ovulation" as const, dayIndex: cyc };
  if (cyc < ovulationDay) return { phase: "follicular" as const, dayIndex: cyc };
  return { phase: "luteal" as const, dayIndex: cyc };
}

export function defaultMNLState(): MNLHiddenState {
  return { BB: 70, MB: 70, prevShift: "OFF", nightStreak: 0, sleepDebt: 0.0 };
}

export function stepMNLBatteryEngine(state: MNLHiddenState, inputs: MNLDailyInputs, profile: MNLProfile): MNLDailyResult {
  const chronotype = clamp(Number(profile.chronotype ?? 0.5), 0, 1);
  const caffeineSensitivity = clamp(Number(profile.caffeineSensitivity ?? 1.0), 0.5, 1.5);

  const shift = inputs.shift;
  const hasSleepDurationLog = inputs.sleepHours != null || inputs.napHours != null;
  const hasPriorSleepLog = Boolean(inputs.hasPriorSleepLog);
  const inputReliability = clamp(Number(inputs.inputReliability ?? 1), 0.35, 1);
  const daysSinceAnyInput = inputs.daysSinceAnyInput == null ? null : Math.max(0, Number(inputs.daysSinceAnyInput));
  const sleep_hours = clamp(Number(inputs.sleepHours ?? 0), 0, 14);
  const nap_hours = clamp(Number(inputs.napHours ?? 0), 0, 4);
  const sleep_quality = inputs.sleepQuality ?? null;
  const sleep_timing = resolveSleepTiming(inputs.sleepTiming ?? "auto", shift);

  const caffeine_mg = clamp(Number(inputs.caffeineMg ?? 0), 0, 1200);
  const stress_lvl = clamp(Number(inputs.stressLvl ?? 1), 1, 4);
  const activity_lvl = clamp(Number(inputs.activityLvl ?? 1), 1, 4);
  const mood_lvl = clamp(Number(inputs.moodLvl ?? 3), 1, 5);
  const fatigue_lvl = clamp(Number(inputs.fatigueLvl ?? 0), 0, 10);
  const symptom_severity = clamp(Number(inputs.symptomSeverity ?? 0), 0, 3);

  const nightStreak = inputs.nightStreak ?? (shift === "N" ? Math.min(5, state.nightStreak + 1) : 0);
  const nightsIn30 = inputs.nightsIn30 ?? 0;

  // Normalize
  const stress_n = (stress_lvl - 1) / 3;
  const activity_n = (activity_lvl - 1) / 3;
  const mood_bad_n = (5 - mood_lvl) / 4;
  const fatigue_n = clamp(fatigue_lvl / 10, 0, 1);
  const sym_n = clamp(symptom_severity / 3, 0, 1);

  const total_sleep = clamp(sleep_hours + 0.6 * nap_hours, 0, 14);
  const hours_norm = clamp(total_sleep / 8, 0, 1.2);
  const quality_norm = sleep_quality == null ? 1 : clamp(Number(sleep_quality) / 5, 0.4, 1);
  const circadian_factor = circadianFactor(sleep_timing);

  const caf_remaining = caffeineAtSleep({
    caffeineMg: caffeine_mg,
    caffeineLastAt: inputs.caffeineLastAt ?? null,
    shift,
    timing: sleep_timing,
    caffeineSensitivity,
  });
  const caf_sleep = clamp(caf_remaining / 200, 0, 1);
  const CIF = clamp(1 - 0.5 * (caf_remaining / 100), 0.4, 1);
  const CSD = clamp(1 - CIF, 0, 1);

  // Missing sleep logs should not be treated as perfect recovery.
  const debtDrag = clamp(state.sleepDebt / 16, 0, 0.25);
  const missingSleepBase =
    shift === "N" ? 0.64 :
    shift === "E" ? 0.7 :
    shift === "M" ? 0.72 :
    0.75;
  const SRI_raw = hasSleepDurationLog
    ? clamp(hours_norm * quality_norm * circadian_factor, 0, 1)
    : clamp(missingSleepBase - debtDrag, 0.5, 0.82);
  const SRI = clamp(SRI_raw * CIF, 0, 1);

  const sleep_eff = hasSleepDurationLog
    ? clamp(SRI * 8, 0, 14)
    : clamp(targetSleepHours(shift) * (0.82 - debtDrag * 0.3), 3.5, 10);
  const sleep_n = clamp(SRI, 0, 1);
  const caf_n = clamp(caffeine_mg / 400, 0, 3);

  const sleep_for_debt = total_sleep;
  const { sleep_debt_next, debt_n } = updateSleepDebt({
    shift,
    sleep_for_debt,
    sleepDebtPrev: state.sleepDebt,
    hasSleepDurationLog,
    hasPriorSleepLog,
  });

  const CSI = computeCSI({
    shift,
    nightStreak,
    nightsIn30,
    quickReturnHours: inputs.quickReturnHours ?? null,
    shiftLengthHours: inputs.shiftLengthHours ?? null,
    overtimeHours: inputs.overtimeHours ?? null,
    chronotype,
  });

  const SLF = clamp(0.7 * stress_n + 0.3 * fatigue_n, 0, 1);
  const MF = clamp(1 - 0.1 * mood_bad_n, 0.85, 1);

  const predicted = menstrualPhase({
    dateISO: inputs.dateISO,
    lmpDateISO: inputs.lmpDateISO ?? null,
    cycleLenAvg: inputs.cycleLenAvg,
    periodLen: inputs.periodLen,
  });

  const menstrualFlow = clamp(Number(inputs.menstrualFlow ?? 0), 0, 3);
  const periodSignal = menstrualFlow > 0 || inputs.menstrualStatus === "period";
  const pmsSignal = inputs.menstrualStatus === "pms";
  const phase = periodSignal ? "period" : pmsSignal ? "pms" : predicted.phase;

  // Fuse predicted cycle phase + daily symptoms/flow into menstrual impact.
  const phaseBaseImpact =
    phase === "period" ? 0.16 :
    phase === "pms" ? 0.11 :
    phase === "luteal" ? 0.06 :
    phase === "follicular" ? 0.02 :
    phase === "ovulation" ? 0.01 :
    0.0;
  const symptomImpact = sym_n * 0.2;
  const flowImpact = menstrualFlow * 0.03;
  const nightPhaseImpact = shift === "N" && (phase === "period" || phase === "pms") ? 0.04 : 0;
  const menstrualImpactRaw = clamp(phaseBaseImpact + symptomImpact + flowImpact + nightPhaseImpact, 0, 0.45);
  const MIF = clamp(1 - menstrualImpactRaw, 0.55, 1.0);

  const menstrualImpact = clamp(1 - MIF, 0, 0.6);
  const MEN_PHYS = clamp(menstrualImpact * 0.6, 0, 0.6);
  const MEN_MOOD = clamp(menstrualImpact * 0.4, 0, 0.6);

  // Recovery score (0..100)
  const sleepPenalty = (1 - SRI) * 100;
  const debtPenalty = debt_n * 18;
  const csiPenalty = CSI * 20;
  const stressPenalty = SLF * 15;
  const menstrualPenalty = (1 - MIF) * 100;
  const moodPenalty = mood_bad_n * 5;
  const activityPenalty = activity_n * 5;
  const uncertaintyPenalty = clamp((1 - inputReliability) * 14, 0, 10);
  const stalePenalty =
    daysSinceAnyInput != null && daysSinceAnyInput > 2
      ? clamp((daysSinceAnyInput - 2) * 1.2, 0, 8)
      : 0;

  const totalPenalty =
    sleepPenalty +
    debtPenalty +
    csiPenalty +
    stressPenalty +
    menstrualPenalty +
    moodPenalty +
    activityPenalty +
    uncertaintyPenalty +
    stalePenalty;
  const recoveryScore = clamp(100 - totalPenalty, 0, 100);

  const bodyPenalty =
    sleepPenalty * 0.6 +
    debtPenalty * 0.6 +
    csiPenalty * 0.6 +
    activityPenalty * 1.2 +
    menstrualPenalty * 0.8 +
    uncertaintyPenalty * 0.8 +
    stalePenalty * 0.7;
  const mentalPenalty =
    sleepPenalty * 0.5 +
    debtPenalty * 0.5 +
    csiPenalty * 0.7 +
    stressPenalty * 1.0 +
    moodPenalty * 1.5 +
    menstrualPenalty * 0.5 +
    uncertaintyPenalty * 0.9 +
    stalePenalty * 0.9;

  const bodyTarget = clamp(100 - bodyPenalty, 0, 100);
  const mentalTarget = clamp(100 - mentalPenalty, 0, 100);

  const BB = clamp(round1(state.BB * 0.65 + bodyTarget * 0.35), 0, 100);
  const MB = clamp(round1(state.MB * 0.65 + mentalTarget * 0.35), 0, 100);

  const nextState: MNLHiddenState = {
    BB,
    MB,
    prevShift: shift,
    nightStreak,
    sleepDebt: sleep_debt_next,
  };

  const sat_BB = sat(state.BB);
  const sat_MB = sat(state.MB);

  const PHYS_DEPL = clamp(bodyPenalty / 100, 0, 1);
  const MENT_DEPL = clamp(mentalPenalty / 100, 0, 1);
  const PHYS_RECV = clamp(bodyTarget / 100, 0, 1);
  const MENT_RECV = clamp(mentalTarget / 100, 0, 1);

  const SLEEP_SUPPRESS = clamp(0.35 * CSD + 0.25 * SLF + 0.20 * CSI + 0.20 * debt_n, 0, 0.9);

  return {
    nextState,
    diagnostics: {
      stress_n,
      activity_n,
      mood_bad_n,
      sleep_eff,
      sleep_n,
      caf_n,
      sym_n,

      SRI,
      CSI,
      SLF,
      MIF,
      CIF,
      MF,

      sleep_debt_next,
      debt_n,
      caf_sleep,
      CSD,

      CMF: CSI,
      MEN_PHYS,
      MEN_MOOD,
      SLEEP_SUPPRESS,
      SRS: SRI,
      PHYS_DEPL,
      MENT_DEPL,
      PHYS_RECV,
      MENT_RECV,
      sat_BB,
      sat_MB,

      dBB: BB - state.BB,
      dMB: MB - state.MB,
      inputReliability,
      uncertaintyPenalty,
      stalePenalty,
    },
  };
}
