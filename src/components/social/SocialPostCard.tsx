"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // 더블탭 하트 애니메이션
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number>(0);

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

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    };
  }, []);

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

  const triggerLike = useCallback(async () => {
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

  const handleLike = triggerLike;

  // 이미지 더블탭 좋아요
  const handleImageTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta < 300 && delta > 0) {
      // 더블탭
      e.preventDefault();
      if (!liked) {
        void triggerLike();
      }
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      setShowHeartAnim(true);
      heartTimerRef.current = setTimeout(() => setShowHeartAnim(false), 900);
    }
  }, [liked, triggerLike]);

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
    <article className="bg-white">
      {/* ── 헤더 ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* 아바타 — 인스타 스토리 링 스타일 */}
        <button
          type="button"
          onClick={goToProfile}
          className="shrink-0 rounded-full p-[2px] bg-gradient-to-tr from-[#FEDA75] via-[#FA7E1E] to-[#D62976]"
          aria-label={`${profileLabel} 프로필`}
        >
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-100 text-[16px]">
            {post.authorProfile.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.authorProfile.profileImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              post.authorProfile.avatarEmoji
            )}
          </div>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goToProfile}
              className="truncate text-[13.5px] font-semibold text-gray-900"
            >
              {profileLabel}
            </button>
            {post.groupName ? (
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                {post.groupName}
              </span>
            ) : null}
          </div>
          {post.authorProfile.handle ? (
            <div className="mt-0.5 text-[11.5px] text-gray-400">@{post.authorProfile.handle}</div>
          ) : null}
        </div>

        {canDelete ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 active:opacity-60"
              aria-label="게시글 옵션"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
            {showMenu ? (
              <div className="absolute right-0 top-9 z-20 min-w-[140px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
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
                  className="w-full px-4 py-3 text-left text-[13px] text-gray-500 hover:bg-gray-50"
                >
                  취소
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={goToPost}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400"
            aria-label="게시글 보기"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── 이미지 영역 (full-bleed) ──────────────────────── */}
      {activeMediaUrl ? (
        <div className="relative bg-black w-full">
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="block w-full relative select-none"
            onClick={handleImageTap}
            onTouchEnd={handleImageTap}
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#111]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeMediaUrl}
                alt="게시글 사진"
                className="h-full w-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </div>

            {/* 더블탭 하트 애니메이션 */}
            {showHeartAnim ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="white"
                  className={cn(
                    "w-24 h-24 drop-shadow-xl",
                    "animate-[heartPop_0.9s_ease_forwards]"
                  )}
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
            ) : null}
          </div>

          {/* 멀티이미지 UI */}
          {mediaUrls.length > 1 ? (
            <>
              {/* 이미지 카운터 */}
              <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
                {activeImageIndex + 1}/{mediaUrls.length}
              </div>

              {/* 이전/다음 버튼 */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev === 0 ? mediaUrls.length - 1 : prev - 1)); }}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition active:bg-black/60"
                aria-label="이전 사진"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev + 1) % mediaUrls.length); }}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition active:bg-black/60"
                aria-label="다음 사진"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>

              {/* 하단 도트 인디케이터 */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1">
                {mediaUrls.map((_, index) => (
                  <button
                    key={`dot-${post.id}-${index}`}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveImageIndex(index); }}
                    className={cn(
                      "h-[5px] rounded-full transition-all duration-200",
                      index === activeImageIndex
                        ? "w-4 bg-white"
                        : "w-[5px] bg-white/50"
                    )}
                    aria-label={`${index + 1}번 사진으로 이동`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── 액션바 ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-4">
          {/* 좋아요 */}
          <button
            type="button"
            onClick={handleLike}
            disabled={likeLoading}
            className={cn(
              "flex items-center gap-1 transition-transform active:scale-90",
              liked ? "text-rose-500" : "text-gray-900"
            )}
            aria-label={liked ? "좋아요 취소" : "좋아요"}
          >
            <svg
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn("h-[26px] w-[26px] transition-all duration-150", liked && "scale-110")}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* 댓글 */}
          <button
            type="button"
            onClick={() => onCommentOpen?.(post)}
            className="text-gray-900 transition-transform active:scale-90"
            aria-label="댓글"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[26px] w-[26px]"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          {/* 공유 */}
          <button
            type="button"
            onClick={handleShare}
            className="text-gray-900 transition-transform active:scale-90"
            aria-label="공유"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[26px] w-[26px]"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* 저장 */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saveLoading}
          className="text-gray-900 transition-transform active:scale-90"
          aria-label={saved ? "저장 취소" : "저장"}
        >
          <svg
            viewBox="0 0 24 24"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[26px] w-[26px]"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      {/* ── 좋아요 수 + 캡션 + 태그 ──────────────────────── */}
      <div className="px-3 pb-3">
        {likeCount > 0 ? (
          <div className="mb-1.5 text-[13px] font-semibold text-gray-900">
            좋아요 {formatCount(likeCount)}개
          </div>
        ) : null}

        {caption ? (
          <div className="text-[13.5px] leading-[1.5] text-gray-900">
            <p className={cn(!expanded && isLongCaption ? "line-clamp-2" : undefined)}>
              <button
                type="button"
                onClick={goToProfile}
                className="mr-1.5 font-semibold"
              >
                {profileLabel}
              </button>
              <span className="whitespace-pre-wrap break-words">{caption}</span>
            </p>
            {isLongCaption ? (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-0.5 text-[13px] text-gray-400"
              >
                {expanded ? "접기" : "더 보기"}
              </button>
            ) : null}
          </div>
        ) : null}

        {post.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-1 text-[13px] font-medium text-[color:var(--rnest-accent)]">
            {post.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onCommentOpen?.(post)}
          className="mt-1.5 block text-[13px] text-gray-400"
        >
          {post.commentCount > 0
            ? `댓글 ${formatCount(post.commentCount)}개 모두 보기`
            : "댓글 남기기"}
        </button>

        <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-gray-400">
          {formatRelativeTime(post.createdAt)}
        </p>
      </div>

      {/* ── 포스트 구분선 ─────────────────────────────────── */}
      <div className="h-[1px] bg-gray-100" />
    </article>
  );
}
