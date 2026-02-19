"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient, useAuthState } from "@/lib/auth";
import { formatKrw, getCheckoutProductDefinition, getPlanDefinition, type PlanTier } from "@/lib/billing/plans";
import { useI18n } from "@/lib/useI18n";

type ConfirmResult = {
  order: {
    orderId: string;
    planTier: PlanTier;
    orderKind: "subscription" | "credit_pack";
    creditPackUnits: number;
    amount: number;
    status: "READY" | "DONE" | "FAILED" | "CANCELED";
    approvedAt: string | null;
  } | null;
  subscription: {
    tier: PlanTier;
    status: "inactive" | "active" | "expired";
    currentPeriodEnd: string | null;
  } | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function SettingsBillingSuccessPage() {
  const { t } = useI18n();
  const params = useSearchParams();
  const { status } = useAuthState();

  const paymentKey = params.get("paymentKey") ?? "";
  const orderId = params.get("orderId") ?? "";
  const amount = params.get("amount") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const requestedRef = useRef(false);
  const flatSurface = "rounded-[24px] border border-ios-sep bg-white";
  const flatSubSurface = "rounded-[18px] border border-ios-sep bg-[#F7F7FA]";
  const flatButtonBase =
    "inline-flex h-10 items-center justify-center rounded-full border px-5 text-[13px] font-semibold transition-colors";
  const flatButtonPrimary = `${flatButtonBase} border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]`;
  const flatButtonSecondary = `${flatButtonBase} border-ios-sep bg-[#F2F2F7] text-ios-text`;

  const parsedAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? Math.round(n) : null;
  }, [amount]);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      setError(t("로그인이 필요합니다."));
      return;
    }

    if (!paymentKey || !orderId || parsedAmount == null) {
      setLoading(false);
      setError(t("결제 승인 파라미터가 올바르지 않습니다."));
      return;
    }

    if (requestedRef.current) return;
    requestedRef.current = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: parsedAmount,
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }

        setResult(json.data as ConfirmResult);
      } catch (e: any) {
        setError(String(e?.message ?? t("결제 승인에 실패했습니다.")));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status, paymentKey, orderId, parsedAmount, t]);

  const orderKind = result?.order?.orderKind ?? "subscription";
  const planTier = result?.subscription?.tier ?? result?.order?.planTier ?? "free";
  const isCreditPack = orderKind === "credit_pack";
  const creditUnits = Math.max(0, Number(result?.order?.creditPackUnits ?? 0));
  const creditProduct = getCheckoutProductDefinition("credit10");

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className={`${flatSurface} p-6`}>
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("결제 결과")}</div>

        {loading ? <div className="mt-3 text-[13px] text-ios-sub">{t("결제 승인 처리 중입니다...")}</div> : null}

        {!loading && error ? (
          <>
            <div className="mt-3 text-[14px] font-semibold text-red-600">{t("승인 실패")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub break-all">{error}</div>
            <div className="mt-3 text-[12px] text-ios-muted">orderId: {orderId}</div>
          </>
        ) : null}

        {!loading && !error && result ? (
          <>
            <div className="rnest-chip-accent mt-3 inline-flex px-3 py-1 text-[12px]">
              {t("결제 완료")}
            </div>

            <div className={`${flatSubSurface} mt-4 p-4`}>
              <div className="text-[13px] text-ios-sub">{isCreditPack ? t("구매 상품") : t("적용 플랜")}</div>
              <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">
                {isCreditPack ? creditProduct.title : getPlanDefinition(planTier).title}
              </div>
              <div className="mt-2 text-[12.5px] text-ios-sub">
                {t("결제 금액")}: {formatKrw(result.order?.amount ?? parsedAmount ?? 0)}
              </div>
              {isCreditPack ? (
                <div className="mt-1 text-[12.5px] text-ios-sub">
                  {t("충전 크레딧")}: {creditUnits > 0 ? `${creditUnits}${t("회")}` : `10${t("회")}`}
                </div>
              ) : (
                <div className="mt-1 text-[12.5px] text-ios-sub">
                  {t("만료일")}: {formatDateLabel(result.subscription?.currentPeriodEnd ?? null)}
                </div>
              )}
              <div className="mt-1 text-[11.5px] text-ios-muted break-all">orderId: {result.order?.orderId ?? orderId}</div>
            </div>
          </>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Link
            href="/settings/billing"
            className={flatButtonPrimary}
          >
            {t("구독으로 돌아가기")}
          </Link>
          <Link
            href="/insights"
            className={flatButtonSecondary}
          >
            {t("인사이트 보기")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SettingsBillingSuccessPage;
