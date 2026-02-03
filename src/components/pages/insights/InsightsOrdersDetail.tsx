"use client";

import { InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { OrdersDetailBlocks } from "@/components/insights/OrdersDetailBlocks";

export function InsightsOrdersDetail() {
  const { state, end, todayShift, ordersSummary } = useInsightsData();

  return (
    <InsightDetailShell
      title="오늘 오더"
      subtitle={formatKoreanDate(end)}
      meta={`${shiftKo(todayShift)} 기준으로 바로 실행할 처방을 제공합니다.`}
    >
      <OrdersDetailBlocks
        state={state}
        pivotISO={end}
        todayShift={todayShift}
        ordersSummary={ordersSummary}
      />
    </InsightDetailShell>
  );
}
