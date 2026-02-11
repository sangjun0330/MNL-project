"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSubscriptionSnapshot, type SubscriptionApi } from "@/lib/billing/client";
import { useAuthState } from "@/lib/auth";

type BillingAccessState = {
  loading: boolean;
  subscription: SubscriptionApi | null;
  hasPaidAccess: boolean;
  error: string | null;
  reload: () => void;
};

export function useBillingAccess(): BillingAccessState {
  const { status, user } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => setReloadTick((c) => c + 1), []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setSubscription(null);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    const run = async () => {
      try {
        const data = await fetchSubscriptionSnapshot();
        if (!active) return;
        setSubscription(data.subscription);
      } catch (e: any) {
        if (!active) return;
        setSubscription(null);
        setError(String(e?.message ?? "billing_access_load_failed"));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();

    return () => {
      active = false;
    };
  }, [reloadTick, status, user?.userId]);

  return {
    loading,
    subscription,
    hasPaidAccess: Boolean(subscription?.hasPaidAccess),
    error,
    reload,
  };
}
