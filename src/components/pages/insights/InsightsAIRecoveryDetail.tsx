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
    if (data.generatedText && data.generatedText.trim()) return data.generatedText.trim();
    return data.result.headline || t("AI 텍스트가 비어 있어요.");
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
