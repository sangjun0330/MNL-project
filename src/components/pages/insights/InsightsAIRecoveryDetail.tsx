"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailCard, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { TodaySleepRequiredSheet } from "@/components/insights/TodaySleepRequiredSheet";
import { addDays, formatKoreanDate, fromISODate, toISODate, todayISO } from "@/lib/date";
import { hasHealthInput } from "@/lib/healthRecords";
import { useI18n } from "@/lib/useI18n";
import type { RecoverySection } from "@/lib/aiRecovery";

function severityLabel(severity: "info" | "caution" | "warning", t: (key: string) => string) {
  if (severity === "warning") return t("경고");
  if (severity === "caution") return t("주의");
  return t("안내");
}

function presentError(error: string, t: (key: string) => string) {
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

function compactErrorCode(error: string) {
  if (!error) return "";
  // 모델명(model:xxx) 제거
  let code = error.split("{")[0]?.trim() || error;
  code = code.replace(/_?model:[^\s_]*/gi, "");
  code = code.replace(/__+/g, "_").replace(/^_|_$/g, "");
  return code.length > 90 ? `${code.slice(0, 89)}…` : code;
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
  let out = text;
  out = out.replace(/오늘\s*컨디션에\s*맞춘\s*보정\s*조언입니다\.?/g, "");
  out = out.replace(/오늘\s*컨디션\s*기준\s*핵심\s*조언입니다\.?/g, "");
  out = out.replace(/Tailored adjustment guidance for today'?s condition\.?/gi, "");

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
    /(?:커피\s*)?약\s*(\d+(?:\.\d+)?)\s*잔\s*\(\s*(\d+(?:\.\d+)?)\s*mg\s*\)(?:\s*\(\s*약\s*\d+(?:\.\d+)?\s*잔\s*\))?/gi,
    (_, cupsRaw, mgRaw) => protectCaffeineMention(formatCaffeinePair(cupsRaw, mgRaw))
  );
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*mg\s*\(\s*약\s*(\d+(?:\.\d+)?)\s*잔\s*\)/gi,
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
  const statusLabel = lang === "en" ? "Current status" : "현재 상태";
  const recLabel = lang === "en" ? "Action" : "추천";
  const severity = section.severity ?? "info";
  const visibleRecommendations = expanded ? recommendations : recommendations.slice(0, 1);
  const toggleLabel = expanded ? (lang === "en" ? "Show less" : "접기") : (lang === "en" ? "More tips" : "추천 더 보기");

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
            {section.title || t(meta.titleKey)}
          </h3>
          {severity !== "info" ? <RecoveryMetaPill color={theme.accent}>{severityLabel(severity, t)}</RecoveryMetaPill> : null}
          {recommendations.length > 1 ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="ml-auto inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-white px-3.5 text-[12px] font-semibold shadow-apple-sm"
              style={{ color: theme.accent }}
            >
              {toggleLabel}
            </button>
          ) : null}
        </div>

        {descriptionText ? (
          <div className="mt-3">
            <div className="text-[11px] font-semibold tracking-[0.12em]" style={{ color: theme.accent }}>
              {statusLabel}
            </div>
            <p className="mt-2 break-keep text-[15px] leading-7 text-[#42536A]">{descriptionText}</p>
          </div>
        ) : null}

        {visibleRecommendations.length ? (
          <ol className="mt-5 space-y-3">
            {visibleRecommendations.map((tip, idx) => (
              <li key={`${meta.key}-${idx}`} className="border-t border-[rgba(16,33,70,0.08)] pt-3 first:border-t-0 first:pt-0">
                <div className="text-[12.5px] font-semibold" style={{ color: theme.accent }}>
                  {recLabel} {idx + 1}
                </div>
                <p className="mt-1.5 break-keep text-[15px] leading-7 text-ios-text">{tip}</p>
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
  "맞춤 처방 작성 중...",
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

export function InsightsAIRecoveryDetail() {
  const { t, lang: uiLang } = useI18n();
  const router = useRouter();
  const [openInputGuide, setOpenInputGuide] = useState(false);
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Partial<Record<RecoverySection["category"], boolean>>>({});
  const { recordedDays, state } = useInsightsData();
  const insightsLocked = isInsightsLocked(recordedDays);
  const { hasEntitlement, loading: billingLoading } = useBillingAccess();
  const hasPlannerAIAccess = hasEntitlement("recoveryPlannerAI");
  const { data, loading, generating, error, retry, startGenerate } = useAIRecoveryInsights({
    mode: "generate",
    enabled: !insightsLocked && hasPlannerAIAccess,
    autoGenerate: false,
  });
  const today = useMemo(() => todayISO(), []);
  const yesterday = useMemo(() => toISODate(addDays(fromISODate(today), -1)), [today]);
  const todayBio = state.bio?.[today] ?? null;
  const yesterdayBio = state.bio?.[yesterday] ?? null;
  const yesterdayEmotion = state.emotions?.[yesterday] ?? null;
  const hasYesterdayRecord = hasHealthInput(yesterdayBio, yesterdayEmotion);
  const hasTodaySleep = todayBio?.sleepHours != null;
  const needsHealthInputGuide = !hasYesterdayRecord || !hasTodaySleep;
  const missingGuide = useMemo(() => {
    const missingTodaySleep = !hasTodaySleep;
    const missingYesterdayHealth = !hasYesterdayRecord;

    if (!missingTodaySleep && !missingYesterdayHealth) return null;

    if (missingTodaySleep && missingYesterdayHealth) {
      return {
        title: t("필수 기록 2개가 필요해요"),
        subtitle: `${formatKoreanDate(today)} · ${formatKoreanDate(yesterday)} · ${t("AI 회복 해설 분석 전 필수")}`,
        primary: t("오늘 수면 기록과 전날 건강 기록을 먼저 입력해 주세요."),
        description: t("두 항목이 있어야 회복 플래너 해설 우선순위를 정확하게 계산할 수 있어요."),
        hint: t("확인을 누르면 오늘 기록 화면(수면 우선)으로 이동합니다."),
        route: "/schedule?openHealthLog=today&focus=sleep",
      } as const;
    }

    if (missingTodaySleep) {
      return {
        title: t("오늘 수면 기록이 필요해요"),
        subtitle: `${formatKoreanDate(today)} · ${t("AI 회복 해설 분석 전 필수")}`,
        primary: t("먼저 오늘 수면 시간을 입력해 주세요."),
        description: t("오늘 수면 기록이 있어야 회복 플래너 해설 정확도가 올라갑니다."),
        hint: t("확인을 누르면 오늘 기록 화면으로 이동합니다."),
        route: "/schedule?openHealthLog=today&focus=sleep",
      } as const;
    }

    return {
      title: t("전날 건강 기록이 필요해요"),
      subtitle: `${formatKoreanDate(yesterday)} · ${t("AI 회복 해설 분석 전 필수")}`,
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

  const startAnalysis = useCallback(() => {
    if (needsHealthInputGuide) {
      setOpenInputGuide(true);
      return;
    }
    setAnalysisRequested(true);
    startGenerate();
  }, [needsHealthInputGuide, startGenerate]);

  const lang = data?.language ?? "ko";
  const englishTranslationPending =
    uiLang === "en" &&
    !insightsLocked &&
    !billingLoading &&
    hasPlannerAIAccess &&
    analysisRequested &&
    !data &&
    !error &&
    (loading || generating);
  const errorLines = useMemo(() => (error ? presentError(error, t) : []), [error, t]);
  const errorCode = useMemo(() => (error ? compactErrorCode(error) : ""), [error]);
  const weekly = useMemo(() => {
    const w = data?.result.weeklySummary ?? null;
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
  }, [data?.result.weeklySummary, lang]);

  const sectionsByCategory = useMemo(() => {
    const map = new Map<RecoverySection["category"], RecoverySection>();
    for (const section of data?.result.sections ?? []) {
      if (!map.has(section.category)) {
        map.set(section.category, section);
      }
    }
    return map;
  }, [data?.result.sections]);

  const orderedSections = useMemo(
    () =>
      CATEGORIES.map((meta) => ({ meta, section: sectionsByCategory.get(meta.key) ?? null }))
        .filter((item) => item.section)
        .slice(0, 3),
    [sectionsByCategory]
  );
  const toggleSectionExpanded = useCallback((category: RecoverySection["category"]) => {
    setExpandedSections((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }, []);

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
    if (!data?.generatedText || orderedSections.length > 0) return "";
    return normalizeNarrativeText(extractCSection(data.generatedText), lang);
  }, [data?.generatedText, lang, orderedSections.length]);
  const alertLines = useMemo(() => {
    const raw = data?.result.compoundAlert?.message ?? "";
    if (!raw) return [];
    return normalizeLineBreaks(normalizeNarrativeText(raw, lang))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [data?.result.compoundAlert?.message, lang]);
  const plannerContext = data?.plannerContext ?? null;

  return (
    <InsightDetailShell
      title={t("AI 회복 해설")}
      subtitle={data ? formatKoreanDate(data.dateISO) : ""}
      meta={undefined}
      tone="navy"
      backHref="/insights/recovery"
      className="rnest-recovery-static !max-w-[860px] !px-3 !pt-5 sm:!px-4"
    >
      {insightsLocked ? (
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      ) : null}

      {!insightsLocked && billingLoading ? (
        <DetailCard className="p-4 sm:p-5">
          <div className="text-[13px] font-semibold text-ios-sub">{t("구독 상태 확인 중...")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("AI 회복 해설 사용 가능 여부를 확인하고 있어요.")}
          </p>
        </DetailCard>
      ) : null}

      {!insightsLocked && !billingLoading && hasPlannerAIAccess && !data && !loading && !generating ? (
        <DetailCard className="p-4 sm:p-5">
          <div className="text-[13px] font-semibold text-ios-sub">{t("AI 회복 해설 안내")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("AI 회복 해설은 회복 플래너가 왜 이런 우선순위를 잡았는지 맥락 중심으로 풀어 설명합니다.")}
          </p>
        </DetailCard>
      ) : null}

      {!insightsLocked && !billingLoading && !hasPlannerAIAccess ? (
        <DetailCard className="p-4 sm:p-5">
          <div className="text-[17px] font-bold tracking-[-0.01em] text-ios-text">{t("유료 플랜 전용 기능")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("AI 회복 해설은 Pro 플랜에서 사용할 수 있어요.")}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  t("AI 회복 해설은 유료 플랜 전용 기능입니다.\n플랜 업그레이드 페이지로 이동할까요?")
                );
                if (confirmed) router.push("/settings/billing/upgrade");
              }}
              className="inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
            >
              {t("확인")}
            </button>
            <Link
              href="/settings/billing/upgrade"
              className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
            >
              {t("플랜 보기")}
            </Link>
          </div>
        </DetailCard>
      ) : null}

      {!insightsLocked && hasPlannerAIAccess && !generating && !data && !error ? (
        <DetailCard className="p-4 sm:p-5">
          <div className="text-[17px] font-bold tracking-[-0.01em] text-ios-text">{t("AI 분석 준비 완료")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("분석 시작 전에 필수 기록 2개(오늘 수면, 전날 건강)를 확인해 주세요.")}
          </p>
          <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg px-3 py-3">
            <div className="flex items-center justify-between text-[13px] text-ios-text">
              <span>{t("오늘 수면 시간")}</span>
              <span className={hasTodaySleep ? "text-[#0B7A3E]" : "text-[#B45309]"}>
                {hasTodaySleep ? t("입력 완료") : t("입력 필요")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[13px] text-ios-text">
              <span>{t("전날 건강 기록")}</span>
              <span className={hasYesterdayRecord ? "text-[#0B7A3E]" : "text-[#B45309]"}>
                {hasYesterdayRecord ? t("입력 완료") : t("입력 필요")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={startAnalysis}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[14px] font-semibold text-[color:var(--rnest-accent)]"
          >
            {needsHealthInputGuide ? t("필수 기록 입력하러 가기") : t("AI 분석 시작하기")}
          </button>
          {needsHealthInputGuide ? (
            <p className="mt-2 text-[12px] leading-relaxed text-ios-muted">
              {t("누르면 누락된 기록 날짜로 이동해 바로 입력할 수 있어요.")}
            </p>
          ) : null}
        </DetailCard>
      ) : null}

      {!insightsLocked && hasPlannerAIAccess && !loading && !generating && !data && Boolean(error) ? (
        <DetailCard className="p-4 sm:p-5">
          <div className="text-[17px] font-bold tracking-[-0.01em] text-ios-text">{t("AI 호출에 실패했어요.")}</div>
          <div className="mt-2 space-y-1 text-[14px] leading-relaxed text-ios-sub">
            {errorLines.map((line, idx) => (
              <p key={`${line}-${idx}`}>{line}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (needsHealthInputGuide) {
                setOpenInputGuide(true);
                return;
              }
              setAnalysisRequested(true);
              retry();
              startGenerate();
            }}
            className="mt-4 w-full rounded-xl bg-[#007AFF] py-3 text-[15px] font-semibold text-white active:bg-[#0062CC] transition-colors"
          >
            {t("다시 시도")}
          </button>
        </DetailCard>
      ) : null}

      {!insightsLocked && hasPlannerAIAccess && !loading && data ? (
        <>
          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{ background: "linear-gradient(180deg, rgba(249,250,254,0.98) 0%, #FFFFFF 78%)" }}
          >
            <div className="flex flex-col gap-4">
              <div className="max-w-[680px]">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">
                  {lang === "en" ? "TODAY RECOVERY" : "오늘 회복 브리핑"}
                </div>
                <p className="mt-2 break-keep text-[19px] font-bold leading-[1.6] tracking-[-0.03em] text-ios-text sm:text-[21px]">
                  {normalizeNarrativeText(data.result.headline || t("요약이 비어 있어요."), lang)}
                </p>
                <p className="mt-2 max-w-[560px] break-keep text-[13px] leading-6 text-ios-sub">
                  {t("오늘 컨디션과 최근 흐름을 기준으로 지금 가장 먼저 해야 할 회복 우선순위를 정리했어요.")}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("분석 날짜")}</div>
                  <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{formatKoreanDate(data.dateISO)}</div>
                </div>
                <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("카테고리")}</div>
                  <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{orderedSections.length}개</div>
                </div>
                {weekly ? (
                  <>
                    <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                      <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("평균 배터리")}</div>
                      <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{weekly.avgBattery}</div>
                    </div>
                    <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                      <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("지난주 대비")}</div>
                      <div
                        className="mt-1 text-[16px] font-bold tracking-[-0.02em]"
                        style={{ color: weekly.avgBattery - weekly.prevAvgBattery >= 0 ? "#0B7A3E" : "#A33A4A" }}
                      >
                        {formatSignedDelta(weekly.avgBattery - weekly.prevAvgBattery)}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {data.result.compoundAlert ? (
                <div className="rounded-[24px] bg-[#FFF4F6] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(232,116,133,0.12)] sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <RecoveryMetaPill color="#B2415A">{t("긴급 알림")}</RecoveryMetaPill>
                    {data.result.compoundAlert.factors.map((factor) => (
                      <RecoveryMetaPill key={factor} color="#E87485" subtle>
                        {factor}
                      </RecoveryMetaPill>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2">
                    {(alertLines.length
                      ? alertLines
                      : [normalizeNarrativeText(data.result.compoundAlert.message, lang)]).map((line, idx) => (
                      <p key={`alert-line-${idx}`} className="break-keep text-[14px] leading-7 text-ios-text">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {plannerContext ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                    <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("회복 포커스")}</div>
                    <div className="mt-1 text-[15px] font-bold tracking-[-0.02em] text-ios-text">
                      {plannerContext.focusFactor?.label ?? t("오늘 플랜")}
                    </div>
                  </div>
                  <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                    <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("지금 할 1개")}</div>
                    <div className="mt-1 text-[14px] font-semibold leading-6 text-ios-text">
                      {plannerContext.primaryAction ?? t("회복 루틴을 먼저 고정해요.")}
                    </div>
                  </div>
                  <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                    <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{t("피해야 할 것")}</div>
                    <div className="mt-1 text-[14px] font-semibold leading-6 text-ios-text">
                      {plannerContext.avoidAction ?? t("늦은 자극을 줄여요.")}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DetailCard>

          <div className="px-1">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">{t("오늘 플랜")}</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{t("AI가 해설한 오늘 플랜")}</div>
            <p className="mt-2 max-w-[560px] break-keep text-[13px] leading-6 text-ios-sub">
              {t("회복 플래너가 왜 이런 우선순위를 잡았는지 중요한 항목만 빠르게 정리했어요.")}
            </p>
          </div>

          {orderedSections.length ? (
            <div className="space-y-3">
              {orderedSections.map(({ meta, section }) => {
                if (!section) return null;
                const theme = CATEGORY_THEME[meta.key];
                return (
                  <DetailCard
                    key={`${meta.key}-${section.title}`}
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
                      expanded={Boolean(expandedSections[meta.key])}
                      onToggleExpanded={() => toggleSectionExpanded(meta.key)}
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

          <DetailCard className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-3">
              <div className="max-w-[620px]">
                <div className="text-[12px] font-semibold tracking-[0.16em] text-ios-muted">
                  {lang === "en" ? "WEEKLY NOTE" : "주간 회복 노트"}
                </div>
                <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{t("이번 주 흐름 해설")}</div>
              </div>
              {weekly ? (
                <div className="flex flex-wrap gap-2">
                  <RecoveryMetaPill color="#1B2747">
                    {t("평균 배터리")} {weekly.avgBattery}
                  </RecoveryMetaPill>
                  {weekly.topDrains.map((drain) => (
                    <RecoveryMetaPill key={`${drain.label}-${drain.pct}`} color="#5E6C84">
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
                      <li
                        key={`personal-${idx}`}
                        className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 text-[15px] leading-7 text-ios-text"
                      >
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
                      <li
                        key={`preview-${idx}`}
                        className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 text-[15px] leading-7 text-ios-text"
                      >
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

          {/* 면책 문구 */}
          <p className="mt-4 px-1 text-center text-[12px] leading-[1.6] text-black/30">
            {t("본 콘텐츠는 의료 행위가 아닌 건강 관리 참고용 추천입니다. 의학적 판단이나 치료를 대체하지 않으며, 건강에 대한 결정은 반드시 전문 의료인과 상담하세요.")}
          </p>
        </>
      ) : null}

      <RecoveryGeneratingOverlay
        open={Boolean(generating && !data && !insightsLocked && !englishTranslationPending)}
        title={t("AI 회복 해설 분석 중")}
      />
      <EnglishTranslationPendingPopup
        open={englishTranslationPending}
        title={t("영어 번역 적용 중")}
        message={t("영어로 표시하는 중이에요. 조금만 기다려 주세요.")}
      />
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
    </InsightDetailShell>
  );
}
