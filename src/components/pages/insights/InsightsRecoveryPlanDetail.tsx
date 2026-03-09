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

export function InsightsRecoveryPlanDetail() {
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
        title="회복 처방"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 회복 처방이 열립니다.")}
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
      title="회복 처방"
      subtitle={formatKoreanDate(end)}
      meta="다음 실제 근무 전까지 무엇을 먼저 회복해야 하는지 AI 전략 중심으로 정리합니다."
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      {planner.billingLoading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">회복 처방 접근 상태를 확인하고 있어요.</div>
        </DetailCard>
      ) : !planner.fullAccess ? (
        <>
          <AIPlannerModuleDetailCard accent="mint" module={fallback.prescription} />
          <RecoveryPlannerUpgradeCard title="회복 처방 전체는 Pro에서 열립니다." returnTo="/insights/recovery/plan" />
        </>
      ) : aiPlanner.data ? (
        <AIPlannerModuleDetailCard accent="mint" module={aiPlanner.data.result.prescription} />
      ) : aiPlanner.loading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-ios-sub">AI Planner</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">AI 회복 처방을 불러오고 있어요.</div>
        </DetailCard>
      ) : (
        <>
          <AIPlannerModuleDetailCard accent="mint" module={fallback.prescription} />
          <DetailCard className="p-5 sm:p-6">
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">AI 플래너를 아직 생성하지 않았어요.</div>
            <p className="mt-2 text-[14px] leading-6 text-ios-sub">회복 플래너 허브 오른쪽 상단의 생성 버튼을 누르면 오늘 처방이 AI 버전으로 채워집니다.</p>
          </DetailCard>
        </>
      )}
    </InsightDetailShell>
  );
}
