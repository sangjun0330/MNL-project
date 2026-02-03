"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, Props>(
  function Textarea({ className, label, id, ...props }, ref) {
    const textareaId =
      id ?? (label ? `textarea-${label.replace(/\s+/g, "-")}` : undefined);

    return (
      <div className="w-full">
        {label ? (
          <label
            htmlFor={textareaId}
            className="mb-1 block text-[12px] font-medium text-ios-muted"
          >
            {label}
          </label>
        ) : null}

        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "min-h-[96px] w-full resize-none rounded-2xl border border-ios-sep bg-white px-4 py-3 text-[15px] text-ios-text",
            "placeholder:text-ios-muted/70",
            "focus:outline-none focus:ring-2 focus:ring-black/10",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
