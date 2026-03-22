"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isValidAIRecoveryPayload, type AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { todayISO } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
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

function isUsableOpenAIRecoveryPayload(
  payload: AIRecoveryPayload | null | undefined,
  lang: "ko" | "en",
  phase: RecoveryPhase
): payload is AIRecoveryPayload {
  return Boolean(
    isValidAIRecoveryPayload(payload, lang, phase) &&
      payload.engine === "openai" &&
      payload.generatedText?.trim()
  );
}

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
  const authHeaders = await getBrowserAuthHeaders();
  const res = await fetch(`/api/insights/recovery?lang=${lang}&phase=${phase}${cacheOnlyQuery}`, {
    method,
    cache: "no-store",
    headers: cacheOnly
      ? authHeaders
      : {
          "Content-Type": "application/json",
          ...authHeaders,
        },
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
  if (!isValidAIRecoveryPayload(payload, lang, phase)) {
    throw new Error("ai_recovery_invalid_payload_shape");
  }
  if (payload.engine !== "openai") {
    throw new Error(payload.debug ?? "ai_recovery_rule_fallback");
  }
  return payload;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recoverRecoveryPayloadAfterError(lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
    await wait(attemptIndex === 0 ? 900 : 1500);
    try {
      const cached = await fetchAIRecovery(lang, dateISO, phase, true);
      if (cached && isUsableOpenAIRecoveryPayload(cached, lang, phase)) return cached;
    } catch {
      // another request may still be saving the result; keep polling briefly
    }
  }
  return null;
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
  const { user, status: authStatus } = useAuthState();
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
    setRemoteData(null);
    setError(null);
    setRetryCount((c) => c + 1);
  }, [lang, phase, user?.userId]);
  const startGenerate = useCallback(() => {
    const dateISO = todayISO();
    clearRecoveryPhaseCache(user?.userId ?? "guest", lang, dateISO, phase);
    setRemoteData(null);
    setError(null);
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
    if (authStatus === "loading") return;
    if (authStatus !== "authenticated" || !user?.userId) {
      setError(null);
      setGenerating(false);
      setLoading(false);
      return;
    }
    if (!isStoreHydrated) return;
    const dateISO = todayISO();
    const key = requestKey(user.userId, lang, dateISO, phase);
    let active = true;
    const forceGenerate = mode === "generate" && manualGenerateCount > 0;

    const fromSession = sessionDailyCache.get(key) ?? null;
    if (fromSession && isUsableOpenAIRecoveryPayload(fromSession, lang, phase) && !forceGenerate) {
      setRemoteData(fromSession);
      setError(null);
      setGenerating(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    if (fromSession && !isUsableOpenAIRecoveryPayload(fromSession, lang, phase)) {
      sessionDailyCache.delete(key);
    }

    setLoading(true);
    setGenerating(false);
    setError(null);

    const run = async () => {
      let cached: AIRecoveryPayload | null = null;
      try {
        try {
          cached = await fetchAIRecovery(lang, dateISO, phase, true);
        } catch {
          cached = null;
        }
        if (!active) return;

        if (cached && isUsableOpenAIRecoveryPayload(cached, lang, phase) && !forceGenerate) {
          sessionDailyCache.set(key, cached);
          setRemoteData(cached);
          return;
        }

        const shouldGenerate = mode === "generate" && (autoGenerate || manualGenerateCount > 0);
        if (!shouldGenerate) return;

        setGenerating(true);
        const generated = forceGenerate
          ? await fetchAIRecovery(lang, dateISO, phase, false, true)
          : await getOrStartGenerate(user.userId, lang, dateISO, phase);
        if (!active) return;
        if (!generated) {
          throw new Error("ai_recovery_empty_payload");
        }
        if (!isUsableOpenAIRecoveryPayload(generated, lang, phase)) {
          const generatedEngine = (generated as AIRecoveryPayload | null)?.engine;
          throw new Error(generatedEngine === "rule" ? "ai_recovery_rule_fallback_blocked" : "ai_recovery_non_openai_payload");
        }
        if (generated.language !== lang || generated.phase !== phase) {
          throw new Error("ai_recovery_mismatched_payload");
        }
        sessionDailyCache.set(key, generated);
        setRemoteData(generated);
      } catch (err: any) {
        if (!active) return;
        const recovered = await recoverRecoveryPayloadAfterError(lang, dateISO, phase);
        if (!active) return;
        if (recovered) {
          sessionDailyCache.set(key, recovered);
          setRemoteData(recovered);
          setError(null);
          return;
        }
        setRemoteData(null);
        setError(err?.message ?? "network_error");
      } finally {
        if (active) {
          if (manualGenerateCount > 0) {
            setManualGenerateCount((current) => (current > 0 ? 0 : current));
          }
          setGenerating(false);
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [authStatus, enabled, isStoreHydrated, lang, mode, phase, retryCount, autoGenerate, manualGenerateCount, user?.userId]);

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
