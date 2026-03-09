"use client";

import {
  InsightDetailShell,
  DetailSummaryCard,
  DetailChip,
  DETAIL_ACCENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { RecoveryPrescription } from "@/components/insights/RecoveryPrescription";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useI18n } from "@/lib/useI18n";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsRecoveryPlanDetail() {
  const { t } = useI18n();
  const { end, state, top1, top3, syncLabel, todayShift, hasTodayShift, recordedDays } = useInsightsData();
  const planner = useRecoveryPlanner();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="다음 듀티까지 회복 처방"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 회복 처방이 열립니다.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  const summary = top1 ? (
    <>
      <span className="font-bold">회복 포커스</span> · {top1.label}
    </>
  ) : (
    <span className="font-bold">회복 포커스</span>
  );

  const detail = top1
    ? `${top1.label} 비중 ${pct(top1.pct)} · 회복 처방을 가장 먼저 확인하세요.`
    : "기록이 쌓이면 회복 처방이 더 정교해져요.";

  return (
    <InsightDetailShell
      title="회복 처방"
      subtitle={formatKoreanDate(end)}
      meta="다음 실제 근무 전까지 무엇을 먼저 회복해야 하는지 전략 중심으로 정리합니다."
      backHref="/insights/recovery"
    >
      <DetailSummaryCard
        accent="mint"
        label="Personalized Recovery"
        title="다음 근무까지의 회복 전략"
        metric={top1 ? pct(top1.pct) : "—"}
        metricLabel={top1 ? top1.label : "핵심 요인"}
        summary={summary}
        detail={planner.primaryAction ? `지금 할 1개 · ${planner.primaryAction}` : detail}
        chips={(
          <>
            <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
            {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
            <DetailChip color={DETAIL_ACCENTS.mint}>{syncLabel}</DetailChip>
            {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.mint}>{shiftKo(todayShift)}</DetailChip> : null}
            {top3?.map((t) => (
              <DetailChip key={t.key} color={DETAIL_ACCENTS.mint}>
                TOP · {t.label} {pct(t.pct)}
              </DetailChip>
            ))}
          </>
        )}
      />

      {planner.billingLoading ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">플랜 접근 상태를 확인하고 있어요.</div>
          <div className="mt-2 text-[14px] leading-6 text-ios-sub">회복 처방 전체를 보여줄 수 있는지 확인 중입니다.</div>
        </div>
      ) : !planner.fullAccess ? (
        <>
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[13px] font-semibold text-ios-sub">Preview</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">이번 회복 목표</div>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3">
              <div className="text-[12px] font-semibold text-ios-sub">지금 할 1개</div>
              <div className="mt-1 text-[15px] font-semibold leading-6 text-ios-text">{planner.primaryAction ?? t("기록이 쌓이면 회복 목표가 더 정교해져요.")}</div>
            </div>
            <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3">
              <div className="text-[12px] font-semibold text-ios-sub">피해야 할 것</div>
              <div className="mt-1 text-[14px] leading-6 text-ios-sub">{planner.avoidAction ?? t("늦은 자극과 무리한 일정은 줄여 주세요.")}</div>
            </div>
          </div>
          <RecoveryPlannerUpgradeCard title="회복 처방 전체는 Pro에서 열립니다." />
        </>
      ) : (
        <div className="mt-4">
          <RecoveryPrescription state={state} pivotISO={end} />
        </div>
      )}
    </InsightDetailShell>
  );
}
