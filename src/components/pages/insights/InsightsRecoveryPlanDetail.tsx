"use client";

import {
  InsightDetailShell,
  DetailSummaryCard,
  DetailChip,
  DETAIL_ACCENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { RecoveryPrescription } from "@/components/insights/RecoveryPrescription";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsRecoveryPlanDetail() {
  const { t, lang } = useI18n();
  const { end, state, top1, top3, syncLabel, todayShift, hasTodayShift, recordedDays } = useInsightsData();

  if (recordedDays < 7) {
    return (
      <InsightDetailShell
        title={t("다음 듀티까지 회복 처방")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 회복 처방이 열립니다.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} />
      </InsightDetailShell>
    );
  }

  const summary = top1 ? (
    <>
      <span className="font-bold">{t("회복 포커스")}</span> · {top1.label}
    </>
  ) : (
    <span className="font-bold">{t("회복 포커스")}</span>
  );

  const detail = top1
    ? t("{label} 비중 {pct} · 회복 처방을 가장 먼저 확인하세요.", { label: top1.label, pct: pct(top1.pct) })
    : t("기록이 쌓이면 회복 처방이 더 정교해져요.");

  return (
    <InsightDetailShell
      title={t("다음 듀티까지 회복 처방")}
      subtitle={formatKoreanDate(end)}
      meta={t("기록(수면/스트레스/활동/카페인/기분/주기)을 근거로 회복 플랜을 제공합니다.")}
      backHref="/insights/recovery"
    >
      <DetailSummaryCard
        accent="mint"
        label="Personalized Recovery"
        title={t("오늘부터 다음 듀티까지의 회복 처방")}
        metric={top1 ? pct(top1.pct) : "—"}
        metricLabel={top1 ? top1.label : t("핵심 요인")}
        summary={summary}
        detail={detail}
        chips={(
          <>
            <DetailChip color={DETAIL_ACCENTS.mint}>{syncLabel}</DetailChip>
            {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.mint}>{shiftKo(todayShift)}</DetailChip> : null}
            {top3?.map((t) => (
              <DetailChip key={t.key} color={DETAIL_ACCENTS.mint}>
                TOP · {t.label} {pct(t.pct)}
              </DetailChip>
            ))}
          </>
        )}
      />

      <div className="mt-4">
        {lang === "en" ? (
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[16px] font-bold text-ios-text">{t("맞춤 회복 플랜")}</div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("영어 모드에서는 핵심 회복 가이드를 간단히 보여줘요.")}</div>
            <ul className="mt-3 space-y-2 text-[13px] text-ios-text">
              <li>• {t("오늘 오더부터 확인하고, 다음 듀티 전 수면/수분/카페인 컷오프를 맞춰 주세요.")}</li>
              <li>• {t("피로가 높으면 업무 강도를 낮추고, 60~90분마다 짧은 회복 루틴을 넣어 주세요.")}</li>
              <li>• {t("연속 야간 근무 중이라면 회복 우선으로 일정 밀도를 줄여 주세요.")}</li>
            </ul>
          </div>
        ) : (
          <RecoveryPrescription state={state} pivotISO={end} />
        )}
      </div>
    </InsightDetailShell>
  );
}
