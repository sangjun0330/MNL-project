import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

export const DETAIL_GRADIENTS = {
  mint: "linear-gradient(135deg, rgba(108,218,195,0.32), rgba(255,255,255,0.98))",
  pink: "linear-gradient(135deg, rgba(255,158,170,0.32), rgba(255,255,255,0.98))",
  navy: "linear-gradient(135deg, rgba(27,39,71,0.22), rgba(255,255,255,0.98))",
} as const;

export const DETAIL_ACCENTS = {
  mint: "#2FB8A3",
  pink: "#E87485",
  navy: "#1B2747",
} as const;

export function InsightDetailShell({
  title,
  subtitle,
  meta,
  children,
  right,
  backHref = "/insights",
  className,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
  backHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[920px] px-4 pb-24 pt-5 sm:px-6", className)}>
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={backHref}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text"
          aria-label="Back"
        >
          ‹
        </Link>
        <div className="flex-1 text-center">
          <div className="text-[17px] font-semibold tracking-[-0.01em] text-ios-text">{title}</div>
          {subtitle ? <div className="text-[12.5px] text-ios-muted">{subtitle}</div> : null}
        </div>
        <div className="flex h-9 w-9 items-center justify-center">{right}</div>
      </div>

      {meta ? <div className="mb-4 text-[12.5px] text-ios-sub">{meta}</div> : null}

      {children}
    </div>
  );
}

export function DetailSectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] font-bold tracking-[-0.01em] text-ios-text">{children}</div>;
}

export function DetailChip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-ios-sep bg-white/80 px-3 py-1 text-[12px] font-semibold leading-none whitespace-nowrap"
      style={color ? { color } : undefined}
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
  metric: string | number;
  metricLabel: string;
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
      style={{ backgroundImage: DETAIL_GRADIENTS[accent] }}
    >
      <div className="text-[12px] font-semibold text-ios-sub">{label}</div>
      <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{title}</div>

      <div className="mt-4 flex items-end gap-2">
        <div
          className="text-[36px] font-extrabold tracking-[-0.02em]"
          style={{ color: valueColor ?? accentColor }}
        >
          {metric}
        </div>
        <div className="pb-1 text-[14px] font-bold text-ios-text">{metricLabel}</div>
      </div>

      <div className="mt-2 text-[14px] text-ios-text">
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
  return (
    <div className={cn("rounded-apple border border-ios-sep bg-white shadow-apple", className)} style={style}>
      {children}
    </div>
  );
}
