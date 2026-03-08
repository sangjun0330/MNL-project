"use client";

import { useEffect, useMemo, useState } from "react";
import { SocialCalendarIcon } from "@/components/social/SocialIcons";

type Props = {
  title: string;
  subtitle: string;
  dates: string[];
  selectedLabels: string[];
  selectedCount: number;
  availableCount: number;
  selectionNoun: string;
  onSelectClick: () => void;
  emptyText: string;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatKorean(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(`${iso}T00:00:00`);
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

function formatKoreanShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(`${iso}T00:00:00`);
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}/${d}(${weekday})`;
}

export function SocialSelectableCommonOffCard({
  title,
  subtitle,
  dates,
  selectedLabels,
  selectedCount,
  availableCount,
  selectionNoun,
  onSelectClick,
  emptyText,
}: Props) {
  const [todayISO, setTodayISO] = useState("");
  const [nearestDaysUntil, setNearestDaysUntil] = useState<number | null>(null);
  const [nearestDate, setNearestDate] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    setTodayISO(today);

    const future = dates.filter((date) => date >= today).sort();
    if (future.length === 0) {
      setNearestDaysUntil(null);
      setNearestDate(null);
      return;
    }

    const nearest = future[0];
    const todayMs = new Date(`${today}T00:00:00`).getTime();
    const nearestMs = new Date(`${nearest}T00:00:00`).getTime();
    setNearestDate(nearest);
    setNearestDaysUntil(Math.round((nearestMs - todayMs) / (1000 * 60 * 60 * 24)));
  }, [dates]);

  const summaryChips = useMemo(() => {
    if (selectedCount === 0) {
      return [
        { key: "mine", text: "내 일정 포함", tone: "accent" as const },
        { key: "none", text: `${selectionNoun} 선택 없음`, tone: "neutral" as const },
      ];
    }

    if (selectedCount === availableCount) {
      return [
        { key: "mine", text: "내 일정 포함", tone: "accent" as const },
        {
          key: "all",
          text: `전체 ${selectionNoun} ${availableCount}명`,
          tone: "neutral" as const,
        },
      ];
    }

    const visibleLabels = selectedLabels.slice(0, 3).map((label, index) => ({
      key: `${label}-${index}`,
      text: label,
      tone: "neutral" as const,
    }));
    if (selectedLabels.length > 3) {
      visibleLabels.push({
        key: "more",
        text: `+${selectedLabels.length - 3}`,
        tone: "neutral" as const,
      });
    }

    return [{ key: "mine", text: "내 일정 포함", tone: "accent" as const }, ...visibleLabels];
  }, [availableCount, selectedCount, selectedLabels, selectionNoun]);

  return (
    <div className="rounded-apple border border-ios-sep bg-white px-4 py-3 shadow-apple">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
              <SocialCalendarIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="text-[13.5px] font-semibold text-ios-text">{title}</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-5 text-ios-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onSelectClick}
          className="shrink-0 rounded-full bg-ios-bg px-3 py-1.5 text-[11px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
        >
          {selectionNoun} 선택
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {summaryChips.map((chip) => (
          <span
            key={chip.key}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              chip.tone === "accent"
                ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                : "bg-ios-bg text-ios-muted"
            }`}
          >
            {chip.text}
          </span>
        ))}
      </div>

      {dates.length > 0 ? (
        <>
          {nearestDaysUntil !== null && nearestDate ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">
                {nearestDaysUntil === 0 ? "오늘!" : `D-${nearestDaysUntil}`}
              </span>
              <span className="text-[12px] text-ios-muted">{formatKorean(nearestDate)}</span>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {dates.map((iso) => (
              <span
                key={iso}
                className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                  todayISO !== "" && iso === todayISO
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-500/10 text-emerald-700"
                }`}
              >
                {formatKoreanShort(iso)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-[22px] bg-ios-bg px-4 py-3 text-[12px] leading-5 text-ios-muted">
          {emptyText}
        </div>
      )}
    </div>
  );
}
