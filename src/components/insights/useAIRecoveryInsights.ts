"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { todayISO } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

type HookResult = {
  data: AIRecoveryPayload | null;
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
  const { state } = useInsightsData();
  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStoreHydrated = state.selected !== ("1970-01-01" as any);

  const fetchRecovery = useCallback(
    async (signal: AbortSignal, dateISO: string) => {
      const res = await fetch(`/api/insights/recovery?lang=${lang}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (signal.aborted) return;

      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new Error("invalid_json_response");
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

  return useMemo(
    () => ({
      data: remoteData,
      loading,
      fromSupabase: Boolean(remoteData),
      error,
      requiresTodaySleep: false,
    }),
    [remoteData, loading, error]
  );
}
