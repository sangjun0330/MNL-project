"use client";

import { useMemo } from "react";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { useRecoveryPlanData } from "@/components/insights/RecoveryPrescription";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import {
  buildPlannerContext,
  buildPlannerTimelinePreview,
  formatRelativeDutyKorean,
  normalizeProfileSettings,
  type PlannerContext,
  type PlannerTimelinePreview,
  type RecoveryPlannerState,
} from "@/lib/recoveryPlanner";

export type RecoveryPlannerViewModel = {
  state: RecoveryPlannerState;
  tone: PlannerContext["plannerTone"];
  todayShift: ReturnType<typeof useInsightsData>["todayShift"];
  nextDuty: PlannerContext["nextDuty"];
  nextDutyDate: PlannerContext["nextDutyDate"];
  nextDutyLabel: string;
  focusFactor: PlannerContext["focusFactor"];
  primaryAction: string | null;
  avoidAction: string | null;
  ordersTop3: PlannerContext["ordersTop3"];
  timelinePreview: PlannerTimelinePreview[];
  aiAvailable: boolean;
  fullAccess: boolean;
  billingLoading: boolean;
  recordedDays: number;
  minRecordedDays: number;
  syncLabel: string;
};

export function useRecoveryPlanner(): RecoveryPlannerViewModel {
  const insights = useInsightsData();
  const billing = useBillingAccess();
  const planData = useRecoveryPlanData(insights.state, insights.end);
  const profile = useMemo(
    () => normalizeProfileSettings(insights.state.settings?.profile),
    [insights.state.settings?.profile]
  );

  const plannerContext = useMemo(
    () =>
      buildPlannerContext({
        pivotISO: insights.end,
        schedule: insights.state.schedule,
        todayVital: insights.todayVital,
        factorVitals: insights.vitalsRecorded.length ? insights.vitalsRecorded : insights.todayVital ? [insights.todayVital] : [],
        profile,
      }),
    [insights.end, insights.state.schedule, insights.todayVital, insights.vitalsRecorded, profile]
  );

  const timelinePreview = useMemo(
    () => buildPlannerTimelinePreview(insights.todayShift, insights.todayVital, profile),
    [insights.todayShift, insights.todayVital, profile]
  );

  const fallbackOrders = useMemo(
    () =>
      planData.orderOneLiners.slice(0, 3).map((item) => ({
        rank: item.rank,
        title: item.title,
        text: item.line.text,
      })),
    [planData.orderOneLiners]
  );

  const focusFactor = plannerContext.focusFactor ?? (planData.top3[0] ?? null);
  const fullAccess = billing.hasEntitlement("recoveryPlannerFull");
  const aiAvailable = billing.hasEntitlement("recoveryPlannerAI");
  const state = isInsightsLocked(insights.recordedDays) ? "needs_records" : fullAccess ? "full" : "preview";

  return {
    state,
    tone: plannerContext.plannerTone,
    todayShift: insights.todayShift,
    nextDuty: plannerContext.nextDuty,
    nextDutyDate: plannerContext.nextDutyDate,
    nextDutyLabel: formatRelativeDutyKorean(plannerContext.nextDutyDate, insights.end),
    focusFactor,
    primaryAction: plannerContext.primaryAction ?? fallbackOrders[0]?.text ?? null,
    avoidAction: plannerContext.avoidAction,
    ordersTop3: plannerContext.ordersTop3.length ? plannerContext.ordersTop3 : fallbackOrders,
    timelinePreview,
    aiAvailable,
    fullAccess,
    billingLoading: billing.loading,
    recordedDays: insights.recordedDays,
    minRecordedDays: INSIGHTS_MIN_DAYS,
    syncLabel: insights.syncLabel,
  };
}
