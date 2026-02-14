"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

type Props<T extends string> = {
  value: T;
  onValueChange?: (v: T) => void;
  onChange?: (v: T) => void; // ✅ alias
  options: readonly SegmentedOption<T>[];
  className?: string;
};

export function Segmented<T extends string>({
  value,
  onValueChange,
  onChange,
  options,
  className,
}: Props<T>) {
  const handler = onValueChange ?? onChange;

  return (
    <div className={cn("flex w-full rounded-2xl border border-ios-sep bg-[#F8F8FB] p-1", className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handler?.(opt.value)}
            className={cn(
              "flex-1 rounded-xl border px-3 py-2 text-[14px] font-semibold transition whitespace-nowrap",
              active
                ? "border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                : "border-transparent bg-transparent text-ios-muted hover:bg-white"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
