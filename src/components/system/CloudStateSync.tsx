"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { getSupabaseBrowserClient, useAuth, useAuthState } from "@/lib/auth";
import { useAppStore } from "@/lib/store";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { serializeStateForSupabase } from "@/lib/statePersistence";

const SAVE_DEBOUNCE_MS = 180;
const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 8000;

type SaveOptions = {
  keepalive?: boolean;
};

export function CloudStateSync() {
  const auth = useAuth();
  const { status } = useAuthState();
  const store = useAppStore();
  const storeVersion = (store as any).__v ?? 0;
  const userId = auth?.userId ?? null;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const currentUserIdRef = useRef<string | null>(userId);
  const storeRef = useRef(store);
  const skipNextSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestStateRef = useRef<any>(null);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [supabase]);

  const saveStateViaApi = useCallback(
    async (state: any, options?: SaveOptions) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/user/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ state }),
        keepalive: Boolean(options?.keepalive),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(String(json?.error ?? "failed_to_save_state"));
      }
    },
    [getAuthHeaders]
  );

  const saveState = useCallback(
    async (rawState: any, options?: SaveOptions) => {
      const sanitized = sanitizeStatePayload(rawState);
      const serialized = serializeStateForSupabase(sanitized);
      await saveStateViaApi(serialized, options);
    },
    [saveStateViaApi]
  );

  const queueSave = useCallback(
    (nextState: any, scopedUserId: string | null) => {
      if (!scopedUserId) return;
      latestStateRef.current = nextState;

      if (saveInFlightRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      saveInFlightRef.current = true;
      void (async () => {
        try {
          if (currentUserIdRef.current !== scopedUserId) return;
          await saveState(nextState);
          retryCountRef.current = 0;
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
        } catch (error) {
          if ((error as Error)?.message === "consent_required") {
            return;
          }

          retryCountRef.current += 1;
          const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, retryCountRef.current - 1));
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = setTimeout(() => {
            const latestState = latestStateRef.current;
            const latestUserId = currentUserIdRef.current;
            if (!latestState || !latestUserId) return;
            queueSave(latestState, latestUserId);
          }, delay);
        } finally {
          saveInFlightRef.current = false;
          if (pendingSaveRef.current) {
            pendingSaveRef.current = false;
            const latestState = latestStateRef.current;
            if (latestState && currentUserIdRef.current === scopedUserId) {
              queueSave(latestState, scopedUserId);
            }
          }
        }
      })();
    },
    [saveState]
  );

  const flushNow = useCallback(() => {
    if (!userId || status !== "authenticated") return;
    const latestState = sanitizeStatePayload(storeRef.current.getState());
    void saveState(latestState, { keepalive: true }).catch(() => {
      // Ignore page-hide sync failures.
    });
  }, [saveState, status, userId]);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    currentUserIdRef.current = userId;
    latestStateRef.current = null;
    skipNextSaveRef.current = true;
    pendingSaveRef.current = false;
    saveInFlightRef.current = false;
    retryCountRef.current = 0;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [userId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!userId || status !== "authenticated") return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    const nextState = sanitizeStatePayload(store.getState());
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      queueSave(nextState, userId);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [queueSave, status, store, storeVersion, userId]);

  useEffect(() => {
    if (!userId || status !== "authenticated") return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
      }
    };
    const onPageHide = () => {
      flushNow();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [flushNow, status, userId]);

  return null;
}
