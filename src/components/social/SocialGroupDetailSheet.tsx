"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { SocialGroupBadge } from "@/components/social/SocialGroupBadge";
import { SocialThisWeek } from "@/components/social/SocialThisWeek";
import { SocialCommonOffDays } from "@/components/social/SocialCommonOffDays";
import type { FriendSchedule, SocialGroupBoard, SocialGroupSummary } from "@/types/social";

type Props = {
  open: boolean;
  onClose: () => void;
  group: SocialGroupSummary | null;
  months: string;
  currentUserId: string | null;
  mySchedule: Record<string, string>;
  onGroupLeft: (groupId: number) => void;
  onGroupDeleted: (groupId: number) => void;
};

type ShareState = "idle" | "link-copied" | "shared";

export function SocialGroupDetailSheet({
  open,
  onClose,
  group,
  months,
  currentUserId,
  mySchedule,
  onGroupLeft,
  onGroupDeleted,
}: Props) {
  const [board, setBoard] = useState<SocialGroupBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [actionLoading, setActionLoading] = useState<"leave" | "delete" | null>(null);

  const loadBoard = useCallback(async () => {
    if (!group) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/groups/${group.id}/board?months=${encodeURIComponent(months)}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (!res.ok) throw new Error("그룹 정보를 불러오지 못했어요.");
      setBoard(res.data);
    } catch (err: any) {
      setBoard(null);
      setError(String(err?.message ?? "그룹 정보를 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, [group, months]);

  useEffect(() => {
    if (!open || !group) return;
    void loadBoard();
  }, [open, group, loadBoard]);

  useEffect(() => {
    if (!open || !group) return;
    let tid: ReturnType<typeof setTimeout>;
    const trigger = () => {
      clearTimeout(tid);
      tid = setTimeout(() => {
        void loadBoard();
      }, 250);
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
  }, [group, loadBoard, open]);

  useEffect(() => {
    if (!open) return;
    setShareState("idle");
    setActionLoading(null);
  }, [open, group?.id]);

  const otherMembers = useMemo<FriendSchedule[]>(
    () =>
      (board?.members ?? [])
        .filter((member) => member.userId !== currentUserId && Object.keys(member.schedule).length > 0)
        .map((member) => ({
          userId: member.userId,
          nickname: member.nickname,
          avatarEmoji: member.avatarEmoji,
          statusMessage: member.statusMessage,
          schedule: member.schedule,
        })),
    [board?.members, currentUserId]
  );

  const handleShareInvite = async () => {
    if (!group || sharing) return;
    setSharing(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/groups/${group.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "too_many_requests") throw new Error("초대 링크를 너무 자주 만들고 있어요. 잠시 후 다시 시도해 주세요.");
        throw new Error("초대 링크를 만들지 못했어요.");
      }

      const inviteUrl = String(res.data?.url ?? "");
      const text = `RNest 소셜 그룹에 참여해줘.\n링크를 열면 그룹 참여 화면이 바로 열려요.`;
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

      if (typeof nav.share === "function") {
        await nav.share({ title: `${group.name} 그룹 초대`, text, url: inviteUrl });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        setShareState("link-copied");
      }

      setTimeout(() => setShareState("idle"), 2400);
    } catch (err: any) {
      if (String(err?.name ?? "") !== "AbortError") {
        setError(String(err?.message ?? "초대 링크를 만들지 못했어요."));
      }
    } finally {
      setSharing(false);
    }
  };

  const handleLeaveOrDelete = async () => {
    if (!group || actionLoading) return;
    const isOwner = group.role === "owner";
    const confirmed = window.confirm(
      isOwner
        ? "그룹을 삭제하면 멤버와 일정 보드가 모두 사라집니다. 계속할까요?"
        : "이 그룹에서 나가시겠어요?"
    );
    if (!confirmed) return;

    const action = isOwner ? "delete" : "leave";
    setActionLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/social/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).then((r) => r.json());

      if (!res.ok) {
        throw new Error(isOwner ? "그룹을 삭제하지 못했어요." : "그룹에서 나가지 못했어요.");
      }

      if (action === "delete") onGroupDeleted(group.id);
      else onGroupLeft(group.id);
    } catch (err: any) {
      setError(String(err?.message ?? "요청을 처리하지 못했어요."));
      setActionLoading(null);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={group?.name ?? "그룹"}
      subtitle="그룹 멤버들과 이번 주 근무 현황을 한곳에서 볼 수 있어요"
      variant="appstore"
      maxHeightClassName="max-h-[82dvh]"
    >
      <div className="space-y-5 pb-6">
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <div className="flex items-center gap-3">
            <SocialGroupBadge groupId={group?.id ?? 0} name={group?.name ?? "G"} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[16px] font-semibold text-ios-text">{group?.name ?? "그룹"}</p>
                {group?.role === "owner" ? (
                  <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--rnest-accent)]">
                    방장
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12.5px] text-ios-muted">멤버 {board?.group.memberCount ?? group?.memberCount ?? 0}명</p>
            </div>
          </div>

          {(board?.group.description ?? group?.description) ? (
            <p className="mt-4 rounded-2xl bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-muted">
              {board?.group.description ?? group?.description}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              disabled={sharing}
              onClick={handleShareInvite}
              className="h-12 rounded-2xl text-[14px]"
            >
              {sharing
                ? "링크 준비 중…"
                : shareState === "link-copied"
                  ? "링크 복사됨"
                  : shareState === "shared"
                    ? "공유 완료"
                    : "초대 링크 보내기"}
            </Button>
            <Button
              variant={group?.role === "owner" ? "danger" : "secondary"}
              disabled={!!actionLoading}
              onClick={handleLeaveOrDelete}
              className="h-12 rounded-2xl text-[14px]"
            >
              {actionLoading === "delete"
                ? "삭제 중…"
                : actionLoading === "leave"
                  ? "나가는 중…"
                  : group?.role === "owner"
                    ? "그룹 삭제"
                    : "그룹 나가기"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white px-4 py-4 shadow-apple space-y-3">
            <div className="h-4 w-40 rounded-full bg-ios-sep animate-pulse" />
            <div className="h-24 rounded-2xl bg-ios-sep/70 animate-pulse" />
            <div className="h-20 rounded-2xl bg-ios-sep/50 animate-pulse" />
          </div>
        ) : null}

        {!loading && board ? (
          <>
            <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-ios-text">그룹 멤버</p>
                {board.hiddenScheduleMemberCount > 0 ? (
                  <span className="text-[11px] text-ios-muted">근무 비공개 {board.hiddenScheduleMemberCount}명</span>
                ) : null}
              </div>
              <div className="space-y-2.5">
                {board.members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3">
                    <span className="text-[24px]">{member.avatarEmoji || "🐧"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-ios-text">{member.nickname || "익명"}</p>
                        {member.role === "owner" ? (
                          <span className="rounded-full bg-ios-bg px-2 py-0.5 text-[10px] font-semibold text-ios-muted">
                            방장
                          </span>
                        ) : null}
                        {member.userId === currentUserId ? (
                          <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                            나
                          </span>
                        ) : null}
                      </div>
                      {member.statusMessage ? (
                        <p className="mt-0.5 truncate text-[11.5px] text-ios-muted">{member.statusMessage}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
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
          </>
        ) : null}

        {error ? (
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
    </BottomSheet>
  );
}
