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
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { buildExplanationModule, buildFallbackModules } from "@/lib/aiRecoveryPlanner";
import { formatKoreanDate } from "@/lib/date";
import {
  caffeineSensitivityPresetFromValue,
  caffeineSensitivityPresetLabel,
  chronotypePresetFromValue,
  chronotypePresetLabel,
  normalizeProfileSettings,
} from "@/lib/recoveryPlanner";
import { clearStaleRecoveryOrderDone, readRecoveryOrderDone } from "@/lib/recoveryOrderChecklist";
import { useAppStoreSelector } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();
  const aiRecovery = useAIRecoveryInsights({
    mode: "cache",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
  });
  const aiPlanner = useAIRecoveryPlanner({
    mode: "cache",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
  });
  const profile = useAppStoreSelector((s) => normalizeProfileSettings(s.settings.profile));
  const profileSummary = `${chronotypePresetLabel(chronotypePresetFromValue(profile.chronotype))} · ${t("카페인")} ${caffeineSensitivityPresetLabel(
    caffeineSensitivityPresetFromValue(profile.caffeineSensitivity)
  )}`;
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const plannerDateISO = aiPlanner.data?.dateISO ?? end;

  useEffect(() => {
    if (aiPlanner.data?.result.orders.items?.length) {
      clearStaleRecoveryOrderDone(
        plannerDateISO,
        aiPlanner.data.result.orders.items.map((item) => item.id)
      );
    }
    setDoneMap(readRecoveryOrderDone(plannerDateISO));
  }, [aiPlanner.data, plannerDateISO]);

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

  const explanationModule = aiPlanner.data?.result.explanation
    ? aiPlanner.data.result.explanation
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

  const ordersModule = aiPlanner.data?.result.orders ?? fallbackModules.orders;

  const plannerReady = Boolean(aiPlanner.data);
  const activeOrders = plannerReady ? ordersModule.items.filter((item) => !doneMap[item.id]) : [];
  const completedCount = plannerReady ? ordersModule.items.length - activeOrders.length : 0;
  const recoveryReady = Boolean(aiPlanner.data?.result.explanation || aiRecovery.data);

  return (
    <InsightDetailShell
      title="회복 플래너"
      subtitle={formatKoreanDate(end)}
      meta="AI 맞춤회복과 오늘의 오더를 한 흐름으로 보고, 바로 실행까지 이어가세요."
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      <Link
        href="/settings/personalization"
        className="flex items-center justify-between rounded-apple border border-ios-sep bg-white px-4 py-4 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
      >
        <div>
          <div className="text-[12px] font-semibold text-ios-sub">Personalization</div>
          <div className="mt-1 text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("개인화로 AI 정밀도 높이기")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("현재 설정 · {summary}", { summary: profileSummary })}</div>
        </div>
        <div className="text-[22px] text-ios-muted">›</div>
      </Link>

      {planner.aiAvailable && (aiRecovery.loading || aiPlanner.loading) ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[12px] font-semibold text-ios-sub">AI Sync</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">저장된 AI 맞춤회복과 오늘의 오더를 확인하고 있어요.</div>
        </DetailCard>
      ) : null}

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
            title="AI 맞춤회복과 오늘의 오더 전체는 Pro에서 열립니다."
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
