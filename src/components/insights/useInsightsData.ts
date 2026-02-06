"use client";

import { useMemo } from "react";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import type { Shift } from "@/lib/types";
import { menstrualContextForDate } from "@/lib/menstrual";
import { useAppStore } from "@/lib/store";
import { computeVitalsRange, type DailyVital } from "@/lib/vitals";
import { computePersonalizationAccuracy, topFactors } from "@/lib/insightsV2";
import { statusFromScore, vitalDisplayScore } from "@/lib/wnlInsight";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import { translate } from "@/lib/i18n";

export const INSIGHTS_MIN_DAYS = 7;
// Toggle back to true when you want to re-enable the 7-day insights lock.
export const INSIGHTS_LOCK_ENABLED = false;

export function isInsightsLocked(recordedDays: number) {
  return INSIGHTS_LOCK_ENABLED && recordedDays < INSIGHTS_MIN_DAYS;
}

export function shiftKo(shift: Shift) {
  switch (shift) {
    case "D":
      return translate("근무 D");
    case "E":
      return translate("근무 E");
    case "N":
      return translate("근무 N");
    case "M":
      return translate("근무 M");
    case "OFF":
      return "OFF";
    case "VAC":
      return "VA";
  }
}

export function fmtMD(iso?: ISODate | null) {
  if (!iso) return "--/--";
  const parts = String(iso).split("-");
  if (parts.length < 3) return String(iso);
  const m = parts[1];
  const d = parts[2];
  return `${m}/${d}`;
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function countShift(vitals: DailyVital[]) {
  const out: Record<Shift, number> = { D: 0, E: 0, N: 0, M: 0, OFF: 0, VAC: 0 };
  for (const v of vitals) out[v.shift] += 1;
  return out;
}

function buildSyncLabel(percent: number, daysWithAnyInput: number) {
  if (percent >= 88) return translate("싱크 완료: 예측 정확도 {percent}%", { percent });
  return translate("프리셉터 싱크(Sync): {count}일차", { count: Math.max(1, daysWithAnyInput) });
}

export function useInsightsData() {
  const state = useAppStore();

  const end = todayISO();
  const start = toISODate(addDays(fromISODate(end), -6));

  const vitals = useMemo(() => computeVitalsRange({ state, start, end }), [state, start, end]);
  const vmap = useMemo(() => new Map(vitals.map((v) => [v.dateISO, v])), [vitals]);
  const todayVital = vmap.get(end) ?? (vitals.length ? vitals[vitals.length - 1] : null);

  const todayShiftFromSchedule = state.schedule?.[end] as Shift | undefined;
  const hasTodayShift = Boolean(todayShiftFromSchedule);
  const todayShift: Shift = todayShiftFromSchedule ?? todayVital?.shift ?? "OFF";
  const menstrual = useMemo(
    () => menstrualContextForDate(end, state.settings?.menstrual ?? null),
    [end, state.settings]
  );

  const accuracy = useMemo(
    () => computePersonalizationAccuracy({ state, start, end, vitals }),
    [state, start, end, vitals]
  );

  const daysWithAnyInput = useMemo(() => {
    let c = 0;
    for (let i = 0; i < 7; i++) {
      const iso = toISODate(addDays(fromISODate(start), i));
      const b = (state.bio ?? {})[iso] ?? null;
      const e = (state.emotions ?? {})[iso] ?? null;
      if (hasHealthInput(b, e)) c += 1;
    }
    return c;
  }, [state, start]);

  const syncLabel = useMemo(
    () => buildSyncLabel(accuracy.percent, daysWithAnyInput),
    [accuracy.percent, daysWithAnyInput]
  );

  const recordedDays = useMemo(
    () => countHealthRecordedDays({ bio: state.bio, emotions: state.emotions }),
    [state.bio, state.emotions]
  );

  const displayScores = useMemo(() => vitals.map((v) => vitalDisplayScore(v)), [vitals]);
  const avgDisplay = useMemo(() => Math.round(avg(displayScores)), [displayScores]);
  const avgBody = useMemo(() => Math.round(avg(vitals.map((v) => v.body.value))), [vitals]);
  const avgMental = useMemo(() => Math.round(avg(vitals.map((v) => v.mental.ema))), [vitals]);

  const bestWorst = useMemo(() => {
    if (!vitals.length) return { best: null as DailyVital | null, worst: null as DailyVital | null };
    const sorted = [...vitals].sort(
      (a, b) => Math.min(b.body.value, b.mental.ema) - Math.min(a.body.value, a.mental.ema)
    );
    return { best: sorted[0] ?? null, worst: sorted[sorted.length - 1] ?? null };
  }, [vitals]);

  const shiftCounts = useMemo(() => countShift(vitals), [vitals]);

  const trend = useMemo(
    () =>
      vitals.map((v) => ({
        label: fmtMD(v.dateISO),
        body: Math.round(v.body.value),
        mental: Math.round(v.mental.ema),
        shift: v.shift,
      })),
    [vitals]
  );

  const top3 = useMemo(() => topFactors(vitals, 3), [vitals]);
  const top1 = top3?.[0] ?? null;

  const todayDisplay = useMemo(() => vitalDisplayScore(todayVital), [todayVital]);

  const status = useMemo(() => statusFromScore(todayDisplay), [todayDisplay]);
  const fastCharge = useMemo(() => todayDisplay < 30, [todayDisplay]);

  return {
    state,
    start,
    end,
    vitals,
    todayVital,
    todayShift,
    hasTodayShift,
    menstrual,
    accuracy,
    syncLabel,
    daysWithAnyInput,
    recordedDays,
    avgDisplay,
    avgBody,
    avgMental,
    bestWorst,
    shiftCounts,
    trend,
    top3,
    top1,
    todayDisplay,
    status,
    fastCharge,
  };
}
