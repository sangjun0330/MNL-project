"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth";

type UseShopOrderRealtimeRefreshInput = {
  enabled: boolean;
  userId: string | null;
  scope: string;
  onRefresh: () => void | Promise<void>;
};

const REFRESH_DEBOUNCE_MS = 250;
const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function useShopOrderRealtimeRefresh(input: UseShopOrderRealtimeRefreshInput) {
  const refreshRef = useRef(input.onRefresh);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const cleanedUpRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    refreshRef.current = input.onRefresh;
  }, [input.onRefresh]);

  useEffect(() => {
    if (!input.enabled || !input.userId) return;

    cleanedUpRef.current = false;

    const supabase = getSupabaseBrowserClient();
    // Issue 2 fix: 구분자를 __ 로 변경해 채널명 충돌 방지
    const safeScope = String(input.scope || "shop-orders").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "shop-orders";
    const safeUserId = String(input.userId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const channelName = `rt__${safeScope}__${safeUserId}`;
    const channel = supabase.channel(channelName);

    const scheduleRefresh = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void refreshRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    // Issue 4 fix: 지수 백오프 재시도
    const scheduleRetry = () => {
      if (cleanedUpRef.current) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      retryTimerRef.current = setTimeout(() => {
        if (!cleanedUpRef.current) {
          setRetryCount((c) => c + 1);
        }
      }, delay);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shop_orders",
          // Issue 1 fix: safeUserId 사용 (원본 input.userId 대신)
          filter: `user_id=eq.${safeUserId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_user_state",
          // Issue 1 fix: safeUserId 사용
          filter: `user_id=eq.${safeUserId}`,
        },
        scheduleRefresh
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          // 구독 성공: 실시간 연결됨, 재시도 지연 초기화
          retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Issue 3+4 fix: 오류 로그 + 재시도 예약
          console.warn("[ShopRealtime] 실시간 구독 실패 — 재시도합니다.", { channel: channelName, status, err, nextDelay: retryDelayRef.current });
          scheduleRetry();
        } else if (status === "CLOSED") {
          // Issue 3 fix: CLOSED 상태 처리 (cleanup 중 정상 종료는 cleanedUpRef로 구분)
          if (!cleanedUpRef.current) {
            console.warn("[ShopRealtime] 채널 비정상 종료 — 재시도합니다.", { channel: channelName });
            scheduleRetry();
          }
        }
      });

    return () => {
      cleanedUpRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [input.enabled, input.scope, input.userId, retryCount]);
}
