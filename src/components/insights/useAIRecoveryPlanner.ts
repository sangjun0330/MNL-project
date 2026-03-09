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
  startGenerate: (orderCount?: number) => void;
};

const inFlightGenerate = new Map<string, Promise<AIRecoveryPlannerPayload | null>>();
const sessionDailyCache = new Map<string, AIRecoveryPlannerPayload>();
const DEFAULT_ORDER_COUNT = 3;

function normalizeRequestedOrderCount(value: number | null | undefined) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_ORDER_COUNT;
  return Math.max(1, Math.min(5, parsed));
}

function requestKey(userId: string, lang: "ko" | "en", dateISO: string, requestedOrderCount?: number | null) {
  return `${userId}:${lang}:${dateISO}:${normalizeRequestedOrderCount(requestedOrderCount)}`;
}

async function fetchAIRecoveryPlanner(
  lang: "ko" | "en",
  cacheOnly: boolean,
  requestedOrderCount?: number | null,
  forceGenerate = false
): Promise<AIRecoveryPlannerPayload | null> {
  const cacheOnlyQuery = cacheOnly ? "&cacheOnly=1" : "";
  const method = cacheOnly ? "GET" : "POST";
  const res = await fetch(`/api/insights/recovery/planner?lang=${lang}${cacheOnlyQuery}`, {
    method,
    cache: "no-store",
    headers: cacheOnly ? undefined : { "Content-Type": "application/json" },
    body:
      cacheOnly
        ? undefined
        : JSON.stringify({
            orderCount: normalizeRequestedOrderCount(requestedOrderCount),
            forceGenerate,
          }),
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

function getOrStartGenerate(userId: string, lang: "ko" | "en", dateISO: string, requestedOrderCount?: number | null) {
  const key = requestKey(userId, lang, dateISO, requestedOrderCount);
  const existing = inFlightGenerate.get(key);
  if (existing) return existing;

  const promise = fetchAIRecoveryPlanner(lang, false, requestedOrderCount, true).finally(() => {
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
  const [manualGenerateState, setManualGenerateState] = useState<{ count: number; orderCount: number | null }>({
    count: 0,
    orderCount: null,
  });

  const retry = useCallback(() => {
    const dateISO = todayISO();
    sessionDailyCache.delete(requestKey(user?.userId ?? "guest", lang, dateISO));
    inFlightGenerate.delete(requestKey(user?.userId ?? "guest", lang, dateISO));
    setError(null);
    setRemoteData(null);
    setRetryCount((c) => c + 1);
  }, [lang, user?.userId]);

  const startGenerate = useCallback((orderCount?: number) => {
    setError(null);
    setManualGenerateState((current) => ({
      count: current.count + 1,
      orderCount: normalizeRequestedOrderCount(orderCount),
    }));
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
    const forceGenerate = mode === "generate" && manualGenerateState.count > 0;
    const requestedOrderCount = forceGenerate ? manualGenerateState.orderCount : null;

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

        const shouldGenerate = mode === "generate" && (autoGenerate || manualGenerateState.count > 0);
        if (!shouldGenerate) return;

        setGenerating(true);
        const generated = forceGenerate
          ? await fetchAIRecoveryPlanner(lang, false, requestedOrderCount, true)
          : await getOrStartGenerate(user?.userId ?? "guest", lang, dateISO, requestedOrderCount);
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
  }, [autoGenerate, enabled, isStoreHydrated, lang, manualGenerateState.count, manualGenerateState.orderCount, mode, retryCount, user?.userId]);

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
