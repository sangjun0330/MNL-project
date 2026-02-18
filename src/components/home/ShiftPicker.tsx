"use client";

import type { Shift } from "@/lib/types";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";

export function ShiftPicker({
  open,
  onClose,
  value,
  onChange,
  dateLabel,
  onResetToOff,
}: {
  open: boolean;
  onClose: () => void;
  value: Shift;
  onChange: (s: Shift) => void;
  dateLabel: string;
  onResetToOff: () => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet open={open} onClose={onClose} title={dateLabel}>
      <div className="grid grid-cols-2 gap-2">
        {SHIFT_LABELS.map((s) => {
          const active = s.id === value;
          const shortLabel = s.short ?? s.id;
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left transition",
                active ? "border-black/20 ring-2 ring-black/10" : "border-black/10 hover:border-black/15"
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold">{s.name}</div>
                  <div className="mt-0.5 text-[12px] text-black/55">{t(s.hint)}</div>
                </div>
                <span className={cn("inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold", shiftColor(s.id))}>
                  {shortLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={onResetToOff} className="w-full">
          {t("OFF로 초기화")}
        </Button>
        <Button onClick={onClose} className="w-full">
          {t("닫기")}
        </Button>
      </div>

      <div className="mt-4 rounded-2xl border border-black/10 bg-black/3 px-3 py-3 text-[12.5px] text-black/60">
        {t("팁: 간단하게 시작하려면")}{" "}
        <span className="font-semibold text-black/80">OFF</span>{" "}
        {t("부터 입력하고, 근무일만 D/E/N로 바꿔도 충분해요.")}
      </div>
    </BottomSheet>
  );
}
