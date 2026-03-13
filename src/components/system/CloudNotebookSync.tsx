"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { getSupabaseBrowserClient, useAuth, useAuthState } from "@/lib/auth";
import { defaultNotebookState, sanitizeNotebookState, type RNestNotebookState } from "@/lib/notebook";
import { useAppStore } from "@/lib/store";

const SAVE_DEBOUNCE_MS = 180;
const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 8000;

type SaveOptions = {
  keepalive?: boolean;
};

export function CloudNotebookSync() {
  const auth = useAuth();
  const { status } = useAuthState();
  const store = useAppStore();
  const userId = auth?.userId ?? null;
  const memo = store.memo;
  const records = store.records;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const currentUserIdRef = useRef<string | null>(userId);
  const initializedRef = useRef(false);
  const skipNextSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestStateRef = useRef<RNestNotebookState | null>(null);
  const latestSignatureRef = useRef("");
  const loadRequestRef = useRef(0);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [supabase]);

  const buildSignature = useCallback((state: RNestNotebookState) => JSON.stringify(state), []);

  const saveStateViaApi = useCallback(
    async (state: RNestNotebookState, options?: SaveOptions) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/tools/notebook/state", {
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
        throw new Error(String(json?.error ?? "failed_to_save_notebook_state"));
      }
    },
    [getAuthHeaders]
  );

  const queueSave = useCallback(
    (nextState: RNestNotebookState, scopedUserId: string | null) => {
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
          await saveStateViaApi(nextState);
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
    [saveStateViaApi]
  );

  const flushNow = useCallback(() => {
    if (!userId || status !== "authenticated" || !initializedRef.current) return;
    const latestState = sanitizeNotebookState({ memo: store.memo, records: store.records });
    const nextSignature = buildSignature(latestState);
    if (nextSignature === latestSignatureRef.current) return;
    latestSignatureRef.current = nextSignature;
    void saveStateViaApi(latestState, { keepalive: true }).catch(() => {
      // ignore page-hide sync failures
    });
  }, [buildSignature, saveStateViaApi, status, store.memo, store.records, userId]);

  const loadNotebookState = useCallback(async () => {
    if (!userId || status !== "authenticated") return null;

    const requestId = ++loadRequestRef.current;
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/tools/notebook/state", {
      method: "GET",
      headers: {
        "content-type": "application/json",
        ...authHeaders,
      },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(String(json?.error ?? "failed_to_load_notebook_state"));
    }

    if (requestId !== loadRequestRef.current) return null;

    const nextState = sanitizeNotebookState(json?.state ?? defaultNotebookState());
    latestSignatureRef.current = buildSignature(nextState);
    skipNextSaveRef.current = true;
    initializedRef.current = true;
    store.setMemoState(nextState.memo);
    store.setRecordState(nextState.records);
    return nextState;
  }, [buildSignature, getAuthHeaders, status, store, userId]);

  useEffect(() => {
    currentUserIdRef.current = userId;
    initializedRef.current = false;
    latestStateRef.current = null;
    latestSignatureRef.current = "";
    skipNextSaveRef.current = true;
    pendingSaveRef.current = false;
    saveInFlightRef.current = false;
    retryCountRef.current = 0;
    loadRequestRef.current += 1;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!userId || status !== "authenticated") return;

    void loadNotebookState().catch(() => {
      initializedRef.current = true;
      latestSignatureRef.current = buildSignature(defaultNotebookState());
    });
  }, [buildSignature, loadNotebookState, status, userId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!userId || status !== "authenticated" || !initializedRef.current) return;

    const nextState = sanitizeNotebookState({ memo, records });
    const nextSignature = buildSignature(nextState);

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      latestSignatureRef.current = nextSignature;
      return;
    }

    if (nextSignature === latestSignatureRef.current) return;

    latestSignatureRef.current = nextSignature;
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
  }, [buildSignature, memo, queueSave, records, status, userId]);

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
