"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPost } from "@/types/social";
import { cn } from "@/lib/cn";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

type Props = {
  post: SocialPost;
  onCommentOpen?: (post: SocialPost) => void;
  onDelete?: (postId: number) => void;
  currentUserId?: string;
  isAdmin?: boolean;
  onStatsChange?: (
    postId: number,
    patch: Partial<Pick<SocialPost, "likeCount" | "saveCount" | "isLiked" | "isSaved" | "commentCount">>
  ) => void;
};

export function SocialPostCard({
  post,
  onCommentOpen,
  onDelete,
  currentUserId,
  isAdmin,
  onStatsChange,
}: Props) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.isSaved);
  const [saveCount, setSaveCount] = useState(post.saveCount);
  const [likeLoading, setLikeLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setLiked(post.isLiked);
    setLikeCount(post.likeCount);
    setSaved(post.isSaved);
    setSaveCount(post.saveCount);
  }, [post.isLiked, post.isSaved, post.likeCount, post.saveCount]);

  useEffect(() => {
    setExpanded(false);
    setShowMenu(false);
    setActiveImageIndex(0);
  }, [post.id]);

  const isOwnPost = currentUserId === post.authorUserId;
  const canDelete = isOwnPost || isAdmin;
  const mediaUrls = useMemo(
    () => (post.imageUrls.length > 0 ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []),
    [post.imageUrl, post.imageUrls]
  );
  const activeMediaUrl = mediaUrls[activeImageIndex] ?? mediaUrls[0] ?? null;
  const caption = post.body.trim();
  const isLongCaption = caption.split("\n").length > 2 || caption.length > 140;
  const profileLabel = post.authorProfile.displayName || post.authorProfile.nickname || "익명";

  const goToProfile = useCallback(() => {
    if (post.authorProfile.handle) {
      router.push(`/social/profile/${post.authorProfile.handle}`);
    }
  }, [post.authorProfile.handle, router]);

  const goToPost = useCallback(() => {
    router.push(`/social/posts/${post.id}`);
  }, [post.id, router]);

  const handleLike = useCallback(async () => {
    if (likeLoading) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!liked);
    setLikeCount((count) => (liked ? Math.max(0, count - 1) : count + 1));
    setLikeLoading(true);

    try {
      const res = await fetch(`/api/social/posts/${post.id}/like`, {
        method: "POST",
      }).then((response) => response.json());

      if (res.ok) {
        setLiked(res.data.liked);
        setLikeCount(res.data.count);
        onStatsChange?.(post.id, {
          isLiked: res.data.liked,
          likeCount: res.data.count,
        });
      } else {
        setLiked(prevLiked);
        setLikeCount(prevCount);
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikeLoading(false);
    }
  }, [likeCount, likeLoading, liked, onStatsChange, post.id]);

  const handleSave = useCallback(async () => {
    if (saveLoading) return;
    const prevSaved = saved;
    const prevCount = saveCount;
    setSaved(!saved);
    setSaveCount((count) => (saved ? Math.max(0, count - 1) : count + 1));
    setSaveLoading(true);

    try {
      const res = await fetch(`/api/social/posts/${post.id}/save`, {
        method: "POST",
      }).then((response) => response.json());

      if (res.ok) {
        setSaved(res.data.saved);
        setSaveCount(res.data.count);
        onStatsChange?.(post.id, {
          isSaved: res.data.saved,
          saveCount: res.data.count,
        });
      } else {
        setSaved(prevSaved);
        setSaveCount(prevCount);
      }
    } catch {
      setSaved(prevSaved);
      setSaveCount(prevCount);
    } finally {
      setSaveLoading(false);
    }
  }, [onStatsChange, post.id, saveCount, saveLoading, saved]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/social/posts/${post.id}`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

    try {
      if (typeof nav.share === "function") {
        await nav.share({
          title: `${profileLabel}님의 게시글`,
          text: caption || "RNest 소셜 게시글",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {}
  }, [caption, post.id, profileLabel]);

  const handleDelete = useCallback(async () => {
    if (!canDelete) return;
    setShowMenu(false);

    const res = await fetch(`/api/social/posts/${post.id}`, {
      method: "DELETE",
    }).then((response) => response.json());

    if (res.ok) {
      onDelete?.(post.id);
    }
  }, [canDelete, onDelete, post.id]);

  return (
    <article className="overflow-hidden rounded-[30px] border border-black/[0.06] bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={goToProfile}
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/[0.06] bg-[#f3f4f6] text-[18px]"
          aria-label={`${profileLabel} 프로필`}
        >
          {post.authorProfile.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.authorProfile.profileImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            post.authorProfile.avatarEmoji
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToProfile}
              className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#111827]"
            >
              {profileLabel}
            </button>
            {post.groupName ? (
              <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
                {post.groupName}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#6b7280]">
            {post.authorProfile.handle ? <span>@{post.authorProfile.handle}</span> : null}
            {post.visibility === "followers" ? <span>팔로워 공개</span> : null}
            {post.visibility === "public_internal" ? <span>허브 공개</span> : null}
          </div>
        </div>

        {canDelete ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-black/5"
              aria-label="게시글 옵션"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {showMenu ? (
              <div className="absolute right-0 top-10 z-20 min-w-[120px] overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full px-4 py-3 text-left text-[13px] font-medium text-red-500 hover:bg-red-50"
                >
                  삭제하기
                </button>
                <button
                  type="button"
                  onClick={() => setShowMenu(false)}
                  className="w-full px-4 py-3 text-left text-[13px] text-[#6b7280] hover:bg-black/[0.03]"
                >
                  취소
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeMediaUrl ? (
        <div className="relative bg-black">
          <button type="button" onClick={goToPost} className="block w-full text-left">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#111]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activeMediaUrl} alt="게시글 사진" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </button>

          {mediaUrls.length > 1 ? (
            <>
              <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                {activeImageIndex + 1}/{mediaUrls.length}
              </div>

              <button
                type="button"
                onClick={() => setActiveImageIndex((prev) => (prev === 0 ? mediaUrls.length - 1 : prev - 1))}
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/45"
                aria-label="이전 사진"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setActiveImageIndex((prev) => (prev + 1) % mediaUrls.length)}
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/45"
                aria-label="다음 사진"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>

              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                {mediaUrls.map((_, index) => (
                  <button
                    key={`dot-${post.id}-${index}`}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      index === activeImageIndex ? "w-5 bg-white" : "w-1.5 bg-white/45"
                    )}
                    aria-label={`${index + 1}번 사진으로 이동`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleLike}
            disabled={likeLoading}
            className={cn(
              "flex items-center gap-1.5 text-[14px] font-medium transition active:scale-95",
              liked ? "text-rose-500" : "text-[#111827]"
            )}
            aria-label={liked ? "좋아요 취소" : "좋아요"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {likeCount > 0 ? <span className="text-[13px]">{formatCount(likeCount)}</span> : null}
          </button>

          <button
            type="button"
            onClick={() => onCommentOpen?.(post)}
            className="flex items-center gap-1.5 text-[14px] font-medium text-[#111827] transition active:scale-95"
            aria-label="댓글"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {post.commentCount > 0 ? <span className="text-[13px]">{formatCount(post.commentCount)}</span> : null}
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="text-[#111827] transition active:scale-95"
            aria-label="공유"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4Z" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveLoading}
          className={cn("transition active:scale-95", saved ? "text-[#111827]" : "text-[#111827]")}
          aria-label={saved ? "저장 취소" : "저장"}
        >
          <svg
            viewBox="0 0 24 24"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </svg>
          <span className="sr-only">{saveCount > 0 ? `${saveCount}개 저장` : "저장"}</span>
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="mb-2 flex items-center gap-4 text-[13px] font-semibold text-[#111827]">
          {likeCount > 0 ? <span>{formatCount(likeCount)}명이 좋아합니다</span> : null}
          {saveCount > 0 ? <span>{formatCount(saveCount)}회 저장됨</span> : null}
        </div>

        {caption ? (
          <div className="text-[13.5px] leading-6 text-[#111827]">
            <p className={cn(!expanded && isLongCaption ? "line-clamp-2" : undefined)}>
              <button
                type="button"
                onClick={goToProfile}
                className="mr-1 font-semibold"
              >
                {profileLabel}
              </button>
              <span className="whitespace-pre-wrap break-words">{caption}</span>
            </p>
            {isLongCaption ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-1 text-[13px] font-medium text-[#6b7280]"
              >
                {expanded ? "접기" : "more"}
              </button>
            ) : null}
          </div>
        ) : null}

        {post.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[13px] font-medium text-[#4F46E5]">
            {post.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onCommentOpen?.(post)}
          className="mt-2 text-[13px] text-[#6b7280]"
        >
          {post.commentCount > 0 ? `댓글 ${formatCount(post.commentCount)}개 모두 보기` : "댓글 남기기"}
        </button>

        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
          {formatRelativeTime(post.createdAt)}
        </p>
      </div>
    </article>
  );
}
