"use client";

import { useEffect, useRef, useState } from "react";
import type { ISODate } from "@/lib/date";
import { getAIRecoveryErrorMessage, type AIRecoverySessionResponse, type AIRecoverySlot } from "@/lib/aiRecovery";

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
  regenerateOrders: (candidateIds: string[]) => Promise<void>;
  toggleCompletion: (orderId: string, completed: boolean) => Promise<void>;
};

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null);
}

export function useAIRecoverySession(args: HookArgs): HookState {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [togglingCompletion, setTogglingCompletion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRequestedRef = useRef(new Set<string>());

  const key = `${args.dateISO}:${args.slot}`;

  const setFriendlyError = (value: unknown) => {
    setError(getAIRecoveryErrorMessage(value));
  };

  const load = async () => {
    if (!args.enabled) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/insights/recovery/ai?date=${args.dateISO}&slot=${args.slot}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = await readJson<{ ok?: boolean; error?: string; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      setData(json.data);
      const shouldAutoGenerate =
        args.autoGenerate !== false &&
        json.data.gate.allowed &&
        !json.data.session &&
        !autoRequestedRef.current.has(key);
      if (shouldAutoGenerate) {
        autoRequestedRef.current.add(key);
        await generateInternal(false, key);
      }
    } catch (nextError) {
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_load_failed");
    } finally {
      setLoading(false);
    }
  };

  const generateInternal = async (force = false, autoKey?: string) => {
    if (!args.enabled) return;
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
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      setData(json.data);
    } catch (nextError) {
      if (autoKey) autoRequestedRef.current.delete(autoKey);
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_generate_failed");
    } finally {
      setGenerating(false);
    }
  };

  const regenerateOrders = async (candidateIds: string[]) => {
    if (!args.enabled) return;
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
          candidateIds,
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      setData(json.data);
    } catch (nextError) {
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
