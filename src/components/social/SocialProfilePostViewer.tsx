"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { FeedPage, SocialPost } from "@/types/social";
import { SocialPostCard } from "@/components/social/SocialPostCard";
import { SocialPostCommentSheet } from "@/components/social/SocialPostCommentSheet";

type Props = {
  open: boolean;
  post: SocialPost | null;
  initialPosts?: SocialPost[];
  initialNextCursor?: string | null;
  fallbackHandle?: string | null;
  currentUserId?: string;
  onClose: () => void;
};

const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function mergeUniquePosts(base: SocialPost[], incoming: SocialPost[]) {
  if (incoming.length === 0) return base;

  const seen = new Set<number>();
  const merged: SocialPost[] = [];

  for (const item of [...base, ...incoming]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  return merged.sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

async function fetchProfileFeedPage(handle: string, cursor?: string | null) {
  const params = new URLSearchParams();
  params.set("scope", "profile");
  params.set("handle", handle);
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`/api/social/feed?${params.toString()}`, {
    cache: "no-store",
  }).then((response) => response.json());

  if (!res.ok) {
    throw new Error("게시글을 불러오지 못했어요.");
  }

  return res.data as FeedPage;
}

export function SocialProfilePostViewer({
  open,
  post,
  initialPosts,
  initialNextCursor,
  fallbackHandle = null,
  currentUserId,
  onClose,
}: Props) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);
  const didScrollToSelectedRef = useRef(false);
  const lastRequestedPostIdRef = useRef<number | null>(null);

  const viewerHandle = post?.authorProfile.handle ?? fallbackHandle ?? null;
  const viewerTitle = useMemo(() => {
    if (!post) return "게시글";
    if (post.authorProfile.handle) return `@${post.authorProfile.handle}`;
    return post.authorProfile.displayName || post.authorProfile.nickname || "게시글";
  }, [post]);

  const syncPostPatch = useCallback(
    (
      postId: number,
      patch: Partial<
        Pick<SocialPost, "likeCount" | "saveCount" | "isLiked" | "isSaved" | "commentCount">
      >
    ) => {
      setPosts((prev) => prev.map((item) => (item.id === postId ? { ...item, ...patch } : item)));
      setCommentPost((prev) => (prev && prev.id === postId ? { ...prev, ...patch } : prev));
    },
    []
  );

  const handleDelete = useCallback(
    (postId: number) => {
      setCommentPost((prev) => (prev?.id === postId ? null : prev));
      setPosts((prev) => prev.filter((item) => item.id !== postId));
      if (post?.id === postId) {
        onClose();
      }
    },
    [onClose, post?.id]
  );

  const loadMore = useCallback(async () => {
    if (!open || loading || loadingMore || !nextCursor || !viewerHandle) return;

    setLoadingMore(true);
    try {
      const data = await fetchProfileFeedPage(viewerHandle, nextCursor);
      setPosts((prev) => mergeUniquePosts(prev, data.posts));
      setNextCursor(data.nextCursor);
    } catch (loadError: any) {
      setError(String(loadError?.message ?? "게시글을 더 불러오지 못했어요."));
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, nextCursor, open, viewerHandle]);

  useEffect(() => {
    if (!open || !post) return;

    let cancelled = false;
    const seededPosts = initialPosts?.length ? mergeUniquePosts([], initialPosts) : [];
    const canUseSeed = seededPosts.some((item) => item.id === post.id);

    didScrollToSelectedRef.current = false;
    lastRequestedPostIdRef.current = post.id;
    setCommentPost(null);
    setError(null);

    if (canUseSeed) {
      setPosts(mergeUniquePosts(seededPosts, [post]));
      setNextCursor(initialNextCursor ?? null);
      setLoading(false);

      return () => {
        cancelled = true;
      };
    }

    setPosts([post]);
    setNextCursor(null);

    const loadInitialPosts = async () => {
      if (!viewerHandle) {
        return;
      }

      setLoading(true);

      try {
        let cursor: string | null = null;
        let accumulated: SocialPost[] = [];
        let safety = 0;

        while (!cancelled && safety < 12) {
          const data = await fetchProfileFeedPage(viewerHandle, cursor);
          accumulated = mergeUniquePosts(accumulated, data.posts);
          cursor = data.nextCursor;

          if (accumulated.some((item) => item.id === post.id) || !cursor) {
            break;
          }

          safety += 1;
        }

        if (cancelled) return;

        const merged = mergeUniquePosts(accumulated, [post]);
        setPosts(merged);
        setNextCursor(cursor);
      } catch (loadError: any) {
        if (cancelled) return;
        setPosts([post]);
        setError(String(loadError?.message ?? "게시글을 불러오지 못했어요."));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialPosts();

    return () => {
      cancelled = true;
    };
  }, [initialNextCursor, initialPosts, open, post, viewerHandle]);

  useSafeLayoutEffect(() => {
    if (!open || !post || loading || didScrollToSelectedRef.current) return;
    if (!scrollContainerRef.current || !selectedItemRef.current) return;
    if (lastRequestedPostIdRef.current !== post.id) return;

    const scrollContainer = scrollContainerRef.current;
    const selectedItem = selectedItemRef.current;
    const containerTop = scrollContainer.getBoundingClientRect().top;
    const itemTop = selectedItem.getBoundingClientRect().top;
    const offset = 16;

    scrollContainer.scrollTop += itemTop - containerTop - offset;
    didScrollToSelectedRef.current = true;
  }, [loading, open, post, posts]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 720) {
        void loadMore();
      }
    },
    [loadMore]
  );

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        presentation="fullscreen"
        panelClassName="bg-white"
        contentClassName="bg-white"
        backdropClassName="bg-black/55 backdrop-blur-[12px]"
      >
        <div className="flex h-full min-h-0 flex-col bg-white">
          <div className="shrink-0 border-b border-gray-200 bg-white/95 px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
                aria-label="닫기"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  className="h-5 w-5"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-[15px] font-semibold text-gray-900">{viewerTitle}</p>
                <p className="truncate text-[11px] text-gray-400">
                  위로 스크롤하면 더 최근 게시물, 아래로 스크롤하면 이전 게시물
                </p>
              </div>
              <div className="h-9 w-9" />
            </div>
          </div>

          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto bg-[#f5f6fa]"
            onScroll={handleScroll}
          >
            {loading && posts.length === 1 ? (
              <div className="px-4 py-4">
                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-500">
                  게시글을 정리하는 중...
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="px-4 py-4">
                <div className="rounded-2xl border border-red-100 bg-white px-4 py-3 text-[13px] text-red-500">
                  {error}
                </div>
              </div>
            ) : null}

            <div className="pb-[calc(24px+env(safe-area-inset-bottom))]">
              {posts.map((item) => (
                <div
                  key={item.id}
                  ref={item.id === post?.id ? selectedItemRef : null}
                  className="scroll-mt-4"
                >
                  <SocialPostCard
                    post={item}
                    currentUserId={currentUserId}
                    onDelete={handleDelete}
                    onCommentOpen={setCommentPost}
                    onStatsChange={syncPostPatch}
                  />
                </div>
              ))}
            </div>

            {loadingMore ? (
              <div className="flex justify-center pb-6">
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2"
                  style={{
                    borderColor: "var(--rnest-accent)",
                    borderTopColor: "transparent",
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </BottomSheet>

      <SocialPostCommentSheet
        open={Boolean(commentPost)}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        currentUserId={currentUserId}
        onCommentCountChange={(postId, count) => syncPostPatch(postId, { commentCount: count })}
      />
    </>
  );
}
