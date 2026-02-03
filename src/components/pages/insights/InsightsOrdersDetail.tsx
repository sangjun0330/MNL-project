"use client";

import { InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { OrdersDetailBlocks } from "@/components/insights/OrdersDetailBlocks";

export function InsightsOrdersDetail() {
  const { state, end, todayShift, ordersSummary, hasTodayShift } = useInsightsData();

  return (
    <InsightDetailShell
      title="오늘 오더"
      subtitle={formatKoreanDate(end)}
      meta={hasTodayShift
        ? `${shiftKo(todayShift)} 기준으로 바로 실행할 처방을 제공합니다.`
        : "오늘 근무가 아직 설정되지 않아 오더 추천이 제한됩니다."}
    >
      <OrdersDetailBlocks
        state={state}
        pivotISO={end}
        todayShift={todayShift}
        ordersSummary={ordersSummary}
        showShift={hasTodayShift}
      />
    </InsightDetailShell>
  );
}
