"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIRecoveryPlannerPayload } from "@/lib/aiRecoveryPlanner";
import { todayISO } from "@/lib/date";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
import { useClientSyncSnapshot } from "@/lib/clientSyncStore";
import { readCurrentAccountPlanner, storeCurrentAccountPlanner } from "@/lib/currentAccountResourceStore";
import { useI18n } from "@/lib/useI18n";
import { DEFAULT_RECOVERY_PHASE, normalizeRecoveryPhase, type RecoveryPhase } from "@/lib/recoveryPhases";
import { useAppStoreHydrated } from "@/lib/store";

type FetchMode = "cache" | "generate";

type HookOptions = {
  mode?: FetchMode;
  enabled?: boolean;
  autoGenerate?: boolean;
  phase?: RecoveryPhase;
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
const DEFAULT_ORDER_COUNT = 3;

function clearPlannerPhaseCache(userId: string, lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  const prefix = `${userId}:${lang}:${dateISO}:${phase}:`;
  for (const key of Array.from(inFlightGenerate.keys())) {
    if (key.startsWith(prefix)) inFlightGenerate.delete(key);
  }
}

function normalizeRequestedOrderCount(value: number | null | undefined) {
  if (value == null || String(value).trim() === "") return DEFAULT_ORDER_COUNT;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_ORDER_COUNT;
  return Math.max(1, Math.min(5, parsed));
}

function requestKey(
  userId: string,
  lang: "ko" | "en",
  dateISO: string,
  phase: RecoveryPhase,
  requestedOrderCount?: number | null
) {
  return `${userId}:${lang}:${dateISO}:${phase}:${normalizeRequestedOrderCount(requestedOrderCount)}`;
}

function plannerResourceKey(lang: "ko" | "en", dateISO: string, phase: RecoveryPhase) {
  return `${lang}:${dateISO}:${phase}`;
}

async function fetchAIRecoveryPlanner(
  lang: "ko" | "en",
  phase: RecoveryPhase,
  cacheOnly: boolean,
  requestedOrderCount?: number | null,
  forceGenerate = false
): Promise<AIRecoveryPlannerPayload | null> {
  const cacheOnlyQuery = cacheOnly ? "&cacheOnly=1" : "";
  const method = cacheOnly ? "GET" : "POST";
  const authHeaders = await getBrowserAuthHeaders();
  const res = await fetch(`/api/insights/recovery/planner?lang=${lang}&phase=${phase}${cacheOnlyQuery}`, {
    method,
    cache: "no-store",
    headers: cacheOnly
      ? authHeaders
      : {
          "Content-Type": "application/json",
          ...authHeaders,
        },
    body:
      cacheOnly
        ? undefined
        : JSON.stringify({
            orderCount: normalizeRequestedOrderCount(requestedOrderCount),
            phase,
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

  const payload = (json?.data ?? null) as AIRecoveryPlannerPayload | null;
  if (!payload) return null;
  return payload;
}

function getOrStartGenerate(
  userId: string,
  lang: "ko" | "en",
  dateISO: string,
  phase: RecoveryPhase,
  requestedOrderCount?: number | null
) {
  const key = requestKey(userId, lang, dateISO, phase, requestedOrderCount);
  const existing = inFlightGenerate.get(key);
  if (existing) return existing;

  const promise = fetchAIRecoveryPlanner(lang, phase, false, requestedOrderCount, true).finally(() => {
    inFlightGenerate.delete(key);
  });

  inFlightGenerate.set(key, promise);
  return promise;
}

export function useAIRecoveryPlanner(options?: HookOptions): HookResult {
  const mode = options?.mode ?? "cache";
  const enabled = options?.enabled ?? true;
  const autoGenerate = options?.autoGenerate ?? mode !== "generate";
  const phase = normalizeRecoveryPhase(options?.phase ?? DEFAULT_RECOVERY_PHASE);
  const { lang } = useI18n();
  const { user } = useAuthState();
  const storeHydrated = useAppStoreHydrated();
  const { stateRevision } = useClientSyncSnapshot();
  const accountKey = user?.userId ?? null;
  const [remoteData, setRemoteData] = useState<AIRecoveryPlannerPayload | null>(null);
  const remoteDataRef = useRef<AIRecoveryPlannerPayload | null>(remoteData);
  remoteDataRef.current = remoteData;
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
    clearPlannerPhaseCache(user?.userId ?? "guest", lang, dateISO, phase);
    setError(null);
    setRetryCount((c) => c + 1);
  }, [lang, phase, user?.userId]);

  const startGenerate = useCallback((orderCount?: number) => {
    const dateISO = todayISO();
    clearPlannerPhaseCache(user?.userId ?? "guest", lang, dateISO, phase);
    setError(null);
    setManualGenerateState((current) => ({
      count: current.count + 1,
      orderCount: normalizeRequestedOrderCount(orderCount),
    }));
  }, [lang, phase, user?.userId]);

  const isStoreHydrated = storeHydrated;

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
    const currentRequestedOrderCount = manualGenerateState.orderCount;
    const key = requestKey(user?.userId ?? "guest", lang, dateISO, phase, currentRequestedOrderCount);
    const resourceKey = plannerResourceKey(lang, dateISO, phase);
    const memoryEntry = readCurrentAccountPlanner(accountKey, resourceKey);
    let active = true;
    const forceGenerate = mode === "generate" && manualGenerateState.count > 0;
    const requestedOrderCount = forceGenerate ? manualGenerateState.orderCount : null;

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
      let cached: AIRecoveryPlannerPayload | null = null;
      try {
        try {
          cached = await fetchAIRecoveryPlanner(lang, phase, true);
        } catch {
          cached = null;
        }
        if (!active) return;

        if (cached && cached.language === lang && cached.phase === phase && !forceGenerate) {
          if (accountKey) {
            storeCurrentAccountPlanner(accountKey, resourceKey, cached, stateRevision ?? null);
          }
          setRemoteData(cached);
          return;
        }

        const shouldGenerate = mode === "generate" && (autoGenerate || manualGenerateState.count > 0);
        if (!shouldGenerate) return;

        setGenerating(true);
        const generated = forceGenerate
          ? await fetchAIRecoveryPlanner(lang, phase, false, requestedOrderCount, true)
          : await getOrStartGenerate(user?.userId ?? "guest", lang, dateISO, phase, requestedOrderCount);
        if (!active) return;
        if (generated && generated.language === lang && generated.phase === phase) {
          if (accountKey) {
            storeCurrentAccountPlanner(accountKey, resourceKey, generated, stateRevision ?? null);
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
  }, [accountKey, autoGenerate, enabled, isStoreHydrated, lang, manualGenerateState.count, manualGenerateState.orderCount, mode, phase, retryCount, stateRevision, user?.userId]);

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
