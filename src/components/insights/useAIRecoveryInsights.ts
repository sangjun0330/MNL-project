"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const res = await fetch(`/api/insights/recovery?lang=${lang}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await res.json()) as AIRecoveryApiSuccess | { ok: false; error?: string };
        if (cancelled) return;

        if (res.ok && json.ok) {
          setRemoteData(json.data);
          setError(null);
          return;
        }

        setRemoteData(null);
        setError(!json.ok ? json.error ?? "failed to load recovery data" : "failed to load recovery data");
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") return;
        setRemoteData(null);
        setError(err?.message || "failed to load recovery data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lang]);

  return {
    data: remoteData ?? fallback,
    loading: loading && !remoteData,
    fromSupabase: Boolean(remoteData),
    error,
  };
}
