"use client";

import { Fragment, useMemo } from "react";
import { DetailCard, DetailChip, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

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
      t("서버에서 사용하는 OPENAI_API_KEY의 프로젝트/지역 정책을 확인해 주세요."),
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

function extractSection(text: string, label: "A" | "B" | "C" | "D") {
  const start = findSectionStart(text, label);
  if (start < 0) return "";
  const ends = (["A", "B", "C", "D"] as const)
    .filter((v) => v !== label)
    .map((v) => findSectionStart(text.slice(start + 1), v))
    .filter((idx) => idx >= 0)
    .map((idx) => idx + start + 1);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).trim();
}

function normalizeBlock(block: string, label: "A" | "B" | "C" | "D") {
  return block
    .replace(new RegExp(`^\\s*\\[${label}\\]\\s*`, "i"), "")
    .replace(new RegExp(`^\\s*${label}\\s*[).:\\-]\\s*`, "i"), "")
    .trim();
}

function toLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function highlightInline(text: string) {
  const tokens = text.split(/(\d+(?:\.\d+)?(?:h|시간|mg|%|점)?|수면부채|카페인|스트레스|기분|수면)/g);
  return tokens.map((token, idx) => {
    if (!token) return null;
    const emph = /^(?:\d+(?:\.\d+)?(?:h|시간|mg|%|점)?|수면부채|카페인|스트레스|기분|수면)$/u.test(token);
    if (!emph) return <Fragment key={`${token}-${idx}`}>{token}</Fragment>;
    return (
      <span key={`${token}-${idx}`} className="font-extrabold text-ios-text">
        {token}
      </span>
    );
  });
}

function renderBlockLines(lines: string[], tone: "normal" | "strong" = "normal") {
  if (!lines.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {lines.map((line, idx) => {
        const cleaned = line.replace(/^[\-•·]\s*/, "").trim();
        const isBullet = /^[\-•·]/.test(line);
        if (isBullet) {
          return (
            <div key={`${line}-${idx}`} className="flex gap-2 text-[14px] leading-relaxed text-ios-text">
              <span className="pt-[2px] text-[14px]">•</span>
              <p className="flex-1">{highlightInline(cleaned)}</p>
            </div>
          );
        }
        return (
          <p
            key={`${line}-${idx}`}
            className={tone === "strong" ? "text-[16px] font-semibold leading-relaxed text-ios-text" : "text-[14px] leading-relaxed text-ios-sub"}
          >
            {highlightInline(cleaned)}
          </p>
        );
      })}
    </div>
  );
}

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const { data, loading, generating, error } = useAIRecoveryInsights({ mode: "generate" });
  const topDrains = useMemo(() => data?.result.weeklySummary?.topDrains ?? [], [data]);
  const errorLines = useMemo(() => (error ? presentError(error, t) : []), [error, t]);
  const errorCode = useMemo(() => (error ? compactErrorCode(error) : ""), [error]);
  const rawBlocks = useMemo(() => {
    const text = data?.generatedText ?? "";
    if (!text) return { a: "", b: "", c: "", d: "" };
    return {
      a: normalizeBlock(extractSection(text, "A"), "A"),
      b: normalizeBlock(extractSection(text, "B"), "B"),
      c: normalizeBlock(extractSection(text, "C"), "C"),
      d: normalizeBlock(extractSection(text, "D"), "D"),
    };
  }, [data?.generatedText]);
  const blockBLines = useMemo(() => toLines(rawBlocks.b), [rawBlocks.b]);
  const blockCLines = useMemo(() => toLines(rawBlocks.c), [rawBlocks.c]);
  const blockDLines = useMemo(() => toLines(rawBlocks.d), [rawBlocks.d]);

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
            <p className="mt-2 text-[18px] font-semibold leading-relaxed tracking-[-0.01em] text-ios-text">
              {highlightInline(data.result.headline || t("요약이 비어 있어요."))}
            </p>
            {rawBlocks.a && rawBlocks.a !== data.result.headline ? renderBlockLines(toLines(rawBlocks.a), "normal") : null}
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">B · {t("긴급 알림")}</div>
            {data.result.compoundAlert ? (
              <>
                <p className="mt-2 text-[15px] leading-relaxed text-ios-text">{data.result.compoundAlert.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.result.compoundAlert.factors.map((factor) => (
                    <DetailChip key={factor} color="#E87485">
                      {factor}
                    </DetailChip>
                  ))}
                </div>
                {blockBLines.length ? renderBlockLines(blockBLines) : null}
              </>
            ) : (
              blockBLines.length ? renderBlockLines(blockBLines) : <p className="mt-2 text-[14px] text-ios-sub">{t("오늘은 복합 위험 알림이 없어요.")}</p>
            )}
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">C · {t("오늘의 회복 처방")}</div>
            {data.result.sections.length ? (
              <div className="mt-3 space-y-3">
                {data.result.sections.map((section) => (
                  <div
                    key={`${section.category}-${section.title}`}
                    className="rounded-2xl border border-ios-sep bg-white/85 p-4 shadow-apple-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ios-text">{section.title}</span>
                      <DetailChip color={severityColor(section.severity)}>
                        {severityLabel(section.severity, t)}
                      </DetailChip>
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">{section.description}</p>
                    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ios-text">
                      {section.tips.map((tip, idx) => (
                        <li key={`${section.category}-tip-${idx}`}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-ios-sub">{t("오늘은 추가 처방이 없어요.")}</p>
            )}
            {blockCLines.length ? (
              <div className="mt-4 rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3">
                <div className="text-[12px] font-semibold text-ios-sub">{t("AI 원문 전체")}</div>
                {renderBlockLines(blockCLines)}
              </div>
            ) : null}
          </DetailCard>

          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">D · {t("이번 주 AI 한마디")}</div>
            {data.result.weeklySummary ? (
              <>
                <p className="mt-2 text-[14px] leading-relaxed text-ios-text">
                  {t("이번 주 평균 배터리")} {data.result.weeklySummary.avgBattery}
                  {" · "}
                  {t("지난주 대비")} {data.result.weeklySummary.avgBattery - data.result.weeklySummary.prevAvgBattery}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">{data.result.weeklySummary.personalInsight}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">{data.result.weeklySummary.nextWeekPreview}</p>
                {blockDLines.length ? renderBlockLines(blockDLines) : null}
                {topDrains.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topDrains.map((drain) => (
                      <DetailChip key={`${drain.label}-${drain.pct}`} color="#1B2747">
                        {drain.label} {drain.pct}%
                      </DetailChip>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              blockDLines.length ? renderBlockLines(blockDLines) : <p className="mt-2 text-[14px] text-ios-sub">{t("주간 요약은 데이터가 더 쌓이면 표시돼요.")}</p>
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
