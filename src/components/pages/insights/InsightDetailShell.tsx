import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const DETAIL_GRADIENTS = {
  mint: "linear-gradient(135deg, rgba(0,122,255,0.16), rgba(255,255,255,0.98))",
  pink: "linear-gradient(135deg, rgba(255,158,170,0.24), rgba(255,255,255,0.98))",
  navy: "linear-gradient(135deg, rgba(27,39,71,0.16), rgba(255,255,255,0.98))",
} as const;

export const DETAIL_ACCENTS = {
  mint: "#007AFF",
  pink: "#E87485",
  navy: "#1B2747",
} as const;

export function InsightDetailShell({
  title,
  subtitle,
  meta,
  children,
  chips,
  tone = "mint",
  right,
  backHref = "/insights",
  className,
  chatMode = false,
  chatBottomBar,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  chips?: React.ReactNode;
  tone?: keyof typeof DETAIL_ACCENTS;
  right?: React.ReactNode;
  backHref?: string;
  className?: string;
  chatMode?: boolean;
  chatBottomBar?: ReactNode;
}) {
  if (chatMode) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-[#F7F7F8]">
        {/* ChatGPT-style header */}
        <div className="shrink-0 flex items-center bg-white border-b border-[rgba(0,0,0,0.06)] px-4 h-14 gap-2" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <Link
            href={backHref}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F2F2F7]"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-[#1C1C1E]" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="8" x2="21" y2="8" />
              <line x1="3" y1="14" x2="21" y2="14" />
              <line x1="3" y1="20" x2="21" y2="20" />
            </svg>
          </Link>
          <div className="flex-1 flex justify-center">
            <div className="inline-flex items-center gap-1">
              <span className="text-[17px] font-semibold text-[#1C1C1E]">{title}</span>
              {subtitle && (
                <span className="text-[14px] font-normal text-[rgba(28,28,30,0.56)]"> {subtitle}</span>
              )}
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-[rgba(28,28,30,0.4)] ml-0.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {right}
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn("mx-auto w-full max-w-[860px] px-3 pt-4 pb-6 sm:px-4 space-y-4", className)}>
            {children}
          </div>
        </div>

        {/* Bottom chat bar */}
        {chatBottomBar ? (
          <div className="shrink-0 bg-white border-t border-[rgba(0,0,0,0.06)]">
            {chatBottomBar}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-[920px] px-3 pb-24 pt-6 sm:px-4", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text shadow-apple-sm"
          aria-label="Back"
        >
          ‹
        </Link>
        <div className="flex h-9 min-w-[36px] items-center justify-center">{right}</div>
      </div>

      <div className="mb-4">
        <div className="text-[28px] font-extrabold tracking-[-0.02em] text-ios-text">{title}</div>
        {subtitle ? <div className="mt-1 text-[13px] text-ios-sub">{subtitle}</div> : null}
        <div className="mt-2 h-[3px] w-12 rounded-full" style={{ backgroundColor: `${DETAIL_ACCENTS[tone]}66` }} />
        {meta ? <div className="mt-2 text-[13px] text-ios-sub">{meta}</div> : null}
        {chips ? <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div> : null}
      </div>

      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function DetailSectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] font-bold tracking-[-0.01em] text-ios-text">{children}</div>;
}

export function DetailChip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-ios-sep bg-white px-3 py-1 text-[12px] font-semibold leading-none whitespace-nowrap shadow-apple-sm"
      style={color ? { color, borderColor: `${color}44` } : undefined}
    >
      {children}
    </span>
  );
}

export function DetailSummaryCard({
  accent,
  label,
  title,
  metric,
  metricLabel,
  summary,
  detail,
  chips,
  valueColor,
  className,
}: {
  accent: keyof typeof DETAIL_GRADIENTS;
  label: string;
  title: string;
  metric?: string | number | null;
  metricLabel?: string;
  summary: React.ReactNode;
  detail?: string;
  chips?: React.ReactNode;
  valueColor?: string;
  className?: string;
}) {
  const accentColor = DETAIL_ACCENTS[accent];
  return (
    <div
      className={cn("rounded-apple border border-ios-sep p-5 shadow-apple", className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${accentColor}12, rgba(255,255,255,0.98))` }}
    >
      <div className="text-[12px] font-semibold text-ios-sub">{label}</div>
      <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{title}</div>

      {metric != null && metricLabel ? (
        <div className="mt-4 flex items-end gap-2">
          <div
            className="text-[36px] font-extrabold tracking-[-0.02em]"
            style={{ color: valueColor ?? accentColor }}
          >
            {metric}
          </div>
          <div className="pb-1 text-[14px] font-bold text-ios-text">{metricLabel}</div>
        </div>
      ) : null}

      <div className={`${metric != null && metricLabel ? "mt-2" : "mt-4"} text-[14px] text-ios-text`}>
        <span className="font-bold" style={{ color: accentColor }}>
          {summary}
        </span>
      </div>

      {detail ? <div className="mt-1 text-[13px] text-ios-sub">{detail}</div> : null}

      {chips ? <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div> : null}
    </div>
  );
}

export function DetailCard({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const baseStyle: CSSProperties = {};
  return (
    <div
      className={cn("rounded-apple border border-ios-sep bg-white shadow-apple", className)}
      style={{ ...baseStyle, ...style }}
    >
      {children}
    </div>
  );
}
