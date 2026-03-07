"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { SocialEvent } from "@/types/social";

type Props = {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
};

const EVENT_LABELS: Record<string, string> = {
  connection_request: "님이 연결 요청을 보냈어요",
  connection_accepted: "님이 연결 요청을 수락했어요",
  connection_rejected: "님이 연결 요청을 거절했어요",
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export function SocialEventCenter({ open, onClose, onUnreadCountChange }: Props) {
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
  }, [open, loadEvents]);

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
      subtitle="친구 연결 요청 및 응답 알림"
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
            <p className="text-[32px] mb-2">🔔</p>
            <p className="text-[14px] text-ios-muted">최근 7일 내 알림이 없어요</p>
          </div>
        )}

        <div className="space-y-1">
          {events.map((event) => {
            const nickname = event.payload?.nickname || "친구";
            const avatarEmoji = event.payload?.avatarEmoji || "🐧";
            const label = EVENT_LABELS[event.type] ?? "님과 연결 관련 알림이 있어요";
            const isUnread = !event.readAt;

            return (
              <div
                key={event.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition ${
                  isUnread ? "bg-blue-50/60" : ""
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[22px]">
                  {avatarEmoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-ios-text leading-snug">
                    <span className="font-semibold">{nickname}</span>
                    {label}
                  </p>
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
