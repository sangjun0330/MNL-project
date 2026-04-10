"use client";

import { useEffect, useState } from "react";
import type { FriendSchedule } from "@/types/social";
import { SocialCalendarIcon } from "@/components/social/SocialIcons";

type Props = {
  friends: FriendSchedule[];
  mySchedule: Record<string, string>;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

const SHIFT_COLORS: Record<string, string> = {
  D: "bg-blue-500/15 text-blue-700",
  E: "bg-indigo-500/15 text-indigo-700",
  N: "bg-purple-500/15 text-purple-700",
  M: "bg-cyan-500/15 text-cyan-700",
  OFF: "bg-emerald-500/15 text-emerald-700",
  VAC: "bg-orange-500/15 text-orange-700",
};

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ShiftBadge({ shift }: { shift: string | null }) {
  if (!shift) {
    return <span className="text-[10px] text-gray-500">—</span>;
  }
  return (
    <span
      className={`rounded-lg px-1.5 py-0.5 text-[10px] font-bold ${SHIFT_COLORS[shift] ?? "bg-gray-100 text-gray-700"}`}
    >
      {shift}
    </span>
  );
}

export function SocialThisWeek({ friends, mySchedule }: Props) {
  // 오늘 ~ D+6 날짜 계산 — mount 후에만 (hydration 안전)
  const [days, setDays] = useState<Array<{ iso: string; label: string; weekday: number }>>([]);

  useEffect(() => {
    const today = new Date();
    const result = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = toISODate(d);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      return { iso, label, weekday: d.getDay() };
    });
    setDays(result);
  }, []);

  if (friends.length === 0 || days.length === 0) return null;

  // 표시할 친구는 최대 4명으로 제한 (모바일 가독성)
  const visibleFriends = friends.slice(0, 4);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
          <SocialCalendarIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[13.5px] font-semibold text-gray-900">이번 주 근무 현황</span>
      </div>

      {/* 헤더 행: 나 + 친구들 이름 */}
      <div
        className="grid gap-x-1 gap-y-0 mb-1"
        style={{ gridTemplateColumns: `56px repeat(${visibleFriends.length + 1}, minmax(0, 1fr))` }}
      >
        <div /> {/* 날짜 열 빈칸 */}
        {/* 나 */}
        <div className="flex flex-col items-center">
          <span className="truncate text-[10px] font-semibold text-gray-500">나</span>
        </div>
        {/* 친구들 */}
        {visibleFriends.map((f) => (
          <div key={f.userId} className="flex flex-col items-center">
            <span className="text-[18px] leading-none">{f.avatarEmoji || "🐧"}</span>
            <span className="mt-0.5 max-w-[40px] truncate text-center text-[9px] leading-tight text-gray-500">
              {f.nickname || "친구"}
            </span>
          </div>
        ))}
      </div>

      {/* 날짜 행들 */}
      <div className="space-y-1">
        {days.map(({ iso, label, weekday }) => {
          const myShift = mySchedule[iso] ?? null;
          const friendShifts = visibleFriends.map((f) => f.schedule[iso] ?? null);

          // 모두(나 포함) OFF/VAC인 날 강조
          const allOff =
            (myShift === "OFF" || myShift === "VAC") &&
            friendShifts.every((s) => s === "OFF" || s === "VAC");

          return (
            <div
              key={iso}
              className={`grid items-center gap-x-1 rounded-xl px-2 py-1.5 ${
                allOff ? "bg-emerald-50" : ""
              }`}
              style={{ gridTemplateColumns: `56px repeat(${visibleFriends.length + 1}, minmax(0, 1fr))` }}
            >
              {/* 날짜 */}
              <div className="flex items-baseline gap-1">
                <span className={`text-[11px] font-semibold ${weekday === 0 ? "text-red-500" : weekday === 6 ? "text-blue-500" : "text-gray-900"}`}>
                  {label}
                </span>
                <span className={`text-[9px] ${weekday === 0 ? "text-red-400" : weekday === 6 ? "text-blue-400" : "text-gray-500"}`}>
                  {WEEKDAY_KO[weekday]}
                </span>
              </div>

              {/* 내 근무 */}
              <div className="flex justify-center">
                <ShiftBadge shift={myShift} />
              </div>

              {/* 친구 근무 */}
              {friendShifts.map((shift, idx) => (
                <div key={visibleFriends[idx].userId} className="flex justify-center">
                  <ShiftBadge shift={shift} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {friends.length > 4 && (
        <p className="mt-2 text-center text-[11px] text-gray-500">
          +{friends.length - 4}명 더 있어요
        </p>
      )}
    </div>
  );
}
