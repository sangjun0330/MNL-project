"use client";

import { useState } from "react";
import type { SocialConnection, FriendSchedule } from "@/types/social";
import { SocialFriendMiniCalendar } from "./SocialFriendMiniCalendar";

type Props = {
  connections: SocialConnection[];
  friendSchedules: FriendSchedule[];
  month: string; // "YYYY-MM"
  mySchedule: Record<string, string>;
  pairCommonOffByUserId: Map<string, string[]>;
  onAddFriend: () => void;
  onRefresh: () => void;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatKoreanShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(iso + "T00:00:00");
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}/${d}(${weekday})`;
}

export function SocialConnectionList({
  connections,
  friendSchedules,
  month,
  mySchedule,
  pairCommonOffByUserId,
  onAddFriend,
  onRefresh,
}: Props) {
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAction = async (id: number, action: "delete" | "block") => {
    if (loadingId) return;
    if (
      action === "block" &&
      !window.confirm("차단하면 연결이 해제되고 향후 요청도 막힙니다. 계속할까요?")
    ) {
      return;
    }
    setLoadingId(id);
    try {
      await fetch(`/api/social/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setExpandedId(null);
      onRefresh();
    } catch {}
    setLoadingId(null);
  };

  // 리렌더링마다 새 Map 생성 방지
  const scheduleByUserId = new Map(friendSchedules.map((f) => [f.userId, f]));

  // 접힌 상태에서 보여줄 미리보기 (날짜순 정렬 후 최신 6개)
  const getPreviewShifts = (schedule: Record<string, string>) =>
    Object.entries(schedule)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 6);

  return (
    <div className="rounded-apple border border-ios-sep bg-white shadow-apple">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[12px] font-semibold text-ios-muted">
          친구 {connections.length}
        </span>
      </div>

      {connections.length === 0 ? (
        <div className="px-4 pb-4 pt-2 text-center">
          <p className="text-[13px] text-ios-muted">아직 연결된 친구가 없어요</p>
          <p className="mt-0.5 text-[12px] text-ios-muted opacity-70">
            코드를 공유하거나 친구 코드를 입력해 연결해 보세요
          </p>
        </div>
      ) : (
        <div className="divide-y divide-ios-sep">
          {connections.map((c) => {
            const friendSchedule = scheduleByUserId.get(c.userId);
            const isExpanded = expandedId === c.userId;
            const preview = friendSchedule ? getPreviewShifts(friendSchedule.schedule) : [];
            const pairCommonOff = pairCommonOffByUserId.get(c.userId) ?? [];

            return (
              <div key={c.id} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : c.userId)}
                >
                  <span className="text-[26px]">{c.avatarEmoji || "🐧"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-ios-text truncate">
                      {c.nickname || "익명"}
                    </p>
                    {/* 상태 메시지 — 항상 표시 */}
                    {c.statusMessage && (
                      <p className="text-[11.5px] text-ios-muted mt-0.5 truncate">{c.statusMessage}</p>
                    )}
                    {!isExpanded && !c.statusMessage && preview.length > 0 && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                        {preview.map(([date, shift]) => {
                          const day = parseInt(date.split("-")[2], 10);
                          return (
                            <span key={date} className="text-[10.5px] text-ios-muted">
                              {day}일 <span className="font-medium">{shift}</span>
                            </span>
                          );
                        })}
                        {Object.keys(friendSchedule?.schedule ?? {}).length > 6 && (
                          <span className="text-[10.5px] text-ios-muted opacity-60">…</span>
                        )}
                      </div>
                    )}
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-ios-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* 펼침 — 공통 오프 + 미니 캘린더 */}
                {isExpanded && (
                  <div className="mt-3">
                    {/* 나와의 개별 공통 오프 날짜 */}
                    {pairCommonOff.length > 0 ? (
                      <div className="mb-3">
                        <p className="text-[11.5px] font-semibold text-ios-muted mb-1.5">
                          {c.nickname || "친구"}와 같이 쉬는 날
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {pairCommonOff.map((iso) => (
                            <span
                              key={iso}
                              className="rounded-full bg-emerald-500/10 text-emerald-700 px-2.5 py-0.5 text-[11.5px] font-medium"
                            >
                              {formatKoreanShort(iso)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mb-3 text-[11.5px] text-ios-muted">
                        이번 달 같이 쉬는 날이 없어요
                      </p>
                    )}

                    {/* 친구 미니 캘린더 */}
                    {friendSchedule ? (
                      <SocialFriendMiniCalendar
                        friend={friendSchedule}
                        month={month}
                        mySchedule={mySchedule}
                      />
                    ) : (
                      <p className="text-[12px] text-ios-muted">이번 달 일정 정보가 없어요</p>
                    )}

                    {/* 액션 버튼: 차단 + 연결 해제 */}
                    <div className="mt-3 flex items-center gap-4">
                      <button
                        type="button"
                        disabled={loadingId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAction(c.id, "block");
                        }}
                        className="text-[12px] text-ios-muted underline underline-offset-2 transition active:opacity-60 disabled:opacity-40"
                      >
                        {loadingId === c.id ? "처리 중…" : "차단"}
                      </button>
                      <button
                        type="button"
                        disabled={loadingId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleAction(c.id, "delete");
                        }}
                        className="text-[12px] text-red-400 underline underline-offset-2 transition active:opacity-60 disabled:opacity-40"
                      >
                        {loadingId === c.id ? "처리 중…" : "연결 해제"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 친구 추가 버튼 */}
      <div className="border-t border-ios-sep">
        <button
          type="button"
          onClick={onAddFriend}
          className="flex w-full items-center justify-center gap-2 py-3.5 text-[13.5px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          친구 추가
        </button>
      </div>
    </div>
  );
}
