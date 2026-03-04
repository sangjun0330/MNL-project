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
    const channelName = `rt-${safeScope}-${safeUserId}`;
    const channel = supabase.channel(channelName);

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
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          // 구독 성공: 실시간 연결됨
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[ShopRealtime] 실시간 구독 실패 — 폴링으로 대체됩니다.", { channel: channelName, status, err });
        }
      });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [input.enabled, input.scope, input.userId]);
}
