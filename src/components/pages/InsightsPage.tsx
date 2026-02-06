"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatKoreanDate } from "@/lib/date";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { HeroDashboard } from "@/components/insights/v2/HeroDashboard";
import { DetailSummaryCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { statusFromScore } from "@/lib/wnlInsight";
import { useI18n } from "@/lib/useI18n";

function MetricCard({
  label,
  value,
  avg,
  color,
}: {
  label: string;
  value: number;
  avg: number;
  color: string;
}) {
  const delta = value - avg;
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="rounded-2xl border border-ios-sep bg-white p-4">
      <div className="text-[12px] font-semibold text-ios-sub">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-[28px] font-extrabold tracking-[-0.02em]" style={{ color }}>
          {value}
        </span>
        <span className="pb-1 text-[13px] font-semibold text-ios-muted">
          avg {sign}{delta}
        </span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-ios-bg">
        <div
          className="h-2 rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl border border-ios-sep bg-white p-3">
      <div className="text-[11.5px] font-semibold text-ios-sub">{label}</div>
      <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">
        {value}
        {unit ? <span className="text-[13px] font-semibold text-ios-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

function formatPct(p: number) {
  return `${Math.round(p * 100)}%`;
}

function compactText(text: string, max = 80) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

export function InsightsPage() {
  const { t } = useI18n();
  const { data: aiRecovery, loading: aiRecoveryLoading, fromSupabase } = useAIRecoveryInsights();
  const {
    end,
    vitals,
    todayVital,
    todayShift,
    menstrual,
    todayDisplay,
    syncLabel,
    fastCharge,
    avgDisplay,
    avgBody,
    avgMental,
    shiftCounts,
    top1,
    hasTodayShift,
    recordedDays,
  } = useInsightsData();

  const body = useMemo(() => Math.round(todayVital?.body.value ?? 0), [todayVital]);
  const mental = useMemo(() => Math.round(todayVital?.mental.ema ?? 0), [todayVital]);
  const debt = useMemo(() => Math.round((todayVital?.engine?.sleepDebtHours ?? 0) * 10) / 10, [todayVital]);
  const csi = useMemo(() => Math.round(((todayVital?.engine?.CSI ?? todayVital?.engine?.CMF ?? 0) as number) * 100), [todayVital]);
  const cif = useMemo(() => {
    const raw = (todayVital?.engine?.CIF ?? (1 - (todayVital?.engine?.CSD ?? 0))) as number;
    return Math.round(raw * 100);
  }, [todayVital]);
  const night = useMemo(() => todayVital?.engine?.nightStreak ?? 0, [todayVital]);
  const weeklyStatus = useMemo(() => statusFromScore(avgDisplay), [avgDisplay]);
  const aiHeadline = useMemo(() => compactText(aiRecovery.result.headline, 90), [aiRecovery.result.headline]);
  const aiTopSection = aiRecovery.result.sections.length ? aiRecovery.result.sections[0] : null;
  const aiSummary = useMemo(
    () => (aiTopSection ? compactText(aiTopSection.description, 86) : t("기록이 쌓이면 회복 처방이 더 정교해져요.")),
    [aiTopSection, t]
  );

  if (isInsightsLocked(recordedDays)) {
    return (
      <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6 sm:px-6">
        <div className="mb-4">
          <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("통계 중심 인사이트")}</div>
        </div>
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6 sm:px-6">
      {/* Header */}
      <div className="mb-4">
        <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("통계 중심 인사이트")}</div>
      </div>

      {/* Context chips */}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ios-sub">
        <span>{formatKoreanDate(end)}</span>
        {hasTodayShift ? (
          <>
            <span className="opacity-40">·</span>
            <span>{shiftKo(todayShift)}</span>
          </>
        ) : null}
        <span className="opacity-40">·</span>
        <span>{menstrual.enabled ? t(menstrual.label) : t("주기")}</span>
        <span className="opacity-40">·</span>
        <span>Vital {todayDisplay}</span>
      </div>

      {/* AI Recovery summary */}
      <section className="mt-6">
        <Link href="/insights/recovery" className="block">
          <DetailSummaryCard
            accent="navy"
            label="AI Recovery"
            title={t("AI 맞춤회복")}
            metric={aiRecoveryLoading ? "…" : aiRecovery.result.sections.length}
            metricLabel={t("오늘 처방")}
            summary={aiRecoveryLoading ? t("분석 중...") : aiHeadline}
            detail={aiSummary}
            chips={(
              <>
                {(aiRecovery.result.sections ?? []).slice(0, 2).map((section) => (
                  <DetailChip key={`${section.category}-${section.title}`} color={DETAIL_ACCENTS.navy}>
                    {section.title}
                  </DetailChip>
                ))}
                <DetailChip color={aiRecovery.engine === "openai" ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.navy}>
                  {aiRecovery.engine === "openai" ? t("OpenAI 생성 분석") : t("규칙 기반 분석")}
                </DetailChip>
                <DetailChip color={fromSupabase ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.pink}>
                  {fromSupabase ? t("Supabase 실시간 분석") : t("기기 내 임시 분석")}
                </DetailChip>
              </>
            )}
            valueColor={DETAIL_ACCENTS.navy}
          />
        </Link>
      </section>

      {/* Hero: HeroDashboard */}
      <section className="mt-6">
        <Link href="/insights/vital" aria-label={t("오늘 바이탈 요약")}>
          <HeroDashboard
            vital={todayVital}
            syncLabel={syncLabel}
            fastCharge={fastCharge}
          />
        </Link>
      </section>

      {/* Body & Mental 2-column cards */}
      <section className="mt-6 grid grid-cols-2 gap-4">
        <MetricCard
          label="Body"
          value={body}
          avg={avgBody}
          color="#007AFF"
        />
        <MetricCard
          label="Mental"
          value={mental}
          avg={avgMental}
          color="#E87485"
        />
      </section>

      {/* Mini metrics 2x2 grid */}
      <section className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric label={t("수면부채")} value={debt} unit="h" />
        <MiniMetric label={t("리듬 부담")} value={`${csi}`} unit="%" />
        <MiniMetric label={t("카페인 영향")} value={`${cif}`} unit="%" />
        <MiniMetric label={t("연속 나이트")} value={night} />
      </section>

      {/* 7-day trends inline */}
      <section className="mt-6">
        <Link href="/insights/trends" className="block">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("최근 7일 통계")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">
                Vital {avgDisplay} · Body {avgBody} · Mental {avgMental}
              </div>
            </div>
            <span className="text-[20px] text-ios-muted">›</span>
          </div>
        </Link>
        <Link href="/insights/trends" className="mt-3 block">
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
              weeklyStatus === "stable"
                ? DETAIL_ACCENTS.mint
                : weeklyStatus === "caution" || weeklyStatus === "observation"
                ? DETAIL_ACCENTS.navy
                : DETAIL_ACCENTS.pink
            }
          />
        </Link>
      </section>

      {/* Battery Thieves inline */}
      <section className="mt-6">
        <Link href="/insights/thieves" className="block">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("에너지 도둑")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">
                {top1
                  ? `${t(top1.label)} ${formatPct(top1.pct)}`
                  : t("방전 요인을 분석할 데이터가 부족해요.")}
              </div>
            </div>
            <span className="text-[20px] text-ios-muted">›</span>
          </div>
        </Link>
        <Link href="/insights/thieves" className="mt-3 block">
          <DetailSummaryCard
            accent="pink"
            label="Battery Thieves"
            title={t("에너지 소모 분해")}
            metric={top1 ? formatPct(top1.pct) : "—"}
            metricLabel={top1 ? t(top1.label) : t("핵심 요인")}
            summary={
              top1 ? (
                <>
                  <span className="font-bold">{t("방전 1순위")}</span> · {t(top1.label)}
                </>
              ) : (
                <span className="font-bold">{t("에너지 도둑 분석")}</span>
              )
            }
            detail={
              top1
                ? t("{label} 비중 {pct} · 피로 요인을 줄여보세요.", {
                    label: t(top1.label),
                    pct: formatPct(top1.pct),
                  })
                : t("방전 요인을 분석할 데이터가 부족해요.")
            }
            chips={<DetailChip color={DETAIL_ACCENTS.pink}>{t("최근 7일 기준")}</DetailChip>}
            valueColor={DETAIL_ACCENTS.pink}
          />
        </Link>
      </section>
    </div>
  );
}
