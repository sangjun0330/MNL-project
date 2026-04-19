"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/billing/client";

export async function fetchSocialAdminAccess() {
  const headers = await authHeaders();
  const res = await fetch("/api/admin/social/access", {
    method: "GET",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  return Boolean(json?.ok && json?.data?.isAdmin);
}

export function useSocialAdminAccess(enabled: boolean) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setIsAdmin(false);
      setChecked(false);
      return;
    }

    setChecked(false);
    void fetchSocialAdminAccess()
      .then((nextValue) => {
        if (cancelled) return;
        setIsAdmin(nextValue);
        setChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { isAdmin, checked };
}
