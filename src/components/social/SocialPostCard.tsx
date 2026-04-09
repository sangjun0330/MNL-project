"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SocialPost } from "@/types/social";
import { cn } from "@/lib/cn";

// ── 상대 시간 포맷 ──────────────────────────────────────────────
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
  const [imgError, setImgError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isOwnPost = currentUserId === post.authorUserId;
  const canDelete = isOwnPost || isAdmin;

  const handleLike = useCallback(async () => {
    if (likeLoading) return;
    // 낙관적 업데이트
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!liked);
    setLikeCount((c) => (liked ? Math.max(0, c - 1) : c + 1));
    setLikeLoading(true);
    try {
      const res = await fetch(`/api/social/posts/${post.id}/like`, {
        method: "POST",
      }).then((r) => r.json());
      if (res.ok) {
        setLiked(res.data.liked);
        setLikeCount(res.data.count);
        onStatsChange?.(post.id, {
          isLiked: res.data.liked,
          likeCount: res.data.count,
        });
      } else {
        // 실패 시 롤백
        setLiked(prevLiked);
        setLikeCount(prevCount);
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikeLoading(false);
    }
  }, [likeLoading, liked, likeCount, onStatsChange, post.id]);

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
      }).then((r) => r.json());
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
          title: `${post.authorProfile.displayName}님의 게시글`,
          text: post.body.slice(0, 80),
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {}
  }, [post.authorProfile.displayName, post.body, post.id]);

  const handleDelete = useCallback(async () => {
    if (!canDelete) return;
    setShowMenu(false);
    const res = await fetch(`/api/social/posts/${post.id}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (res.ok && onDelete) {
      onDelete(post.id);
    }
  }, [canDelete, post.id, onDelete]);

  const bodyLines = post.body.split("\n");
  const isLong = bodyLines.length > 4 || post.body.length > 200;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 헤더: 아바타 + 닉네임 + 시간 + 메뉴 */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        {/* 아바타 */}
        <button
          type="button"
          onClick={() => post.authorProfile.handle && router.push(`/social/profile/${post.authorProfile.handle}`)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 overflow-hidden"
          style={{ backgroundColor: "var(--rnest-lavender-soft)", border: "1px solid var(--rnest-lavender-border)" }}
          aria-label={`${post.authorProfile.displayName} 프로필`}
        >
          {post.authorProfile.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.authorProfile.profileImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            post.authorProfile.avatarEmoji
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => post.authorProfile.handle && router.push(`/social/profile/${post.authorProfile.handle}`)}
              className="text-[13px] font-semibold text-[var(--rnest-text)] truncate"
            >
              {post.authorProfile.displayName || post.authorProfile.nickname || "익명"}
            </button>
            {post.authorProfile.handle ? (
              <span className="text-[11px] text-[var(--rnest-muted)] shrink-0">
                @{post.authorProfile.handle}
              </span>
            ) : null}
            {post.groupName && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
                style={{
                  backgroundColor: "var(--rnest-lavender-soft)",
                  color: "var(--rnest-lavender)",
                  border: "1px solid var(--rnest-lavender-border)",
                }}>
                {post.groupName}
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--rnest-muted)]">{formatRelativeTime(post.createdAt)}</span>
        </div>
        {/* 더보기 메뉴 */}
        {canDelete && (
          <div className="relative">
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/5 text-[var(--rnest-muted)]"
              onClick={() => setShowMenu((v) => !v)}
              aria-label="게시글 옵션"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <circle cx="10" cy="4" r="1.5" />
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="10" cy="16" r="1.5" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-[var(--rnest-sep)] z-10 overflow-hidden min-w-[120px]">
                <button
                  className="w-full text-left px-4 py-3 text-[13px] text-red-500 hover:bg-red-50 active:bg-red-100"
                  onClick={handleDelete}
                >
                  삭제하기
                </button>
                <button
                  className="w-full text-left px-4 py-3 text-[13px] text-[var(--rnest-sub)] hover:bg-black/5"
                  onClick={() => setShowMenu(false)}
                >
                  취소
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="px-4 pb-2">
        <p className={cn(
          "text-[14px] leading-relaxed text-[var(--rnest-text)] whitespace-pre-wrap break-words",
          !expanded && isLong && "line-clamp-4"
        )}
          onClick={() => router.push(`/social/posts/${post.id}`)}
        >
          {post.body}
        </p>
        {isLong && (
          <button
            className="mt-1 text-[12px] font-medium"
            style={{ color: "var(--rnest-accent)" }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        )}
      </div>

      {/* 이미지 */}
      {post.imageUrl && !imgError && (
        <div className="px-4 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt="게시글 이미지"
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: "280px" }}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
      )}

      {/* 태그 */}
      {post.tags.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "var(--rnest-lavender-soft)",
                color: "var(--rnest-lavender)",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="px-4 pb-2 flex items-center justify-between text-[11px] text-[var(--rnest-muted)]">
        <span>
          {post.visibility === "public_internal"
            ? "허브 공개"
            : post.visibility === "followers"
              ? "팔로워 공개"
              : post.visibility === "group"
                ? "그룹 공개"
                : "친구 공개"}
        </span>
        <button
          type="button"
          className="font-medium"
          style={{ color: "var(--rnest-accent)" }}
          onClick={() => router.push(`/social/posts/${post.id}`)}
        >
          자세히 보기
        </button>
      </div>

      {/* 구분선 */}
      <div className="mx-4" style={{ borderTop: "1px solid var(--rnest-sep)" }} />

      {/* 액션 바: 좋아요 + 댓글 + 저장 + 공유 */}
      <div className="flex items-center gap-1 px-2 py-1">
        {/* 좋아요 버튼 */}
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all active:scale-95",
            liked ? "text-rose-500" : "text-[var(--rnest-muted)]",
            "hover:bg-black/5"
          )}
          onClick={handleLike}
          disabled={likeLoading}
          aria-label={liked ? "좋아요 취소" : "좋아요"}
        >
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "w-[18px] h-[18px] transition-transform",
              liked ? "scale-110" : "scale-100"
            )}
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>{likeCount > 0 ? likeCount : ""}</span>
        </button>

        {/* 댓글 버튼 */}
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium text-[var(--rnest-muted)] hover:bg-black/5 transition-all active:scale-95"
          onClick={() => onCommentOpen?.(post)}
          aria-label="댓글 보기"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-[18px] h-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{post.commentCount > 0 ? post.commentCount : ""}</span>
        </button>

        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all active:scale-95",
            saved ? "text-[var(--rnest-accent)]" : "text-[var(--rnest-muted)]",
            "hover:bg-black/5"
          )}
          onClick={handleSave}
          disabled={saveLoading}
          aria-label={saved ? "저장 취소" : "저장"}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-[18px] h-[18px]"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </svg>
          <span>{saveCount > 0 ? saveCount : ""}</span>
        </button>

        <button
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium text-[var(--rnest-muted)] hover:bg-black/5 transition-all active:scale-95"
          onClick={handleShare}
          aria-label="게시글 공유"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-[18px] h-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>
    </div>
  );
}
