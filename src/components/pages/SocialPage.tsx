"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import type { SocialConnectionsData, FriendsScheduleData, SocialProfile } from "@/types/social";
import { SocialConnectForm } from "@/components/social/SocialConnectForm";
import { SocialPendingCard } from "@/components/social/SocialPendingCard";
import { SocialConnectionList } from "@/components/social/SocialConnectionList";
import { SocialCommonOffDays } from "@/components/social/SocialCommonOffDays";
import { SocialOnboarding } from "@/components/social/SocialOnboarding";
import { SocialProfileSheet } from "@/components/social/SocialProfileSheet";
import {
  useSocialConnectionsRealtimeRefresh,
  type SocialConnectionRealtimePayload,
} from "@/components/social/useSocialConnectionsRealtimeRefresh";

const SOCIAL_BACKGROUND_REFRESH_MS = 60 * 60 * 1000;

// 현재 월 YYYY-MM
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SocialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const month = useMemo(() => currentMonth(), []);
  const inviteToken = searchParams.get("invite") ?? "";

  const [connections, setConnections] = useState<SocialConnectionsData | null>(null);
  const [friendsSchedule, setFriendsSchedule] = useState<FriendsScheduleData | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState(false);

  const [openProfile, setOpenProfile] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [connectPrefillCode, setConnectPrefillCode] = useState<string | null>(null);
  const [connectPrefillMessage, setConnectPrefillMessage] = useState<string | null>(null);
  const handledInviteRef = useRef<string | null>(null);

  const fetchProfile = useCallback(() => {
    if (status !== "authenticated") {
      setProfile(null);
      setProfileChecked(true);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    fetch("/api/social/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setProfile(res.data ?? null);
          setShowOnboarding(!res.data);
        }
        setProfileChecked(true);
      })
      .catch(() => setProfileChecked(true))
      .finally(() => setProfileLoading(false));
  }, [status]);

  // 소셜 프로필 확인 (첫 진입 온보딩)
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const fetchConnections = useCallback(() => {
    if (status !== "authenticated") {
      setConnections(null);
      setConnectionsLoading(false);
      setConnectionsError(false);
      return;
    }
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
  }, [status]);

  const fetchFriendsSchedule = useCallback(() => {
    if (status !== "authenticated") {
      setFriendsSchedule(null);
      setScheduleLoading(false);
      return;
    }
    setScheduleLoading(true);
    fetch(`/api/social/friends/schedule?month=${month}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setFriendsSchedule(res.data);
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [month, status]);

  useEffect(() => {
    if (!profileChecked || status !== "authenticated") return;
    fetchConnections();
    fetchFriendsSchedule();
  }, [profileChecked, fetchConnections, fetchFriendsSchedule, status]);

  const refreshConnectionsAndSchedule = useCallback(() => {
    fetchConnections();
    fetchFriendsSchedule();
  }, [fetchConnections, fetchFriendsSchedule]);

  // 백그라운드 갱신은 과하지 않게 1시간 간격만 유지하고,
  // 연결 이벤트가 발생하면 실시간 refresh로 바로 반영한다.
  useEffect(() => {
    if (!profileChecked || status !== "authenticated") return;
    const timer = setInterval(() => {
      refreshConnectionsAndSchedule();
    }, SOCIAL_BACKGROUND_REFRESH_MS);
    return () => clearInterval(timer);
  }, [profileChecked, refreshConnectionsAndSchedule, status]);

  const handleRealtimeEvent = useCallback(
    (payload: SocialConnectionRealtimePayload) => {
      const next = (payload.new ?? {}) as {
        requester_id?: string | null;
        receiver_id?: string | null;
        status?: string | null;
      };

      if (
        payload.eventType === "INSERT" &&
        next.status === "pending" &&
        next.receiver_id === user?.userId
      ) {
        setNotice({ tone: "info", text: "새 연결 요청이 도착했어요." });
        return;
      }

      if (payload.eventType === "UPDATE" && next.status === "accepted") {
        if (next.requester_id === user?.userId) {
          setNotice({ tone: "success", text: "보낸 연결 요청이 수락되었어요." });
        } else if (next.receiver_id === user?.userId) {
          setNotice({ tone: "success", text: "친구 연결이 완료되었어요." });
        }
        return;
      }

      if (
        payload.eventType === "UPDATE" &&
        next.status === "rejected" &&
        next.requester_id === user?.userId
      ) {
        setNotice({ tone: "info", text: "보낸 연결 요청이 거절되었어요." });
      }
    },
    [user?.userId]
  );

  useSocialConnectionsRealtimeRefresh({
    enabled: profileChecked && status === "authenticated",
    userId: user?.userId ?? null,
    scope: "social-page",
    onRefresh: refreshConnectionsAndSchedule,
    onEvent: handleRealtimeEvent,
  });

  const handleRefresh = useCallback(() => {
    fetchProfile();
    fetchConnections();
    fetchFriendsSchedule();
  }, [fetchConnections, fetchFriendsSchedule, fetchProfile]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    setNotice(null);
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

  useEffect(() => {
    if (!inviteToken) {
      handledInviteRef.current = null;
    }
  }, [inviteToken]);

  useEffect(() => {
    if (!inviteToken || status !== "authenticated" || !profileChecked || showOnboarding || !profile) return;
    if (handledInviteRef.current === inviteToken) return;
    handledInviteRef.current = inviteToken;

    fetch("/api/social/share-links/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok) {
          const message =
            res.error === "invite_not_found_or_expired"
              ? "초대 링크가 만료되었거나 더 이상 유효하지 않아요."
              : res.error === "cannot_connect_to_self"
                ? "내 공유 링크는 직접 사용할 수 없어요."
                : res.error === "too_many_requests"
                  ? "초대 링크 확인을 너무 자주 시도하고 있어요. 잠시 후 다시 시도해 주세요."
                  : "초대 링크를 확인하지 못했어요.";
          setNotice({ tone: "error", text: message });
          return;
        }

        const relationState = res.data?.relationState as string | undefined;
        const inviterNickname = String(res.data?.inviterNickname ?? "").trim() || "친구";
        const inviterAvatarEmoji = String(res.data?.inviterAvatarEmoji ?? "🐧").trim() || "🐧";

        if (relationState === "accepted") {
          setNotice({ tone: "info", text: `${inviterAvatarEmoji} ${inviterNickname}님과 이미 연결되어 있어요.` });
          return;
        }
        if (relationState === "pending") {
          setNotice({ tone: "info", text: `${inviterAvatarEmoji} ${inviterNickname}님과 연결 요청이 이미 진행 중이에요.` });
          return;
        }
        if (relationState === "blocked") {
          setNotice({ tone: "error", text: "이 사용자와는 연결할 수 없어요." });
          return;
        }

        setConnectPrefillCode(String(res.data?.code ?? ""));
        setConnectPrefillMessage(`${inviterAvatarEmoji} ${inviterNickname}님의 코드가 자동 입력되었어요.`);
        setOpenConnect(true);
        setNotice({ tone: "success", text: `${inviterNickname}님의 초대 링크를 확인했어요.` });
      })
      .catch(() => {
        setNotice({ tone: "error", text: "초대 링크를 확인하지 못했어요." });
      })
      .finally(() => {
        router.replace("/social", { scroll: false });
      });
  }, [inviteToken, profile, profileChecked, router, showOnboarding, status]);

  if (status === "loading" || profileLoading) {
    return (
      <div className="space-y-3 pb-4">
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
          <div className="h-9 w-9 rounded-full bg-ios-sep/70" />
        </div>
        <div className="rounded-apple border border-ios-sep bg-white p-4 shadow-apple space-y-2.5">
          <div className="h-4 w-28 rounded-full bg-ios-sep animate-pulse" />
          <div className="h-3 w-44 rounded-full bg-ios-sep/60 animate-pulse" />
          <div className="h-3 w-36 rounded-full bg-ios-sep/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="space-y-3 pb-4">
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
          <div className="h-9 w-9" />
        </div>

        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[16px] font-semibold text-ios-text">로그인 후 소셜을 사용할 수 있어요</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-muted">
            {inviteToken
              ? "공유 링크를 열었어요. 로그인하면 친구 코드 입력창이 자동으로 열립니다."
              : "친구 코드를 주고받고, 서로의 일정을 보려면 로그인해야 해요."}
          </p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[14px] font-semibold text-white transition active:opacity-60"
            data-auth-allow
          >
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

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
          onClick={() => (profile ? setOpenProfile(true) : setShowOnboarding(true))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[20px] shadow-apple transition hover:bg-ios-sep/20 active:opacity-60"
          title="내 소셜 프로필"
          aria-label="내 소셜 프로필"
        >
          <span>{profile?.avatarEmoji ?? "👤"}</span>
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-apple px-4 py-3 text-[13px] shadow-apple ${
            notice.tone === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : notice.tone === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-ios-sep bg-white text-ios-text"
          }`}
        >
          {notice.text}
        </div>
      )}

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
          onAddFriend={() => {
            setConnectPrefillCode(null);
            setConnectPrefillMessage(null);
            setOpenConnect(true);
          }}
          onRefresh={handleRefresh}
        />
      )}

      {/* ── 바텀시트들 ─────────────────────────────────────── */}
      <SocialProfileSheet
        open={openProfile}
        onClose={() => setOpenProfile(false)}
        profile={profile}
        onSaved={(nextProfile) => {
          setProfile(nextProfile);
          setNotice({ tone: "success", text: "소셜 프로필이 저장되었어요." });
        }}
      />

      <SocialConnectForm
        open={openConnect}
        onClose={() => {
          setOpenConnect(false);
          setConnectPrefillMessage(null);
        }}
        onSuccess={() => {
          setConnectPrefillCode(null);
          setConnectPrefillMessage(null);
          handleRefresh();
        }}
        prefillCode={connectPrefillCode}
        prefillMessage={connectPrefillMessage}
      />

      <SocialOnboarding
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    </div>
  );
}
