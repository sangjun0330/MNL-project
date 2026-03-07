"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth";

type Input = {
  enabled: boolean;
  userId: string | null;
  onNewEvent: () => void;
};

function sanitize(value: string, fallback: string, maxLength: number) {
  const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maxLength);
  return safe || fallback;
}

const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function useSocialEventsRealtimeRefresh({ enabled, userId, onNewEvent }: Input) {
  const onNewEventRef = useRef(onNewEvent);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const cleanedUpRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    onNewEventRef.current = onNewEvent;
  }, [onNewEvent]);

  useEffect(() => {
    if (!enabled || !userId) return;

    cleanedUpRef.current = false;

    const supabase = getSupabaseBrowserClient();
    const safeUserId = sanitize(userId, "social-user", 64);
    const channelName = `rt__social-events__${safeUserId}`;
    const channel = supabase.channel(channelName);

    const scheduleRetry = () => {
      if (cleanedUpRef.current) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      retryTimerRef.current = setTimeout(() => {
        if (!cleanedUpRef.current) setRetryCount((c) => c + 1);
      }, delay);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rnest_social_events",
          filter: `recipient_id=eq.${safeUserId}`,
        },
        () => {
          onNewEventRef.current();
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[SocialEventsRealtime] 실시간 구독 실패 — 재시도합니다.", {
            channel: channelName,
            status,
            err,
          });
          scheduleRetry();
        } else if (status === "CLOSED") {
          if (!cleanedUpRef.current) {
            console.warn("[SocialEventsRealtime] 채널이 닫혀 재시도합니다.", { channel: channelName });
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
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, retryCount]);
}
