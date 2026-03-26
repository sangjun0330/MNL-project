"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, fromISODate, toISODate, type ISODate } from "@/lib/date";
import { getAIRecoveryErrorMessage, type AIRecoverySessionResponse, type AIRecoverySlot } from "@/lib/aiRecovery";
import { useAuthState } from "@/lib/auth";
import { getClientSyncSnapshot, updateClientSyncSnapshot, useClientSyncSnapshot } from "@/lib/clientSyncStore";
import { readCurrentAccountSession, storeCurrentAccountSession } from "@/lib/currentAccountResourceStore";
import {
  CLIENT_DATA_SCOPE_HOME_PREVIEW,
  CLIENT_DATA_SCOPE_RECOVERY_SESSION,
  emitClientDataInvalidation,
} from "@/lib/clientDataEvents";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { getAppState } from "@/lib/store";
import type { AppState } from "@/lib/model";

type SessionData = AIRecoverySessionResponse["data"];

type HookArgs = {
  dateISO: ISODate;
  slot: AIRecoverySlot;
  autoGenerate?: boolean;
  enabled?: boolean;
  initialData?: SessionData | null;
};

type HookState = {
  data: SessionData | null;
  loading: boolean;
  generating: boolean;
  savingOrders: boolean;
  togglingCompletion: string | null;
  error: string | null;
  reload: () => Promise<void>;
  generate: (force?: boolean) => Promise<void>;
  regenerateOrders: () => Promise<void>;
  toggleCompletion: (orderId: string, completed: boolean) => Promise<void>;
};

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null);
}

function buildSessionResourceKey(dateISO: ISODate, slot: AIRecoverySlot) {
  return `${dateISO}:${slot}`;
}

export function useAIRecoverySession(args: HookArgs): HookState {
  const { user } = useAuthState();
  const { stateRevision } = useClientSyncSnapshot();
  const normalizeData = (value: SessionData | null | undefined): SessionData | null => {
    if (!value) return null;
    return {
      ...value,
      dateISO: value.dateISO ?? args.dateISO,
      slot: value.slot ?? args.slot,
      todaySlots: value.todaySlots ?? { wakeReady: false, postShiftReady: false, allReady: false },
      orderStats:
        value.orderStats ??
        {
          todayWakeCompleted: 0,
          todayPostShiftCompleted: 0,
          todayTotalCompleted: 0,
          weekTotalCompleted: 0,
        },
      showGenerationControls: value.showGenerationControls ?? false,
      hasAIEntitlement: value.hasAIEntitlement ?? Boolean(args.enabled),
    } satisfies SessionData;
  };

  const accountKey = user?.userId ?? null;
  const resourceKey = buildSessionResourceKey(args.dateISO, args.slot);
  const memoryEntry = readCurrentAccountSession(accountKey, resourceKey);
  const initialData = normalizeData(args.initialData ?? memoryEntry?.data ?? null);
  const [data, setData] = useState<SessionData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [generating, setGenerating] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [togglingCompletion, setTogglingCompletion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRequestedRef = useRef(new Set<string>());
  const autoOrdersRequestedRef = useRef(new Set<string>());
  const dataRequestRef = useRef(0);
  const generateInFlightRef = useRef(false);
  const ordersInFlightRef = useRef(false);
  const togglingCompletionRef = useRef<string | null>(null);
  const committedCompletionVersionRef = useRef(0);

  // Refs for stable toggleCompletion — always reflect latest values without re-creating the callback
  const dataRef = useRef<SessionData | null>(data);
  dataRef.current = data;
  const enabledRef = useRef<boolean>(args.enabled ?? false);
  enabledRef.current = args.enabled ?? false;
  const slotRef = useRef<AIRecoverySlot>(args.slot);
  slotRef.current = args.slot;
  const dateISORef = useRef<ISODate>(args.dateISO);
  dateISORef.current = args.dateISO;

  const key = `${args.dateISO}:${args.slot}`;
  const persistCachedSession = useCallback(
    (value: SessionData | null, revision = stateRevision ?? null) => {
      if (!accountKey) return;
      storeCurrentAccountSession(accountKey, resourceKey, value, revision);
    },
    [accountKey, resourceKey, stateRevision]
  );

  const nextDataRequestId = () => {
    dataRequestRef.current += 1;
    return dataRequestRef.current;
  };

  const isCurrentDataRequest = (requestId: number) => dataRequestRef.current === requestId;

  const setFriendlyError = (value: unknown) => {
    setError(getAIRecoveryErrorMessage(value));
  };

  const pickLatestData = (current: SessionData | null, incoming: SessionData | null): SessionData | null => {
    if (!incoming) return current;
    if (!current) return incoming;
    // Always prefer incoming when slot or date changed — old data is irrelevant
    if (current.slot !== incoming.slot || current.dateISO !== incoming.dateISO) return incoming;
    const currentSession = current.session;
    const incomingSession = incoming.session;
    if (!incomingSession) return currentSession ? current : incoming;
    if (!currentSession) return incoming;

    const currentIsFallback = currentSession.status === "fallback" || Boolean(currentSession.openaiMeta?.fallbackReason);
    const incomingIsFallback = incomingSession.status === "fallback" || Boolean(incomingSession.openaiMeta?.fallbackReason);
    if (!incomingIsFallback && currentIsFallback) return incoming;
    if (incomingIsFallback && !currentIsFallback) return current;

    const currentTs = Date.parse(currentSession.generatedAt || "") || 0;
    const incomingTs = Date.parse(incomingSession.generatedAt || "") || 0;
    if (incomingTs > currentTs) return incoming;
    if (incomingTs < currentTs) return current;

    const currentHasOrders = Boolean(currentSession.orders?.items?.length);
    const incomingHasOrders = Boolean(incomingSession.orders?.items?.length);
    if (incomingHasOrders && !currentHasOrders) return incoming;
    if (!incomingHasOrders && currentHasOrders) return current;

    const currentOrdersId = currentSession.openaiMeta?.ordersResponseId ?? "";
    const incomingOrdersId = incomingSession.openaiMeta?.ordersResponseId ?? "";
    if (incomingOrdersId && !currentOrdersId) return incoming;
    if (!incomingOrdersId && currentOrdersId) return current;

    return incoming;
  };

  const isSameRenderedSession = (current: SessionData | null, incoming: SessionData | null) => {
    if (!current?.session || !incoming?.session) return false;
    if (current.dateISO !== incoming.dateISO || current.slot !== incoming.slot) return false;
    if ((current.session.generatedAt ?? "") !== (incoming.session.generatedAt ?? "")) return false;
    const currentBriefId = current.session.openaiMeta?.briefResponseId ?? "";
    const incomingBriefId = incoming.session.openaiMeta?.briefResponseId ?? "";
    const currentOrdersId = current.session.openaiMeta?.ordersResponseId ?? "";
    const incomingOrdersId = incoming.session.openaiMeta?.ordersResponseId ?? "";
    if ((currentBriefId || incomingBriefId) && currentBriefId !== incomingBriefId) return false;
    if ((currentOrdersId || incomingOrdersId) && currentOrdersId !== incomingOrdersId) return false;
    return true;
  };

  const mergeCompletionLists = (current: string[] | null | undefined, incoming: string[] | null | undefined) => {
    const next: string[] = [];
    const seen = new Set<string>();
    for (const item of current ?? []) {
      if (typeof item !== "string" || !item || seen.has(item)) continue;
      seen.add(item);
      next.push(item);
    }
    for (const item of incoming ?? []) {
      if (typeof item !== "string" || !item || seen.has(item)) continue;
      seen.add(item);
      next.push(item);
    }
    return next;
  };

  const mergeInteractiveState = (
    current: SessionData | null,
    incoming: SessionData | null,
    preserveCommittedCompletions = false,
  ): SessionData | null => {
    if (!current || !incoming) return incoming;
    if (!togglingCompletionRef.current && !preserveCommittedCompletions) return incoming;
    if (!isSameRenderedSession(current, incoming)) return incoming;
    const mergedCompletions = mergeCompletionLists(current.completions, incoming.completions);
    return {
      ...incoming,
      completions: mergedCompletions,
      // Completion UI only supports additive checks, so never let an older
      // session refetch reduce counters after a successful toggle.
      orderStats: {
        todayWakeCompleted: Math.max(current.orderStats.todayWakeCompleted, incoming.orderStats.todayWakeCompleted),
        todayPostShiftCompleted: Math.max(current.orderStats.todayPostShiftCompleted, incoming.orderStats.todayPostShiftCompleted),
        todayTotalCompleted: Math.max(current.orderStats.todayTotalCompleted, incoming.orderStats.todayTotalCompleted),
        weekTotalCompleted: Math.max(current.orderStats.weekTotalCompleted, incoming.orderStats.weekTotalCompleted),
      },
    };
  };

  const adoptIncomingData = (
    incoming: SessionData | null,
    options?: {
      completionVersionAtStart?: number;
    },
  ) => {
    setData((current) => {
      const preserveCommittedCompletions =
        options?.completionVersionAtStart != null && options.completionVersionAtStart !== committedCompletionVersionRef.current;
      const merged = mergeInteractiveState(current, incoming, preserveCommittedCompletions);
      return pickLatestData(current, merged);
    });
  };

  const listRequestDates = (pivotISO: ISODate, daysBefore: number, daysAfter: number) => {
    const pivot = fromISODate(pivotISO);
    const out: ISODate[] = [];
    for (let offset = -daysBefore; offset <= daysAfter; offset += 1) {
      out.push(toISODate(addDays(pivot, offset)));
    }
    return out;
  };

  const pickDateMap = <T,>(map: Record<string, T | undefined> | undefined, dates: ISODate[]) => {
    const out: Record<string, T | undefined> = {};
    for (const iso of dates) {
      if (map?.[iso] !== undefined) out[iso] = map[iso];
    }
    return out;
  };

  const buildRecoveryStatePayload = (raw: AppState) => {
    const serialized = serializeStateForSupabase(raw);
    const bioDates = Object.keys(serialized.bio ?? {});
    const emotionDates = Object.keys(serialized.emotions ?? {});
    const noteDates = Object.keys(serialized.notes ?? {});
    const allHealthDates = new Set<ISODate>([...bioDates, ...emotionDates, ...noteDates] as ISODate[]);
    const dateWindow = listRequestDates(args.dateISO, 21, 21);
    const healthDates = [...allHealthDates].filter((iso) => iso <= args.dateISO).sort().slice(-21);
    const includedDates = Array.from(new Set<ISODate>([...dateWindow, ...healthDates])).sort();

    return {
      selected: serialized.selected,
      schedule: pickDateMap(serialized.schedule as Record<string, AppState["schedule"][ISODate]>, includedDates),
      shiftNames: {},
      notes: pickDateMap(serialized.notes as Record<string, AppState["notes"][ISODate]>, includedDates),
      emotions: pickDateMap(serialized.emotions as Record<string, AppState["emotions"][ISODate]>, includedDates),
      bio: pickDateMap(serialized.bio as Record<string, AppState["bio"][ISODate]>, includedDates),
      memo: serialized.memo,
      records: serialized.records,
      settings: serialized.settings,
    } satisfies AppState;
  };

  const buildStatePayload = () => {
    try {
      return buildRecoveryStatePayload(getAppState());
    } catch {
      return null;
    }
  };

  const buildAutoOrdersKey = (value: SessionData | null) => {
    const generatedAt = value?.session?.generatedAt;
    if (!value?.session?.brief || value.session.orders || !generatedAt) return null;
    if (value.session.status === "fallback" || value.session.openaiMeta?.fallbackReason) return null;
    return `${value.dateISO}:${value.slot}:${generatedAt}`;
  };

  const fetchSessionView = async (context: string) => {
    const response = await fetch(`/api/insights/recovery/ai?date=${args.dateISO}&slot=${args.slot}`, {
      method: "GET",
      cache: "no-store",
    });
    const json = await readJson<{ ok?: boolean; error?: string; detail?: string | null; data?: SessionData }>(response);
    if (!response.ok || !json?.ok || !json.data) {
      console.error(`[AIRecovery] client_${context}_failed`, {
        status: response.status,
        error: json?.error ?? null,
        detail: json?.detail ?? null,
      });
      throw new Error(String(json?.error ?? `http_${response.status}`));
    }
    return normalizeData(json.data);
  };

  const load = async (options?: { force?: boolean }) => {
    const requestId = nextDataRequestId();
    const completionVersionAtStart = committedCompletionVersionRef.current;
    if (!args.enabled) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    const cached = readCurrentAccountSession(accountKey, resourceKey);
    const cachedData = normalizeData(cached?.data ?? dataRef.current ?? null);
    const shouldRevalidate = options?.force === true || !cachedData || (cached?.revision ?? null) !== (stateRevision ?? null);

    if (cachedData) {
      adoptIncomingData(cachedData, { completionVersionAtStart });
    }

    if (!shouldRevalidate) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(!cachedData);
    setError(null);
    try {
      const nextData = await fetchSessionView("load");
      if (!isCurrentDataRequest(requestId)) return;
      adoptIncomingData(nextData, { completionVersionAtStart });
      persistCachedSession(nextData);
      const autoOrdersKey = buildAutoOrdersKey(nextData);
      if (autoOrdersKey && !autoOrdersRequestedRef.current.has(autoOrdersKey) && nextData?.quota.canRegenerateOrders) {
        autoOrdersRequestedRef.current.add(autoOrdersKey);
        void regenerateOrdersInternal(true);
      }
      const shouldAutoGenerate =
        args.autoGenerate !== false &&
        nextData?.gate.allowed &&
        !nextData.session &&
        nextData.quota.canGenerateSession &&
        !autoRequestedRef.current.has(key);
      if (shouldAutoGenerate) {
        autoRequestedRef.current.add(key);
        await generateInternal(Boolean(nextData.session), key);
      }
    } catch (nextError) {
      if (!isCurrentDataRequest(requestId)) return;
      if (!cachedData) {
        setData(null);
      }
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_load_failed");
    } finally {
      setLoading(false);
    }
  };

  const regenerateOrdersInternal = async (auto = false) => {
    if (!args.enabled) return;
    if (ordersInFlightRef.current) return;
    ordersInFlightRef.current = true;
    const requestId = nextDataRequestId();
    const completionVersionAtStart = committedCompletionVersionRef.current;
    setSavingOrders(true);
    if (!auto) setError(null);
    try {
      const response = await fetch("/api/insights/recovery/ai/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: args.dateISO,
          slot: args.slot,
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; detail?: string | null; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        console.error("[AIRecovery] client_orders_failed", {
          status: response.status,
          error: json?.error ?? null,
          detail: json?.detail ?? null,
          auto,
        });
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      if (!isCurrentDataRequest(requestId)) return;
      const nextData = normalizeData(json.data);
      const nextStateRevision = Number.isFinite(Number(json.data?.stateRevision)) ? Number(json.data?.stateRevision) : null;
      if (nextStateRevision != null) {
        const currentSync = getClientSyncSnapshot();
        updateClientSyncSnapshot({
          stateRevision: nextStateRevision,
          bootstrapRevision:
            currentSync.bootstrapRevision == null
              ? nextStateRevision
              : Math.max(currentSync.bootstrapRevision, nextStateRevision),
        });
      }
      adoptIncomingData(nextData, { completionVersionAtStart });
      persistCachedSession(nextData, nextStateRevision ?? stateRevision ?? null);
      emitClientDataInvalidation([CLIENT_DATA_SCOPE_RECOVERY_SESSION, CLIENT_DATA_SCOPE_HOME_PREVIEW]);
    } catch (nextError) {
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchSessionView(auto ? "orders_auto_recover" : "orders_recover");
        if (!isCurrentDataRequest(requestId)) return;
        adoptIncomingData(recovered, { completionVersionAtStart });
        persistCachedSession(recovered);
        if (!auto) setError(null);
        return;
      } catch {}
      if (auto) {
        console.warn("[AIRecovery] client_orders_auto_failed", {
          message: (nextError as any)?.message ?? String(nextError),
        });
      } else {
        setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_orders_failed");
      }
    } finally {
      ordersInFlightRef.current = false;
      setSavingOrders(false);
    }
  };

  const generateInternal = async (force = false, autoKey?: string) => {
    if (!args.enabled) return;
    if (generateInFlightRef.current) return;
    generateInFlightRef.current = true;
    const requestId = nextDataRequestId();
    const completionVersionAtStart = committedCompletionVersionRef.current;
    const previousGeneratedAt = data?.session?.generatedAt ?? null;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/recovery/ai/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: args.dateISO,
          slot: args.slot,
          force,
          state: buildStatePayload(),
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; detail?: string | null; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        console.error("[AIRecovery] client_generate_failed", {
          status: response.status,
          error: json?.error ?? null,
          detail: json?.detail ?? null,
        });
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      if (!isCurrentDataRequest(requestId)) return;
      const nextData = normalizeData(json.data);
      const nextStateRevision = Number.isFinite(Number(json.data?.stateRevision)) ? Number(json.data?.stateRevision) : null;
      if (nextStateRevision != null) {
        const currentSync = getClientSyncSnapshot();
        updateClientSyncSnapshot({
          stateRevision: nextStateRevision,
          bootstrapRevision:
            currentSync.bootstrapRevision == null
              ? nextStateRevision
              : Math.max(currentSync.bootstrapRevision, nextStateRevision),
        });
      }
      adoptIncomingData(nextData, { completionVersionAtStart });
      persistCachedSession(nextData, nextStateRevision ?? stateRevision ?? null);
      emitClientDataInvalidation([CLIENT_DATA_SCOPE_RECOVERY_SESSION, CLIENT_DATA_SCOPE_HOME_PREVIEW]);
      const autoOrdersKey = buildAutoOrdersKey(nextData);
      if (autoOrdersKey && !autoOrdersRequestedRef.current.has(autoOrdersKey) && nextData?.quota.canRegenerateOrders) {
        autoOrdersRequestedRef.current.add(autoOrdersKey);
        void regenerateOrdersInternal(true);
      }
    } catch (nextError) {
      if (autoKey) autoRequestedRef.current.delete(autoKey);
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchSessionView("generate_recover");
        if (!isCurrentDataRequest(requestId)) return;
        const recoveredGeneratedAt = recovered?.session?.generatedAt ?? null;
        if (recovered?.session && (recoveredGeneratedAt !== previousGeneratedAt || previousGeneratedAt != null)) {
          adoptIncomingData(recovered, { completionVersionAtStart });
          persistCachedSession(recovered);
          setError(null);
          const autoOrdersKey = buildAutoOrdersKey(recovered);
          if (autoOrdersKey && !autoOrdersRequestedRef.current.has(autoOrdersKey) && recovered?.quota.canRegenerateOrders) {
            autoOrdersRequestedRef.current.add(autoOrdersKey);
            void regenerateOrdersInternal(true);
          }
          return;
        }
      } catch {}
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_generate_failed");
    } finally {
      generateInFlightRef.current = false;
      setGenerating(false);
    }
  };

  // useCallback으로 안정적인 참조를 유지합니다.
  // refs를 통해 항상 최신 data/slot/dateISO를 읽어 stale closure를 방지합니다.
  const toggleCompletion = useCallback(async (orderId: string, completed: boolean) => {
    const currentData = dataRef.current;
    if (!enabledRef.current || !currentData) return;
    togglingCompletionRef.current = orderId;
    setTogglingCompletion(orderId);
    setError(null);
    const previous = currentData.completions;
    const previousStats = currentData.orderStats;
    const next = completed ? Array.from(new Set([...previous, orderId])) : previous.filter((item) => item !== orderId);
    const changed = previous.includes(orderId) !== next.includes(orderId);
    const delta = changed ? (completed ? 1 : -1) : 0;
    const slot = slotRef.current;
    const optimisticStats =
      delta === 0
        ? previousStats
        : {
            ...previousStats,
            todayWakeCompleted: previousStats.todayWakeCompleted + (slot === "wake" ? delta : 0),
            todayPostShiftCompleted: previousStats.todayPostShiftCompleted + (slot === "postShift" ? delta : 0),
            todayTotalCompleted: previousStats.todayTotalCompleted + delta,
            weekTotalCompleted: previousStats.weekTotalCompleted + delta,
          };
    // 낙관적 업데이트: UI에 즉시 반영
    setData((current) => (current ? { ...current, completions: next, orderStats: optimisticStats } : current));
    try {
      const response = await fetch("/api/insights/recovery/ai/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: dateISORef.current,
          orderId,
          completed,
        }),
      });
      const json = await readJson<{
        ok?: boolean;
        error?: string;
        data?: { completions?: string[]; orderStats?: SessionData["orderStats"]; stateRevision?: number | null };
      }>(response);
      if (!response.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      const completions = Array.isArray(json?.data?.completions) ? json.data?.completions ?? [] : [];
      const orderStats = json?.data?.orderStats ?? optimisticStats;
      const nextStateRevision = Number.isFinite(Number(json?.data?.stateRevision)) ? Number(json?.data?.stateRevision) : null;
      const latestData = dataRef.current;
      const nextData = latestData ? { ...latestData, completions, orderStats } : latestData;
      committedCompletionVersionRef.current += 1;
      setData(nextData);
      if (nextData) {
        persistCachedSession(nextData, nextStateRevision ?? stateRevision ?? null);
      }
      if (nextStateRevision != null) {
        const currentSync = getClientSyncSnapshot();
        updateClientSyncSnapshot({
          stateRevision: nextStateRevision,
          bootstrapRevision:
            currentSync.bootstrapRevision == null
              ? nextStateRevision
              : Math.max(currentSync.bootstrapRevision, nextStateRevision),
        });
      }
      emitClientDataInvalidation([CLIENT_DATA_SCOPE_RECOVERY_SESSION, CLIENT_DATA_SCOPE_HOME_PREVIEW]);
    } catch (nextError) {
      // API 실패 시 낙관적 업데이트 롤백
      setData((current) => (current ? { ...current, completions: previous, orderStats: previousStats } : current));
      setError(getAIRecoveryErrorMessage((nextError as any)?.message ?? nextError ?? "ai_recovery_completion_failed"));
    } finally {
      togglingCompletionRef.current = null;
      setTogglingCompletion(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialData && initialData.dateISO === args.dateISO && initialData.slot === args.slot) {
      setData((current) => pickLatestData(current?.dateISO === args.dateISO && current?.slot === args.slot ? current : null, initialData));
      persistCachedSession(initialData);
      setLoading(false);
      setError(null);
      return;
    }
    if (dataRef.current?.dateISO !== args.dateISO || dataRef.current?.slot !== args.slot) {
      setData(null);
      setLoading(true);
      setError(null);
    }
  }, [initialData, args.dateISO, args.slot, accountKey, resourceKey, persistCachedSession, stateRevision]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.dateISO, args.slot, args.enabled, accountKey, resourceKey, stateRevision]);

  return {
    data,
    loading,
    generating,
    savingOrders,
    togglingCompletion,
    error,
    reload: load,
    generate: generateInternal,
    regenerateOrders: () => regenerateOrdersInternal(false),
    toggleCompletion,
  };
}
