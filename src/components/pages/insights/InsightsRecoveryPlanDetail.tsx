"use client";

import {
  InsightDetailShell,
  DetailSummaryCard,
  DetailChip,
  DETAIL_ACCENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { RecoveryPrescription } from "@/components/insights/RecoveryPrescription";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsRecoveryPlanDetail() {
  const { end, state, top1, top3, syncLabel, todayShift, hasTodayShift } = useInsightsData();

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
      title="다음 듀티까지 회복 처방"
      subtitle={formatKoreanDate(end)}
      meta="기록(수면/스트레스/활동/카페인/기분/주기)을 근거로 회복 플랜을 제공합니다."
      backHref="/insights/recovery"
    >
      <DetailSummaryCard
        accent="mint"
        label="Personalized Recovery"
        title="오늘부터 다음 듀티까지의 회복 처방"
        metric={top1 ? pct(top1.pct) : "—"}
        metricLabel={top1 ? top1.label : "핵심 요인"}
        summary={summary}
        detail={detail}
        chips={(
          <>
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

      <div className="mt-4">
        <RecoveryPrescription state={state} pivotISO={end} />
      </div>
    </InsightDetailShell>
  );
}
