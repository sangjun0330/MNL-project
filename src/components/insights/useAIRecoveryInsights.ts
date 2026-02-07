"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateAIRecovery, type AIRecoveryResult } from "@/lib/aiRecovery";
import type { AIRecoveryPayload, AIRecoveryApiSuccess } from "@/lib/aiRecoveryContract";
import { addDays, fromISODate, toISODate } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";
import type { Shift } from "@/lib/types";

function buildFallbackData(params: {
  end: ReturnType<typeof useInsightsData>["end"];
  vitals: ReturnType<typeof useInsightsData>["vitals"];
  todayVital: ReturnType<typeof useInsightsData>["todayVital"];
  todayShift: Shift;
  stateSchedule: ReturnType<typeof useInsightsData>["state"]["schedule"];
  lang: "ko" | "en";
}): AIRecoveryPayload {
  const { end, vitals, todayVital, todayShift, stateSchedule, lang } = params;
  const nextISO = toISODate(addDays(fromISODate(end), 1));
  const nextShift = (stateSchedule?.[nextISO] as Shift | undefined) ?? null;
  const fallbackResult: AIRecoveryResult = generateAIRecovery(todayVital, vitals, [], nextShift, lang);
  const todayVitalScore = todayVital
    ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema))
    : null;

  return {
    dateISO: end,
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

export function useAIRecoveryInsights() {
  const { lang } = useI18n();
  const { end, vitals, todayVital, todayShift, state } = useInsightsData();
  const fallback = useMemo(
    () =>
      buildFallbackData({
        end,
        vitals,
        todayVital,
        todayShift,
        stateSchedule: state.schedule,
        lang,
      }),
    [end, vitals, todayVital, todayShift, state.schedule, lang]
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
  }, [fetchRecovery]);

  return {
    data: remoteData ?? fallback,
    loading: loading && !remoteData,
    fromSupabase: Boolean(remoteData),
    error,
  };
}
