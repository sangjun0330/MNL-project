"use client";

import Link from "next/link";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import {
  AIPlannerModuleLinkCard,
  AIPlannerTimelineLinkCard,
} from "@/components/insights/AIRecoveryPlannerCards";
import { useAIRecoveryPlanner } from "@/components/insights/useAIRecoveryPlanner";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { InsightDetailShell, DetailCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { buildFallbackModules } from "@/lib/aiRecoveryPlanner";
import { formatKoreanDate } from "@/lib/date";
import {
  caffeineSensitivityPresetFromValue,
  caffeineSensitivityPresetLabel,
  chronotypePresetFromValue,
  chronotypePresetLabel,
  normalizeProfileSettings,
} from "@/lib/recoveryPlanner";
import { useAppStoreSelector } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

export function InsightsRecoveryDetail() {
  const { t } = useI18n();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();
  const aiPlanner = useAIRecoveryPlanner({
    mode: "generate",
    enabled: !isInsightsLocked(recordedDays) && planner.aiAvailable,
    autoGenerate: false,
  });
  const profile = useAppStoreSelector((s) => normalizeProfileSettings(s.settings.profile));
  const profileSummary = `${chronotypePresetLabel(chronotypePresetFromValue(profile.chronotype))} · ${t("카페인")} ${caffeineSensitivityPresetLabel(
    caffeineSensitivityPresetFromValue(profile.caffeineSensitivity)
  )}`;

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
  const plannerModules = aiPlanner.data?.result ?? {
    ...fallbackModules,
    explanation: {
      eyebrow: "AI Recovery Brief",
      title: "AI 회복 해설",
      headline: planner.focusFactor ? `${planner.focusFactor.label} 중심 해설` : "회복 우선순위 해설",
      summary: "회복 포커스와 오더 우선순위를 AI가 맥락 중심으로 설명합니다.",
      recovery: {
        headline: planner.primaryAction ?? "오늘 회복 우선순위를 확인해 보세요.",
        compoundAlert: null,
        sections: [],
        weeklySummary: null,
      },
    },
  };

  const right = planner.aiAvailable ? (
    <button
      type="button"
      onClick={aiPlanner.startGenerate}
      disabled={aiPlanner.generating}
      className="inline-flex h-9 items-center justify-center rounded-full border border-[#CFE0FF] bg-[#EDF4FF] px-3 text-[12px] font-semibold text-[#0F4FCB] disabled:opacity-60"
    >
      {aiPlanner.generating ? "생성 중..." : "오늘의 플래너 생성하기"}
    </button>
  ) : null;

  return (
    <InsightDetailShell
      title="회복 플래너"
      subtitle={formatKoreanDate(end)}
      meta="다음 근무 전까지 무엇을 먼저 해야 하는지 AI가 한 흐름으로 정리합니다."
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {planner.nextDuty ? <DetailChip color={DETAIL_ACCENTS.mint}>다음 {shiftKo(planner.nextDuty)}</DetailChip> : null}
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
      right={right}
    >
      <Link
        href="/settings/personalization"
        className="flex items-center justify-between rounded-apple border border-ios-sep bg-white px-4 py-4 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
      >
        <div>
          <div className="text-[12px] font-semibold text-ios-sub">Personalization</div>
          <div className="mt-1 text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("개인화로 플래너 정밀도 높이기")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("현재 설정 · {summary}", { summary: profileSummary })}</div>
        </div>
        <div className="text-[22px] text-ios-muted">›</div>
      </Link>

      {planner.aiAvailable && aiPlanner.error ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">AI 플래너 생성에 실패했어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">기존 플래너 미리보기는 계속 사용할 수 있어요. 다시 생성하면 최신 AI 내용으로 갱신됩니다.</p>
          <button
            type="button"
            onClick={() => {
              aiPlanner.retry();
              aiPlanner.startGenerate();
            }}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
          >
            다시 생성
          </button>
        </DetailCard>
      ) : null}

      {planner.aiAvailable && aiPlanner.generating ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[12px] font-semibold text-ios-sub">AI Planner</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오늘의 플래너를 생성하고 있어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">회복 처방, AI 회복 해설, 오늘 오더, 타임라인을 한 번에 새로 정리하고 있습니다.</p>
        </DetailCard>
      ) : null}

      {!planner.aiAvailable && !planner.billingLoading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">AI 플래너 생성은 Pro에서 사용할 수 있어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">지금은 기본 미리보기로 회복 방향을 확인하고, Pro에서는 각 카테고리의 AI 버전을 모두 볼 수 있어요.</p>
        </DetailCard>
      ) : null}

      <AIPlannerModuleLinkCard href="/insights/recovery/plan" accent="mint" module={plannerModules.prescription} itemPreviewCount={2} />
      <AIPlannerModuleLinkCard href="/insights/recovery/ai" accent="rose" module={plannerModules.explanation} itemPreviewCount={0} />
      <AIPlannerModuleLinkCard href="/insights/recovery/orders" accent="navy" module={plannerModules.orders} itemPreviewCount={2} />
      <AIPlannerTimelineLinkCard href="/insights/recovery/timeline" accent="navy" module={plannerModules.timeline} itemPreviewCount={2} />
    </InsightDetailShell>
  );
}
