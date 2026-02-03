"use client";

import { useMemo } from "react";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import type { Shift } from "@/lib/types";
import { menstrualContextForDate } from "@/lib/menstrual";
import { useAppStore } from "@/lib/store";
import { computeVitalsRange, type DailyVital } from "@/lib/vitals";
import { computePersonalizationAccuracy, topFactors } from "@/lib/insightsV2";
import { shiftWindow, statusFromScore, type OrderKey } from "@/lib/wnlInsight";
import { hasHealthInput } from "@/lib/healthRecords";

type OrdersSummary = {
  count: number;
  headline: string;
  items: { key: OrderKey; title: string }[];
};

export function shiftKo(shift: Shift) {
  switch (shift) {
    case "D":
      return "근무 D";
    case "E":
      return "근무 E";
    case "N":
      return "근무 N";
    case "M":
      return "근무 M";
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
  if (percent >= 88) return `싱크 완료: 예측 정확도 ${percent}%`;
  return `프리셉터 싱크(Sync): ${Math.max(1, daysWithAnyInput)}일차`;
}

function summarizeOrders(vital: DailyVital | null, pivotISO: ISODate): OrdersSummary {
  if (!vital) return { count: 0, headline: "오늘 오더 없음", items: [] };

  const shift = vital.shift;
  const now = new Date();
  const pivotDate = fromISODate(pivotISO);
  const { end } = shiftWindow(shift, pivotDate);

  const sleepDebt = vital.engine?.sleepDebtHours ?? 0;
  const nightStreak = vital.engine?.nightStreak ?? 0;
  const phase = vital.menstrual?.phase ?? "none";
  const sri = vital.engine?.SRI ?? vital.engine?.SRS ?? 1;
  const csi = vital.engine?.CSI ?? vital.engine?.CMF ?? 0;
  const cif = vital.engine?.CIF ?? (1 - (vital.engine?.CSD ?? 0));
  const slf = vital.engine?.SLF ?? 0;
  const mif = vital.engine?.MIF ?? 1;

  const list: { key: OrderKey; title: string }[] = [];

  if (sleepDebt > 2.0 || sri < 0.6) {
    list.push({ key: "sleep_debt", title: "수면 부채 경고" });
  }

  if (shift === "D" || shift === "E" || shift === "N" || shift === "M") {
    const cutoff = new Date(end.getTime() - 4 * 60 * 60 * 1000);
    const inWindow = now.getTime() >= cutoff.getTime() && now.getTime() <= end.getTime();
    if (inWindow || cif <= 0.75) {
      list.push({ key: "caffeine_npo", title: "카페인 금지 (NPO)" });
    }
  }

  if (shift === "N" && (phase === "pms" || phase === "period" || mif <= 0.85)) {
    list.push({ key: "hormone_duty", title: "호르몬 & 듀티 이중고" });
  }

  if (nightStreak >= 3 || csi >= 0.6 || slf >= 0.7) {
    list.push({ key: "night_adapt", title: "야행성 적응 완료" });
  }

  const count = list.length;
  const headline = count
    ? `${list[0].title}${count > 1 ? ` 외 ${count - 1}개` : ""}`
    : "현재 오더 없음";

  return { count, headline, items: list };
}

export function useInsightsData() {
  const state = useAppStore();

  const end = todayISO();
  const start = toISODate(addDays(fromISODate(end), -6));

  const vitals = useMemo(() => computeVitalsRange({ state, start, end }), [state, start, end]);
  const vmap = useMemo(() => new Map(vitals.map((v) => [v.dateISO, v])), [vitals]);
  const todayVital = vmap.get(end) ?? (vitals.length ? vitals[vitals.length - 1] : null);

  const todayShiftFromSchedule = state.schedule?.[end] as Shift | undefined;
  const hasTodayShift = typeof todayShiftFromSchedule === "string";
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
      const b = (state.bio ?? {})[iso];
      const e = (state.emotions ?? {})[iso];
      if (hasHealthInput(b, e)) c += 1;
    }
    return c;
  }, [state, start]);

  const syncLabel = useMemo(
    () => buildSyncLabel(accuracy.percent, daysWithAnyInput),
    [accuracy.percent, daysWithAnyInput]
  );

  const displayScores = useMemo(
    () => vitals.map((v) => Math.min(v.body.value, v.mental.ema)),
    [vitals]
  );
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

  const todayDisplay = useMemo(() => {
    if (!todayVital) return 0;
    return Math.round(Math.min(todayVital.body.value, todayVital.mental.ema));
  }, [todayVital]);

  const status = useMemo(() => statusFromScore(todayDisplay), [todayDisplay]);
  const fastCharge = useMemo(() => todayDisplay < 30, [todayDisplay]);

  const ordersSummary = useMemo(
    () => summarizeOrders(todayVital, end),
    [todayVital, end]
  );

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
    ordersSummary,
  };
}
