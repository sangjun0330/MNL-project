"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BILLING_ENTITLEMENTS,
  hasBillingEntitlement,
  type BillingEntitlement,
  type BillingEntitlements,
} from "@/lib/billing/entitlements";
import { fetchSubscriptionSnapshot, type SubscriptionApi } from "@/lib/billing/client";
import { useAuthState } from "@/lib/auth";

const cachedSubscriptions = new Map<string, { subscription: SubscriptionApi | null; cachedAt: number }>();
const inFlightSubscriptions = new Map<string, Promise<SubscriptionApi | null>>();
const BILLING_CACHE_TTL_MS = 15_000;

async function readSubscriptionWithCache(userId: string, force = false) {
  const now = Date.now();
  const cached = cachedSubscriptions.get(userId);
  if (!force && cached && now - cached.cachedAt < BILLING_CACHE_TTL_MS) {
    return cached.subscription;
  }

  const inFlight = inFlightSubscriptions.get(userId);
  if (!force && inFlight) return inFlight;

  const request = fetchSubscriptionSnapshot()
    .then((data) => {
      const subscription = data.subscription;
      cachedSubscriptions.set(userId, {
        subscription,
        cachedAt: Date.now(),
      });
      return subscription;
    })
    .finally(() => {
      inFlightSubscriptions.delete(userId);
    });

  inFlightSubscriptions.set(userId, request);
  return request;
}

type BillingAccessState = {
  loading: boolean;
  subscription: SubscriptionApi | null;
  hasPaidAccess: boolean;
  entitlements: BillingEntitlements;
  hasEntitlement: (key: BillingEntitlement) => boolean;
  error: string | null;
  reload: () => void;
};

export function useBillingAccess(): BillingAccessState {
  const { status, user } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    if (user?.userId) {
      cachedSubscriptions.delete(user.userId);
      inFlightSubscriptions.delete(user.userId);
    }
    setReloadTick((c) => c + 1);
  }, [user?.userId]);
  const entitlements = subscription?.entitlements ?? DEFAULT_BILLING_ENTITLEMENTS;
  const hasEntitlement = useCallback(
    (key: BillingEntitlement) => hasBillingEntitlement(subscription?.entitlements, key),
    [subscription?.entitlements]
  );

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
    setSubscription(null);
    const run = async () => {
      try {
        const data = await readSubscriptionWithCache(user.userId, reloadTick > 0);
        if (!active) return;
        setSubscription(data);
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
    entitlements,
    hasEntitlement,
    error,
    reload,
  };
}
