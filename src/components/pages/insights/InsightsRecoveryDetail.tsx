"use client";

import Link from "next/link";
import {
  InsightDetailShell,
  DetailChip,
  DETAIL_ACCENTS,
  DETAIL_GRADIENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function InsightsRecoveryDetail() {
  const { t } = useI18n();
  const { end, top1, top3, syncLabel, todayShift, ordersSummary, hasTodayShift, recordedDays } = useInsightsData();

  if (recordedDays < 7) {
    return (
      <InsightDetailShell
        title={t("맞춤 회복 처방")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 회복 처방이 열립니다.")}
      >
        <InsightsLockedNotice recordedDays={recordedDays} />
      </InsightDetailShell>
    );
  }

  const recoverySummary = top1
    ? `${t("회복 포커스")} · ${top1.label}`
    : `${t("회복 포커스")} · ${t("맞춤 회복")}`;
  const recoveryDetail = top1
    ? t("{label} 비중 {pct} · 회복 처방을 가장 먼저 확인하세요.", { label: top1.label, pct: pct(top1.pct) })
    : t("기록이 쌓이면 회복 처방이 더 정교해져요.");

  return (
    <InsightDetailShell
      title={t("맞춤 회복 처방")}
      subtitle={formatKoreanDate(end)}
      meta={t("기록(수면/스트레스/활동/카페인/기분/주기)을 근거로 회복 플랜을 제공합니다.")}
    >
      <div className="space-y-4">
        <Link
          href="/insights/recovery/orders"
          className="group block rounded-apple border border-ios-sep p-5 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
          style={{ backgroundImage: DETAIL_GRADIENTS.navy }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">Dr. WNL&apos;s Orders</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{t("오늘 오더")}</div>
            </div>
            <div className="text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <div className="text-[36px] font-extrabold tracking-[-0.02em]" style={{ color: DETAIL_ACCENTS.navy }}>
              {ordersSummary.count}
            </div>
            <div className="pb-1 text-[14px] font-bold text-ios-text">Orders</div>
          </div>
          <div className="mt-2 text-[14px] text-ios-text">
            <span className="font-bold" style={{ color: DETAIL_ACCENTS.navy }}>
              {t("즉시 실행 오더")} · {ordersSummary.headline}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("작은 오더부터 실행하면 회복 효율이 올라갑니다.")}</div>
          {hasTodayShift ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip>
            </div>
          ) : null}
        </Link>

        <Link
          href="/insights/recovery/plan"
          className="group block rounded-apple border border-ios-sep p-5 shadow-apple transition-shadow duration-300 hover:shadow-apple-lg"
          style={{ backgroundImage: DETAIL_GRADIENTS.mint }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">Personalized Recovery</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">
                {t("오늘부터 다음 듀티까지의 회복 처방")}
              </div>
            </div>
            <div className="text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <div className="text-[36px] font-extrabold tracking-[-0.02em]" style={{ color: DETAIL_ACCENTS.mint }}>
              {top1 ? pct(top1.pct) : "—"}
            </div>
            <div className="pb-1 text-[14px] font-bold text-ios-text">{top1 ? top1.label : t("핵심 요인")}</div>
          </div>

          <div className="mt-2 text-[14px] text-ios-text">
            <span className="font-bold" style={{ color: DETAIL_ACCENTS.mint }}>
              {recoverySummary}
            </span>
          </div>
          <div className="mt-1 text-[13px] text-ios-sub">{recoveryDetail}</div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DetailChip color={DETAIL_ACCENTS.mint}>{syncLabel}</DetailChip>
            {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.mint}>{shiftKo(todayShift)}</DetailChip> : null}
            {top3?.map((t) => (
              <DetailChip key={t.key} color={DETAIL_ACCENTS.mint}>
                TOP · {t.label} {pct(t.pct)}
              </DetailChip>
            ))}
          </div>
        </Link>
      </div>
    </InsightDetailShell>
  );
}
