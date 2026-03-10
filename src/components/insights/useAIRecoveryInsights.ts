"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { todayISO } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { useAuthState } from "@/lib/auth";
import { DEFAULT_RECOVERY_PHASE, normalizeRecoveryPhase, type RecoveryPhase } from "@/lib/recoveryPhases";
import { useI18n } from "@/lib/useI18n";

type FetchMode = "cache" | "generate";

type HookOptions = {
  mode?: FetchMode;
  enabled?: boolean;
  autoGenerate?: boolean;
  phase?: RecoveryPhase;
};

type HookResult = {
  data: AIRecoveryPayload | null;
  loading: boolean;
  generating: boolean;
  fromSupabase: boolean;
  error: string | null;
  requiresTodaySleep: boolean;
  retry: () => void;
  startGenerate: () => void;
};

const inFlightGenerate = new Map<string, Promise<AIRecoveryPayload | null>>();
const sessionDailyCache = new Map<string, AIRecoveryPayload>();

function clearRecoveryPhaseCache(userId: string, lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  const prefix = `${userId}:${lang}:${dateISO}:${phase}`;
  for (const key of Array.from(sessionDailyCache.keys())) {
    if (key === prefix) sessionDailyCache.delete(key);
  }
  for (const key of Array.from(inFlightGenerate.keys())) {
    if (key === prefix) inFlightGenerate.delete(key);
  }
}

function requestKey(userId: string, lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  return `${userId}:${lang}:${dateISO}:${phase}`;
}

async function fetchAIRecovery(
  lang: "ko" | "en",
  dateISO: string,
  phase: RecoveryPhase,
  cacheOnly: boolean,
  forceGenerate = false
): Promise<AIRecoveryPayload | null> {
  const cacheOnlyQuery = cacheOnly ? "&cacheOnly=1" : "";
  const method = cacheOnly ? "GET" : "POST";
  const res = await fetch(`/api/insights/recovery?lang=${lang}&phase=${phase}${cacheOnlyQuery}`, {
    method,
    cache: "no-store",
    headers: cacheOnly ? undefined : { "Content-Type": "application/json" },
    body: cacheOnly ? undefined : JSON.stringify({ forceGenerate, phase }),
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

function getOrStartGenerate(userId: string, lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  const key = requestKey(userId, lang, dateISO, phase);
  const existing = inFlightGenerate.get(key);
  if (existing) return existing;

  const promise = fetchAIRecovery(lang, dateISO, phase, false, true)
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
  const autoGenerate = options?.autoGenerate ?? mode !== "generate";
  const phase = normalizeRecoveryPhase(options?.phase ?? DEFAULT_RECOVERY_PHASE);
  const { lang } = useI18n();
  const { user } = useAuthState();
  const { state } = useInsightsData();
  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [manualGenerateCount, setManualGenerateCount] = useState(0);

  const retry = useCallback(() => {
    // 세션 캐시 클리어 후 재시도
    const dateISO = todayISO();
    clearRecoveryPhaseCache(user?.userId ?? "guest", lang, dateISO, phase);
    setError(null);
    setRemoteData(null);
    setRetryCount((c) => c + 1);
  }, [lang, phase, user?.userId]);
  const startGenerate = useCallback(() => {
    const dateISO = todayISO();
    clearRecoveryPhaseCache(user?.userId ?? "guest", lang, dateISO, phase);
    setError(null);
    setRemoteData(null);
    setManualGenerateCount((c) => c + 1);
  }, [lang, phase, user?.userId]);

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
    const key = requestKey(user?.userId ?? "guest", lang, dateISO, phase);
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
        const cached = await fetchAIRecovery(lang, dateISO, phase, true);
        if (!active) return;

        if (cached && cached.language === lang && cached.phase === phase && !forceGenerate) {
          sessionDailyCache.set(key, cached);
          setRemoteData(cached);
          return;
        }

        setRemoteData(null);

        const shouldGenerate = mode === "generate" && (autoGenerate || manualGenerateCount > 0);
        if (!shouldGenerate) return;

        setGenerating(true);
        const generated = forceGenerate
          ? await fetchAIRecovery(lang, dateISO, phase, false, true)
          : await getOrStartGenerate(user?.userId ?? "guest", lang, dateISO, phase);
        if (!active) return;
        if (generated && generated.language === lang && generated.phase === phase) {
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
  }, [enabled, isStoreHydrated, lang, mode, phase, retryCount, autoGenerate, manualGenerateCount, user?.userId]);

  return useMemo(
    () => ({
      data: remoteData,
      loading,
      generating,
      fromSupabase: Boolean(remoteData),
      error,
      requiresTodaySleep: false,
      retry,
      startGenerate,
    }),
    [remoteData, loading, generating, error, retry, startGenerate]
  );
}
