"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { sanitizeInternalPath } from "@/lib/navigation";
import type { SocialPost } from "@/types/social";
import { SocialPostCard } from "@/components/social/SocialPostCard";
import { SocialPostCommentSheet } from "@/components/social/SocialPostCommentSheet";

type Props = {
  postId: string;
};

export function SocialPostDetailPage({ postId: rawPostId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const returnTo = sanitizeInternalPath(searchParams.get("returnTo"), "/social");

  const [post, setPost] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(returnTo || "/social");
  }, [returnTo, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const loadPost = async () => {
      setLoading(true);
      setError(null);
      try {
        const postId = Number.parseInt(rawPostId, 10);
        if (!Number.isFinite(postId) || postId <= 0) throw new Error("잘못된 게시글이에요.");
        const res = await fetch(`/api/social/posts/${postId}`, { cache: "no-store" }).then((response) => response.json());
        if (!res.ok) {
          throw new Error(res.error === "not_found" ? "게시글을 찾을 수 없어요." : "게시글을 불러오지 못했어요.");
        }
        setPost(res.data?.post ?? null);
      } catch (loadError: any) {
        setError(String(loadError?.message ?? "게시글을 불러오지 못했어요."));
      } finally {
        setLoading(false);
      }
    };
    void loadPost();
  }, [rawPostId, status]);

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
          aria-label="뒤로"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-[17px] font-bold text-ios-text">게시글</h1>
        <div className="h-9 w-9" />
      </div>

      {status !== "authenticated" ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <p className="text-[14px] text-ios-muted">로그인 후 게시글을 볼 수 있어요.</p>
        </div>
      ) : loading ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <p className="text-[14px] text-ios-muted">게시글을 불러오는 중...</p>
        </div>
      ) : error || !post ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <p className="text-[14px] text-red-500">{error ?? "게시글을 찾을 수 없어요."}</p>
        </div>
      ) : (
        <>
          <SocialPostCard
            post={post}
            currentUserId={user?.userId}
            onCommentOpen={() => setCommentsOpen(true)}
            onStatsChange={(postId, patch) =>
              setPost((prev) => (prev && prev.id === postId ? { ...prev, ...patch } : prev))
            }
          />
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="w-full rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold text-[color:var(--rnest-accent)] shadow-sm"
          >
            댓글 열기
          </button>
        </>
      )}

      <SocialPostCommentSheet
        open={commentsOpen}
        post={post}
        onClose={() => setCommentsOpen(false)}
        currentUserId={user?.userId}
        onCommentCountChange={(postId, count) =>
          setPost((prev) => (prev && prev.id === postId ? { ...prev, commentCount: count } : prev))
        }
      />
    </div>
  );
}
