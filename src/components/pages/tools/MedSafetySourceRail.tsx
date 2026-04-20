"use client";

import { getMedSafetySourceLabel, type MedSafetyGroundingMode, type MedSafetyGroundingStatus, type MedSafetySource } from "@/lib/medSafetySources";
import { useI18n } from "@/lib/useI18n";

type MedSafetySourceRailProps = {
  sources: MedSafetySource[];
  groundingMode: MedSafetyGroundingMode;
  groundingStatus: MedSafetyGroundingStatus;
  groundingError?: string | null;
  className?: string;
};

function joinClassNames(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function MedSafetySourceRail(props: MedSafetySourceRailProps) {
  const { t } = useI18n();
  const { sources, groundingMode, groundingStatus, className } = props;

  if (groundingMode === "none") return null;

  if (groundingStatus === "failed") {
    return (
      <div
        className={joinClassNames(
          "rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-4 text-[13px] leading-6 text-amber-800",
          className
        )}
      >
        <div className="font-semibold">{t("웹 근거를 불러오지 못해 AI 답변만 표시 중입니다.")}</div>
      </div>
    );
  }

  if (!sources.length) return null;

  return (
    <div className={joinClassNames("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-[#E6E8ED] bg-[#F7F7F8] px-3 py-1.5 text-[11px] font-semibold text-ios-sub">
          {t("근거 출처 {count}개", { count: sources.length })}
        </span>
        {sources.filter((source) => source.cited).slice(0, 3).map((source) => (
          <a
            key={`${source.url}-pill`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full border border-[#DDD6F3] bg-white px-3 py-1.5 text-[11px] font-semibold text-ios-text transition hover:border-[color:var(--rnest-accent-border)] hover:text-[color:var(--rnest-accent)]"
          >
            {getMedSafetySourceLabel(source)}
          </a>
        ))}
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="group min-w-[240px] max-w-[280px] snap-start rounded-[28px] border border-[#E8E8EC] bg-white px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition hover:border-[color:var(--rnest-accent-border)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full border border-[#E6E8ED] bg-[#F7F7F8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-ios-sub">
                {source.domain}
              </span>
              {source.cited ? (
                <span className="rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                  {t("대표 출처")}
                </span>
              ) : null}
            </div>
            <div className="mt-3 line-clamp-3 text-[14px] font-semibold leading-6 text-ios-text">{source.title}</div>
            <div className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-ios-sub transition group-hover:text-[color:var(--rnest-accent)]">
              <span>{t("원문 보기")}</span>
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M7 6h7v7M13.5 6.5L6 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default MedSafetySourceRail;
