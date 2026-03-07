"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import type { SocialConnectionsData, FriendsScheduleData, SocialProfile, FriendMeta } from "@/types/social";
import { SocialConnectForm } from "@/components/social/SocialConnectForm";
import { SocialPendingCard } from "@/components/social/SocialPendingCard";
import { SocialConnectionList } from "@/components/social/SocialConnectionList";
import { SocialCommonOffDays, type CommonOffMode } from "@/components/social/SocialCommonOffDays";
import { SocialThisWeek } from "@/components/social/SocialThisWeek";
import { SocialNextCommonOff } from "@/components/social/SocialNextCommonOff";
import { SocialOnboarding } from "@/components/social/SocialOnboarding";
import { SocialProfileSheet } from "@/components/social/SocialProfileSheet";
import { SocialEventCenter } from "@/components/social/SocialEventCenter";
import {
  useSocialConnectionsRealtimeRefresh,
  type SocialConnectionRealtimePayload,
} from "@/components/social/useSocialConnectionsRealtimeRefresh";
import { useSocialEventsRealtimeRefresh } from "@/components/social/useSocialEventsRealtimeRefresh";
import { useAppStoreSelector } from "@/lib/store";

const SOCIAL_BACKGROUND_REFRESH_MS = 60 * 60 * 1000;

// 현재 월 YYYY-MM
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 이번 주 7일이 다음 달로 넘어가는 경우 두 달 모두 fetch
// (월말 SocialThisWeek 깨짐 방지)
function buildFetchMonths(): string {
  const today = new Date();
  const d6 = new Date(today);
  d6.setDate(today.getDate() + 6);
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const next = `${d6.getFullYear()}-${String(d6.getMonth() + 1).padStart(2, "0")}`;
  return cur === next ? cur : `${cur},${next}`;
}

function isOffOrVac(s?: string) {
  return s === "OFF" || s === "VAC";
}

export function SocialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const month = useMemo(() => currentMonth(), []);
  // 이번 주 7일 커버를 위해 필요한 months 파라미터 (월말 경계 처리)
  const fetchMonths = useMemo(() => buildFetchMonths(), []);
  // 내 근무표 — Zustand 클라이언트 스토어 (서버 전송 없음)
  const mySchedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);
  const inviteToken = searchParams.get("invite") ?? "";

  const [connections, setConnections] = useState<SocialConnectionsData | null>(null);
  const [friendsSchedule, setFriendsSchedule] = useState<FriendsScheduleData | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [friendMeta, setFriendMeta] = useState<Record<string, FriendMeta>>({});
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [connectionsError, setConnectionsError] = useState(false);

  const [commonOffMode, setCommonOffMode] = useState<CommonOffMode>("all");
  const [openProfile, setOpenProfile] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [openEventCenter, setOpenEventCenter] = useState(false);
  const [unreadEventCount, setUnreadEventCount] = useState(0);
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
    fetch(`/api/social/friends/schedule?months=${fetchMonths}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setFriendsSchedule(res.data);
      })
      .catch(() => {})
      .finally(() => setScheduleLoading(false));
  }, [fetchMonths, status]);

  const fetchFriendMeta = useCallback(() => {
    if (status !== "authenticated") {
      setFriendMeta({});
      return;
    }
    fetch("/api/social/friends/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setFriendMeta(res.data ?? {});
      })
      .catch(() => {});
  }, [status]);

  useEffect(() => {
    if (!profileChecked || status !== "authenticated") return;
    fetchConnections();
    fetchFriendsSchedule();
    fetchFriendMeta();
  }, [profileChecked, fetchConnections, fetchFriendsSchedule, fetchFriendMeta, status]);

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

  // Bug-3: 친구 프로필 변경(닉네임/아바타/상태메시지) 실시간 미반영 보완
  // focus/visibilitychange 시 debounce 300ms 후 refresh
  useEffect(() => {
    if (!profileChecked || status !== "authenticated") return;
    let tid: ReturnType<typeof setTimeout>;
    const trigger = () => {
      clearTimeout(tid);
      tid = setTimeout(refreshConnectionsAndSchedule, 300);
    };
    const onVisibility = () => { if (!document.hidden) trigger(); };
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(tid);
    };
  }, [profileChecked, status, refreshConnectionsAndSchedule]);

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

  // 새 이벤트(알림) 실시간 구독 — INSERT 시 unread count +1
  const handleNewEvent = useCallback(() => setUnreadEventCount((c) => c + 1), []);
  useSocialEventsRealtimeRefresh({
    enabled: profileChecked && status === "authenticated",
    userId: user?.userId ?? null,
    onNewEvent: handleNewEvent,
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
  const rawAccepted = connections?.accepted ?? [];
  const commonOffDays = friendsSchedule?.commonOffDays ?? [];
  const friendSchedules = friendsSchedule?.friends ?? [];

  // 핀된 친구 먼저 → connectedAt 내림차순 정렬
  const accepted = useMemo(
    () =>
      [...rawAccepted].sort((a, b) => {
        const aPinned = friendMeta[a.userId]?.pinned ? 1 : 0;
        const bPinned = friendMeta[b.userId]?.pinned ? 1 : 0;
        if (bPinned !== aPinned) return bPinned - aPinned;
        // connectedAt 내림차순 (없으면 마지막)
        const aAt = a.connectedAt ?? "";
        const bAt = b.connectedAt ?? "";
        return bAt.localeCompare(aAt);
      }),
    [rawAccepted, friendMeta]
  );

  // pairCommonOff: 각 친구와 나의 개별 공통 오프 날짜 (이번 달 기준)
  const pairCommonOffByUserId = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const f of friendSchedules) {
      const offs = Object.entries(f.schedule)
        .filter(([date, shift]) => isOffOrVac(shift) && isOffOrVac(mySchedule[date]))
        .map(([d]) => d)
        .sort();
      result.set(f.userId, offs);
    }
    return result;
  }, [friendSchedules, mySchedule]);

  // 공통 오프 표시 모드: 'all' = 전원 동시 오프 (API 기준), 'any' = 나 + 1명 이상
  const displayedCommonOffDays = useMemo(() => {
    if (commonOffMode === "all") return commonOffDays;
    const primaryPrefix = month + "-";
    const myOff = new Set(
      Object.entries(mySchedule)
        .filter(([d, s]) => d.startsWith(primaryPrefix) && isOffOrVac(s))
        .map(([d]) => d)
    );
    const friendOff = new Set(
      friendSchedules.flatMap((f) =>
        Object.entries(f.schedule)
          .filter(([, s]) => isOffOrVac(s))
          .map(([d]) => d)
      )
    );
    return Array.from(myOff).filter((d) => friendOff.has(d)).sort();
  }, [commonOffMode, commonOffDays, mySchedule, friendSchedules, month]);

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
        <div className="flex items-center gap-2">
          {/* 🔔 알림 버튼 */}
          <button
            type="button"
            onClick={() => setOpenEventCenter(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-apple transition hover:bg-ios-sep/20 active:opacity-60"
            title="알림"
            aria-label="알림"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ios-text">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadEventCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                {unreadEventCount > 9 ? "9+" : unreadEventCount}
              </span>
            )}
          </button>
          {/* 프로필 버튼 */}
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

      {/* ── 이번 주 근무 현황 ────────────────────────────────── */}
      {!scheduleLoading && friendSchedules.length > 0 && (
        <SocialThisWeek
          friends={friendSchedules}
          mySchedule={mySchedule}
        />
      )}

      {/* ── 다음 같이 쉬는 날 (친구별) ──────────────────────── */}
      {!scheduleLoading && accepted.length > 0 && (
        <SocialNextCommonOff
          connections={accepted}
          pairCommonOffByUserId={pairCommonOffByUserId}
        />
      )}

      {/* ── 같이 쉬는 날 ────────────────────────────────────── */}
      {!scheduleLoading && displayedCommonOffDays.length > 0 && (
        <SocialCommonOffDays
          dates={displayedCommonOffDays}
          friendCount={accepted.length}
          mode={commonOffMode}
          onModeChange={setCommonOffMode}
        />
      )}

      {/* ── 친구 목록 ──────────────────────────────────────── */}
      {!connectionsLoading && !connectionsError && (
        <SocialConnectionList
          connections={accepted}
          friendSchedules={friendSchedules}
          month={month}
          mySchedule={mySchedule}
          pairCommonOffByUserId={pairCommonOffByUserId}
          friendMeta={friendMeta}
          onMetaChange={(userId, patch) => {
            setFriendMeta((prev) => ({
              ...prev,
              [userId]: { ...(prev[userId] ?? { pinned: false, alias: "", muted: false }), ...patch },
            }));
          }}
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

      <SocialEventCenter
        open={openEventCenter}
        onClose={() => setOpenEventCenter(false)}
        onUnreadCountChange={setUnreadEventCount}
      />
    </div>
  );
}
