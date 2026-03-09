"use client";

import { useEffect, useState } from "react";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryChecklistItemCard } from "@/components/insights/RecoveryPlannerFlowCards";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import { useAIRecoveryPlanner } from "@/components/insights/useAIRecoveryPlanner";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { buildFallbackModules } from "@/lib/aiRecoveryPlanner";
import { formatKoreanDate } from "@/lib/date";
import {
  clearStaleRecoveryOrderDone,
  markRecoveryOrderDone,
  readRecoveryOrderDone,
} from "@/lib/recoveryOrderChecklist";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();
  const aiPlanner = useAIRecoveryPlanner({
    mode: "generate",
    enabled: planner.aiAvailable && !isInsightsLocked(recordedDays),
    autoGenerate: true,
  });
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDoneMap(readRecoveryOrderDone(end));
  }, [end]);

  const fallback = buildFallbackModules({
    language: "ko",
    plannerContext: {
      focusFactor: planner.focusFactor,
      primaryAction: planner.primaryAction,
      avoidAction: planner.avoidAction,
      nextDuty: planner.nextDuty,
      nextDutyDate: planner.nextDutyDate,
      plannerTone: planner.tone,
      ordersTop3: planner.ordersTop3,
    },
    nextDutyLabel: planner.nextDutyLabel,
    timelinePreview: planner.timelinePreview,
  });

  const ordersModule = aiPlanner.data?.result.orders ?? fallback.orders;
  const orderIdsKey = ordersModule.items.map((item) => item.id).join("|");

  useEffect(() => {
    clearStaleRecoveryOrderDone(end, orderIdsKey ? orderIdsKey.split("|") : []);
    setDoneMap(readRecoveryOrderDone(end));
  }, [end, orderIdsKey]);

  const activeItems = ordersModule.items.filter((item) => !doneMap[item.id]);
  const completedCount = ordersModule.items.length - activeItems.length;

  const completeItem = (id: string) => {
    markRecoveryOrderDone(end, id);
    setDoneMap((current) => ({
      ...current,
      [id]: true,
    }));
  };

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
      meta="AI 맞춤회복을 오늘 바로 실행할 수 있도록 체크리스트로 정리했습니다."
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      {planner.billingLoading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘의 오더 접근 상태를 확인하고 있어요.</div>
        </DetailCard>
      ) : null}

      {!planner.aiAvailable && !planner.billingLoading ? (
        <>
          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
          >
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">TODAY ORDERS</div>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{fallback.orders.title}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">{fallback.orders.headline}</p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{fallback.orders.summary}</p>
          </DetailCard>
          <RecoveryPlannerUpgradeCard
            title="AI 오늘의 오더 전체는 Pro에서 열립니다."
            description="AI가 전체 건강기록을 보고 오늘 꼭 필요한 1~5개의 오더만 체크리스트로 정리합니다."
            returnTo="/insights/recovery/orders"
          />
        </>
      ) : null}

      {planner.aiAvailable && aiPlanner.generating && !aiPlanner.data ? (
        <DetailCard
          className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
          style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
        >
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">TODAY ORDERS</div>
          <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">AI가 오늘의 오더를 정리하고 있어요.</div>
          <p className="mt-3 break-keep text-[14px] leading-6 text-ios-sub">
            전체 건강기록과 오늘 컨디션을 함께 보고, 지금 진짜 필요한 오더만 체크리스트로 추리는 중입니다.
          </p>
        </DetailCard>
      ) : null}

      {planner.aiAvailable && aiPlanner.error ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">AI 오더 생성에 실패했어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">기본 오더는 계속 볼 수 있고, 잠시 후 다시 열면 재생성됩니다.</p>
        </DetailCard>
      ) : null}

      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
      >
        <div className="max-w-[680px]">
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">TODAY ORDERS</div>
          <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{ordersModule.title}</div>
          <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">{ordersModule.headline}</p>
          <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{ordersModule.summary}</p>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[20px] bg-ios-bg px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">남은 오더</div>
            <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{activeItems.length}개</div>
          </div>
          <div className="rounded-[20px] bg-ios-bg px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">완료</div>
            <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{completedCount}개</div>
          </div>
          <div className="rounded-[20px] bg-ios-bg px-4 py-3">
            <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">기준</div>
            <div className="mt-1 text-[14px] font-semibold leading-6 text-ios-text">{planner.focusFactor?.label ?? "오늘 회복"}</div>
          </div>
        </div>
      </DetailCard>

      {activeItems.length ? (
        <div className="space-y-3">
          {activeItems.map((item) => (
            <RecoveryChecklistItemCard key={item.id} item={item} onComplete={completeItem} />
          ))}
        </div>
      ) : (
        <DetailCard className="px-5 py-6 sm:px-6">
          <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">오늘의 오더를 모두 완료했어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">남은 목록은 비워 두고, 필요하면 AI 맞춤회복에서 전체 맥락을 다시 확인하세요.</p>
        </DetailCard>
      )}
    </InsightDetailShell>
  );
}
