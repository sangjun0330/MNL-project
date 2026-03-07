"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { useAppStoreSelector } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { SocialGroupBadge } from "@/components/social/SocialGroupBadge";
import { SocialGroupRoleBadge } from "@/components/social/SocialGroupRoleBadge";
import { SocialGroupRankingTab } from "@/components/social/SocialGroupRankingTab";
import { SocialThisWeek } from "@/components/social/SocialThisWeek";
import { SocialCommonOffDays } from "@/components/social/SocialCommonOffDays";
import type {
  FriendSchedule,
  SocialGroupActivity,
  SocialGroupBoard,
  SocialGroupJoinMode,
  SocialGroupRole,
} from "@/types/social";

// ── 공통 헬퍼 ────────────────────────────────────────────────

function buildFetchMonths(): string {
  const today = new Date();
  const d6 = new Date(today);
  d6.setDate(today.getDate() + 6);
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const next = `${d6.getFullYear()}-${String(d6.getMonth() + 1).padStart(2, "0")}`;
  return cur === next ? cur : `${cur},${next}`;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function countShifts(schedule: Record<string, string>, predicate: (shift: string) => boolean) {
  return Object.values(schedule).filter((shift) => predicate(shift)).length;
}

function isOffOrVac(shift?: string) {
  return shift === "OFF" || shift === "VAC";
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function formatJoinedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} 참여`;
}

function buildActivityText(activity: SocialGroupActivity): string {
  const actor = activity.actorNickname || "누군가";
  const target = activity.targetNickname || "멤버";
  const role =
    activity.payload?.role === "admin"
      ? "관리자"
      : activity.payload?.role === "owner"
        ? "방장"
        : "멤버";

  switch (activity.type) {
    case "group_created":
      return `${actor}님이 그룹을 만들었어요.`;
    case "group_settings_updated":
      return `${actor}님이 그룹 설정을 바꿨어요.`;
    case "group_notice_updated":
      return `${actor}님이 공지를 수정했어요.`;
    case "group_join_requested":
      return `${actor}님이 그룹 가입을 요청했어요.`;
    case "group_join_approved":
      return `${actor}님이 ${target}님의 가입을 승인했어요.`;
    case "group_join_rejected":
      return `${actor}님이 ${target}님의 가입을 거절했어요.`;
    case "group_member_joined":
      return `${actor}님이 그룹에 참여했어요.`;
    case "group_member_left":
      return `${actor}님이 그룹을 나갔어요.`;
    case "group_member_removed":
      return `${actor}님이 ${target}님을 그룹에서 제외했어요.`;
    case "group_role_changed":
      return `${actor}님이 ${target}님의 역할을 ${role}(으)로 변경했어요.`;
    case "group_owner_transferred":
      return `${actor}님이 ${target}님에게 방장을 넘겼어요.`;
    case "group_invite_rotated":
      return `${actor}님이 기존 초대 링크를 무효화했어요.`;
    default:
      return "그룹 활동이 있어요.";
  }
}

function parseActionError(errorCode: string | undefined, fallback: string): string {
  switch (errorCode) {
    case "group_manage_forbidden":
      return "이 작업을 할 권한이 없어요.";
    case "group_name_required":
      return "그룹 이름을 입력해 주세요.";
    case "max_members_too_small":
      return "현재 멤버 수보다 적게 정원을 줄일 수 없어요.";
    case "group_full":
      return "그룹 정원이 가득 차서 처리할 수 없어요.";
    case "use_owner_transfer":
      return "방장 변경은 방장 위임으로 진행해 주세요.";
    case "cannot_change_own_role":
      return "내 역할은 직접 바꿀 수 없어요.";
    case "admin_cannot_remove_manager":
      return "관리자는 다른 관리자나 방장을 제외할 수 없어요.";
    case "cannot_remove_owner":
      return "방장은 먼저 위임한 뒤에만 변경할 수 있어요.";
    case "join_request_not_found":
      return "이미 처리되었거나 존재하지 않는 가입 요청이에요.";
    case "invite_permission_denied":
      return "이 그룹에서 초대 링크를 만들 권한이 없어요.";
    default:
      return fallback;
  }
}

// ── 타입 ─────────────────────────────────────────────────────

type ShareState = "idle" | "link-copied" | "shared";
type DetailTab = "overview" | "members" | "ranking" | "manage" | "activity";

type Props = {
  groupId: string;
};

// ── 컴포넌트 ─────────────────────────────────────────────────

export function SocialGroupPage({ groupId: rawGroupId }: Props) {
  const router = useRouter();
  const { user } = useAuthState();
  const currentUserId = user?.userId ?? null;
  const mySchedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);
  const months = useMemo(() => buildFetchMonths(), []);

  const groupIdNum = useMemo(() => {
    const n = parseInt(rawGroupId, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [rawGroupId]);

  const [board, setBoard] = useState<SocialGroupBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [memberQuery, setMemberQuery] = useState("");
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [settingsJoinMode, setSettingsJoinMode] = useState<SocialGroupJoinMode>("open");
  const [settingsAllowMemberInvites, setSettingsAllowMemberInvites] = useState(true);
  const [settingsMaxMembers, setSettingsMaxMembers] = useState(12);
  const boardRequestSeqRef = useRef(0);

  // ── 보드 로드 ─────────────────────────────────────────────

  const loadBoard = useCallback(async () => {
    if (!groupIdNum) return null;
    const requestSeq = ++boardRequestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/social/groups/${groupIdNum}/board?months=${encodeURIComponent(months)}`,
        { cache: "no-store" }
      ).then((r) => r.json());
      if (!res.ok) {
        if (res.error === "not_group_member") throw new Error("not_member");
        if (res.error === "group_not_found") throw new Error("not_found");
        throw new Error("그룹 정보를 불러오지 못했어요.");
      }
      const nextBoard = res.data as SocialGroupBoard;
      if (requestSeq !== boardRequestSeqRef.current) return null;
      setBoard(nextBoard);
      return nextBoard;
    } catch (err: any) {
      if (requestSeq !== boardRequestSeqRef.current) return null;
      setBoard(null);
      setError(String(err?.message ?? "그룹 정보를 불러오지 못했어요."));
      return null;
    } finally {
      if (requestSeq === boardRequestSeqRef.current) setLoading(false);
    }
  }, [groupIdNum, months]);

  useEffect(() => {
    if (!groupIdNum) {
      setError("잘못된 그룹 주소예요.");
      setLoading(false);
      return;
    }
    void loadBoard();
  }, [groupIdNum, loadBoard]);

  useEffect(() => {
    if (!groupIdNum) return;
    let tid: ReturnType<typeof setTimeout>;
    const trigger = () => {
      clearTimeout(tid);
      tid = setTimeout(() => void loadBoard(), 250);
    };
    const onVisibility = () => {
      if (!document.hidden) trigger();
    };
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(tid);
    };
  }, [groupIdNum, loadBoard]);

  useEffect(() => {
    if (!board) return;
    setSettingsName(board.group.name);
    setSettingsDescription(board.group.description);
    setSettingsNotice(board.group.notice);
    setSettingsJoinMode(board.group.joinMode);
    setSettingsAllowMemberInvites(board.group.allowMemberInvites);
    setSettingsMaxMembers(board.group.maxMembers);
  }, [board]);

  useEffect(() => {
    if (!board) return;
    const canManage =
      board.permissions.canEditBasicInfo || board.permissions.canManageJoinRequests;
    const allowedTabs: DetailTab[] = canManage
      ? ["overview", "members", "ranking", "manage", "activity"]
      : ["overview", "members", "ranking", "activity"];
    if (!allowedTabs.includes(activeTab)) setActiveTab("overview");
  }, [activeTab, board]);

  // ── 파생 값 ───────────────────────────────────────────────

  const otherMembers = useMemo<FriendSchedule[]>(
    () =>
      (board?.members ?? [])
        .filter(
          (member) =>
            member.userId !== currentUserId && Object.keys(member.schedule).length > 0
        )
        .map((member) => ({
          userId: member.userId,
          nickname: member.nickname,
          avatarEmoji: member.avatarEmoji,
          statusMessage: member.statusMessage,
          schedule: member.schedule,
        })),
    [board?.members, currentUserId]
  );

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const visibleMembers = useMemo(
    () =>
      (board?.members ?? []).filter((member) =>
        !memberQuery.trim()
          ? true
          : `${member.nickname} ${member.statusMessage}`
              .toLowerCase()
              .includes(memberQuery.trim().toLowerCase())
      ),
    [board?.members, memberQuery]
  );

  const todayOffCount = useMemo(
    () =>
      (board?.members ?? []).filter((member) => isOffOrVac(member.schedule[todayISO])).length,
    [board?.members, todayISO]
  );

  const todayNightCount = useMemo(
    () => (board?.members ?? []).filter((member) => member.schedule[todayISO] === "N").length,
    [board?.members, todayISO]
  );

  const tabs = useMemo(() => {
    const items: Array<{ id: DetailTab; label: string }> = [
      { id: "overview", label: "개요" },
      { id: "members", label: "멤버" },
      { id: "ranking", label: "랭킹" },
    ];
    if (board?.permissions.canEditBasicInfo || board?.permissions.canManageJoinRequests) {
      items.push({ id: "manage", label: "운영" });
    }
    items.push({ id: "activity", label: "활동" });
    return items;
  }, [board?.permissions.canEditBasicInfo, board?.permissions.canManageJoinRequests]);

  const myRole = useMemo(
    () => board?.members.find((m) => m.userId === currentUserId)?.role ?? "member",
    [board?.members, currentUserId]
  ) as SocialGroupRole;

  // ── 액션 핸들러 ───────────────────────────────────────────

  const updateAfterMutation = useCallback(async () => {
    return loadBoard();
  }, [loadBoard]);

  const handleManageAction = useCallback(
    async (payload: Record<string, unknown>, successText: string, fallbackError: string) => {
      if (!groupIdNum) return false;
      setBusyAction(String(payload.action ?? "manage"));
      setError(null);
      setFeedback(null);
      try {
        const res = await fetch(`/api/social/groups/${groupIdNum}/manage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json());
        if (!res.ok) throw new Error(parseActionError(res.error, fallbackError));
        await updateAfterMutation();
        setFeedback({ tone: "success", text: successText });
        return true;
      } catch (err: any) {
        setFeedback({ tone: "error", text: String(err?.message ?? fallbackError) });
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [groupIdNum, updateAfterMutation]
  );

  const handleShareInvite = async () => {
    if (!groupIdNum || sharing) return;
    setSharing(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch(`/api/social/groups/${groupIdNum}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "too_many_requests")
          throw new Error("초대 링크를 너무 자주 만들고 있어요. 잠시 후 다시 시도해 주세요.");
        throw new Error(parseActionError(res.error, "초대 링크를 만들지 못했어요."));
      }

      const inviteUrl = String(res.data?.url ?? "");
      const text = `RNest 소셜 그룹에 참여해줘.\n링크를 열면 그룹 참여 화면이 바로 열려요.`;
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

      if (typeof nav.share === "function") {
        await nav.share({ title: `${board?.group.name ?? ""} 그룹 초대`, text, url: inviteUrl });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        setShareState("link-copied");
      }
      setTimeout(() => setShareState("idle"), 2400);
    } catch (err: any) {
      if (String(err?.name ?? "") !== "AbortError") {
        setFeedback({ tone: "error", text: String(err?.message ?? "초대 링크를 만들지 못했어요.") });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleLeaveOrDelete = async () => {
    if (!groupIdNum || busyAction) return;
    const isOwner = myRole === "owner";
    const confirmed = window.confirm(
      isOwner
        ? "그룹을 삭제하면 멤버와 활동 기록이 모두 사라집니다. 계속할까요?"
        : "이 그룹에서 나가시겠어요?"
    );
    if (!confirmed) return;

    const action = isOwner ? "delete" : "leave";
    setBusyAction(action);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/social/groups/${groupIdNum}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((r) => r.json());

      if (!res.ok)
        throw new Error(isOwner ? "그룹을 삭제하지 못했어요." : "그룹에서 나가지 못했어요.");

      router.replace("/social");
    } catch (err: any) {
      setFeedback({ tone: "error", text: String(err?.message ?? "요청을 처리하지 못했어요.") });
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async () => {
    const trimmedName = Array.from(settingsName.trim()).slice(0, 20).join("");
    const trimmedDescription = Array.from(settingsDescription.trim()).slice(0, 80).join("");
    const trimmedNotice = Array.from(settingsNotice.trim()).slice(0, 120).join("");
    await handleManageAction(
      {
        action: "update_settings",
        name: trimmedName,
        description: trimmedDescription,
        notice: trimmedNotice,
        joinMode: settingsJoinMode,
        allowMemberInvites: settingsAllowMemberInvites,
        maxMembers: settingsMaxMembers,
      },
      "그룹 설정을 저장했어요.",
      "그룹 설정을 저장하지 못했어요."
    );
  };

  const handleChangeRole = async (targetUserId: string, role: "admin" | "member") => {
    await handleManageAction(
      { action: "change_role", targetUserId, role },
      role === "admin" ? "관리자로 지정했어요." : "관리자 권한을 해제했어요.",
      "역할을 변경하지 못했어요."
    );
  };

  const handleTransferOwner = async (targetUserId: string, nickname: string) => {
    const confirmed = window.confirm(
      `${nickname || "이 멤버"}님에게 방장을 넘길까요? 현재 방장은 관리자로 전환됩니다.`
    );
    if (!confirmed) return;
    await handleManageAction(
      { action: "transfer_owner", targetUserId },
      "방장을 위임했어요.",
      "방장 위임에 실패했어요."
    );
  };

  const handleRemoveMember = async (targetUserId: string, nickname: string) => {
    const confirmed = window.confirm(`${nickname || "이 멤버"}님을 그룹에서 제외할까요?`);
    if (!confirmed) return;
    await handleManageAction(
      { action: "remove_member", targetUserId },
      "멤버를 그룹에서 제외했어요.",
      "멤버를 제외하지 못했어요."
    );
  };

  const handleJoinRequest = async (requestId: number, decision: "approve" | "reject") => {
    await handleManageAction(
      { action: "handle_join_request", requestId, decision },
      decision === "approve" ? "가입 요청을 승인했어요." : "가입 요청을 거절했어요.",
      "가입 요청을 처리하지 못했어요."
    );
  };

  const handleRotateInvite = async () => {
    const confirmed = window.confirm(
      "기존 초대 링크를 모두 무효화하고 새 링크만 유효하게 만들까요?"
    );
    if (!confirmed) return;
    await handleManageAction(
      { action: "rotate_invite" },
      "기존 초대 링크를 무효화했어요.",
      "초대 링크를 무효화하지 못했어요."
    );
  };

  // ── 에러 상태 (그룹 없음 / 비회원) ────────────────────────

  if (!loading && error === "not_member") {
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
          <h1 className="text-[17px] font-bold text-ios-text">그룹</h1>
          <div className="h-9 w-9" />
        </div>
        <div className="rounded-3xl bg-white px-4 py-8 shadow-apple text-center">
          <p className="text-[15px] font-semibold text-ios-text">이 그룹의 멤버가 아니에요</p>
          <p className="mt-2 text-[13px] text-ios-muted">초대 링크를 통해 참여할 수 있어요.</p>
        </div>
      </div>
    );
  }

  if (!loading && error === "not_found") {
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
          <h1 className="text-[17px] font-bold text-ios-text">그룹</h1>
          <div className="h-9 w-9" />
        </div>
        <div className="rounded-3xl bg-white px-4 py-8 shadow-apple text-center">
          <p className="text-[15px] font-semibold text-ios-text">그룹을 찾을 수 없어요</p>
          <p className="mt-2 text-[13px] text-ios-muted">삭제되었거나 잘못된 주소예요.</p>
        </div>
      </div>
    );
  }

  // ── 페이지 렌더 ───────────────────────────────────────────

  const groupName = board?.group.name ?? "그룹";

  return (
    <div className="space-y-3 pb-6">

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
        <h1 className="truncate px-2 text-[17px] font-bold text-ios-text">{groupName}</h1>
        {/* 초대 링크 공유 버튼 */}
        <button
          type="button"
          disabled={sharing || !board?.permissions.canCreateInvite}
          onClick={handleShareInvite}
          className="flex h-9 items-center gap-1 rounded-full bg-white px-3 text-[13px] font-semibold text-[color:var(--rnest-accent)] shadow-apple transition hover:bg-ios-sep/20 active:opacity-60 disabled:opacity-40"
          aria-label="초대 링크 공유"
        >
          {sharing
            ? "준비 중…"
            : shareState === "link-copied"
              ? "복사됨"
              : shareState === "shared"
                ? "공유 완료"
                : "초대"}
        </button>
      </div>

      {/* ── 그룹 정보 카드 ────────────────────────────────── */}
      <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
        <div className="flex items-center gap-3">
          <SocialGroupBadge groupId={groupIdNum ?? 0} name={groupName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[16px] font-semibold text-ios-text">{groupName}</p>
              {board ? <SocialGroupRoleBadge role={board.group.role} /> : null}
            </div>
            <p className="mt-0.5 text-[12.5px] text-ios-muted">
              멤버 {board?.group.memberCount ?? "…"}/{board?.group.maxMembers ?? 12}명
            </p>
          </div>
        </div>

        {board?.group.description ? (
          <p className="mt-4 rounded-2xl bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-muted">
            {board.group.description}
          </p>
        ) : null}

        {/* 나가기 / 삭제 버튼 */}
        <button
          type="button"
          disabled={!!busyAction}
          onClick={handleLeaveOrDelete}
          className={cn(
            "mt-4 w-full rounded-2xl py-3 text-[14px] font-semibold transition active:opacity-60 disabled:opacity-40",
            myRole === "owner"
              ? "bg-red-50 text-red-600"
              : "bg-ios-bg text-ios-muted"
          )}
        >
          {busyAction === "delete"
            ? "삭제 중…"
            : busyAction === "leave"
              ? "나가는 중…"
              : myRole === "owner"
                ? "그룹 삭제"
                : "그룹 나가기"}
        </button>
      </div>

      {/* ── 피드백 메시지 ─────────────────────────────────── */}
      {feedback ? (
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[13px]",
            feedback.tone === "error"
              ? "bg-red-50 text-red-600"
              : feedback.tone === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-blue-50 text-blue-700"
          )}
        >
          {feedback.text}
        </div>
      ) : null}

      {/* ── 로딩 스켈레톤 ─────────────────────────────────── */}
      {loading && (
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple space-y-3">
          <div className="h-4 w-40 rounded-full bg-ios-sep animate-pulse" />
          <div className="h-24 rounded-2xl bg-ios-sep/70 animate-pulse" />
          <div className="h-20 rounded-2xl bg-ios-sep/50 animate-pulse" />
        </div>
      )}

      {/* ── 탭 + 콘텐츠 ──────────────────────────────────── */}
      {!loading && board && (
        <>
          {/* 탭 바 */}
          <div className="rounded-2xl bg-ios-bg p-1 shadow-apple">
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 rounded-[14px] px-1.5 py-2.5 text-[12.5px] font-semibold transition",
                    activeTab === tab.id
                      ? "bg-white text-ios-text shadow-sm"
                      : "text-ios-muted"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 개요 탭 ────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                  <p className="text-[11px] font-semibold text-ios-muted">오늘 OFF/VAC</p>
                  <p className="mt-1 text-[22px] font-bold text-ios-text">{todayOffCount}</p>
                </div>
                <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                  <p className="text-[11px] font-semibold text-ios-muted">오늘 야간</p>
                  <p className="mt-1 text-[22px] font-bold text-ios-text">{todayNightCount}</p>
                </div>
                <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                  <p className="text-[11px] font-semibold text-ios-muted">가입 요청</p>
                  <p className="mt-1 text-[22px] font-bold text-ios-text">{board.joinRequests.length}</p>
                </div>
              </div>

              <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-ios-text">그룹 공지</p>
                    <p className="mt-0.5 text-[11.5px] text-ios-muted">
                      {board.group.joinMode === "approval" ? "승인 후 참여" : "즉시 참여"} ·
                      {board.group.allowMemberInvites ? " 멤버도 초대 가능" : " 방장/관리자만 초대"}
                    </p>
                  </div>
                  {board.permissions.canEditNotice ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab("manage")}
                      className="text-[12px] font-semibold text-[color:var(--rnest-accent)]"
                    >
                      수정
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 rounded-2xl bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-muted">
                  {board.group.notice || "아직 등록된 공지가 없어요."}
                </p>
              </div>

              {otherMembers.length > 0 ? (
                <SocialThisWeek friends={otherMembers} mySchedule={mySchedule} />
              ) : (
                <div className="rounded-apple border border-ios-sep bg-white px-4 py-3 text-[12.5px] text-ios-muted shadow-apple">
                  아직 그룹에서 함께 볼 수 있는 근무표가 없어요.
                </div>
              )}

              {board.commonOffDays.length > 0 ? (
                <SocialCommonOffDays
                  dates={board.commonOffDays}
                  friendCount={board.group.memberCount}
                  mode="all"
                  onModeChange={() => {}}
                  title="이번 달 그룹 같이 쉬는 날"
                  showModeToggle={false}
                  hideFooterLabel
                />
              ) : (
                <div className="rounded-apple border border-ios-sep bg-white px-4 py-3 text-[12.5px] text-ios-muted shadow-apple">
                  이번 달에 그룹 전체가 같이 쉬는 날은 아직 없어요.
                </div>
              )}

              {board.joinRequests.length > 0 && board.permissions.canManageJoinRequests ? (
                <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-semibold text-ios-text">대기 중인 가입 요청</p>
                      <p className="mt-0.5 text-[11.5px] text-ios-muted">
                        운영 탭에서 승인하거나 거절할 수 있어요.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("manage")}
                      className="text-[12px] font-semibold text-[color:var(--rnest-accent)]"
                    >
                      보기
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {board.joinRequests.slice(0, 3).map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center gap-3 rounded-2xl bg-ios-bg px-3 py-2.5"
                      >
                        <span className="text-[22px]">{request.avatarEmoji || "🐧"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ios-text">
                            {request.nickname || "익명"}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ios-muted">{timeAgo(request.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── 랭킹 탭 ────────────────────────────────────── */}
          {activeTab === "ranking" && (
            <SocialGroupRankingTab members={board.members} currentUserId={currentUserId} />
          )}

          {/* ── 멤버 탭 ────────────────────────────────────── */}
          {activeTab === "members" && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-ios-text">그룹 멤버</p>
                    <p className="mt-0.5 text-[11.5px] text-ios-muted">
                      공개 범위에 따라 일부 근무표는 숨겨질 수 있어요.
                    </p>
                  </div>
                  {board.hiddenScheduleMemberCount > 0 ? (
                    <span className="text-[11px] text-ios-muted">
                      근무 비공개 {board.hiddenScheduleMemberCount}명
                    </span>
                  ) : null}
                </div>

                <input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="멤버 검색"
                  className="mt-4 w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
                />

                <div className="mt-4 space-y-3">
                  {visibleMembers.map((member) => {
                    const canPromote =
                      board.permissions.canPromoteMembers &&
                      member.userId !== currentUserId &&
                      member.role !== "owner";
                    const canTransfer =
                      board.permissions.canTransferOwner &&
                      member.userId !== currentUserId &&
                      member.role !== "owner";
                    const canRemove =
                      board.permissions.canRemoveMembers &&
                      member.userId !== currentUserId &&
                      member.role !== "owner" &&
                      !(myRole === "admin" && member.role === "admin");

                    return (
                      <div key={member.userId} className="rounded-2xl bg-ios-bg px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[24px]">{member.avatarEmoji || "🐧"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate text-[13.5px] font-semibold text-ios-text">
                                {member.nickname || "익명"}
                              </p>
                              <SocialGroupRoleBadge role={member.role} className="text-[10px]" />
                              {member.userId === currentUserId ? (
                                <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                                  나
                                </span>
                              ) : null}
                            </div>
                            {member.statusMessage ? (
                              <p className="mt-0.5 truncate text-[11.5px] text-ios-muted">
                                {member.statusMessage}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[10.5px] text-ios-muted">
                              {formatJoinedAt(member.joinedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-ios-muted">
                          <div className="rounded-2xl bg-white px-3 py-2">
                            이번 달 OFF/VAC {countShifts(member.schedule, isOffOrVac)}일
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2">
                            {Object.keys(member.schedule).length > 0 ? "근무 공개 중" : "근무 비공개"}
                          </div>
                        </div>

                        {(canPromote || canTransfer || canRemove) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {canPromote ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleChangeRole(
                                    member.userId,
                                    member.role === "admin" ? "member" : "admin"
                                  )
                                }
                                disabled={busyAction !== null}
                                className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[color:var(--rnest-accent)] shadow-sm transition active:opacity-60 disabled:opacity-40"
                              >
                                {member.role === "admin" ? "관리자 해제" : "관리자 지정"}
                              </button>
                            ) : null}
                            {canTransfer ? (
                              <button
                                type="button"
                                onClick={() => void handleTransferOwner(member.userId, member.nickname)}
                                disabled={busyAction !== null}
                                className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-sky-700 shadow-sm transition active:opacity-60 disabled:opacity-40"
                              >
                                방장 위임
                              </button>
                            ) : null}
                            {canRemove ? (
                              <button
                                type="button"
                                onClick={() => void handleRemoveMember(member.userId, member.nickname)}
                                disabled={busyAction !== null}
                                className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-red-600 shadow-sm transition active:opacity-60 disabled:opacity-40"
                              >
                                그룹에서 제외
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── 운영 탭 ────────────────────────────────────── */}
          {activeTab === "manage" && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                <div className="mb-3">
                  <p className="text-[14px] font-semibold text-ios-text">그룹 설정</p>
                  <p className="mt-0.5 text-[11.5px] text-ios-muted">
                    그룹 이름, 소개, 공지, 가입 방식을 조정할 수 있어요.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-semibold text-ios-text">그룹 이름</label>
                    <input
                      value={settingsName}
                      onChange={(e) =>
                        setSettingsName(Array.from(e.target.value).slice(0, 20).join(""))
                      }
                      className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-semibold text-ios-text">그룹 소개</label>
                    <textarea
                      value={settingsDescription}
                      onChange={(e) =>
                        setSettingsDescription(Array.from(e.target.value).slice(0, 80).join(""))
                      }
                      className="min-h-[86px] w-full resize-none rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] leading-6 text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)]"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label className="block text-[12.5px] font-semibold text-ios-text">그룹 공지</label>
                      <span className="text-[11px] text-ios-muted">
                        {Array.from(settingsNotice).length}/120
                      </span>
                    </div>
                    <textarea
                      value={settingsNotice}
                      onChange={(e) =>
                        setSettingsNotice(Array.from(e.target.value).slice(0, 120).join(""))
                      }
                      className="min-h-[96px] w-full resize-none rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] leading-6 text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)]"
                    />
                  </div>

                  {board.permissions.canChangeInvitePolicy ? (
                    <>
                      <div>
                        <label className="mb-1.5 block text-[12.5px] font-semibold text-ios-text">가입 방식</label>
                        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ios-bg p-1">
                          {([
                            { id: "open", label: "즉시 참여" },
                            { id: "approval", label: "승인 후 참여" },
                          ] as const).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSettingsJoinMode(item.id)}
                              className={cn(
                                "rounded-[14px] px-3 py-2.5 text-[12.5px] font-semibold transition",
                                settingsJoinMode === item.id
                                  ? "bg-white text-ios-text shadow-sm"
                                  : "text-ios-muted"
                              )}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between rounded-2xl bg-ios-bg px-4 py-3">
                        <div>
                          <p className="text-[12.5px] font-semibold text-ios-text">멤버도 초대 링크 발급</p>
                          <p className="mt-0.5 text-[11px] text-ios-muted">
                            끄면 방장/관리자만 초대 링크를 만들 수 있어요.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settingsAllowMemberInvites}
                          onChange={(e) => setSettingsAllowMemberInvites(e.target.checked)}
                          className="h-4 w-4 accent-[color:var(--rnest-accent)]"
                        />
                      </label>

                      <div>
                        <label className="mb-1.5 block text-[12.5px] font-semibold text-ios-text">최대 인원</label>
                        <input
                          type="range"
                          min={2}
                          max={24}
                          step={1}
                          value={settingsMaxMembers}
                          onChange={(e) => setSettingsMaxMembers(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] text-ios-muted">
                          <span>2명</span>
                          <span>{settingsMaxMembers}명</span>
                          <span>24명</span>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <Button
                    variant="primary"
                    disabled={busyAction === "update_settings"}
                    onClick={handleSaveSettings}
                    className="h-12 w-full rounded-2xl text-[14px]"
                  >
                    {busyAction === "update_settings" ? "저장 중…" : "그룹 설정 저장"}
                  </Button>
                </div>
              </div>

              {board.permissions.canManageJoinRequests && (
                <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                  <div className="mb-3">
                    <p className="text-[14px] font-semibold text-ios-text">가입 요청</p>
                    <p className="mt-0.5 text-[11.5px] text-ios-muted">
                      승인제 그룹에서는 여기서 요청을 처리할 수 있어요.
                    </p>
                  </div>
                  {board.joinRequests.length === 0 ? (
                    <p className="rounded-2xl bg-ios-bg px-4 py-3 text-[12.5px] text-ios-muted">
                      대기 중인 가입 요청이 없어요.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {board.joinRequests.map((request) => (
                        <div key={request.id} className="rounded-2xl bg-ios-bg px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-[24px]">{request.avatarEmoji || "🐧"}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-ios-text">
                                {request.nickname || "익명"}
                              </p>
                              {request.statusMessage ? (
                                <p className="mt-0.5 truncate text-[11px] text-ios-muted">
                                  {request.statusMessage}
                                </p>
                              ) : null}
                              <p className="mt-1 text-[10.5px] text-ios-muted">{timeAgo(request.createdAt)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              variant="secondary"
                              disabled={busyAction === "handle_join_request"}
                              onClick={() => void handleJoinRequest(request.id, "approve")}
                              className="h-10 flex-1 rounded-2xl text-[13px]"
                            >
                              승인
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busyAction === "handle_join_request"}
                              onClick={() => void handleJoinRequest(request.id, "reject")}
                              className="h-10 flex-1 rounded-2xl text-[13px] text-red-600"
                            >
                              거절
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {board.permissions.canChangeInvitePolicy && (
                <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
                  <div className="mb-3">
                    <p className="text-[14px] font-semibold text-ios-text">초대 링크 관리</p>
                    <p className="mt-0.5 text-[11.5px] text-ios-muted">
                      기존 초대 링크를 모두 무효화하고 새 링크만 쓰게 할 수 있어요.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busyAction === "rotate_invite"}
                    onClick={handleRotateInvite}
                    className="h-11 w-full rounded-2xl text-[13.5px]"
                  >
                    {busyAction === "rotate_invite" ? "무효화 중…" : "기존 초대 링크 모두 무효화"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── 활동 탭 ────────────────────────────────────── */}
          {activeTab === "activity" && (
            <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
              <div className="mb-3">
                <p className="text-[14px] font-semibold text-ios-text">최근 활동</p>
                <p className="mt-0.5 text-[11.5px] text-ios-muted">
                  그룹 안에서 일어난 운영 기록과 참여 기록이에요.
                </p>
              </div>
              {board.activities.length === 0 ? (
                <p className="rounded-2xl bg-ios-bg px-4 py-3 text-[12.5px] text-ios-muted">
                  아직 기록된 활동이 없어요.
                </p>
              ) : (
                <div className="space-y-3">
                  {board.activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 rounded-2xl bg-ios-bg px-4 py-3">
                      <span className="text-[22px]">{activity.actorAvatarEmoji || "🐧"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-6 text-ios-text">
                          {buildActivityText(activity)}
                        </p>
                        {activity.type === "group_notice_updated" && activity.payload.notice ? (
                          <p className="mt-1 truncate text-[11px] text-ios-muted">
                            &quot;{activity.payload.notice}&quot;
                          </p>
                        ) : null}
                        <p className="mt-1 text-[10.5px] text-ios-muted">{timeAgo(activity.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── 일반 에러 ─────────────────────────────────────── */}
      {!loading && error && error !== "not_member" && error !== "not_found" ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3">
          <p className="text-[13px] text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => void loadBoard()}
            className="mt-2 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-600 shadow-sm transition active:opacity-60"
          >
            다시 불러오기
          </button>
        </div>
      ) : null}
    </div>
  );
}
