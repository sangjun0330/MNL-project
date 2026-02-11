"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { asCheckoutPlanTier, formatKrw, getPlanDefinition, listPlans, type PlanTier } from "@/lib/billing/plans";
import { getSupabaseBrowserClient, signInWithProvider, useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";

type SubscriptionApi = {
  tier: PlanTier;
  status: "inactive" | "active" | "expired";
  startedAt: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string | null;
  customerKey: string;
};

type BillingOrderApi = {
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

type SubscriptionResponse = {
  subscription: SubscriptionApi;
  orders: BillingOrderApi[];
};

type CheckoutResponse = {
  planTier: "basic" | "pro";
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

function ensureTossScript() {
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

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function statusLabel(status: BillingOrderApi["status"]) {
  if (status === "DONE") return "결제 완료";
  if (status === "FAILED") return "결제 실패";
  if (status === "CANCELED") return "결제 취소";
  return "결제 대기";
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function SettingsBillingPage() {
  const { status, user } = useAuthState();
  const { lang } = useI18n();

  const [selectedPlan, setSelectedPlan] = useState<"basic" | "pro">("basic");
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const planRows = useMemo(() => listPlans(), []);

  const loadSubscription = useCallback(async () => {
    if (!user?.userId) {
      setSubData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/billing/subscription", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      setSubData(json.data as SubscriptionResponse);
    } catch (e: any) {
      setError(e?.message ?? "구독 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    const activeTier = subData?.subscription.tier;
    const checkoutTier = asCheckoutPlanTier(activeTier);
    if (checkoutTier) setSelectedPlan(checkoutTier);
  }, [subData?.subscription.tier]);

  const startCheckout = useCallback(async () => {
    if (!user?.userId || paying) return;
    setPaying(true);
    setError(null);

    try {
      const headers = await authHeaders();
      const checkoutRes = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ plan: selectedPlan }),
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
    } catch (e: any) {
      const msg = String(e?.message ?? "결제창을 열지 못했습니다.");
      if (!msg.includes("USER_CANCEL")) {
        setError(msg);
      }
    } finally {
      setPaying(false);
    }
  }, [paying, selectedPlan, user?.userId]);

  const activeTier = subData?.subscription.tier ?? "free";
  const periodEnd = subData?.subscription.currentPeriodEnd ?? null;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">구독</div>
      </div>

      {status !== "authenticated" ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요해요</div>
          <p className="mt-2 text-[13px] text-ios-sub">구독 결제와 플랜 적용은 로그인 후 사용할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="mt-4 rounded-full bg-black px-4 py-2 text-[13px] font-semibold text-white"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[13px] font-semibold text-ios-sub">현재 플랜</div>
            <div className="mt-2 text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">
              {getPlanDefinition(activeTier).title}
            </div>
            <div className="mt-1 text-[13px] text-ios-sub">
              상태: {subData?.subscription.status ?? "inactive"}
              {" · "}
              만료일: {formatDateLabel(periodEnd)}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {planRows.map((plan) => {
              const paidTier = asCheckoutPlanTier(plan.tier);
              const selected = paidTier ? selectedPlan === paidTier : activeTier === "free";
              const active = activeTier === plan.tier;

              return (
                <button
                  key={plan.tier}
                  type="button"
                  disabled={!paidTier}
                  onClick={() => {
                    if (paidTier) setSelectedPlan(paidTier);
                  }}
                  className={`rounded-apple border bg-white p-4 text-left shadow-apple-sm transition ${
                    selected ? "border-black" : "border-ios-sep"
                  } ${!paidTier ? "opacity-85" : "hover:translate-y-[-1px]"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[17px] font-bold text-ios-text">{plan.title}</div>
                      <div className="mt-1 text-[13px] text-ios-sub">{plan.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[16px] font-extrabold text-ios-text">
                        {plan.priceKrw > 0 ? formatKrw(plan.priceKrw) : "무료"}
                      </div>
                      <div className="mt-1 text-[12px] text-ios-muted">/ 30일</div>
                    </div>
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-ios-sub">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {active ? (
                    <div className="mt-3 inline-flex rounded-full border border-[#007AFF44] bg-[#007AFF10] px-2.5 py-1 text-[11px] font-semibold text-[#007AFF]">
                      현재 사용 중
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[13px] text-ios-sub">선택 플랜</div>
            <div className="mt-1 text-[17px] font-bold text-ios-text">{getPlanDefinition(selectedPlan).title}</div>
            <div className="mt-2 text-[13px] text-ios-sub">
              {lang === "en"
                ? "Payment is processed via TossPayments payment window and applied after server-side confirmation."
                : "토스페이먼츠 결제창으로 진행되며, 서버 승인 완료 후 플랜이 적용됩니다."}
            </div>

            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={paying || loading}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/40"
            >
              {paying ? "결제창 준비 중..." : `${getPlanDefinition(selectedPlan).title} 결제하기`}
            </button>

            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
          </div>

          <div className="mt-4 rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[14px] font-semibold text-ios-text">최근 결제 이력</div>
            {loading ? (
              <div className="mt-3 text-[12.5px] text-ios-muted">불러오는 중...</div>
            ) : (
              <div className="mt-3 space-y-2">
                {(subData?.orders ?? []).length === 0 ? (
                  <div className="text-[12.5px] text-ios-muted">결제 이력이 아직 없습니다.</div>
                ) : (
                  (subData?.orders ?? []).map((order) => (
                    <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12.5px] font-semibold text-ios-text">{order.orderName}</div>
                        <div className="text-[11.5px] text-ios-sub">{statusLabel(order.status)}</div>
                      </div>
                      <div className="mt-1 text-[11.5px] text-ios-muted">
                        {formatDateLabel(order.createdAt)} · {formatKrw(order.amount)} · {order.orderId}
                      </div>
                      {order.failMessage ? (
                        <div className="mt-1 text-[11.5px] text-red-600">{order.failMessage}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default SettingsBillingPage;
