"use client";

import { useEffect, useState } from "react";
import type { SocialConnection } from "@/types/social";
import { SocialAvatarBadge } from "@/components/social/SocialAvatar";
import { SocialCalendarIcon } from "@/components/social/SocialIcons";

type Props = {
  connections: SocialConnection[];
  pairCommonOffByUserId: Map<string, string[]>;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatNextOff(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(iso + "T00:00:00");
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}/${d}(${weekday})`;
}

export function SocialNextCommonOff({ connections, pairCommonOffByUserId }: Props) {
  // hydration 안전: mount 후에만 오늘 날짜 계산
  const [todayISO, setTodayISO] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date();
    setTodayISO(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }, []);

  if (!todayISO) return null;

  type Item = { connection: SocialConnection; date: string; daysUntil: number };
  const items: Item[] = [];

  for (const conn of connections) {
    const offs = pairCommonOffByUserId.get(conn.userId) ?? [];
    const future = offs.filter((d) => d >= todayISO);
    if (future.length === 0) continue;
    const next = future[0];
    const daysUntil = Math.round(
      (new Date(next + "T00:00:00").getTime() - new Date(todayISO + "T00:00:00").getTime()) /
        86400000
    );
    items.push({ connection: conn, date: next, daysUntil });
  }

  if (items.length === 0) return null;

  // 가장 가까운 순 정렬
  items.sort((a, b) => a.daysUntil - b.daysUntil || a.date.localeCompare(b.date));
  const visibleItems = items.slice(0, 3);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
          <SocialCalendarIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[13.5px] font-semibold text-gray-900">다음 같이 쉬는 날</span>
      </div>

      <div className="space-y-2">
        {visibleItems.map(({ connection, date, daysUntil }) => (
          <div key={connection.userId} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SocialAvatarBadge emoji={connection.avatarEmoji} className="h-7 w-7" iconClassName="h-5 w-5" />
              <span className="max-w-[120px] truncate text-[13px] font-medium text-gray-900">
                {connection.nickname || "친구"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  daysUntil === 0
                    ? "bg-emerald-500 text-white"
                    : "bg-emerald-500/15 text-emerald-700"
                }`}
              >
                {daysUntil === 0 ? "오늘!" : `D-${daysUntil}`}
              </span>
            </div>
            <span className="text-[12px] font-semibold text-emerald-600 shrink-0">
              {formatNextOff(date)}
            </span>
          </div>
        ))}
      </div>

      {items.length > 3 && (
        <p className="mt-2 text-center text-[11px] text-gray-500">+{items.length - 3}명 더</p>
      )}
    </div>
  );
}
