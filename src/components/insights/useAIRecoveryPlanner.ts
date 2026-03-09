"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AIRecoveryPlannerPayload } from "@/lib/aiRecoveryPlanner";
import { todayISO } from "@/lib/date";
import { useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";
import { useInsightsData } from "@/components/insights/useInsightsData";

type FetchMode = "cache" | "generate";

type HookOptions = {
  mode?: FetchMode;
  enabled?: boolean;
  autoGenerate?: boolean;
};

type HookResult = {
  data: AIRecoveryPlannerPayload | null;
  loading: boolean;
  generating: boolean;
  fromSupabase: boolean;
  error: string | null;
  retry: () => void;
  startGenerate: () => void;
};

const inFlightGenerate = new Map<string, Promise<AIRecoveryPlannerPayload | null>>();
const sessionDailyCache = new Map<string, AIRecoveryPlannerPayload>();

function requestKey(userId: string, lang: "ko" | "en", dateISO: string) {
  return `${userId}:${lang}:${dateISO}`;
}

async function fetchAIRecoveryPlanner(
  lang: "ko" | "en",
  cacheOnly: boolean
): Promise<AIRecoveryPlannerPayload | null> {
  const cacheOnlyQuery = cacheOnly ? "&cacheOnly=1" : "";
  const method = cacheOnly ? "GET" : "POST";
  const res = await fetch(`/api/insights/recovery/planner?lang=${lang}${cacheOnlyQuery}`, {
    method,
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

  return (json?.data ?? null) as AIRecoveryPlannerPayload | null;
}

function getOrStartGenerate(userId: string, lang: "ko" | "en", dateISO: string) {
  const key = requestKey(userId, lang, dateISO);
  const existing = inFlightGenerate.get(key);
  if (existing) return existing;

  const promise = fetchAIRecoveryPlanner(lang, false).finally(() => {
    inFlightGenerate.delete(key);
  });

  inFlightGenerate.set(key, promise);
  return promise;
}

export function useAIRecoveryPlanner(options?: HookOptions): HookResult {
  const mode = options?.mode ?? "cache";
  const enabled = options?.enabled ?? true;
  const autoGenerate = options?.autoGenerate ?? mode !== "generate";
  const { lang } = useI18n();
  const { user } = useAuthState();
  const { state } = useInsightsData();
  const [remoteData, setRemoteData] = useState<AIRecoveryPlannerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [manualGenerateCount, setManualGenerateCount] = useState(0);

  const retry = useCallback(() => {
    const dateISO = todayISO();
    const key = requestKey(user?.userId ?? "guest", lang, dateISO);
    sessionDailyCache.delete(key);
    inFlightGenerate.delete(key);
    setError(null);
    setRemoteData(null);
    setRetryCount((c) => c + 1);
  }, [lang, user?.userId]);

  const startGenerate = useCallback(() => {
    setError(null);
    setManualGenerateCount((c) => c + 1);
  }, []);

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
    const key = requestKey(user?.userId ?? "guest", lang, dateISO);
    let active = true;
    const forceGenerate = mode === "generate" && manualGenerateCount > 0;

    const fromSession = sessionDailyCache.get(key) ?? null;
    if (fromSession && fromSession.language === lang && !forceGenerate) {
      setRemoteData(fromSession);
      setError(null);
      setGenerating(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    if (fromSession && fromSession.language !== lang) {
      sessionDailyCache.delete(key);
    }

    setLoading(true);
    setGenerating(false);
    setError(null);
    setRemoteData(null);

    const run = async () => {
      try {
        const cached = await fetchAIRecoveryPlanner(lang, true);
        if (!active) return;

        if (cached && cached.language === lang) {
          sessionDailyCache.set(key, cached);
          setRemoteData(cached);
          if (!forceGenerate) return;
        }

        const shouldGenerate = mode === "generate" && (autoGenerate || manualGenerateCount > 0);
        if (!shouldGenerate) return;

        setGenerating(true);
        const generated = await getOrStartGenerate(user?.userId ?? "guest", lang, dateISO);
        if (!active) return;
        if (generated && generated.language === lang) {
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
  }, [autoGenerate, enabled, isStoreHydrated, lang, manualGenerateCount, mode, retryCount, user?.userId]);

  return useMemo(
    () => ({
      data: remoteData,
      loading,
      generating,
      fromSupabase: Boolean(remoteData),
      error,
      retry,
      startGenerate,
    }),
    [remoteData, loading, generating, error, retry, startGenerate]
  );
}
