"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatMedSafetySourceDomain, getMedSafetySourceLabel, type MedSafetySource } from "@/lib/medSafetySources";
import { useI18n } from "@/lib/useI18n";

type MedSafetySourceButtonProps = {
  source: Pick<
    MedSafetySource,
    "url" | "title" | "domain" | "cited" | "organization" | "docType" | "effectiveDate" | "claimScope" | "official" | "supportStrength"
  >;
  variant?: "inline" | "rail" | "card";
  className?: string;
};

export function MedSafetySourceButton({ source, variant = "rail", className }: MedSafetySourceButtonProps) {
  const { t } = useI18n();
  const [isLaunching, setIsLaunching] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    setIsLaunching(true);
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setIsLaunching(false);
      timeoutRef.current = null;
    }, 420);
  };

  const label = getMedSafetySourceLabel(source);
  const domainLabel = formatMedSafetySourceDomain(source.domain);
  const cardMetaLabel =
    source.organization?.trim() || label || domainLabel || t("출처");
  const cardContextLabel =
    source.claimScope?.trim() ||
    source.docType?.trim() ||
    (source.official ? t("공식 문서") : source.supportStrength === "background" ? t("배경 참고") : t("직접 근거"));
  const dateLabel = source.effectiveDate?.trim() || "";

  if (variant === "card") {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        onClick={handleClick}
        aria-label={t("{label} 출처 열기", { label: source.title || label })}
        className={cn(
          "group relative flex min-h-[208px] min-w-[232px] max-w-[252px] shrink-0 snap-start flex-col overflow-hidden rounded-[28px] border border-[#E8E8EC] bg-white p-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[color:var(--rnest-accent-border)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)] active:scale-[0.985]",
          isLaunching && "scale-[0.99] shadow-[0_18px_42px_rgba(15,23,42,0.12)]",
          className
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[28px] border opacity-0 transition-opacity duration-200",
            source.cited ? "border-[color:var(--rnest-accent)]" : "border-[#94A3B8]",
            isLaunching && "animate-ping opacity-20"
          )}
        />
        <div className="relative z-[1] flex items-start justify-between gap-2">
          <span className="inline-flex max-w-[65%] items-center rounded-full border border-[#E6E8ED] bg-[#F7F7F8] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-ios-sub">
            <span className="truncate">{domainLabel || cardMetaLabel}</span>
          </span>
          {source.cited ? (
            <span className="inline-flex items-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
              {t("대표")}
            </span>
          ) : null}
        </div>

        <div className="relative z-[1] mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ios-sub/80">{cardMetaLabel}</div>
          <div className="mt-2 line-clamp-4 text-[15px] font-semibold leading-[1.45] tracking-[-0.015em] text-ios-text">
            {source.title || label}
          </div>
          <div className="mt-2 line-clamp-2 text-[12.5px] leading-[1.55] text-ios-sub">{cardContextLabel}</div>
        </div>

        <div className="relative z-[1] mt-auto pt-4">
          <div className="flex items-center justify-between gap-3 text-[12px] font-semibold text-ios-sub transition group-hover:text-[color:var(--rnest-accent)]">
            <span className="truncate">{dateLabel || t("원문 보기")}</span>
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path d="M7 6h7v7M13.5 6.5L6 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </a>
    );
  }

  const baseClassName =
    variant === "inline"
      ? "h-6 rounded-full px-2.5 text-[10.5px] font-semibold"
      : "h-8 rounded-full px-3.5 text-[11.5px] font-semibold";

  const toneClassName = source.cited
    ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
    : "border-[#D8DDE6] bg-[#F7F8FA] text-[#516074]";

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      aria-label={t("{label} 출처 열기", { label })}
      className={cn(
        "group relative inline-flex shrink-0 items-center justify-center overflow-hidden border shadow-[0_6px_18px_rgba(15,23,42,0.06)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)] active:scale-[0.96]",
        baseClassName,
        toneClassName,
        isLaunching && "scale-[0.97] shadow-[0_10px_24px_rgba(15,23,42,0.12)]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full border opacity-0 transition-opacity duration-200",
          source.cited ? "border-[color:var(--rnest-accent)]" : "border-[#94A3B8]",
          isLaunching && "animate-ping opacity-30"
        )}
      />
      <span className="relative z-[1] truncate">{label}</span>
    </a>
  );
}

export default MedSafetySourceButton;
