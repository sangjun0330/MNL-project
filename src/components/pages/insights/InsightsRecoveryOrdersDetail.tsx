"use client";

import { InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { OrdersDetailBlocks } from "@/components/insights/OrdersDetailBlocks";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const { state, end, todayShift, ordersSummary, hasTodayShift, recordedDays } = useInsightsData();
  const planner = useRecoveryPlanner();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="오늘 오더"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 오더가 열립니다.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="오늘 오더"
      subtitle={formatKoreanDate(end)}
      meta={
        hasTodayShift
          ? `${shiftKo(todayShift)} 기준으로 바로 실행할 처방을 제공합니다.`
          : "오늘 근무가 설정되지 않았어요. 일정에서 근무를 입력하면 오더가 정교해집니다."
      }
      backHref="/insights/recovery"
    >
      {planner.billingLoading ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">오더 접근 상태를 확인하고 있어요.</div>
          <div className="mt-2 text-[14px] leading-6 text-ios-sub">오늘 오더 전체를 보여줄 수 있는지 확인 중입니다.</div>
        </div>
      ) : !planner.fullAccess ? (
        <>
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[12px] font-semibold text-ios-sub">Priority Orders</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오늘의 우선순위 오더 미리보기</div>
            <div className="mt-4 space-y-3">
              {planner.ordersTop3.slice(0, 1).map((item) => (
                <div key={item.rank} className="rounded-2xl border border-ios-sep bg-ios-bg px-4 py-4">
                  <div className="text-[12px] font-semibold text-ios-sub">오더 {item.rank}</div>
                  <div className="mt-1 text-[15px] font-bold text-ios-text">{item.title}</div>
                  <div className="mt-2 text-[13px] leading-6 text-ios-sub">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
          <RecoveryPlannerUpgradeCard title="오늘 오더 전체는 Pro에서 열립니다." description="지금 바로 실행할 오더 전체와 맞춤 회복 오더 상세를 확인할 수 있어요." />
        </>
      ) : (
        <OrdersDetailBlocks state={state} pivotISO={end} todayShift={todayShift} ordersSummary={ordersSummary} />
      )}
    </InsightDetailShell>
  );
}
