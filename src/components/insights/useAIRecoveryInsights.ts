"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { todayISO } from "@/lib/date";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
import { useClientSyncSnapshot } from "@/lib/clientSyncStore";
import { readCurrentAccountInsights, storeCurrentAccountInsights } from "@/lib/currentAccountResourceStore";
import { DEFAULT_RECOVERY_PHASE, normalizeRecoveryPhase, type RecoveryPhase } from "@/lib/recoveryPhases";
import { useI18n } from "@/lib/useI18n";
import { useAppStoreHydrated } from "@/lib/store";

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

function clearRecoveryPhaseCache(userId: string, lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  const prefix = `${userId}:${lang}:${dateISO}:${phase}`;
  for (const key of Array.from(inFlightGenerate.keys())) {
    if (key === prefix) inFlightGenerate.delete(key);
  }
}

function requestKey(userId: string, lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  return `${userId}:${lang}:${dateISO}:${phase}`;
}

function recoveryInsightsResourceKey(lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  return `${lang}:${dateISO}:${phase}`;
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
  const isStoreHydrated = useAppStoreHydrated();
  const { stateRevision } = useClientSyncSnapshot();
  const accountKey = user?.userId ?? null;
  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const remoteDataRef = useRef<AIRecoveryPayload | null>(remoteData);
  remoteDataRef.current = remoteData;
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
    setRetryCount((c) => c + 1);
  }, [lang, phase, user?.userId]);
  const startGenerate = useCallback(() => {
    const dateISO = todayISO();
    clearRecoveryPhaseCache(user?.userId ?? "guest", lang, dateISO, phase);
    setError(null);
    setManualGenerateCount((c) => c + 1);
  }, [lang, phase, user?.userId]);

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
    const resourceKey = recoveryInsightsResourceKey(lang, dateISO, phase);
    const memoryEntry = readCurrentAccountInsights(accountKey, resourceKey);
    let active = true;
    const forceGenerate = mode === "generate" && manualGenerateCount > 0;

    const fromSession = memoryEntry?.data ?? null;
    if (fromSession && fromSession.language === lang && !forceGenerate) {
      setRemoteData(fromSession);
      setError(null);
      if ((memoryEntry?.revision ?? null) === (stateRevision ?? null)) {
        setGenerating(false);
        setLoading(false);
        return () => {
          active = false;
        };
      }
    }
    if (!fromSession && (!remoteDataRef.current || remoteDataRef.current.language !== lang || remoteDataRef.current.phase !== phase)) {
      setRemoteData(null);
    }

    setLoading(!fromSession);
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

        if (cached && cached.language === lang && cached.phase === phase && !forceGenerate) {
          if (accountKey) {
            storeCurrentAccountInsights(accountKey, resourceKey, cached, stateRevision ?? null);
          }
          setRemoteData(cached);
          return;
        }

        const shouldGenerate = mode === "generate" && (autoGenerate || manualGenerateCount > 0);
        if (!shouldGenerate) return;

        setGenerating(true);
        const generated = forceGenerate
          ? await fetchAIRecovery(lang, dateISO, phase, false, true)
          : await getOrStartGenerate(user?.userId ?? "guest", lang, dateISO, phase);
        if (!active) return;
        if (generated && generated.language === lang && generated.phase === phase) {
          if (accountKey) {
            storeCurrentAccountInsights(accountKey, resourceKey, generated, stateRevision ?? null);
          }
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
  }, [accountKey, autoGenerate, enabled, isStoreHydrated, lang, manualGenerateCount, mode, phase, retryCount, stateRevision, user?.userId]);

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
