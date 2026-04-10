"use client";

import { useState } from "react";
import { PencilLine, Pin } from "lucide-react";
import type { SocialConnection, FriendSchedule, FriendMeta } from "@/types/social";
import { SocialAvatarBadge } from "@/components/social/SocialAvatar";
import { SocialFriendMiniCalendar } from "./SocialFriendMiniCalendar";

type Props = {
  connections: SocialConnection[];
  friendSchedules: FriendSchedule[];
  month: string; // "YYYY-MM"
  mySchedule: Record<string, string>;
  pairCommonOffByUserId: Map<string, string[]>;
  friendMeta: Record<string, FriendMeta>;
  onMetaChange: (userId: string, patch: Partial<FriendMeta>) => void;
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
  friendMeta,
  onMetaChange,
  onAddFriend,
  onRefresh,
}: Props) {
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");

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

  const handleMetaPatch = async (userId: string, patch: Partial<FriendMeta>) => {
    // 낙관적 업데이트
    onMetaChange(userId, patch);
    try {
      await fetch(`/api/social/friends/${userId}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {}
  };

  const scheduleByUserId = new Map(friendSchedules.map((f) => [f.userId, f]));

  const getPreviewShifts = (schedule: Record<string, string>) =>
    Object.entries(schedule)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 6);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[12px] font-semibold text-gray-500">
          친구 {connections.length}
        </span>
      </div>

      {connections.length === 0 ? (
        <div className="px-4 pb-4 pt-2 text-center">
          <p className="text-[13px] text-gray-500">아직 연결된 친구가 없어요</p>
          <p className="mt-0.5 text-[12px] text-gray-500/80">
            코드를 공유하거나 친구 코드를 입력해 연결해 보세요
          </p>
          <button
            type="button"
            onClick={onAddFriend}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--rnest-accent)] px-5 text-[13px] font-semibold text-white transition active:opacity-60"
          >
            친구 추가하기
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {connections.map((c) => {
            const friendSchedule = scheduleByUserId.get(c.userId);
            const isExpanded = expandedId === c.userId;
            const preview = friendSchedule ? getPreviewShifts(friendSchedule.schedule) : [];
            const pairCommonOff = pairCommonOffByUserId.get(c.userId) ?? [];
            const meta = friendMeta[c.userId] ?? { pinned: false, alias: "" };
            // 별칭이 있으면 별칭 우선
            const displayName = meta.alias || c.nickname || "익명";

            return (
              <div key={c.id} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : c.userId)}
                >
                  <div className="relative shrink-0">
                    <SocialAvatarBadge emoji={c.avatarEmoji} className="h-10 w-10" iconClassName="h-7 w-7" />
                    {meta.pinned && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-amber-500 shadow-sm">
                        <Pin className="h-2.5 w-2.5 fill-current" strokeWidth={2.2} />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13.5px] font-semibold text-gray-900 truncate">
                        {displayName}
                      </p>
                      {meta.alias && (
                        <span className="text-[10.5px] text-gray-500 shrink-0">
                          ({c.nickname})
                        </span>
                      )}
                    </div>
                    {c.statusMessage && (
                      <p className="mt-0.5 truncate text-[11.5px] text-gray-500">{c.statusMessage}</p>
                    )}
                    {!isExpanded && !c.statusMessage && preview.length > 0 && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                        {preview.map(([date, shift]) => {
                          const day = parseInt(date.split("-")[2], 10);
                          return (
                            <span key={date} className="text-[10.5px] text-gray-500">
                              {day}일 <span className="font-medium">{shift}</span>
                            </span>
                          );
                        })}
                        {Object.keys(friendSchedule?.schedule ?? {}).length > 6 && (
                          <span className="text-[10.5px] text-gray-500/70">…</span>
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
                    className={`shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="mt-3">
                    {/* 메타 액션: 핀 + 별칭 */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {/* 핀 토글 */}
                      <button
                        type="button"
                        onClick={() => void handleMetaPatch(c.userId, { pinned: !meta.pinned })}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:opacity-70 ${
                          meta.pinned
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Pin className="h-3 w-3" strokeWidth={2.1} />
                        {meta.pinned ? "핀 해제" : "핀"}
                      </button>

                      {/* 별칭 편집 */}
                      {editingAliasId === c.userId ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <input
                            autoFocus
                            value={aliasInput}
                            onChange={(e) =>
                              setAliasInput(Array.from(e.target.value).slice(0, 12).join(""))
                            }
                            placeholder="별칭 입력 (최대 12자)"
                            className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11.5px] text-gray-900 outline-none focus:border-[color:var(--rnest-accent)]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              void handleMetaPatch(c.userId, { alias: aliasInput.trim() });
                              setEditingAliasId(null);
                            }}
                            className="text-[11px] font-semibold text-[color:var(--rnest-accent)] shrink-0"
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAliasId(null)}
                            className="shrink-0 text-[11px] text-gray-500"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAliasInput(meta.alias);
                            setEditingAliasId(c.userId);
                          }}
                          className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition active:opacity-70"
                        >
                          <PencilLine className="h-3 w-3" strokeWidth={2.1} />
                          {meta.alias ? "별칭 수정" : "별칭"}
                        </button>
                      )}
                    </div>

                    {/* 나와의 공통 오프 날짜 */}
                    {pairCommonOff.length > 0 ? (
                      <div className="mb-3">
                        <p className="mb-1.5 text-[11.5px] font-semibold text-gray-500">
                          {displayName}와 같이 쉬는 날
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {pairCommonOff.map((iso) => (
                            <span
                              key={iso}
                              className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-700"
                            >
                              {formatKoreanShort(iso)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mb-3 text-[11.5px] text-gray-500">
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
                      <p className="text-[12px] text-gray-500">이번 달 일정 정보가 없어요</p>
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
                        className="text-[12px] text-gray-500 underline underline-offset-2 transition active:opacity-60 disabled:opacity-40"
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

      {connections.length > 0 ? (
        <div className="border-t border-gray-100">
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
      ) : null}
    </div>
  );
}
