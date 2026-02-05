"use client";

import Link from "next/link";
import { formatKoreanDate } from "@/lib/date";
import { statusLabel } from "@/lib/wnlInsight";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

function formatPct(p: number) {
  return `${Math.round(p * 100)}%`;
}

function StatsHubItem({
  href,
  label,
  title,
  metric,
  detail,
  className,
}: {
  href: string;
  label: string;
  title: string;
  metric: string;
  detail: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border border-ios-sep bg-white p-4 transition-shadow duration-300 hover:shadow-apple ${className ?? ""}`}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-ios-sub">{label}</div>
          <div className="mt-1 text-[16px] font-bold tracking-[-0.01em] text-ios-text">{title}</div>
        </div>
        <div className="text-[20px] text-ios-muted transition group-hover:text-ios-text">›</div>
      </div>
      <div className="mt-3 text-[28px] font-extrabold tracking-[-0.02em] text-ios-text">{metric}</div>
      <div className="mt-1 text-[13px] text-ios-sub">{detail}</div>
    </Link>
  );
}

export function InsightsPage() {
  const { t } = useI18n();
  const {
    end,
    todayShift,
    menstrual,
    todayDisplay,
    status,
    avgDisplay,
    avgBody,
    avgMental,
    top1,
    hasTodayShift,
    recordedDays,
  } = useInsightsData();

  if (isInsightsLocked(recordedDays)) {
    return (
      <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6 sm:px-6">
        <div className="mb-4">
          <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("통계 중심 인사이트")}</div>
        </div>

        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </div>
    );
  }

  const thievesMetric = top1 ? formatPct(top1.pct) : "—";
  const thievesDetail = top1
    ? t("{label} 비중 {pct} · 피로 요인을 줄여보세요.", {
        label: top1.label,
        pct: formatPct(top1.pct),
      })
    : t("방전 요인을 분석할 데이터가 부족해요.");

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-4">
        <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("통계 중심 인사이트")}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ios-sub">
        <span>{formatKoreanDate(end)}</span>
        {hasTodayShift ? (
          <>
            <span className="opacity-40">·</span>
            <span>{shiftKo(todayShift)}</span>
          </>
        ) : null}
        <span className="opacity-40">·</span>
        <span>{menstrual.enabled ? t(menstrual.label) : t("주기")}</span>
        <span className="opacity-40">·</span>
        <span>Vital {todayDisplay}</span>
      </div>

      <section className="mt-4 rounded-apple border border-ios-sep bg-[linear-gradient(135deg,rgba(108,218,195,0.16),rgba(255,255,255,0.96))] p-5 shadow-apple">
        <div>
          <div className="text-[12px] font-semibold text-ios-sub">{t("통계 허브")}</div>
          <div className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-ios-text">{t("통계")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("통계와 알고리즘 결과를 한 곳에서 확인하세요.")}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatsHubItem
            href="/insights/vital"
            label="WNL Vital"
            title={t("오늘 바이탈 요약")}
            metric={`${todayDisplay} / 100`}
            detail={t(statusLabel(status))}
            className="sm:col-span-2"
          />
          <StatsHubItem
            href="/insights/thieves"
            label="Battery Thieves"
            title={t("에너지 도둑")}
            metric={thievesMetric}
            detail={thievesDetail}
          />
          <StatsHubItem
            href="/insights/trends"
            label="Stats"
            title={t("최근 7일 통계")}
            metric={`Vital ${avgDisplay}`}
            detail={`Body ${avgBody} · Mental ${avgMental}`}
          />
        </div>
      </section>
    </div>
  );
}
