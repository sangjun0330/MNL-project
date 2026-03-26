"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

function RecoverySkeletonLinkCard({
  href,
  label,
  title,
  headline,
  summary,
  chips,
}: {
  href: string;
  label: string;
  title: string;
  headline: string;
  summary: string;
  chips?: ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-[680px]">
            <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{label}</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{title}</div>
            <p className="mt-3 break-keep text-[16px] font-bold leading-7 tracking-[-0.03em] text-ios-text">{headline}</p>
            <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub">{summary}</p>
          </div>
          <div className="text-[24px] text-black/28">›</div>
        </div>
        {chips ? <div className="mt-4 flex flex-wrap gap-2">{chips}</div> : null}
      </DetailCard>
    </Link>
  );
}

export function InsightsRecoveryDetail() {
  const { t } = useI18n();
  const { end, recordedDays, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="회복 플래너"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 볼 수 있어요.")}
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="회복 플래너"
      subtitle={formatKoreanDate(end)}
      meta="AI 회복 해설을 확인할 수 있어요."
      chips={
        <>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
        </>
      }
    >
      <RecoverySkeletonLinkCard
        href="/insights/recovery/ai"
        label="AI CUSTOMIZED RECOVERY"
        title="AI 맞춤회복"
        headline="오늘 기록과 최근 흐름으로 회복 포인트를 정리해 줘요."
        summary="카테고리별 해설과 추천 행동을 바로 확인할 수 있어요."
        chips={
          <>
            <DetailChip color={DETAIL_ACCENTS.navy}>AI 해설</DetailChip>
            {planner.focusFactor ? <DetailChip color={DETAIL_ACCENTS.mint}>회복 포커스 {planner.focusFactor.label}</DetailChip> : null}
          </>
        }
      />

      <DetailCard className="p-5 sm:p-6">
        <div className="text-[12px] font-semibold text-ios-sub">안내</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">지금 되는 것</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <DetailChip color={DETAIL_ACCENTS.mint}>AI 맞춤회복 해설</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>카테고리별 추천 행동</DetailChip>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ios-sub">
          AI 해설 결과는 기존 기록과 따로 안전하게 저장돼요.
        </p>
      </DetailCard>
    </InsightDetailShell>
  );
}
