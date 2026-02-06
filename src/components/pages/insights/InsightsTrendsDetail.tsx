"use client";

import { InsightDetailShell, DetailSummaryCard, DetailCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, fmtMD, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { TrendChart } from "@/components/insights/TrendChart";
import { Pill } from "@/components/ui/Pill";
import { statusFromScore } from "@/lib/wnlInsight";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsTrendsDetail() {
  const { t } = useI18n();
  const { end, avgDisplay, avgBody, avgMental, bestWorst, shiftCounts, trend, top3, recordedDays } = useInsightsData();

  const status = statusFromScore(avgDisplay);

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title={t("최근 7일 통계")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 통계가 열립니다.")}
        tone="mint"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title={t("최근 7일 통계")}
      subtitle={formatKoreanDate(end)}
      chips={(
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>Vital {avgDisplay}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.mint}>Body {avgBody}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.mint}>Mental {avgMental}</DetailChip>
        </>
      )}
      meta={t("최근 7일의 리듬/바이탈 변화와 핵심 요인을 정리했습니다.")}
      tone="mint"
    >
      <DetailSummaryCard
        accent="mint"
        label="Stats"
        title={t("주간 요약")}
        metric={avgDisplay}
        metricLabel="Avg Vital"
        summary={(
          <>
            <span className="font-bold">{t("최근 7일 평균")}</span> · Vital {avgDisplay}
          </>
        )}
        detail={`Body ${avgBody} · Mental ${avgMental}`}
        chips={(
          <>
            <DetailChip color={DETAIL_ACCENTS.mint}>Body {avgBody}</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.mint}>Mental {avgMental}</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.mint}>{t("근무 D")} {shiftCounts.D}</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.mint}>{t("근무 E")} {shiftCounts.E}</DetailChip>
          </>
        )}
        valueColor={
          status === "stable"
            ? DETAIL_ACCENTS.mint
            : status === "caution" || status === "observation"
            ? DETAIL_ACCENTS.navy
            : DETAIL_ACCENTS.pink
        }
      />

      <DetailCard className="mt-4">
        <div className="px-5 pt-5">
          <div className="text-[13px] font-semibold text-ios-sub">Top Factors</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{t("핵심 요인")}</div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {(top3 ?? []).map((factor) => (
              <Pill key={factor.key} className="bg-white">
                <span className="text-ios-sub">TOP</span>
                <span className="mx-1 opacity-30">·</span>
                <span className="font-semibold">{t(factor.label)}</span>
                <span className="ml-2 text-ios-muted">{pct(factor.pct)}</span>
              </Pill>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-4">
              <div className="text-[12px] font-semibold text-ios-sub">Best</div>
              <div className="mt-1 text-[15px] font-semibold">
                {bestWorst.best
                  ? `${fmtMD(bestWorst.best.dateISO)} · ${shiftKo(bestWorst.best.shift)} · Vital ${Math.round(
                      Math.min(bestWorst.best.body.value, bestWorst.best.mental.ema)
                    )}`
                  : "-"}
              </div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-4">
              <div className="text-[12px] font-semibold text-ios-sub">Worst</div>
              <div className="mt-1 text-[15px] font-semibold">
                {bestWorst.worst
                  ? `${fmtMD(bestWorst.worst.dateISO)} · ${shiftKo(bestWorst.worst.shift)} · Vital ${Math.round(
                      Math.min(bestWorst.worst.body.value, bestWorst.worst.mental.ema)
                    )}`
                  : "-"}
              </div>
            </div>
          </div>
        </div>
      </DetailCard>

      <DetailCard className="mt-4">
        <div className="px-5 pt-5">
          <div className="text-[13px] font-semibold text-ios-sub">Trend</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{t("에너지 흐름")}</div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <TrendChart data={trend} />
        </div>
      </DetailCard>
    </InsightDetailShell>
  );
}
