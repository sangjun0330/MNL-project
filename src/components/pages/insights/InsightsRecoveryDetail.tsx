"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import {
  RecoveryAIOverviewLinkCard,
  RecoveryOrdersLinkCard,
} from "@/components/insights/RecoveryPlannerFlowCards";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { useAIRecoveryPlanner } from "@/components/insights/useAIRecoveryPlanner";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { buildExplanationModule, buildFallbackModules } from "@/lib/aiRecoveryPlanner";
import { formatKoreanDate } from "@/lib/date";
import { withReturnTo } from "@/lib/navigation";
import { buildRecoveryOrderProgressId } from "@/lib/recoveryPhases";
import {
  clearStaleRecoveryOrderDone,
  readRecoveryOrderDone,
  readRemoteRecoveryOrderDone,
  writeRecoveryOrderDone,
} from "@/lib/recoveryOrderChecklist";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();
  const aiRecovery = useAIRecoveryInsights({
    mode: "cache",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
    phase: "start",
  });
  const aiRecoveryAfter = useAIRecoveryInsights({
    mode: "cache",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
    phase: "after_work",
  });
  const aiPlanner = useAIRecoveryPlanner({
    mode: "cache",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
    phase: "start",
  });
  const aiPlannerAfter = useAIRecoveryPlanner({
    mode: "cache",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
    phase: "after_work",
  });
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const plannerDateISO = aiPlannerAfter.data?.dateISO ?? aiPlanner.data?.dateISO ?? end;

  useEffect(() => {
    let active = true;
    const activeIds = [
      ...(aiPlanner.data?.result.orders.items.map((item) => buildRecoveryOrderProgressId("start", item.id)) ?? []),
      ...(aiPlannerAfter.data?.result.orders.items.map((item) => buildRecoveryOrderProgressId("after_work", item.id)) ?? []),
    ];
    if (activeIds.length) {
      clearStaleRecoveryOrderDone(plannerDateISO, activeIds);
    }
    const localDone = readRecoveryOrderDone(plannerDateISO);
    setDoneMap(localDone);
    if (!activeIds.length) {
      return () => {
        active = false;
      };
    }
    void (async () => {
      const remoteDone = await readRemoteRecoveryOrderDone(plannerDateISO);
      if (!active) return;
      const keep = new Set(activeIds);
      const merged: Record<string, boolean> = {};
      for (const [id, done] of Object.entries({ ...remoteDone, ...localDone })) {
        if (done && keep.has(id)) merged[id] = true;
      }
      setDoneMap(merged);
      writeRecoveryOrderDone(plannerDateISO, merged);
    })();
    return () => {
      active = false;
    };
  }, [aiPlanner.data, aiPlannerAfter.data, plannerDateISO]);

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

  const fallbackModules = buildFallbackModules({
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

  const explanationModule = aiPlannerAfter.data?.result.explanation
    ? aiPlannerAfter.data.result.explanation
    : aiPlanner.data?.result.explanation
      ? aiPlanner.data.result.explanation
      : aiRecoveryAfter.data
        ? buildExplanationModule(aiRecoveryAfter.data.result, aiRecoveryAfter.data.language)
        : aiRecovery.data
          ? buildExplanationModule(aiRecovery.data.result, aiRecovery.data.language)
      : {
        title: "AI 맞춤회복",
        eyebrow: "AI Recovery",
        headline: planner.focusFactor ? `${planner.focusFactor.label} 중심 회복` : planner.primaryAction ?? "오늘 회복 우선순위를 확인해 보세요.",
        summary: "오늘 회복이 어디에 집중되어야 하는지, 왜 그게 중요한지 AI 기준으로 정리합니다.",
        recovery: {
          headline: planner.primaryAction ?? "오늘 회복 우선순위를 확인해 보세요.",
          compoundAlert: null,
          sections: [],
          weeklySummary: null,
        },
      };

  const ordersModule = aiPlannerAfter.data?.result.orders ?? aiPlanner.data?.result.orders ?? fallbackModules.orders;

  const startOrders = aiPlanner.data?.result.orders.items ?? [];
  const afterOrders = aiPlannerAfter.data?.result.orders.items ?? [];
  const plannerReady = Boolean(aiPlanner.data || aiPlannerAfter.data);
  const activeOrders = plannerReady
    ? [
        ...startOrders.filter((item) => !doneMap[buildRecoveryOrderProgressId("start", item.id)]),
        ...afterOrders.filter((item) => !doneMap[buildRecoveryOrderProgressId("after_work", item.id)]),
      ]
    : [];
  const completedCount = plannerReady ? startOrders.length + afterOrders.length - activeOrders.length : 0;
  const recoveryReady = Boolean(aiPlannerAfter.data?.result.explanation || aiPlanner.data?.result.explanation || aiRecoveryAfter.data || aiRecovery.data);
  const personalizationHref = withReturnTo("/settings/personalization", "/insights/recovery");

  return (
    <InsightDetailShell
      title="회복 플래너"
      subtitle={formatKoreanDate(end)}
      meta="AI 맞춤회복과 오늘의 오더를 한 흐름으로 보고, 바로 실행까지 이어가세요."
      right={
        <Link
          href={personalizationHref}
          className="inline-flex h-9 items-center justify-center rounded-full border border-[#DCE6FF] bg-white px-3 text-[11px] font-semibold text-[#315CA8] shadow-apple-sm"
        >
          개인화
        </Link>
      }
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      {!planner.aiAvailable && !planner.billingLoading ? (
        <>
          <RecoveryAIOverviewLinkCard
            href="/insights/recovery/ai"
            module={explanationModule}
            focusLabel={planner.focusFactor?.label ?? null}
            ready={recoveryReady}
          />
          <RecoveryOrdersLinkCard
            href="/insights/recovery/orders"
            module={ordersModule}
            ready={plannerReady}
            activeCount={plannerReady ? activeOrders.length : null}
            completedCount={plannerReady ? completedCount : null}
          />
          <RecoveryPlannerUpgradeCard
            title="AI 맞춤회복과 오늘의 오더 전체는 Plus 이상 플랜에서 열립니다."
            description="AI가 왜 이 회복을 먼저 봐야 하는지 설명하고, 바로 체크할 수 있는 오늘의 오더까지 함께 제공합니다."
            returnTo="/insights/recovery"
          />
        </>
      ) : (
        <>
          <RecoveryAIOverviewLinkCard
            href="/insights/recovery/ai"
            module={explanationModule}
            focusLabel={planner.focusFactor?.label ?? null}
            ready={recoveryReady}
          />
          <RecoveryOrdersLinkCard
            href="/insights/recovery/orders"
            module={ordersModule}
            ready={plannerReady}
            activeCount={plannerReady ? activeOrders.length : null}
            completedCount={plannerReady ? completedCount : null}
          />
        </>
      )}
    </InsightDetailShell>
  );
}
