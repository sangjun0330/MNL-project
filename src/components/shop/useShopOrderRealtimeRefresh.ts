"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth";

type UseShopOrderRealtimeRefreshInput = {
  enabled: boolean;
  userId: string | null;
  scope: string;
  onRefresh: () => void | Promise<void>;
};

const REFRESH_DEBOUNCE_MS = 250;

export function useShopOrderRealtimeRefresh(input: UseShopOrderRealtimeRefreshInput) {
  const refreshRef = useRef(input.onRefresh);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshRef.current = input.onRefresh;
  }, [input.onRefresh]);

  useEffect(() => {
    if (!input.enabled || !input.userId) return;

    const supabase = getSupabaseBrowserClient();
    const safeScope = String(input.scope || "shop-orders").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "shop-orders";
    const safeUserId = String(input.userId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const channel = supabase.channel(`rt-${safeScope}-${safeUserId}`);

    const scheduleRefresh = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void refreshRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shop_orders",
          filter: `user_id=eq.${input.userId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_user_state",
          filter: `user_id=eq.${input.userId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [input.enabled, input.scope, input.userId]);
}
