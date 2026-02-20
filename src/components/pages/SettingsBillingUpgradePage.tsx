"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatKrw, getCheckoutProductDefinition, getPlanDefinition, type CheckoutProductId } from "@/lib/billing/plans";
import {
  fetchSubscriptionSnapshot,
  formatDateLabel,
  requestPlanCheckout,
  type SubscriptionResponse,
} from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { BillingCheckoutSheet } from "@/components/billing/BillingCheckoutSheet";
import { useI18n } from "@/lib/useI18n";

function mapCheckoutError(raw: unknown) {
  const text = String(raw ?? "").toLowerCase();
  if (!text) return "결제창을 열지 못했습니다.";
  if (text.includes("user_cancel")) return "사용자가 결제를 취소했습니다.";
  if (text.includes("toss_script_load_failed") || text.includes("toss_script_timeout") || text.includes("missing_toss_sdk"))
    return "결제 모듈 로드에 실패했습니다. 네트워크 확인 후 다시 시도해 주세요.";
  if (text.includes("missing_toss_client_key")) return "결제 환경변수(NEXT_PUBLIC_TOSS_CLIENT_KEY)가 설정되지 않았습니다.";
  if (text.includes("missing_toss_secret_key")) return "결제 환경변수(TOSS_SECRET_KEY)가 설정되지 않았습니다.";
  if (text.includes("toss_key_mode_mismatch")) return "토스 클라이언트키/시크릿키 모드(test/live)가 서로 다릅니다.";
  if (text.includes("invalid_origin")) return "결제 리다이렉트 URL(origin) 설정이 올바르지 않습니다.";
  if (text.includes("checkout_http_401") || text.includes("login_required")) return "로그인 세션이 만료되었습니다. 다시 로그인 후 시도해 주세요.";
  if (text.includes("billing_schema_outdated_credit_pack_columns"))
    return "서버 DB 스키마가 아직 최신이 아닙니다. 마이그레이션 적용 후 다시 시도해 주세요.";
  if (text.includes("checkout_http_5") || text.includes("network")) return "결제 서버 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.";
  return "결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export function SettingsBillingUpgradePage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payingCredit, setPayingCredit] = useState(false);
  const [checkoutProduct, setCheckoutProduct] = useState<CheckoutProductId | null>(null);
  const flatSurface = "rounded-[24px] border border-ios-sep bg-white";
  const proPlan = getPlanDefinition("pro");
  const creditPack = getCheckoutProductDefinition("credit10");
  const flatButtonBase =
    "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const flatButtonPrimary = `${flatButtonBase} border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]`;
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

  const openCheckoutSheet = useCallback(
    (product: CheckoutProductId) => {
      if (!user?.userId) return;
      setError(null);
      setCheckoutProduct(product);
    },
    [user?.userId]
  );

  const confirmCheckout = useCallback(async () => {
    if (!user?.userId || !checkoutProduct) return;
    const target = checkoutProduct;
    setCheckoutProduct(null);
    setError(null);
    if (target === "pro") setPaying(true);
    if (target === "credit10") setPayingCredit(true);
    try {
      await requestPlanCheckout(target);
    } catch (e: any) {
      const msg = String(e?.message ?? t("결제창을 열지 못했습니다."));
      if (!msg.includes("USER_CANCEL")) setError(mapCheckoutError(msg));
    } finally {
      if (target === "pro") setPaying(false);
      if (target === "credit10") setPayingCredit(false);
    }
  }, [checkoutProduct, t, user?.userId]);

  const activeTier = subData?.subscription.tier ?? "free";
  const activePeriodEnd = subData?.subscription.currentPeriodEnd ?? null;
  const isProActive = activeTier === "pro" && Boolean(subData?.subscription.hasPaidAccess);
  const quota = subData?.subscription.medSafetyQuota;
  const checkoutDefinition = checkoutProduct ? getCheckoutProductDefinition(checkoutProduct) : null;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings/billing"
          className="rnest-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
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
                <div className="mt-1 max-w-[480px] text-[14px] leading-relaxed text-ios-sub">{t(proPlan.description)}</div>
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
                <li key={feature}>{t(feature)}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-[#F7F7FA] px-3 py-2 text-[12.5px] text-ios-sub">
              <div className="text-[12px] font-semibold text-ios-text">{t("Pro 크레딧 정책")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>{t("기본 크레딧은 Pro 사용자에게 매일 10회가 한국시간 자정에 초기화됩니다.")}</li>
                <li>{t("추가 크레딧은 구매 후 무료/Pro 공통으로 사용되며 날짜가 바뀌어도 유지됩니다.")}</li>
                <li>{t("AI 검색 실행 시 기본 크레딧을 먼저 차감하고, 부족하면 추가 크레딧에서 차감합니다.")}</li>
                <li>{t("AI 검색 최근 기록은 계정별로 최대 10건까지 저장됩니다.")}</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => openCheckoutSheet("pro")}
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

          <section className={`${flatSurface} mt-4 p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] text-ios-sub">{t("추가 구매")}</div>
                <div className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">{t(creditPack.title)}</div>
                <div className="mt-1 max-w-[480px] text-[14px] leading-relaxed text-ios-sub">{t("무료/Pro 모두 구매 후 즉시 사용 가능합니다.")}</div>
              </div>
              <div className="text-right">
                <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">
                  {formatKrw(creditPack.priceKrw).replace(" KRW", "")}
                </div>
                <div className="text-[12px] text-ios-muted">/ 10{t("회")}</div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-[#F7F7FA] px-3 py-2 text-[12.5px] text-ios-sub">
              <div>
                {t("기본 크레딧 (Pro 전용 · 매일 초기화)")}:{" "}
                {quota?.isPro ? `${quota.dailyRemaining}/${quota.dailyLimit}${t("회")}` : t("해당 없음")}
              </div>
              <div className="mt-1">
                {t("추가 크레딧 (구매분 · 미초기화)")}: {quota?.extraCredits ?? 0}
                {t("회")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openCheckoutSheet("credit10")}
              disabled={payingCredit || loading}
              className={`${flatButtonPrimary} mt-4 w-full`}
            >
              {payingCredit ? t("결제창 준비 중...") : t("크레딧 10회 구매")}
            </button>
            <p className="mt-2 text-[11.5px] text-ios-muted">
              {t("구매된 추가 크레딧은 AI 약물·도구 검색기 실행 시 1회당 1크레딧 사용되며, 날짜가 바뀌어도 사라지지 않습니다.")}
            </p>
          </section>
        </>
      ) : null}
      <BillingCheckoutSheet
        open={Boolean(checkoutProduct)}
        onClose={() => setCheckoutProduct(null)}
        onConfirm={() => void confirmCheckout()}
        loading={Boolean((checkoutProduct === "pro" && paying) || (checkoutProduct === "credit10" && payingCredit))}
        productTitle={checkoutDefinition?.title ?? ""}
        productSubtitle={checkoutProduct === "pro" ? t("RNest Pro Monthly") : t("AI 약물·도구 검색기 전용 크레딧")}
        priceKrw={checkoutDefinition?.priceKrw ?? 0}
        periodLabel={checkoutProduct === "pro" ? t("월 구독 · 30일 단위 자동갱신") : t("10회 사용권 · 소진 전까지 유지")}
        accountEmail={user?.email ?? null}
        confirmLabel={t("결제 계속")}
      />
    </div>
  );
}

export default SettingsBillingUpgradePage;
