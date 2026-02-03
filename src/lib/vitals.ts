// src/lib/vitals.ts
import type { ISODate } from "@/lib/date";
import { addDays, diffDays, fromISODate, toISODate } from "@/lib/date";
import { menstrualContextForDate } from "@/lib/menstrual";
import type { AppState, BioInputs, EmotionEntry } from "@/lib/model";
import { defaultBio } from "@/lib/model";
import type { Shift } from "@/lib/types";
import { defaultMNLState, stepMNLBatteryEngine } from "@/lib/mnlBatteryEngine";
import { shiftTimes } from "@/lib/wnlInsight";

export type RiskTone = "green" | "orange" | "red";

export type DailyVital = {
  dateISO: ISODate;
  shift: Shift;
  note?: string;
  emotion?: EmotionEntry;

  inputs: {
    sleepHours?: number | null;
    napHours?: number | null;
    sleepQuality?: number | null;
    sleepTiming?: "auto" | "night" | "day" | "mixed" | null;
    stress?: number | null; // 0..3
    activity?: number | null; // 0..3
    caffeineMg?: number | null;
    caffeineLastAt?: string | null;
    fatigueLevel?: number | null;
    symptomSeverity?: number | null; // 0..3
    menstrualStatus?: "none" | "pms" | "period" | null;
    menstrualFlow?: number | null;
    shiftOvertimeHours?: number | null;
  };

  menstrual: ReturnType<typeof menstrualContextForDate>;

  body: {
    value: number; // 0..100
    change: number; // -100..100
    tone: RiskTone;
    band?: string;
    notes?: string[];
  };

  mental: {
    raw: number; // 0..100 (그날 입력 기반)
    ema: number; // 0..100 (스무딩)
    change: number;
    tone: RiskTone;
  };

  burnout: {
    level: "ok" | "warning" | "danger";
    reason: string;
  };

  insight?: string;

  // v2.0: 인사이트용 방전 요인(기간 집계)
  factors?: {
    sleep: number;
    stress: number;
    activity: number;
    shift: number;
    caffeine: number;
    menstrual: number;
    mood: number;
  };

  // v2.1: 회복 처방용 핵심 지표(엔진 hidden + diagnostics)
  engine?: {
    // hidden state
    sleepDebtHours: number; // 0..20
    nightStreak: number; // 0..5
    // diagnostics
    CMF: number; // 0..1 (legacy: 리듬 불일치)
    SRS: number; // 0..1 (legacy: 수면회복)
    CSD: number; // 0..1 (legacy: 카페인 잔존)
    CSI: number; // 0..1 (Circadian Strain Index)
    SRI: number; // 0..1 (Sleep Recovery Index)
    CIF: number; // 0..1 (Caffeine Influence Factor)
    SLF: number; // 0..1 (Stress Load Factor)
    MIF: number; // 0..1 (Menstrual Impact Factor)
    MF: number; // 0..1 (Mood Factor)
    caf_sleep: number; // normalized caffeine residual used for sleep
    debt_n: number; // 0..1
    sleep_eff: number; // 0..14 (sleep_eff hours)
  };
};

function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function toneFromScore(score01: number): RiskTone {
  if (score01 < 40) return "red";
  if (score01 < 60) return "orange";
  return "green";
}

function defaultShiftFallback(): Shift {
  return "OFF";
}

function normalizeBio(bio?: BioInputs | null): Required<BioInputs> {
  const base = defaultBio();
  return {
    sleepHours: bio?.sleepHours ?? base.sleepHours ?? null,
    napHours: (bio as any)?.napHours ?? (base as any).napHours ?? 0,
    sleepQuality: (bio as any)?.sleepQuality ?? (base as any).sleepQuality ?? null,
    sleepTiming: (bio as any)?.sleepTiming ?? (base as any).sleepTiming ?? "auto",
    stress: (bio?.stress ?? base.stress ?? null) as any,
    activity: (bio?.activity ?? base.activity ?? null) as any,
    caffeineMg: bio?.caffeineMg ?? base.caffeineMg ?? null,
    caffeineLastAt: (bio as any)?.caffeineLastAt ?? (base as any).caffeineLastAt ?? null,
    fatigueLevel: (bio as any)?.fatigueLevel ?? (base as any).fatigueLevel ?? null,
    symptomSeverity: (bio as any)?.symptomSeverity ?? (base as any).symptomSeverity ?? 0,
    menstrualStatus: (bio as any)?.menstrualStatus ?? (base as any).menstrualStatus ?? "none",
    menstrualFlow: (bio as any)?.menstrualFlow ?? (base as any).menstrualFlow ?? 0,
    shiftOvertimeHours: (bio as any)?.shiftOvertimeHours ?? (base as any).shiftOvertimeHours ?? 0,
  };
}

function countNightsInWindow(schedule: Record<ISODate, Shift | undefined>, iso: ISODate, windowDays = 30) {
  let count = 0;
  const base = fromISODate(iso);
  for (let i = 0; i < windowDays; i++) {
    const d = addDays(base, -i);
    const key = toISODate(d);
    if ((schedule?.[key] ?? "OFF") === "N") count += 1;
  }
  return count;
}

function hoursBetweenShifts(prevISO: ISODate, prevShift: Shift, iso: ISODate, shift: Shift) {
  const prev = shiftTimes(prevISO, prevShift);
  const cur = shiftTimes(iso, shift);
  if (!prev || !cur) return null;
  const diff = (cur.start.getTime() - prev.end.getTime()) / 36e5;
  return Number.isFinite(diff) ? diff : null;
}

function shiftLengthHours(iso: ISODate, shift: Shift) {
  const w = shiftTimes(iso, shift);
  if (!w) return 0;
  const hours = (w.end.getTime() - w.start.getTime()) / 36e5;
  return Number.isFinite(hours) ? hours : 0;
}

function burnoutFrom(v: { body: number; mental: number; shift: Shift }): { level: "ok" | "warning" | "danger"; reason: string } {
  const { body, mental, shift } = v;

  if (body < 20 || mental < 25) {
    return {
      level: "danger",
      reason: shift === "N" ? "나이트 + 저회복 구간입니다. 실수/과부하 주의" : "회복이 많이 부족해요. 오늘은 생존 모드",
    };
  }
  if (body < 35 || mental < 40) {
    return {
      level: "warning",
      reason: shift === "N" ? "나이트/수면 영향이 커요. 루틴 업무 우선" : "피로 누적 신호. 쉬는 시간 확보",
    };
  }
  return {
    level: "ok",
    reason: "컨디션 안정 구간",
  };
}

function parseArgs(args: any[]): { state: AppState; start: ISODate; end: ISODate } | null {
  const a0 = args[0];

  // current call site: computeVitalsRange({ state: store, start, end })
  if (a0 && typeof a0 === "object" && (a0.state || a0.store) && (a0.start || a0.from) && (a0.end || a0.to)) {
    return {
      state: (a0.state ?? a0.store) as AppState,
      start: (a0.start ?? a0.from) as ISODate,
      end: (a0.end ?? a0.to) as ISODate,
    };
  }

  // legacy: computeVitalsRange(state, fromISO, toISO)
  if (args.length >= 3) {
    return { state: a0 as AppState, start: args[1] as ISODate, end: args[2] as ISODate };
  }

  // legacy: computeVitalsRange(state, {from,to})
  if (args.length >= 2 && args[1] && typeof args[1] === "object") {
    const r = args[1];
    return {
      state: a0 as AppState,
      start: (r.start ?? r.from ?? r.min) as ISODate,
      end: (r.end ?? r.to ?? r.max) as ISODate,
    };
  }

  return null;
}

/**
 * UI에서 쓰는 "기간 내 vitals 배열"을 생성.
 * - ❗️반드시 배열을 반환(components에서 for..of / map 사용)
 */
export function computeVitalsRange(...args: any[]): DailyVital[] {
  const parsed = parseArgs(args);
  if (!parsed) return [];

  const { state, start, end } = parsed;
  if (!start || !end) return [];

  const days = Math.max(0, diffDays(end, start));

  const schedule = (state as any)?.schedule ?? {};
  const notes = (state as any)?.notes ?? {};
  const emotions = (state as any)?.emotions ?? {};
  const bioMap = (state as any)?.bio ?? {};
  const settings = (state as any)?.settings ?? {};
  const menstrualSettings = settings?.menstrual;
  const profile = settings?.profile ?? { chronotype: 0.5, caffeineSensitivity: 1.0 };

  // ✅ 엔진은 hidden state를 누적하므로, 요청 범위보다 앞에서부터 계산해야 정확합니다.
  // - 저장된 데이터(근무/생체/감정) 중 가장 이른 날짜부터 end까지 순차 계산
  const keys = [
    ...Object.keys(schedule ?? {}),
    ...Object.keys(bioMap ?? {}),
    ...Object.keys(emotions ?? {}),
  ].filter(Boolean) as ISODate[];

  const earliestISO = keys.length
    ? (keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0] as ISODate)
    : start;
  const computeStart = earliestISO < start ? earliestISO : start;

  const computeDays = Math.max(0, diffDays(end, computeStart));
  let engineState = defaultMNLState();

  const computed = new Map<ISODate, DailyVital>();

  for (let i = 0; i <= computeDays; i++) {
    const iso = toISODate(addDays(fromISODate(computeStart), i));

    const shift = (schedule[iso] ?? defaultShiftFallback()) as Shift;
    const note = notes[iso];
    const emotion = emotions[iso] as EmotionEntry | undefined;
    const bio = normalizeBio(bioMap[iso] as BioInputs | undefined);

    const menstrual = menstrualContextForDate(iso, menstrualSettings);

    const stressLvl = clamp(Number((bio.stress ?? 1) as any) + 1, 1, 4);
    const activityLvl = clamp(Number((bio.activity ?? 1) as any) + 1, 1, 4);
    const moodLvl = clamp(Number(emotion?.mood ?? 3), 1, 5);

    const lmp = menstrualSettings?.enabled ? (menstrualSettings?.lastPeriodStart ?? null) : null;
    const cycleLen = menstrualSettings?.cycleLength ?? 28;
    const periodLen = menstrualSettings?.periodLength ?? 5;

    const sleepQuality = (bio as any).sleepQuality ?? null;
    const sleepTiming = (bio as any).sleepTiming ?? "auto";
    const caffeineLastAt = (bio as any).caffeineLastAt ?? null;
    const fatigueLevel = (bio as any).fatigueLevel ?? null;
    const menstrualStatus = (bio as any).menstrualStatus ?? null;
    const menstrualFlow = (bio as any).menstrualFlow ?? null;
    const overtimeHours = (bio as any).shiftOvertimeHours ?? null;

    const prevISO = toISODate(addDays(fromISODate(iso), -1));
    const prevShift = (schedule[prevISO] ?? defaultShiftFallback()) as Shift;
    const nightStreak = shift === "N" ? Math.min(5, (engineState.nightStreak ?? 0) + 1) : 0;
    const nightsIn30 = countNightsInWindow(schedule, iso, 30);
    const quickReturnHours = hoursBetweenShifts(prevISO, prevShift, iso, shift);
    const shiftHours = shiftLengthHours(iso, shift);

    const res = stepMNLBatteryEngine(
      engineState,
      {
        dateISO: iso,
        shift,
        sleepHours: clamp(Number(bio.sleepHours ?? 0), 0, 14),
        napHours: clamp(Number((bio as any).napHours ?? 0), 0, 4),
        sleepQuality,
        sleepTiming,
        caffeineMg: clamp(Number(bio.caffeineMg ?? 0), 0, 1200),
        caffeineLastAt,
        stressLvl,
        activityLvl,
        moodLvl,
        fatigueLvl: fatigueLevel ?? null,
        lmpDateISO: lmp,
        cycleLenAvg: cycleLen,
        periodLen,
        symptomSeverity: clamp(Number((bio as any).symptomSeverity ?? 0), 0, 3),
        menstrualStatus,
        menstrualFlow,
        nightStreak,
        nightsIn30,
        quickReturnHours,
        shiftLengthHours: shiftHours,
        overtimeHours,
      },
      {
        chronotype: profile?.chronotype ?? 0.5,
        caffeineSensitivity: profile?.caffeineSensitivity ?? 1.0,
      }
    );

    const prevBB = engineState.BB;
    const prevMB = engineState.MB;
    engineState = res.nextState;

    const bodyValue = engineState.BB;
    const mentalValue = engineState.MB;
    const bodyChange = Math.round((bodyValue - prevBB) * 10) / 10;
    const mentalChange = Math.round((mentalValue - prevMB) * 10) / 10;

    // ✅ 인사이트용 요인 점수(0..1) - depletion + sleep suppression 기반
    const d = res.diagnostics as any;
    const sri = Number(d.SRI ?? d.SRS ?? 1);
    const csi = Number(d.CSI ?? d.CMF ?? 0);
    const cif = Number(d.CIF ?? 1);
    const slf = Number(d.SLF ?? d.stress_n ?? 0);
    const mif = Number(d.MIF ?? 1);
    const mf = Number(d.MF ?? 1);
    const sleepImpact = clamp((1 - sri) + Number(d.debt_n ?? 0), 0, 2);
    const stressImpact = clamp(slf, 0, 1);
    const activityImpact = clamp(Number(d.activity_n ?? 0), 0, 1);
    const shiftImpact = clamp(csi, 0, 1);
    const caffeineImpact = clamp(1 - cif, 0, 1);
    const menstrualImpact = clamp(1 - mif, 0, 1);
    const moodImpact = clamp(Number(d.mood_bad_n ?? 0) + (1 - mf), 0, 1);
    const sum = sleepImpact + stressImpact + activityImpact + shiftImpact + caffeineImpact + menstrualImpact + moodImpact;
    const factors = sum > 0
      ? {
          sleep: sleepImpact / sum,
          stress: stressImpact / sum,
          activity: activityImpact / sum,
          shift: shiftImpact / sum,
          caffeine: caffeineImpact / sum,
          menstrual: menstrualImpact / sum,
          mood: moodImpact / sum,
        }
      : { sleep: 0, stress: 0, activity: 0, shift: 0, caffeine: 0, menstrual: 0, mood: 0 };

    const burnout = burnoutFrom({ body: bodyValue, mental: mentalValue, shift });

    computed.set(iso, {
      dateISO: iso,
      shift,
      note,
      emotion,
      inputs: {
        sleepHours: bio.sleepHours ?? null,
        napHours: (bio as any).napHours ?? null,
        sleepQuality: (bio as any).sleepQuality ?? null,
        sleepTiming: (bio as any).sleepTiming ?? null,
        stress: (bio.stress ?? null) as any,
        activity: (bio.activity ?? null) as any,
        caffeineMg: bio.caffeineMg ?? null,
        caffeineLastAt: (bio as any).caffeineLastAt ?? null,
        fatigueLevel: (bio as any).fatigueLevel ?? null,
        symptomSeverity: (bio as any).symptomSeverity ?? null,
        menstrualStatus: (bio as any).menstrualStatus ?? null,
        menstrualFlow: (bio as any).menstrualFlow ?? null,
        shiftOvertimeHours: (bio as any).shiftOvertimeHours ?? null,
      },
      menstrual,
      body: {
        value: bodyValue,
        change: bodyChange,
        tone: toneFromScore(bodyValue),
      },
      mental: {
        raw: mentalValue,
        ema: mentalValue,
        change: mentalChange,
        tone: toneFromScore(mentalValue),
      },
      burnout,
      engine: {
        // ✅ 엔진 hidden state는 sleepDebt(시간)로 저장됩니다. (과거 호환: sleepDebtHours)
        sleepDebtHours: clamp((engineState as any).sleepDebtHours ?? (engineState as any).sleepDebt ?? d.sleep_debt_next ?? 0, 0, 20),
        nightStreak: clamp(engineState.nightStreak ?? 0, 0, 5),
        CMF: clamp(csi, 0, 1),
        SRS: clamp(sri, 0, 1),
        CSD: clamp(Number(d.CSD ?? (1 - cif)), 0, 1),
        CSI: clamp(csi, 0, 1),
        SRI: clamp(sri, 0, 1),
        CIF: clamp(cif, 0, 1),
        SLF: clamp(slf, 0, 1),
        MIF: clamp(mif, 0, 1),
        MF: clamp(mf, 0, 1),
        caf_sleep: clamp(d.caf_sleep ?? 0, 0, 1),
        debt_n: clamp(d.debt_n ?? 0, 0, 1),
        sleep_eff: clamp(d.sleep_eff ?? 0, 0, 14),
      },
      factors,
    });
  }

  // 반환 범위만 잘라서 정렬
  const out: DailyVital[] = [];
  for (let i = 0; i <= days; i++) {
    const iso = toISODate(addDays(fromISODate(start), i));
    const v = computed.get(iso);
    if (v) out.push(v);
  }
  return out;
}

/**
 * DailyVital[] -> Map<ISODate, DailyVital>
 * (Home / Schedule / Insights에서 vmap.get(...) 형태로 사용)
 */
export function vitalMapByISO(vitals: DailyVital[]): Map<ISODate, DailyVital> {
  const m = new Map<ISODate, DailyVital>();
  if (!Array.isArray(vitals)) return m;
  for (const v of vitals) {
    if (v && v.dateISO) m.set(v.dateISO, v);
  }
  return m;
}
