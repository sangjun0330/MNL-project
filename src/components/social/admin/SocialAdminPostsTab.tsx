"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSocialAdminPosts, deleteSocialAdminPost } from "@/lib/social/adminClient";
import type { SocialAdminPost } from "@/types/socialAdmin";

const PAGE_SIZE = 40;

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  } catch { return iso; }
}

const VISIBILITY_LABELS: Record<string, string> = {
  public_internal: "공개",
  followers: "팔로워",
  friends: "친구",
  group: "그룹",
};

function ConfirmModal({ post, onConfirm, onCancel }: { post: SocialAdminPost; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-[16px] font-bold text-gray-900 mb-2">게시글 삭제</p>
        <p className="text-[13px] text-ios-muted mb-2">
          이 게시글을 삭제합니다. 좋아요, 댓글이 모두 삭제됩니다.
        </p>
        <p className="text-[12px] text-gray-500 italic mb-4 border-l-2 border-gray-200 pl-3">
          {post.bodyPreview || "(이미지 전용 게시글)"}
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-xl border border-ios-sep py-2.5 text-[14px] font-semibold text-gray-700 active:opacity-60"
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white active:opacity-60"
            onClick={onConfirm}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

export function SocialAdminPostsTab() {
  const [posts, setPosts] = useState<SocialAdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmPost, setConfirmPost] = useState<SocialAdminPost | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((q: string, off: number) => {
    setLoading(true);
    fetchSocialAdminPosts({ q, limit: PAGE_SIZE, offset: off })
      .then(({ posts: p, total: t }) => { setPosts(p); setTotal(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(query, offset); }, [load, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setOffset(0); load(v, 0); }, 300);
  }

  async function handleDelete() {
    if (!confirmPost) return;
    setDeletingId(confirmPost.id);
    setConfirmPost(null);
    try {
      await deleteSocialAdminPost(confirmPost.id);
      setPosts((prev) => prev.filter((p) => p.id !== confirmPost.id));
      setTotal((t) => t - 1);
      setNotice("게시글을 삭제했습니다.");
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
            placeholder="게시글 내용 검색"
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
          {posts.length === 0 && (
            <div className="py-8 text-center text-[13px] text-ios-muted">게시글이 없습니다.</div>
          )}
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[13px] font-semibold text-gray-900 truncate">
                      {post.authorNickname || "알 수 없음"}
                    </span>
                    {post.authorHandle && (
                      <span className="text-[11px] text-ios-muted">@{post.authorHandle}</span>
                    )}
                    <span className="rounded-full bg-[#f6f4ff] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                      {VISIBILITY_LABELS[post.visibility] ?? post.visibility}
                    </span>
                  </div>
                  <p className="text-[13px] text-gray-700 leading-relaxed line-clamp-2">
                    {post.bodyPreview || "(이미지 전용)"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ios-muted">
                    <span>❤️ {post.likeCount}</span>
                    <span>💬 {post.commentCount}</span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmPost(post)}
                  disabled={deletingId === post.id}
                  className="shrink-0 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 border border-red-200 transition active:opacity-60 disabled:opacity-40"
                >
                  {deletingId === post.id ? "…" : "삭제"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 px-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 active:opacity-60"
          >
            이전
          </button>
          <span className="text-[13px] text-ios-muted">{currentPage} / {totalPages}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 active:opacity-60"
          >
            다음
          </button>
        </div>
      )}

      {confirmPost && (
        <ConfirmModal
          post={confirmPost}
          onConfirm={handleDelete}
          onCancel={() => setConfirmPost(null)}
        />
      )}
    </div>
  );
}
