"use client";

import Link from "next/link";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

function SkeletonLine({ width }: { width: string }) {
  return <div className="h-3 rounded-full bg-[#E9EEF6]" style={{ width }} />;
}

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel } = useInsightsData();
  const planner = useRecoveryPlanner();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title={t("AI 맞춤회복")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 회복 플래너가 열립니다.")}
        tone="navy"
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title={t("AI 맞춤회복")}
      subtitle={formatKoreanDate(end)}
      meta="분석 엔진 없이 화면 구조만 유지하는 정적 페이지입니다."
      tone="navy"
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.navy}>UI skeleton</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[#1B2747]">AI CUSTOMIZED RECOVERY</div>
        <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{t("AI 맞춤회복")}</div>
        <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">
          해설 카드, 섹션 분기, 주간 메모 영역 배치만 유지 중입니다.
        </p>
        <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">
          생성 버튼, AI 응답 처리, 번역, 캐시, 오더 연결 시스템은 제거했고 현재는 화면 구조 확인만 가능합니다.
        </p>
      </DetailCard>

      <DetailCard className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-ios-sub">Recovery Layout</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">해설 카드 뼈대</div>
          </div>
          <DetailChip color={DETAIL_ACCENTS.mint}>Static</DetailChip>
        </div>
        <div className="mt-4 rounded-[22px] border border-ios-sep bg-[#FAFBFD] p-4">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#315CA8]">HEADLINE</div>
          <div className="mt-3 space-y-2">
            <SkeletonLine width="84%" />
            <SkeletonLine width="68%" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <DetailChip color={DETAIL_ACCENTS.navy}>섹션 카드</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.navy}>주간 메모</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.navy}>상세 문장 영역</DetailChip>
          </div>
        </div>
      </DetailCard>

      <DetailCard className="p-5 sm:p-6">
        <div className="text-[12px] font-semibold text-ios-sub">Sections</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">카테고리 카드 자리</div>
        <div className="mt-4 grid gap-3">
          {["회복 포커스", "주의 신호", "주간 요약"].map((label) => (
            <div key={label} className="rounded-[20px] border border-ios-sep bg-white p-4 shadow-apple-sm">
              <div className="text-[12px] font-semibold text-ios-sub">{label}</div>
              <div className="mt-3 space-y-2">
                <SkeletonLine width="72%" />
                <SkeletonLine width="92%" />
                <SkeletonLine width="63%" />
              </div>
            </div>
          ))}
        </div>
      </DetailCard>

      <DetailCard className="p-5 sm:p-6">
        <div className="text-[12px] font-semibold text-ios-sub">Next</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오더 화면 구조 보기</div>
        <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
          회복 해설 페이지 다음에는 오더 체크리스트 뼈대가 이어집니다. 현재는 동선만 유지됩니다.
        </p>
        <Link
          href="/insights/recovery/orders"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-[#DCE6FF] bg-white px-5 text-[13px] font-semibold text-[#315CA8] shadow-apple-sm"
        >
          오늘의 오더 보기
        </Link>
      </DetailCard>
    </InsightDetailShell>
  );
}
