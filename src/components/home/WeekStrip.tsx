"use client";

import { useMemo } from "react";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, todayISO, toISODate } from "@/lib/date";
import type { BioInputs } from "@/lib/model";
import type { Shift } from "@/lib/types";
import { useI18n } from "@/lib/useI18n";

const SHIFT_DOT: Record<string, string> = {
  D: "bg-blue-400",
  E: "bg-fuchsia-400",
  N: "bg-violet-500",
  M: "bg-cyan-400",
  OFF: "bg-emerald-400",
  VAC: "bg-amber-400",
};

const SHIFT_LABEL: Record<string, string> = {
  D: "D",
  E: "E",
  N: "N",
  M: "M",
  OFF: "OFF",
  VAC: "VAC",
};

type Props = {
  selected: ISODate;
  onSelect: (iso: ISODate) => void;
  schedule: Record<ISODate, Shift | undefined>;
  shiftNames?: Record<ISODate, string | undefined>;
  bio?: Record<ISODate, BioInputs | undefined>;
};

function compactWorkEventLabel(bio?: BioInputs | null) {
  const tags = Array.isArray(bio?.workEventTags)
    ? bio.workEventTags.map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (tags.length) {
    const first = tags[0];
    return tags.length > 1 ? `${first}+${tags.length - 1}` : first;
  }

  const note = typeof bio?.workEventNote === "string" ? bio.workEventNote.replace(/\s+/g, " ").trim() : "";
  return note || null;
}

export function WeekStrip({ selected, onSelect, schedule, shiftNames, bio }: Props) {
  const { t } = useI18n();
  const today = todayISO();

  const days = useMemo(() => {
    const todayDate = fromISODate(today);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(todayDate, i - 3);
      return toISODate(date);
    });
  }, [today]);

  const weekdayLabels = [t("일"), t("월"), t("화"), t("수"), t("목"), t("금"), t("토")];

  return (
    <div className="flex items-center justify-between gap-1 px-1">
      {days.map((iso) => {
        const d = fromISODate(iso);
        const dow = d.getUTCDay();
        const dayNum = d.getUTCDate();
        const shift = schedule[iso];
        const eventText = compactWorkEventLabel(bio?.[iso]);
        const isSelected = iso === selected;
        const isToday = iso === today;

        return (
          <button
            key={iso}
            onClick={() => onSelect(iso)}
            className={[
              "flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-2.5 transition-all duration-150 active:scale-95",
              isSelected
                ? "bg-[var(--rnest-accent)] text-white"
                : "text-[var(--rnest-text)]",
            ].join(" ")}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {/* 요일 */}
            <span
              className={[
                "text-[11px] font-medium",
                isSelected ? "text-white/70" : "text-[var(--rnest-muted)]",
              ].join(" ")}
            >
              {weekdayLabels[dow]}
            </span>

            {/* 날짜 숫자 */}
            <span
              className={[
                "text-[17px] font-semibold leading-none",
                isSelected
                  ? "text-white"
                  : isToday
                  ? "text-[var(--rnest-accent)]"
                  : "text-[var(--rnest-text)]",
              ].join(" ")}
            >
              {dayNum}
            </span>

            {/* 근무 도트 */}
            <div className="h-4 flex items-center justify-center">
              {shift ? (
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
                    isSelected
                      ? "bg-white/20 text-white"
                      : `${SHIFT_DOT[shift] ?? "bg-black/20"} text-white`,
                  ].join(" ")}
                >
                  {shiftNames?.[iso]?.trim().slice(0, 3) || SHIFT_LABEL[shift] || shift}
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
              )}
            </div>

            {/* 근무 이벤트 (태그/메모 요약) */}
            <div className="h-3 w-full px-0.5">
              {eventText ? (
                <div
                  className={[
                    "truncate text-center text-[8.5px] font-medium leading-none",
                    isSelected ? "text-white/85" : "text-[var(--rnest-sub)]",
                  ].join(" ")}
                  title={eventText}
                >
                  {eventText}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
