"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, fromISODate, toISODate, type ISODate } from "@/lib/date";
import { getAIRecoveryErrorMessage, type AIRecoverySessionResponse, type AIRecoverySlot } from "@/lib/aiRecovery";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { useAppStore } from "@/lib/store";
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

export function useAIRecoverySession(args: HookArgs): HookState {
  const store = useAppStore();
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

  const initialData = normalizeData(args.initialData);
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

  const key = `${args.dateISO}:${args.slot}`;

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
      return buildRecoveryStatePayload(store.getState());
    } catch {
      return null;
    }
  };

  const clearVisibleSession = () => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        session: null,
        stale: false,
      };
    });
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

  const load = async () => {
    const requestId = nextDataRequestId();
    if (!args.enabled) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchSessionView("load");
      if (!isCurrentDataRequest(requestId)) return;
      setData((current) => pickLatestData(current, nextData));
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
      setData(null);
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
      setData((current) => pickLatestData(current, normalizeData(json.data)));
      void load();
    } catch (nextError) {
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchSessionView(auto ? "orders_auto_recover" : "orders_recover");
        if (!isCurrentDataRequest(requestId)) return;
        setData((current) => pickLatestData(current, recovered));
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
    const previousGeneratedAt = data?.session?.generatedAt ?? null;
    setGenerating(true);
    setError(null);
    clearVisibleSession();
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
      setData((current) => pickLatestData(current, nextData));
      void load();
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
          setData((current) => pickLatestData(current, recovered));
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

  const toggleCompletion = async (orderId: string, completed: boolean) => {
    if (!args.enabled || !data) return;
    setTogglingCompletion(orderId);
    setError(null);
    const previous = data.completions;
    const previousStats = data.orderStats;
    const next = completed ? Array.from(new Set([...previous, orderId])) : previous.filter((item) => item !== orderId);
    const changed = previous.includes(orderId) !== next.includes(orderId);
    const delta = changed ? (completed ? 1 : -1) : 0;
    const optimisticStats =
      delta === 0
        ? previousStats
        : {
            ...previousStats,
            todayWakeCompleted: previousStats.todayWakeCompleted + (args.slot === "wake" ? delta : 0),
            todayPostShiftCompleted: previousStats.todayPostShiftCompleted + (args.slot === "postShift" ? delta : 0),
            todayTotalCompleted: previousStats.todayTotalCompleted + delta,
            weekTotalCompleted: previousStats.weekTotalCompleted + delta,
          };
    setData({ ...data, completions: next, orderStats: optimisticStats });
    try {
      const response = await fetch("/api/insights/recovery/ai/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: args.dateISO,
          orderId,
          completed,
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; data?: { completions?: string[]; orderStats?: SessionData["orderStats"] } }>(response);
      if (!response.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      const completions = Array.isArray(json?.data?.completions) ? json.data?.completions ?? [] : [];
      const orderStats = json?.data?.orderStats ?? optimisticStats;
      setData((current) => (current ? { ...current, completions, orderStats } : current));
    } catch (nextError) {
      setData((current) => (current ? { ...current, completions: previous, orderStats: previousStats } : current));
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_completion_failed");
    } finally {
      setTogglingCompletion(null);
    }
  };

  useEffect(() => {
    if (initialData && initialData.dateISO === args.dateISO && initialData.slot === args.slot) {
      setData((current) => pickLatestData(current, initialData));
      setLoading(false);
      setError(null);
    }
  }, [initialData, args.dateISO, args.slot]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.dateISO, args.slot, args.enabled]);

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
