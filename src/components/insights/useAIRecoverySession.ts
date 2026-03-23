"use client";

import { useEffect, useRef, useState } from "react";
import type { ISODate } from "@/lib/date";
import { getAIRecoveryErrorMessage, type AIRecoverySessionResponse, type AIRecoverySlot } from "@/lib/aiRecovery";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { useAppStore } from "@/lib/store";

type SessionData = AIRecoverySessionResponse["data"];

type HookArgs = {
  dateISO: ISODate;
  slot: AIRecoverySlot;
  autoGenerate?: boolean;
  enabled?: boolean;
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
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [togglingCompletion, setTogglingCompletion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRequestedRef = useRef(new Set<string>());
  const dataRequestRef = useRef(0);

  const key = `${args.dateISO}:${args.slot}`;

  const nextDataRequestId = () => {
    dataRequestRef.current += 1;
    return dataRequestRef.current;
  };

  const isCurrentDataRequest = (requestId: number) => dataRequestRef.current === requestId;

  const normalizeData = (value: SessionData | null | undefined): SessionData | null => {
    if (!value) return null;
    return {
      ...value,
      dateISO: value.dateISO ?? args.dateISO,
      slot: value.slot ?? args.slot,
      hasAIEntitlement: value.hasAIEntitlement ?? Boolean(args.enabled),
    } satisfies SessionData;
  };

  const setFriendlyError = (value: unknown) => {
    setError(getAIRecoveryErrorMessage(value));
  };

  const buildStatePayload = () => {
    try {
      return serializeStateForSupabase(store.getState());
    } catch {
      return null;
    }
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
      setData(nextData);
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

  const generateInternal = async (force = false, autoKey?: string) => {
    if (!args.enabled) return;
    const requestId = nextDataRequestId();
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
      setData(normalizeData(json.data));
    } catch (nextError) {
      if (autoKey) autoRequestedRef.current.delete(autoKey);
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchSessionView("generate_recover");
        if (!isCurrentDataRequest(requestId)) return;
        setData(recovered);
        setError(null);
        return;
      } catch {}
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_generate_failed");
    } finally {
      setGenerating(false);
    }
  };

  const regenerateOrders = async () => {
    if (!args.enabled) return;
    const requestId = nextDataRequestId();
    setSavingOrders(true);
    setError(null);
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
        });
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      if (!isCurrentDataRequest(requestId)) return;
      setData(normalizeData(json.data));
    } catch (nextError) {
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchSessionView("orders_recover");
        if (!isCurrentDataRequest(requestId)) return;
        setData(recovered);
        setError(null);
        return;
      } catch {}
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_orders_failed");
    } finally {
      setSavingOrders(false);
    }
  };

  const toggleCompletion = async (orderId: string, completed: boolean) => {
    if (!args.enabled || !data) return;
    setTogglingCompletion(orderId);
    setError(null);
    const previous = data.completions;
    const next = completed ? Array.from(new Set([...previous, orderId])) : previous.filter((item) => item !== orderId);
    setData({ ...data, completions: next });
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
      const json = await readJson<{ ok?: boolean; error?: string; data?: { completions?: string[] } }>(response);
      if (!response.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      const completions = Array.isArray(json?.data?.completions) ? json.data?.completions ?? [] : [];
      setData((current) => (current ? { ...current, completions } : current));
    } catch (nextError) {
      setData((current) => (current ? { ...current, completions: previous } : current));
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_completion_failed");
    } finally {
      setTogglingCompletion(null);
    }
  };

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
    regenerateOrders,
    toggleCompletion,
  };
}
