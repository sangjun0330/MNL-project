"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatKrw, getPlanDefinition } from "@/lib/billing/plans";
import { fetchSubscriptionSnapshot, formatDateLabel, requestPlanCheckout, type SubscriptionResponse } from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";

export function SettingsBillingUpgradePage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const flatSurface = "rounded-[24px] border border-ios-sep bg-white";
  const proPlan = getPlanDefinition("pro");
  const flatButtonBase =
    "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const flatButtonPrimary = `${flatButtonBase} border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]`;
  const flatButtonSecondary = `${flatButtonBase} border-ios-sep bg-[#F2F2F7] text-ios-text`;

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
      setError(String(e?.message ?? t("구독 정보를 불러오지 못했습니다.")));
    } finally {
      setLoading(false);
    }
  }, [t, user?.userId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const startCheckout = useCallback(async () => {
    if (!user?.userId || paying) return;
    setPaying(true);
    setError(null);
    try {
      await requestPlanCheckout("pro");
    } catch (e: any) {
      const msg = String(e?.message ?? t("결제창을 열지 못했습니다."));
      if (!msg.includes("USER_CANCEL")) setError(msg);
    } finally {
      setPaying(false);
    }
  }, [paying, t, user?.userId]);

  const activeTier = subData?.subscription.tier ?? "free";
  const activePeriodEnd = subData?.subscription.currentPeriodEnd ?? null;
  const isProActive = activeTier === "pro" && Boolean(subData?.subscription.hasPaidAccess);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings/billing"
          className="wnl-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div>
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">{t("플랜 업그레이드")}</div>
          <div className="text-[12px] text-ios-sub">{t("결제창 승인 완료 즉시 플랜이 적용됩니다.")}</div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className={`${flatSurface} p-5`}>
          <div className="text-[16px] font-bold text-ios-text">{t("로그인이 필요해요")}</div>
          <p className="mt-2 text-[13px] text-ios-sub">{t("플랜 업그레이드는 로그인 후 가능합니다.")}</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className={`${flatButtonPrimary} mt-4 text-[13px]`}
          >
            {t("Google로 로그인")}
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          <section className={`${flatSurface} p-6`}>
            <div className="text-[13px] font-semibold text-ios-sub">{t("현재 플랜")}</div>
            <div className="mt-2 text-[30px] font-extrabold tracking-[-0.03em] text-ios-text">
              {getPlanDefinition(activeTier).title}
            </div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("만료일")}: {formatDateLabel(activePeriodEnd)}</div>
          </section>

          <section className={`${flatSurface} mt-4 p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] text-ios-sub">{t("업그레이드 플랜")}</div>
                <div className="mt-1 text-[34px] font-extrabold tracking-[-0.03em] text-ios-text">{proPlan.title}</div>
                <div className="mt-1 max-w-[480px] text-[14px] leading-relaxed text-ios-sub">{proPlan.description}</div>
              </div>
              <div className="text-right">
                <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">
                  {formatKrw(proPlan.priceKrw).replace(" KRW", "")}
                </div>
                <div className="text-[12px] text-ios-muted">/ {t("30일")}</div>
              </div>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-ios-sub">
              {proPlan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={paying || loading || isProActive}
              className={`${isProActive ? flatButtonSecondary : flatButtonPrimary} mt-4 w-full`}
            >
              {isProActive
                ? t("현재 플랜 사용 중")
                : paying
                  ? t("결제창 준비 중...")
                  : `${proPlan.title} ${t("결제하기")}`}
            </button>
            <p className="mt-2 text-[11.5px] text-ios-muted">
              {t("토스페이먼츠 결제창으로 진행되며, 서버 승인 완료 후 플랜이 적용됩니다.")}
            </p>
            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SettingsBillingUpgradePage;
