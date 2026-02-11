"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { asCheckoutPlanTier, formatKrw, getPlanDefinition, listPlans } from "@/lib/billing/plans";
import { fetchSubscriptionSnapshot, formatDateLabel, requestPlanCheckout, type SubscriptionResponse } from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";

export function SettingsBillingUpgradePage() {
  const { status, user } = useAuthState();
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
      const data = await fetchSubscriptionSnapshot();
      setSubData(data);
    } catch (e: any) {
      setError(String(e?.message ?? "구독 정보를 불러오지 못했습니다."));
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
      await requestPlanCheckout(selectedPlan);
    } catch (e: any) {
      const msg = String(e?.message ?? "결제창을 열지 못했습니다.");
      if (!msg.includes("USER_CANCEL")) setError(msg);
    } finally {
      setPaying(false);
    }
  }, [paying, selectedPlan, user?.userId]);

  const activeTier = subData?.subscription.tier ?? "free";
  const activePeriodEnd = subData?.subscription.currentPeriodEnd ?? null;
  const isAlreadySelectedPlanActive = activeTier === selectedPlan && Boolean(subData?.subscription.hasPaidAccess);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings/billing"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div>
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">플랜 업그레이드</div>
          <div className="text-[12px] text-ios-sub">결제창 승인 완료 즉시 플랜이 적용됩니다.</div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요해요</div>
          <p className="mt-2 text-[13px] text-ios-sub">플랜 업그레이드는 로그인 후 가능합니다.</p>
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
          <section className="rounded-[28px] border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[13px] font-semibold text-ios-sub">현재 플랜</div>
            <div className="mt-2 text-[30px] font-extrabold tracking-[-0.03em] text-ios-text">
              {getPlanDefinition(activeTier).title}
            </div>
            <div className="mt-1 text-[13px] text-ios-sub">만료일: {formatDateLabel(activePeriodEnd)}</div>
          </section>

          <section className="mt-4 grid gap-3">
            {planRows.map((plan) => {
              const paidTier = asCheckoutPlanTier(plan.tier);
              const selected = paidTier ? selectedPlan === paidTier : activeTier === "free";
              const active = activeTier === plan.tier;
              const isPaidPlan = Boolean(paidTier);

              return (
                <button
                  key={plan.tier}
                  type="button"
                  disabled={!isPaidPlan}
                  onClick={() => {
                    if (paidTier) setSelectedPlan(paidTier);
                  }}
                  className={`rounded-[26px] border bg-white p-4 text-left shadow-apple-sm transition ${
                    selected ? "border-black" : "border-ios-sep"
                  } ${!isPaidPlan ? "opacity-90" : "hover:translate-y-[-1px]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[34px] font-extrabold tracking-[-0.03em] text-ios-text">{plan.title}</div>
                      <div className="mt-1 max-w-[460px] text-[14px] leading-relaxed text-ios-sub">{plan.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[22px] font-extrabold tracking-[-0.02em] text-ios-text">
                        {plan.priceKrw > 0 ? formatKrw(plan.priceKrw).replace(" KRW", "") : "무료"}
                      </div>
                      <div className="mt-1 text-[12px] text-ios-muted">/ 30일</div>
                    </div>
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-ios-sub">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {active ? (
                    <div className="mt-3 inline-flex rounded-full border border-[#007AFF40] bg-[#007AFF10] px-2.5 py-1 text-[11px] font-semibold text-[#007AFF]">
                      현재 사용 중
                    </div>
                  ) : null}
                </button>
              );
            })}
          </section>

          <section className="mt-4 rounded-[28px] border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[13px] text-ios-sub">선택 플랜</div>
            <div className="mt-1 text-[20px] font-bold text-ios-text">{getPlanDefinition(selectedPlan).title}</div>
            <div className="mt-2 text-[13px] text-ios-sub">
              토스페이먼츠 결제창으로 진행되며, 서버 승인 완료 후 플랜이 적용됩니다.
            </div>
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={paying || loading || isAlreadySelectedPlanActive}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-black/35"
            >
              {isAlreadySelectedPlanActive ? "현재 플랜 사용 중" : paying ? "결제창 준비 중..." : `${getPlanDefinition(selectedPlan).title} 결제하기`}
            </button>
            <p className="mt-2 text-[11.5px] text-ios-muted">결제 후 서버 승인 완료 시 결제 이력에 즉시 반영됩니다.</p>
            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SettingsBillingUpgradePage;
