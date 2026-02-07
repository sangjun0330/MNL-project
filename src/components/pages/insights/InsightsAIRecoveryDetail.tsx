"use client";

import { useMemo } from "react";
import Image from "next/image";
import { DetailCard, DetailChip, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";
import type { RecoverySection } from "@/lib/aiRecovery";

function severityLabel(severity: "info" | "caution" | "warning", t: (key: string) => string) {
  if (severity === "warning") return t("경고");
  if (severity === "caution") return t("주의");
  return t("안내");
}

function severityColor(severity: "info" | "caution" | "warning") {
  if (severity === "warning") return "#E87485";
  if (severity === "caution") return "#1B2747";
  return "#007AFF";
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
  const code = error.split("{")[0]?.trim() || error;
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

  out = out.replace(/(\d+(?:\.\d+)?)\s*mg/gi, (_, raw) => {
    const mg = Number(raw);
    if (!Number.isFinite(mg)) return `${raw}mg`;
    const cups = Math.max(0.5, Math.round((mg / 120) * 10) / 10);
    if (lang === "en") return `about ${cups} cup(s) (${Math.round(mg)}mg)`;
    return `커피 약 ${cups}잔(${Math.round(mg)}mg)`;
  });

  out = out.replace(/[^\S\r\n]{2,}/g, " ").trim();
  return out;
}

type HighlightTone = "summary" | "alert" | "plan";

function highlightClass(tone: HighlightTone) {
  if (tone === "alert") return "rounded-[6px] bg-[#FFD2DA] px-[4px] py-[1px] font-semibold text-[#5F1322]";
  if (tone === "plan") return "rounded-[6px] bg-[#E4ECFF] px-[4px] py-[1px] font-semibold text-ios-text";
  return "rounded-[6px] bg-[#FFF6CC] px-[4px] py-[1px] font-semibold text-ios-text";
}

function pickKeySentence(text: string) {
  const sentences = text
    .split(/(?<=[.!?]|다\.|요\.)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const priorityRegex = /(핵심|최우선|주의|경고|위험|중요|필수|회복|수면부채|카페인|스트레스|기분|priority|warning|critical|must|important)/i;
  return (
    sentences.find((sentence) => sentence.length >= 10 && priorityRegex.test(sentence)) ??
    sentences.find((sentence) => sentence.length >= 10) ??
    ""
  );
}

function highlightKeySentence(text: string, tone: HighlightTone) {
  const target = pickKeySentence(text);
  if (!target) return text;
  const index = text.indexOf(target);
  if (index < 0) return text;
  const before = text.slice(0, index);
  const after = text.slice(index + target.length);
  return (
    <>
      {before}
      <mark className={highlightClass(tone)}>{target}</mark>
      {after}
    </>
  );
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
  const items = normalized
    .split(/\n+|\s+-\s+/)
    .map((line) => line.replace(/^\-\s*/, "").trim())
    .filter(Boolean);
  if (items.length > 1) return items;
  const sentenceItems = normalized
    .split(/(?<=[.!?]|다\.|요\.)\s+|\n+/)
    .map((line) => line.replace(/^\-\s*/, "").trim())
    .filter(Boolean);
  return sentenceItems.length > 1 ? sentenceItems : [normalized];
}

const CATEGORIES: Array<{
  key: RecoverySection["category"];
  titleKo: string;
  icon: string;
}> = [
  { key: "sleep", titleKo: "수면", icon: "1" },
  { key: "shift", titleKo: "교대근무", icon: "2" },
  { key: "caffeine", titleKo: "카페인", icon: "3" },
  { key: "menstrual", titleKo: "생리주기", icon: "4" },
  { key: "stress", titleKo: "스트레스 & 감정", icon: "5" },
  { key: "activity", titleKo: "신체활동", icon: "6" },
];

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const { recordedDays } = useInsightsData();
  const insightsLocked = isInsightsLocked(recordedDays);
  const { data, loading, generating, error } = useAIRecoveryInsights({ mode: "generate", enabled: !insightsLocked });
  const lang = data?.language ?? "ko";
  const errorLines = useMemo(() => (error ? presentError(error, t) : []), [error, t]);
  const errorCode = useMemo(() => (error ? compactErrorCode(error) : ""), [error]);
  const weekly = useMemo(() => {
    const w = data?.result.weeklySummary ?? null;
    if (!w) return null;
    return {
      ...w,
      personalInsight: normalizeNarrativeText(w.personalInsight, lang),
      nextWeekPreview: normalizeNarrativeText(w.nextWeekPreview, lang),
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
    () => CATEGORIES.map((meta) => ({ meta, section: sectionsByCategory.get(meta.key) ?? null })).filter((item) => item.section),
    [sectionsByCategory]
  );

  const weeklyPersonalLines = useMemo(
    () => splitBulletLines(weekly?.personalInsight ?? ""),
    [weekly?.personalInsight]
  );
  const weeklyPreviewLines = useMemo(
    () => splitBulletLines(weekly?.nextWeekPreview ?? ""),
    [weekly?.nextWeekPreview]
  );

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

  return (
    <InsightDetailShell
      title={t("AI 맞춤회복")}
      subtitle={data ? formatKoreanDate(data.dateISO) : ""}
      meta={t("AI가 생성한 텍스트 결과")}
      tone="navy"
      backHref="/insights"
    >
      {insightsLocked ? (
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      ) : null}

      {!insightsLocked && loading && !data ? (
        <DetailCard className="p-5">
          <div className="text-[15px] font-semibold text-ios-sub">{t("OpenAI 생성 분석")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("AI가 현재 상태에 맞춘 맞춤회복을 분석하고 있습니다.")}
          </p>
        </DetailCard>
      ) : null}

      {!insightsLocked && !loading && !data ? (
        <DetailCard className="p-5">
          <div className="text-[17px] font-bold tracking-[-0.01em] text-ios-text">{t("AI 호출에 실패했어요.")}</div>
          <div className="mt-2 space-y-1 text-[14px] leading-relaxed text-ios-sub">
            {errorLines.map((line, idx) => (
              <p key={`${line}-${idx}`}>{line}</p>
            ))}
          </div>
          {errorCode ? <div className="mt-3 text-[12px] text-ios-muted">[{errorCode}]</div> : null}
        </DetailCard>
      ) : null}

      {!insightsLocked && !loading && data ? (
        <>
          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">{t("한줄 요약")}</div>
            <p className="mt-2 text-[17px] font-semibold leading-relaxed tracking-[-0.01em] text-ios-text">
              {highlightKeySentence(normalizeNarrativeText(data.result.headline || t("요약이 비어 있어요."), lang), "summary")}
            </p>
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">{t("긴급 알림")}</div>
            {data.result.compoundAlert ? (
              <>
                <div className="mt-2 space-y-1">
                  {(alertLines.length
                    ? alertLines
                    : [normalizeNarrativeText(data.result.compoundAlert.message, lang)]).map((line, idx) => (
                    <p key={`alert-line-${idx}`} className="text-[14px] leading-relaxed text-ios-text">
                      {idx === 0 ? highlightKeySentence(line, "alert") : line}
                    </p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.result.compoundAlert.factors.map((factor) => (
                    <DetailChip key={factor} color="#E87485">
                      {factor}
                    </DetailChip>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[14px] text-ios-sub">{t("오늘은 복합 위험 알림이 없어요.")}</p>
            )}
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">{t("오늘의 회복 처방")}</div>
            {orderedSections.length ? (
              <div className="mt-3 space-y-3">
                {orderedSections.map(({ meta, section }, index) => (
                  <div
                    key={`${meta.key}-${section?.title}`}
                    className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ios-bg text-[12px] font-bold text-ios-sub">
                          {index + 1}
                        </div>
                        <span className="text-[17px] font-bold text-ios-text">{section?.title || meta.titleKo}</span>
                      </div>
                      <DetailChip color={severityColor(section?.severity ?? "info")}>
                        {severityLabel(section?.severity ?? "info", t)}
                      </DetailChip>
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
                      {highlightKeySentence(
                        normalizeNarrativeText(section?.description || t("오늘 상태에 맞춘 회복 가이드입니다."), lang),
                        "plan"
                      )}
                    </p>
                    {section?.tips?.length ? (
                      <ol className="mt-3 space-y-2 text-[14px] leading-relaxed text-ios-text">
                        {section.tips.map((tip, idx) => (
                          <li key={`${meta.key}-${idx}`} className="flex gap-2">
                            <span className="font-semibold text-ios-sub">{idx + 1}.</span>
                            <span>{normalizeNarrativeText(tip, lang)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
                {cFallbackText || t("오늘은 추가 처방이 없어요.")}
              </p>
            )}
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">{t("이번 주 AI 한마디")}</div>
            {weekly ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-2">
                  <p className="text-[12px] font-semibold text-ios-sub">{t("이번 주 요약")}</p>
                  <p className="mt-1 text-[14px] text-ios-text">
                    {t("평균 배터리")} <span className="font-extrabold">{weekly.avgBattery}</span>
                    {" · "}
                    {t("지난주 대비")} <span className="font-extrabold">{weekly.avgBattery - weekly.prevAvgBattery}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-2">
                  <p className="text-[12px] font-semibold text-ios-sub">{t("개인 패턴")}</p>
                  <ol className="mt-1 space-y-1">
                    {weeklyPersonalLines.map((line, idx) => (
                      <li key={`personal-${idx}`} className="flex gap-2 text-[14px] leading-relaxed text-ios-text">
                        <span className="font-semibold text-ios-sub">{idx + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-2">
                  <p className="text-[12px] font-semibold text-ios-sub">{t("다음 주 예측")}</p>
                  <ol className="mt-1 space-y-1">
                    {weeklyPreviewLines.map((line, idx) => (
                      <li key={`preview-${idx}`} className="flex gap-2 text-[14px] leading-relaxed text-ios-text">
                        <span className="font-semibold text-ios-sub">{idx + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-ios-sub">{t("주간 요약은 데이터가 더 쌓이면 표시돼요.")}</p>
            )}
          </DetailCard>
        </>
      ) : null}

      {generating && !data && !insightsLocked ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden px-6">
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_15%,rgba(0,122,255,0.16),transparent),linear-gradient(180deg,rgba(18,20,24,0.42),rgba(18,20,24,0.58))] backdrop-blur-[6px]" />
          <div className="wnl-modal relative w-full max-w-[340px] overflow-hidden rounded-[30px] border border-white/35 bg-white/92 px-6 py-6 shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#007AFF] to-transparent wnl-recovery-progress" />
            <div className="flex items-start gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-black/5 bg-[#eef4ff] p-2">
                <div className="absolute inset-0 wnl-logo-breathe rounded-2xl bg-[radial-gradient(80%_70%_at_50%_40%,rgba(0,122,255,0.22),transparent)]" />
                <Image
                  src="/icons/icon-192.png"
                  alt="RNest"
                  width={40}
                  height={40}
                  className="relative mx-auto mt-[4px] h-10 w-10 object-contain"
                  priority
                />
              </div>
              <div className="min-w-0">
                <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("맞춤회복 분석 중")}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ios-sub">
                  {t("AI가 현재 상태에 맞춘 맞춤회복을 분석하고 있습니다.")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#007AFF] wnl-dot-pulse" />
              <span className="h-2 w-2 rounded-full bg-[#007AFF] wnl-dot-pulse [animation-delay:180ms]" />
              <span className="h-2 w-2 rounded-full bg-[#007AFF] wnl-dot-pulse [animation-delay:360ms]" />
            </div>
          </div>
        </div>
      ) : null}
    </InsightDetailShell>
  );
}
