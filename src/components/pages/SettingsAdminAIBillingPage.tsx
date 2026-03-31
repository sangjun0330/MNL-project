"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/billing/client";
import { formatKrw } from "@/lib/billing/plans";
import { signInWithProvider, useAuthState } from "@/lib/auth";

type SummaryResponse = {
  periodDays: number;
  userCounts: { free: number; plus: number; pro: number };
  usage: {
    plusStandardSearchUses: number;
    plusPremiumSearchUses: number;
    burnRate: {
      standard: { consumed: number; granted: number; burnRatePct: number };
      premium: { consumed: number; granted: number; burnRatePct: number };
    };
  };
  purchases: {
    freeCreditPurchaseUsers: number;
    plusPremiumPurchaseUsers: number;
    plusPremiumPurchaseRatePct: number;
    plusPremiumToProConversionRatePct: number;
    proPremiumExtraPurchaseUsers: number;
    proPremiumExtraPurchaseRatePct: number;
    proStandardPurchaseUsers: number;
    proStandardPurchaseRatePct: number;
  };
  revenue: {
    revenueByPlan: { free: number; plus: number; pro: number };
    arpuByPlan: { free: number; plus: number; pro: number };
  };
  conversion: {
    planPaymentConversionRatePct: { plus: number; pro: number };
    creditPackPaymentConversionRatePct: number;
    upsellViewCount: number;
    upsellClickCount: number;
    upsellConversionRatePct: number;
  };
};

const CARD = "rounded-[24px] border border-ios-sep bg-white p-5";

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[20px] border border-ios-sep bg-[#FAFAFC] px-4 py-3">
      <div className="text-[11px] font-semibold text-ios-sub">{label}</div>
      <div className="mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-ios-text">{value}</div>
      {hint ? <div className="mt-1 text-[11.5px] text-ios-sub">{hint}</div> : null}
    </div>
  );
}

export function SettingsAdminAIBillingPage() {
  const { status } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setLoading(false);
      setSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/billing/ai-search/summary?rangeDays=30", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      setSummary(json.data.summary as SummaryResponse);
    } catch (e: any) {
      setError(String(e?.message ?? "failed_to_load_ai_billing_summary"));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/settings/admin"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">AI 검색 운영</div>
          <div className="text-[12.5px] text-ios-sub">플랜별 사용량, 구매율, 전환율, ARPU를 한 화면에서 봅니다.</div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className={CARD}>
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 계정으로 로그인해야 AI 검색 운영 지표를 확인할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="rnest-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          <section className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-ios-sub">최근 {summary?.periodDays ?? 30}일 기준</div>
                <div className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-ios-text">핵심 지표</div>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-[#F7F7FA] px-4 text-[12.5px] font-semibold text-ios-text"
              >
                새로고침
              </button>
            </div>
            {loading ? <div className="mt-4 text-[13px] text-ios-sub">지표를 불러오는 중입니다.</div> : null}
            {error ? <div className="mt-4 text-[13px] text-red-600">{error}</div> : null}
            {summary ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Metric label="Free 유저 수" value={`${summary.userCounts.free}명`} />
                  <Metric label="Plus 유저 수" value={`${summary.userCounts.plus}명`} />
                  <Metric label="Pro 유저 수" value={`${summary.userCounts.pro}명`} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="Plus 기본 검색 사용" value={`${summary.usage.plusStandardSearchUses}회`} hint={`Plus 프리미엄 사용 ${summary.usage.plusPremiumSearchUses}회`} />
                <Metric label="Plus 프리미엄 구매율" value={`${summary.purchases.plusPremiumPurchaseRatePct}%`} hint={`구매 유저 ${summary.purchases.plusPremiumPurchaseUsers}명`} />
                <Metric label="Plus→Pro 전환율" value={`${summary.purchases.plusPremiumToProConversionRatePct}%`} hint="프리미엄 구매 후 30일 내 전환" />
                <Metric label="업셀 전환율" value={`${summary.conversion.upsellConversionRatePct}%`} hint={`노출 ${summary.conversion.upsellViewCount} · 클릭 ${summary.conversion.upsellClickCount}`} />
                </div>
              </>
            ) : null}
          </section>

          {summary ? (
            <>
              <section className={`${CARD} mt-4`}>
                <div className="text-[18px] font-bold text-ios-text">플랜별 수익/전환</div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Metric label="Free ARPU" value={formatKrw(summary.revenue.arpuByPlan.free).replace(" KRW", "원")} hint={`매출 ${formatKrw(summary.revenue.revenueByPlan.free).replace(" KRW", "원")}`} />
                  <Metric label="Plus ARPU" value={formatKrw(summary.revenue.arpuByPlan.plus).replace(" KRW", "원")} hint={`결제 전환 ${summary.conversion.planPaymentConversionRatePct.plus}%`} />
                  <Metric label="Pro ARPU" value={formatKrw(summary.revenue.arpuByPlan.pro).replace(" KRW", "원")} hint={`결제 전환 ${summary.conversion.planPaymentConversionRatePct.pro}%`} />
                </div>
              </section>

              <section className={`${CARD} mt-4`}>
                <div className="text-[18px] font-bold text-ios-text">추가 구매/소진</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Free 구매 유저" value={`${summary.purchases.freeCreditPurchaseUsers}명`} hint="추가 크레딧 구매 완료 기준" />
                  <Metric label="Pro 프리미엄 추가 구매율" value={`${summary.purchases.proPremiumExtraPurchaseRatePct}%`} hint={`구매 유저 ${summary.purchases.proPremiumExtraPurchaseUsers}명`} />
                  <Metric label="Pro 기본 검색 구매율" value={`${summary.purchases.proStandardPurchaseRatePct}%`} hint={`구매 유저 ${summary.purchases.proStandardPurchaseUsers}명`} />
                  <Metric label="크레딧 결제 성공률" value={`${summary.conversion.creditPackPaymentConversionRatePct}%`} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[20px] border border-ios-sep bg-[#FAFAFC] px-4 py-4">
                    <div className="text-[13px] font-semibold text-ios-text">기본 검색 소진율</div>
                    <div className="mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-ios-text">
                      {summary.usage.burnRate.standard.burnRatePct}%
                    </div>
                    <div className="mt-1 text-[12px] text-ios-sub">
                      차감 {summary.usage.burnRate.standard.consumed} / 지급 {summary.usage.burnRate.standard.granted}
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-ios-sep bg-[#FAFAFC] px-4 py-4">
                    <div className="text-[13px] font-semibold text-ios-text">프리미엄 검색 소진율</div>
                    <div className="mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-ios-text">
                      {summary.usage.burnRate.premium.burnRatePct}%
                    </div>
                    <div className="mt-1 text-[12px] text-ios-sub">
                      차감 {summary.usage.burnRate.premium.consumed} / 지급 {summary.usage.burnRate.premium.granted}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default SettingsAdminAIBillingPage;
