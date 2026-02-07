"use client";

import { useEffect, useMemo, useState } from "react";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { todayISO } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";

type FetchMode = "cache" | "generate";

type HookOptions = {
  mode?: FetchMode;
  enabled?: boolean;
};

type HookResult = {
  data: AIRecoveryPayload | null;
  loading: boolean;
  generating: boolean;
  fromSupabase: boolean;
  error: string | null;
  requiresTodaySleep: boolean;
};

const inFlightGenerate = new Map<string, Promise<AIRecoveryPayload | null>>();
const sessionDailyCache = new Map<string, AIRecoveryPayload>();

function requestKey(lang: "ko" | "en", dateISO: string) {
  return `${lang}:${dateISO}`;
}

async function fetchAIRecovery(lang: "ko" | "en", dateISO: string, cacheOnly: boolean): Promise<AIRecoveryPayload | null> {
  const cacheOnlyQuery = cacheOnly ? "&cacheOnly=1" : "";
  const res = await fetch(`/api/insights/recovery?lang=${lang}${cacheOnlyQuery}`, {
    method: "GET",
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    const snippet = text.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(`http_${res.status}_non_json:${snippet || "empty"}`);
  }

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? `http_${res.status}`);
  }

  const payload = (json?.data ?? null) as AIRecoveryPayload | null;
  if (!payload) return null;
  if (payload.engine !== "openai") {
    if (cacheOnly) return null;
    throw new Error(`invalid_engine:${String(payload.engine ?? "unknown")}`);
  }
  return payload;
}

function getOrStartGenerate(lang: "ko" | "en", dateISO: string) {
  const key = requestKey(lang, dateISO);
  const existing = inFlightGenerate.get(key);
  if (existing) return existing;

  const promise = fetchAIRecovery(lang, dateISO, false)
    .catch((err) => {
      throw err;
    })
    .finally(() => {
      inFlightGenerate.delete(key);
    });

  inFlightGenerate.set(key, promise);
  return promise;
}

export function useAIRecoveryInsights(options?: HookOptions): HookResult {
  const mode = options?.mode ?? "cache";
  const enabled = options?.enabled ?? true;
  const { lang } = useI18n();
  const { state } = useInsightsData();
  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStoreHydrated = state.selected !== ("1970-01-01" as any);

  useEffect(() => {
    if (!enabled) {
      setRemoteData(null);
      setError(null);
      setGenerating(false);
      setLoading(false);
      return;
    }
    if (!isStoreHydrated) return;
    const dateISO = todayISO();
    const key = requestKey(lang, dateISO);
    let active = true;

    const fromSession = sessionDailyCache.get(key) ?? null;
    if (fromSession) {
      setRemoteData(fromSession);
      setError(null);
      setGenerating(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setGenerating(false);
    setError(null);

    const run = async () => {
      try {
        const cached = await fetchAIRecovery(lang, dateISO, true);
        if (!active) return;

        if (cached) {
          sessionDailyCache.set(key, cached);
          setRemoteData(cached);
          return;
        }

        setRemoteData(null);

        if (mode === "cache") return;

        setGenerating(true);
        const generated = await getOrStartGenerate(lang, dateISO);
        if (!active) return;
        if (generated) {
          sessionDailyCache.set(key, generated);
        }
        setRemoteData(generated ?? null);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "network_error");
      } finally {
        if (active) {
          setGenerating(false);
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [enabled, isStoreHydrated, lang, mode]);

  return useMemo(
    () => ({
      data: remoteData,
      loading,
      generating,
      fromSupabase: Boolean(remoteData),
      error,
      requiresTodaySleep: false,
    }),
    [remoteData, loading, generating, error]
  );
}
