"use client";

import { InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { OrdersDetailBlocks } from "@/components/insights/OrdersDetailBlocks";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";

export function InsightsRecoveryOrdersDetail() {
  const { state, end, todayShift, ordersSummary, hasTodayShift, recordedDays } = useInsightsData();

  if (recordedDays < 7) {
    return (
      <InsightDetailShell
        title="오늘 오더"
        subtitle={formatKoreanDate(end)}
        meta="건강 기록 7일 이상부터 오더가 열립니다."
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} />
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
      <OrdersDetailBlocks state={state} pivotISO={end} todayShift={todayShift} ordersSummary={ordersSummary} />
    </InsightDetailShell>
  );
}
