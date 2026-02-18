"use client";

import { useEffect } from "react";
import { purgeExpiredHandoffAuditEvents } from "@/lib/handoff/auditLog";
import { purgeExpiredStructuredSessions } from "@/lib/handoff/sessionStore";
import { purgeExpiredVaultRecords } from "@/lib/handoff/vault";

const JANITOR_INTERVAL_MS = 5 * 60 * 1000;

export function HandoffJanitor() {
  useEffect(() => {
    const runCleanup = async () => {
      purgeExpiredStructuredSessions();
      purgeExpiredHandoffAuditEvents();
      await purgeExpiredVaultRecords();
    };

    void runCleanup();

    const timer = window.setInterval(() => {
      void runCleanup();
    }, JANITOR_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void runCleanup();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}

export default HandoffJanitor;
