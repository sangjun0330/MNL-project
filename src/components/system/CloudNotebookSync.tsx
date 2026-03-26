"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { getSupabaseBrowserClient, useAuth, useAuthState } from "@/lib/auth";
import {
  defaultNotebookState,
  hasMeaningfulNotebookState,
  sanitizeNotebookState,
  type RNestNotebookState,
} from "@/lib/notebook";
import { useAppStore } from "@/lib/store";

const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 8000;
const REMOTE_REFRESH_INTERVAL_MS = 12000;
const LOCAL_NOTEBOOK_DRAFT_KEY = "rnest_notebook_state_v1";
const GUEST_NOTEBOOK_DRAFT_KEY = `${LOCAL_NOTEBOOK_DRAFT_KEY}:guest`;

type SaveOptions = {
  keepalive?: boolean;
};

type SaveResult = {
  localOnly: boolean;
};

type LocalNotebookDraft = {
  updatedAt: number;
  state: RNestNotebookState;
  dirty: boolean;
  syncedAt: number | null;
  scope: "guest" | "user";
};

function buildLocalDraftKey(userId: string) {
  return `${LOCAL_NOTEBOOK_DRAFT_KEY}:${userId}`;
}

function clearLocalDraft(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(userId ? buildLocalDraftKey(userId) : GUEST_NOTEBOOK_DRAFT_KEY);
  } catch {
    // Ignore local backup clear failures.
  }
}

function readLocalDraft(userId: string | null): LocalNotebookDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(userId ? buildLocalDraftKey(userId) : GUEST_NOTEBOOK_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown; state?: unknown } | null;
    const updatedAt =
      typeof parsed?.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now();
    const state = sanitizeNotebookState(parsed?.state ?? defaultNotebookState());
    if (!hasMeaningfulNotebookState(state)) return null;
    const dirty = typeof (parsed as { dirty?: unknown } | null)?.dirty === "boolean" ? Boolean((parsed as { dirty?: unknown }).dirty) : false;
    const syncedAtRaw = (parsed as { syncedAt?: unknown } | null)?.syncedAt;
    const syncedAt = typeof syncedAtRaw === "number" && Number.isFinite(syncedAtRaw) ? syncedAtRaw : null;
    return { updatedAt, state, dirty, syncedAt, scope: userId ? "user" : "guest" };
  } catch {
    return null;
  }
}

function writeLocalDraft(
  userId: string | null,
  state: RNestNotebookState,
  options?: { dirty?: boolean; syncedAt?: number | null }
) {
  if (typeof window === "undefined") return;
  try {
    if (!hasMeaningfulNotebookState(state)) {
      clearLocalDraft(userId);
      return;
    }
    window.localStorage.setItem(
      userId ? buildLocalDraftKey(userId) : GUEST_NOTEBOOK_DRAFT_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        state,
        dirty: Boolean(options?.dirty),
        syncedAt: typeof options?.syncedAt === "number" && Number.isFinite(options.syncedAt) ? options.syncedAt : null,
      })
    );
  } catch {
    // Ignore local backup failures.
  }
}

function readPreferredLocalDraft(userId: string | null) {
  if (!userId) return readLocalDraft(null);
  return readLocalDraft(userId);
}

export function CloudNotebookSync({ remoteEnabled = false }: { remoteEnabled?: boolean }) {
  const auth = useAuth();
  const { status } = useAuthState();
  const store = useAppStore();
  const userId = auth?.userId ?? null;
  const memo = store.memo;
  const records = store.records;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const currentUserIdRef = useRef<string | null>(userId);
  const storeRef = useRef(store);
  const initializedRef = useRef(false);
  const skipNextSaveRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const remoteLoadInFlightRef = useRef(false);
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

  const getCurrentNotebookState = useCallback(() => {
    const latestStore = storeRef.current;
    return sanitizeNotebookState({
      memo: latestStore.memo,
      records: latestStore.records,
    });
  }, []);

  const applyHydratedState = useCallback(
    (nextState: RNestNotebookState) => {
      latestSignatureRef.current = buildSignature(nextState);
      latestStateRef.current = nextState;
      skipNextSaveRef.current = true;
      initializedRef.current = true;
      storeRef.current.setMemoState(nextState.memo);
      storeRef.current.setRecordState(nextState.records);
    },
    [buildSignature]
  );

  const saveStateViaApi = useCallback(
    async (state: RNestNotebookState, options?: SaveOptions): Promise<SaveResult> => {
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

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(String(json?.error ?? "failed_to_save_notebook_state"));
      }

      return {
        localOnly: Boolean(json?.localOnly || json?.degraded),
      };
    },
    [getAuthHeaders]
  );

  const queueSave = useCallback(
    (nextState: RNestNotebookState, scopedUserId: string | null) => {
      if (!scopedUserId) return;
      latestStateRef.current = nextState;
      writeLocalDraft(scopedUserId, nextState, { dirty: true });

      if (saveInFlightRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      saveInFlightRef.current = true;
      void (async () => {
        try {
          if (currentUserIdRef.current !== scopedUserId) return;
          const result = await saveStateViaApi(nextState);
          if (result.localOnly) {
            writeLocalDraft(scopedUserId, nextState, {
              dirty: true,
              syncedAt: null,
            });
            retryCountRef.current = 0;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
            }
            retryTimerRef.current = setTimeout(() => {
              const latestState = latestStateRef.current;
              const latestUserId = currentUserIdRef.current;
              if (!latestState || !latestUserId) return;
              queueSave(latestState, latestUserId);
            }, 30_000);
            return;
          }
          writeLocalDraft(scopedUserId, nextState, {
            dirty: false,
            syncedAt: Date.now(),
          });
          clearLocalDraft(null);
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
    if (!remoteEnabled || !userId || status !== "authenticated" || !initializedRef.current) return;
    const latestState = getCurrentNotebookState();
    const nextSignature = buildSignature(latestState);
    writeLocalDraft(userId, latestState, { dirty: true });
    if (nextSignature === latestSignatureRef.current) return;
    latestSignatureRef.current = nextSignature;
    latestStateRef.current = latestState;
    void saveStateViaApi(latestState, { keepalive: true }).catch(() => {
      // Ignore page-hide sync failures.
    });
  }, [buildSignature, getCurrentNotebookState, remoteEnabled, saveStateViaApi, status, userId]);

  const loadNotebookState = useCallback(async () => {
    if (!remoteEnabled || !userId || status !== "authenticated") return null;

    const requestId = ++loadRequestRef.current;
    const localDraftAtLoadStart = readPreferredLocalDraft(userId);
    const localStateAtLoadStart = getCurrentNotebookState();
    const localSignatureAtLoadStart = buildSignature(localStateAtLoadStart);
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
    if (json?.degraded || json?.localOnly) {
      throw new Error("notebook_state_degraded");
    }

    if (requestId !== loadRequestRef.current) return null;

    const remoteState = sanitizeNotebookState(json?.state ?? defaultNotebookState());
    const remoteSignature = buildSignature(remoteState);
    const remoteUpdatedAt =
      typeof json?.updatedAt === "number" && Number.isFinite(json.updatedAt) ? json.updatedAt : null;
    const remoteHasMeaningfulState = hasMeaningfulNotebookState(remoteState);
    const currentState = getCurrentNotebookState();
    const currentSignature = buildSignature(currentState);
    const localChangedWhileLoading = currentSignature !== localSignatureAtLoadStart;
    const localDraftIsNewer =
      Boolean(localDraftAtLoadStart) &&
      Boolean(localDraftAtLoadStart?.dirty) &&
      typeof localDraftAtLoadStart?.updatedAt === "number" &&
      (remoteUpdatedAt == null || localDraftAtLoadStart.updatedAt > remoteUpdatedAt);

    if (
      localChangedWhileLoading ||
      (!remoteHasMeaningfulState && hasMeaningfulNotebookState(currentState)) ||
      (localDraftIsNewer && currentSignature === buildSignature(localDraftAtLoadStart?.state ?? defaultNotebookState()))
    ) {
      initializedRef.current = true;
      latestSignatureRef.current = currentSignature;
      latestStateRef.current = currentState;
      writeLocalDraft(userId, currentState, { dirty: true });
      if (hasMeaningfulNotebookState(currentState) && currentSignature !== remoteSignature) {
        queueSave(currentState, userId);
      }
      return currentState;
    }

    if (remoteSignature === currentSignature) {
      initializedRef.current = true;
      latestSignatureRef.current = currentSignature;
      latestStateRef.current = currentState;
      writeLocalDraft(userId, currentState, {
        dirty: false,
        syncedAt: remoteUpdatedAt,
      });
      clearLocalDraft(null);
      return currentState;
    }

    applyHydratedState(remoteState);
    writeLocalDraft(userId, remoteState, {
      dirty: false,
      syncedAt: remoteUpdatedAt,
    });
    clearLocalDraft(null);
    return remoteState;
  }, [applyHydratedState, buildSignature, getAuthHeaders, getCurrentNotebookState, queueSave, remoteEnabled, status, userId]);

  const refreshFromRemote = useCallback(async () => {
    if (!remoteEnabled || !userId || status !== "authenticated" || !initializedRef.current) return null;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return null;
    if (saveInFlightRef.current || pendingSaveRef.current || remoteLoadInFlightRef.current) return null;

    const currentState = getCurrentNotebookState();
    const currentSignature = buildSignature(currentState);
    const localDraft = readPreferredLocalDraft(userId);
    if (localDraft?.dirty || currentSignature !== latestSignatureRef.current) return null;

    remoteLoadInFlightRef.current = true;
    try {
      return await loadNotebookState();
    } finally {
      remoteLoadInFlightRef.current = false;
    }
  }, [buildSignature, getCurrentNotebookState, loadNotebookState, remoteEnabled, status, userId]);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    currentUserIdRef.current = userId;
    initializedRef.current = false;
    latestStateRef.current = null;
    latestSignatureRef.current = "";
    skipNextSaveRef.current = true;
    pendingSaveRef.current = false;
    saveInFlightRef.current = false;
    remoteLoadInFlightRef.current = false;
    retryCountRef.current = 0;
    loadRequestRef.current += 1;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const localDraft = readPreferredLocalDraft(userId);
    const shouldHydrateLocalDraftImmediately =
      Boolean(localDraft) && (!userId || status !== "authenticated" || Boolean(localDraft?.dirty));
    if (localDraft && shouldHydrateLocalDraftImmediately) {
      applyHydratedState(localDraft.state);
    }

    if (!userId || status !== "authenticated" || !remoteEnabled) {
      initializedRef.current = true;
      const fallbackState = localDraft?.state ?? getCurrentNotebookState();
      latestSignatureRef.current = buildSignature(fallbackState);
      latestStateRef.current = fallbackState;
      writeLocalDraft(userId, fallbackState, { dirty: Boolean(localDraft?.dirty) });
      return;
    }

    void loadNotebookState().catch(() => {
      const fallbackState = localDraft?.state ?? getCurrentNotebookState();
      initializedRef.current = true;
      latestSignatureRef.current = buildSignature(fallbackState);
      latestStateRef.current = fallbackState;
      writeLocalDraft(userId, fallbackState, { dirty: Boolean(localDraft?.dirty) });
    });
  }, [applyHydratedState, buildSignature, getCurrentNotebookState, loadNotebookState, remoteEnabled, status, userId]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const nextState = sanitizeNotebookState({ memo, records });
    const existingLocalDraft = readPreferredLocalDraft(userId ?? null);
    if (
      !hasMeaningfulNotebookState(nextState) &&
      existingLocalDraft &&
      hasMeaningfulNotebookState(existingLocalDraft.state) &&
      (!initializedRef.current || status !== "authenticated")
    ) {
      // During auth/bootstrap churn, never replace a meaningful local draft with an empty state.
    } else {
      writeLocalDraft(userId ?? null, nextState, {
        dirty: !skipNextSaveRef.current,
      });
    }
    if (!remoteEnabled || !userId || status !== "authenticated" || !initializedRef.current) return;

    const nextSignature = buildSignature(nextState);

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      if (nextSignature === latestSignatureRef.current) {
        latestStateRef.current = nextState;
        writeLocalDraft(userId, nextState, {
          dirty: false,
        });
        return;
      }
    }

    if (nextSignature === latestSignatureRef.current) return;

    latestSignatureRef.current = nextSignature;
    latestStateRef.current = nextState;
    queueSave(nextState, userId);
  }, [buildSignature, memo, queueSave, records, remoteEnabled, status, userId]);

  useEffect(() => {
    if (!remoteEnabled || !userId || status !== "authenticated") return;

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
  }, [flushNow, remoteEnabled, status, userId]);

  useEffect(() => {
    if (!remoteEnabled || !userId || status !== "authenticated") return;

    const requestRefresh = () => {
      void refreshFromRemote().catch(() => {
        // Ignore opportunistic refresh failures.
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestRefresh();
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      requestRefresh();
    }, REMOTE_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", requestRefresh);
    window.addEventListener("pageshow", requestRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", requestRefresh);
      window.removeEventListener("pageshow", requestRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshFromRemote, remoteEnabled, status, userId]);

  return null;
}
