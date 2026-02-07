"use client";

import { useMemo } from "react";
import { DetailCard, DetailChip, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
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

function highlightInline(text: string) {
  const tokens = text.split(/(\d+(?:\.\d+)?(?:h|시간|mg|%|점)?|수면부채|카페인|스트레스|기분|수면)/g);
  return tokens.map((token, idx) => {
    if (!token) return null;
    const emph = /^(?:\d+(?:\.\d+)?(?:h|시간|mg|%|점)?|수면부채|카페인|스트레스|기분|수면)$/u.test(token);
    if (!emph) return token;
    return (
      <span key={`${token}-${idx}`} className="font-extrabold text-ios-text">
        {token}
      </span>
    );
  });
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
  const { data, loading, generating, error } = useAIRecoveryInsights({ mode: "generate" });
  const errorLines = useMemo(() => (error ? presentError(error, t) : []), [error, t]);
  const errorCode = useMemo(() => (error ? compactErrorCode(error) : ""), [error]);
  const weekly = data?.result.weeklySummary ?? null;

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

  const cFallbackText = useMemo(() => {
    if (!data?.generatedText || orderedSections.length > 0) return "";
    return extractCSection(data.generatedText);
  }, [data?.generatedText, orderedSections.length]);

  return (
    <InsightDetailShell
      title={t("AI 맞춤회복")}
      subtitle={data ? formatKoreanDate(data.dateISO) : ""}
      meta={t("AI가 생성한 텍스트 결과")}
      tone="navy"
      backHref="/insights"
    >
      {loading && !data ? (
        <DetailCard className="p-5">
          <div className="text-[15px] font-semibold text-ios-sub">{t("OpenAI 생성 분석")}</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            {t("AI가 현재 상태에 맞춘 맞춤회복을 분석하고 있습니다.")}
          </p>
        </DetailCard>
      ) : null}

      {!loading && !data ? (
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

      {!loading && data ? (
        <>
          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">A · {t("한줄 요약")}</div>
            <p className="mt-2 text-[17px] font-semibold leading-relaxed tracking-[-0.01em] text-ios-text">
              {highlightInline(data.result.headline || t("요약이 비어 있어요."))}
            </p>
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">B · {t("긴급 알림")}</div>
            {data.result.compoundAlert ? (
              <>
                <p className="mt-2 text-[14px] leading-relaxed text-ios-text">{data.result.compoundAlert.message}</p>
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
            <div className="text-[13px] font-semibold text-ios-sub">C · {t("오늘의 회복 처방")}</div>
            {orderedSections.length ? (
              <div className="mt-3 space-y-3">
                {orderedSections.map(({ meta, section }) => (
                  <div
                    key={`${meta.key}-${section?.title}`}
                    className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ios-bg text-[12px] font-bold text-ios-sub">
                          {meta.icon}
                        </div>
                        <span className="text-[17px] font-bold text-ios-text">{section?.title || meta.titleKo}</span>
                      </div>
                      <DetailChip color={severityColor(section?.severity ?? "info")}>
                        {severityLabel(section?.severity ?? "info", t)}
                      </DetailChip>
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
                      {section?.description || t("오늘 컨디션 기준 핵심 조언입니다.")}
                    </p>
                    {section?.tips?.length ? (
                      <ol className="mt-3 space-y-2 text-[14px] leading-relaxed text-ios-text">
                        {section.tips.map((tip, idx) => (
                          <li key={`${meta.key}-${idx}`} className="flex gap-2">
                            <span className="font-semibold text-ios-sub">{idx + 1}.</span>
                            <span>{tip}</span>
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
            <div className="text-[13px] font-semibold text-ios-sub">D · {t("이번 주 AI 한마디")}</div>
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
                  <p className="mt-1 text-[14px] leading-relaxed text-ios-text">{weekly.personalInsight}</p>
                </div>
                <div className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-2">
                  <p className="text-[12px] font-semibold text-ios-sub">{t("다음 주 예측")}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ios-text">{weekly.nextWeekPreview}</p>
                </div>
                {weekly.topDrains.length ? (
                  <div className="flex flex-wrap gap-2">
                    {weekly.topDrains.map((drain) => (
                      <DetailChip key={`${drain.label}-${drain.pct}`} color="#1B2747">
                        {drain.label} {drain.pct}%
                      </DetailChip>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-ios-sub">{t("주간 요약은 데이터가 더 쌓이면 표시돼요.")}</p>
            )}
          </DetailCard>
        </>
      ) : null}

      {generating && !data ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 px-6 backdrop-blur-[1px]">
          <div className="w-full max-w-[320px] rounded-3xl border border-ios-sep bg-white px-5 py-4 shadow-apple-lg">
            <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("맞춤회복 분석 중")}</div>
            <p className="mt-2 text-[13px] leading-relaxed text-ios-sub">
              {t("AI가 현재 상태에 맞춘 맞춤회복을 분석하고 있습니다.")}
            </p>
          </div>
        </div>
      ) : null}
    </InsightDetailShell>
  );
}
