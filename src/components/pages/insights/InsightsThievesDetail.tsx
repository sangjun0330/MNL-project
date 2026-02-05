"use client";

import { InsightDetailShell, DetailSummaryCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { BatteryThieves } from "@/components/insights/v2/BatteryThieves";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsThievesDetail() {
  const { t } = useI18n();
  const { end, vitals, top1, recordedDays } = useInsightsData();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title={t("에너지 도둑")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 분석이 열립니다.")}
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  const summary = top1
    ? (
        <>
          <span className="font-bold">{t("방전 1순위")}</span> · {top1.label}
        </>
      )
    : (
        <span className="font-bold">{t("에너지 도둑 분석")}</span>
      );

  const detail = top1
    ? t("{label} 비중 {pct} · 피로 요인을 줄여보세요.", { label: top1.label, pct: pct(top1.pct) })
    : t("방전 요인을 분석할 데이터가 부족해요.");

  return (
    <InsightDetailShell
      title={t("에너지 도둑")}
      subtitle={formatKoreanDate(end)}
      meta={t("회복을 방해하는 핵심 요인을 비율로 분석합니다.")}
    >
      <DetailSummaryCard
        accent="pink"
        label="Battery Thieves"
        title={t("에너지 소모 분해")}
        metric={top1 ? pct(top1.pct) : "—"}
        metricLabel={top1 ? top1.label : t("핵심 요인")}
        summary={summary}
        detail={detail}
        chips={<DetailChip color={DETAIL_ACCENTS.pink}>{t("최근 7일 기준")}</DetailChip>}
      />

      <div className="mt-4">
        <BatteryThieves vitals={vitals} periodLabel={t("최근 7일 기준")} />
      </div>
    </InsightDetailShell>
  );
}
