"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SocialBellIcon, SocialGroupIcon } from "@/components/social/SocialIcons";
import type { SocialEvent } from "@/types/social";

type Props = {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
  refreshTick: number;
};

function buildEventLabel(event: SocialEvent): string {
  const groupName = event.payload?.groupName || "그룹";
  const role = event.payload?.role === "admin" ? "관리자" : event.payload?.role === "owner" ? "방장" : "멤버";

  switch (event.type) {
    case "connection_request":
      return "님이 연결 요청을 보냈어요";
    case "connection_accepted":
      return "님이 연결 요청을 수락했어요";
    case "connection_rejected":
      return "님이 연결 요청을 거절했어요";
    case "followed":
      return "님이 나를 팔로우했어요";
    case "new_post":
      return "님이 새 게시글을 올렸어요";
    case "post_liked":
      return "님이 내 게시글을 좋아해요";
    case "post_commented":
      return "님이 내 게시글에 댓글을 남겼어요";
    case "comment_replied":
      return "님이 내 댓글에 답글을 남겼어요";
    case "group_notice_posted":
      return `님이 ${groupName} 그룹에 새 공지를 올렸어요`;
    case "group_notice_updated":
      return `님이 ${groupName} 그룹 공지를 업데이트했어요`;
    case "group_settings_updated":
      return `님이 ${groupName} 그룹 설정을 변경했어요`;
    case "group_join_requested":
      return `님이 ${groupName} 그룹 가입을 요청했어요`;
    case "group_join_approved":
      return `${groupName} 그룹 가입이 승인되었어요`;
    case "group_join_rejected":
      return `${groupName} 그룹 가입이 거절되었어요`;
    case "group_member_joined":
      return `님이 ${groupName} 그룹에 들어왔어요`;
    case "group_member_left":
      return `님이 ${groupName} 그룹에서 나갔어요`;
    case "group_role_changed":
      return `${groupName} 그룹에서 내 역할이 ${role}(으)로 변경되었어요`;
    case "group_owner_transferred":
      return `${groupName} 그룹 방장이 나에게 넘어왔어요`;
    case "group_member_removed":
      return `${groupName} 그룹에서 제외되었어요`;
    default:
      return "님과 연결 관련 알림이 있어요";
  }
}

function buildEventDetail(event: SocialEvent): string | null {
  if (event.type === "group_notice_posted") {
    const title = String(event.payload?.title ?? "").trim();
    const notice = String(event.payload?.notice ?? "").trim();
    if (title && notice) return `${title} · ${notice}`;
    if (title) return title;
    return notice || null;
  }
  if (event.type === "group_notice_updated") {
    const notice = String(event.payload?.notice ?? "").trim();
    return notice ? `공지 · ${notice}` : "공지가 비워졌어요.";
  }
  if (event.type === "group_settings_updated") {
    const summary = String(event.payload?.summary ?? "").trim();
    return summary || null;
  }
  if (
    event.type === "new_post" ||
    event.type === "post_liked" ||
    event.type === "post_commented" ||
    event.type === "comment_replied"
  ) {
    const preview = String(event.payload?.bodyPreview ?? "").trim();
    return preview || null;
  }
  return null;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function SocialEventCenter({ open, onClose, onUnreadCountChange, refreshTick }: Props) {
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social/events", { cache: "no-store" }).then((r) => r.json());
      if (res.ok) {
        setEvents(res.data?.events ?? []);
        onUnreadCountChange(res.data?.unreadCount ?? 0);
      }
    } catch {}
    setLoading(false);
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (!open) return;
    void loadEvents();
  }, [open, loadEvents, refreshTick]);

  // 시트 열릴 때 unread 이벤트 id 목록 수집 → read 처리
  useEffect(() => {
    if (!open || events.length === 0) return;
    const unreadIds = events.filter((e) => !e.readAt).map((e) => e.id);
    if (unreadIds.length === 0) return;

    // 뷰에서 보이는 이벤트 자동 읽음 처리 (300ms 딜레이)
    const tid = setTimeout(async () => {
      try {
        await fetch("/api/social/events/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unreadIds }),
        });
        setEvents((prev) => prev.map((e) => ({ ...e, readAt: e.readAt ?? new Date().toISOString() })));
        onUnreadCountChange(0);
      } catch {}
    }, 300);

    return () => clearTimeout(tid);
  }, [open, events, onUnreadCountChange]);

  const handleMarkAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await fetch("/api/social/events/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setEvents((prev) => prev.map((e) => ({ ...e, readAt: e.readAt ?? new Date().toISOString() })));
      onUnreadCountChange(0);
    } catch {}
    setMarkingAll(false);
  };

  const unreadCount = events.filter((e) => !e.readAt).length;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="알림"
      subtitle="팔로우, 게시글, 친구, 그룹 활동을 한곳에서 확인해요"
      variant="appstore"
      maxHeightClassName="max-h-[78dvh]"
    >
      <div className="pb-6">
        {/* 모두 읽음 버튼 */}
        {unreadCount > 0 && (
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="text-[12px] font-semibold text-[color:var(--rnest-accent)] underline underline-offset-2 transition active:opacity-60 disabled:opacity-40"
            >
              {markingAll ? "처리 중…" : "모두 읽음"}
            </button>
          </div>
        )}

        {loading && events.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-ios-sep animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-48 rounded-full bg-ios-sep animate-pulse" />
                  <div className="h-3 w-24 rounded-full bg-ios-sep/60 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
              <SocialBellIcon className="h-7 w-7" />
            </div>
            <p className="text-[14px] text-ios-muted">최근 7일 내 알림이 없어요</p>
          </div>
        )}

        <div className="space-y-1">
          {events.map((event) => {
            const nickname =
              event.type === "group_join_approved" ||
              event.type === "group_join_rejected" ||
              event.type === "group_member_removed"
                ? event.payload?.groupName || "그룹"
                : event.payload?.nickname || "친구";
            const avatarEmoji = event.payload?.avatarEmoji || "🐧";
            const label = buildEventLabel(event);
            const detail = buildEventDetail(event);
            const isUnread = !event.readAt;
            const renderStandaloneLabel =
              event.type === "group_join_approved" ||
              event.type === "group_join_rejected" ||
              event.type === "group_member_removed" ||
              event.type === "group_role_changed" ||
              event.type === "group_owner_transferred";

            return (
              <div
                key={event.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${
                  isUnread ? "bg-blue-50/60" : ""
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[22px]">
                  {event.type.startsWith("group_") ? (
                    <SocialGroupIcon className="h-5 w-5 text-[color:var(--rnest-accent)]" />
                  ) : (
                    avatarEmoji
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-ios-text leading-snug">
                    {renderStandaloneLabel ? (
                      <span className="font-semibold">{label}</span>
                    ) : (
                      <>
                        <span className="font-semibold">{nickname}</span>
                        {label}
                      </>
                    )}
                  </p>
                  {detail ? (
                    <p className="mt-1 line-clamp-2 text-[11.5px] text-ios-muted">{detail}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11.5px] text-ios-muted">{timeAgo(event.createdAt)}</p>
                </div>
                {isUnread && (
                  <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
