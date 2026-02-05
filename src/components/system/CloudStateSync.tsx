"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient, useAuth, useAuthState } from "@/lib/auth";
import { hydrateState, useAppStore } from "@/lib/store";

const SAVE_DEBOUNCE_MS = 120;
const RETRY_BASE_MS = 800;
const RETRY_MAX_MS = 8000;

export function CloudStateSync() {
  const auth = useAuth();
  const { status } = useAuthState();
  const store = useAppStore();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const userId = auth?.userId ?? sessionUserId ?? null;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef(store);
  const saveInFlight = useRef(false);
  const pendingSave = useRef(false);
  const latestStateRef = useRef<any>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const dirtyBeforeHydrate = useRef(false);
  const lastVersionRef = useRef<number>((store as any).__v ?? 0);
  const isHydratingRef = useRef(false);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionUserId(data.session?.user?.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSessionUserId(nextSession?.user?.id ?? null);
    });
    return () => {
      active = false;
      data.subscription?.unsubscribe();
    };
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

  const loadStateViaApi = useCallback(async (): Promise<{ ok: boolean; state: any | null }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/user/state", {
      method: "GET",
      headers: { "content-type": "application/json", ...authHeaders },
    });
    if (!res.ok) return { ok: false, state: null };
    const json = await res.json();
    return { ok: true, state: json?.state ?? null };
  }, [getAuthHeaders]);

  const loadStateViaSupabase = useCallback(async (): Promise<{ ok: boolean; state: any | null }> => {
    if (!userId) return { ok: false, state: null };
    const client = supabase as any;
    const { data, error } = await client
      .from("wnl_user_state")
      .select("payload, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, state: null };
    return { ok: true, state: data?.payload ?? null };
  }, [supabase, userId]);

  const loadRemoteState = useCallback(async (): Promise<{ ok: boolean; state: any | null }> => {
    try {
      const supa = await loadStateViaSupabase();
      if (supa && supa.ok) return supa;
    } catch {
      // ignore
    }
    try {
      const api = await loadStateViaApi();
      return api;
    } catch {
      return { ok: false, state: null };
    }
  }, [loadStateViaSupabase, loadStateViaApi]);

  const hasAnyUserData = useCallback((s: ReturnType<typeof store.getState>) => {
    const scheduleKeys = Object.keys(s.schedule ?? {});
    const noteKeys = Object.keys(s.notes ?? {});
    const emotionKeys = Object.keys(s.emotions ?? {});
    const bioKeys = Object.keys(s.bio ?? {});
    const shiftNameKeys = Object.keys(s.shiftNames ?? {});
    return (
      scheduleKeys.length ||
      noteKeys.length ||
      emotionKeys.length ||
      bioKeys.length ||
      shiftNameKeys.length
    );
  }, [store]);

  const mergeState = useCallback((remote: any, local: any) => {
    const r = remote ?? {};
    const l = local ?? {};
    return {
      ...r,
      ...l,
      selected: l.selected ?? r.selected,
      schedule: { ...(r.schedule ?? {}), ...(l.schedule ?? {}) },
      shiftNames: { ...(r.shiftNames ?? {}), ...(l.shiftNames ?? {}) },
      notes: { ...(r.notes ?? {}), ...(l.notes ?? {}) },
      emotions: { ...(r.emotions ?? {}), ...(l.emotions ?? {}) },
      bio: { ...(r.bio ?? {}), ...(l.bio ?? {}) },
      settings: {
        ...(r.settings ?? {}),
        ...(l.settings ?? {}),
        menstrual: { ...(r.settings?.menstrual ?? {}), ...(l.settings?.menstrual ?? {}) },
        profile: { ...(r.settings?.profile ?? {}), ...(l.settings?.profile ?? {}) },
      },
    };
  }, []);

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
    const nextV = (store as any).__v ?? 0;
    if (nextV === lastVersionRef.current) return;
    lastVersionRef.current = nextV;
    if (!userId || hydrated) return;
    if (isHydratingRef.current) return;
    dirtyBeforeHydrate.current = true;
  }, [store, hydrated, userId]);

  useEffect(() => {
    if (status === "loading" && !userId) return;
    if (!userId) {
      setHydrated(false);
      return;
    }

    let active = true;
    const tryLoad = async () => {
      let ready = false;
      try {
        const result = await loadRemoteState();
        if (!active) return;

        if (!result.ok) {
          retryCount.current += 1;
          const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, retryCount.current - 1));
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => {
            if (active) void tryLoad();
          }, delay);
          return;
        }

        retryCount.current = 0;
        if (result.state) {
          const local = storeRef.current.getState();
          if (dirtyBeforeHydrate.current) {
            const merged = mergeState(result.state, local);
            isHydratingRef.current = true;
            hydrateState(merged);
            setTimeout(() => {
              isHydratingRef.current = false;
            }, 0);
            skipNextSave.current = true;
            dirtyBeforeHydrate.current = false;
            await saveState(merged);
          } else {
            isHydratingRef.current = true;
            hydrateState(result.state);
            setTimeout(() => {
              isHydratingRef.current = false;
            }, 0);
            skipNextSave.current = true;
          }
        } else {
          const fresh = storeRef.current.getState();
          if (hasAnyUserData(fresh)) {
            await saveState(fresh);
          }
        }
        ready = true;
      } catch {
        // ignore network errors
      } finally {
        if (active && ready) {
          setHydrated(true);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("wnl:cloud-ready", { detail: { userId } }));
          }
        }
      }
    };

    void tryLoad();

    return () => {
      active = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [userId, status, loadRemoteState, saveState, hasAnyUserData]);

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
