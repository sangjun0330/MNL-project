"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPage, SocialPost, SocialGroupSummary } from "@/types/social";
import { SocialPostCard } from "@/components/social/SocialPostCard";
import { SocialPostComposer } from "@/components/social/SocialPostComposer";
import { SocialPostCommentSheet } from "@/components/social/SocialPostCommentSheet";
import { useAuthState } from "@/lib/auth";

// ── 스켈레톤 카드 ──────────────────────────────────────────────
function PostCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gray-100" />
        <div className="flex-1">
          <div className="h-3 bg-gray-100 rounded w-24 mb-1.5" />
          <div className="h-2.5 bg-gray-100 rounded w-16" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
        <div className="h-3 bg-gray-100 rounded w-3/5" />
      </div>
    </div>
  );
}

// ── 빈 상태 ───────────────────────────────────────────────────
function EmptyFeed({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
        style={{ backgroundColor: "var(--rnest-lavender-soft)" }}>
        📝
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--rnest-text)] mb-1.5">
        아직 게시글이 없어요
      </h3>
      <p className="text-[13px] text-[var(--rnest-muted)] leading-relaxed mb-5">
        친구를 추가하거나 그룹에 참여하면<br />
        일상을 함께 나눌 수 있어요
      </p>
      <button
        className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-white transition-all active:scale-95"
        style={{ backgroundColor: "var(--rnest-accent)" }}
        onClick={onCompose}
      >
        첫 게시글 올리기
      </button>
    </div>
  );
}

type Props = {
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  isAdmin?: boolean;
};

export function SocialFeedTab({ userGroups = [], isAdmin = false }: Props) {
  const { user } = useAuthState();
  const currentUserId = user?.userId;

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);

  // 무한 스크롤 sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 피드 로드
  const loadFeed = useCallback(async (cursor?: string | null) => {
    const isInitial = !cursor;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const url = `/api/social/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url).then((r) => r.json());
      if (res.ok) {
        const data = res.data as FeedPage;
        if (isInitial) {
          setPosts(data.posts);
        } else {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newPosts = data.posts.filter((p) => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        }
        setNextCursor(data.nextCursor);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // IntersectionObserver 무한 스크롤
  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor && !loadingMore) {
          loadFeed(nextCursor);
        }
      },
      { rootMargin: "200px" }
    );

    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, loadFeed]);

  // 새 게시글 추가 (피드 맨 위에 삽입)
  const handlePosted = useCallback((post: SocialPost) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  // 게시글 삭제
  const handleDelete = useCallback((postId: number) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  // 댓글 열기
  const handleCommentOpen = useCallback((post: SocialPost) => {
    setCommentPost(post);
    setCommentSheetOpen(true);
  }, []);

  return (
    <div className="relative">
      {/* 피드 목록 */}
      <div className="flex flex-col gap-2.5 px-4 pt-3 pb-24">
        {loading && !hasLoaded ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : hasLoaded && posts.length === 0 ? (
          <EmptyFeed onCompose={() => setComposerOpen(true)} />
        ) : (
          <>
            {posts.map((post) => (
              <SocialPostCard
                key={post.id}
                post={post}
                onCommentOpen={handleCommentOpen}
                onDelete={handleDelete}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            ))}

            {/* 더 불러오기 sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--rnest-accent)", borderTopColor: "transparent" }} />
              </div>
            )}

            {!nextCursor && posts.length > 0 && (
              <p className="text-center text-[12px] text-[var(--rnest-muted)] py-4">
                모든 게시글을 봤어요 ✓
              </p>
            )}
          </>
        )}
      </div>

      {/* FAB: 게시글 작성 */}
      <button
        className="fixed z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all active:scale-95 hover:brightness-110"
        style={{
          backgroundColor: "var(--rnest-accent)",
          bottom: "calc(80px + env(safe-area-inset-bottom))",
          right: "16px",
        }}
        onClick={() => setComposerOpen(true)}
        aria-label="새 게시글 작성"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-6 h-6">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* 게시글 작성 시트 */}
      <SocialPostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
        userGroups={userGroups}
      />

      {/* 댓글 시트 */}
      <SocialPostCommentSheet
        open={commentSheetOpen}
        post={commentPost}
        onClose={() => {
          setCommentSheetOpen(false);
          setCommentPost(null);
        }}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
