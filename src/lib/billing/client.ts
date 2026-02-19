"use client";

import type { BillingOrderKind, CheckoutProductId, PlanTier } from "@/lib/billing/plans";
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
  medSafetyQuota: {
    timezone: "Asia/Seoul";
    dailyLimit: number;
    dailyUsed: number;
    dailyRemaining: number;
    extraCredits: number;
    totalRemaining: number;
    usageDate: string;
    nextResetAt: string;
    isPro: boolean;
  };
};

export type BillingOrderApi = {
  orderId: string;
  planTier: PlanTier;
  orderKind: BillingOrderKind;
  creditPackUnits: number;
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
  purchaseSummary: {
    totalPaidAmount: number;
    subscriptionPaidAmount: number;
    creditPaidAmount: number;
    creditPurchasedUnits: number;
  };
};

export type CheckoutResponse = {
  productId: CheckoutProductId;
  orderKind: BillingOrderKind;
  creditPackUnits: number;
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
const TOSS_SCRIPT_SELECTOR = "script[data-toss='v2-standard']";
const TOSS_SCRIPT_SRC = "https://js.tosspayments.com/v2/standard";
const TOSS_SCRIPT_TIMEOUT_MS = 12_000;
const TOSS_SCRIPT_RETRY_COUNT = 1;

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

  const loadOnce = () =>
    new Promise<void>((resolve, reject) => {
      const settle = (ok: boolean, reason?: string) => {
        if (ok) resolve();
        else reject(new Error(reason || "toss_script_load_failed"));
      };

      let existing = document.querySelector<HTMLScriptElement>(TOSS_SCRIPT_SELECTOR);
      // 이전 배포에서 crossorigin=anonymous로 생성된 노드는 CORS 실패를 유발할 수 있어 제거한다.
      if (existing && existing.crossOrigin) {
        existing.remove();
        existing = null;
      }
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = TOSS_SCRIPT_SRC;
        script.async = true;
        script.dataset.toss = "v2-standard";
      }

      let done = false;
      const timeout = window.setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        settle(false, "toss_script_timeout");
      }, TOSS_SCRIPT_TIMEOUT_MS);

      const cleanup = () => {
        window.clearTimeout(timeout);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      };

      const onLoad = () => {
        if (done) return;
        done = true;
        cleanup();
        if (window.TossPayments) settle(true);
        else settle(false, "missing_toss_sdk");
      };

      const onError = () => {
        if (done) return;
        done = true;
        cleanup();
        settle(false, "toss_script_load_failed");
      };

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });

      if (!existing) {
        document.head.appendChild(script);
      } else if (window.TossPayments) {
        onLoad();
      }
    });

  tossScriptPromise = (async () => {
    let lastError: unknown = new Error("toss_script_load_failed");
    for (let attempt = 0; attempt <= TOSS_SCRIPT_RETRY_COUNT; attempt += 1) {
      try {
        await loadOnce();
        if (!window.TossPayments) throw new Error("missing_toss_sdk");
        return;
      } catch (error) {
        lastError = error;
        const current = document.querySelector<HTMLScriptElement>(TOSS_SCRIPT_SELECTOR);
        // 실패한 script 노드는 제거해서 다음 시도에서 깨끗하게 다시 로드한다.
        if (current) current.remove();
        if (attempt < TOSS_SCRIPT_RETRY_COUNT) {
          await new Promise((r) => window.setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
      }
    }
    throw lastError;
  })()
    .catch((error) => {
      tossScriptPromise = null;
      throw error;
    })
    .finally(() => {
      if (!window.TossPayments) tossScriptPromise = null;
    });

  return tossScriptPromise;
}

export async function requestPlanCheckout(product: CheckoutProductId = "pro") {
  const headers = await authHeaders();
  const checkoutRes = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ product }),
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
