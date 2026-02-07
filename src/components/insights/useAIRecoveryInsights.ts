"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateAIRecovery } from "@/lib/aiRecovery";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";
import type { Shift } from "@/lib/types";

type HookResult = {
  data: AIRecoveryPayload;
  loading: boolean;
  fromSupabase: boolean;
  error: string | null;
  requiresTodaySleep: boolean;
};

const AI_DAILY_CACHE_PREFIX = "wnl_ai_recovery_daily_v1";

type LocalDailyCache = {
  dateISO: string;
  language: "ko" | "en";
  payload: AIRecoveryPayload;
  savedAt: number;
};

function cacheKey(lang: "ko" | "en", dateISO: string) {
  return `${AI_DAILY_CACHE_PREFIX}:${lang}:${dateISO}`;
}

function readDailyCache(lang: "ko" | "en", dateISO: string): AIRecoveryPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(lang, dateISO));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDailyCache;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.dateISO !== dateISO || parsed.language !== lang) return null;
    if (!parsed.payload || parsed.payload.dateISO !== dateISO || parsed.payload.language !== lang) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeDailyCache(lang: "ko" | "en", dateISO: string, payload: AIRecoveryPayload) {
  if (typeof window === "undefined") return;
  try {
    const entry: LocalDailyCache = {
      dateISO,
      language: lang,
      payload,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(cacheKey(lang, dateISO), JSON.stringify(entry));
  } catch {
    // ignore localStorage quota/parse issues
  }
}

export function useAIRecoveryInsights(): HookResult {
  const { lang } = useI18n();
  const { end, vitalsRecorded, todayVital, todayShift, state } = useInsightsData();
  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStoreHydrated = state.selected !== ("1970-01-01" as any);

  // ✅ API 실패 시 항상 보여줄 로컬 rule-based fallback 생성
  const localFallback = useMemo((): AIRecoveryPayload => {
    const nextISO = toISODate(addDays(fromISODate(end), 1));
    const nextShift = (state.schedule?.[nextISO] as Shift | undefined) ?? null;
    const fallbackResult = generateAIRecovery(todayVital, vitalsRecorded, [], nextShift, lang);
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
  }, [end, vitalsRecorded, todayVital, todayShift, state.schedule, lang]);

  const fetchRecovery = useCallback(
    async (signal: AbortSignal, dateISO: string) => {
      const res = await fetch(`/api/insights/recovery?lang=${lang}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (signal.aborted) return;

      let text = "";
      try {
        text = await res.text();
      } catch {
        throw new Error(`http_${res.status}_empty_response`);
      }

      if (signal.aborted) return;

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
        throw new Error(`http_${res.status}_non_json:${snippet || "empty"}`);
      }

      if (signal.aborted) return;

      if (res.ok && json?.ok && json.data) {
        const payload = json.data as AIRecoveryPayload;
        setRemoteData(payload);
        writeDailyCache(lang, dateISO, payload);
        setError(null);
        return;
      }

      throw new Error(json?.error ?? `http_${res.status}`);
    },
    [lang]
  );

  useEffect(() => {
    if (!isStoreHydrated) return;
    const dateISO = todayISO();
    const cached = readDailyCache(lang, dateISO);
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    if (cached) {
      setRemoteData(cached);
      setLoading(false);
      return () => controller.abort();
    }

    setRemoteData(null);

    const run = async () => {
      try {
        await fetchRecovery(controller.signal, dateISO);
      } catch (err: any) {
        if (!controller.signal.aborted && err?.name !== "AbortError") {
          setError(err?.message ?? "network_error");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [fetchRecovery, isStoreHydrated, lang]);

  // ✅ 핵심: remoteData가 있으면 사용, 없으면 localFallback → data는 절대 null이 아님
  return useMemo(
    () => ({
      data: remoteData ?? localFallback,
      loading: loading && !remoteData,
      fromSupabase: Boolean(remoteData),
      error,
      requiresTodaySleep: false,
    }),
    [remoteData, localFallback, loading, error]
  );
}
