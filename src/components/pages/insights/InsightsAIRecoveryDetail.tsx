"use client";

import { useMemo } from "react";
import { InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const { data, loading, error } = useAIRecoveryInsights();

  const text = useMemo(() => {
    if (loading) return t("OpenAI 분석 중...");
    if (!data) {
      if (error) return `${t("AI 호출에 실패했어요. 잠시 후 다시 시도해 주세요.")}\n\n${error}`;
      return t("AI 호출 대기 중...");
    }

    const lines: string[] = [];
    const result = data.result;

    lines.push(`A. ${t("한줄 요약")}`);
    lines.push(result.headline || "-");

    if (result.compoundAlert) {
      lines.push("");
      lines.push(`B. ${t("긴급 알림")}`);
      lines.push(result.compoundAlert.message || "-");
      if (result.compoundAlert.factors?.length) {
        lines.push(`[${result.compoundAlert.factors.join("] [")}]`);
      }
    }

    lines.push("");
    lines.push(`C. ${t("오늘의 회복 처방")}`);
    if (result.sections.length) {
      for (const section of result.sections) {
        lines.push("");
        lines.push(`${section.title}`);
        lines.push(section.description);
        for (const tip of section.tips) lines.push(`- ${tip}`);
      }
    } else {
      lines.push(t("처방 섹션이 아직 없어요. 기록이 쌓이면 자동으로 생성돼요."));
    }

    if (result.weeklySummary) {
      lines.push("");
      lines.push(`D. ${t("이번 주 AI 한마디")}`);
      lines.push(
        `${t("이번 주 평균 배터리")}: ${result.weeklySummary.avgBattery} (${t("지난주 대비")} ${
          result.weeklySummary.avgBattery - result.weeklySummary.prevAvgBattery
        })`
      );
      lines.push(result.weeklySummary.personalInsight);
      lines.push(result.weeklySummary.nextWeekPreview);
    }

    return lines.join("\n");
  }, [data, error, loading, t]);

  return (
    <InsightDetailShell
      title={t("AI 맞춤회복")}
      subtitle={data ? formatKoreanDate(data.dateISO) : ""}
      meta={t("AI가 생성한 텍스트 결과")}
      tone="navy"
      backHref="/insights"
    >
      <textarea
        readOnly
        value={text}
        className="min-h-[520px] w-full resize-none rounded-2xl border border-ios-sep bg-white p-4 text-[15px] leading-relaxed text-ios-text shadow-apple"
      />
    </InsightDetailShell>
  );
}
