"use client";

import { cn } from "@/lib/cn";

type AnimatedCopyLabelProps = {
  copied: boolean;
  label: string;
  className?: string;
};

export function AnimatedCopyLabel({ copied, label, className }: AnimatedCopyLabelProps) {
  return (
    <span className={cn("relative inline-grid place-items-center", className)}>
      <span
        className={cn(
          "col-start-1 row-start-1 transition-all duration-200 ease-out",
          copied ? "translate-y-1 scale-90 opacity-0" : "translate-y-0 scale-100 opacity-100"
        )}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 flex items-center justify-center transition-all duration-200 ease-out",
          copied ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-90 opacity-0"
        )}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-[1.05em] w-[1.05em]">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.26a1 1 0 0 1-1.42 0L3.29 9.165a1 1 0 1 1 1.42-1.408l4.09 4.123 6.49-6.543a1 1 0 0 1 1.414-.006z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </span>
  );
}

export default AnimatedCopyLabel;
