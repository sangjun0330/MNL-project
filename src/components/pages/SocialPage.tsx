"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialConnectionsData, FriendsScheduleData } from "@/types/social";
import { SocialMyCode } from "@/components/social/SocialMyCode";
import { SocialConnectForm } from "@/components/social/SocialConnectForm";
import { SocialPendingCard } from "@/components/social/SocialPendingCard";
import { SocialConnectionList } from "@/components/social/SocialConnectionList";
import { SocialCommonOffDays } from "@/components/social/SocialCommonOffDays";
import { SocialOnboarding } from "@/components/social/SocialOnboarding";

// 현재 월 YYYY-MM
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SocialPage() {
  const router = useRouter();
  const month = useMemo(() => currentMonth(), []);

  const [connections, setConnections] = useState<SocialConnectionsData | null>(null);
  const [friendsSchedule, setFriendsSchedule] = useState<FriendsScheduleData | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState(false);

  const [openMyCode, setOpenMyCode] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);

  // 소셜 프로필 확인 (첫 진입 온보딩)
  useEffect(() => {
    fetch("/api/social/profile")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok && !res.data) {
          setShowOnboarding(true);
        }
        setProfileChecked(true);
      })
      .catch(() => setProfileChecked(true));
  }, []);

  const fetchConnections = useCallback(() => {
    setConnectionsLoading(true);
    setConnectionsError(false);
    fetch("/api/social/connections")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setConnections(res.data);
        } else {
          setConnectionsError(true);
        }
      })
      .catch(() => setConnectionsError(true))
      .finally(() => setConnectionsLoading(false));
  }, []);

  const fetchFriendsSchedule = useCallback(() => {
    setScheduleLoading(true);
    fetch(`/api/social/friends/schedule?month=${month}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setFriendsSchedule(res.data);
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [month]);

  useEffect(() => {
    if (!profileChecked) return;
    fetchConnections();
    fetchFriendsSchedule();
  }, [profileChecked, fetchConnections, fetchFriendsSchedule]);

  // 30초 폴링 (연결 목록만 — 일정은 자주 바뀌지 않음)
  useEffect(() => {
    if (!profileChecked) return;
    const timer = setInterval(() => {
      fetchConnections();
    }, 30_000);
    return () => clearInterval(timer);
  }, [profileChecked, fetchConnections]);

  const handleRefresh = useCallback(() => {
    fetchConnections();
    fetchFriendsSchedule();
  }, [fetchConnections, fetchFriendsSchedule]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    handleRefresh();
  }, [handleRefresh]);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const pendingIncoming = connections?.pendingIncoming ?? [];
  const pendingSent = connections?.pendingSent ?? [];
  const accepted = connections?.accepted ?? [];
  const commonOffDays = friendsSchedule?.commonOffDays ?? [];
  const friendSchedules = friendsSchedule?.friends ?? [];

  return (
    <div className="space-y-3 pb-4">

      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
          aria-label="뒤로"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-[17px] font-bold text-ios-text">소셜</h1>
        <button
          type="button"
          onClick={() => setOpenMyCode(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
          title="내 코드 공유"
          aria-label="내 코드 공유"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>

      {/* ── 에러 상태 ──────────────────────────────────────── */}
      {connectionsError && !connectionsLoading && (
        <div className="flex items-center justify-between rounded-apple border border-ios-sep bg-white px-4 py-3 shadow-apple">
          <p className="text-[13px] text-ios-muted">연결 목록을 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={fetchConnections}
            className="ml-3 shrink-0 rounded-full bg-ios-bg px-3 py-1.5 text-[12.5px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
          >
            재시도
          </button>
        </div>
      )}

      {/* ── 로딩 스켈레톤 ──────────────────────────────────── */}
      {connectionsLoading && (
        <div className="rounded-apple border border-ios-sep bg-white shadow-apple p-4 space-y-2.5">
          <div className="h-4 w-28 rounded-full bg-ios-sep animate-pulse" />
          <div className="h-3 w-44 rounded-full bg-ios-sep/60 animate-pulse" />
          <div className="h-3 w-36 rounded-full bg-ios-sep/40 animate-pulse" />
        </div>
      )}

      {/* ── 받은/보낸 연결 요청 ─────────────────────────────── */}
      {!connectionsLoading && !connectionsError && (
        <SocialPendingCard
          incoming={pendingIncoming}
          sent={pendingSent}
          onRefresh={handleRefresh}
        />
      )}

      {/* ── 같이 쉬는 날 ────────────────────────────────────── */}
      {!scheduleLoading && commonOffDays.length > 0 && (
        <SocialCommonOffDays
          dates={commonOffDays}
          friendCount={accepted.length}
        />
      )}

      {/* ── 친구 목록 ──────────────────────────────────────── */}
      {!connectionsLoading && !connectionsError && (
        <SocialConnectionList
          connections={accepted}
          friendSchedules={friendSchedules}
          month={month}
          onAddFriend={() => setOpenConnect(true)}
          onRefresh={handleRefresh}
        />
      )}

      {/* ── 바텀시트들 ─────────────────────────────────────── */}
      <SocialMyCode open={openMyCode} onClose={() => setOpenMyCode(false)} />

      <SocialConnectForm
        open={openConnect}
        onClose={() => setOpenConnect(false)}
        onSuccess={handleRefresh}
      />

      <SocialOnboarding
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    </div>
  );
}
