"use client";

import { InsightDetailShell, DetailSummaryCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { BatteryThieves } from "@/components/insights/v2/BatteryThieves";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsThievesDetail() {
  const { end, vitals, top1 } = useInsightsData();

  const summary = top1
    ? (
        <>
          <span className="font-bold">방전 1순위</span> · {top1.label}
        </>
      )
    : (
        <span className="font-bold">에너지 도둑 분석</span>
      );

  const detail = top1
    ? `${top1.label} 비중 ${pct(top1.pct)} · 피로 요인을 줄여보세요.`
    : "방전 요인을 분석할 데이터가 부족해요.";

  return (
    <InsightDetailShell
      title="에너지 도둑"
      subtitle={formatKoreanDate(end)}
      meta="회복을 방해하는 핵심 요인을 비율로 분석합니다."
    >
      <DetailSummaryCard
        accent="pink"
        label="Battery Thieves"
        title="에너지 소모 분해"
        metric={top1 ? pct(top1.pct) : "—"}
        metricLabel={top1 ? top1.label : "핵심 요인"}
        summary={summary}
        detail={detail}
        chips={<DetailChip color={DETAIL_ACCENTS.pink}>최근 7일 기준</DetailChip>}
      />

      <div className="mt-4">
        <BatteryThieves vitals={vitals} periodLabel="최근 7일 기준" />
      </div>
    </InsightDetailShell>
  );
}
