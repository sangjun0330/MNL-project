"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { FriendSchedule } from "@/types/social";

type Props = {
  friend: FriendSchedule;
  month: string; // "YYYY-MM"
};

const SHIFT_COLORS: Record<string, string> = {
  D: "bg-blue-500/15 text-blue-700",
  E: "bg-indigo-500/15 text-indigo-700",
  N: "bg-purple-500/15 text-purple-700",
  M: "bg-cyan-500/15 text-cyan-700",
  OFF: "bg-emerald-500/15 text-emerald-700",
  VAC: "bg-orange-500/15 text-orange-700",
};

export function SocialFriendMiniCalendar({ friend, month }: Props) {
  // 해당 월의 날짜 배열 생성
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    return { iso, day: d, shift: friend.schedule[iso] ?? null };
  });

  // 오늘 날짜는 mount 후에만 계산 — SSR/hydration 불일치 방지
  // (서버와 클라이언트의 new Date()가 다를 수 있음: 서버 UTC vs 클라이언트 KST)
  const [todayISO, setTodayISO] = useState("");
  useEffect(() => {
    const d = new Date();
    setTodayISO(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }, []);

  // 이번 달 전체 보여주되, 스크롤 가능한 가로 바 형태
  const shiftDays = days.filter((d) => d.shift);

  if (shiftDays.length === 0) {
    return (
      <p className="text-[12px] text-ios-muted">이번 달 일정이 없어요</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {days.map(({ iso, day, shift }) => {
        if (!shift) return null;
        const isToday = todayISO !== "" && iso === todayISO;
        return (
          <div
            key={iso}
            className={cn(
              "flex min-w-[36px] flex-col items-center rounded-xl px-1.5 py-1",
              SHIFT_COLORS[shift] ?? "bg-ios-bg text-ios-text",
              isToday && "ring-1 ring-offset-0 ring-[color:var(--rnest-accent)]"
            )}
          >
            <span className="text-[9px] font-medium opacity-70">{day}일</span>
            <span className="text-[11px] font-bold">{shift}</span>
          </div>
        );
      })}
    </div>
  );
}
