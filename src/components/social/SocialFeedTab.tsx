"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { DEFAULT_SOCIAL_POST_VISIBILITY } from "@/types/social";
import type {
  FeedPage,
  SocialGroupSummary,
  SocialPost,
  SocialPostVisibility,
} from "@/types/social";
import { SocialPostCard } from "@/components/social/SocialPostCard";
import { SocialPostComposer } from "@/components/social/SocialPostComposer";
import { SocialPostCommentSheet } from "@/components/social/SocialPostCommentSheet";
import { useAuthState } from "@/lib/auth";

// ── 스켈레톤 카드 (edge-to-edge) ─────────────────────────────
function PostCardSkeleton() {
  return (
    <div className="bg-white animate-pulse">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="w-10 h-10 rounded-full bg-gray-100" />
        <div className="flex-1">
          <div className="h-3 bg-gray-100 rounded-full w-24 mb-1.5" />
          <div className="h-2.5 bg-gray-100 rounded-full w-16" />
        </div>
      </div>
      {/* 이미지 플레이스홀더 */}
      <div className="aspect-[4/5] w-full bg-gray-100" />
      {/* 액션바 */}
      <div className="flex items-center gap-4 px-3 pt-2.5 pb-1">
        <div className="h-6 w-6 rounded-full bg-gray-100" />
        <div className="h-6 w-6 rounded-full bg-gray-100" />
        <div className="h-6 w-6 rounded-full bg-gray-100" />
      </div>
      {/* 캡션 */}
      <div className="px-3 pb-3 space-y-2">
        <div className="h-3 bg-gray-100 rounded-full w-full" />
        <div className="h-3 bg-gray-100 rounded-full w-4/5" />
      </div>
      <div className="h-[1px] bg-gray-100" />
    </div>
  );
}

type FeedScope = "following" | "profile" | "saved" | "liked";

type Props = {
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  isAdmin?: boolean;
  scope?: FeedScope;
  handle?: string | null;
  showComposer?: boolean;
  defaultVisibility?: SocialPostVisibility;
  externalComposerOpen?: boolean;
  onExternalComposerOpenChange?: (open: boolean) => void;
};

function buildEmptyCopy(scope: FeedScope) {
  if (scope === "saved") {
    return {
      title: "저장한 게시글이 없어요",
      description:
        "나중에 다시 보고 싶은 글을 저장해두면\n여기에서 바로 모아볼 수 있어요",
    };
  }
  if (scope === "liked") {
    return {
      title: "좋아요한 게시글이 없어요",
      description:
        "좋아요를 누른 게시글이 생기면\n여기에서 다시 확인할 수 있어요",
    };
  }
  if (scope === "profile") {
    return {
      title: "게시글이 아직 없어요",
      description: "첫 게시글을 올리면\n프로필 타임라인이 채워져요",
    };
  }
  return {
    title: "아직 게시글이 없어요",
    description:
      "팔로우를 시작하거나 그룹에 참여하면\n일상을 함께 나눌 수 있어요",
  };
}

export function SocialFeedTab({
  userGroups = [],
  isAdmin = false,
  scope = "following",
  handle = null,
  showComposer = true,
  defaultVisibility = DEFAULT_SOCIAL_POST_VISIBILITY,
  externalComposerOpen = false,
  onExternalComposerOpenChange,
}: Props) {
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

  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const emptyCopy = buildEmptyCopy(scope);

  const loadFeed = useCallback(
    async (cursor?: string | null) => {
      const isInitial = !cursor;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams();
        params.set("scope", scope);
        if (handle) params.set("handle", handle);
        if (cursor) params.set("cursor", cursor);
        const url = `/api/social/feed?${params.toString()}`;
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
    },
    [handle, scope],
  );

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (!showComposer || !externalComposerOpen) return;
    setComposerOpen(true);
    onExternalComposerOpenChange?.(false);
  }, [externalComposerOpen, onExternalComposerOpenChange, showComposer]);

  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor && !loadingMore) {
          loadFeed(nextCursor);
        }
      },
      { rootMargin: "200px" },
    );

    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, loadFeed]);

  const handlePosted = useCallback((post: SocialPost) => {
    setPosts((prev) => [post, ...prev]);
  }, []);

  const handleDelete = useCallback((postId: number) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handlePostStatsChange = useCallback(
    (
      postId: number,
      patch: Partial<
        Pick<
          SocialPost,
          "commentCount" | "likeCount" | "saveCount" | "isLiked" | "isSaved"
        >
      >,
    ) => {
      setPosts((prev) =>
        prev.map((post) => (post.id === postId ? { ...post, ...patch } : post)),
      );
    },
    [],
  );

  const handleAuthorFollowChange = useCallback(
    (authorUserId: string, isFollowing: boolean) => {
      setPosts((prev) =>
        prev.map((post) =>
          post.authorUserId === authorUserId
            ? {
                ...post,
                authorProfile: {
                  ...post.authorProfile,
                  isFollowing,
                },
              }
            : post,
        ),
      );
    },
    [],
  );

  const handleCommentOpen = useCallback((post: SocialPost) => {
    setCommentPost(post);
    setCommentSheetOpen(true);
  }, []);

  return (
    <div className="relative">
      {/* ── 피드 목록 (edge-to-edge, no px padding) ──────── */}
      <div className="flex flex-col pb-24">
        {loading && !hasLoaded ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : hasLoaded && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--rnest-lavender-soft)" }}
            >
              <FileText
                className="h-7 w-7 text-[color:var(--rnest-accent)]"
                strokeWidth={1.9}
              />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--rnest-text)] mb-1.5">
              {emptyCopy.title}
            </h3>
            <p className="text-[13px] text-[var(--rnest-muted)] leading-relaxed mb-5 whitespace-pre-line">
              {emptyCopy.description}
            </p>
            {showComposer ? (
              <button
                className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-white transition-all active:scale-95"
                style={{ backgroundColor: "var(--rnest-accent)" }}
                onClick={() => setComposerOpen(true)}
              >
                첫 게시글 올리기
              </button>
            ) : null}
          </div>
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
                onAuthorFollowChange={handleAuthorFollowChange}
                onStatsChange={handlePostStatsChange}
              />
            ))}

            <div ref={sentinelRef} className="h-1" />

            {loadingMore && (
              <div className="flex justify-center py-4">
                <div
                  className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{
                    borderColor: "var(--rnest-accent)",
                    borderTopColor: "transparent",
                  }}
                />
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

      {/* ── FAB: 게시글 작성 ──────────────────────────────── */}
      {showComposer ? (
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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="w-6 h-6"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      ) : null}

      <SocialPostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
        userGroups={userGroups}
        defaultVisibility={defaultVisibility}
      />

      <SocialPostCommentSheet
        open={commentSheetOpen}
        post={commentPost}
        onClose={() => {
          setCommentSheetOpen(false);
          setCommentPost(null);
        }}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onCommentCountChange={(postId, count) =>
          handlePostStatsChange(postId, { commentCount: count })
        }
      />
    </div>
  );
}
