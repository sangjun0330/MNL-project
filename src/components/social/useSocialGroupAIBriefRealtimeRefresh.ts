"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth";

type Input = {
  enabled: boolean;
  groupId: number;
  memberIds: string[];
  onRefresh: () => void | Promise<void>;
};

const REFRESH_DEBOUNCE_MS = 250;
const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

function sanitizeRealtimeTokenPart(value: string, fallback: string, maxLength: number) {
  const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maxLength);
  return safe || fallback;
}

export function useSocialGroupAIBriefRealtimeRefresh(input: Input) {
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
    if (!input.enabled || !input.groupId) return;

    cleanedUpRef.current = false;

    const supabase = getSupabaseBrowserClient();
    const safeScope = sanitizeRealtimeTokenPart(`group-ai-brief-${input.groupId}`, "group-ai-brief", 56);
    const channelName = `rt__${safeScope}`;
    const channel = supabase.channel(channelName);
    const uniqueMemberIds = Array.from(new Set(input.memberIds.map((value) => String(value)).filter(Boolean)));

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

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_social_group_ai_briefs",
          filter: `group_id=eq.${input.groupId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_social_group_ai_card_prefs",
          filter: `group_id=eq.${input.groupId}`,
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_social_group_members",
          filter: `group_id=eq.${input.groupId}`,
        },
        scheduleRefresh
      );

    for (const memberId of uniqueMemberIds) {
      const safeMemberId = sanitizeRealtimeTokenPart(memberId, "member", 64);
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rnest_user_state",
            filter: `user_id=eq.${safeMemberId}`,
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rnest_social_preferences",
            filter: `user_id=eq.${safeMemberId}`,
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_service_consents",
            filter: `user_id=eq.${safeMemberId}`,
          },
          scheduleRefresh
        );
    }

    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[SocialGroupAIBriefRealtime] 실시간 구독 실패 - 재시도합니다.", {
          channel: channelName,
          status,
          err,
        });
        scheduleRetry();
      } else if (status === "CLOSED" && !cleanedUpRef.current) {
        console.warn("[SocialGroupAIBriefRealtime] 채널이 닫혀 재시도합니다.", { channel: channelName });
        scheduleRetry();
      }
    });

    return () => {
      cleanedUpRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [input.enabled, input.groupId, input.memberIds, retryCount]);
}
