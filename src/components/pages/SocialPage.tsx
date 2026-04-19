"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { DEFAULT_SOCIAL_POST_VISIBILITY } from "@/types/social";
import type {
  SocialConnectionsData,
  FriendsScheduleData,
  SocialProfile,
  FriendMeta,
  SocialGroupInvitePreview,
  SocialGroupSummary,
} from "@/types/social";
import { SocialConnectForm } from "@/components/social/SocialConnectForm";
import { SocialPendingCard } from "@/components/social/SocialPendingCard";
import { SocialConnectionList } from "@/components/social/SocialConnectionList";
import { SocialSelectableCommonOffCard } from "@/components/social/SocialSelectableCommonOffCard";
import { SocialThisWeek } from "@/components/social/SocialThisWeek";
import { SocialNextCommonOff } from "@/components/social/SocialNextCommonOff";
import { SocialOnboarding } from "@/components/social/SocialOnboarding";
import { SocialProfileSheet } from "@/components/social/SocialProfileSheet";
import { SocialEventCenter } from "@/components/social/SocialEventCenter";
import { SocialGroupList } from "@/components/social/SocialGroupList";
import { SocialGroupCreateSheet } from "@/components/social/SocialGroupCreateSheet";
import { SocialGroupJoinSheet } from "@/components/social/SocialGroupJoinSheet";
import { SocialFeedTab } from "@/components/social/SocialFeedTab";
import { SocialExploreTab } from "@/components/social/SocialExploreTab";
import {
  SocialOverlapSelectorSheet,
  type SocialOverlapSelectorItem,
} from "@/components/social/SocialOverlapSelectorSheet";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import { SocialBellIcon } from "@/components/social/SocialIcons";
import {
  useSocialConnectionsRealtimeRefresh,
  type SocialConnectionRealtimePayload,
} from "@/components/social/useSocialConnectionsRealtimeRefresh";
import { useSocialEventsRealtimeRefresh } from "@/components/social/useSocialEventsRealtimeRefresh";
import { useAppStoreSelector } from "@/lib/store";
import {
  buildSocialClientCacheKey,
  getSocialClientCache,
  setSocialClientCache,
} from "@/lib/socialClientCache";
import {
  computeSelectedCommonOffDays,
  haveSameIds,
  isOffOrVac,
} from "@/lib/socialOverlap";
import { useSocialAdminAccess } from "@/lib/socialAdminClient";
import { withReturnTo } from "@/lib/navigation";

const SOCIAL_BACKGROUND_REFRESH_MS = 60 * 60 * 1000;
type SocialViewTab = "following" | "explore" | "friends" | "groups";

function resolveSocialViewTab(value: string | null | undefined, fallback: SocialViewTab): SocialViewTab {
  if (value === "feed" || value === "following") return "following";
  if (value === "explore") return "explore";
  if (value === "groups") return "groups";
  if (value === "friends") return "friends";
  return fallback;
}

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

export function SocialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const { isAdmin: isSocialAdmin } = useSocialAdminAccess(status === "authenticated");
  const { loading: billingLoading, hasEntitlement, reload: reloadBillingAccess } = useBillingAccess();
  const currentUserId = user?.userId ?? null;
  const month = useMemo(() => currentMonth(), []);
  // 이번 주 7일 커버를 위해 필요한 months 파라미터 (월말 경계 처리)
  const fetchMonths = useMemo(() => buildFetchMonths(), []);
  // 내 근무표 — Zustand 클라이언트 스토어 (서버 전송 없음)
  const mySchedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);
  const inviteToken = searchParams.get("invite") ?? "";
  const groupInviteToken = searchParams.get("groupInvite") ?? "";
  const authError = searchParams.get("authError") ?? "";
  const requestedTab = searchParams.get("tab");
  const requestedOpenCreate = searchParams.get("openCreate");

  const [connections, setConnections] = useState<SocialConnectionsData | null>(null);
  const [friendsSchedule, setFriendsSchedule] = useState<FriendsScheduleData | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [friendMeta, setFriendMeta] = useState<Record<string, FriendMeta>>({});
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState(false);
  const [groups, setGroups] = useState<SocialGroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState(false);

  const [activeTab, setActiveTab] = useState<SocialViewTab>(
    resolveSocialViewTab(requestedTab, groupInviteToken ? "groups" : "following")
  );
  const updateActiveTab = useCallback((nextTab: SocialViewTab) => {
    setActiveTab(nextTab);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (nextTab === "following") params.delete("tab");
    else params.set("tab", nextTab);
    const nextQuery = params.toString();
    const nextPath = window.location.pathname;
    window.history.replaceState(window.history.state, "", nextQuery ? `${nextPath}?${nextQuery}` : nextPath);
  }, []);
  const groupsTabHref = "/social?tab=groups";
  const [openProfile, setOpenProfile] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [openGroupCreate, setOpenGroupCreate] = useState(false);
  const [openGroupJoin, setOpenGroupJoin] = useState(false);
  const [openEventCenter, setOpenEventCenter] = useState(false);
  const [openCommonOffSelector, setOpenCommonOffSelector] = useState(false);
  const [unreadEventCount, setUnreadEventCount] = useState(0);
  const [eventRefreshTick, setEventRefreshTick] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [connectPrefillCode, setConnectPrefillCode] = useState<string | null>(null);
  const [connectPrefillMessage, setConnectPrefillMessage] = useState<string | null>(null);
  const [groupInvitePreview, setGroupInvitePreview] = useState<SocialGroupInvitePreview | null>(null);
  const [selectedCommonOffFriendIds, setSelectedCommonOffFriendIds] = useState<string[]>([]);
  const [exploreQuery, setExploreQuery] = useState("");
  const requestedTag = searchParams.get("tag") ?? "";
  const [exploreTag, setExploreTag] = useState(requestedTag);
  const handledInviteRef = useRef<string | null>(null);
  const handledGroupInviteRef = useRef<string | null>(null);
  const appliedTabKeyRef = useRef<string | null>(null);
  const autoOpenCreateHandledRef = useRef<string | null>(null);
  const billingReloadHandledRef = useRef<string | null>(null);
  const selectedCommonOffAvailableIdsRef = useRef<string[]>([]);
  const profileFetchSeqRef = useRef(0);
  const connectionsFetchSeqRef = useRef(0);
  const scheduleFetchSeqRef = useRef(0);
  const friendMetaFetchSeqRef = useRef(0);
  const groupsFetchSeqRef = useRef(0);
  const eventsFetchSeqRef = useRef(0);
  const profileRef = useRef<SocialProfile | null>(null);
  const profileCheckedRef = useRef(false);
  const connectionsRef = useRef<SocialConnectionsData | null>(null);
  const connectionsLoadedRef = useRef(false);
  const friendsScheduleRef = useRef<FriendsScheduleData | null>(null);
  const scheduleLoadedRef = useRef(false);
  const groupsRef = useRef<SocialGroupSummary[]>([]);
  const groupsLoadedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const exploreSearchInputRef = useRef<HTMLInputElement>(null);
  const canCreateGroup = hasEntitlement("socialGroupCreate");
  const handleBackToHome = useCallback(() => {
    router.push("/");
  }, [router]);

  const profileCacheKey = useMemo(
    () => (currentUserId ? buildSocialClientCacheKey(currentUserId, "profile") : null),
    [currentUserId]
  );
  const connectionsCacheKey = useMemo(
    () => (currentUserId ? buildSocialClientCacheKey(currentUserId, "connections") : null),
    [currentUserId]
  );
  const friendsScheduleCacheKey = useMemo(
    () =>
      currentUserId
        ? buildSocialClientCacheKey(currentUserId, "friends-schedule", fetchMonths)
        : null,
    [currentUserId, fetchMonths]
  );
  const friendMetaCacheKey = useMemo(
    () => (currentUserId ? buildSocialClientCacheKey(currentUserId, "friend-meta") : null),
    [currentUserId]
  );
  const groupsCacheKey = useMemo(
    () => (currentUserId ? buildSocialClientCacheKey(currentUserId, "groups") : null),
    [currentUserId]
  );
  const unreadEventsCacheKey = useMemo(
    () => (currentUserId ? buildSocialClientCacheKey(currentUserId, "events-unread") : null),
    [currentUserId]
  );

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    profileCheckedRef.current = profileChecked;
  }, [profileChecked]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    friendsScheduleRef.current = friendsSchedule;
  }, [friendsSchedule]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    if (lastUserIdRef.current === currentUserId) return;
    lastUserIdRef.current = currentUserId;

    profileRef.current = null;
    profileCheckedRef.current = false;
    connectionsRef.current = null;
    connectionsLoadedRef.current = false;
    friendsScheduleRef.current = null;
    scheduleLoadedRef.current = false;
    groupsRef.current = [];
    groupsLoadedRef.current = false;

    setProfile(null);
    setProfileChecked(false);
    setConnections(null);
    setFriendsSchedule(null);
    setFriendMeta({});
    setGroups([]);
    setUnreadEventCount(0);
    setConnectionsError(false);
    setGroupsError(false);
    setShowOnboarding(false);

    if (status === "authenticated" && currentUserId) {
      setProfileLoading(true);
      setConnectionsLoading(true);
      setScheduleLoading(true);
      setGroupsLoading(true);
    } else {
      setProfileLoading(false);
      setConnectionsLoading(false);
      setScheduleLoading(false);
      setGroupsLoading(false);
    }
  }, [currentUserId, status]);

  useEffect(() => {
    const nextTab = resolveSocialViewTab(requestedTab, groupInviteToken ? "groups" : "following");
    const key = `${requestedTab ?? ""}:${groupInviteToken ? "groupInvite" : "none"}`;
    if (appliedTabKeyRef.current === key) return;
    appliedTabKeyRef.current = key;
    setActiveTab(nextTab);
  }, [groupInviteToken, requestedTab]);

  useEffect(() => {
    if (requestedOpenCreate !== "1" || !currentUserId) return;
    const key = `${currentUserId}:${requestedOpenCreate}`;
    if (billingReloadHandledRef.current === key) return;
    billingReloadHandledRef.current = key;
    reloadBillingAccess();
  }, [currentUserId, reloadBillingAccess, requestedOpenCreate]);

  useEffect(() => {
    if (requestedOpenCreate !== "1") return;
    if (activeTab !== "groups") return;
    if (!canCreateGroup || billingLoading) return;
    const key = `${currentUserId ?? "guest"}:${requestedOpenCreate}`;
    if (autoOpenCreateHandledRef.current === key) return;
    autoOpenCreateHandledRef.current = key;
    setOpenGroupCreate(true);
    router.replace("/social?tab=groups", { scroll: false });
  }, [activeTab, billingLoading, canCreateGroup, currentUserId, requestedOpenCreate, router]);

  const fetchProfile = useCallback(() => {
    if (status !== "authenticated" || !currentUserId) {
      profileFetchSeqRef.current += 1;
      profileRef.current = null;
      profileCheckedRef.current = true;
      setProfile(null);
      setProfileChecked(true);
      setProfileLoading(false);
      return;
    }

    const fetchSeq = ++profileFetchSeqRef.current;
    const cached = profileCacheKey ? getSocialClientCache<SocialProfile | null>(profileCacheKey) : null;
    if (cached) {
      setProfile(cached.data ?? null);
      setShowOnboarding(!cached.data);
      profileRef.current = cached.data ?? null;
      profileCheckedRef.current = true;
      setProfileChecked(true);
      setProfileLoading(false);
    } else {
      setProfileLoading(!profileCheckedRef.current && profileRef.current === null);
    }

    fetch("/api/social/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (fetchSeq !== profileFetchSeqRef.current) return;
        if (res.ok) {
          const nextProfile = (res.data ?? null) as SocialProfile | null;
          profileRef.current = nextProfile;
          setProfile(nextProfile);
          setShowOnboarding(!nextProfile);
          if (profileCacheKey) {
            setSocialClientCache(profileCacheKey, nextProfile);
          }
        }
        profileCheckedRef.current = true;
        setProfileChecked(true);
      })
      .catch(() => {
        if (fetchSeq === profileFetchSeqRef.current) {
          profileCheckedRef.current = true;
          setProfileChecked(true);
        }
      })
      .finally(() => {
        if (fetchSeq === profileFetchSeqRef.current) setProfileLoading(false);
      });
  }, [currentUserId, profileCacheKey, status]);

  // 소셜 프로필 확인 (첫 진입 온보딩)
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const fetchConnections = useCallback(() => {
    if (status !== "authenticated" || !currentUserId) {
      connectionsFetchSeqRef.current += 1;
      connectionsRef.current = null;
      connectionsLoadedRef.current = false;
      setConnections(null);
      setConnectionsLoading(false);
      setConnectionsError(false);
      return;
    }
    const fetchSeq = ++connectionsFetchSeqRef.current;
    const cached = connectionsCacheKey
      ? getSocialClientCache<SocialConnectionsData>(connectionsCacheKey)
      : null;
    const hasVisibleConnections =
      Boolean(cached || connectionsRef.current) || connectionsLoadedRef.current;
    if (cached) {
      connectionsRef.current = cached.data;
      connectionsLoadedRef.current = true;
      setConnections(cached.data);
      setConnectionsLoading(false);
      setConnectionsError(false);
    } else {
      setConnectionsLoading(!hasVisibleConnections);
    }
    setConnectionsError(false);
    fetch("/api/social/connections")
      .then((r) => r.json())
      .then((res) => {
        if (fetchSeq !== connectionsFetchSeqRef.current) return;
        if (res.ok) {
          connectionsRef.current = res.data as SocialConnectionsData;
          connectionsLoadedRef.current = true;
          setConnections(res.data);
          if (connectionsCacheKey) {
            setSocialClientCache(connectionsCacheKey, res.data as SocialConnectionsData);
          }
        } else {
          if (!hasVisibleConnections) setConnectionsError(true);
        }
      })
      .catch(() => {
        if (fetchSeq === connectionsFetchSeqRef.current && !hasVisibleConnections) {
          setConnectionsError(true);
        }
      })
      .finally(() => {
        if (fetchSeq === connectionsFetchSeqRef.current) setConnectionsLoading(false);
      });
  }, [connectionsCacheKey, currentUserId, status]);

  const fetchFriendsSchedule = useCallback(() => {
    if (status !== "authenticated" || !currentUserId) {
      scheduleFetchSeqRef.current += 1;
      friendsScheduleRef.current = null;
      scheduleLoadedRef.current = false;
      setFriendsSchedule(null);
      setScheduleLoading(false);
      return;
    }
    const fetchSeq = ++scheduleFetchSeqRef.current;
    const cached = friendsScheduleCacheKey
      ? getSocialClientCache<FriendsScheduleData>(friendsScheduleCacheKey)
      : null;
    const hasVisibleSchedule =
      Boolean(cached || friendsScheduleRef.current) || scheduleLoadedRef.current;
    if (cached) {
      friendsScheduleRef.current = cached.data;
      scheduleLoadedRef.current = true;
      setFriendsSchedule(cached.data);
      setScheduleLoading(false);
    } else {
      setScheduleLoading(!hasVisibleSchedule);
    }
    fetch(`/api/social/friends/schedule?months=${fetchMonths}`)
      .then((r) => r.json())
      .then((res) => {
        if (fetchSeq !== scheduleFetchSeqRef.current) return;
        if (res.ok) {
          friendsScheduleRef.current = res.data as FriendsScheduleData;
          scheduleLoadedRef.current = true;
          setFriendsSchedule(res.data);
          if (friendsScheduleCacheKey) {
            setSocialClientCache(friendsScheduleCacheKey, res.data as FriendsScheduleData);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (fetchSeq === scheduleFetchSeqRef.current) setScheduleLoading(false);
      });
  }, [currentUserId, fetchMonths, friendsScheduleCacheKey, status]);

  const fetchFriendMeta = useCallback(() => {
    if (status !== "authenticated" || !currentUserId) {
      friendMetaFetchSeqRef.current += 1;
      setFriendMeta({});
      return;
    }
    const fetchSeq = ++friendMetaFetchSeqRef.current;
    const cached = friendMetaCacheKey
      ? getSocialClientCache<Record<string, FriendMeta>>(friendMetaCacheKey)
      : null;
    if (cached) {
      setFriendMeta(cached.data ?? {});
    }
    fetch("/api/social/friends/meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (fetchSeq !== friendMetaFetchSeqRef.current) return;
        if (res.ok) {
          const nextMeta = (res.data ?? {}) as Record<string, FriendMeta>;
          setFriendMeta(nextMeta);
          if (friendMetaCacheKey) {
            setSocialClientCache(friendMetaCacheKey, nextMeta);
          }
        }
      })
      .catch(() => {});
  }, [currentUserId, friendMetaCacheKey, status]);

  const fetchGroups = useCallback(() => {
    if (status !== "authenticated" || !currentUserId) {
      groupsFetchSeqRef.current += 1;
      groupsRef.current = [];
      groupsLoadedRef.current = false;
      setGroups([]);
      setGroupsLoading(false);
      setGroupsError(false);
      return;
    }
    const fetchSeq = ++groupsFetchSeqRef.current;
    const cached = groupsCacheKey ? getSocialClientCache<SocialGroupSummary[]>(groupsCacheKey) : null;
    const hasVisibleGroups = Boolean(cached) || groupsRef.current.length > 0 || groupsLoadedRef.current;
    if (cached) {
      groupsRef.current = cached.data ?? [];
      groupsLoadedRef.current = true;
      setGroups(cached.data ?? []);
      setGroupsLoading(false);
      setGroupsError(false);
    } else {
      setGroupsLoading(!hasVisibleGroups);
    }
    setGroupsError(false);
    fetch("/api/social/groups", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (fetchSeq !== groupsFetchSeqRef.current) return;
        if (res.ok) {
          const nextGroups = (res.data?.groups ?? []) as SocialGroupSummary[];
          groupsRef.current = nextGroups;
          groupsLoadedRef.current = true;
          setGroups(nextGroups);
          if (groupsCacheKey) {
            setSocialClientCache(groupsCacheKey, nextGroups);
          }
        } else {
          if (!hasVisibleGroups) setGroupsError(true);
        }
      })
      .catch(() => {
        if (fetchSeq === groupsFetchSeqRef.current && !hasVisibleGroups) {
          setGroupsError(true);
        }
      })
      .finally(() => {
        if (fetchSeq === groupsFetchSeqRef.current) setGroupsLoading(false);
      });
  }, [currentUserId, groupsCacheKey, status]);

  const fetchUnreadEventCount = useCallback(() => {
    if (status !== "authenticated" || !currentUserId) {
      eventsFetchSeqRef.current += 1;
      setUnreadEventCount(0);
      return;
    }
    const fetchSeq = ++eventsFetchSeqRef.current;
    const cached = unreadEventsCacheKey ? getSocialClientCache<number>(unreadEventsCacheKey) : null;
    if (cached) {
      setUnreadEventCount(Number(cached.data ?? 0));
    }
    fetch("/api/social/events", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (fetchSeq !== eventsFetchSeqRef.current) return;
        if (res.ok) {
          const nextUnreadCount = Number(res.data?.unreadCount ?? 0);
          setUnreadEventCount(nextUnreadCount);
          if (unreadEventsCacheKey) {
            setSocialClientCache(unreadEventsCacheKey, nextUnreadCount);
          }
        }
      })
      .catch(() => {});
  }, [currentUserId, status, unreadEventsCacheKey]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchConnections();
    fetchFriendsSchedule();
    fetchFriendMeta();
    fetchGroups();
    fetchUnreadEventCount();
  }, [fetchConnections, fetchFriendsSchedule, fetchFriendMeta, fetchGroups, fetchUnreadEventCount, status]);

  const refreshConnectionsAndSchedule = useCallback(() => {
    fetchConnections();
    fetchFriendsSchedule();
  }, [fetchConnections, fetchFriendsSchedule]);

  // 백그라운드 갱신은 과하지 않게 1시간 간격만 유지하고,
  // 연결 이벤트가 발생하면 실시간 refresh로 바로 반영한다.
  useEffect(() => {
    if (status !== "authenticated") return;
    const timer = setInterval(() => {
      refreshConnectionsAndSchedule();
      fetchGroups();
    }, SOCIAL_BACKGROUND_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchGroups, refreshConnectionsAndSchedule, status]);

  // Bug-3: 친구 프로필 변경(닉네임/아바타/상태메시지) 실시간 미반영 보완
  // focus/visibilitychange 시 debounce 300ms 후 refresh
  useEffect(() => {
    if (status !== "authenticated") return;
    let tid: ReturnType<typeof setTimeout>;
    const trigger = () => {
      clearTimeout(tid);
      tid = setTimeout(() => {
        refreshConnectionsAndSchedule();
        fetchFriendMeta();
        fetchGroups();
        fetchUnreadEventCount();
      }, 300);
    };
    const onVisibility = () => { if (!document.hidden) trigger(); };
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(tid);
    };
  }, [fetchFriendMeta, fetchGroups, fetchUnreadEventCount, refreshConnectionsAndSchedule, status]);

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
    enabled: status === "authenticated",
    userId: user?.userId ?? null,
    scope: "social-page",
    onRefresh: refreshConnectionsAndSchedule,
    onEvent: handleRealtimeEvent,
  });

  // 새 이벤트(알림) 실시간 구독 — INSERT 시 unread count +1
  const handleNewEvent = useCallback(() => {
    setEventRefreshTick((prev) => prev + 1);
    fetchUnreadEventCount();
  }, [fetchUnreadEventCount]);
  useSocialEventsRealtimeRefresh({
    enabled: status === "authenticated",
    userId: user?.userId ?? null,
    onNewEvent: handleNewEvent,
  });

  const prefetchGroupBoard = useCallback(
    (groupId: number) => {
      if (status !== "authenticated" || !currentUserId) return;
      const boardCacheKey = buildSocialClientCacheKey(currentUserId, "group-board", `${groupId}:${fetchMonths}`);
      if (getSocialClientCache(boardCacheKey)) return;
      fetch(`/api/social/groups/${groupId}/board?months=${encodeURIComponent(fetchMonths)}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.ok) {
            setSocialClientCache(boardCacheKey, res.data);
          }
        })
        .catch(() => {});
    },
    [currentUserId, fetchMonths, status]
  );

  const handleRefresh = useCallback(() => {
    fetchProfile();
    fetchConnections();
    fetchFriendsSchedule();
    fetchGroups();
  }, [fetchConnections, fetchFriendsSchedule, fetchGroups, fetchProfile]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    setNotice(null);
    handleRefresh();
  }, [handleRefresh]);

  const handleOnboardingSkip = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleUpgradeForCreateGroup = useCallback(() => {
    if (billingLoading) return;
    router.push(withReturnTo("/settings/billing/upgrade", "/social?tab=groups&openCreate=1"));
  }, [billingLoading, router]);

  const pendingIncoming = useMemo(() => connections?.pendingIncoming ?? [], [connections?.pendingIncoming]);
  const pendingSent = useMemo(() => connections?.pendingSent ?? [], [connections?.pendingSent]);
  const rawAccepted = useMemo(() => connections?.accepted ?? [], [connections?.accepted]);
  const friendSchedules = useMemo(() => friendsSchedule?.friends ?? [], [friendsSchedule?.friends]);
  const friendScheduleByUserId = useMemo(
    () => new Map(friendSchedules.map((friend) => [friend.userId, friend])),
    [friendSchedules]
  );

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

  const selectableCommonOffFriends = useMemo<SocialOverlapSelectorItem[]>(
    () =>
      accepted
        .map((connection) => {
          const friend = friendScheduleByUserId.get(connection.userId);
          if (!friend) return null;
          const alias = friendMeta[connection.userId]?.alias.trim();
          return {
            id: connection.userId,
            label: alias || connection.nickname || "익명",
            emoji: connection.avatarEmoji,
            description:
              connection.statusMessage ||
              "이 친구와 내 일정이 같이 OFF/VAC인 날만 골라서 보여줘요.",
          };
        })
        .filter(Boolean) as SocialOverlapSelectorItem[],
    [accepted, friendMeta, friendScheduleByUserId]
  );

  const selectedCommonOffLabels = useMemo(() => {
    const selectedIdSet = new Set(selectedCommonOffFriendIds);
    return selectableCommonOffFriends
      .filter((friend) => selectedIdSet.has(friend.id))
      .map((friend) => friend.label);
  }, [selectableCommonOffFriends, selectedCommonOffFriendIds]);

  const selectedCommonOffDates = useMemo(
    () =>
      computeSelectedCommonOffDays({
        month,
        mySchedule,
        members: friendSchedules.map((friend) => ({
          userId: friend.userId,
          schedule: friend.schedule,
        })),
        selectedIds: selectedCommonOffFriendIds,
      }),
    [friendSchedules, month, mySchedule, selectedCommonOffFriendIds]
  );

  useEffect(() => {
    const nextAvailableIds = selectableCommonOffFriends.map((friend) => friend.id);
    const nextAvailableIdSet = new Set(nextAvailableIds);
    const previousAvailableIds = selectedCommonOffAvailableIdsRef.current;
    selectedCommonOffAvailableIdsRef.current = nextAvailableIds;

    setSelectedCommonOffFriendIds((prev) => {
      const pruned = prev.filter((id) => nextAvailableIdSet.has(id));
      if (prev.length === 0 && previousAvailableIds.length === 0) {
        return nextAvailableIds;
      }
      if (haveSameIds(prev, previousAvailableIds)) {
        return nextAvailableIds;
      }
      return pruned;
    });
  }, [selectableCommonOffFriends]);

  useEffect(() => {
    if (!inviteToken) {
      handledInviteRef.current = null;
    }
  }, [inviteToken]);

  useEffect(() => {
    if (!groupInviteToken) {
      handledGroupInviteRef.current = null;
    }
  }, [groupInviteToken]);

  useEffect(() => {
    if (groupInviteToken) {
      updateActiveTab("groups");
    }
  }, [groupInviteToken, updateActiveTab]);

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
        if (relationState === "accepted") {
          setNotice({ tone: "info", text: `${inviterNickname}님과 이미 연결되어 있어요.` });
          return;
        }
        if (relationState === "pending") {
          setNotice({ tone: "info", text: `${inviterNickname}님과 연결 요청이 이미 진행 중이에요.` });
          return;
        }
        if (relationState === "blocked") {
          setNotice({ tone: "error", text: "이 사용자와는 연결할 수 없어요." });
          return;
        }

        setConnectPrefillCode(String(res.data?.code ?? ""));
        setConnectPrefillMessage(`${inviterNickname}님의 코드가 자동 입력되었어요.`);
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

  useEffect(() => {
    if (!groupInviteToken || status !== "authenticated" || !profileChecked || showOnboarding || !profile) return;
    if (handledGroupInviteRef.current === groupInviteToken) return;
    handledGroupInviteRef.current = groupInviteToken;
    let navigatedToGroup = false;

    fetch("/api/social/groups/invites/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: groupInviteToken }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok) {
          const message =
            res.error === "invite_not_found_or_expired"
              ? "그룹 초대 링크가 만료되었거나 더 이상 유효하지 않아요."
              : res.error === "too_many_requests"
                ? "그룹 초대 링크 확인을 너무 자주 시도하고 있어요. 잠시 후 다시 시도해 주세요."
                : "그룹 초대 링크를 확인하지 못했어요.";
          setNotice({ tone: "error", text: message });
          return;
        }

        const preview = res.data as SocialGroupInvitePreview;
        setGroupInvitePreview(preview);
        if (preview.state === "already_member") {
          setNotice({ tone: "info", text: `${preview.group.name} 그룹에 이미 참여 중이에요.` });
          void fetchGroups();
          navigatedToGroup = true;
          router.push(withReturnTo(`/social/groups/${preview.group.id}`, groupsTabHref));
          return;
        }
        if (preview.state === "group_full") {
          setNotice({ tone: "error", text: `${preview.group.name} 그룹은 현재 정원이 가득 찼어요.` });
          return;
        }

        setOpenGroupJoin(true);
        setNotice({
          tone: preview.state === "request_pending" ? "info" : "success",
          text:
            preview.state === "request_pending"
              ? `${preview.group.name} 그룹 가입 요청이 이미 대기 중이에요.`
              : preview.state === "approval_required"
                ? `${preview.group.name} 그룹은 승인 후 참여할 수 있어요.`
                : `${preview.group.name} 그룹 초대를 확인했어요.`,
        });
      })
      .catch(() => {
        setNotice({ tone: "error", text: "그룹 초대 링크를 확인하지 못했어요." });
      })
      .finally(() => {
        if (navigatedToGroup) return;
        router.replace("/social", { scroll: false });
      });
  }, [fetchGroups, groupInviteToken, groupsTabHref, profile, profileChecked, router, showOnboarding, status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToHome}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition active:opacity-60"
              aria-label="홈으로 돌아가기"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="h-6 w-16 rounded-full bg-gray-100 animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse" />
          </div>
        </header>
        {/* 스토리 스켈레톤 */}
        <div className="flex items-start gap-3 overflow-hidden px-3 py-3 border-b border-gray-100">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-[60px] h-[60px] rounded-full bg-gray-100 animate-pulse" />
              <div className="h-2.5 w-12 rounded-full bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToHome}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition active:opacity-60"
              aria-label="홈으로 돌아가기"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-[22px] font-black italic tracking-tight text-gray-900">소셜</span>
          </div>
          <div className="h-9 w-9" />
        </header>

        <div className="px-4 pt-6 pb-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="text-[16px] font-semibold text-gray-900">로그인 후 소셜을 사용할 수 있어요</div>
            <p className="mt-2 text-[13px] leading-6 text-gray-500">
              {groupInviteToken
                ? "그룹 초대 링크를 열었어요. 로그인하면 그룹 참여 화면이 자동으로 열립니다."
                : inviteToken
                  ? "공유 링크를 열었어요. 로그인하면 친구 코드 입력창이 자동으로 열립니다."
                  : "친구 코드를 주고받고, 서로의 일정을 보려면 로그인해야 해요."}
            </p>
            {authError ? (
              <div className="mt-3 rounded-2xl border border-[#F3D7A8] bg-[#FFF8EC] px-3 py-3 text-[12.5px] leading-6 text-[#8A5A12]">
                {authError === "unauthorized_email" || authError === "unauthorized_new_user"
                  ? "이 계정은 현재 테스트 허용 목록에 없어 로그인할 수 없어요."
                  : "Google 로그인 처리에 실패했어요. 잠시 후 다시 시도해 주세요."}
              </div>
            ) : null}
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToHome}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
              aria-label="홈으로 돌아가기"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-[22px] font-black italic tracking-tight text-gray-900 select-none">
              소셜
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isSocialAdmin ? (
              <button
                type="button"
                onClick={() => router.push("/social/admin")}
                className="flex h-9 min-w-[42px] items-center justify-center gap-1 rounded-full border border-[#e5e7eb] bg-[#fafbfc] px-3 text-[11px] font-semibold text-[#17324D] transition hover:bg-white active:opacity-60"
                aria-label="소셜 관리자"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M12 3l7 3v6c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6l7-3Z" />
                  <path d="m9.5 12 1.7 1.7 3.3-3.7" />
                </svg>
                관리
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setOpenEventCenter(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-800 transition hover:bg-gray-100 active:opacity-60"
              aria-label="알림"
            >
              <SocialBellIcon className="h-[22px] w-[22px]" />
              {unreadEventCount > 0 && (
                <span className="absolute right-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8.5px] font-bold text-white leading-none">
                  {unreadEventCount > 9 ? "9+" : unreadEventCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (profile?.handle) {
                  router.push(`/social/profile/${profile.handle}`);
                  return;
                }
                if (profile) {
                  setOpenProfile(true);
                  return;
                }
                setShowOnboarding(true);
              }}
              className="rnest-social-avatar-ring flex items-center justify-center rounded-full p-[2px] transition active:opacity-60"
              aria-label="내 소셜 프로필"
            >
              <span className="rnest-social-avatar-shell flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#f6f4ff] text-[18px]">
                {profile?.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.profileImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <SocialAvatarGlyph emoji={profile?.avatarEmoji ?? "👤"} className="h-5 w-5" />
                )}
              </span>
            </button>
          </div>
        </div>

        {activeTab === "explore" ? (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2.5 rounded-[22px] bg-gray-100 px-4 py-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0 text-gray-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={exploreSearchInputRef}
                value={exploreQuery}
                onChange={(event) => setExploreQuery(event.target.value)}
                placeholder="사용자나 게시글 검색"
                className="social-search-input w-full bg-transparent text-gray-900 outline-none placeholder:text-gray-400 leading-none"
                style={{ fontSize: "16px" }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {exploreQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setExploreQuery("");
                    exploreSearchInputRef.current?.focus();
                  }}
                  className="text-gray-400 transition active:opacity-60"
                  aria-label="검색어 지우기"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {/* ── 알림 배너 ─────────────────────────────────────── */}
      {notice && (
        <div
          className={`mx-4 mt-3 rounded-2xl px-4 py-3 text-[13px] ${
            notice.tone === "error"
              ? "border border-red-200 bg-red-50 text-red-700"
              : notice.tone === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-gray-100 bg-white text-gray-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* ── 피드 탭 ────────────────────────────────────────── */}
      {activeTab === "following" && (
        <SocialFeedTab
          scope="following"
          userGroups={groups.map((g) => ({ id: g.id, name: g.name }))}
          isAdmin={isSocialAdmin}
          defaultVisibility={profile?.defaultPostVisibility ?? DEFAULT_SOCIAL_POST_VISIBILITY}
          onTagClick={(t) => {
            setExploreTag(t);
            updateActiveTab("explore");
          }}
        />
      )}

      {activeTab === "explore" && (
        <SocialExploreTab
          userGroups={groups.map((g) => ({ id: g.id, name: g.name }))}
          defaultVisibility={profile?.defaultPostVisibility ?? DEFAULT_SOCIAL_POST_VISIBILITY}
          query={exploreQuery}
          tag={exploreTag}
          isAdmin={isSocialAdmin}
          onTagChange={(t) => {
            setExploreTag(t);
            if (typeof window !== "undefined") {
              const params = new URLSearchParams(window.location.search);
              if (t) params.set("tag", t); else params.delete("tag");
              window.history.replaceState(window.history.state, "", params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname);
            }
          }}
        />
      )}

      {/* ── 친구 / 그룹 탭 래퍼 (px-4 패딩 추가) ──────────── */}
      {(activeTab === "friends" || activeTab === "groups") && (
        <div className="px-4 pt-3 space-y-3 pb-[calc(96px+env(safe-area-inset-bottom))]">

          {/* ── 에러 상태 ────────────────────────────────────── */}
          {activeTab === "friends" && connectionsError && !connectionsLoading && (
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

          {activeTab === "groups" && groupsError && !groupsLoading && (
            <div className="flex items-center justify-between rounded-apple border border-ios-sep bg-white px-4 py-3 shadow-apple">
              <p className="text-[13px] text-ios-muted">그룹 목록을 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={fetchGroups}
                className="ml-3 shrink-0 rounded-full bg-ios-bg px-3 py-1.5 text-[12.5px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
              >
                재시도
              </button>
            </div>
          )}

          {/* ── 로딩 스켈레톤 ──────────────────────────────────── */}
          {activeTab === "friends" && connectionsLoading && (
            <div className="rounded-apple border border-ios-sep bg-white shadow-apple p-4 space-y-2.5">
              <div className="h-4 w-28 rounded-full bg-ios-sep animate-pulse" />
              <div className="h-3 w-44 rounded-full bg-ios-sep/60 animate-pulse" />
              <div className="h-3 w-36 rounded-full bg-ios-sep/40 animate-pulse" />
            </div>
          )}

          {activeTab === "groups" && groupsLoading && (
            <div className="rounded-apple border border-ios-sep bg-white shadow-apple p-4 space-y-2.5">
              <div className="h-4 w-28 rounded-full bg-ios-sep animate-pulse" />
              <div className="h-14 rounded-2xl bg-ios-sep/70 animate-pulse" />
              <div className="h-14 rounded-2xl bg-ios-sep/50 animate-pulse" />
            </div>
          )}

          {/* ── 받은/보낸 연결 요청 ─────────────────────────────── */}
          {activeTab === "friends" && !connectionsLoading && !connectionsError && (
            <SocialPendingCard
              incoming={pendingIncoming}
              sent={pendingSent}
              onRefresh={handleRefresh}
            />
          )}

          {/* ── 이번 주 근무 현황 ────────────────────────────────── */}
          {activeTab === "friends" && !scheduleLoading && friendSchedules.length > 0 && (
            <SocialThisWeek
              friends={friendSchedules}
              mySchedule={mySchedule}
            />
          )}

          {/* ── 다음 같이 쉬는 날 (친구별) ──────────────────────── */}
          {activeTab === "friends" && !scheduleLoading && accepted.length > 0 && (
            <SocialNextCommonOff
              connections={accepted}
              pairCommonOffByUserId={pairCommonOffByUserId}
            />
          )}

          {/* ── 선택한 친구와 같이 쉬는 날 ───────────────────────── */}
          {activeTab === "friends" && !scheduleLoading && selectableCommonOffFriends.length > 0 && (
            <SocialSelectableCommonOffCard
              title="선택한 친구와 같이 쉬는 날"
              subtitle="내 일정은 자동 포함돼요. 원하는 친구만 골라서 이번 달 교집합을 바로 볼 수 있어요."
              dates={selectedCommonOffDates}
              selectedLabels={selectedCommonOffLabels}
              selectedCount={selectedCommonOffFriendIds.length}
              availableCount={selectableCommonOffFriends.length}
              selectionNoun="친구"
              onSelectClick={() => setOpenCommonOffSelector(true)}
              emptyText={
                selectedCommonOffFriendIds.length === 0
                  ? "친구를 선택하면 이번 달 같이 쉬는 날을 바로 계산해드려요."
                  : "선택한 친구와 이번 달 같이 쉬는 날이 아직 없어요."
              }
            />
          )}

          {/* ── 친구 목록 ──────────────────────────────────────── */}
          {activeTab === "friends" && !connectionsLoading && !connectionsError && (
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
                  [userId]: { ...(prev[userId] ?? { pinned: false, alias: "" }), ...patch },
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

          {/* ── 그룹 목록 ─────────────────────────────────────── */}
          {activeTab === "groups" && !groupsLoading && !groupsError && (
            <SocialGroupList
              groups={groups}
              canCreateGroup={canCreateGroup}
              createGroupDisabled={billingLoading}
              onCreateGroup={() => setOpenGroupCreate(true)}
              onUpgradeForCreateGroup={handleUpgradeForCreateGroup}
              onPrefetchGroup={(group) => prefetchGroupBoard(group.id)}
              onOpenGroup={(group) => {
                prefetchGroupBoard(group.id);
                router.push(withReturnTo(`/social/groups/${group.id}`, groupsTabHref));
              }}
            />
          )}

        </div>
      )}

      {/* ── 바텀시트들 ─────────────────────────────────────── */}
      <SocialProfileSheet
        open={openProfile}
        onClose={() => setOpenProfile(false)}
        profile={profile}
        onSaved={(nextProfile) => {
          setProfile(nextProfile);
          if (profileCacheKey) {
            setSocialClientCache(profileCacheKey, nextProfile);
          }
          void fetchGroups();
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

      <SocialGroupCreateSheet
        open={openGroupCreate}
        onClose={() => setOpenGroupCreate(false)}
        onCreated={(group) => {
          const nextGroups = [group, ...groups.filter((item) => item.id !== group.id)];
          setOpenGroupCreate(false);
          setGroups(nextGroups);
          if (groupsCacheKey) {
            setSocialClientCache(groupsCacheKey, nextGroups);
          }
          updateActiveTab("groups");
          setNotice({ tone: "success", text: `${group.name} 그룹을 만들었어요.` });
          router.push(withReturnTo(`/social/groups/${group.id}`, groupsTabHref));
        }}
      />

      <SocialGroupJoinSheet
        open={openGroupJoin}
        preview={groupInvitePreview}
        onClose={() => {
          setOpenGroupJoin(false);
          setGroupInvitePreview(null);
        }}
        onJoined={(group, state) => {
          setOpenGroupJoin(false);
          setGroupInvitePreview(null);
          updateActiveTab("groups");
          void fetchGroups();
          if (state === "request_pending") {
            setNotice({ tone: "info", text: `${group.name} 그룹 가입 요청을 보냈어요.` });
            return;
          }
          const nextGroups = [group, ...groups.filter((item) => item.id !== group.id)];
          setGroups(nextGroups);
          if (groupsCacheKey) {
            setSocialClientCache(groupsCacheKey, nextGroups);
          }
          router.push(withReturnTo(`/social/groups/${group.id}`, groupsTabHref));
          setNotice({ tone: "success", text: `${group.name} 그룹에 참여했어요.` });
        }}
      />

      <SocialEventCenter
        open={openEventCenter}
        onClose={() => setOpenEventCenter(false)}
        onUnreadCountChange={setUnreadEventCount}
        refreshTick={eventRefreshTick}
      />

      <SocialOverlapSelectorSheet
        open={openCommonOffSelector}
        title="같이 쉬는 친구 선택"
        subtitle="선택한 친구들과 내 일정이 모두 OFF/VAC인 날만 계산해요."
        noun="친구"
        items={selectableCommonOffFriends}
        selectedIds={selectedCommonOffFriendIds}
        onClose={() => setOpenCommonOffSelector(false)}
        onApply={setSelectedCommonOffFriendIds}
      />
    </div>
  );
}
