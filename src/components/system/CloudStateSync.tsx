"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { getSupabaseBrowserClient, useAuth, useAuthState } from "@/lib/auth";
import { useAppStore } from "@/lib/store";
import { writeAppStateDraft } from "@/lib/appStateDraft";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { getClientSyncSnapshot, updateClientSyncSnapshot } from "@/lib/clientSyncStore";

const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 8000;

type SaveOptions = {
  keepalive?: boolean;
};

type SaveResult = {
  localOnly: boolean;
  stateRevision: number | null;
};

/**
 * CloudStateSync is the persistence owner.
 * The store mutates in-memory app state; this component serializes, writes local drafts,
 * and syncs the canonical payload to `/api/user/state`.
 */
export function CloudStateSync({ remoteEnabled = false }: { remoteEnabled?: boolean }) {
  const auth = useAuth();
  const { status } = useAuthState();
  const store = useAppStore();
  const storeVersion = (store as any).__v ?? 0;
  const userId = auth?.userId ?? null;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const currentUserIdRef = useRef<string | null>(userId);
  const storeRef = useRef(store);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestStateRef = useRef<any>(null);
  const latestSerializedSignatureRef = useRef("");

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
    async (state: any, options?: SaveOptions): Promise<SaveResult> => {
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

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(String(json?.error ?? "failed_to_save_state"));
      }

      return {
        localOnly: Boolean(json?.localOnly || json?.degraded),
        stateRevision: Number.isFinite(Number(json?.stateRevision)) ? Number(json?.stateRevision) : null,
      };
    },
    [getAuthHeaders]
  );

  const saveState = useCallback(
    async (rawState: any, options?: SaveOptions) => {
      const sanitized = sanitizeStatePayload(rawState);
      const serialized = serializeStateForSupabase(sanitized);
      return saveStateViaApi(serialized, options);
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
          const result = await saveState(nextState);
          if (result.localOnly) {
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
          if (result.stateRevision != null) {
            const current = getClientSyncSnapshot();
            updateClientSyncSnapshot({
              stateRevision: result.stateRevision,
              bootstrapRevision:
                current.bootstrapRevision == null
                  ? result.stateRevision
                  : Math.max(current.bootstrapRevision, result.stateRevision),
            });
          }
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
    const nextSignature = JSON.stringify(serializeStateForSupabase(latestState));
    if (nextSignature === latestSerializedSignatureRef.current) return;
    latestSerializedSignatureRef.current = nextSignature;
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
    latestSerializedSignatureRef.current = "";
    pendingSaveRef.current = false;
    saveInFlightRef.current = false;
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [userId]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const nextState = sanitizeStatePayload(store.getState());
    writeAppStateDraft(userId, nextState);

    if (!remoteEnabled || !userId || status !== "authenticated") return;

    const nextSignature = JSON.stringify(serializeStateForSupabase(nextState));
    if (nextSignature === latestSerializedSignatureRef.current) return;
    latestSerializedSignatureRef.current = nextSignature;
    queueSave(nextState, userId);
  }, [queueSave, remoteEnabled, status, store, storeVersion, userId]);

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

  return null;
}
