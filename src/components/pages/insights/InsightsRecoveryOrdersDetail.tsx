"use client";

import { InsightDetailShell, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { OrdersDetailBlocks } from "@/components/insights/OrdersDetailBlocks";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const { state, end, todayShift, ordersSummary, hasTodayShift, recordedDays } = useInsightsData();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title={t("오늘 오더")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 오더가 열립니다.")}
        backHref="/insights/recovery"
        tone="navy"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title={t("오늘 오더")}
      subtitle={formatKoreanDate(end)}
      chips={(
        <>
          <DetailChip color={DETAIL_ACCENTS.navy}>{hasTodayShift ? shiftKo(todayShift) : t("근무 미설정")}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>{t("즉시 실행 오더")}</DetailChip>
        </>
      )}
      meta={
        hasTodayShift
          ? t("{shift} 기준으로 바로 실행할 처방을 제공합니다.", { shift: shiftKo(todayShift) })
          : t("오늘 근무가 설정되지 않았어요. 일정에서 근무를 입력하면 오더가 정교해집니다.")
      }
      backHref="/insights/recovery"
      tone="navy"
    >
      <OrdersDetailBlocks state={state} pivotISO={end} todayShift={todayShift} ordersSummary={ordersSummary} />
    </InsightDetailShell>
  );
}
