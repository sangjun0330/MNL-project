"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCheckoutProductDefinition, getPlanDefinition, type CheckoutProductId } from "@/lib/billing/plans";
import {
  fetchSubscriptionSnapshot,
  formatDateLabel,
  requestPlanCheckout,
  subscriptionStatusLabel,
  type SubscriptionResponse,
  authHeaders,
} from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { BillingCheckoutSheet } from "@/components/billing/BillingCheckoutSheet";
import { sanitizeInternalPath, withReturnTo } from "@/lib/navigation";
import { useI18n } from "@/lib/useI18n";

type CancelMode = "period_end" | "resume" | "now_refund";

function parseBillingActionError(input: string | null, t: (key: string) => string) {
  const text = String(input ?? "");
  if (!text) return t("요청 처리 중 오류가 발생했습니다.");
  if (text.includes("login_required")) return t("로그인이 필요합니다.");
  if (text.includes("refundable_order_not_found")) return t("환불 가능한 결제 건을 찾지 못했습니다.");
  if (text.includes("order_not_refundable")) return t("현재 결제 건은 환불 요청을 접수할 수 없습니다.");
  if (text.includes("invalid_refund_request_state:")) return t("이미 처리 중이거나 철회할 수 없는 상태입니다.");
  if (text.includes("refund_request_forbidden")) return t("본인 요청만 처리할 수 있습니다.");
  if (text.includes("refund_request_not_found")) return t("환불 요청을 찾지 못했습니다.");
  return text;
}

export function SettingsBillingPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<CancelMode | null>(null);
  const [creditPaying, setCreditPaying] = useState(false);
  const [creditCheckoutProduct, setCreditCheckoutProduct] = useState<CheckoutProductId | null>(null);
  const flatSurface = "rounded-[24px] border border-ios-sep bg-white";
  const flatButtonBase =
    "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const flatButtonSecondary = `${flatButtonBase} border-ios-sep bg-[#F2F2F7] text-ios-text`;
  const flatButtonPrimary = `${flatButtonBase} border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]`;
  const creditPack10 = getCheckoutProductDefinition("credit10");
  const creditPack30 = getCheckoutProductDefinition("credit30");
  const creditPacks = [creditPack10, creditPack30];
  const returnTo = sanitizeInternalPath(searchParams.get("returnTo"), "");

  const loadSubscription = useCallback(async () => {
    if (!user?.userId) {
      setSubData(null);
      return;
    }
    setError(null);
    try {
      const data = await fetchSubscriptionSnapshot();
      setSubData(data);
    } catch (e: any) {
      setError(String(e?.message ?? t("구독 정보를 불러오지 못했습니다.")));
    }
  }, [t, user?.userId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const subscription = subData?.subscription ?? null;
  const activeTier = subscription?.tier ?? "free";
  const hasPaidAccess = Boolean(subscription?.hasPaidAccess);
  const currentPlan = getPlanDefinition(activeTier);
  const quota = subscription?.medSafetyQuota;
  const totalCredits = Math.max(0, Number(quota?.totalRemaining ?? 0));
  const submitCancel = useCallback(
    async (mode: CancelMode) => {
      if (!user?.userId || actionLoading) return;

      let reason = t("사용자 요청");
      if (mode === "period_end") {
        const confirmed = window.confirm(t("현재 기간이 끝나면 Free 플랜으로 전환할까요?"));
        if (!confirmed) return;
      }
      if (mode === "resume") {
        const confirmed = window.confirm(t("예약된 해지를 취소하고 현재 플랜을 유지할까요?"));
        if (!confirmed) return;
      }
      if (mode === "now_refund") {
        const confirmed = window.confirm(
          t("환불 요청을 접수할까요?\n자동 환불은 진행되지 않으며, 관리자가 사유를 검토한 뒤 수동 처리합니다.")
        );
        if (!confirmed) return;
        const entered = window.prompt(t("환불 요청 사유를 입력해 주세요. (관리자 검토용)"), t("사용자 요청"));
        if (entered === null) return;
        reason = entered.trim() || t("사용자 요청");
      }

      setActionLoading(mode);
      setActionError(null);
      setActionNotice(null);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/billing/cancel", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify({
            mode,
            reason,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        const message = String(json?.data?.message ?? "");
        if (message) setActionNotice(message);
        await loadSubscription();
      } catch (e: any) {
        setActionError(parseBillingActionError(String(e?.message ?? t("구독 처리에 실패했습니다.")), t));
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, loadSubscription, t, user?.userId]
  );

  const startCreditCheckout = useCallback((product: CheckoutProductId) => {
    if (!user?.userId || creditPaying) return;
    setActionError(null);
    setCreditCheckoutProduct(product);
  }, [creditPaying, user?.userId]);

  const confirmCreditCheckout = useCallback(async () => {
    if (!user?.userId || creditPaying || !creditCheckoutProduct) return;
    const targetProduct = creditCheckoutProduct;
    setCreditPaying(true);
    setActionError(null);
    setCreditCheckoutProduct(null);
    try {
      await requestPlanCheckout(targetProduct, { returnTo });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (!msg.includes("USER_CANCEL")) {
        if (msg.toLowerCase().includes("billing_schema_outdated_credit_pack_columns")) {
          setActionError(t("서버 DB 스키마가 아직 최신이 아닙니다. 마이그레이션 적용 후 다시 시도해 주세요."));
        } else {
          setActionError(t("결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      }
    } finally {
      setCreditPaying(false);
    }
  }, [creditCheckoutProduct, creditPaying, returnTo, t, user?.userId]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings"
          className="rnest-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">{t("구독")}</div>
      </div>

      {status !== "authenticated" ? (
        <div className={`${flatSurface} p-5`}>
          <div className="text-[16px] font-bold text-ios-text">{t("로그인이 필요해요")}</div>
          <p className="mt-2 text-[13px] text-ios-sub">{t("구독 결제와 플랜 적용은 로그인 후 사용할 수 있습니다.")}</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className={`${flatButtonPrimary} mt-4`}
          >
            {t("Google로 로그인")}
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          <section className={`${flatSurface} p-6`}>
            <div className="text-[13px] font-semibold text-ios-sub">{t("현재 플랜")}</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-[42px] font-extrabold tracking-[-0.03em] text-ios-text">
                {currentPlan.title}
              </div>
              {hasPaidAccess ? (
                <div className="rnest-chip-accent px-3 py-1 text-[12px]">
                  {t("유료 이용 중")}
                </div>
              ) : (
                <div className="rnest-chip-muted px-3 py-1 text-[12px]">
                  {t("무료 플랜")}
                </div>
              )}
            </div>
            <div className="mt-2 text-[13px] text-ios-sub">
              {t("상태")}: {subscriptionStatusLabel(subscription?.status ?? "inactive")}
              {" · "}
              {t("만료일")}: {formatDateLabel(subscription?.currentPeriodEnd ?? null)}
            </div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              <div className="rounded-xl border border-ios-sep bg-[#F7F7FA] px-3 py-2">
                <div className="text-[11px] font-semibold text-ios-sub">{t("현재 플랜 포함 크레딧")}</div>
                <div className="mt-0.5 text-[18px] font-bold tracking-[-0.01em] text-ios-text">
                  {currentPlan.medSafetyIncludedCredits > 0 ? `${currentPlan.medSafetyIncludedCredits}${t("회")}` : t("해당 없음")}
                </div>
              </div>
              <div className="rounded-xl border border-ios-sep bg-[#F7F7FA] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-ios-sub">{t("현재 보유 검색 크레딧")}</div>
                  <button
                    type="button"
                    onClick={() => startCreditCheckout("credit10")}
                    disabled={creditPaying}
                    className="text-[11.5px] font-semibold text-[color:var(--rnest-accent)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creditPaying ? t("결제창 준비 중...") : t("추가 크레딧 구매")}
                  </button>
                </div>
                <div className="mt-0.5 text-[18px] font-bold tracking-[-0.01em] text-ios-text">
                  {totalCredits.toLocaleString("ko-KR")}
                  {t("회")}
                </div>
              </div>
            </div>

            {subscription?.cancelAtPeriodEnd ? (
              <div className="mt-3 rounded-2xl border border-[#EAB30855] bg-[#FEF9C3] px-3 py-2 text-[12.5px] text-[#7C5E10]">
                {t("기간 종료 해지 예약됨")} · {formatDateLabel(subscription.cancelScheduledAt)}
              </div>
            ) : null}

            {hasPaidAccess ? (
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() => void submitCancel(subscription?.cancelAtPeriodEnd ? "resume" : "period_end")}
                  className={flatButtonSecondary}
                >
                  {subscription?.cancelAtPeriodEnd ? t("해지 예약 취소") : t("기간 종료 시 해지 (권장)")}
                </button>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() => void submitCancel("now_refund")}
                  className={flatButtonPrimary}
                >
                  {t("환불 요청")}
                </button>
              </div>
            ) : null}

            {hasPaidAccess ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-ios-muted">
                {t("해지 예약 시 현재 이용 기간 종료일까지 유지되며, 환불은 관리자 검토 후 처리됩니다.")}
              </p>
            ) : null}

            <div className="mt-4 text-center">
              <Link
                href={withReturnTo("/settings/billing/upgrade", returnTo)}
                className="rnest-link-accent text-[13px] font-semibold"
              >
                {t("플랜 업그레이드하기")}
              </Link>
            </div>

            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
            {actionError ? <div className="mt-2 text-[12px] text-red-600">{actionError}</div> : null}
            {actionNotice ? <div className="mt-2 text-[12px] text-[#0B7A3E]">{actionNotice}</div> : null}
          </section>

          <section className={`${flatSurface} mt-4 p-6`}>
            <div className="text-[13px] font-semibold text-ios-sub">{t("추가 크레딧 구매")}</div>
            <div className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 임상 검색 크레딧")}</div>
            <div className="mt-2 text-[13px] leading-6 text-ios-sub">
              {t("필요한 만큼 충전해 두고 AI 검색에 바로 사용할 수 있습니다.")}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {creditPacks.map((creditPack) => (
                <div key={creditPack.id} className="rounded-[20px] border border-ios-sep bg-[#F7F7FA] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t(creditPack.title)}</div>
                      <div className="mt-1 text-[12px] text-ios-sub">{t("소진 전까지 유지")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ios-text">
                        {creditPack.priceKrw.toLocaleString("ko-KR")}
                        {t("원")}
                      </div>
                      <div className="text-[12px] text-ios-muted">
                        {creditPack.creditUnits}
                        {t("회")}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => startCreditCheckout(creditPack.id)}
                    disabled={creditPaying}
                    className={`${flatButtonPrimary} mt-4 w-full`}
                  >
                    {creditPaying && creditCheckoutProduct === creditPack.id
                      ? t("결제창 준비 중...")
                      : t("크레딧 {count}회 구매", { count: creditPack.creditUnits })}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
      <BillingCheckoutSheet
        open={Boolean(creditCheckoutProduct)}
        onClose={() => setCreditCheckoutProduct(null)}
        onConfirm={() => void confirmCreditCheckout()}
        loading={creditPaying}
        productTitle={t(creditCheckoutProduct ? getCheckoutProductDefinition(creditCheckoutProduct).title : "")}
        productSubtitle={t("AI 임상 검색 전용")}
        priceKrw={creditCheckoutProduct ? getCheckoutProductDefinition(creditCheckoutProduct).priceKrw : 0}
        periodLabel={
          creditCheckoutProduct
            ? t("{count}회 사용권 · 소진 전까지 유지", {
                count: getCheckoutProductDefinition(creditCheckoutProduct).creditUnits,
              })
            : ""
        }
        detailText={t("결제 후 검색 크레딧이 즉시 충전되며, 사용 전까지 남은 수량이 유지됩니다.")}
        accountEmail={user?.email ?? null}
        confirmLabel={t("결제 계속")}
      />
    </div>
  );
}

export default SettingsBillingPage;
