"use client";

import { InsightDetailShell, DetailSummaryCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { TimelineForecast } from "@/components/insights/v2/TimelineForecast";

export function InsightsTimelineDetail() {
  const { end, todayShift, todayVital } = useInsightsData();
  const isRestDay = todayShift === "OFF" || todayShift === "VAC";

  const metaCopy = isRestDay
    ? "휴식일 컨디션 기반으로 회복 루틴을 추천합니다."
    : `${shiftKo(todayShift)} 기준으로 출근 전 · 근무 중 · 퇴근 후 회복 추천을 제공합니다.`;

  const summaryLabel = isRestDay ? "휴식일 회복 추천" : "알고리즘 회복 추천";
  const detailCopy = isRestDay
    ? "근무 없이 회복을 최적화하는 휴식 루틴을 제공합니다."
    : "출근 전 · 근무 중 · 퇴근 후 회복 루틴을 제공합니다.";

  return (
    <InsightDetailShell title="타임라인 예보" subtitle={formatKoreanDate(end)} meta={metaCopy}>
      <DetailSummaryCard
        accent="navy"
        label="Timeline Forecast"
        title="오늘의 회복 흐름"
        metric={shiftKo(todayShift)}
        metricLabel="Shift"
        summary={(
          <>
            <span className="font-bold">{summaryLabel}</span> · {shiftKo(todayShift)} 기준
          </>
        )}
        detail={detailCopy}
        chips={(
          <>
            {isRestDay ? (
              <>
                <DetailChip color={DETAIL_ACCENTS.navy}>휴식 최적화</DetailChip>
                <DetailChip color={DETAIL_ACCENTS.navy}>리듬 회복</DetailChip>
              </>
            ) : (
              <>
                <DetailChip color={DETAIL_ACCENTS.navy}>근무 단계별</DetailChip>
                <DetailChip color={DETAIL_ACCENTS.navy}>알고리즘 분석</DetailChip>
              </>
            )}
          </>
        )}
      />

      <div className="mt-4">
        <TimelineForecast shift={todayShift} vital={todayVital} />
      </div>
    </InsightDetailShell>
  );
}
