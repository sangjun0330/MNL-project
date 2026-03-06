"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/auth";

type SocialConnectionRealtimeRow = {
  id?: number;
  requester_id?: string | null;
  receiver_id?: string | null;
  status?: string | null;
};

export type SocialConnectionRealtimePayload =
  RealtimePostgresChangesPayload<SocialConnectionRealtimeRow>;

type UseSocialConnectionsRealtimeRefreshInput = {
  enabled: boolean;
  userId: string | null;
  scope: string;
  onRefresh: () => void | Promise<void>;
  onEvent?: (payload: SocialConnectionRealtimePayload) => void;
};

const REFRESH_DEBOUNCE_MS = 250;
const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

function sanitizeRealtimeTokenPart(value: string, fallback: string, maxLength: number) {
  const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maxLength);
  return safe || fallback;
}

function extractUserIds(payload: SocialConnectionRealtimePayload) {
  const next = (payload.new ?? {}) as SocialConnectionRealtimeRow;
  const prev = (payload.old ?? {}) as SocialConnectionRealtimeRow;
  return [
    typeof next.requester_id === "string" ? next.requester_id : null,
    typeof next.receiver_id === "string" ? next.receiver_id : null,
    typeof prev.requester_id === "string" ? prev.requester_id : null,
    typeof prev.receiver_id === "string" ? prev.receiver_id : null,
  ];
}

export function useSocialConnectionsRealtimeRefresh(input: UseSocialConnectionsRealtimeRefreshInput) {
  const refreshRef = useRef(input.onRefresh);
  const eventRef = useRef(input.onEvent);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const cleanedUpRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    refreshRef.current = input.onRefresh;
  }, [input.onRefresh]);

  useEffect(() => {
    eventRef.current = input.onEvent;
  }, [input.onEvent]);

  useEffect(() => {
    if (!input.enabled || !input.userId) return;

    cleanedUpRef.current = false;

    const supabase = getSupabaseBrowserClient();
    const safeScope = sanitizeRealtimeTokenPart(input.scope, "social-connections", 40);
    const safeUserId = sanitizeRealtimeTokenPart(input.userId, "social-user", 64);
    const channelName = `rt__${safeScope}__${safeUserId}`;
    const channel = supabase.channel(channelName);

    const scheduleRefresh = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void refreshRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    const scheduleRetry = () => {
      if (cleanedUpRef.current) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      retryTimerRef.current = setTimeout(() => {
        if (!cleanedUpRef.current) {
          setRetryCount((count) => count + 1);
        }
      }, delay);
    };

    const handlePayload = (payload: SocialConnectionRealtimePayload) => {
      const relatedUserIds = extractUserIds(payload);
      if (!relatedUserIds.includes(input.userId)) return;

      try {
        eventRef.current?.(payload);
      } catch (err) {
        console.warn("[SocialRealtime] 이벤트 처리 중 오류가 발생했습니다.", err);
      }

      scheduleRefresh();
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_connections",
          filter: `requester_id=eq.${safeUserId}`,
        },
        handlePayload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_connections",
          filter: `receiver_id=eq.${safeUserId}`,
        },
        handlePayload
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[SocialRealtime] 실시간 구독 실패 — 재시도합니다.", {
            channel: channelName,
            status,
            err,
            nextDelay: retryDelayRef.current,
          });
          scheduleRetry();
        } else if (status === "CLOSED") {
          if (!cleanedUpRef.current) {
            console.warn("[SocialRealtime] 채널이 닫혀 재시도합니다.", { channel: channelName });
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
