// src/components/home/MonthCalendar.tsx
"use client";

import { useMemo, useRef } from "react";
import type { PointerEvent } from "react";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/date";
import { addDays, addMonths, formatMonthTitle, startOfMonth, toISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";
import type { BioInputs, EmotionEntry, MenstrualSettings } from "@/lib/model";
import { menstrualContextForDate } from "@/lib/menstrual";
import { useAppStoreSelector } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

type RiskTone = "green" | "orange" | "red";

type Props = {
  month: Date;
  onMonthChange?: (d: Date) => void;

  schedule: Record<ISODate, Shift | undefined>;
  shiftNames?: Record<ISODate, string | undefined>;
  notes?: Record<ISODate, string | undefined>;
  bio?: Record<ISODate, BioInputs | undefined>;
  emotions?: Record<ISODate, EmotionEntry | undefined>;
  menstrual?: MenstrualSettings;

  // 3교대 패턴을 적용한 시작일(이전 날짜에는 표시만 숨김)
  scheduleAppliedFrom?: ISODate | null;

  riskColorByDate?: Record<ISODate, RiskTone>;
  lowScoreByDate?: Record<ISODate, boolean>;
  selected: ISODate;
  onSelect: (iso: ISODate) => void;
};

function firstLine(note?: string) {
  if (!note) return "";
  const cleaned = note.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return "";
  return cleaned.split("\n")[0].trim();
}

function moodEmoji(m: number) {
  return m === 1 ? "☹️" : m === 2 ? "😕" : m === 3 ? "😐" : m === 4 ? "🙂" : "😄";
}

function workEventSummary(bio?: BioInputs | null) {
  const tags = Array.isArray(bio?.workEventTags)
    ? bio.workEventTags.map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (tags.length) {
    const first = tags[0];
    return tags.length > 1 ? `${first} +${tags.length - 1}` : first;
  }
  const note = typeof bio?.workEventNote === "string" ? firstLine(bio.workEventNote) : "";
  return note || "";
}

function phaseColor(phase: string) {
  if (phase === "period") return "bg-rose-500";
  if (phase === "pms") return "bg-amber-500";
  if (phase === "ovulation") return "bg-sky-500";
  if (phase === "follicular") return "bg-blue-500";
  if (phase === "luteal") return "bg-indigo-600";
  return "bg-transparent";
}

export function MonthCalendar({
  month,
  onMonthChange,
  schedule,
  shiftNames,
  notes,
  bio,
  emotions,
  menstrual,
  scheduleAppliedFrom,
  riskColorByDate: _riskColorByDate,
  lowScoreByDate,
  selected,
  onSelect,
}: Props) {
  const { t } = useI18n();
  // ✅ menstrual prop이 안 넘어오는 화면에서도 표시되도록 store fallback
  const menstrualFallback = useAppStoreSelector((s) => s.settings.menstrual);
  const menstrualEffective: MenstrualSettings | undefined = menstrual ?? (menstrualFallback as any);

  const weekdays = useMemo(() => [t("일"), t("월"), t("화"), t("수"), t("목"), t("금"), t("토")], [t]);

  const start = useMemo(() => startOfMonth(month), [month]);

  const grid = useMemo(() => {
    const startWeekday = start.getDay(); // 0:Sun
    const gridStart = addDays(start, -startWeekday);

    const days: { d: Date; iso: ISODate; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const iso = toISODate(d);
      const inMonth = d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
      days.push({ d, iso, inMonth });
    }

    const weeks: typeof days[] = [];
    for (let w = 0; w < 6; w++) weeks.push(days.slice(w * 7, (w + 1) * 7));

    let first = 0;
    while (first < 5 && !weeks[first].some((c) => c.inMonth)) first++;

    let last = 5;
    while (last > 0 && !weeks[last].some((c) => c.inMonth)) last--;

    return weeks.slice(first, last + 1).flat();
  }, [start, month]);

  const menstrualPhaseByISO = useMemo(() => {
    const m = new Map<ISODate, string>();

    if (!menstrualEffective?.enabled || !menstrualEffective.lastPeriodStart) return m;

    const all = new Set<ISODate>();
    for (const c of grid) {
      all.add(c.iso);
      all.add(toISODate(addDays(c.d, -1)));
      all.add(toISODate(addDays(c.d, 1)));
    }

    for (const iso of all) {
      const ctx = menstrualContextForDate(iso, menstrualEffective);
      if (
        ctx.phase === "period" ||
        ctx.phase === "pms" ||
        ctx.phase === "ovulation" ||
        ctx.phase === "follicular" ||
        ctx.phase === "luteal"
      ) {
        m.set(iso, ctx.phase);
      }
    }
    return m;
  }, [grid, menstrualEffective]);

  // ✅ 모바일 스크롤 중 "날짜 선택" 오작동 방지
  // - pointermove가 오지 않는 스크롤 케이스가 있어 window.scrollY 변화도 함께 체크
  const tap = useRef<{
    id: number | null;
    x: number;
    y: number;
    scrollY: number;
    moved: boolean;
  }>({ id: null, x: 0, y: 0, scrollY: 0, moved: false });
  const TAP_MOVE_PX = 8;

  const beginTap = (e: PointerEvent) => {
    tap.current.id = e.pointerId;
    tap.current.x = e.clientX;
    tap.current.y = e.clientY;
    tap.current.scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    tap.current.moved = false;
  };

  const moveTap = (e: PointerEvent) => {
    if (tap.current.id !== e.pointerId) return;
    const dx = e.clientX - tap.current.x;
    const dy = e.clientY - tap.current.y;
    if (Math.abs(dx) > TAP_MOVE_PX || Math.abs(dy) > TAP_MOVE_PX) tap.current.moved = true;
  };

  const endTap = (e: PointerEvent, iso: ISODate) => {
    if (tap.current.id !== e.pointerId) return;
    const scrolled = typeof window !== "undefined" ? Math.abs(window.scrollY - tap.current.scrollY) > 2 : false;
    const moved = tap.current.moved || scrolled;
    tap.current.id = null;
    if (moved) return; // 스크롤/드래그로 판단 → 선택 금지

    // iOS Safari에서 날짜 버튼이 focus/active 상태로 남으면서
    // 시트 위에 선택 테두리(네모)가 떠 보이는 현상 방지
    try {
      (e.target as HTMLElement | null)?.closest?.("button")?.blur?.();
    } catch {
      // ignore
    }
    onSelect(iso);
  };

  const cancelTap = (e: PointerEvent) => {
    if (tap.current.id === e.pointerId) tap.current.id = null;
  };

  return (
    <div className="rounded-apple border border-ios-sep bg-white p-4 shadow-apple">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[18px] font-semibold">{formatMonthTitle(month)}</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">{t("날짜를 눌러 기록/편집")}</div>
        </div>

        {onMonthChange ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-2xl border border-ios-sep bg-white px-3 py-2 text-[12.5px] font-semibold"
              onClick={() => onMonthChange(addMonths(month, -1))}
            >
              {t("이전")}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-ios-sep bg-white px-3 py-2 text-[12.5px] font-semibold"
              onClick={() => onMonthChange(addMonths(month, 1))}
            >
              {t("다음")}
            </button>
          </div>
        ) : null}
      </div>

      {/* Weekdays */}
      <div className="mt-4 grid grid-cols-7 border-b border-ios-sep text-[12px] font-semibold text-ios-muted">
        {weekdays.map((w) => (
          <div key={w} className="py-2 text-center">
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-l border-t border-ios-sep">
        {grid.map((cell) => {
          const iso = cell.iso;
          const isSelected = iso === selected;
          const isLowScore = Boolean(cell.inMonth && lowScoreByDate?.[iso]);

          const shift = schedule[iso];
          const shiftName = shiftNames?.[iso];
          const note = firstLine(notes?.[iso]);
          const workEvent = workEventSummary(bio?.[iso]);
          const emo = emotions?.[iso];

          const phase = menstrualPhaseByISO.get(iso);
          const prevPhase = menstrualPhaseByISO.get(toISODate(addDays(cell.d, -1)));
          const nextPhase = menstrualPhaseByISO.get(toISODate(addDays(cell.d, 1)));
          const roundL = !!phase && prevPhase !== phase;
          const roundR = !!phase && nextPhase !== phase;

          const shiftVisible = cell.inMonth && !!shift && (!scheduleAppliedFrom || cell.iso >= scheduleAppliedFrom);
          const workEventVisible = cell.inMonth && !!workEvent;
          const noteVisible = cell.inMonth && !!note;
          const emoVisible = cell.inMonth && !!emo;

          const shiftChipClass = (s: string) => {
            switch (s) {
              case "D":
                return "bg-blue-100 text-blue-900";
              case "E":
                return "bg-fuchsia-100 text-fuchsia-900";
              case "N":
                return "bg-violet-100 text-violet-900";
              case "M":
                return "bg-cyan-100 text-cyan-900";
              case "OFF":
                return "bg-emerald-100 text-emerald-900";
              case "VAC":
                return "bg-amber-100 text-amber-900";
              default:
                return "bg-ios-bg text-ios-text";
            }
          };

          const chips: Array<{ key: string; text: string; className: string; compact?: boolean }> = [];

          if (shiftVisible) {
            const rawLabel = shiftName?.trim();
            const customLabel =
              rawLabel && rawLabel.length > 5 ? `${rawLabel.slice(0, 5)}…` : rawLabel || "";
            const shiftLabel =
              customLabel || (shift === "OFF" ? "OFF" : shift === "VAC" ? "VA" : shift);
            chips.push({
              key: "shift",
              text: shiftLabel,
              className: shiftChipClass(shift),
              compact: true,
            });
          }
          if (workEventVisible) {
            chips.push({
              key: "work-event",
              text: workEvent,
              className: "bg-slate-100 text-slate-800",
            });
          }
          if (emoVisible) {
            chips.push({
              key: "emotion",
              text: `${moodEmoji(emo!.mood)} ${emo!.tags?.[0] ?? ""}`.trim(),
              className: "bg-ios-bg text-ios-text",
            });
          }
          if (noteVisible) {
            chips.push({ key: "note", text: note!, className: "bg-blue-100 text-blue-900" });
          }

          return (
            <button
              key={iso}
              type="button"
              onPointerDown={beginTap}
              onPointerMove={moveTap}
              onPointerUp={(e) => endTap(e, iso)}
              onPointerCancel={cancelTap}
              className={cn(
                "relative border-b border-r border-ios-sep bg-white text-left transition",
                "h-[92px] sm:h-[104px]",
                "touch-manipulation select-none",
                !cell.inMonth && "bg-white/70",
                isLowScore && "bg-rose-50/80",
                isSelected ? "z-10" : "hover:bg-ios-bg/60"
              )}
            >
              {isSelected ? (
                <span className="pointer-events-none absolute inset-0 z-20">
                  <span className="absolute inset-[2px] rounded-[10px] border border-black" />
                </span>
              ) : null}

              <div className="flex h-full flex-col px-2 py-1">
                {/* 날짜 */}
                <div className="flex items-start justify-between gap-1">
                  <div className={cn("text-[13px] font-semibold", cell.inMonth ? "text-ios-text" : "text-ios-muted")}>
                    {cell.inMonth ? cell.d.getDate() : ""}
                  </div>
                </div>

                {/* 생리주기 줄 */}
                {cell.inMonth && phase ? (
                  <div
                    className={cn(
                      "-mx-2 mt-0.5 h-[4px]",
                      roundL ? "rounded-l-full" : "",
                      roundR ? "rounded-r-full" : "",
                      phaseColor(phase)
                    )}
                  />
                ) : (
                  <div className="mt-0.5 h-[4px]" />
                )}

                {/* 칩들 */}
                <div className="mt-0.5 space-y-[2px]">
                  {chips.slice(0, 3).map((c) => (
                    <div
                      key={c.key}
                      className={cn(
                        "w-full rounded-md px-2 font-semibold leading-none",
                        c.compact ? "py-[1.5px] text-[10.5px]" : "py-[2px] text-[11px]",
                        c.className
                      )}
                    >
                      <span className="block truncate">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
