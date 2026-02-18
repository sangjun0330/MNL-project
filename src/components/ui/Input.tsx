"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  /** optional label for accessibility */
  label?: string;
};

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { className, label, id, ...props },
  ref
) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-")}` : undefined);

  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1 block text-[12px] font-medium text-ios-muted"
        >
          {label}
        </label>
      ) : null}

      <input
        ref={ref}
        id={inputId}
        className={cn(
          "h-11 w-full rounded-2xl border border-ios-sep bg-white px-4 text-[15px] text-ios-text",
          "placeholder:text-ios-muted/70",
          "focus:outline-none focus:ring-2 focus:ring-[color:var(--wnl-accent-border)]",
          className
        )}
        {...props}
      />
    </div>
  );
});
