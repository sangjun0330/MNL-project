"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKoreanDate } from "@/lib/date";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { HeroDashboard } from "@/components/insights/v2/HeroDashboard";
import { DetailSummaryCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { TodaySleepRequiredSheet } from "@/components/insights/TodaySleepRequiredSheet";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
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

function stripLeadingDash(text: string) {
  return text.replace(/^\s*[-•·]\s*/, "").trim();
}

export function InsightsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [openSleepGuide, setOpenSleepGuide] = useState(false);
  const {
    end,
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
    hasInsightData,
  } = useInsightsData();
  const insightsLocked = isInsightsLocked(recordedDays);
  const { hasPaidAccess, loading: billingLoading } = useBillingAccess();
  const {
    data: aiRecovery,
    loading: aiRecoveryLoading,
    requiresTodaySleep,
    error: aiRecoveryError,
  } = useAIRecoveryInsights({ mode: "cache", enabled: !insightsLocked && hasPaidAccess });

  useEffect(() => {
    if (requiresTodaySleep) setOpenSleepGuide(true);
  }, [requiresTodaySleep]);

  const body = useMemo(() => Math.round(todayVital?.body.value ?? 0), [todayVital]);
  const mental = useMemo(() => Math.round(todayVital?.mental.ema ?? 0), [todayVital]);
  const debt = useMemo(() => Math.round((todayVital?.engine?.sleepDebtHours ?? 0) * 10) / 10, [todayVital]);
  const recoveryIndex = useMemo(
    () => Math.round(((todayVital?.engine?.SRI ?? todayVital?.engine?.SRS ?? 1) as number) * 100),
    [todayVital]
  );
  const csi = useMemo(() => Math.round(((todayVital?.engine?.CSI ?? todayVital?.engine?.CMF ?? 0) as number) * 100), [todayVital]);
  const caffeineImpact = useMemo(() => {
    const raw = (todayVital?.engine?.CSD ?? (1 - (todayVital?.engine?.CIF ?? 1))) as number;
    return Math.round(Math.max(0, Math.min(1, raw)) * 100);
  }, [todayVital]);
  const hasSleepRecord = useMemo(
    () => Boolean(todayVital && (todayVital.inputs.sleepHours != null || todayVital.inputs.napHours != null)),
    [todayVital]
  );
  const hasSleepDebtSignal = useMemo(
    () => Boolean(todayVital && (hasSleepRecord || debt > 0 || (todayVital.engine?.debt_n ?? 0) > 0)),
    [todayVital, hasSleepRecord, debt]
  );
  const hasCaffeineRecord = useMemo(
    () => Boolean(todayVital && todayVital.inputs.caffeineMg != null),
    [todayVital]
  );
  const weeklyStatus = useMemo(() => statusFromScore(avgDisplay), [avgDisplay]);
  const aiHeadline = useMemo(() => {
    if (!billingLoading && !hasPaidAccess) return t("유료 플랜 전용 기능");
    if (aiRecovery) return compactText(stripLeadingDash(aiRecovery.result.headline), 90);
    if (aiRecoveryLoading) return t("AI 데이터 확인 중...");
    if (aiRecoveryError) return t("AI 호출 상태를 확인해 주세요.");
    return t("오늘의 맞춤회복을 받아보세요.");
  }, [aiRecovery, aiRecoveryError, aiRecoveryLoading, billingLoading, hasPaidAccess, t]);
  const aiTopSection = aiRecovery?.result.sections.length ? aiRecovery.result.sections[0] : null;
  const aiSummary = useMemo(
    () =>
      requiresTodaySleep
        ? t("오늘 수면 입력 후 AI 맞춤회복을 바로 분석합니다.")
        : !billingLoading && !hasPaidAccess
          ? t("AI 맞춤회복은 Pro 플랜에서 사용할 수 있어요.")
        : aiRecoveryLoading
          ? t("저장된 맞춤회복을 확인하고 있어요...")
          : aiTopSection
            ? compactText(aiTopSection.description, 86)
            : aiRecoveryError
              ? t("AI 호출 상태를 확인해 주세요.")
              : t("상세 페이지에서 오늘 맞춤회복 분석을 시작할 수 있어요."),
    [aiTopSection, requiresTodaySleep, billingLoading, hasPaidAccess, aiRecoveryLoading, aiRecoveryError, t]
  );
  const moveToTodaySleepLog = () => {
    setOpenSleepGuide(false);
    router.push("/schedule?openHealthLog=today&focus=sleep");
  };

  if (insightsLocked) {
    return (
      <div className="mx-auto w-full max-w-[920px] px-3 pb-24 pt-6 sm:px-4">
        <div className="mb-4">
          <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("통계 중심 인사이트")}</div>
        </div>
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[920px] px-3 pb-24 pt-6 sm:px-4">
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
        <span>Vital {todayDisplay ?? "—"}</span>
      </div>

      {/* AI Recovery summary */}
      <section className="mt-6">
        <Link
          href="/insights/recovery"
          className="block"
          onClick={(e) => {
            if (!hasPaidAccess && !billingLoading) {
              e.preventDefault();
              const confirmed = window.confirm(
                t("AI 맞춤회복은 유료 플랜 전용 기능입니다.\n플랜 업그레이드 페이지로 이동할까요?")
              );
              if (confirmed) router.push("/settings/billing/upgrade");
              return;
            }
            if (!requiresTodaySleep) return;
            e.preventDefault();
            setOpenSleepGuide(true);
          }}
        >
          <DetailSummaryCard
            accent="navy"
            label="AI Recovery"
            title={t("AI 맞춤회복")}
            summary={
              requiresTodaySleep
                ? t("오늘 수면 기록을 먼저 입력해 주세요.")
                : !billingLoading && !hasPaidAccess
                  ? t("유료 플랜 전용 기능")
                : aiHeadline
            }
            detail={
              requiresTodaySleep
                ? t("오늘 수면 입력 후 바로 개인 맞춤 회복 가이드를 시작해요.")
                : !billingLoading && !hasPaidAccess
                  ? t("확인 버튼을 누르면 플랜 업그레이드 페이지로 이동합니다.")
                : aiRecovery
                  ? t("내 기록을 반영한 오늘의 개인 맞춤 회복 가이드")
                  : aiSummary
            }
            chips={(
              <>
                {requiresTodaySleep ? (
                  <DetailChip color={DETAIL_ACCENTS.pink}>{t("오늘 수면 입력 필요")}</DetailChip>
                ) : (
                  !billingLoading && !hasPaidAccess ? (
                    <DetailChip color={DETAIL_ACCENTS.pink}>{t("유료 플랜 전용")}</DetailChip>
                  ) : aiRecovery ? (
                    <>
                      {(aiRecovery.result.sections ?? []).slice(0, 2).map((section) => (
                        <DetailChip key={`${section.category}-${section.title}`} color={DETAIL_ACCENTS.navy}>
                          {section.title}
                        </DetailChip>
                      ))}
                    </>
                  ) : (
                    <DetailChip color={DETAIL_ACCENTS.pink}>
                      {aiRecoveryError ? t("AI 호출 실패") : t("오늘 맞춤회복 받기")}
                    </DetailChip>
                  )
                )}
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

      {!hasInsightData ? (
        <section className="mt-6 rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[18px] font-bold tracking-[-0.01em] text-ios-text">{t("데이터가 없어요")}</div>
          <div className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("기록 입력 시 자세한 정보 제공")}
          </div>
          <div className="mt-3 text-[13px] text-ios-muted">
            {t("수면/스트레스/활동/카페인/기분 중 1개만 입력해도 인사이트가 시작됩니다.")}
          </div>
        </section>
      ) : null}

      {!hasInsightData ? null : (
        <>

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
        <MiniMetric label={t("수면부채")} value={hasSleepDebtSignal ? debt : "—"} unit={hasSleepDebtSignal ? "h" : undefined} />
        <MiniMetric label={t("리듬 부담")} value={`${csi}`} unit="%" />
        <MiniMetric label={t("카페인 영향")} value={hasCaffeineRecord ? `${caffeineImpact}` : "—"} unit={hasCaffeineRecord ? "%" : undefined} />
        <MiniMetric label={t("회복 지수")} value={hasSleepDebtSignal ? `${recoveryIndex}` : "—"} unit={hasSleepDebtSignal ? "%" : undefined} />
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
        </>
      )}

      <TodaySleepRequiredSheet
        open={openSleepGuide}
        onClose={() => setOpenSleepGuide(false)}
        onConfirm={moveToTodaySleepLog}
      />
    </div>
  );
}
