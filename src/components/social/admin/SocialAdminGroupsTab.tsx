"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSocialAdminGroups,
  fetchSocialAdminGroupMembers,
  deleteSocialAdminGroup,
  removeSocialGroupMember,
} from "@/lib/social/adminClient";
import type { SocialAdminGroup, SocialAdminGroupMember } from "@/types/socialAdmin";

const PAGE_SIZE = 40;

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

const JOIN_MODE_LABELS: Record<string, string> = {
  open: "자유 가입",
  approval: "승인 필요",
  invite_only: "초대 전용",
};

function DeleteGroupModal({ group, onConfirm, onCancel }: { group: SocialAdminGroup; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-[16px] font-bold text-gray-900 mb-2">그룹 삭제</p>
        <p className="text-[13px] text-ios-muted mb-4">
          <span className="font-semibold text-gray-800">{group.name}</span> 그룹을 삭제합니다. 멤버, 챌린지, 게시글이 모두 삭제됩니다.
        </p>
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl border border-ios-sep py-2.5 text-[14px] font-semibold text-gray-700 active:opacity-60" onClick={onCancel}>취소</button>
          <button className="flex-1 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white active:opacity-60" onClick={onConfirm}>삭제</button>
        </div>
      </div>
    </div>
  );
}

function RemoveMemberModal({ member, onConfirm, onCancel }: { member: SocialAdminGroupMember; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-[16px] font-bold text-gray-900 mb-2">멤버 강제 퇴장</p>
        <p className="text-[13px] text-ios-muted mb-4">
          <span className="font-semibold text-gray-800">{member.nickname || member.handle}</span> 님을 그룹에서 퇴장시킵니다.
        </p>
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl border border-ios-sep py-2.5 text-[14px] font-semibold text-gray-700 active:opacity-60" onClick={onCancel}>취소</button>
          <button className="flex-1 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white active:opacity-60" onClick={onConfirm}>퇴장</button>
        </div>
      </div>
    </div>
  );
}

function GroupMembersPanel({ groupId, onClose }: { groupId: number; onClose: () => void }) {
  const [members, setMembers] = useState<SocialAdminGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmMember, setConfirmMember] = useState<SocialAdminGroupMember | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchSocialAdminGroupMembers(groupId)
      .then((m) => { setMembers(m); setLoading(false); })
      .catch(() => setLoading(false));
  }, [groupId]);

  async function handleRemove() {
    if (!confirmMember) return;
    setRemovingId(confirmMember.userId);
    setConfirmMember(null);
    try {
      await removeSocialGroupMember(groupId, confirmMember.userId);
      setMembers((prev) => prev.filter((m) => m.userId !== confirmMember.userId));
      setNotice("멤버를 퇴장시켰습니다.");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      setNotice(msg === "cannot_remove_owner" ? "그룹 오너는 퇴장시킬 수 없습니다." : "처리에 실패했습니다.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-ios-sep bg-ios-bg mx-4 mb-3 p-4">
      {notice && <p className="text-[12px] text-red-500 mb-2">{notice}</p>}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-3 bg-gray-200 rounded-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2">
              <span className="text-base">{m.avatarEmoji}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-semibold text-gray-900 truncate">{m.nickname || m.handle}</span>
                {m.role === "owner" && (
                  <span className="ml-1.5 rounded-full bg-[#f6f4ff] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--rnest-accent)]">오너</span>
                )}
              </div>
              {m.role !== "owner" && (
                <button
                  onClick={() => setConfirmMember(m)}
                  disabled={removingId === m.userId}
                  className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 border border-red-200 active:opacity-60 disabled:opacity-40"
                >
                  {removingId === m.userId ? "…" : "퇴장"}
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && <p className="text-[12px] text-ios-muted">멤버가 없습니다.</p>}
        </div>
      )}
      <button className="mt-3 text-[12px] text-[color:var(--rnest-accent)] font-semibold" onClick={onClose}>닫기</button>
      {confirmMember && (
        <RemoveMemberModal
          member={confirmMember}
          onConfirm={handleRemove}
          onCancel={() => setConfirmMember(null)}
        />
      )}
    </div>
  );
}

export function SocialAdminGroupsTab() {
  const [groups, setGroups] = useState<SocialAdminGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<SocialAdminGroup | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((q: string, off: number) => {
    setLoading(true);
    fetchSocialAdminGroups({ q, limit: PAGE_SIZE, offset: off })
      .then(({ groups: g, total: t }) => { setGroups(g); setTotal(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(query, offset); }, [load, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setOffset(0); load(v, 0); }, 300);
  }

  async function handleDelete() {
    if (!confirmGroup) return;
    setDeletingId(confirmGroup.id);
    setConfirmGroup(null);
    try {
      await deleteSocialAdminGroup(confirmGroup.id);
      setGroups((prev) => prev.filter((g) => g.id !== confirmGroup.id));
      setTotal((t) => t - 1);
      setNotice("그룹을 삭제했습니다.");
    } catch {
      setNotice("삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
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

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-[22px] bg-gray-100 px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-gray-400">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="그룹명 검색"
            className="flex-1 bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="px-4 pb-2 text-[12px] text-ios-muted">총 {total.toLocaleString()}개</div>

      {loading ? (
        <div className="space-y-2 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 px-4">
          {groups.length === 0 && (
            <div className="py-8 text-center text-[13px] text-ios-muted">그룹이 없습니다.</div>
          )}
          {groups.map((group) => (
            <div key={group.id}>
              <div className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[14px] font-semibold text-gray-900 truncate">{group.name}</span>
                      <span className="rounded-full bg-[#f6f4ff] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                        {JOIN_MODE_LABELS[group.joinMode] ?? group.joinMode}
                      </span>
                    </div>
                    {group.descriptionPreview && (
                      <p className="text-[12px] text-ios-muted line-clamp-1">{group.descriptionPreview}</p>
                    )}
                    <div className="mt-1 text-[11px] text-ios-muted flex items-center gap-2">
                      <span>오너: {group.ownerNickname || "-"}</span>
                      <span>·</span>
                      <span>멤버 {group.memberCount}명</span>
                      <span>·</span>
                      <span>{formatDate(group.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setExpandedId(expandedId === group.id ? null : group.id)}
                      className="rounded-full bg-ios-bg px-2.5 py-1.5 text-[11px] font-semibold text-ios-muted border border-ios-sep active:opacity-60"
                    >
                      멤버
                    </button>
                    <button
                      onClick={() => setConfirmGroup(group)}
                      disabled={deletingId === group.id}
                      className="rounded-full bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 border border-red-200 active:opacity-60 disabled:opacity-40"
                    >
                      {deletingId === group.id ? "…" : "삭제"}
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === group.id && (
                <GroupMembersPanel groupId={group.id} onClose={() => setExpandedId(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 px-4">
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 active:opacity-60">이전</button>
          <span className="text-[13px] text-ios-muted">{currentPage} / {totalPages}</span>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 active:opacity-60">다음</button>
        </div>
      )}

      {confirmGroup && (
        <DeleteGroupModal group={confirmGroup} onConfirm={handleDelete} onCancel={() => setConfirmGroup(null)} />
      )}
    </div>
  );
}
