"use client";

import { useMemo } from "react";
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

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const { data, loading, error } = useAIRecoveryInsights();
  const topDrains = useMemo(() => data?.result.weeklySummary?.topDrains ?? [], [data]);
  const errorLines = useMemo(() => (error ? presentError(error, t) : []), [error, t]);

  return (
    <InsightDetailShell
      title={t("AI 맞춤회복")}
      subtitle={data ? formatKoreanDate(data.dateISO) : ""}
      meta={t("AI가 생성한 텍스트 결과")}
      tone="navy"
      backHref="/insights"
    >
      {loading ? (
        <DetailCard className="p-5">
          <div className="text-[14px] font-semibold text-ios-sub">{t("OpenAI 분석 중...")}</div>
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
          {error ? <div className="mt-3 text-[12px] text-ios-muted">[debug] {error}</div> : null}
        </DetailCard>
      ) : null}

      {!loading && data ? (
        <>
          <DetailCard className="p-5">
            <div className="text-[13px] font-semibold text-ios-sub">A · {t("한줄 요약")}</div>
            <p className="mt-2 text-[22px] font-extrabold leading-snug tracking-[-0.02em] text-ios-text">
              {data.result.headline || t("요약이 비어 있어요.")}
            </p>
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
              </>
            ) : (
              <p className="mt-2 text-[14px] text-ios-sub">{t("오늘은 복합 위험 알림이 없어요.")}</p>
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
              <p className="mt-2 text-[14px] text-ios-sub">{t("주간 요약은 데이터가 더 쌓이면 표시돼요.")}</p>
            )}
          </DetailCard>
        </>
      ) : null}
    </InsightDetailShell>
  );
}
