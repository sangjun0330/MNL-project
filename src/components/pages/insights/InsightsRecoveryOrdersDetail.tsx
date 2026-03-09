"use client";

import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { AIPlannerModuleDetailCard } from "@/components/insights/AIRecoveryPlannerCards";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import { useAIRecoveryPlanner } from "@/components/insights/useAIRecoveryPlanner";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { buildFallbackModules } from "@/lib/aiRecoveryPlanner";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();
  const aiPlanner = useAIRecoveryPlanner({
    mode: "cache",
    enabled: planner.aiAvailable && !isInsightsLocked(recordedDays),
  });

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

  const fallback = buildFallbackModules({
    language: "ko",
    plannerContext: {
      focusFactor: planner.focusFactor,
      primaryAction: planner.primaryAction,
      avoidAction: planner.avoidAction,
      nextDuty: planner.nextDuty,
      nextDutyDate: planner.nextDutyDate,
      plannerTone: planner.tone,
      ordersTop3: planner.ordersTop3,
    },
    nextDutyLabel: planner.nextDutyLabel,
    timelinePreview: planner.timelinePreview,
  });

  return (
    <InsightDetailShell
      title="오늘 오더"
      subtitle={formatKoreanDate(end)}
      meta="지금 바로 실행할 행동을 AI가 우선순위 중심으로 정리합니다."
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      {planner.billingLoading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘 오더 접근 상태를 확인하고 있어요.</div>
        </DetailCard>
      ) : !planner.fullAccess ? (
        <>
          <AIPlannerModuleDetailCard accent="navy" module={fallback.orders} />
          <RecoveryPlannerUpgradeCard
            title="오늘 오더 전체는 Pro에서 열립니다."
            description="즉시 실행할 오더 전체와 세부 행동 맥락을 모두 확인할 수 있어요."
            returnTo="/insights/recovery/orders"
          />
        </>
      ) : aiPlanner.data ? (
        <AIPlannerModuleDetailCard accent="navy" module={aiPlanner.data.result.orders} />
      ) : aiPlanner.loading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-ios-sub">AI Planner</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">AI 오늘 오더를 불러오고 있어요.</div>
        </DetailCard>
      ) : (
        <>
          <AIPlannerModuleDetailCard accent="navy" module={fallback.orders} />
          <DetailCard className="p-5 sm:p-6">
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">AI 플래너를 아직 생성하지 않았어요.</div>
            <p className="mt-2 text-[14px] leading-6 text-ios-sub">회복 플래너 허브 오른쪽 상단의 생성 버튼을 누르면 오늘 오더가 AI 버전으로 채워집니다.</p>
          </DetailCard>
        </>
      )}
    </InsightDetailShell>
  );
}
