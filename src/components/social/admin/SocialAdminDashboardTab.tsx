"use client";

import { useEffect, useState } from "react";
import { fetchSocialAdminStats } from "@/lib/social/adminClient";
import type { SocialAdminStats } from "@/types/socialAdmin";

type StatCard = {
  label: string;
  key: keyof SocialAdminStats;
  icon: string;
  accent?: "red" | "default";
};

const STAT_CARDS: StatCard[] = [
  { label: "전체 사용자", key: "totalUsers", icon: "👥" },
  { label: "전체 게시글", key: "totalPosts", icon: "📝" },
  { label: "오늘 활성 사용자", key: "activeToday", icon: "🟢" },
  { label: "전체 좋아요", key: "totalLikes", icon: "❤️" },
  { label: "전체 댓글", key: "totalComments", icon: "💬" },
  { label: "이번 주 신규 가입", key: "newUsersThisWeek", icon: "✨" },
  { label: "정지된 계정", key: "suspendedUsers", icon: "🚫", accent: "red" },
  { label: "활성 스토리", key: "activeStories", icon: "🎬" },
  { label: "전체 그룹", key: "totalGroups", icon: "🏘️" },
];

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm">
      <div className="h-6 w-6 rounded-full bg-gray-100 mb-3" />
      <div className="h-7 w-16 rounded-lg bg-gray-100 mb-1.5" />
      <div className="h-3 w-20 rounded-full bg-gray-100" />
    </div>
  );
}

export function SocialAdminDashboardTab() {
  const [stats, setStats] = useState<SocialAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSocialAdminStats()
      .then((s) => {
        setStats(s);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(String(e?.message ?? "failed_to_load"));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {STAT_CARDS.map((c) => <StatCardSkeleton key={c.key} />)}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="px-4 py-6 text-center text-[13px] text-ios-muted">
        통계를 불러오지 못했습니다.
        <button
          className="ml-2 text-[color:var(--rnest-accent)] font-semibold"
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchSocialAdminStats()
              .then((s) => { setStats(s); setLoading(false); })
              .catch((e: any) => { setError(String(e?.message ?? "err")); setLoading(false); });
          }}
        >
          재시도
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
      {STAT_CARDS.map((card) => {
        const value = stats[card.key];
        const isRed = card.accent === "red" && Number(value) > 0;
        return (
          <div
            key={card.key}
            className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm"
          >
            <div className="text-xl mb-2">{card.icon}</div>
            <div
              className={`text-[26px] font-black tabular-nums leading-none ${
                isRed ? "text-red-500" : "text-gray-900"
              }`}
            >
              {Number(value).toLocaleString()}
            </div>
            <div className="mt-1 text-[12px] text-ios-muted leading-tight">{card.label}</div>
          </div>
        );
      })}
    </div>
  );
}
