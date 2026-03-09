"use client";

import { InsightDetailShell, DetailSummaryCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { TimelineForecast } from "@/components/insights/v2/TimelineForecast";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useI18n } from "@/lib/useI18n";

export function InsightsTimelineDetail() {
  const { t } = useI18n();
  const { end, todayShift, todayVital, hasTodayShift, recordedDays } = useInsightsData();
  const planner = useRecoveryPlanner();
  const isRestDay = todayShift === "OFF" || todayShift === "VAC";

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="타임라인 예보"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 타임라인이 열립니다.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  const metaCopy = hasTodayShift
    ? isRestDay
      ? "휴식일 컨디션 기반으로 회복 루틴을 추천합니다."
      : `${shiftKo(todayShift)} 기준으로 출근 전 · 근무 중 · 퇴근 후 회복 추천을 제공합니다.`
    : "오늘 근무가 설정되지 않았어요. 일정에서 근무를 입력하면 타임라인 예보가 열립니다.";

  const summaryLabel = isRestDay ? "휴식일 회복 추천" : "알고리즘 회복 추천";
  const detailCopy = hasTodayShift
    ? isRestDay
      ? "근무 없이 회복을 최적화하는 휴식 루틴을 제공합니다."
      : "출근 전 · 근무 중 · 퇴근 후 회복 루틴을 제공합니다."
    : "근무가 입력되면 출근 전 · 근무 중 · 퇴근 후 회복 루틴을 제공합니다.";

  return (
    <InsightDetailShell title="타임라인" subtitle={formatKoreanDate(end)} meta={metaCopy} backHref="/insights/recovery">
      <DetailSummaryCard
        accent="navy"
        label="Timeline Forecast"
        title="오늘의 회복 흐름"
        metric={hasTodayShift ? shiftKo(todayShift) : "—"}
        metricLabel="Shift"
        summary={(
          <>
            <span className="font-bold">{summaryLabel}</span>
            {hasTodayShift ? <> · {shiftKo(todayShift)} 기준</> : null}
          </>
        )}
        detail={detailCopy}
        chips={(
          <>
            {hasTodayShift ? (
              isRestDay ? (
                <>
                  <DetailChip color={DETAIL_ACCENTS.navy}>휴식 최적화</DetailChip>
                  <DetailChip color={DETAIL_ACCENTS.navy}>리듬 회복</DetailChip>
                </>
              ) : (
                <>
                  <DetailChip color={DETAIL_ACCENTS.navy}>근무 단계별</DetailChip>
                  <DetailChip color={DETAIL_ACCENTS.navy}>알고리즘 분석</DetailChip>
                </>
              )
            ) : (
              <DetailChip color={DETAIL_ACCENTS.navy}>근무 설정 필요</DetailChip>
            )}
          </>
        )}
      />

      {planner.billingLoading ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">타임라인 접근 상태를 확인하고 있어요.</div>
          <div className="mt-2 text-[14px] leading-6 text-ios-sub">시간대별 회복 흐름 전체를 보여줄 수 있는지 확인 중입니다.</div>
        </div>
      ) : !planner.fullAccess ? (
        <>
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[12px] font-semibold text-ios-sub">Preview</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">시간대별 회복 흐름 미리보기</div>
            <div className="mt-4 space-y-3">
              {planner.timelinePreview.slice(0, 1).map((item) => (
                <div key={item.phase} className="rounded-2xl border border-ios-sep bg-ios-bg px-4 py-4">
                  <div className="text-[12px] font-semibold text-ios-sub">{item.phase}</div>
                  <div className="mt-1 text-[14px] leading-6 text-ios-sub">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
          <RecoveryPlannerUpgradeCard
            title="타임라인 전체는 Pro에서 열립니다."
            description="출근 전, 근무 중, 퇴근 후 흐름을 시간대별로 모두 확인할 수 있어요."
            returnTo="/insights/recovery/timeline"
          />
        </>
      ) : hasTodayShift ? (
        <div className="mt-4">
          <TimelineForecast shift={todayShift} vital={todayVital} />
        </div>
      ) : null}
    </InsightDetailShell>
  );
}
