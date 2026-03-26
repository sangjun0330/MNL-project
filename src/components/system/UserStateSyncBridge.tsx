"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth";
import {
  markClientRealtimeEvent,
  markClientRealtimeHealthy,
  markClientRealtimeUnhealthy,
  shouldIgnoreBootstrapRealtimeRevision,
  shouldIgnoreStateRealtimeRevision,
  useClientSyncSnapshot,
} from "@/lib/clientSyncStore";

type UserStateSyncBridgeProps = {
  enabled: boolean;
  userId: string | null;
  onRefreshState: () => Promise<void>;
  onRefreshBootstrap: () => Promise<void>;
};

const REFRESH_DEBOUNCE_MS = 250;
const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;
const POLL_INTERVAL_MS = 20_000;
const REALTIME_STALE_AFTER_MS = 45_000;

function sanitizeChannelPart(value: string, fallback: string, maxLength: number) {
  const sanitized = String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, maxLength);
  return sanitized || fallback;
}

function toRealtimeRevision(payload: any) {
  const candidates = [
    payload?.new?.updated_at,
    payload?.new?.created_at,
    payload?.old?.updated_at,
    payload?.old?.created_at,
    payload?.commit_timestamp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const parsed = new Date(candidate).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function UserStateSyncBridge(input: UserStateSyncBridgeProps) {
  const syncSnapshot = useClientSyncSnapshot();
  const refreshStateRef = useRef(input.onRefreshState);
  const refreshBootstrapRef = useRef(input.onRefreshBootstrap);
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const cleanedUpRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    refreshStateRef.current = input.onRefreshState;
  }, [input.onRefreshState]);

  useEffect(() => {
    refreshBootstrapRef.current = input.onRefreshBootstrap;
  }, [input.onRefreshBootstrap]);

  useEffect(() => {
    if (!input.enabled || !input.userId) return;

    cleanedUpRef.current = false;
    const supabase = getSupabaseBrowserClient();
    const safeScope = sanitizeChannelPart("user-state-sync", "user-state-sync", 40);
    const safeUserId = sanitizeChannelPart(input.userId, "user", 48);
    const channelName = `rt__${safeScope}__${safeUserId}`;
    const channel = supabase.channel(channelName);

    const scheduleStateRefresh = () => {
      if (stateTimerRef.current) return;
      stateTimerRef.current = setTimeout(() => {
        stateTimerRef.current = null;
        void refreshStateRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    const scheduleBootstrapRefresh = () => {
      if (bootstrapTimerRef.current) return;
      bootstrapTimerRef.current = setTimeout(() => {
        bootstrapTimerRef.current = null;
        void refreshBootstrapRef.current();
      }, REFRESH_DEBOUNCE_MS);
    };

    const scheduleRetry = () => {
      if (cleanedUpRef.current) return;
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      retryTimerRef.current = setTimeout(() => {
        if (!cleanedUpRef.current) {
          setRetryCount((current) => current + 1);
        }
      }, delay);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_user_state",
          filter: `user_id=eq.${safeUserId}`,
        },
        (payload) => {
          const revision = toRealtimeRevision(payload);
          markClientRealtimeEvent();
          if (shouldIgnoreStateRealtimeRevision(revision)) return;
          scheduleStateRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rnest_users",
          filter: `user_id=eq.${safeUserId}`,
        },
        (payload) => {
          const revision = toRealtimeRevision(payload);
          markClientRealtimeEvent();
          if (shouldIgnoreBootstrapRealtimeRevision(revision)) return;
          scheduleBootstrapRefresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_service_consents",
          filter: `user_id=eq.${safeUserId}`,
        },
        (payload) => {
          const revision = toRealtimeRevision(payload);
          markClientRealtimeEvent();
          if (shouldIgnoreBootstrapRealtimeRevision(revision)) return;
          scheduleBootstrapRefresh();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
          markClientRealtimeHealthy();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          markClientRealtimeUnhealthy();
          scheduleRetry();
          return;
        }
        if (status === "CLOSED" && !cleanedUpRef.current) {
          markClientRealtimeUnhealthy();
          scheduleRetry();
        }
      });

    return () => {
      cleanedUpRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (stateTimerRef.current) {
        clearTimeout(stateTimerRef.current);
        stateTimerRef.current = null;
      }
      if (bootstrapTimerRef.current) {
        clearTimeout(bootstrapTimerRef.current);
        bootstrapTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [input.enabled, input.userId, retryCount]);

  useEffect(() => {
    if (!input.enabled || !input.userId) return;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      const lastRealtimeAt = syncSnapshot.lastRealtimeAt ?? 0;
      const realtimeStale = !syncSnapshot.subscriptionHealthy || !lastRealtimeAt || Date.now() - lastRealtimeAt >= REALTIME_STALE_AFTER_MS;
      if (!realtimeStale || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      void refreshBootstrapRef.current().finally(() => {
        pollInFlightRef.current = false;
      });
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [input.enabled, input.userId, syncSnapshot.lastRealtimeAt, syncSnapshot.subscriptionHealthy]);

  return null;
}
