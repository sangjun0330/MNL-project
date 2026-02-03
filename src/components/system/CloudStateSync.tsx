"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { hydrateState, useAppStore } from "@/lib/store";

const SAVE_DEBOUNCE_MS = 900;

export function CloudStateSync() {
  const auth = useAuth();
  const store = useAppStore();
  const userId = auth?.userId ?? null;
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef(store);

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
        const res = await fetch("/api/user/state", { credentials: "include" });
        if (!res.ok) {
          console.warn("state sync load failed", res.status);
          if (active) setHydrated(true);
          return;
        }
        const json = await res.json();
        if (!active) return;

        if (json?.state) {
          hydrateState(json.state);
          skipNextSave.current = true;
        } else {
          await fetch("/api/user/state", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ state: storeRef.current.getState() }),
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
  }, [userId]);

  useEffect(() => {
    if (!userId || !hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const state = store.getState();
      void fetch("/api/user/state", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, hydrated, store]);

  return null;
}
