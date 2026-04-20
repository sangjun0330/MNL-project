"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getMedSafetySourceLabel, type MedSafetySource } from "@/lib/medSafetySources";
import { useI18n } from "@/lib/useI18n";

type MedSafetySourceButtonProps = {
  source: Pick<MedSafetySource, "url" | "title" | "domain" | "cited">;
  variant?: "inline" | "rail";
  className?: string;
};

export function MedSafetySourceButton({ source, variant = "rail", className }: MedSafetySourceButtonProps) {
  const { t } = useI18n();
  const [isLaunching, setIsLaunching] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const label = getMedSafetySourceLabel(source);

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
