"use client";

import { useEffect } from "react";

/**
 * Minimal service worker registration for PWA.
 * - Works without extra packages.
 * - SW file lives at /public/sw.js
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = async () => {
      try {
        // Dev: unregister any existing SW to avoid stale chunk caching.
        if (process.env.NODE_ENV !== "production") {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          return;
        }

        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
