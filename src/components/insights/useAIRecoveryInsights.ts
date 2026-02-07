"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateAIRecovery, type AIRecoveryResult } from "@/lib/aiRecovery";
import type { AIRecoveryPayload, AIRecoveryApiSuccess } from "@/lib/aiRecoveryContract";
import { addDays, fromISODate, toISODate, type ISODate } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";
import type { Shift } from "@/lib/types";
import { computeVitalsRange, type DailyVital } from "@/lib/vitals";
import { hasHealthInput } from "@/lib/healthRecords";

type AnalysisContext = {
  analysisEnd: ISODate;
  vitals7: DailyVital[];
  prevWeek: DailyVital[];
  anchorVital: DailyVital | null;
};

function hasSleepHours(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function buildAnalysisContext(params: {
  todayISO: ISODate;
  state: ReturnType<typeof useInsightsData>["state"];
}): AnalysisContext {
  const { todayISO, state } = params;
  const analysisEnd = toISODate(addDays(fromISODate(todayISO), -1));
  const start14 = toISODate(addDays(fromISODate(analysisEnd), -13));
  const vitals14 = computeVitalsRange({ state, start: start14, end: analysisEnd });

  const inputDateSet = new Set<ISODate>();
  for (let i = 0; i < 14; i += 1) {
    const iso = toISODate(addDays(fromISODate(start14), i));
    const bio = state.bio?.[iso] ?? null;
    const emotion = state.emotions?.[iso] ?? null;
    if (hasHealthInput(bio, emotion)) inputDateSet.add(iso);
  }

  const start7 = toISODate(addDays(fromISODate(analysisEnd), -6));
  const vitals7 = vitals14.filter((v) => v.dateISO >= start7 && inputDateSet.has(v.dateISO));
  const prevWeek = vitals14.filter((v) => v.dateISO < start7 && inputDateSet.has(v.dateISO));
  const anchorVital = vitals14.find((v) => v.dateISO === analysisEnd) ?? vitals14[vitals14.length - 1] ?? null;

  return { analysisEnd, vitals7, prevWeek, anchorVital };
}

function buildPseudoTodayVital(params: {
  todayISO: ISODate;
  todayShift: Shift;
  todaySleepHours: number | null;
  anchorVital: DailyVital | null;
}): DailyVital | null {
  const { todayISO, todayShift, todaySleepHours, anchorVital } = params;
  if (!anchorVital) return null;

  const sleepHours = hasSleepHours(todaySleepHours)
    ? todaySleepHours
    : (anchorVital.inputs.sleepHours ?? null);

  return {
    ...anchorVital,
    dateISO: todayISO,
    shift: todayShift,
    inputs: {
      ...anchorVital.inputs,
      sleepHours,
    },
  };
}

function buildFallbackData(params: {
  todayISO: ReturnType<typeof useInsightsData>["end"];
  analysis: AnalysisContext;
  todayShift: Shift;
  stateSchedule: ReturnType<typeof useInsightsData>["state"]["schedule"];
  todaySleepHours: number | null;
  lang: "ko" | "en";
}): AIRecoveryPayload {
  const { todayISO, analysis, todayShift, stateSchedule, todaySleepHours, lang } = params;
  const nextISO = toISODate(addDays(fromISODate(todayISO), 1));
  const nextShift = (stateSchedule?.[nextISO] as Shift | undefined) ?? null;
  const pseudoTodayVital = buildPseudoTodayVital({
    todayISO,
    todayShift,
    todaySleepHours,
    anchorVital: analysis.anchorVital,
  });
  const fallbackResult: AIRecoveryResult = !analysis.vitals7.length
    ? {
        headline:
          lang === "en"
            ? "Log your health records to unlock personalized recovery guidance."
            : "건강 기록을 입력하면 맞춤 회복 처방을 자세히 제공해드려요.",
        compoundAlert: null,
        sections: [],
        weeklySummary: null,
      }
    : generateAIRecovery(
        pseudoTodayVital,
        analysis.vitals7,
        analysis.prevWeek,
        nextShift,
        lang
      );
  const todayVitalScore = pseudoTodayVital
    ? Math.round(Math.min(pseudoTodayVital.body.value, pseudoTodayVital.mental.ema))
    : null;

  return {
    dateISO: todayISO,
    language: lang,
    todayShift,
    nextShift,
    todayVitalScore,
    source: "local",
    engine: "rule",
    model: null,
    debug: null,
    result: fallbackResult,
  };
}

function buildSleepRequiredPayload(base: AIRecoveryPayload, lang: "ko" | "en"): AIRecoveryPayload {
  return {
    ...base,
    engine: "rule",
    debug: "today_sleep_required",
    result: {
      headline:
        lang === "en"
          ? "Please log today's sleep first. Recovery analysis will start right after."
          : "오늘 수면 기록을 먼저 입력해 주세요. 입력 후 바로 맞춤 회복 분석이 시작됩니다.",
      compoundAlert: null,
      sections: [],
      weeklySummary: null,
    },
  };
}

export function useAIRecoveryInsights() {
  const { lang } = useI18n();
  const { end, todayShift, state } = useInsightsData();
  const isStoreHydrated = state.selected !== ("1970-01-01" as ISODate);
  const todaySleepRaw = state.bio?.[end]?.sleepHours;
  const todaySleepHours = hasSleepHours(todaySleepRaw) ? todaySleepRaw : null;
  const requiresTodaySleep = isStoreHydrated && !hasSleepHours(todaySleepRaw);
  const analysis = useMemo(() => buildAnalysisContext({ todayISO: end, state }), [end, state]);
  const fallback = useMemo(
    () =>
      buildFallbackData({
        todayISO: end,
        analysis,
        todayShift,
        stateSchedule: state.schedule,
        todaySleepHours,
        lang,
      }),
    [end, analysis, todayShift, state.schedule, todaySleepHours, lang]
  );
  const sleepRequiredPayload = useMemo(
    () => buildSleepRequiredPayload(fallback, lang),
    [fallback, lang]
  );

  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  const fetchRecovery = useCallback(
    async (signal: AbortSignal) => {
      try {
        const res = await fetch(`/api/insights/recovery?lang=${lang}`, {
          method: "GET",
          cache: "no-store",
          signal,
        });

        if (signal.aborted) return;

        // ✅ JSON 파싱 실패 방지
        let json: any;
        try {
          json = await res.json();
        } catch {
          throw new Error("invalid_json_response");
        }

        if (signal.aborted) return;

        if (res.ok && json?.ok && json.data) {
          setRemoteData(json.data as AIRecoveryPayload);
          setError(null);
          retryCount.current = 0;
          return;
        }

        // ✅ 401/404는 재시도하지 않음 (로그인 필요 / 데이터 없음)
        const errMsg = json?.error ?? `http_${res.status}`;
        setRemoteData(null);
        setError(errMsg);
      } catch (err: any) {
        if (signal.aborted || err?.name === "AbortError") return;
        setRemoteData(null);
        setError(err?.message || "network_error");
      }
    },
    [lang]
  );

  useEffect(() => {
    if (requiresTodaySleep) {
      setRemoteData(null);
      setError(null);
      setLoading(false);
      retryCount.current = 0;
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const run = async () => {
      await fetchRecovery(controller.signal);
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [fetchRecovery, requiresTodaySleep]);

  return {
    data: requiresTodaySleep ? sleepRequiredPayload : remoteData ?? fallback,
    loading: requiresTodaySleep ? false : loading && !remoteData,
    fromSupabase: requiresTodaySleep ? false : Boolean(remoteData),
    error: requiresTodaySleep ? null : error,
    requiresTodaySleep,
  };
}
