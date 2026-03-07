"use client";

import { useEffect, useState } from "react";

type Props = {
  dates: string[]; // ISO date strings
  friendCount: number;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatKorean(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(iso + "T00:00:00");
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

function formatKoreanShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(iso + "T00:00:00");
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}/${d}(${weekday})`;
}

export function SocialCommonOffDays({ dates, friendCount }: Props) {
  // D-day 계산 — mount 후에만 (hydration 안전)
  const [todayISO, setTodayISO] = useState("");
  const [nearestDaysUntil, setNearestDaysUntil] = useState<number | null>(null);
  const [nearestDate, setNearestDate] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setTodayISO(today);

    const future = dates.filter((d) => d >= today).sort();
    if (future.length === 0) {
      setNearestDaysUntil(null);
      setNearestDate(null);
      return;
    }

    const nearest = future[0];
    const todayMs = new Date(today + "T00:00:00").getTime();
    const nearestMs = new Date(nearest + "T00:00:00").getTime();
    const diff = Math.round((nearestMs - todayMs) / (1000 * 60 * 60 * 24));
    setNearestDate(nearest);
    setNearestDaysUntil(diff);
  }, [dates]);

  if (dates.length === 0) return null;

  return (
    <div className="rounded-apple border border-ios-sep bg-white shadow-apple px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[18px]">📅</span>
        <span className="text-[13.5px] font-semibold text-ios-text">이번 달 같이 쉬는 날</span>
      </div>

      {/* D-day 배너 */}
      {nearestDaysUntil !== null && nearestDate && (
        <div className="mb-2.5 flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">
            {nearestDaysUntil === 0 ? "오늘!" : `D-${nearestDaysUntil}`}
          </span>
          <span className="text-[12px] text-ios-muted">{formatKorean(nearestDate)}</span>
        </div>
      )}

      {/* 날짜 버블 그리드 */}
      <div className="flex flex-wrap gap-1.5">
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

      {friendCount > 1 && (
        <p className="mt-2 text-[11.5px] text-ios-muted">{friendCount}명 모두 오프</p>
      )}
    </div>
  );
}
