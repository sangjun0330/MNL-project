"use client";

import Link from "next/link";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { formatKoreanDate } from "@/lib/date";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";

function SkeletonChecklistCard({ order, title, body }: { order: string; title: string; body: string }) {
  return (
    <DetailCard
      className="overflow-hidden px-5 py-5 sm:px-6"
      style={{
        background:
          "radial-gradient(circle at top right, rgba(173,196,255,0.14), transparent 30%), linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 36px rgba(15,36,74,0.05)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1B2747] bg-white text-[13px] font-bold text-[#1B2747]">
          ✓
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DetailChip color={DETAIL_ACCENTS.navy}>{order}</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.mint}>정적 카드</DetailChip>
          </div>
          <div className="mt-3 break-keep text-[18px] font-bold leading-[1.55] tracking-[-0.03em] text-ios-text">{title}</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{body}</p>
        </div>
      </div>
    </DetailCard>
  );
}

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="오늘의 오더"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 오늘의 오더가 열립니다.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="오늘의 오더"
      subtitle={formatKoreanDate(end)}
      meta="체크리스트 화면 구조만 유지하는 정적 페이지입니다."
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">TODAY ORDERS</div>
        <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">오더 체크리스트 UI 뼈대</div>
        <p className="mt-2 text-[13px] leading-6 text-ios-sub">
          오더 개수 선택, 단계 탭, 체크리스트 카드 위치만 남겨 두었습니다. 생성·완료 저장·원격 동기화 시스템은 제거했습니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((count) => (
            <DetailChip key={count} color={count === 3 ? DETAIL_ACCENTS.mint : undefined}>
              {count}개
            </DetailChip>
          ))}
        </div>
      </DetailCard>

      <DetailCard className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <DetailChip color={DETAIL_ACCENTS.navy}>아침 오더</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>퇴근 후 오더</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.mint}>Checklist skeleton</DetailChip>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ios-sub">
          단계 전환 탭과 체크리스트 카드 간격을 유지하기 위해 정적 예시 카드만 배치했습니다.
        </p>
      </DetailCard>

      <div className="grid gap-3">
        <SkeletonChecklistCard
          order="오더 1"
          title="아침 오더 카드 자리"
          body="첫 번째 체크리스트 카드가 들어오던 위치를 유지하고 있습니다."
        />
        <SkeletonChecklistCard
          order="오더 2"
          title="퇴근 후 오더 카드 자리"
          body="저녁 단계 체크리스트 카드가 이어지던 구조만 남겨 두었습니다."
        />
      </div>

      <DetailCard className="p-5 sm:p-6">
        <div className="text-[12px] font-semibold text-ios-sub">Back Link</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">맞춤회복 화면으로 이동</div>
        <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
          허브와 상세 화면 사이의 이동 동선은 유지됩니다.
        </p>
        <Link
          href="/insights/recovery/ai"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-[#DCE6FF] bg-white px-5 text-[13px] font-semibold text-[#315CA8] shadow-apple-sm"
        >
          AI 맞춤회복 보기
        </Link>
      </DetailCard>
    </InsightDetailShell>
  );
}
