"use client";

import { InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { OrdersDetailBlocks } from "@/components/insights/OrdersDetailBlocks";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

export function InsightsOrdersDetail() {
  const { t } = useI18n();
  const { state, end, todayShift, ordersSummary, hasTodayShift, recordedDays } = useInsightsData();

  if (recordedDays < 7) {
    return (
      <InsightDetailShell
        title={t("오늘 오더")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 오더가 열립니다.")}
      >
        <InsightsLockedNotice recordedDays={recordedDays} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title={t("오늘 오더")}
      subtitle={formatKoreanDate(end)}
      meta={
        hasTodayShift
          ? t("{shift} 기준으로 바로 실행할 처방을 제공합니다.", { shift: shiftKo(todayShift) })
          : t("오늘 근무가 설정되지 않았어요. 일정에서 근무를 입력하면 오더가 정교해집니다.")
      }
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
