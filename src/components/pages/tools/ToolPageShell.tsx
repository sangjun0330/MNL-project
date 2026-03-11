"use client";

import Link from "next/link";
import { useI18n } from "@/lib/useI18n";

type ToolPageShellProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: "new" | "local" | "ai";
  embedded?: boolean;
  children: React.ReactNode;
};

export function ToolPageShell({
  title,
  subtitle,
  badge,
  badgeVariant = "new",
  embedded = false,
  children,
}: ToolPageShellProps) {
  const { t } = useI18n();
  const badgeClass =
    badgeVariant === "ai"
      ? "bg-purple-100 text-purple-700"
      : badgeVariant === "local"
        ? "bg-gray-100 text-gray-600"
        : "bg-blue-100 text-blue-700";

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold tracking-[-0.015em] text-ios-text">{title}</h2>
            {subtitle ? <p className="mt-1 text-[13px] text-ios-sub">{subtitle}</p> : null}
          </div>
          {badge ? (
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
              {badge}
            </span>
          ) : null}
        </div>

        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <Link
        href="/tools"
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-ios-tint active:opacity-60"
      >
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="mr-0.5">
          <path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("툴")}
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-[-0.015em] text-ios-text">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-ios-sub">{subtitle}</p>}
        </div>
        {badge && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>

      {children}
    </div>
  );
}
