"use client";

import { useEffect } from "react";

const SW_VERSION = "20260313-1";

/**
 * Minimal service worker registration for PWA.
 * - Works without extra packages.
 * - SW file lives at /public/sw.js
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    let cleanupControllerChange: (() => void) | null = null;

    const onLoad = async () => {
      try {
        // Dev: unregister any existing SW to avoid stale chunk caching.
        if (process.env.NODE_ENV !== "production") {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          return;
        }

        let refreshed = false;
        const handleControllerChange = () => {
          if (refreshed) return;
          refreshed = true;
          if (document.visibilityState === "hidden") {
            window.location.reload();
          }
        };
        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
        cleanupControllerChange = () => {
          navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        };

        const reg = await navigator.serviceWorker.register(`/sw.js?v=${SW_VERSION}`, { scope: "/" });
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
        try {
          await reg.update();
        } catch {
          // ignore update errors
        }
      } catch (e) {
        // Silent fail: app still works.
        console.warn("SW registration failed", e);
      }
    };

    if (document.readyState === "complete") {
      void onLoad();
    } else {
      window.addEventListener("load", onLoad);
    }
    return () => {
      window.removeEventListener("load", onLoad);
      cleanupControllerChange?.();
    };
  }, []);

  return null;
}
