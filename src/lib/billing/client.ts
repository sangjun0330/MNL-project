"use client";

import type { PlanTier } from "@/lib/billing/plans";
import { getSupabaseBrowserClient } from "@/lib/auth";

export type SubscriptionApi = {
  tier: PlanTier;
  status: "inactive" | "active" | "expired";
  startedAt: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string | null;
  customerKey: string;
  cancelAtPeriodEnd: boolean;
  cancelScheduledAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  hasPaidAccess: boolean;
};

export type BillingOrderApi = {
  orderId: string;
  planTier: PlanTier;
  amount: number;
  currency: string;
  status: "READY" | "DONE" | "FAILED" | "CANCELED";
  orderName: string;
  paymentKey: string | null;
  failCode: string | null;
  failMessage: string | null;
  approvedAt: string | null;
  createdAt: string | null;
};

export type SubscriptionResponse = {
  subscription: SubscriptionApi;
  orders: BillingOrderApi[];
};

export type CheckoutResponse = {
  planTier: "pro";
  orderId: string;
  orderName: string;
  amount: number;
  currency: "KRW";
  customerKey: string;
  customerEmail: string | null;
  customerName: string | null;
  clientKey: string;
  successUrl: string;
  failUrl: string;
};

type TossPaymentsFactory = (clientKey: string) => {
  payment: (options: { customerKey: string }) => {
    requestPayment: (params: {
      method: "CARD";
      amount: {
        currency: string;
        value: number;
      };
      orderId: string;
      orderName: string;
      successUrl: string;
      failUrl: string;
      customerEmail?: string;
      customerName?: string;
      card?: {
        useEscrow?: boolean;
        useCardPoint?: boolean;
        useAppCardOnly?: boolean;
      };
    }) => Promise<void>;
  };
};

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

let tossScriptPromise: Promise<void> | null = null;

export function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function statusLabel(status: BillingOrderApi["status"]) {
  if (status === "DONE") return "결제 완료";
  if (status === "FAILED") return "결제 실패";
  if (status === "CANCELED") return "결제 취소";
  return "결제 대기";
}

export function subscriptionStatusLabel(status: SubscriptionApi["status"]) {
  if (status === "active") return "active";
  if (status === "expired") return "expired";
  return "inactive";
}

export async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSubscriptionSnapshot(): Promise<SubscriptionResponse> {
  const headers = await authHeaders();
  const res = await fetch("/api/billing/subscription", {
    method: "GET",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error ?? `http_${res.status}`));
  }
  return json.data as SubscriptionResponse;
}

export async function ensureTossScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("browser_only"));
  if (window.TossPayments) return Promise.resolve();
  if (tossScriptPromise) return tossScriptPromise;

  tossScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-toss='v2-standard']");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("toss_script_load_failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.dataset.toss = "v2-standard";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("toss_script_load_failed"));
    document.head.appendChild(script);
  });

  return tossScriptPromise;
}

export async function requestPlanCheckout(plan: "pro" = "pro") {
  const headers = await authHeaders();
  const checkoutRes = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ plan }),
  });
  const checkoutJson = await checkoutRes.json().catch(() => null);
  if (!checkoutRes.ok || !checkoutJson?.ok) {
    throw new Error(String(checkoutJson?.error ?? `checkout_http_${checkoutRes.status}`));
  }

  const data = checkoutJson.data as CheckoutResponse;
  await ensureTossScript();
  if (!window.TossPayments) throw new Error("missing_toss_sdk");

  const tossPayments = window.TossPayments(data.clientKey);
  const payment = tossPayments.payment({ customerKey: data.customerKey });

  await payment.requestPayment({
    method: "CARD",
    amount: {
      currency: data.currency,
      value: data.amount,
    },
    orderId: data.orderId,
    orderName: data.orderName,
    successUrl: data.successUrl,
    failUrl: data.failUrl,
    customerEmail: data.customerEmail ?? undefined,
    customerName: data.customerName ?? undefined,
    card: {
      useEscrow: false,
      useCardPoint: false,
      useAppCardOnly: false,
    },
  });
}
