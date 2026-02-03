// src/lib/insightsV2.ts

import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, startOfWeekMonday, endOfWeekSunday, startOfMonth, endOfMonth } from "@/lib/date";
import type { DailyVital } from "@/lib/vitals";
import type { Shift } from "@/lib/types";
import type { AppState } from "@/lib/model";

export type PeriodMode = "weekly" | "monthly";

export function getLastCompletedWeekRange(today: ISODate): { start: ISODate; end: ISODate } {
  // 마지막 '일요일'이 포함된 주를 사용 (월~일)
  const t = fromISODate(today);
  const endSun = endOfWeekSunday(t);
  // 오늘이 주 중간이면 아직 주가 완성되지 않았으므로, 직전 주(지난 일요일)로 이동
  const todayISO = toISODate(t);
  const endISO = toISODate(endSun);
  const useEnd = endISO > todayISO ? toISODate(addDays(endSun, -7)) : endISO;
  const start = toISODate(addDays(fromISODate(useEnd), -6));
  return { start, end: useEnd };
}

export function getMonthRange(anyDayInMonth: ISODate): { start: ISODate; end: ISODate } {
  const d = fromISODate(anyDayInMonth);
  return { start: toISODate(startOfMonth(d)), end: toISODate(endOfMonth(d)) };
}

export function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function shiftCounts(vitals: DailyVital[]): Record<Shift, number> {
  const base: Record<Shift, number> = { D: 0, E: 0, N: 0, M: 0, OFF: 0, VAC: 0 };
  for (const v of vitals) base[v.shift] = (base[v.shift] ?? 0) + 1;
  return base;
}

export function gradeFromScore(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function bestAndWorstByTotal(vitals: DailyVital[]) {
  if (!vitals.length) return { best: null as DailyVital | null, worst: null as DailyVital | null };
  let best = vitals[0];
  let worst = vitals[0];
  for (const v of vitals) {
    const total = v.body.value + v.mental.ema;
    const bestTotal = best.body.value + best.mental.ema;
    const worstTotal = worst.body.value + worst.mental.ema;
    if (total > bestTotal) best = v;
    if (total < worstTotal) worst = v;
  }
  return { best, worst };
}

export type FactorKey = "sleep" | "stress" | "activity" | "shift" | "caffeine" | "menstrual" | "mood";

export const FACTOR_LABEL_KO: Record<FactorKey, string> = {
  sleep: "수면 부족",
  stress: "업무 스트레스",
  activity: "활동량",
  shift: "교대 리듬",
  caffeine: "카페인 잔존",
  menstrual: "PMS/생리",
  mood: "기분 저하",
};

export function aggregateFactors(vitals: DailyVital[]): Record<FactorKey, number> {
  const sum: Record<FactorKey, number> = {
    sleep: 0,
    stress: 0,
    activity: 0,
    shift: 0,
    caffeine: 0,
    menstrual: 0,
    mood: 0,
  };
  for (const v of vitals) {
    const f = v.factors;
    if (!f) continue;
    (Object.keys(sum) as FactorKey[]).forEach((k) => {
      sum[k] += Number((f as any)[k] ?? 0);
    });
  }
  const total = (Object.keys(sum) as FactorKey[]).reduce((a, k) => a + sum[k], 0);
  if (total <= 0) return sum;
  (Object.keys(sum) as FactorKey[]).forEach((k) => (sum[k] = sum[k] / total));
  return sum;
}

// =========================
// Personalization / Accuracy
// =========================

/**
 * v2 알고리즘의 factor(기여도) 기반 가중치 기본값.
 * - factor 총합이 0인 경우(데이터가 거의 없거나 계산 불가) fallback 용
 */
export const DEFAULT_PERSONALIZATION_WEIGHTS: Record<FactorKey, number> = {
  shift: 0.25,
  sleep: 0.2,
  stress: 0.15,
  activity: 0.1,
  caffeine: 0.1,
  menstrual: 0.1,
  mood: 0.1,
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function listDatesInclusive(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = fromISODate(start);
  const endD = fromISODate(end);
  while (cur.getTime() <= endD.getTime()) {
    out.push(toISODate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export type PersonalizationAccuracy = {
  percent: number; // 0..100
  weights: Record<FactorKey, number>; // sum ~= 1
  coverage: Record<FactorKey, number>; // 0..1
  missingTop: Array<{ key: FactorKey; label: string }>; // 가중치 높은데 커버리지 낮은 순
};

/**
 * "개인화 정확도" = (각 입력 항목 커버리지) × (알고리즘 factor 기반 가중치)
 *
 * - weights: vitals에 포함된 factors(수면/스트레스/교대/...)의 누적 기여도를 정규화해 사용
 * - coverage: 기간 내 실제 입력이 있는 날의 비율
 *
 * 참고:
 * - shift(근무표)는 schedule이 있을 때만 커버리지 증가
 * - menstrual은 (주기 설정이 켜져 있고 시작일이 있으면) 기간 전체 커버리지 1로 간주
 */
export function computePersonalizationAccuracy(args: {
  state: AppState;
  start: ISODate;
  end: ISODate;
  vitals: DailyVital[];
}): PersonalizationAccuracy {
  const { state, start, end, vitals } = args;
  const dates = listDatesInclusive(start, end);
  const days = Math.max(1, dates.length);

  // 1) weights: factor 누적 기여도 기반 (정규화)
  const agg = aggregateFactors(vitals);
  const aggTotal = (Object.keys(agg) as FactorKey[]).reduce((a, k) => a + agg[k], 0);
  const weights: Record<FactorKey, number> = aggTotal > 0 ? agg : { ...DEFAULT_PERSONALIZATION_WEIGHTS };

  // 2) coverage: 기간 내 입력이 있는 날 비율
  const coverage: Record<FactorKey, number> = {
    sleep: 0,
    stress: 0,
    activity: 0,
    shift: 0,
    caffeine: 0,
    menstrual: 0,
    mood: 0,
  };

  let sleepC = 0,
    stressC = 0,
    activityC = 0,
    shiftC = 0,
    caffeineC = 0,
    menstrualC = 0,
    moodC = 0;

  const menstrualOn = Boolean(state.settings?.menstrual?.enabled && state.settings?.menstrual?.lastPeriodStart);

  for (const iso of dates) {
    const b = (state.bio ?? {})[iso];
    const e = (state.emotions ?? {})[iso];
    const s = (state.schedule ?? {})[iso];

    if (s) shiftC += 1;

    if (b && b.sleepHours !== null && b.sleepHours !== undefined) sleepC += 1;
    if (b && b.stress !== null && b.stress !== undefined) stressC += 1;
    if (b && b.activity !== null && b.activity !== undefined) activityC += 1;
    if (b && b.caffeineMg !== null && b.caffeineMg !== undefined) caffeineC += 1;

    // menstrual: 설정 기반이면 전체 1로 처리, 아니면 symptomSeverity 입력 기반
    if (!menstrualOn) {
      if (b && b.symptomSeverity !== null && b.symptomSeverity !== undefined) menstrualC += 1;
    }

    if (e && e.mood !== null && e.mood !== undefined) moodC += 1;
  }

  coverage.shift = clamp01(shiftC / days);
  coverage.sleep = clamp01(sleepC / days);
  coverage.stress = clamp01(stressC / days);
  coverage.activity = clamp01(activityC / days);
  coverage.caffeine = clamp01(caffeineC / days);
  coverage.mood = clamp01(moodC / days);
  coverage.menstrual = menstrualOn ? 1 : clamp01(menstrualC / days);

  // 3) accuracy percent
  const sum = (Object.keys(weights) as FactorKey[]).reduce((a, k) => a + weights[k] * coverage[k], 0);
  const percent = Math.round(clamp01(sum) * 100);

  // 4) missing suggestions: 가중치가 높은데 coverage 낮은 항목
  const missingTop = (Object.keys(weights) as FactorKey[])
    .map((k) => ({ key: k, label: FACTOR_LABEL_KO[k], score: weights[k] * (1 - coverage[k]) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0.02) // 너무 미미한 건 제외
    .slice(0, 2)
    .map(({ key, label }) => ({ key, label }));

  return { percent, weights, coverage, missingTop };
}

export function topFactors(vitals: DailyVital[], topN = 3) {
  const agg = aggregateFactors(vitals);
  const rows = (Object.keys(agg) as FactorKey[])
    .map((k) => ({ key: k, label: FACTOR_LABEL_KO[k], pct: agg[k] }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, topN);
  return rows;
}
