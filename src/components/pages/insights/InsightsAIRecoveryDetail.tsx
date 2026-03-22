"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DetailCard, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import {
  RecoveryHeroFact,
  RecoveryOrderCountSelector,
  RecoveryPhaseTabs,
  RecoveryStageHeroCard,
} from "@/components/insights/RecoveryPlannerFlowCards";
import { useAIRecoveryPlanner } from "@/components/insights/useAIRecoveryPlanner";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { TodaySleepRequiredSheet } from "@/components/insights/TodaySleepRequiredSheet";
import type { AIRecoveryPlannerPayload } from "@/lib/aiRecoveryPlanner";
import { addDays, formatKoreanDate, fromISODate, toISODate, todayISO } from "@/lib/date";
import { hasHealthInput } from "@/lib/healthRecords";
import { sanitizeInternalPath, withReturnTo } from "@/lib/navigation";
import {
  buildAfterWorkMissingLabels,
  buildRecoveryOrderProgressId,
  getAfterWorkReadiness,
  normalizeRecoveryPhase,
  recoveryPhaseDescription,
  recoveryPhaseEyebrow,
  recoveryPhaseTitle,
  type RecoveryPhase,
} from "@/lib/recoveryPhases";
import {
  clearStaleRecoveryOrderDone,
  readRecoveryOrderDone,
  readRemoteRecoveryOrderDone,
  writeRecoveryOrderDone,
} from "@/lib/recoveryOrderChecklist";
import { useI18n } from "@/lib/useI18n";
import type { RecoverySection } from "@/lib/aiRecovery";
import { normalizeRecoveryCopy } from "@/lib/recoveryCopy";

function severityLabel(severity: "info" | "caution" | "warning", t: (key: string) => string) {
  if (severity === "warning") return t("경고");
  if (severity === "caution") return t("주의");
  return t("안내");
}

function presentError(error: string, t: (key: string) => string) {
  if (error.includes("openai_empty_text")) {
    return [
      t("AI 응답이 비어 있어 결과를 만들지 못했어요."),
      t("다시 생성 버튼을 눌러 새 응답을 불러와 주세요."),
    ];
  }
  if (error.includes("openai_recovery_non_json") || error.includes("openai_recovery_invalid_shape")) {
    return [
      t("AI 응답 형식이 올바르지 않아 결과를 만들지 못했어요."),
      t("다시 생성 버튼으로 새 응답을 다시 요청해 주세요."),
    ];
  }
  if (error.includes("unsupported_country_region_territory")) {
    return [
      t("OpenAI 요청이 지역 정책으로 거절됐어요."),
      t("네트워크(와이파이/모바일) 경로를 바꿔 다시 시도해 주세요."),
    ];
  }
  if (error.includes("openai_timeout")) {
    return [t("AI 응답 시간이 길어졌어요."), t("잠시 후 다시 시도해 주세요.")];
  }
  return [t("AI 호출에 실패했어요. 잠시 후 다시 시도해 주세요.")];
}

function findSectionStart(text: string, label: "A" | "B" | "C" | "D") {
  const patterns = [new RegExp(`(?:^|\\n)\\s*\\[${label}\\]`, "i"), new RegExp(`(?:^|\\n)\\s*${label}\\s*[).:\\-]`, "i")];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match.index + (match[0].startsWith("\n") ? 1 : 0);
  }
  return -1;
}

function extractCSection(text: string) {
  const start = findSectionStart(text, "C");
  if (start < 0) return "";
  const tail = text.slice(start + 1);
  const dPos = findSectionStart(tail, "D");
  const endRelative = [dPos].filter((idx) => idx >= 0);
  const end = endRelative.length ? start + 1 + Math.min(...endRelative) : text.length;
  return text.slice(start, end).trim();
}

function normalizeNarrativeText(text: string, lang: "ko" | "en") {
  let out = normalizeRecoveryCopy(text);
  out = out.replace(/오늘\s*컨디션에\s*맞춘\s*보정\s*조언입니다\.?/g, "");
  out = out.replace(/오늘\s*컨디션\s*기준\s*핵심\s*조언입니다\.?/g, "");
  out = out.replace(/Tailored adjustment guidance for today'?s condition\.?/gi, "");
  out = out.replace(/planner에서\s*제안한\s*대로/gi, lang === "en" ? "as suggested in this recovery flow" : "지금 회복 흐름대로");
  out = out.replace(/planner에서\s*정한/gi, lang === "en" ? "set in this recovery flow" : "지금 정한");
  out = out.replace(/\bplannerContext\b/gi, lang === "en" ? "today's recovery focus" : "오늘 회복 기준");
  out = out.replace(/\bplanner\b/gi, lang === "en" ? "recovery flow" : "회복 흐름");

  out = out.replace(/스트레스\s*\(?\s*([0-3])\s*\)?/g, (_, raw) => {
    const n = Number(raw);
    if (n <= 0) return "스트레스가 거의 없는 편";
    if (n === 1) return "스트레스가 조금 있는 편";
    if (n === 2) return "스트레스가 꽤 있는 편";
    return "스트레스가 높은 편";
  });

  out = out.replace(/기분\s*\(?\s*([1-5])\s*\)?/g, (_, raw) => {
    const n = Number(raw);
    if (n <= 1) return "기분이 많이 가라앉은 상태";
    if (n === 2) return "기분이 다소 가라앉은 상태";
    if (n === 3) return "기분이 보통인 상태";
    if (n === 4) return "기분이 좋은 편";
    return "기분이 매우 좋은 편";
  });

  const protectedCaffeineMentions: string[] = [];
  const protectCaffeineMention = (value: string) => {
    const token = `__RECOVERY_CAF_${protectedCaffeineMentions.length}__`;
    protectedCaffeineMentions.push(value);
    return token;
  };
  const formatCaffeinePair = (cupsRaw: string, mgRaw: string) => {
    const mg = Number(mgRaw);
    const cups = Number(cupsRaw);
    const roundedMg = Number.isFinite(mg) ? Math.round(mg) : mgRaw;
    const roundedCups = Number.isFinite(cups) ? `${Math.max(0.5, Math.round(cups * 10) / 10)}` : cupsRaw;
    if (lang === "en") return `about ${roundedCups} cup(s) (${roundedMg}mg)`;
    return `커피 약 ${roundedCups}잔(${roundedMg}mg)`;
  };

  out = out.replace(
    /(?:커피\s*)?약\s*(\d+(?:\.\d+)?)\s*잔\s*\(\s*(\d+(?:\.\d+)?)\s*mg\s*\)(?:\s*\(\s*(?:커피\s*)?약\s*\d+(?:\.\d+)?\s*잔\s*\))?/gi,
    (_, cupsRaw, mgRaw) => protectCaffeineMention(formatCaffeinePair(cupsRaw, mgRaw))
  );
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*mg\s*\(\s*(?:커피\s*)?약\s*(\d+(?:\.\d+)?)\s*잔\s*\)/gi,
    (_, mgRaw, cupsRaw) => protectCaffeineMention(formatCaffeinePair(cupsRaw, mgRaw))
  );

  out = out.replace(/(\d+(?:\.\d+)?)\s*mg/gi, (_, raw) => {
    const mg = Number(raw);
    if (!Number.isFinite(mg)) return `${raw}mg`;
    const cups = Math.max(0.5, Math.round((mg / 120) * 10) / 10);
    if (lang === "en") return `about ${cups} cup(s) (${Math.round(mg)}mg)`;
    return `커피 약 ${cups}잔(${Math.round(mg)}mg)`;
  });
  out = out.replace(/__RECOVERY_CAF_(\d+)__/g, (_, indexRaw) => {
    const index = Number(indexRaw);
    return protectedCaffeineMentions[index] ?? "";
  });

  out = out.replace(/[^\S\r\n]{2,}/g, " ").trim();
  return out;
}

function formatSignedDelta(value: number) {
  if (!Number.isFinite(value)) return "±0";
  if (value === 0) return "±0";
  return value > 0 ? `+${value}` : `${value}`;
}

function looksLikeTruncatedNarrative(text: string) {
  const value = text.trim();
  if (!value) return false;
  if (/[.!?]$/.test(value)) return false;
  if (/(요|다|니다|세요|해요|돼요|이에요|예요)$/.test(value)) return false;
  if (/(는|은|이|가|을|를|와|과|도|만|에|에서|에게|로|으로|보다|및|또는|혹은|기준|대비|중심|수준|범위|전후|전후로|때문|위해)$/.test(value)) {
    return true;
  }
  return value.length >= 12;
}

function buildWeeklyFallbackText(
  weekly: { avgBattery: number; prevAvgBattery: number; topDrains: Array<{ label: string; pct: number }> },
  type: "personal" | "preview",
  lang: "ko" | "en"
) {
  const delta = weekly.avgBattery - weekly.prevAvgBattery;
  const topDrain = weekly.topDrains[0]?.label ?? "";
  if (lang === "en") {
    if (type === "personal") {
      return delta >= 0
        ? "Your weekly flow stayed relatively stable, and keeping the current recovery rhythm appears to support energy recovery."
        : "Your weekly flow was more variable than last week, so rebuilding sleep and rest rhythm first matters most.";
    }
    return topDrain
      ? `Next week, stabilizing ${topDrain.toLowerCase()} first should make your battery trend easier to protect.`
      : "Next week, locking sleep, caffeine, and rest timing first should help keep your battery more stable.";
  }

  if (type === "personal") {
    return delta >= 0
      ? "이번 주는 회복 흐름이 비교적 안정적이었고, 지금 리듬을 유지하는 것이 에너지 회복에 도움이 되는 패턴이에요."
      : "이번 주는 지난주보다 회복 변동이 있어, 수면과 휴식 리듬부터 먼저 다시 정리하는 것이 중요해요.";
  }
  return topDrain
    ? `다음 주에는 ${topDrain} 리듬부터 먼저 정리하면 배터리 흐름을 더 안정적으로 유지하는 데 도움이 돼요.`
    : "다음 주에는 수면·카페인·휴식 타이밍을 먼저 고정해 회복 흐름을 더 안정적으로 이어가 보세요.";
}

function normalizeLineBreaks(text: string) {
  return text
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\.\s+-\s+/g, ".\n- ")
    .replace(/[^\S\r\n]{2,}/g, " ")
    .trim();
}

function splitBulletLines(text: string) {
  const source = text.trim();
  if (!source) return [];
  const normalized = normalizeLineBreaks(source);
  const numbered = Array.from(
    normalized.matchAll(/(?:^|\n)\s*\d+\s*[).:\-]\s*([\s\S]*?)(?=(?:\n\s*\d+\s*[).:\-]\s*)|$)/g)
  )
    .map((match) =>
      match[1]
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  if (numbered.length) return numbered;

  const items = normalized
    .split(/\n+|\s+-\s+/)
    .map((line) => line.replace(/^\-\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (items.length > 1) return items;
  const sentenceItems = normalized
    .split(/(?<=[.!?]|다\.|요\.)\s+|\n+/)
    .map((line) => line.replace(/^\-\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return sentenceItems.length > 1 ? sentenceItems : [normalized];
}

function pickFirstMeaningfulText(values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function deriveRecoverySummaryText(
  payload: AIRecoveryPlannerPayload,
  phase: RecoveryPhase,
  lang: "ko" | "en",
  t: (key: string, vars?: Record<string, any>) => string
) {
  const recovery = payload.result.explanation.recovery;
  return pickFirstMeaningfulText([
    payload.result.explanation.summary,
    recovery.compoundAlert?.message,
    recovery.sections?.[0]?.description,
    recovery.sections?.[0]?.tips?.[0],
    recoveryPhaseDescription(phase, lang),
    t("오늘 회복 우선순위를 확인해 보세요."),
  ]);
}

function derivePrimaryActionText(
  payload: AIRecoveryPlannerPayload,
  t: (key: string, vars?: Record<string, any>) => string
) {
  const recovery = payload.result.explanation.recovery;
  return pickFirstMeaningfulText([
    payload.result.orders.items?.[0]?.body,
    recovery.sections?.[0]?.tips?.[0],
    payload.plannerContext?.primaryAction,
    t("회복 루틴을 먼저 고정해요."),
  ]);
}

function deriveAvoidActionText(
  payload: AIRecoveryPlannerPayload,
  t: (key: string, vars?: Record<string, any>) => string
) {
  const recovery = payload.result.explanation.recovery;
  const aiAvoidTip = recovery.sections
    .flatMap((section) => section.tips ?? [])
    .find((tip) => /(피하|줄이|미루|보류|쉬|중단|낮추|avoid|skip|limit|hold|pause|reduce|delay)/i.test(tip));
  const cautionDescription = recovery.sections.find((section) => section.severity !== "info")?.description;
  return pickFirstMeaningfulText([
    aiAvoidTip,
    recovery.compoundAlert?.message,
    cautionDescription,
    payload.plannerContext?.avoidAction,
    t("늦은 자극을 줄여요."),
  ]);
}

function deriveFocusLabel(
  payload: AIRecoveryPlannerPayload,
  t: (key: string, vars?: Record<string, any>) => string
) {
  const recovery = payload.result.explanation.recovery;
  return pickFirstMeaningfulText([
    recovery.sections?.[0]?.title,
    payload.plannerContext?.focusFactor?.label,
    t("오늘 회복"),
  ]);
}

function normalizeRequestedOrderCountParam(value: string | null) {
  if (value == null || String(value).trim() === "") return 3;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, parsed));
}

// 시작 회복은 근무 패턴 때문에 시간 제한을 두지 않는다.
function isWithinGenerationWindow(phase: RecoveryPhase): boolean {
  if (phase === "start") return true;
  const hour = new Date().getHours();
  if (phase === "after_work") return hour >= 15;
  return false;
}

const CATEGORIES: Array<{
  key: RecoverySection["category"];
  titleKey: string;
}> = [
  { key: "sleep", titleKey: "수면" },
  { key: "shift", titleKey: "교대근무" },
  { key: "caffeine", titleKey: "카페인" },
  { key: "menstrual", titleKey: "생리주기" },
  { key: "stress", titleKey: "스트레스 & 감정" },
  { key: "activity", titleKey: "신체 활동" },
];

const CATEGORY_THEME: Record<
  RecoverySection["category"],
  { accent: string; soft: string; softBorder: string; recSoft: string; recBorder: string }
> = {
  sleep: {
    accent: "#1B2747",
    soft: "#F5F8FF",
    softBorder: "#DCE6FF",
    recSoft: "#FAFCFF",
    recBorder: "#D9E2F4",
  },
  shift: {
    accent: "#264A88",
    soft: "#F3F7FF",
    softBorder: "#D7E2FA",
    recSoft: "#F8FAFF",
    recBorder: "#D6E0F4",
  },
  caffeine: {
    accent: "#7A4F17",
    soft: "#FFF9F1",
    softBorder: "#F3DEBF",
    recSoft: "#FFFCF7",
    recBorder: "#F0DFC9",
  },
  menstrual: {
    accent: "#7D3A6F",
    soft: "#FFF5FB",
    softBorder: "#F4D9EA",
    recSoft: "#FFFAFD",
    recBorder: "#F0D9E8",
  },
  stress: {
    accent: "#4E4B8B",
    soft: "#F6F5FF",
    softBorder: "#DDD9F7",
    recSoft: "#FBFAFF",
    recBorder: "#DED9F2",
  },
  activity: {
    accent: "#1E6A56",
    soft: "#F3FBF8",
    softBorder: "#CFEDE3",
    recSoft: "#FAFEFC",
    recBorder: "#D1E8DF",
  },
};

function RecoveryMetaPill({
  children,
  color,
  subtle = false,
}: {
  children: ReactNode;
  color?: string;
  subtle?: boolean;
}) {
  const resolvedColor = color ?? "#667085";
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
      style={{
        color: resolvedColor,
        backgroundColor: subtle ? "rgba(255,255,255,0.92)" : `${resolvedColor}12`,
        boxShadow: `inset 0 0 0 1px ${subtle ? "rgba(16,33,70,0.08)" : `${resolvedColor}22`}`,
      }}
    >
      {children}
    </span>
  );
}

function clampStyle(lines: number) {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  };
}

function RecoveryCategoryIcon({
  category,
}: {
  category: RecoverySection["category"];
}) {
  const cls = "h-[16px] w-[16px]";
  if (category === "sleep") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
        <path d="M15.7 3.8a7.6 7.6 0 1 0 4.5 13.7A8.8 8.8 0 0 1 15.7 3.8Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (category === "shift") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.5V12l3.2 1.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (category === "caffeine") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
        <path d="M6 9h8.5a2.5 2.5 0 0 1 0 5H14v1.3A2.7 2.7 0 0 1 11.3 18h-2.6A2.7 2.7 0 0 1 6 15.3V9Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M9 6.2c0-1 .8-1.2.8-2.2M12 6.2c0-1 .8-1.2.8-2.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (category === "menstrual") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
        <path d="M12 4.5c2.3 3 4.5 5.5 4.5 8.2A4.5 4.5 0 1 1 7.5 12.7C7.5 10 9.7 7.5 12 4.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
    );
  }
  if (category === "stress") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
        <path d="M9.2 8.5c0-1.9 1.3-3 2.8-3s2.8 1.1 2.8 3c0 1-.4 1.8-1 2.4-.8.8-1.7 1.3-1.8 2.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.3 18h3.4M10.8 20h2.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M5 12h1.5M17.5 12H19M7.2 6.7l1 1M15.8 7.7l1-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden="true">
      <path d="M12 5.5v6.2l4.3 2.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 8.2a5 5 0 1 0 8 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecoverySectionRow({
  meta,
  section,
  lang,
  t,
  expanded,
  onToggleExpanded,
}: {
  meta: { key: RecoverySection["category"]; titleKey: string };
  section: RecoverySection;
  lang: "ko" | "en";
  t: (key: string) => string;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const theme = CATEGORY_THEME[meta.key];
  const descriptionText = normalizeNarrativeText(section.description || "", lang);
  const tips = (section.tips ?? [])
    .map((tip) => normalizeNarrativeText(tip, lang))
    .filter(Boolean);
  const recommendationPool = [...tips];

  if (recommendationPool.length < 3) {
    const derived = splitBulletLines(descriptionText).filter(Boolean);
    for (const item of derived) {
      if (recommendationPool.includes(item)) continue;
      recommendationPool.push(item);
    }
  }

  const recommendations = recommendationPool.slice(0, 3);
  const severity = section.severity ?? "info";
  const primaryText = recommendations[0] ?? descriptionText;
  const supportingText = descriptionText && descriptionText !== primaryText ? descriptionText : recommendations[1] ?? "";
  const extraRecommendations = recommendations.filter((tip) => tip !== primaryText).slice(descriptionText && descriptionText !== primaryText ? 0 : 1);
  const visibleRecommendations = expanded ? extraRecommendations : [];
  const hasExtraContent = Boolean(supportingText || extraRecommendations.length);
  const toggleLabel = expanded ? (lang === "en" ? "Show less" : "접기") : (lang === "en" ? "More" : "더 보기");
  const titleText = normalizeRecoveryCopy(section.title || t(meta.titleKey));

  return (
    <article className="px-5 py-5 sm:px-6 sm:py-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              color: theme.accent,
              backgroundColor: `${theme.accent}12`,
              boxShadow: `inset 0 0 0 1px ${theme.accent}12`,
            }}
          >
            <RecoveryCategoryIcon category={meta.key} />
          </span>
          <h3 className="text-[18px] font-bold tracking-[-0.03em] text-ios-text sm:text-[19px]">
            {titleText}
          </h3>
          {severity !== "info" ? <RecoveryMetaPill color={theme.accent}>{severityLabel(severity, t)}</RecoveryMetaPill> : null}
          {hasExtraContent ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="ml-auto inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-white/88 px-3.5 text-[12px] font-semibold shadow-apple-sm"
              style={{ color: theme.accent }}
            >
              {toggleLabel}
            </button>
          ) : null}
        </div>

        {primaryText ? (
          <p className="mt-3 break-keep text-[16px] font-semibold leading-[1.7] tracking-[-0.025em] text-ios-text">{primaryText}</p>
        ) : null}

        {supportingText ? (
          <div className="mt-3 rounded-[18px] border border-[rgba(16,33,70,0.06)] bg-white/76 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <p className="break-keep text-[13px] leading-6 text-[#5E6C84]" style={expanded ? undefined : clampStyle(2)}>
              {supportingText}
            </p>
          </div>
        ) : null}

        {visibleRecommendations.length ? (
          <ol className="mt-4 space-y-2 border-t border-[rgba(16,33,70,0.08)] pt-4">
            {visibleRecommendations.map((tip, idx) => (
              <li
                key={`${meta.key}-${idx}`}
                className="grid grid-cols-[18px_minmax(0,1fr)] gap-3 rounded-[16px] border border-[rgba(16,33,70,0.06)] bg-white/72 px-3 py-3 text-[13px] leading-6 text-[#4E5D76]"
              >
                <span className="pt-0.5 text-[11px] font-bold" style={{ color: theme.accent }}>
                  {idx + 1}
                </span>
                <p className="break-keep">{tip}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </article>
  );
}

const RECOVERY_PROGRESS_STEPS = [
  "건강 데이터 수집 중...",
  "수면 패턴 분석 중...",
  "일주기리듬 계산 중...",
  "카페인·스트레스 지표 평가 중...",
  "맞춤 회복 정리 중...",
  "최종 결과 정리 중...",
];

function RecoveryGeneratingOverlay({
  open,
  title,
}: {
  open: boolean;
  title: string;
}) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      return;
    }
    const id = setInterval(() => {
      setStepIdx((prev) => (prev + 1 < RECOVERY_PROGRESS_STEPS.length ? prev + 1 : prev));
    }, 8000);
    return () => clearInterval(id);
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed left-0 top-0 z-[2147483000] flex h-[100dvh] w-[100vw] items-center justify-center bg-[#F2F2F7] px-5"
      style={{ position: "fixed", inset: 0 }}
    >
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[30px] border border-ios-sep bg-white px-6 py-6 shadow-[0_30px_90px_rgba(0,0,0,0.12)]">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#007AFF] to-transparent rnest-recovery-progress" />
        <div className="flex items-start gap-4">
          <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-2xl border border-black/5 bg-[#eef4ff]">
            <div className="absolute inset-0 rnest-logo-breathe rounded-2xl bg-[radial-gradient(80%_70%_at_50%_40%,rgba(0,122,255,0.22),transparent)]" />
            <Image
              src="/icons/icon-192.png"
              alt="RNest"
              width={60}
              height={60}
              className="relative h-full w-full object-cover"
              priority
            />
          </div>
          <div className="min-w-0">
            <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{title}</div>
            <p className="mt-2 text-[13px] font-semibold text-[#007AFF]">{RECOVERY_PROGRESS_STEPS[stepIdx]}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ios-sub">평균 1~2분 소요됩니다.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#007AFF] rnest-dot-pulse" />
          <span className="h-2 w-2 rounded-full bg-[#007AFF] rnest-dot-pulse [animation-delay:180ms]" />
          <span className="h-2 w-2 rounded-full bg-[#007AFF] rnest-dot-pulse [animation-delay:360ms]" />
        </div>
        <div className="mt-3 flex items-center gap-1">
          {RECOVERY_PROGRESS_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= stepIdx ? "bg-[#007AFF]" : "bg-[#007AFF]/20"}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function EnglishTranslationPendingPopup({
  open,
  title,
  message,
}: {
  open: boolean;
  title: string;
  message: string;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2147483100] flex items-start justify-center bg-[rgba(242,242,247,0.56)] px-4 pt-[max(72px,env(safe-area-inset-top)+20px)] backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] rounded-[24px] border border-[#D7DEEB] bg-white/96 p-4 shadow-[0_20px_56px_rgba(15,36,74,0.16)]">
        <div className="flex items-start gap-3">
          <div className="mt-[1px] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#C7D5F0] bg-[#EDF3FF]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#163B73] border-r-transparent" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold tracking-[-0.01em] text-ios-text">{title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ios-sub">{message}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RecoveryPhaseResultCard({
  phase,
  payload,
  t,
  expandedSections,
  onToggleExpanded,
  ordersHref,
  continuityNode,
  showWeekly = true,
}: {
  phase: RecoveryPhase;
  payload: AIRecoveryPlannerPayload;
  t: (key: string, vars?: Record<string, any>) => string;
  expandedSections: Record<string, boolean>;
  onToggleExpanded: (category: RecoverySection["category"]) => void;
  ordersHref: string;
  continuityNode?: ReactNode;
  showWeekly?: boolean;
}) {
  const lang = payload.language;
  const recoveryResult = payload.result.explanation.recovery;
  const weekly = useMemo(() => {
    const w = recoveryResult?.weeklySummary ?? null;
    if (!w) return null;
    const normalizedPersonal = normalizeNarrativeText(w.personalInsight, lang);
    const normalizedPreview = normalizeNarrativeText(w.nextWeekPreview, lang);
    return {
      ...w,
      personalInsight:
        normalizedPersonal && !looksLikeTruncatedNarrative(normalizedPersonal)
          ? normalizedPersonal
          : buildWeeklyFallbackText(w, "personal", lang),
      nextWeekPreview:
        normalizedPreview && !looksLikeTruncatedNarrative(normalizedPreview)
          ? normalizedPreview
          : buildWeeklyFallbackText(w, "preview", lang),
    };
  }, [recoveryResult?.weeklySummary, lang]);

  const sectionsByCategory = useMemo(() => {
    const map = new Map<RecoverySection["category"], RecoverySection>();
    for (const section of recoveryResult?.sections ?? []) {
      if (!map.has(section.category)) map.set(section.category, section);
    }
    return map;
  }, [recoveryResult?.sections]);

  const orderedSections = useMemo(
    () => CATEGORIES.map((meta) => ({ meta, section: sectionsByCategory.get(meta.key) ?? null })).filter((item) => item.section),
    [sectionsByCategory]
  );

  const weeklyPersonalLines = useMemo(() => {
    if (!weekly) return [];
    const fallback = splitBulletLines(buildWeeklyFallbackText(weekly, "personal", lang));
    const lines = splitBulletLines(weekly.personalInsight ?? "").filter(Boolean);
    if (!lines.length) return fallback;
    return lines.some((line) => looksLikeTruncatedNarrative(line)) ? fallback : lines;
  }, [weekly, lang]);

  const weeklyPreviewLines = useMemo(() => {
    if (!weekly) return [];
    const fallback = splitBulletLines(buildWeeklyFallbackText(weekly, "preview", lang));
    const lines = splitBulletLines(weekly.nextWeekPreview ?? "").filter(Boolean);
    if (!lines.length) return fallback;
    return lines.some((line) => looksLikeTruncatedNarrative(line)) ? fallback : lines;
  }, [weekly, lang]);

  const cFallbackText = useMemo(() => {
    const generatedText = payload.explanationGeneratedText ?? payload.generatedText;
    if (!generatedText || orderedSections.length > 0) return "";
    return normalizeNarrativeText(extractCSection(generatedText), lang);
  }, [payload.explanationGeneratedText, payload.generatedText, lang, orderedSections.length]);

  const alertLines = useMemo(() => {
    const raw = recoveryResult?.compoundAlert?.message ?? "";
    if (!raw) return [];
    return normalizeLineBreaks(normalizeNarrativeText(raw, lang))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [recoveryResult?.compoundAlert?.message, lang]);

  const phaseKeyPrefix = `${phase}:`;
  const headlineText = normalizeNarrativeText(recoveryResult?.headline || t("요약이 비어 있어요."), lang);
  const summaryText = normalizeNarrativeText(deriveRecoverySummaryText(payload, phase, lang, t), lang);
  const focusLabel = normalizeRecoveryCopy(deriveFocusLabel(payload, t));
  const primaryActionText = normalizeNarrativeText(derivePrimaryActionText(payload, t), lang);
  const avoidActionText = normalizeNarrativeText(deriveAvoidActionText(payload, t), lang);

  return (
    <>
      <RecoveryStageHeroCard
        eyebrow={recoveryPhaseEyebrow(phase, lang)}
        title={phase === "after_work" ? t("퇴근 후 회복 해설") : t("오늘 시작 회복 해설")}
        status={recoveryPhaseTitle(phase, lang)}
        headline={headlineText}
        summary={summaryText}
        action={
          <Link
            href={ordersHref}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#D5E2FA] bg-white/92 px-4 text-[12px] font-semibold text-[#17386D] shadow-[0_10px_24px_rgba(18,35,73,0.05)]"
          >
            {t("오더 보기")}
          </Link>
        }
        chips={
          <>
            <RecoveryMetaPill color="#1B2747">{focusLabel}</RecoveryMetaPill>
            <RecoveryMetaPill color="#5E6C84">{formatKoreanDate(payload.dateISO)}</RecoveryMetaPill>
            {orderedSections.length ? <RecoveryMetaPill color="#5E6C84">{t("해설 {count}개", { count: orderedSections.length })}</RecoveryMetaPill> : null}
          </>
        }
        facts={
          <>
            <RecoveryHeroFact label={t("지금 할 1개")} value={primaryActionText} />
            <RecoveryHeroFact label={t("피해야 할 것")} value={avoidActionText} />
            <RecoveryHeroFact label={t("핵심 포커스")} value={focusLabel} />
          </>
        }
      >
        {continuityNode ? continuityNode : null}

        {recoveryResult?.compoundAlert ? (
          <div className="rounded-[20px] bg-[#FFF6F7] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(232,116,133,0.12)] sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <RecoveryMetaPill color="#B2415A">{t("긴급 알림")}</RecoveryMetaPill>
              {recoveryResult.compoundAlert.factors.map((factor) => (
                <RecoveryMetaPill key={`${phaseKeyPrefix}${factor}`} color="#E87485" subtle>
                  {factor}
                </RecoveryMetaPill>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {(alertLines.length ? alertLines : [normalizeNarrativeText(recoveryResult.compoundAlert.message, lang)]).map((line, idx) => (
                <p key={`${phaseKeyPrefix}alert-${idx}`} className="break-keep text-[13px] leading-6 text-ios-text">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </RecoveryStageHeroCard>

      <div className="px-1">
        <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">
          {lang === "en" ? "SECTION NOTES" : "세부 해설"}
        </div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">
          {phase === "after_work" ? t("퇴근 후 세부 해설") : t("오늘 시작 세부 해설")}
        </div>
      </div>

      {orderedSections.length ? (
        <div className="space-y-3">
          {orderedSections.map(({ meta, section }) => {
            if (!section) return null;
            const theme = CATEGORY_THEME[meta.key];
            return (
              <DetailCard
                key={`${phaseKeyPrefix}${meta.key}-${section.title}`}
                className="overflow-hidden"
                style={{
                  background: `linear-gradient(180deg, ${theme.soft} 0%, #FFFFFF 100%)`,
                  boxShadow: `inset 0 1px 0 ${theme.softBorder}, 0 10px 28px rgba(15, 36, 74, 0.04)`,
                }}
              >
                <RecoverySectionRow
                  meta={meta}
                  section={section}
                  lang={lang}
                  t={t}
                  expanded={Boolean(expandedSections[`${phaseKeyPrefix}${meta.key}`])}
                  onToggleExpanded={() => onToggleExpanded(meta.key)}
                />
              </DetailCard>
            );
          })}
        </div>
      ) : (
        <DetailCard className="px-5 py-5 sm:px-6">
          <p className="text-[14px] leading-7 text-ios-sub">{cFallbackText || t("오늘은 추가 추천이 없어요.")}</p>
        </DetailCard>
      )}

      {showWeekly ? (
        <DetailCard
          className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
          style={{
            background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 38px rgba(15,36,74,0.04)",
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="max-w-[620px]">
              <div className="text-[12px] font-semibold tracking-[0.16em] text-ios-muted">
                {lang === "en" ? "WEEKLY NOTE" : "주간 회복 노트"}
              </div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{t("이번 주 흐름 해설")}</div>
            </div>
            {weekly ? (
              <div className="flex flex-wrap gap-2">
                <RecoveryMetaPill color="#1B2747">
                  {t("평균 배터리")} {weekly.avgBattery}
                </RecoveryMetaPill>
                {weekly.topDrains.map((drain) => (
                  <RecoveryMetaPill key={`${phaseKeyPrefix}${drain.label}-${drain.pct}`} color="#5E6C84">
                    {drain.label} {drain.pct}%
                  </RecoveryMetaPill>
                ))}
              </div>
            ) : null}
          </div>

          {weekly ? (
            <div className="mt-5 space-y-5 border-t border-ios-sep/70 pt-5">
              <div>
                <p className="text-[13px] font-semibold text-ios-muted">{t("개인 패턴")}</p>
                <ol className="mt-3 space-y-3">
                  {weeklyPersonalLines.map((line, idx) => (
                    <li key={`${phaseKeyPrefix}personal-${idx}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 text-[15px] leading-7 text-ios-text">
                      <span className="pt-0.5 text-[13px] font-bold text-[color:var(--rnest-accent)]">{idx + 1}</span>
                      <span className="break-keep">{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="border-t border-ios-sep/70 pt-5">
                <p className="text-[13px] font-semibold text-ios-muted">{t("다음 주 예측")}</p>
                <ol className="mt-3 space-y-3">
                  {weeklyPreviewLines.map((line, idx) => (
                    <li key={`${phaseKeyPrefix}preview-${idx}`} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 text-[15px] leading-7 text-ios-text">
                      <span className="pt-0.5 text-[13px] font-bold text-[color:var(--rnest-accent)]">{idx + 1}</span>
                      <span className="break-keep">{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[14px] leading-7 text-ios-sub">{t("주간 요약은 데이터가 더 쌓이면 표시돼요.")}</p>
          )}
        </DetailCard>
      ) : null}
    </>
  );
}

export function InsightsAIRecoveryDetail() {
  const { t, lang: uiLang } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openInputGuide, setOpenInputGuide] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [activeGeneratingPhase, setActiveGeneratingPhase] = useState<RecoveryPhase | null>(null);
  const [startDoneMap, setStartDoneMap] = useState<Record<string, boolean>>({});
  const { recordedDays, state } = useInsightsData();
  const insightsLocked = isInsightsLocked(recordedDays);
  const { hasEntitlement, loading: billingLoading } = useBillingAccess();
  const { user, status: authStatus } = useAuthState();
  const [isAdminOrDev, setIsAdminOrDev] = useState(false);

  useEffect(() => {
    let active = true;
    if (authStatus !== "authenticated" || !user?.userId) {
      setIsAdminOrDev(false);
      return () => { active = false; };
    }
    const run = async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/billing/access", {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        setIsAdminOrDev(Boolean(json?.ok && json?.data?.isAdmin));
      } catch {
        if (!active) return;
        setIsAdminOrDev(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [authStatus, user?.userId]);
  const hasPlannerAIAccess = hasEntitlement("recoveryPlannerAI");
  const startPlannerAI = useAIRecoveryPlanner({
    mode: "generate",
    enabled: !insightsLocked && hasPlannerAIAccess,
    autoGenerate: false,
    phase: "start",
  });
  const afterPlannerAI = useAIRecoveryPlanner({
    mode: "generate",
    enabled: !insightsLocked && hasPlannerAIAccess,
    autoGenerate: false,
    phase: "after_work",
  });
  const initialRequestedOrderCount = normalizeRequestedOrderCountParam(searchParams.get("orderCount"));
  const preferredPhase = normalizeRecoveryPhase(searchParams.get("phase"));
  const [activePhase, setActivePhase] = useState<RecoveryPhase>(preferredPhase);
  const [selectedOrderCount, setSelectedOrderCount] = useState(initialRequestedOrderCount);
  const backHref = sanitizeInternalPath(searchParams.get("returnTo"), "/insights/recovery");
  const ordersHref = withReturnTo(`/insights/recovery/orders?orderCount=${selectedOrderCount}`, "/insights/recovery/ai");
  const today = useMemo(() => todayISO(), []);
  const yesterday = useMemo(() => toISODate(addDays(fromISODate(today), -1)), [today]);
  const todayBio = state.bio?.[today] ?? null;
  const yesterdayBio = state.bio?.[yesterday] ?? null;
  const yesterdayEmotion = state.emotions?.[yesterday] ?? null;
  const hasYesterdayRecord = hasHealthInput(yesterdayBio, yesterdayEmotion);
  const hasTodaySleep = todayBio?.sleepHours != null;
  const needsHealthInputGuide = !hasYesterdayRecord || !hasTodaySleep;
  const afterWorkReadiness = useMemo(() => getAfterWorkReadiness(state, today), [state, today]);
  const afterWorkMissingLabels = useMemo(
    () => buildAfterWorkMissingLabels(afterWorkReadiness.recordedLabels),
    [afterWorkReadiness.recordedLabels]
  );
  const missingGuide = useMemo(() => {
    const missingTodaySleep = !hasTodaySleep;
    const missingYesterdayHealth = !hasYesterdayRecord;

    if (!missingTodaySleep && !missingYesterdayHealth) return null;

    if (missingTodaySleep && missingYesterdayHealth) {
      return {
        title: t("필수 기록 2개가 필요해요"),
        subtitle: `${formatKoreanDate(today)} · ${formatKoreanDate(yesterday)} · ${t("AI 맞춤회복 분석 전 필수")}`,
        primary: t("오늘 수면 기록과 전날 건강 기록을 먼저 입력해 주세요."),
        description: t("두 항목이 있어야 회복 플래너 해설 우선순위를 정확하게 계산할 수 있어요."),
        hint: t("확인을 누르면 오늘 기록 화면(수면 우선)으로 이동합니다."),
        route: "/schedule?openHealthLog=today&focus=sleep",
      } as const;
    }

    if (missingTodaySleep) {
      return {
        title: t("오늘 수면 기록이 필요해요"),
        subtitle: `${formatKoreanDate(today)} · ${t("AI 맞춤회복 분석 전 필수")}`,
        primary: t("먼저 오늘 수면 시간을 입력해 주세요."),
        description: t("오늘 수면 기록이 있어야 회복 플래너 해설 정확도가 올라갑니다."),
        hint: t("확인을 누르면 오늘 기록 화면으로 이동합니다."),
        route: "/schedule?openHealthLog=today&focus=sleep",
      } as const;
    }

    return {
      title: t("전날 건강 기록이 필요해요"),
      subtitle: `${formatKoreanDate(yesterday)} · ${t("AI 맞춤회복 분석 전 필수")}`,
      primary: t("먼저 전날 건강 기록을 입력해 주세요."),
      description: t("전날 기록이 있어야 추세 기반 회복 플래너 해설을 정확히 계산할 수 있어요."),
      hint: t("확인을 누르면 전날 기록 화면으로 이동합니다."),
      route: "/schedule?openHealthLog=yesterday",
    } as const;
  }, [hasTodaySleep, hasYesterdayRecord, t, today, yesterday]);

  const moveToRequiredHealthLog = useCallback(() => {
    setOpenInputGuide(false);
    if (!missingGuide) return;
    router.push(missingGuide.route);
  }, [missingGuide, router]);

  useEffect(() => {
    setActivePhase(preferredPhase);
  }, [preferredPhase]);

  useEffect(() => {
    setSelectedOrderCount(initialRequestedOrderCount);
  }, [initialRequestedOrderCount]);

  const startAnalysis = useCallback(() => {
    if (needsHealthInputGuide) {
      setOpenInputGuide(true);
      return;
    }
    setActivePhase("start");
    setActiveGeneratingPhase("start");
    startPlannerAI.startGenerate(selectedOrderCount);
  }, [needsHealthInputGuide, selectedOrderCount, startPlannerAI]);

  const startAfterWorkAnalysis = useCallback(() => {
    if (!isAdminOrDev && !afterWorkReadiness.ready) return;
    setActivePhase("after_work");
    setActiveGeneratingPhase("after_work");
    afterPlannerAI.startGenerate(selectedOrderCount);
  }, [afterPlannerAI, afterWorkReadiness.ready, isAdminOrDev, selectedOrderCount]);

  useEffect(() => {
    if (!startPlannerAI.generating && !afterPlannerAI.generating) {
      setActiveGeneratingPhase(null);
    }
  }, [afterPlannerAI.generating, startPlannerAI.generating]);

  const plannerDateISO = startPlannerAI.data?.dateISO ?? afterPlannerAI.data?.dateISO ?? today;
  useEffect(() => {
    let active = true;
    const startIds = startPlannerAI.data?.result.orders.items.map((item) => buildRecoveryOrderProgressId("start", item.id)) ?? [];
    if (startIds.length) {
      clearStaleRecoveryOrderDone(plannerDateISO, startIds);
    }
    const localDone = readRecoveryOrderDone(plannerDateISO);
    setStartDoneMap(localDone);
    if (!startIds.length) {
      return () => {
        active = false;
      };
    }
    void (async () => {
      const remoteDone = await readRemoteRecoveryOrderDone(plannerDateISO);
      if (!active) return;
      const keep = new Set(startIds);
      const merged: Record<string, boolean> = {};
      for (const [id, done] of Object.entries({ ...remoteDone, ...localDone })) {
        if (done && keep.has(id)) merged[id] = true;
      }
      setStartDoneMap(merged);
      writeRecoveryOrderDone(plannerDateISO, merged);
    })();
    return () => {
      active = false;
    };
  }, [plannerDateISO, startPlannerAI.data]);

  const startOrders = startPlannerAI.data?.result.orders.items ?? [];
  const completedStartCount = startOrders.filter((item) => startDoneMap[buildRecoveryOrderProgressId("start", item.id)]).length;
  const startProgressText =
    startOrders.length > 0 ? t("아침 오더 완료 {done}/{total}", { done: completedStartCount, total: startOrders.length }) : t("아침 오더 대기");
  const englishTranslationPending =
    uiLang === "en" &&
    !insightsLocked &&
    !billingLoading &&
    hasPlannerAIAccess &&
    (startPlannerAI.generating || afterPlannerAI.generating);
  const startErrorLines = useMemo(() => (startPlannerAI.error ? presentError(startPlannerAI.error, t) : []), [startPlannerAI.error, t]);
  const afterErrorLines = useMemo(() => (afterPlannerAI.error ? presentError(afterPlannerAI.error, t) : []), [afterPlannerAI.error, t]);
  const toggleSectionExpanded = useCallback((phase: RecoveryPhase, category: RecoverySection["category"]) => {
    setExpandedSections((current) => ({
      ...current,
      [`${phase}:${category}`]: !current[`${phase}:${category}`],
    }));
  }, []);
  const afterContinuityNode = startPlannerAI.data ? (
    <div className="rounded-[24px] border border-[#DCE6FF] bg-[#F6F9FF] px-4 py-4 sm:px-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("아침 기준")}</div>
          <p className="mt-1 break-keep text-[14px] leading-6 text-ios-text">
            {normalizeRecoveryCopy(startPlannerAI.data.result.explanation.recovery.headline || t("아침 회복이 먼저 기준이 됩니다."))}
          </p>
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("오늘 기록 반영")}</div>
          <p className="mt-1 break-keep text-[14px] leading-6 text-ios-text">
            {afterWorkReadiness.recordedLabels.length
              ? afterWorkReadiness.recordedLabels.join(" · ")
              : t("아직 입력 대기")}
          </p>
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("아침 오더 진행")}</div>
          <p className="mt-1 break-keep text-[14px] leading-6 text-ios-text">{startProgressText}</p>
        </div>
      </div>
    </div>
  ) : null;

  const activeStatusText =
    activePhase === "after_work"
      ? afterPlannerAI.data
        ? t("업데이트 완료")
        : afterWorkReadiness.ready
          ? t("생성 준비 완료")
          : t("기록 대기")
      : startPlannerAI.data
        ? t("생성 완료")
        : needsHealthInputGuide
          ? t("필수 기록 필요")
          : t("생성 준비 완료");

  return (
    <InsightDetailShell
      title={t("AI 맞춤회복")}
      subtitle={formatKoreanDate(plannerDateISO)}
      meta={
        activePhase === "after_work"
          ? t("퇴근 후 탭에서 오늘 실제 기록을 반영한 밤 회복 업데이트를 확인합니다.")
          : t("아침 탭에서 전날 기록과 오늘 수면 기준의 시작 회복을 먼저 확인합니다.")
      }
      tone="navy"
      backHref={backHref}
      className="rnest-recovery-static !max-w-[860px] !px-3 !pt-5 sm:!px-4"
    >
      {insightsLocked ? (
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      ) : null}

      {!insightsLocked && billingLoading ? (
        <DetailCard className="p-4 sm:p-5">
          <div className="text-[13px] font-semibold text-ios-sub">{t("구독 상태 확인 중...")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("AI 맞춤회복 사용 가능 여부를 확인하고 있어요.")}
          </p>
        </DetailCard>
      ) : null}

      {!insightsLocked && !billingLoading && !hasPlannerAIAccess ? (
        <>
          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
          >
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">AI CUSTOMIZED RECOVERY</div>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{t("AI 맞춤회복")}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">
              {t("오늘 무엇을 먼저 회복해야 하는지, 왜 그 순서가 중요한지 AI가 맥락 중심으로 설명합니다.")}
            </p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">
              {t("수면, 교대근무, 스트레스, 활동, 최근 기록 흐름을 함께 읽고 오늘 회복 우선순위를 정리합니다.")}
            </p>
          </DetailCard>
          <RecoveryPlannerUpgradeCard
            title={t("AI 맞춤회복 전체는 Plus 이상 플랜에서 열립니다.")}
            description={t("AI가 오늘의 회복 우선순위와 이유를 설명하고, 바로 실행할 오늘의 오더까지 함께 연결합니다.")}
            returnTo="/insights/recovery/ai"
          />
        </>
      ) : null}

      {!insightsLocked && !billingLoading && hasPlannerAIAccess ? (
        <>
          <RecoveryPhaseTabs
            value={activePhase}
            onChange={setActivePhase}
            items={[
              {
                value: "start",
                label: t("아침 회복"),
                hint: startPlannerAI.data ? t("생성됨") : needsHealthInputGuide ? t("필수 기록 필요") : t("생성 가능"),
              },
              {
                value: "after_work",
                label: t("퇴근 후 회복"),
                hint: afterPlannerAI.data ? t("업데이트됨") : afterWorkReadiness.ready ? t("생성 가능") : t("기록 대기"),
              },
            ]}
          />

          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{
              background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
            }}
          >
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{t("RECOVERY FLOW")}</div>
                <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">
                  {activePhase === "after_work" ? t("퇴근 후 회복 업데이트 설정") : t("오늘 시작 회복 설정")}
                </div>
                <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub">
                  {activePhase === "after_work"
                    ? t("오늘 실제 기록과 아침 오더 진행을 반영해 밤 회복 업데이트를 생성합니다.")
                    : t("전날 기록과 오늘 수면 기준으로 아침 시작 회복과 오더를 생성합니다.")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <RecoveryMetaPill color="#315CA8">{recoveryPhaseTitle(activePhase, uiLang)}</RecoveryMetaPill>
                <RecoveryMetaPill color="#1B2747">{activeStatusText}</RecoveryMetaPill>
                <RecoveryMetaPill color="#5E6C84">{formatKoreanDate(plannerDateISO)}</RecoveryMetaPill>
                {startPlannerAI.data ? <RecoveryMetaPill color="#5E6C84">{startProgressText}</RecoveryMetaPill> : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-end">
                <RecoveryOrderCountSelector
                  value={selectedOrderCount}
                  onChange={setSelectedOrderCount}
                  helper={t("아침과 퇴근 후에 같은 기준 개수를 사용해요.")}
                />
                {isAdminOrDev && activePhase === "start" && startPlannerAI.data ? (
                  <button
                    type="button"
                    onClick={startAnalysis}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-[#D5E2FA] bg-white/92 px-4 text-[13px] font-semibold text-[#17386D] shadow-[0_10px_24px_rgba(18,35,73,0.05)]"
                  >
                    {t("아침 회복과 오더 {count}개 다시 생성", { count: selectedOrderCount })}
                  </button>
                ) : isAdminOrDev && activePhase === "after_work" && afterPlannerAI.data ? (
                  <button
                    type="button"
                    onClick={startAfterWorkAnalysis}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-[#D5E2FA] bg-white/92 px-4 text-[13px] font-semibold text-[#17386D] shadow-[0_10px_24px_rgba(18,35,73,0.05)]"
                  >
                    {t("퇴근 후 회복과 오더 {count}개 다시 생성", { count: selectedOrderCount })}
                  </button>
                ) : (
                  <div className="rounded-[20px] border border-[rgba(16,33,70,0.06)] bg-white/72 px-4 py-3 text-[13px] leading-6 text-ios-sub">
                    {activePhase === "after_work"
                      ? t("퇴근 후 탭이 열리면 같은 개수 기준으로 회복과 오더를 이어서 만듭니다.")
                      : t("아침 회복을 먼저 만들면 아래 해설 카드와 오더가 함께 연결됩니다.")}
                  </div>
                )}
              </div>
            </div>
          </DetailCard>
        </>
      ) : null}

      {!insightsLocked && hasPlannerAIAccess ? (
        <>
          {activePhase === "start" ? (
            !startPlannerAI.data ? (
              <DetailCard
                className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
                style={{
                  background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
                }}
              >
                <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{recoveryPhaseEyebrow("start")}</div>
                <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{t("오늘 시작 회복 준비")}</div>
                <p className="mt-2 text-[13px] leading-6 text-ios-sub">
                  {t("전날 기록과 오늘 수면만 확인되면 아침 회복 방향을 바로 정리합니다.")}
                </p>
                <div className="mt-4 grid gap-2">
                  <div className="rounded-[18px] bg-[#F7F9FD] px-3.5 py-3 text-[13px] text-ios-text">
                    <div className="flex items-center justify-between">
                      <span>{t("오늘 수면")}</span>
                      <span className={hasTodaySleep ? "text-[#0B7A3E]" : "text-[#B45309]"}>{hasTodaySleep ? t("완료") : t("필요")}</span>
                    </div>
                  </div>
                  <div className="rounded-[18px] bg-[#F7F9FD] px-3.5 py-3 text-[13px] text-ios-text">
                    <div className="flex items-center justify-between">
                      <span>{t("전날 기록")}</span>
                      <span className={hasYesterdayRecord ? "text-[#0B7A3E]" : "text-[#B45309]"}>{hasYesterdayRecord ? t("완료") : t("필요")}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <RecoveryMetaPill color="#315CA8">{t("선택 오더 {count}개", { count: selectedOrderCount })}</RecoveryMetaPill>
                </div>
                {startPlannerAI.error ? (
                  <div className="mt-4 rounded-[18px] bg-[#FFF7F8] px-3.5 py-3 text-[13px] leading-6 text-[#8F2943]">
                    {startErrorLines.map((line, idx) => (
                      <p key={`start-error-${idx}`}>{line}</p>
                    ))}
                  </div>
                ) : null}
                {isAdminOrDev || isWithinGenerationWindow("start") ? (
                  <button
                    type="button"
                    onClick={startAnalysis}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[14px] font-semibold text-[color:var(--rnest-accent)]"
                  >
                    {needsHealthInputGuide
                      ? t("필수 기록 입력하러 가기")
                      : startPlannerAI.error
                        ? t("오늘 시작 회복과 오더 {count}개 다시 불러오기", { count: selectedOrderCount })
                        : t("오늘 시작 회복과 오더 {count}개 생성하기", { count: selectedOrderCount })}
                  </button>
                ) : (
                  <p className="mt-4 text-center text-[13px] leading-6 text-ios-sub">
                    {t("아침 회복은 오전 4시~오후 1시 사이에 생성할 수 있어요.")}
                  </p>
                )}
              </DetailCard>
            ) : (
              <RecoveryPhaseResultCard
                phase="start"
                payload={startPlannerAI.data}
                t={t}
                expandedSections={expandedSections}
                onToggleExpanded={(category) => toggleSectionExpanded("start", category)}
                ordersHref={`${ordersHref}${ordersHref.includes("?") ? "&" : "?"}phase=start`}
              />
            )
          ) : !startPlannerAI.data ? (
            <DetailCard
              className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
              style={{
                background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
              }}
            >
              <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{recoveryPhaseEyebrow("after_work")}</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{t("퇴근 후 회복은 아침 회복 뒤에 열려요")}</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">{t("퇴근 후 회복은 아침 회복 흐름을 이어 받는 단계라서, 오늘 시작 회복을 먼저 만들어야 합니다.")}</p>
            </DetailCard>
          ) : !afterWorkReadiness.ready && !isAdminOrDev ? (
            <DetailCard
              className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
              style={{
                background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
              }}
            >
              <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{recoveryPhaseEyebrow("after_work")}</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{t("오늘 기록이 조금 더 필요해요")}</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">
                {t("스트레스·카페인·활동·기분·근무 메모 중 2개 이상이 입력되면 퇴근 후 회복을 업데이트할 수 있어요.")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(afterWorkReadiness.recordedLabels.length ? afterWorkReadiness.recordedLabels : [t("아직 없음")]).map((label) => (
                  <RecoveryMetaPill key={`recorded-${label}`} color="#315CA8">
                    {label}
                  </RecoveryMetaPill>
                ))}
                {afterWorkMissingLabels.slice(0, 3).map((label) => (
                  <RecoveryMetaPill key={`missing-${label}`} color="#5E6C84">
                    {label}
                  </RecoveryMetaPill>
                ))}
              </div>
              <button
                type="button"
                onClick={() => router.push("/schedule?openHealthLog=today")}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[14px] font-semibold text-[color:var(--rnest-accent)]"
              >
                {t("오늘 기록 입력하러 가기")}
              </button>
            </DetailCard>
          ) : !afterPlannerAI.data ? (
            <DetailCard
              className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
              style={{
                background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
              }}
            >
              <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{recoveryPhaseEyebrow("after_work")}</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{t("퇴근 후 회복 업데이트 준비 완료")}</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">{t("오늘 실제 기록과 아침 오더 진행을 반영해 오늘 밤 회복만 다시 정리합니다.")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <RecoveryMetaPill color="#315CA8">{t("선택 오더 {count}개", { count: selectedOrderCount })}</RecoveryMetaPill>
              </div>
              {afterPlannerAI.error ? (
                <div className="mt-4 rounded-[18px] bg-[#FFF7F8] px-3.5 py-3 text-[13px] leading-6 text-[#8F2943]">
                  {afterErrorLines.map((line, idx) => (
                    <p key={`after-error-${idx}`}>{line}</p>
                  ))}
                </div>
              ) : null}
              {afterContinuityNode}
              {isAdminOrDev || isWithinGenerationWindow("after_work") ? (
                <button
                  type="button"
                  onClick={startAfterWorkAnalysis}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[14px] font-semibold text-[color:var(--rnest-accent)]"
                >
                  {afterPlannerAI.error
                    ? t("퇴근 후 회복과 오더 {count}개 다시 불러오기", { count: selectedOrderCount })
                    : t("퇴근 후 회복과 오더 {count}개 업데이트하기", { count: selectedOrderCount })}
                </button>
              ) : (
                <p className="mt-4 text-center text-[13px] leading-6 text-ios-sub">
                  {t("퇴근 후 회복은 오후 3시 이후에 생성할 수 있어요.")}
                </p>
              )}
            </DetailCard>
          ) : (
            <RecoveryPhaseResultCard
              phase="after_work"
              payload={afterPlannerAI.data}
              t={t}
              expandedSections={expandedSections}
              onToggleExpanded={(category) => toggleSectionExpanded("after_work", category)}
              ordersHref={`${ordersHref}${ordersHref.includes("?") ? "&" : "?"}phase=after_work`}
              continuityNode={afterContinuityNode}
              showWeekly={false}
            />
          )}

          <p className="mt-4 px-1 text-center text-[12px] leading-[1.6] text-black/30">
            {t("본 콘텐츠는 의료 행위가 아닌 건강 관리 참고용 추천입니다. 의학적 판단이나 치료를 대체하지 않으며, 건강에 대한 결정은 반드시 전문 의료인과 상담하세요.")}
          </p>
        </>
      ) : null}

      <TodaySleepRequiredSheet
        open={openInputGuide}
        onClose={() => setOpenInputGuide(false)}
        onConfirm={moveToRequiredHealthLog}
        titleText={missingGuide?.title}
        subtitleText={missingGuide?.subtitle}
        primaryText={missingGuide?.primary}
        descriptionText={missingGuide?.description}
        hintText={missingGuide?.hint}
      />
      <RecoveryGeneratingOverlay
        open={Boolean(activeGeneratingPhase) && (startPlannerAI.generating || afterPlannerAI.generating)}
        title={activeGeneratingPhase === "after_work" ? t("퇴근 후 회복 업데이트 생성 중") : t("오늘 시작 회복 생성 중")}
      />
      <EnglishTranslationPendingPopup
        open={englishTranslationPending}
        title={t("AI recovery is being translated")}
        message={
          activeGeneratingPhase === "after_work"
            ? t("퇴근 후 회복 업데이트를 영어로 정리하고 있어요.")
            : t("오늘 시작 회복을 영어로 정리하고 있어요.")
        }
      />
    </InsightDetailShell>
  );
}
