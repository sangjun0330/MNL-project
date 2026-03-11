"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatKrw, getCheckoutProductDefinition, getPlanDefinition, type CheckoutProductId } from "@/lib/billing/plans";
import {
  fetchSubscriptionSnapshot,
  formatDateLabel,
  requestPlanCheckout,
  type SubscriptionResponse,
} from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { BillingCheckoutSheet } from "@/components/billing/BillingCheckoutSheet";
import { sanitizeInternalPath, withReturnTo } from "@/lib/navigation";
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
  if (text.includes("paid_plan_downgrade_not_allowed")) return "현재 상위 플랜 이용 중에는 낮은 플랜으로 바로 결제할 수 없습니다.";
  if (text.includes("checkout_http_5") || text.includes("network")) return "결제 서버 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.";
  return "결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export function SettingsBillingUpgradePage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payingCredit, setPayingCredit] = useState(false);
  const [checkoutProduct, setCheckoutProduct] = useState<CheckoutProductId | null>(null);
  const flatSurface = "rounded-[24px] border border-ios-sep bg-white";
  const plusPlan = getPlanDefinition("plus");
  const proPlan = getPlanDefinition("pro");
  const creditPack10 = getCheckoutProductDefinition("credit10");
  const creditPack30 = getCheckoutProductDefinition("credit30");
  const creditPacks = [creditPack10, creditPack30];
  const flatButtonBase =
    "inline-flex h-11 items-center justify-center rounded-full border px-5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const flatButtonPrimary = `${flatButtonBase} border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]`;
  const flatButtonSecondary = `${flatButtonBase} border-ios-sep bg-[#F2F2F7] text-ios-text`;
  const returnTo = sanitizeInternalPath(searchParams.get("returnTo"), "");

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
    const targetDefinition = getCheckoutProductDefinition(target);
    setCheckoutProduct(null);
    setError(null);
    if (targetDefinition.kind === "credit_pack") setPayingCredit(true);
    else setPaying(true);
    try {
      await requestPlanCheckout(target, { returnTo });
    } catch (e: any) {
      const msg = String(e?.message ?? t("결제창을 열지 못했습니다."));
      if (!msg.includes("USER_CANCEL")) setError(mapCheckoutError(msg));
    } finally {
      if (targetDefinition.kind === "credit_pack") setPayingCredit(false);
      else setPaying(false);
    }
  }, [checkoutProduct, returnTo, t, user?.userId]);

  const activeTier = subData?.subscription.tier ?? "free";
  const activePeriodEnd = subData?.subscription.currentPeriodEnd ?? null;
  const hasPaidAccess = Boolean(subData?.subscription.hasPaidAccess);
  const currentPlan = getPlanDefinition(activeTier);
  const isPlusActive = activeTier === "plus" && hasPaidAccess;
  const isProActive = activeTier === "pro" && Boolean(subData?.subscription.hasPaidAccess);
  const quota = subData?.subscription.medSafetyQuota;
  const checkoutDefinition = checkoutProduct ? getCheckoutProductDefinition(checkoutProduct) : null;
  const totalCredits = Math.max(0, Number(quota?.totalRemaining ?? 0));
  const plusSummaryItems = [
    t("AI 맞춤회복"),
    t("오늘의 오더"),
    t("검색 10회"),
    t("기록 5개"),
  ];
  const proSummaryItems = [
    t("Plus 전체"),
    t("검색 100회"),
    t("기록 10개"),
  ];
  const returnLabel = returnTo.startsWith("/insights/recovery")
    ? t("회복 플래너로 돌아가기")
    : returnTo === "/insights"
      ? t("인사이트로 돌아가기")
      : t("이전 화면으로 돌아가기");

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={returnTo ? returnTo : "/settings/billing"}
          className="rnest-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div>
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">{t("플랜 업그레이드")}</div>
          <div className="text-[12px] text-ios-sub">{t("결제 후 바로 플랜이 적용됩니다.")}</div>
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
          {returnTo ? (
            <section className={`${flatSurface} mb-4 p-4`}>
              <div className="text-[13px] font-semibold text-ios-sub">{t("업그레이드 후 복귀")}</div>
              <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{returnLabel}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-ios-sub">
                {t("결제 후 원래 보던 화면으로 바로 돌아갈 수 있습니다.")}
              </div>
            </section>
          ) : null}

          <section className={`${flatSurface} p-6`}>
            <div className="text-[13px] font-semibold text-ios-sub">{t("현재 플랜")}</div>
            <div className="mt-2 text-[30px] font-extrabold tracking-[-0.03em] text-ios-text">
              {currentPlan.title}
            </div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("만료일")}: {formatDateLabel(activePeriodEnd)}</div>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-[#F7F7FA] px-3 py-2 text-[12.5px] text-ios-sub">
              <div>
                {t("보유 검색 크레딧")}: {totalCredits}
                {t("회")}
              </div>
              <div className="mt-1">
                {t("현재 플랜 포함 크레딧")}: {currentPlan.medSafetyIncludedCredits > 0 ? `${currentPlan.medSafetyIncludedCredits}${t("회")}` : t("해당 없음")}
              </div>
            </div>
          </section>

          {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}

          <section id="search-credits" className={`${flatSurface} mt-4 p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] text-ios-sub">{t("업그레이드 플랜")}</div>
                <div className="mt-1 text-[34px] font-extrabold tracking-[-0.03em] text-ios-text">{plusPlan.title}</div>
                <div className="mt-1 max-w-[480px] text-[14px] leading-relaxed text-ios-sub">{t(plusPlan.description)}</div>
              </div>
              <div className="text-right">
                <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">
                  {formatKrw(plusPlan.priceKrw).replace(" KRW", "")}
                </div>
                <div className="text-[12px] text-ios-muted">/ {t("30일")}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {plusSummaryItems.map((item) => (
                <span key={item} className="inline-flex items-center rounded-full border border-ios-sep bg-[#F7F7FA] px-3 py-1.5 text-[12px] font-semibold text-ios-sub">
                  {item}
                </span>
              ))}
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-ios-sub">
              {plusPlan.features.map((feature) => (
                <li key={feature}>{t(feature)}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-[#F7F7FA] px-3 py-2 text-[12.5px] text-ios-sub">
              <div className="text-[12px] font-semibold text-ios-text">{t("이용 안내")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>{t("결제 즉시 30일 플랜이 활성화되고 검색 크레딧 10회가 적립됩니다.")}</li>
                <li>{t("AI 검색은 질문 1회당 1크레딧이 차감되며, 후속 질문도 동일하게 계산됩니다.")}</li>
                <li>{t("최근 AI 검색 기록은 5개까지 저장되며, 검색 크레딧은 남은 수량 기준으로 사용됩니다.")}</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => openCheckoutSheet("plus")}
              disabled={paying || loading || isProActive}
              className={`${isProActive ? flatButtonSecondary : flatButtonPrimary} mt-4 w-full`}
            >
              {isPlusActive
                ? `${plusPlan.title} ${t("연장하기")}`
                : isProActive
                  ? t("현재 상위 플랜 사용 중")
                  : paying
                    ? t("결제창 준비 중...")
                    : `${plusPlan.title} ${t("결제하기")}`}
            </button>
            <p className="mt-2 text-[11.5px] text-ios-muted">
              {t("결제 승인 후 30일 플랜과 검색 크레딧이 즉시 반영됩니다.")}
            </p>
          </section>

          <section className={`${flatSurface} mt-4 p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] text-ios-sub">{t("상위 플랜")}</div>
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
            <div className="mt-4 flex flex-wrap gap-2">
              {proSummaryItems.map((item) => (
                <span key={item} className="inline-flex items-center rounded-full border border-ios-sep bg-[#F7F7FA] px-3 py-1.5 text-[12px] font-semibold text-ios-sub">
                  {item}
                </span>
              ))}
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-ios-sub">
              {proPlan.features.map((feature) => (
                <li key={feature}>{t(feature)}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-[#F7F7FA] px-3 py-2 text-[12.5px] text-ios-sub">
              <div className="text-[12px] font-semibold text-ios-text">{t("이용 안내")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>{t("결제 즉시 30일 플랜이 활성화되고 검색 크레딧 100회가 적립됩니다.")}</li>
                <li>{t("Plus 기능이 모두 포함되며, AI 검색을 자주 사용하는 경우에 적합합니다.")}</li>
                <li>{t("AI 검색은 질문 1회당 1크레딧이 차감되며, 최근 AI 검색 기록은 10개까지 저장됩니다.")}</li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => openCheckoutSheet("pro")}
              disabled={paying || loading}
              className={`${flatButtonPrimary} mt-4 w-full`}
            >
              {isProActive
                ? `${proPlan.title} ${t("연장하기")}`
                : isPlusActive
                  ? `${proPlan.title} ${t("업그레이드하기")}`
                : paying
                  ? t("결제창 준비 중...")
                  : `${proPlan.title} ${t("결제하기")}`}
            </button>
            <p className="mt-2 text-[11.5px] text-ios-muted">
              {t("결제 승인 후 30일 플랜과 검색 크레딧이 즉시 반영됩니다.")}
            </p>
          </section>

          <section className={`${flatSurface} mt-4 p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] text-ios-sub">{t("추가 구매")}</div>
                <div className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">{t("AI 검색 크레딧")}</div>
                <div className="mt-1 max-w-[480px] text-[14px] leading-relaxed text-ios-sub">{t("필요한 만큼 충전해 두고 Free, Plus, Pro 어디서든 바로 사용할 수 있습니다.")}</div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-[#F7F7FA] px-3 py-2 text-[12.5px] text-ios-sub">
              <div>
                {t("현재 보유 검색 크레딧")}: {totalCredits}
                {t("회")}
              </div>
              <div className="mt-1">{t("추가 구매 크레딧은 기존 잔액에 바로 합산되며, 질문 1회당 1크레딧이 차감됩니다.")}</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {creditPacks.map((creditPack) => (
                <div key={creditPack.id} className="rounded-[22px] border border-ios-sep bg-[#FCFCFE] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t(creditPack.title)}</div>
                      <div className="mt-1 text-[12.5px] text-ios-sub">
                        {creditPack.id === "credit10"
                          ? t("가볍게 충전해 바로 쓰기 좋은 구성입니다.")
                          : t("자주 검색하는 경우 한 번에 넉넉하게 충전하는 구성입니다.")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">
                        {formatKrw(creditPack.priceKrw).replace(" KRW", "")}
                      </div>
                      <div className="text-[12px] text-ios-muted">
                        / {creditPack.creditUnits}
                        {t("회")}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCheckoutSheet(creditPack.id)}
                    disabled={payingCredit || loading}
                    className={`${flatButtonPrimary} mt-4 w-full`}
                  >
                    {payingCredit && checkoutProduct === creditPack.id
                      ? t("결제창 준비 중...")
                      : t("크레딧 {count}회 구매", { count: creditPack.creditUnits })}
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-ios-muted">
              {t("추가 크레딧은 AI 검색 1회당 1크레딧이 사용되며, 후속 질문도 동일하게 차감됩니다.")}
            </p>
          </section>

          {returnTo ? (
            <div className="mt-4">
              <Link href={withReturnTo("/settings/billing", returnTo)} className={flatButtonSecondary}>
                {t("플랜만 보고 돌아가기")}
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
      <BillingCheckoutSheet
        open={Boolean(checkoutProduct)}
        onClose={() => setCheckoutProduct(null)}
        onConfirm={() => void confirmCheckout()}
        loading={Boolean(
          ((checkoutProduct === "plus" || checkoutProduct === "pro") && paying) ||
            ((checkoutProduct === "credit10" || checkoutProduct === "credit30") && payingCredit)
        )}
        productTitle={checkoutDefinition?.title ?? ""}
        productSubtitle={
          checkoutDefinition?.kind === "credit_pack"
            ? t("AI 임상 검색 전용 크레딧")
            : checkoutProduct
              ? getCheckoutProductDefinition(checkoutProduct).orderName
              : ""
        }
        priceKrw={checkoutDefinition?.priceKrw ?? 0}
        periodLabel={
          checkoutDefinition?.kind === "credit_pack"
            ? t("{count}회 사용권 · 소진 전까지 유지", { count: checkoutDefinition.creditUnits })
            : t("월 플랜 · 결제 시 30일 연장")
        }
        detailText={
          checkoutDefinition?.kind === "credit_pack"
            ? t("결제 후 검색 크레딧이 즉시 충전되며, 사용 전까지 남은 수량이 유지됩니다.")
            : undefined
        }
        accountEmail={user?.email ?? null}
        confirmLabel={t("결제 계속")}
      />
    </div>
  );
}

export default SettingsBillingUpgradePage;
