"use client";

import Link from "next/link";
import {
  InsightDetailShell,
  DetailSummaryCard,
  DetailChip,
  DETAIL_ACCENTS,
  DETAIL_GRADIENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useI18n } from "@/lib/useI18n";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsRecoveryDetail() {
  const { t } = useI18n();
  const { end, top3, syncLabel, todayShift, ordersSummary, hasTodayShift, recordedDays } = useInsightsData();
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

  const recoverySummary = planner.focusFactor
    ? `회복 포커스 · ${planner.focusFactor.label}`
    : "회복 포커스 · 오늘의 회복 우선순위";
  const recoveryDetail = planner.primaryAction
    ? `지금 할 1개 · ${planner.primaryAction}`
    : "기록이 쌓이면 회복 플랜이 더 정교해져요.";

  return (
    <InsightDetailShell
      title="회복 플래너"
      subtitle={formatKoreanDate(end)}
      meta="다음 근무 전까지 무엇을 먼저 해야 하는지 한 흐름으로 정리합니다."
    >
      <div className="space-y-4">
        <DetailSummaryCard
          accent="mint"
          label="Recovery Planner"
          title="오늘의 회복 플래너"
          metric={planner.focusFactor ? pct(planner.focusFactor.pct) : "—"}
          metricLabel={planner.focusFactor ? planner.focusFactor.label : "핵심 요인"}
          summary={recoverySummary}
          detail={recoveryDetail}
          chips={(
            <>
              <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
              {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
              <DetailChip color={DETAIL_ACCENTS.mint}>{syncLabel}</DetailChip>
            </>
          )}
        />

        <Link
          href="/insights/recovery/plan"
          className="group block rounded-apple border border-ios-sep p-5 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
          style={{ backgroundImage: DETAIL_GRADIENTS.mint }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">Recovery Strategy</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">회복 처방</div>
            </div>
            <div className="text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <div className="text-[36px] font-extrabold tracking-[-0.02em]" style={{ color: DETAIL_ACCENTS.mint }}>
              {planner.focusFactor ? pct(planner.focusFactor.pct) : "—"}
            </div>
            <div className="pb-1 text-[14px] font-bold text-ios-text">{planner.focusFactor ? planner.focusFactor.label : "핵심 요인"}</div>
          </div>
          <div className="mt-2 text-[14px] text-ios-text">
            <span className="font-bold" style={{ color: DETAIL_ACCENTS.mint }}>
              {recoverySummary}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-ios-sub">다음 근무 전까지 회복 목표와 피해야 할 포인트를 먼저 정리합니다.</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
            {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.mint}>{shiftKo(todayShift)}</DetailChip> : null}
            {!planner.fullAccess && !planner.billingLoading ? (
              <DetailChip color={DETAIL_ACCENTS.mint}>전체는 Pro</DetailChip>
            ) : null}
          </div>
        </Link>

        <Link
          href="/insights/recovery/orders"
          className="group block rounded-apple border border-ios-sep p-5 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
          style={{ backgroundImage: DETAIL_GRADIENTS.navy }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">Dr. RNEST&apos;s Orders</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">오늘 오더</div>
            </div>
            <div className="text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <div className="text-[36px] font-extrabold tracking-[-0.02em]" style={{ color: DETAIL_ACCENTS.navy }}>
              {ordersSummary.count}
            </div>
            <div className="pb-1 text-[14px] font-bold text-ios-text">Orders</div>
          </div>
          <div className="mt-2 text-[14px] text-ios-text">
            <span className="font-bold" style={{ color: DETAIL_ACCENTS.navy }}>
              즉시 실행 오더 · {planner.ordersTop3[0]?.text ?? ordersSummary.headline}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-ios-sub">작은 오더부터 실행하면 회복 효율이 올라갑니다.</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {planner.ordersTop3.slice(0, 3).map((item) => (
              <DetailChip key={`${item.rank}-${item.title}`} color={DETAIL_ACCENTS.navy}>
                오더 {item.rank} · {item.title}
              </DetailChip>
            ))}
            {!planner.fullAccess && !planner.billingLoading ? (
              <DetailChip color={DETAIL_ACCENTS.navy}>전체는 Pro</DetailChip>
            ) : null}
          </div>
        </Link>

        <Link
          href="/insights/recovery/timeline"
          className="group block rounded-apple border border-ios-sep p-5 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
          style={{ backgroundImage: DETAIL_GRADIENTS.navy }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">Timeline Forecast</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">타임라인</div>
            </div>
            <div className="text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
          </div>
          <div className="mt-4 text-[14px] text-ios-text">
            <span className="font-bold" style={{ color: DETAIL_ACCENTS.navy }}>
              {planner.timelinePreview[0]?.phase ?? "회복 흐름"} · {planner.timelinePreview[0]?.text ?? "시간대별 회복 흐름을 정리합니다."}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-ios-sub">출근 전, 근무 중, 퇴근 후에 무엇을 해야 하는지 시간순으로 보여줍니다.</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {planner.timelinePreview.map((item) => (
              <DetailChip key={item.phase} color={DETAIL_ACCENTS.navy}>
                {item.phase}
              </DetailChip>
            ))}
            {!planner.fullAccess && !planner.billingLoading ? (
              <DetailChip color={DETAIL_ACCENTS.navy}>전체는 Pro</DetailChip>
            ) : null}
          </div>
        </Link>

        <Link
          href="/insights/recovery/ai"
          className="group block rounded-apple border border-ios-sep p-5 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
          style={{ backgroundImage: DETAIL_GRADIENTS.mint }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">AI Recovery Brief</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">AI 회복 해설</div>
            </div>
            <div className="text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
          </div>
          <div className="mt-4 text-[14px] text-ios-text">
            <span className="font-bold" style={{ color: DETAIL_ACCENTS.mint }}>
              왜 이런 우선순위가 잡혔는지 AI가 풀어 설명합니다.
            </span>
          </div>
          <div className="mt-1 text-[13px] text-ios-sub">회복 포커스, 오늘 오더, 주간 흐름을 맥락 중심으로 정리합니다.</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {top3?.map((item) => (
              <DetailChip key={item.key} color={DETAIL_ACCENTS.mint}>
                TOP · {item.label} {pct(item.pct)}
              </DetailChip>
            ))}
            {!planner.aiAvailable && !planner.billingLoading ? (
              <DetailChip color={DETAIL_ACCENTS.mint}>Pro</DetailChip>
            ) : null}
          </div>
        </Link>
      </div>
    </InsightDetailShell>
  );
}
