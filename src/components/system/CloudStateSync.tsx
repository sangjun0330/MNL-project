"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient, useAuth } from "@/lib/auth";
import { hydrateState, useAppStore } from "@/lib/store";

const SAVE_DEBOUNCE_MS = 120;

export function CloudStateSync() {
  const auth = useAuth();
  const store = useAppStore();
  const userId = auth?.userId ?? null;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef(store);
  const saveInFlight = useRef(false);
  const pendingSave = useRef(false);
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
    async (state: any) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/user/state", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) throw new Error("failed to save via api");
    },
    [getAuthHeaders]
  );

  const saveStateViaSupabase = useCallback(
    async (state: any) => {
      if (!userId) return;
      const now = new Date().toISOString();
      const client = supabase as any;
      const { error } = await client
        .from("wnl_user_state")
        .upsert({ user_id: userId, payload: state, updated_at: now }, { onConflict: "user_id" });
      if (error) throw error;
      await client.from("wnl_users").upsert({ user_id: userId, last_seen: now }, { onConflict: "user_id" });
    },
    [supabase, userId]
  );

  const saveState = useCallback(
    async (state: any) => {
      try {
        await saveStateViaSupabase(state);
      } catch {
        await saveStateViaApi(state);
      }
    },
    [saveStateViaSupabase, saveStateViaApi]
  );

  const loadStateViaApi = useCallback(async () => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/user/state", {
      method: "GET",
      headers: { "content-type": "application/json", ...authHeaders },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.state ?? null;
  }, [getAuthHeaders]);

  const loadStateViaSupabase = useCallback(async () => {
    if (!userId) return null;
    const client = supabase as any;
    const { data, error } = await client
      .from("wnl_user_state")
      .select("payload, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data?.payload ?? null;
  }, [supabase, userId]);

  const queueSave = useCallback(
    (state: any) => {
      latestStateRef.current = state;
      if (saveInFlight.current) {
        pendingSave.current = true;
        return;
      }
      saveInFlight.current = true;
      void (async () => {
        try {
          await saveState(state);
        } catch {
          // ignore save errors
        } finally {
          saveInFlight.current = false;
          if (pendingSave.current) {
            pendingSave.current = false;
            const next = latestStateRef.current;
            if (next) queueSave(next);
          }
        }
      })();
    },
    [saveState]
  );

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    if (!userId) {
      setHydrated(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        let remoteState: any = null;
        try {
          remoteState = await loadStateViaSupabase();
        } catch {
          remoteState = await loadStateViaApi();
        }

        if (!active) return;

        if (remoteState) {
          hydrateState(remoteState);
          skipNextSave.current = true;
        } else {
          const fresh = storeRef.current.getState();
          await saveState(fresh);
        }
      } catch {
        // ignore network errors
      } finally {
        if (active) setHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, loadStateViaSupabase, loadStateViaApi, saveState]);

  useEffect(() => {
    if (!userId || !hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const state = store.getState();
      queueSave(state);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, hydrated, store, queueSave]);

  return null;
}
