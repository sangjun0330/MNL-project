"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import { todayISO } from "@/lib/date";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";

type HookResult = {
  data: AIRecoveryPayload | null;
  loading: boolean;
  fromSupabase: boolean;
  error: string | null;
  requiresTodaySleep: boolean;
};

export function useAIRecoveryInsights(): HookResult {
  const { lang } = useI18n();
  const { state } = useInsightsData();
  const [remoteData, setRemoteData] = useState<AIRecoveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStoreHydrated = state.selected !== ("1970-01-01" as any);

  const fetchRecovery = useCallback(
    async (signal: AbortSignal, dateISO: string) => {
      const res = await fetch(`/api/insights/recovery?lang=${lang}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (signal.aborted) return;

      let text = "";
      try {
        text = await res.text();
      } catch {
        throw new Error(`http_${res.status}_empty_response`);
      }

      if (signal.aborted) return;

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
        throw new Error(`http_${res.status}_non_json:${snippet || "empty"}`);
      }

      if (signal.aborted) return;

      if (res.ok && json?.ok && json.data) {
        const payload = json.data as AIRecoveryPayload;
        if (payload.engine !== "openai") {
          throw new Error(`invalid_engine:${String(payload.engine ?? "unknown")}`);
        }
        setRemoteData(payload);
        setError(null);
        return;
      }

      throw new Error(json?.error ?? `http_${res.status}`);
    },
    [lang]
  );

  useEffect(() => {
    if (!isStoreHydrated) return;
    const dateISO = todayISO();
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRemoteData(null);

    const run = async () => {
      try {
        await fetchRecovery(controller.signal, dateISO);
      } catch (err: any) {
        if (!controller.signal.aborted && err?.name !== "AbortError") {
          setError(err?.message ?? "network_error");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [fetchRecovery, isStoreHydrated, lang]);

  return useMemo(
    () => ({
      data: remoteData,
      loading,
      fromSupabase: Boolean(remoteData),
      error,
      requiresTodaySleep: false,
    }),
    [remoteData, loading, error]
  );
}
