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
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="회복 플래너"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 회복 플래너가 열립니다.")}
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="회복 플래너"
      subtitle={formatKoreanDate(end)}
      meta="맞춤회복과 오늘의 오더 화면의 UI 구조만 유지 중입니다."
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      <RecoverySkeletonLinkCard
        href="/insights/recovery/ai"
        label="AI CUSTOMIZED RECOVERY"
        title="AI 맞춤회복"
        headline="해설 카드 구조만 남겨 둔 정적 화면입니다."
        summary="헤드라인, 요약, 섹션 배치 같은 UI 뼈대만 유지하고 생성 파이프라인과 서버 연동은 제거했습니다."
        chips={
          <>
            <DetailChip color={DETAIL_ACCENTS.navy}>UI skeleton</DetailChip>
            {planner.focusFactor ? <DetailChip color={DETAIL_ACCENTS.mint}>회복 포커스 {planner.focusFactor.label}</DetailChip> : null}
          </>
        }
      />

      <RecoverySkeletonLinkCard
        href="/insights/recovery/orders"
        label="TODAY ORDERS"
        title="오늘의 오더"
        headline="체크리스트 카드 구조만 유지 중입니다."
        summary="오더 개수 선택, 단계 구분, 체크리스트 카드 위치는 남겨 두고 생성·진행도 저장 시스템은 제거했습니다."
        chips={
          <>
            <DetailChip color={DETAIL_ACCENTS.navy}>Checklist skeleton</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.mint}>1-5개 오더 레이아웃</DetailChip>
          </>
        }
      />

      <DetailCard className="p-5 sm:p-6">
        <div className="text-[12px] font-semibold text-ios-sub">Recovery Notes</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">현재 유지 범위</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <DetailChip color={DETAIL_ACCENTS.mint}>허브 카드 2개</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>상세 화면 골격</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>이동 동선</DetailChip>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ios-sub">
          회복 허브는 계속 열리지만, 내부 데이터는 더 이상 생성하거나 저장하지 않습니다. 인사이트 메인 통계와 에너지 도둑 화면은 그대로 유지됩니다.
        </p>
      </DetailCard>
    </InsightDetailShell>
  );
}
