"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { authHeaders } from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { useSocialAdminAccess } from "@/lib/socialAdminClient";
import type {
  SocialAdminActorSummary,
  SocialAdminChallengeItem,
  SocialAdminContentItem,
  SocialAdminContentKind,
  SocialAdminGroupDetail,
  SocialAdminGroupItem,
  SocialAdminOverview,
  SocialAdminUserDetail,
  SocialAdminUserListItem,
  SocialAdminUserState,
} from "@/types/socialAdmin";

type AdminTab = "overview" | "users" | "content" | "groups" | "challenges";
type NoticeTone = "success" | "error" | "info";

type AdminResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

const TAB_OPTIONS: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "개요" },
  { id: "users", label: "사용자" },
  { id: "content", label: "콘텐츠" },
  { id: "groups", label: "그룹" },
  { id: "challenges", label: "챌린지" },
];

const EMPTY_OVERVIEW: SocialAdminOverview = {
  totalUsers: 0,
  totalPosts: 0,
  totalComments: 0,
  activeStories: 0,
  totalGroups: 0,
  pendingJoinRequests: 0,
  activeChallenges: 0,
  readOnlyUsers: 0,
  suspendedUsers: 0,
  postsLast24h: 0,
  storiesLast24h: 0,
  aiBriefsThisWeek: 0,
};

async function socialAdminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as AdminResponse<T> | null;
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error ?? `request_failed:${res.status}`));
  }
  return json.data as T;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stateLabel(state: SocialAdminUserState) {
  if (state === "read_only") return "읽기 전용";
  if (state === "suspended") return "정지";
  return "활성";
}

function stateChipClass(state: SocialAdminUserState) {
  if (state === "read_only") return "bg-[#FFF8E6] text-[#8A5A12] border-[#F3D7A8]";
  if (state === "suspended") return "bg-[#FFF1F2] text-[#B42318] border-[#FECACA]";
  return "bg-[#EFFAF5] text-[#0B7A3E] border-[#B7E4C7]";
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#eef1f4] bg-white px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b8794]">{label}</div>
      <div className="mt-2 text-[26px] font-black tracking-[-0.04em] text-[#111827]">{value}</div>
      {hint ? <div className="mt-2 text-[12px] leading-5 text-[#667085]">{hint}</div> : null}
    </div>
  );
}

function SectionPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-[#edf0f3] bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[20px] font-bold tracking-[-0.03em] text-[#111827]">{title}</div>
          <p className="mt-2 text-[13px] leading-6 text-[#667085]">{description}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SegmentedTabs({
  value,
  onChange,
}: {
  value: AdminTab;
  onChange: (value: AdminTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-[24px] bg-[#f4f5f7] p-1">
      {TAB_OPTIONS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-[20px] px-4 py-2.5 text-[13px] font-semibold transition ${
            value === tab.id
              ? "bg-white text-[#111827] shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
              : "text-[#667085] hover:text-[#111827]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[22px] border border-[#eceff3] bg-[#fafbfc] px-4 py-3">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-[#98A2B3]"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] text-[#111827] outline-none placeholder:text-[#98A2B3]"
      />
    </div>
  );
}

function ReasonBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-none rounded-[20px] border border-[#eceff3] bg-[#fafbfc] px-4 py-3 text-[13px] leading-6 text-[#111827] outline-none placeholder:text-[#98A2B3]"
    />
  );
}

function NoticeBanner({
  tone,
  text,
}: {
  tone: NoticeTone;
  text: string;
}) {
  const className =
    tone === "error"
      ? "border-[#FECACA] bg-[#FFF1F2] text-[#B42318]"
      : tone === "success"
        ? "border-[#B7E4C7] bg-[#EFFAF5] text-[#0B7A3E]"
        : "border-[#D5E3F0] bg-[#F6FAFD] text-[#17324D]";
  return (
    <div className={`rounded-[22px] border px-4 py-3 text-[13px] ${className}`}>{text}</div>
  );
}

function ActorChip({ actor }: { actor: SocialAdminActorSummary }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#f4f5f7] text-[18px]">
        {actor.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.profileImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          actor.avatarEmoji
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-[#111827]">{actor.displayName}</div>
        <div className="truncate text-[12px] text-[#667085]">
          @{actor.handle ?? actor.nickname}
        </div>
      </div>
    </div>
  );
}

function ensureReason(reason: string, fallback: string) {
  const normalized = reason.trim();
  if (normalized.length >= 2) return normalized;
  throw new Error(fallback);
}

export function SocialAdminPage() {
  const { status } = useAuthState();
  const { isAdmin, checked } = useSocialAdminAccess(status === "authenticated");

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);

  const [overview, setOverview] = useState<SocialAdminOverview>(EMPTY_OVERVIEW);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [users, setUsers] = useState<SocialAdminUserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersQuery, setUsersQuery] = useState("");
  const [usersStateFilter, setUsersStateFilter] = useState<"all" | SocialAdminUserState>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<SocialAdminUserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userReason, setUserReason] = useState("");
  const [userActionLoading, setUserActionLoading] = useState<SocialAdminUserState | null>(null);

  const [contentItems, setContentItems] = useState<SocialAdminContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentQuery, setContentQuery] = useState("");
  const [contentKind, setContentKind] = useState<"all" | SocialAdminContentKind>("all");
  const [contentReason, setContentReason] = useState("");
  const [contentActionKey, setContentActionKey] = useState<string | null>(null);

  const [groups, setGroups] = useState<SocialAdminGroupItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsQuery, setGroupsQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<SocialAdminGroupDetail | null>(null);
  const [groupDetailLoading, setGroupDetailLoading] = useState(false);
  const [groupReason, setGroupReason] = useState("");
  const [groupActionLoading, setGroupActionLoading] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    notice: "",
    joinMode: "open" as "open" | "approval",
    allowMemberInvites: true,
    maxMembers: 12,
  });

  const [challenges, setChallenges] = useState<SocialAdminChallengeItem[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesQuery, setChallengesQuery] = useState("");
  const [challengeReason, setChallengeReason] = useState("");
  const [challengeActionId, setChallengeActionId] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const data = await socialAdminFetch<SocialAdminOverview>("/api/admin/social/overview");
      setOverview(data);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (usersQuery.trim()) params.set("q", usersQuery.trim());
      params.set("state", usersStateFilter);
      const data = await socialAdminFetch<{ users: SocialAdminUserListItem[] }>(
        `/api/admin/social/users?${params.toString()}`,
      );
      setUsers(data.users);
      if (!selectedUserId || !data.users.some((user) => user.userId === selectedUserId)) {
        const nextUserId = data.users[0]?.userId ?? null;
        setSelectedUserId(nextUserId);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [selectedUserId, usersQuery, usersStateFilter]);

  const loadUserDetail = useCallback(async (userId: string) => {
    setUserDetailLoading(true);
    try {
      const data = await socialAdminFetch<{ user: SocialAdminUserDetail }>(
        `/api/admin/social/users/${encodeURIComponent(userId)}`,
      );
      setSelectedUser(data.user);
    } finally {
      setUserDetailLoading(false);
    }
  }, []);

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    try {
      const params = new URLSearchParams();
      if (contentQuery.trim()) params.set("q", contentQuery.trim());
      params.set("kind", contentKind);
      const data = await socialAdminFetch<{ items: SocialAdminContentItem[] }>(
        `/api/admin/social/content?${params.toString()}`,
      );
      setContentItems(data.items);
    } finally {
      setContentLoading(false);
    }
  }, [contentKind, contentQuery]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const params = new URLSearchParams();
      if (groupsQuery.trim()) params.set("q", groupsQuery.trim());
      const data = await socialAdminFetch<{ groups: SocialAdminGroupItem[] }>(
        `/api/admin/social/groups?${params.toString()}`,
      );
      setGroups(data.groups);
      if (!selectedGroupId || !data.groups.some((group) => group.id === selectedGroupId)) {
        const nextGroupId = data.groups[0]?.id ?? null;
        setSelectedGroupId(nextGroupId);
      }
    } finally {
      setGroupsLoading(false);
    }
  }, [groupsQuery, selectedGroupId]);

  const loadGroupDetail = useCallback(async (groupId: number) => {
    setGroupDetailLoading(true);
    try {
      const data = await socialAdminFetch<{ group: SocialAdminGroupDetail }>(
        `/api/admin/social/groups/${groupId}`,
      );
      setSelectedGroup(data.group);
    } finally {
      setGroupDetailLoading(false);
    }
  }, []);

  const loadChallenges = useCallback(async () => {
    setChallengesLoading(true);
    try {
      const params = new URLSearchParams();
      if (challengesQuery.trim()) params.set("q", challengesQuery.trim());
      const data = await socialAdminFetch<{ challenges: SocialAdminChallengeItem[] }>(
        `/api/admin/social/challenges?${params.toString()}`,
      );
      setChallenges(data.challenges);
    } finally {
      setChallengesLoading(false);
    }
  }, [challengesQuery]);

  useEffect(() => {
    if (status !== "authenticated" || !isAdmin) return;
    void loadOverview().catch((error: any) => {
      setNotice({ tone: "error", text: String(error?.message ?? "개요를 불러오지 못했습니다.") });
    });
  }, [isAdmin, loadOverview, status]);

  useEffect(() => {
    if (status !== "authenticated" || !isAdmin) return;
    if (activeTab === "users" && users.length === 0 && !usersLoading) {
      void loadUsers().catch((error: any) => {
        setNotice({ tone: "error", text: String(error?.message ?? "사용자 목록을 불러오지 못했습니다.") });
      });
    }
    if (activeTab === "content" && contentItems.length === 0 && !contentLoading) {
      void loadContent().catch((error: any) => {
        setNotice({ tone: "error", text: String(error?.message ?? "콘텐츠를 불러오지 못했습니다.") });
      });
    }
    if (activeTab === "groups" && groups.length === 0 && !groupsLoading) {
      void loadGroups().catch((error: any) => {
        setNotice({ tone: "error", text: String(error?.message ?? "그룹을 불러오지 못했습니다.") });
      });
    }
    if (activeTab === "challenges" && challenges.length === 0 && !challengesLoading) {
      void loadChallenges().catch((error: any) => {
        setNotice({ tone: "error", text: String(error?.message ?? "챌린지를 불러오지 못했습니다.") });
      });
    }
  }, [
    activeTab,
    challenges.length,
    challengesLoading,
    contentItems.length,
    contentLoading,
    groups.length,
    groupsLoading,
    isAdmin,
    loadChallenges,
    loadContent,
    loadGroups,
    loadUsers,
    status,
    users.length,
    usersLoading,
  ]);

  useEffect(() => {
    if (!selectedUserId || status !== "authenticated" || !isAdmin) {
      setSelectedUser(null);
      return;
    }
    void loadUserDetail(selectedUserId).catch((error: any) => {
      setNotice({ tone: "error", text: String(error?.message ?? "사용자 상세를 불러오지 못했습니다.") });
    });
  }, [isAdmin, loadUserDetail, selectedUserId, status]);

  useEffect(() => {
    if (!selectedGroupId || status !== "authenticated" || !isAdmin) {
      setSelectedGroup(null);
      return;
    }
    void loadGroupDetail(selectedGroupId).catch((error: any) => {
      setNotice({ tone: "error", text: String(error?.message ?? "그룹 상세를 불러오지 못했습니다.") });
    });
  }, [isAdmin, loadGroupDetail, selectedGroupId, status]);

  useEffect(() => {
    if (!selectedGroup) return;
    setGroupForm({
      name: selectedGroup.name,
      description: selectedGroup.description,
      notice: selectedGroup.notice,
      joinMode: selectedGroup.joinMode,
      allowMemberInvites: selectedGroup.allowMemberInvites,
      maxMembers: selectedGroup.maxMembers,
    });
  }, [selectedGroup]);

  const handleUserStateChange = useCallback(
    async (nextState: SocialAdminUserState) => {
      if (!selectedUserId) return;
      try {
        const reason = ensureReason(userReason, "사용자 제어 사유를 2자 이상 입력하세요.");
        setUserActionLoading(nextState);
        await socialAdminFetch(`/api/admin/social/users/${encodeURIComponent(selectedUserId)}`, {
          method: "PATCH",
          body: JSON.stringify({ state: nextState, reason }),
        });
        setNotice({
          tone: "success",
          text: `${selectedUser?.displayName ?? "사용자"} 상태를 ${stateLabel(nextState)}로 변경했습니다.`,
        });
        setUserReason("");
        await loadUsers();
        await loadOverview();
        await loadUserDetail(selectedUserId);
      } catch (error: any) {
        setNotice({ tone: "error", text: String(error?.message ?? "사용자 상태를 변경하지 못했습니다.") });
      } finally {
        setUserActionLoading(null);
      }
    },
    [loadOverview, loadUserDetail, loadUsers, selectedUser?.displayName, selectedUserId, userReason],
  );

  const handleDeleteContent = useCallback(
    async (item: SocialAdminContentItem) => {
      try {
        const reason = ensureReason(contentReason, "콘텐츠 조치 사유를 2자 이상 입력하세요.");
        const actionKey = `${item.kind}:${item.id}`;
        setContentActionKey(actionKey);
        await socialAdminFetch(`/api/admin/social/content/${item.kind}/${item.id}`, {
          method: "DELETE",
          body: JSON.stringify({ reason }),
        });
        setNotice({
          tone: "success",
          text: `${item.kind === "story" ? "스토리" : item.kind === "comment" ? "댓글" : "게시글"}를 삭제했습니다.`,
        });
        await loadContent();
        await loadOverview();
      } catch (error: any) {
        setNotice({ tone: "error", text: String(error?.message ?? "콘텐츠를 삭제하지 못했습니다.") });
      } finally {
        setContentActionKey(null);
      }
    },
    [contentReason, loadContent, loadOverview],
  );

  const handleGroupAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (!selectedGroupId) return;
      try {
        const reason = ensureReason(groupReason, "그룹 조치 사유를 2자 이상 입력하세요.");
        setGroupActionLoading(action);
        await socialAdminFetch(`/api/admin/social/groups/${selectedGroupId}`, {
          method: "PATCH",
          body: JSON.stringify({ action, reason, ...payload }),
        });
        setNotice({ tone: "success", text: "그룹 조치를 반영했습니다." });
        if (action === "delete_group") {
          setSelectedGroupId(null);
          setSelectedGroup(null);
        }
        await loadGroups();
        await loadOverview();
        if (action !== "delete_group") {
          await loadGroupDetail(selectedGroupId);
        }
      } catch (error: any) {
        setNotice({ tone: "error", text: String(error?.message ?? "그룹 조치를 처리하지 못했습니다.") });
      } finally {
        setGroupActionLoading(null);
      }
    },
    [groupReason, loadGroupDetail, loadGroups, loadOverview, selectedGroupId],
  );

  const handleSaveGroupSettings = useCallback(async () => {
    await handleGroupAction("update_settings", groupForm);
  }, [groupForm, handleGroupAction]);

  const handleRefreshGroupBrief = useCallback(async () => {
    if (!selectedGroupId) return;
    try {
      const reason = ensureReason(groupReason, "AI 브리프 재생성 사유를 2자 이상 입력하세요.");
      setGroupActionLoading("ai_brief_refresh");
      await socialAdminFetch(`/api/admin/social/groups/${selectedGroupId}/ai-brief-refresh`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setNotice({ tone: "success", text: "AI 브리프를 재생성했습니다." });
      await loadGroups();
      await loadOverview();
      await loadGroupDetail(selectedGroupId);
    } catch (error: any) {
      setNotice({ tone: "error", text: String(error?.message ?? "AI 브리프를 재생성하지 못했습니다.") });
    } finally {
      setGroupActionLoading(null);
    }
  }, [groupReason, loadGroupDetail, loadGroups, loadOverview, selectedGroupId]);

  const handleCancelChallenge = useCallback(
    async (challengeId: number) => {
      try {
        const reason = ensureReason(challengeReason, "챌린지 종료 사유를 2자 이상 입력하세요.");
        setChallengeActionId(challengeId);
        await socialAdminFetch(`/api/admin/social/challenges/${challengeId}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        setNotice({ tone: "success", text: "챌린지를 종료했습니다." });
        await loadChallenges();
        await loadOverview();
      } catch (error: any) {
        setNotice({ tone: "error", text: String(error?.message ?? "챌린지를 종료하지 못했습니다.") });
      } finally {
        setChallengeActionId(null);
      }
    },
    [challengeReason, loadChallenges, loadOverview],
  );

  const storyRow = useMemo(
    () => [
      { label: "소셜 사용자", value: formatCount(overview.totalUsers), hint: `읽기 전용 ${formatCount(overview.readOnlyUsers)}명` },
      { label: "활성 게시글", value: formatCount(overview.totalPosts), hint: `댓글 ${formatCount(overview.totalComments)}개` },
      { label: "활성 스토리", value: formatCount(overview.activeStories), hint: `24시간 새 글 ${formatCount(overview.storiesLast24h)}건` },
      { label: "그룹 운영", value: formatCount(overview.totalGroups), hint: `가입 대기 ${formatCount(overview.pendingJoinRequests)}건` },
      { label: "진행 중 챌린지", value: formatCount(overview.activeChallenges), hint: `이번 주 AI 브리프 ${formatCount(overview.aiBriefsThisWeek)}회` },
      { label: "정지 계정", value: formatCount(overview.suspendedUsers), hint: `24시간 게시글 ${formatCount(overview.postsLast24h)}건` },
    ],
    [overview],
  );

  if (status !== "authenticated") {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1280px] px-4 py-8">
        <SectionPanel
          title="소셜 운영 센터"
          description="관리자 계정으로 로그인해야 소셜 운영 페이지에 접근할 수 있습니다."
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => signInWithProvider("google")}
              className="rounded-full bg-[#111827] px-5 py-3 text-[13px] font-semibold text-white"
            >
              Google로 로그인
            </button>
            <Link
              href="/social"
              className="rounded-full border border-[#e5e7eb] px-5 py-3 text-[13px] font-semibold text-[#374151]"
            >
              소셜로 돌아가기
            </Link>
          </div>
        </SectionPanel>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1280px] px-4 py-8">
        <SectionPanel
          title="소셜 운영 센터"
          description="관리자 권한을 확인하는 중입니다."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-[108px] animate-pulse rounded-[24px] bg-[#f3f4f6]" />
            ))}
          </div>
        </SectionPanel>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1280px] px-4 py-8">
        <SectionPanel
          title="소셜 운영 센터"
          description="현재 계정에는 소셜 관리자 권한이 없습니다."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/social"
              className="rounded-full bg-[#111827] px-5 py-3 text-[13px] font-semibold text-white"
            >
              소셜 홈으로 이동
            </Link>
            <Link
              href="/settings/admin"
              className="rounded-full border border-[#e5e7eb] px-5 py-3 text-[13px] font-semibold text-[#374151]"
            >
              설정 관리자 홈
            </Link>
          </div>
        </SectionPanel>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfbfc_0%,#f5f7fa_42%,#eef2f6_100%)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-6">
        <div className="rounded-[36px] border border-[#eef1f4] bg-white/90 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-[720px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667085]">
                Social Admin
              </div>
              <div className="mt-4 text-[34px] font-black tracking-[-0.05em] text-[#111827]">
                운영자가 소셜 전체를 직접 제어하는 화면
              </div>
              <p className="mt-3 text-[14px] leading-7 text-[#667085]">
                사용자 상태 제어, 게시글·댓글·스토리 삭제, 그룹 가입 요청 처리, AI 브리프 재생성,
                챌린지 종료까지 현재 앱의 소셜 기능을 한 곳에서 관리합니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {storyRow.slice(0, 4).map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-[#e8edf3] bg-[#fafbfc] px-3 py-2 text-[12px] text-[#475467]"
                  >
                    <span className="font-semibold text-[#111827]">{item.value}</span>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/social"
                className="rounded-full border border-[#e5e7eb] px-5 py-3 text-[13px] font-semibold text-[#374151]"
              >
                소셜 홈
              </Link>
              <Link
                href="/settings/admin"
                className="rounded-full border border-[#e5e7eb] px-5 py-3 text-[13px] font-semibold text-[#374151]"
              >
                운영 허브
              </Link>
            </div>
          </div>

          <div className="mt-6">
            <SegmentedTabs value={activeTab} onChange={setActiveTab} />
          </div>
        </div>

        {notice ? <div className="mt-4"><NoticeBanner tone={notice.tone} text={notice.text} /></div> : null}

        {activeTab === "overview" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {storyRow.map((item) => (
              <MetricCard key={item.label} label={item.label} value={item.value} hint={item.hint} />
            ))}
            <div className="xl:col-span-3">
              <SectionPanel
                title="운영 바로가기"
                description="사유 입력과 함께 각 섹션에서 조치를 실행하면 서버 audit log에 기록됩니다."
                actions={overviewLoading ? <span className="text-[12px] text-[#667085]">새로고침 중...</span> : null}
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab("users")}
                    className="rounded-[24px] border border-[#edf0f3] bg-[#fafbfc] px-4 py-4 text-left"
                  >
                    <div className="text-[12px] font-semibold text-[#667085]">사용자 제어</div>
                    <div className="mt-2 text-[18px] font-bold text-[#111827]">읽기 전용 / 정지</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#667085]">현재 제한 계정 {formatCount(overview.readOnlyUsers + overview.suspendedUsers)}명</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("content")}
                    className="rounded-[24px] border border-[#edf0f3] bg-[#fafbfc] px-4 py-4 text-left"
                  >
                    <div className="text-[12px] font-semibold text-[#667085]">콘텐츠 정리</div>
                    <div className="mt-2 text-[18px] font-bold text-[#111827]">게시글·댓글·스토리</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#667085]">운영자가 직접 삭제하고 기록을 남깁니다.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("groups")}
                    className="rounded-[24px] border border-[#edf0f3] bg-[#fafbfc] px-4 py-4 text-left"
                  >
                    <div className="text-[12px] font-semibold text-[#667085]">그룹 관리</div>
                    <div className="mt-2 text-[18px] font-bold text-[#111827]">가입 요청·강퇴·설정</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#667085]">현재 가입 대기 {formatCount(overview.pendingJoinRequests)}건</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("challenges")}
                    className="rounded-[24px] border border-[#edf0f3] bg-[#fafbfc] px-4 py-4 text-left"
                  >
                    <div className="text-[12px] font-semibold text-[#667085]">챌린지 종료</div>
                    <div className="mt-2 text-[18px] font-bold text-[#111827]">진행 중 챌린지 통제</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#667085]">현재 활성 {formatCount(overview.activeChallenges)}개</div>
                  </button>
                </div>
              </SectionPanel>
            </div>
          </div>
        ) : null}

        {activeTab === "users" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionPanel
              title="사용자 목록"
              description="닉네임, 핸들, 사용자 ID로 검색하고 소셜 전용 상태를 필터링합니다."
              actions={
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  className="rounded-full border border-[#dbe1e8] px-4 py-2 text-[12px] font-semibold text-[#17324D]"
                >
                  새로고침
                </button>
              }
            >
              <div className="space-y-3">
                <SearchField
                  value={usersQuery}
                  onChange={setUsersQuery}
                  placeholder="닉네임, 핸들, 이메일, 사용자 ID"
                />
                <div className="flex flex-wrap gap-2">
                  {(["all", "active", "read_only", "suspended"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setUsersStateFilter(value)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                        usersStateFilter === value
                          ? "bg-[#111827] text-white"
                          : "border border-[#dbe1e8] bg-white text-[#475467]"
                      }`}
                    >
                      {value === "all" ? "전체" : stateLabel(value)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void loadUsers()}
                    className="rounded-full bg-[#f4f5f7] px-3 py-1.5 text-[12px] font-semibold text-[#344054]"
                  >
                    적용
                  </button>
                </div>

                <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                  {usersLoading ? (
                    <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-10 text-center text-[13px] text-[#667085]">
                      사용자 목록을 불러오는 중...
                    </div>
                  ) : users.length === 0 ? (
                    <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-10 text-center text-[13px] text-[#667085]">
                      조건에 맞는 사용자가 없습니다.
                    </div>
                  ) : (
                    users.map((user) => (
                      <button
                        key={user.userId}
                        type="button"
                        onClick={() => setSelectedUserId(user.userId)}
                        className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                          selectedUserId === user.userId
                            ? "border-[#111827] bg-[#111827] text-white"
                            : "border-[#edf0f3] bg-[#fafbfc] text-[#111827]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <ActorChip actor={user} />
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${selectedUserId === user.userId ? "border-white/25 bg-white/10 text-white" : stateChipClass(user.state)}`}>
                            {stateLabel(user.state)}
                          </span>
                        </div>
                        <div className={`mt-3 grid grid-cols-3 gap-2 text-[12px] ${selectedUserId === user.userId ? "text-white/80" : "text-[#667085]"}`}>
                          <span>게시글 {formatCount(user.postCount)}</span>
                          <span>스토리 {formatCount(user.storyCount)}</span>
                          <span>그룹 {formatCount(user.groupCount)}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </SectionPanel>

            <SectionPanel
              title="사용자 상세 제어"
              description="상태 변경 시 이후 소셜 쓰기 경로 전체에 즉시 적용됩니다."
            >
              {!selectedUserId ? (
                <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                  왼쪽에서 사용자를 선택하세요.
                </div>
              ) : userDetailLoading || !selectedUser ? (
                <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                  사용자 상세를 불러오는 중...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-[#edf0f3] bg-[#fafbfc] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <ActorChip actor={selectedUser} />
                      <span className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${stateChipClass(selectedUser.state)}`}>
                        {stateLabel(selectedUser.state)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <MetricCard label="팔로워" value={formatCount(selectedUser.followerCount)} />
                      <MetricCard label="친구" value={formatCount(selectedUser.friendCount)} />
                      <MetricCard label="대기 요청" value={formatCount(selectedUser.pendingIncomingRequests + selectedUser.pendingOutgoingRequests)} />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                      <div className="text-[13px] font-semibold text-[#111827]">계정 설정</div>
                      <div className="mt-3 space-y-2 text-[13px] text-[#667085]">
                        <div>공개 범위: {selectedUser.accountVisibility === "private" ? "비공개" : "공개"}</div>
                        <div>기본 게시글: {selectedUser.defaultPostVisibility}</div>
                        <div>플랜: {selectedUser.subscriptionTier}</div>
                        <div>최근 활동: {formatDateTime(selectedUser.lastSeenAt)}</div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                      <div className="text-[13px] font-semibold text-[#111827]">최근 그룹</div>
                      <div className="mt-3 space-y-2 text-[13px] text-[#667085]">
                        {selectedUser.recentGroups.length === 0 ? (
                          <div>참여 중인 그룹이 없습니다.</div>
                        ) : (
                          selectedUser.recentGroups.slice(0, 4).map((group) => (
                            <div key={`${group.groupId}:${group.joinedAt}`} className="flex items-center justify-between gap-3">
                              <span className="truncate text-[#111827]">{group.name}</span>
                              <span className="rounded-full bg-[#f4f5f7] px-2 py-1 text-[11px] font-semibold text-[#475467]">
                                {group.role}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                    <div className="text-[13px] font-semibold text-[#111827]">조치 사유</div>
                    <div className="mt-3">
                      <ReasonBox
                        value={userReason}
                        onChange={setUserReason}
                        placeholder="예: 신고 누적, 운영자 검토 결과, 일시적 쓰기 제한 사유"
                      />
                    </div>
                    {selectedUser.stateReason ? (
                      <div className="mt-3 rounded-[18px] bg-[#fafbfc] px-3 py-3 text-[12px] text-[#667085]">
                        현재 기록된 사유: {selectedUser.stateReason}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(["active", "read_only", "suspended"] as const).map((nextState) => (
                        <button
                          key={nextState}
                          type="button"
                          disabled={userActionLoading !== null}
                          onClick={() => void handleUserStateChange(nextState)}
                          className={`rounded-full px-4 py-2 text-[12px] font-semibold ${
                            nextState === "active"
                              ? "bg-[#EFFAF5] text-[#0B7A3E]"
                              : nextState === "read_only"
                                ? "bg-[#FFF8E6] text-[#8A5A12]"
                                : "bg-[#FFF1F2] text-[#B42318]"
                          } disabled:opacity-50`}
                        >
                          {userActionLoading === nextState ? "처리 중..." : stateLabel(nextState)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </SectionPanel>
          </div>
        ) : null}

        {activeTab === "content" ? (
          <div className="mt-5 space-y-4">
            <SectionPanel
              title="콘텐츠 운영"
              description="현재 소셜의 게시글, 댓글, 스토리를 검색하고 삭제할 수 있습니다."
              actions={
                <button
                  type="button"
                  onClick={() => void loadContent()}
                  className="rounded-full border border-[#dbe1e8] px-4 py-2 text-[12px] font-semibold text-[#17324D]"
                >
                  새로고침
                </button>
              }
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <SearchField
                  value={contentQuery}
                  onChange={setContentQuery}
                  placeholder="작성자, 핸들, 미리보기 텍스트, 그룹명 검색"
                />
                <div className="flex flex-wrap gap-2">
                  {(["all", "post", "comment", "story"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setContentKind(kind)}
                      className={`rounded-full px-3 py-2 text-[12px] font-semibold ${
                        contentKind === kind
                          ? "bg-[#111827] text-white"
                          : "border border-[#dbe1e8] bg-white text-[#475467]"
                      }`}
                    >
                      {kind === "all" ? "전체" : kind === "post" ? "게시글" : kind === "comment" ? "댓글" : "스토리"}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void loadContent()}
                    className="rounded-full bg-[#f4f5f7] px-3 py-2 text-[12px] font-semibold text-[#344054]"
                  >
                    적용
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <ReasonBox
                  value={contentReason}
                  onChange={setContentReason}
                  placeholder="콘텐츠 삭제 사유를 입력하세요."
                />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {contentLoading ? (
                  <div className="md:col-span-2 xl:col-span-3 rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                    콘텐츠를 불러오는 중...
                  </div>
                ) : contentItems.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3 rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                    조회된 콘텐츠가 없습니다.
                  </div>
                ) : (
                  contentItems.map((item) => (
                    <div key={`${item.kind}:${item.id}`} className="overflow-hidden rounded-[26px] border border-[#edf0f3] bg-white">
                      <div className="relative aspect-square bg-[#f4f5f7]">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[42px]">
                            {item.kind === "story" ? "📺" : item.kind === "comment" ? "💬" : "📝"}
                          </div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
                          {item.kind === "story" ? "스토리" : item.kind === "comment" ? "댓글" : "게시글"}
                        </span>
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        <ActorChip actor={item.author} />
                        <div className="text-[13px] leading-6 text-[#344054]">{item.preview || "미리보기 텍스트 없음"}</div>
                        <div className="grid gap-1 text-[12px] text-[#667085]">
                          <div>작성 시각: {formatDateTime(item.createdAt)}</div>
                          {item.groupName ? <div>그룹: {item.groupName}</div> : null}
                          {item.expiresAt ? <div>만료 시각: {formatDateTime(item.expiresAt)}</div> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteContent(item)}
                          disabled={contentActionKey === `${item.kind}:${item.id}`}
                          className="w-full rounded-full bg-[#FFF1F2] px-4 py-3 text-[12px] font-semibold text-[#B42318] disabled:opacity-50"
                        >
                          {contentActionKey === `${item.kind}:${item.id}` ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionPanel>
          </div>
        ) : null}

        {activeTab === "groups" ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <SectionPanel
              title="그룹 목록"
              description="그룹 기본 정보와 운영 상태를 빠르게 확인합니다."
              actions={
                <button
                  type="button"
                  onClick={() => void loadGroups()}
                  className="rounded-full border border-[#dbe1e8] px-4 py-2 text-[12px] font-semibold text-[#17324D]"
                >
                  새로고침
                </button>
              }
            >
              <div className="space-y-3">
                <SearchField
                  value={groupsQuery}
                  onChange={setGroupsQuery}
                  placeholder="그룹명, 소유자, 설명 검색"
                />
                <button
                  type="button"
                  onClick={() => void loadGroups()}
                  className="rounded-full bg-[#f4f5f7] px-4 py-2 text-[12px] font-semibold text-[#344054]"
                >
                  검색 적용
                </button>
                <div className="max-h-[780px] space-y-2 overflow-y-auto pr-1">
                  {groupsLoading ? (
                    <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-10 text-center text-[13px] text-[#667085]">
                      그룹 목록을 불러오는 중...
                    </div>
                  ) : groups.length === 0 ? (
                    <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-10 text-center text-[13px] text-[#667085]">
                      조건에 맞는 그룹이 없습니다.
                    </div>
                  ) : (
                    groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedGroupId(group.id)}
                        className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                          selectedGroupId === group.id
                            ? "border-[#111827] bg-[#111827] text-white"
                            : "border-[#edf0f3] bg-[#fafbfc] text-[#111827]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-semibold">{group.name}</div>
                            <div className={`mt-1 text-[12px] ${selectedGroupId === group.id ? "text-white/70" : "text-[#667085]"}`}>
                              멤버 {formatCount(group.memberCount)}명 · 요청 {formatCount(group.pendingJoinRequestCount)}건
                            </div>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selectedGroupId === group.id ? "bg-white/10 text-white" : "bg-[#edf4ff] text-[#24466E]"}`}>
                            {group.joinMode === "approval" ? "승인제" : "즉시가입"}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </SectionPanel>

            <SectionPanel
              title="그룹 운영 상세"
              description="설정 변경, 가입 요청 처리, 멤버 제거, AI 브리프 재생성을 실행합니다."
            >
              {!selectedGroupId ? (
                <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                  왼쪽에서 그룹을 선택하세요.
                </div>
              ) : groupDetailLoading || !selectedGroup ? (
                <div className="rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                  그룹 상세를 불러오는 중...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="멤버" value={formatCount(selectedGroup.memberCount)} />
                    <MetricCard label="가입 대기" value={formatCount(selectedGroup.pendingJoinRequestCount)} />
                    <MetricCard label="AI 브리프" value={selectedGroup.latestBriefGeneratedAt ? formatDateTime(selectedGroup.latestBriefGeneratedAt) : "없음"} />
                  </div>

                  <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-[12px] font-semibold text-[#344054]">
                        <span>그룹 이름</span>
                        <input
                          value={groupForm.name}
                          onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                          className="w-full rounded-[18px] border border-[#eceff3] bg-[#fafbfc] px-4 py-3 text-[13px] font-normal text-[#111827] outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-[12px] font-semibold text-[#344054]">
                        <span>최대 인원</span>
                        <input
                          type="number"
                          min={2}
                          max={24}
                          value={groupForm.maxMembers}
                          onChange={(event) => setGroupForm((prev) => ({ ...prev, maxMembers: Number.parseInt(event.target.value || "12", 10) || 12 }))}
                          className="w-full rounded-[18px] border border-[#eceff3] bg-[#fafbfc] px-4 py-3 text-[13px] font-normal text-[#111827] outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-[12px] font-semibold text-[#344054]">
                        <span>그룹 설명</span>
                        <textarea
                          value={groupForm.description}
                          onChange={(event) => setGroupForm((prev) => ({ ...prev, description: event.target.value }))}
                          rows={4}
                          className="w-full resize-none rounded-[18px] border border-[#eceff3] bg-[#fafbfc] px-4 py-3 text-[13px] font-normal text-[#111827] outline-none"
                        />
                      </label>
                      <label className="space-y-2 text-[12px] font-semibold text-[#344054]">
                        <span>공지</span>
                        <textarea
                          value={groupForm.notice}
                          onChange={(event) => setGroupForm((prev) => ({ ...prev, notice: event.target.value }))}
                          rows={4}
                          className="w-full resize-none rounded-[18px] border border-[#eceff3] bg-[#fafbfc] px-4 py-3 text-[13px] font-normal text-[#111827] outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-2 rounded-full border border-[#eceff3] bg-[#fafbfc] px-3 py-2 text-[12px] font-semibold text-[#344054]">
                        <span>가입 방식</span>
                        <select
                          value={groupForm.joinMode}
                          onChange={(event) => setGroupForm((prev) => ({ ...prev, joinMode: event.target.value === "approval" ? "approval" : "open" }))}
                          className="bg-transparent text-[12px] outline-none"
                        >
                          <option value="open">즉시가입</option>
                          <option value="approval">승인제</option>
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-full border border-[#eceff3] bg-[#fafbfc] px-3 py-2 text-[12px] font-semibold text-[#344054]">
                        <input
                          type="checkbox"
                          checked={groupForm.allowMemberInvites}
                          onChange={(event) => setGroupForm((prev) => ({ ...prev, allowMemberInvites: event.target.checked }))}
                        />
                        멤버 초대 허용
                      </label>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                    <div className="text-[13px] font-semibold text-[#111827]">조치 사유</div>
                    <div className="mt-3">
                      <ReasonBox
                        value={groupReason}
                        onChange={setGroupReason}
                        placeholder="예: 부적절한 활동 정리, 그룹 구조 조정, 운영 재검토"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveGroupSettings()}
                        disabled={groupActionLoading !== null}
                        className="rounded-full bg-[#111827] px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                      >
                        {groupActionLoading === "update_settings" ? "저장 중..." : "설정 저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRefreshGroupBrief()}
                        disabled={groupActionLoading !== null}
                        className="rounded-full bg-[#edf4ff] px-4 py-2.5 text-[12px] font-semibold text-[#24466E] disabled:opacity-50"
                      >
                        {groupActionLoading === "ai_brief_refresh" ? "재생성 중..." : "AI 브리프 재생성"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGroupAction("delete_group")}
                        disabled={groupActionLoading !== null}
                        className="rounded-full bg-[#FFF1F2] px-4 py-2.5 text-[12px] font-semibold text-[#B42318] disabled:opacity-50"
                      >
                        {groupActionLoading === "delete_group" ? "삭제 중..." : "그룹 삭제"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                      <div className="text-[13px] font-semibold text-[#111827]">가입 요청</div>
                      <div className="mt-3 space-y-3">
                        {selectedGroup.pendingRequests.length === 0 ? (
                          <div className="rounded-[18px] bg-[#fafbfc] px-3 py-6 text-center text-[12px] text-[#667085]">
                            대기 중인 가입 요청이 없습니다.
                          </div>
                        ) : (
                          selectedGroup.pendingRequests.map((request) => (
                            <div key={request.requestId} className="rounded-[18px] border border-[#edf0f3] px-3 py-3">
                              <ActorChip actor={request} />
                              <div className="mt-2 text-[12px] text-[#667085]">{formatDateTime(request.createdAt)}</div>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleGroupAction("approve_request", { requestId: request.requestId })}
                                  disabled={groupActionLoading !== null}
                                  className="flex-1 rounded-full bg-[#EFFAF5] px-3 py-2 text-[12px] font-semibold text-[#0B7A3E] disabled:opacity-50"
                                >
                                  승인
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleGroupAction("reject_request", { requestId: request.requestId })}
                                  disabled={groupActionLoading !== null}
                                  className="flex-1 rounded-full bg-[#FFF1F2] px-3 py-2 text-[12px] font-semibold text-[#B42318] disabled:opacity-50"
                                >
                                  거절
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-[#edf0f3] bg-white p-4">
                      <div className="text-[13px] font-semibold text-[#111827]">멤버 목록</div>
                      <div className="mt-3 space-y-3">
                        {selectedGroup.members.map((member) => (
                          <div key={`${member.userId}:${member.joinedAt}`} className="rounded-[18px] border border-[#edf0f3] px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <ActorChip actor={member} />
                              <span className="rounded-full bg-[#f4f5f7] px-2.5 py-1 text-[11px] font-semibold text-[#475467]">
                                {member.role}
                              </span>
                            </div>
                            <div className="mt-2 text-[12px] text-[#667085]">{formatDateTime(member.joinedAt)}</div>
                            {member.role !== "owner" ? (
                              <button
                                type="button"
                                onClick={() => void handleGroupAction("remove_member", { targetUserId: member.userId })}
                                disabled={groupActionLoading !== null}
                                className="mt-3 w-full rounded-full bg-[#FFF1F2] px-3 py-2 text-[12px] font-semibold text-[#B42318] disabled:opacity-50"
                              >
                                강제 퇴장
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionPanel>
          </div>
        ) : null}

        {activeTab === "challenges" ? (
          <div className="mt-5 space-y-4">
            <SectionPanel
              title="챌린지 운영"
              description="진행 중이거나 문제가 있는 챌린지를 검색하고 운영자 권한으로 종료합니다."
              actions={
                <button
                  type="button"
                  onClick={() => void loadChallenges()}
                  className="rounded-full border border-[#dbe1e8] px-4 py-2 text-[12px] font-semibold text-[#17324D]"
                >
                  새로고침
                </button>
              }
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <SearchField
                  value={challengesQuery}
                  onChange={setChallengesQuery}
                  placeholder="챌린지 제목, 그룹명 검색"
                />
                <button
                  type="button"
                  onClick={() => void loadChallenges()}
                  className="rounded-full bg-[#f4f5f7] px-4 py-2 text-[12px] font-semibold text-[#344054]"
                >
                  검색 적용
                </button>
              </div>

              <div className="mt-4">
                <ReasonBox
                  value={challengeReason}
                  onChange={setChallengeReason}
                  placeholder="챌린지 종료 사유를 입력하세요."
                />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {challengesLoading ? (
                  <div className="md:col-span-2 xl:col-span-3 rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                    챌린지를 불러오는 중...
                  </div>
                ) : challenges.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3 rounded-[24px] bg-[#f4f5f7] px-4 py-12 text-center text-[13px] text-[#667085]">
                    조건에 맞는 챌린지가 없습니다.
                  </div>
                ) : (
                  challenges.map((challenge) => (
                    <div key={challenge.id} className="rounded-[26px] border border-[#edf0f3] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[16px] font-semibold text-[#111827]">{challenge.title}</div>
                          <div className="mt-1 text-[12px] text-[#667085]">{challenge.groupName}</div>
                        </div>
                        <span className="rounded-full bg-[#f4f5f7] px-2.5 py-1 text-[11px] font-semibold text-[#475467]">
                          {challenge.status}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-[12px] text-[#667085]">
                        <div>참가자 {formatCount(challenge.participantCount)}명</div>
                        <div>지표 {challenge.metric}</div>
                        <div>시작 {formatDateTime(challenge.startsAt)}</div>
                        <div>종료 {formatDateTime(challenge.endsAt)}</div>
                      </div>
                      {challenge.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void handleCancelChallenge(challenge.id)}
                          disabled={challengeActionId === challenge.id}
                          className="mt-4 w-full rounded-full bg-[#FFF1F2] px-4 py-3 text-[12px] font-semibold text-[#B42318] disabled:opacity-50"
                        >
                          {challengeActionId === challenge.id ? "종료 중..." : "강제 종료"}
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </SectionPanel>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SocialAdminPage;
