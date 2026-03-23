"use client";

import type { AIRecoverySlot } from "@/lib/aiRecovery";
import { cn } from "@/lib/cn";

type AIRecoverySlotTabsProps = {
  value: AIRecoverySlot;
  onChange: (slot: AIRecoverySlot) => void;
  className?: string;
};

const SLOT_OPTIONS: Array<{ value: AIRecoverySlot; label: string }> = [
  { value: "wake", label: "기상 후" },
  { value: "postShift", label: "퇴근 후" },
];

export function AIRecoverySlotTabs({ value, onChange, className }: AIRecoverySlotTabsProps) {
  return (
    <div className={cn("inline-flex rounded-full bg-[#F3F5F8] p-1", className)}>
      {SLOT_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-4 py-2 text-[13px] font-semibold tracking-[-0.01em] transition",
              active ? "bg-white text-[#111827] shadow-[0_6px_18px_rgba(15,23,42,0.08)]" : "text-[#7A8597]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
