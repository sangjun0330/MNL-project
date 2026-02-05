"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient, useAuth } from "@/lib/auth";
import { hydrateState, useAppStore } from "@/lib/store";
import { emptyState } from "@/lib/model";

const SAVE_DEBOUNCE_MS = 900;
const RESET_VERSION_KEY = "mnl_reset_version";

export function CloudStateSync() {
  const auth = useAuth();
  const store = useAppStore();
  const userId = auth?.userId ?? null;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef(store);

  const getAuthHeaders = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }, [supabase]);

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
      const resetVersion = typeof window !== "undefined" ? window.localStorage.getItem(RESET_VERSION_KEY) : null;
      if (resetVersion) {
        const doneKey = `mnl_reset_done_${userId}`;
        const done = typeof window !== "undefined" ? window.localStorage.getItem(doneKey) : null;
        if (done !== resetVersion) {
          const fresh = emptyState();
          hydrateState(fresh);
          skipNextSave.current = true;
          try {
            const authHeaders = await getAuthHeaders();
            await fetch("/api/user/state", {
              method: "POST",
              headers: { "content-type": "application/json", ...authHeaders },
              body: JSON.stringify({ userId, state: fresh }),
            });
          } catch {
            // ignore network errors
          }
          if (typeof window !== "undefined") {
            window.localStorage.setItem(doneKey, resetVersion);
          }
          if (active) setHydrated(true);
          return;
        }
      }

      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch("/api/user/state", {
          method: "GET",
          headers: { "content-type": "application/json", ...authHeaders },
        });
        if (!res.ok) {
          if (active) setHydrated(true);
          return;
        }
        const json = await res.json();
        if (!active) return;

        if (json?.state) {
          hydrateState(json.state);
          skipNextSave.current = true;
        } else {
          const authHeaders = await getAuthHeaders();
          await fetch("/api/user/state", {
            method: "POST",
            headers: { "content-type": "application/json", ...authHeaders },
            body: JSON.stringify({ userId, state: storeRef.current.getState() }),
          });
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
  }, [userId, getAuthHeaders]);

  useEffect(() => {
    if (!userId || !hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const state = store.getState();
      void (async () => {
        const authHeaders = await getAuthHeaders();
        await fetch("/api/user/state", {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body: JSON.stringify({ userId, state }),
        });
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, hydrated, store, getAuthHeaders]);

  return null;
}
