"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSocialAdminUsers,
  fetchSocialAdminUserDetail,
  patchSocialAdminUser,
} from "@/lib/social/adminClient";
import type { SocialAdminUser, SocialAdminUserDetail } from "@/types/socialAdmin";

const PAGE_SIZE = 40;

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

function ConfirmModal({
  user,
  onConfirm,
  onCancel,
}: {
  user: SocialAdminUser;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const action = user.isSuspended ? "unsuspend" : "suspend";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-[16px] font-bold text-gray-900 mb-2">
          {action === "suspend" ? "계정 정지" : "정지 해제"}
        </p>
        <p className="text-[13px] text-ios-muted mb-4">
          {action === "suspend"
            ? `@${user.handle || user.nickname} 계정의 소셜 기능을 정지합니다.`
            : `@${user.handle || user.nickname} 계정의 정지를 해제합니다.`}
        </p>
        {action === "suspend" && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="정지 사유 (선택)"
            className="w-full rounded-xl border border-ios-sep bg-ios-bg px-4 py-2.5 text-[14px] outline-none focus:border-[color:var(--rnest-accent)] mb-4"
            maxLength={200}
          />
        )}
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-xl border border-ios-sep py-2.5 text-[14px] font-semibold text-gray-700 active:opacity-60"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold text-white transition active:opacity-60 ${
              action === "suspend" ? "bg-red-500" : "bg-emerald-500"
            }`}
            onClick={() => onConfirm(reason)}
          >
            {action === "suspend" ? "정지" : "해제"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SocialAdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSocialAdminUserDetail(userId)
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  return (
    <div className="rounded-2xl border border-ios-sep bg-ios-bg mx-4 mb-3 p-4">
      {loading || !detail ? (
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-24 bg-gray-200 rounded-full" />
          <div className="h-3 w-16 bg-gray-200 rounded-full" />
        </div>
      ) : (
        <div className="text-[13px] space-y-1 text-ios-muted">
          <div><span className="font-semibold text-gray-700">게시글</span> {detail.postCount.toLocaleString()}개</div>
          <div><span className="font-semibold text-gray-700">그룹 참여</span> {detail.groupCount.toLocaleString()}개</div>
          <div><span className="font-semibold text-gray-700">팔로워</span> {detail.followerCount.toLocaleString()}명</div>
          {detail.isSuspended && (
            <>
              <div className="mt-2 pt-2 border-t border-ios-sep">
                <span className="font-semibold text-red-600">정지 일시</span>{" "}
                {detail.suspendedAt ? formatDate(detail.suspendedAt) : "-"}
              </div>
              {detail.suspensionReason && (
                <div><span className="font-semibold text-red-600">사유</span> {detail.suspensionReason}</div>
              )}
            </>
          )}
        </div>
      )}
      <button
        className="mt-3 text-[12px] text-[color:var(--rnest-accent)] font-semibold"
        onClick={onClose}
      >
        닫기
      </button>
    </div>
  );
}

export function SocialAdminUsersTab() {
  const [users, setUsers] = useState<SocialAdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<SocialAdminUser | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (q: string, susp: boolean, off: number) => {
      setLoading(true);
      fetchSocialAdminUsers({ q, suspended: susp, limit: PAGE_SIZE, offset: off })
        .then(({ users: u, total: t }) => {
          setUsers(u);
          setTotal(t);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(query, suspendedOnly, offset);
  }, [load, offset, suspendedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      load(v, suspendedOnly, 0);
    }, 300);
  }

  function handleSuspendedToggle() {
    const next = !suspendedOnly;
    setSuspendedOnly(next);
    setOffset(0);
    load(query, next, 0);
  }

  async function handleConfirm(reason: string) {
    if (!confirmUser) return;
    const action = confirmUser.isSuspended ? "unsuspend" : "suspend";
    setActionLoading(confirmUser.userId);
    setConfirmUser(null);
    try {
      await patchSocialAdminUser(confirmUser.userId, action, reason);
      setNotice(action === "suspend" ? "계정을 정지했습니다." : "정지를 해제했습니다.");
      load(query, suspendedOnly, offset);
    } catch {
      setNotice("처리에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="pb-24">
      {notice && (
        <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-700">
          {notice}
          <button className="ml-2 text-ios-muted text-[12px]" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {/* 검색 + 필터 */}
      <div className="px-4 py-3 flex gap-2 items-center">
        <div className="flex-1 flex items-center gap-2 rounded-[22px] bg-gray-100 px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-gray-400">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="닉네임, 핸들 검색"
            className="flex-1 bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
            style={{ fontSize: "16px" }}
          />
          {query && (
            <button onClick={() => handleQueryChange("")} className="text-gray-400">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={handleSuspendedToggle}
          className={`shrink-0 rounded-full px-3 py-2 text-[12.5px] font-semibold border transition ${
            suspendedOnly
              ? "bg-red-500 text-white border-red-500"
              : "bg-white text-gray-600 border-ios-sep"
          }`}
        >
          정지만
        </button>
      </div>

      <div className="px-4 pb-2 text-[12px] text-ios-muted">총 {total.toLocaleString()}명</div>

      {/* 로딩 스켈레톤 */}
      {loading && (
        <div className="space-y-2 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm">
              <div className="h-10 w-10 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-24 bg-gray-100 rounded-full" />
                <div className="h-3 w-16 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 사용자 리스트 */}
      {!loading && (
        <div className="space-y-2 px-4">
          {users.length === 0 && (
            <div className="py-8 text-center text-[13px] text-ios-muted">사용자가 없습니다.</div>
          )}
          {users.map((user) => (
            <div key={user.userId}>
              <div className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f4ff] text-xl flex-shrink-0">
                    {user.avatarEmoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-gray-900 truncate">
                        {user.nickname || "(닉네임 없음)"}
                      </span>
                      {user.isSuspended && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                          정지됨
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-ios-muted">
                      {user.handle ? `@${user.handle}` : "핸들 없음"} · {formatDate(user.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandedId(expandedId === user.userId ? null : user.userId)}
                      className="rounded-full bg-ios-bg px-2.5 py-1.5 text-[11px] font-semibold text-ios-muted border border-ios-sep transition active:opacity-60"
                    >
                      자세히
                    </button>
                    <button
                      onClick={() => setConfirmUser(user)}
                      disabled={actionLoading === user.userId}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:opacity-60 ${
                        user.isSuspended
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : "bg-red-50 text-red-600 border border-red-200"
                      }`}
                    >
                      {actionLoading === user.userId
                        ? "…"
                        : user.isSuspended
                          ? "해제"
                          : "정지"}
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === user.userId && (
                <UserDetailPanel userId={user.userId} onClose={() => setExpandedId(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 px-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 transition active:opacity-60"
          >
            이전
          </button>
          <span className="text-[13px] text-ios-muted">{currentPage} / {totalPages}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 transition active:opacity-60"
          >
            다음
          </button>
        </div>
      )}

      {/* 확인 모달 */}
      {confirmUser && (
        <ConfirmModal
          user={confirmUser}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmUser(null)}
        />
      )}
    </div>
  );
}
