"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SocialPost, SocialHealthBadge, RecoveryCardSnapshot } from "@/types/social";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import { cn } from "@/lib/cn";

function normalizeShiftCode(value: string | null | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();

  if (normalized === "DAY") return "D";
  if (normalized === "EVENING") return "E";
  if (normalized === "NIGHT") return "N";
  if (normalized === "MID" || normalized === "MIDDLE") return "M";
  if (normalized === "OFF" || normalized === "휴" || normalized === "휴무") return "OFF";
  if (normalized === "VAC" || normalized === "VA" || normalized === "휴가" || normalized === "연차") return "VAC";
  if (normalized === "D" || normalized === "E" || normalized === "N" || normalized === "M") return normalized;

  return normalized.slice(0, 8);
}

// ── 교대 유형 SVG 아이콘 ─────────────────────────────────────
function ShiftIcon({ shiftType }: { shiftType: string }) {
  const t = normalizeShiftCode(shiftType) ?? shiftType.toUpperCase();
  if (t === "N" || t.startsWith("N")) {
    // 나이트 → 달
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-indigo-500">
        <path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.002 8.002 0 1 0 10.586 10.586z" />
      </svg>
    );
  }
  if (t === "E" || t.startsWith("E")) {
    // 이브닝 → 반달/석양
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-orange-400">
        <path fillRule="evenodd" d="M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm4.243 2.757a1 1 0 0 1 0 1.414L13.07 7.343a1 1 0 1 1-1.414-1.414l1.172-1.172a1 1 0 0 1 1.414 0zM18 9a1 1 0 1 0 0 2h-1a1 1 0 1 0 0-2h1zM5.636 5.636a1 1 0 0 0-1.414 0L3.05 6.808a1 1 0 0 0 1.414 1.414l1.172-1.172a1 1 0 0 0 0-1.414zM3 10a1 1 0 0 0-1 1 1 1 0 0 0 1 1H2a1 1 0 1 0 0-2h1zM10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" clipRule="evenodd" />
      </svg>
    );
  }
  if (t === "OFF" || t === "M" || t === "휴") {
    // 휴무 → 커피컵
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-emerald-500">
        <path fillRule="evenodd" d="M6 2a1 1 0 0 1 1-1h6a1 1 0 0 1 .894.553l1.447 2.894A1 1 0 0 1 16 5.5V15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5.5a1 1 0 0 1 .659-.94L6 2zm1.553.553L6 5h8l-1.553-2.447A1 1 0 0 0 11.553 2H8.447a1 1 0 0 0-.894.553zM5 6v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6H5zm9 1h1a2 2 0 0 1 0 4h-1V7z" clipRule="evenodd" />
      </svg>
    );
  }
  // 데이 (D) → 태양
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-yellow-400">
      <path fillRule="evenodd" d="M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm4.243 2.757a1 1 0 0 1 0 1.414L13.07 7.343a1 1 0 1 1-1.414-1.414l1.172-1.172a1 1 0 0 1 1.414 0zM18 9a1 1 0 1 0 0 2h-1a1 1 0 1 0 0-2h1zM5.636 5.636a1 1 0 0 0-1.414 0L3.05 6.808a1 1 0 0 0 1.414 1.414l1.172-1.172a1 1 0 0 0 0-1.414zM3 10a1 1 0 0 0-1 1 1 1 0 0 0 1 1H2a1 1 0 1 0 0-2h1zM10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 5a1 1 0 0 1-1-1v-1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1zm4.95-2.464a1 1 0 0 1-1.414 0l-1.172-1.172a1 1 0 0 1 1.414-1.414l1.172 1.172a1 1 0 0 1 0 1.414zM5.05 17.536a1 1 0 0 1 0-1.414l1.172-1.172a1 1 0 0 1 1.414 1.414L6.464 17.536a1 1 0 0 1-1.414 0z" clipRule="evenodd" />
    </svg>
  );
}

// ── 배터리 SVG 아이콘 ────────────────────────────────────────
function BatteryIcon({ level }: { level: number }) {
  const color = level >= 70 ? "#22c55e" : level >= 40 ? "#eab308" : "#ef4444";
  const fill = Math.round((level / 100) * 14);
  return (
    <svg viewBox="0 0 24 12" className="h-3.5 w-5" aria-hidden>
      <rect x="0.5" y="0.5" width="19" height="11" rx="2.5" stroke={color} strokeWidth="1" fill="none" />
      <rect x="20" y="3.5" width="3" height="5" rx="1" fill={color} />
      <rect x="2" y="2" width={fill} height="8" rx="1.5" fill={color} />
    </svg>
  );
}

// ── 번아웃 SVG 아이콘 ────────────────────────────────────────
function BurnoutIcon({ level }: { level: "ok" | "warning" | "danger" }) {
  if (level === "ok") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-emerald-500">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd" />
      </svg>
    );
  }
  if (level === "warning") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-yellow-500">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-red-500">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 0 0-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 0 0-.613 3.58 2.64 2.64 0 0 1-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 0 0 5.05 6.05 6.981 6.981 0 0 0 3 11a7 7 0 1 0 11.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03z" clipRule="evenodd" />
    </svg>
  );
}

function HealthBadgeRow({ badge }: { badge: SocialHealthBadge }) {
  const hasBadge = badge.shiftType || badge.batteryLevel !== undefined || badge.burnoutLevel;
  const shiftCode = normalizeShiftCode(badge.shiftType) ?? badge.shiftType;
  if (!hasBadge) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {shiftCode ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 ring-1 ring-gray-200">
          <ShiftIcon shiftType={shiftCode} />
          {shiftCode}
        </span>
      ) : null}
      {badge.batteryLevel !== undefined ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 ring-1 ring-gray-200">
          <BatteryIcon level={badge.batteryLevel} />
          Vital {badge.batteryLevel}
        </span>
      ) : null}
      {badge.burnoutLevel ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 ring-1 ring-gray-200">
          <BurnoutIcon level={badge.burnoutLevel} />
          {badge.burnoutLevel === "ok" ? "안정" : badge.burnoutLevel === "warning" ? "주의" : "위험"}
        </span>
      ) : null}
    </div>
  );
}

function RecoveryCardRow({ card }: { card: RecoveryCardSnapshot }) {
  return (
    <div className="mt-2 overflow-hidden rounded-[14px] bg-gradient-to-r from-[#f0eeff] to-[#e8f5e9] px-3.5 py-3 ring-1 ring-[#c7c2f7]/40">
      <div className="flex items-center gap-1.5 mb-1">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[color:var(--rnest-accent)] shrink-0">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10a1 1 0 0 1 1.12-.38z" clipRule="evenodd" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--rnest-accent)]">회복 카드</span>
      </div>
      <p className="text-[13px] font-semibold text-gray-800 leading-snug">{card.headline}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[11px] text-gray-500">
        {card.batteryAvg !== null && card.batteryAvg !== undefined ? (
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 24 12" className="h-3 w-4.5" aria-hidden>
              <rect x="0.5" y="0.5" width="19" height="11" rx="2.5" stroke="#6b7280" strokeWidth="1" fill="none" />
              <rect x="20" y="3.5" width="3" height="5" rx="1" fill="#6b7280" />
              <rect x="2" y="2" width={Math.round((card.batteryAvg / 100) * 14)} height="8" rx="1.5" fill="#6b7280" />
            </svg>
            주간 평균 Vital {card.batteryAvg}
          </span>
        ) : null}
        {card.sleepDebtHours !== null && card.sleepDebtHours !== undefined ? (
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-gray-400">
              <path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.002 8.002 0 1 0 10.586 10.586z" />
            </svg>
            수면 부채 {card.sleepDebtHours.toFixed(1)}h
          </span>
        ) : null}
        <span className="text-gray-400">{card.weekDays}일 기준</span>
      </div>
    </div>
  );
}

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

function wasPostEdited(createdAt: string, updatedAt?: string | null) {
  if (!updatedAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return false;
  return updatedMs - createdMs > 1000;
}

type Props = {
  post: SocialPost;
  onCommentOpen?: (post: SocialPost) => void;
  onDelete?: (postId: number) => void;
  onEdit?: (post: SocialPost) => void;
  onAuthorFollowChange?: (authorUserId: string, isFollowing: boolean) => void;
  onTagClick?: (tag: string) => void;
  currentUserId?: string;
  isAdmin?: boolean;
  onStatsChange?: (
    postId: number,
    patch: Partial<
      Pick<
        SocialPost,
        "likeCount" | "saveCount" | "isLiked" | "isSaved" | "commentCount"
      >
    >,
  ) => void;
};

export function SocialPostCard({
  post,
  onCommentOpen,
  onDelete,
  onEdit,
  onAuthorFollowChange,
  onTagClick,
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
  const [followLoading, setFollowLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [authorFollowing, setAuthorFollowing] = useState(
    post.authorProfile.isFollowing,
  );
  // 더블탭 하트 애니메이션
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const heartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setLiked(post.isLiked);
    setLikeCount(post.likeCount);
    setSaved(post.isSaved);
    setSaveCount(post.saveCount);
    setAuthorFollowing(post.authorProfile.isFollowing);
  }, [
    post.authorProfile.isFollowing,
    post.isLiked,
    post.isSaved,
    post.likeCount,
    post.saveCount,
  ]);

  useEffect(() => {
    setExpanded(false);
    setShowMenu(false);
    setActiveImageIndex(0);
    lastTapRef.current = 0;
    touchStartRef.current = null;
    touchDeltaRef.current = { x: 0, y: 0 };
  }, [post.id]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    };
  }, []);

  const isOwnPost = currentUserId === post.authorUserId;
  const canDelete = isOwnPost || isAdmin;
  const canFollowAuthor =
    Boolean(currentUserId) && !isOwnPost && Boolean(post.authorProfile.handle);
  const mediaUrls = useMemo(
    () =>
      post.imageUrls.length > 0
        ? post.imageUrls
        : post.imageUrl
          ? [post.imageUrl]
          : [],
    [post.imageUrl, post.imageUrls],
  );
  const caption = post.body.trim();
  const isLongCaption = caption.split("\n").length > 2 || caption.length > 140;
  const profileLabel =
    post.authorProfile.displayName || post.authorProfile.nickname || "익명";
  const showEditedBadge = wasPostEdited(post.createdAt, post.updatedAt);

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

  const triggerHeartAnimation = useCallback(() => {
    if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    setShowHeartAnim(true);
    heartTimerRef.current = setTimeout(() => setShowHeartAnim(false), 900);
  }, []);

  const handleImageDoubleLike = useCallback(
    (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      if (!liked) {
        void triggerLike();
      }
      triggerHeartAnimation();
    },
    [liked, triggerHeartAnimation, triggerLike],
  );

  const goToImage = useCallback(
    (index: number) => {
      if (mediaUrls.length === 0) return;
      const nextIndex =
        ((index % mediaUrls.length) + mediaUrls.length) % mediaUrls.length;
      setActiveImageIndex(nextIndex);
    },
    [mediaUrls.length],
  );

  const showPreviousImage = useCallback(() => {
    if (mediaUrls.length <= 1) return;
    setActiveImageIndex((prev) =>
      prev === 0 ? mediaUrls.length - 1 : prev - 1,
    );
  }, [mediaUrls.length]);

  const showNextImage = useCallback(() => {
    if (mediaUrls.length <= 1) return;
    setActiveImageIndex((prev) => (prev + 1) % mediaUrls.length);
  }, [mediaUrls.length]);

  useEffect(() => {
    if (typeof window === "undefined" || mediaUrls.length <= 1) return;

    const indexes = new Set([
      activeImageIndex,
      (activeImageIndex + 1) % mediaUrls.length,
      (activeImageIndex - 1 + mediaUrls.length) % mediaUrls.length,
    ]);

    indexes.forEach((index) => {
      const imageUrl = mediaUrls[index];
      if (!imageUrl) return;

      const image = new Image();
      image.src = imageUrl;
    });
  }, [activeImageIndex, mediaUrls]);

  const handleImageTouchTap = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const now = Date.now();
      const delta = now - lastTapRef.current;
      lastTapRef.current = now;

      if (delta < 300 && delta > 0) {
        handleImageDoubleLike(event);
      }
    },
    [handleImageDoubleLike],
  );

  const handleImageDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      handleImageDoubleLike(event);
    },
    [handleImageDoubleLike],
  );

  const handleMediaTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (mediaUrls.length <= 1) return;

      const touch = event.touches[0];
      if (!touch) return;

      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      touchDeltaRef.current = { x: 0, y: 0 };
    },
    [mediaUrls.length],
  );

  const handleMediaTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      const touch = event.touches[0];

      if (!start || !touch) return;

      const nextDelta = {
        x: touch.clientX - start.x,
        y: touch.clientY - start.y,
      };
      touchDeltaRef.current = nextDelta;

      if (
        Math.abs(nextDelta.x) > 12 &&
        Math.abs(nextDelta.x) > Math.abs(nextDelta.y)
      ) {
        event.preventDefault();
      }
    },
    [],
  );

  const resetTouchGesture = useCallback(() => {
    touchStartRef.current = null;
    touchDeltaRef.current = { x: 0, y: 0 };
  }, []);

  const handleMediaTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const delta = touchDeltaRef.current;
      const isHorizontalSwipe =
        mediaUrls.length > 1 &&
        Math.abs(delta.x) > 44 &&
        Math.abs(delta.x) > Math.abs(delta.y) * 1.2;

      resetTouchGesture();

      if (isHorizontalSwipe) {
        event.preventDefault();
        if (delta.x < 0) showNextImage();
        else showPreviousImage();
        return;
      }

      handleImageTouchTap(event);
    },
    [
      handleImageTouchTap,
      mediaUrls.length,
      resetTouchGesture,
      showNextImage,
      showPreviousImage,
    ],
  );

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
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
    };

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

  const handleFollow = useCallback(async () => {
    if (!post.authorProfile.handle || followLoading || isOwnPost) return;

    const previous = authorFollowing;
    setAuthorFollowing(!previous);
    setFollowLoading(true);

    try {
      const res = await fetch(
        `/api/social/profiles/${encodeURIComponent(post.authorProfile.handle)}/follow`,
        {
          method: "POST",
        },
      ).then((response) => response.json());

      if (res.ok) {
        const nextFollowing = Boolean(res.data?.isFollowing);
        setAuthorFollowing(nextFollowing);
        onAuthorFollowChange?.(post.authorUserId, nextFollowing);
      } else {
        setAuthorFollowing(previous);
      }
    } catch {
      setAuthorFollowing(previous);
    } finally {
      setFollowLoading(false);
    }
  }, [
    authorFollowing,
    followLoading,
    isOwnPost,
    onAuthorFollowChange,
    post.authorProfile.handle,
    post.authorUserId,
  ]);

  return (
    <article className="bg-white">
      {/* ── 헤더 ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* 아바타 */}
        <button
          type="button"
          onClick={goToProfile}
          className="rnest-social-avatar-ring shrink-0 rounded-full p-[2px]"
          aria-label={`${profileLabel} 프로필`}
        >
          <div className="rnest-social-avatar-shell flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#f6f4ff] text-[16px]">
            {post.authorProfile.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.authorProfile.profileImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <SocialAvatarGlyph
                emoji={post.authorProfile.avatarEmoji}
                className="h-5 w-5"
              />
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
            <div className="mt-0.5 text-[11.5px] text-gray-400">
              @{post.authorProfile.handle}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canFollowAuthor ? (
            <button
              type="button"
              onClick={() => void handleFollow()}
              disabled={followLoading}
              className={cn(
                "min-w-[74px] rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-95 disabled:opacity-60",
                authorFollowing
                  ? "border border-gray-200 bg-[#f6f4ff] text-gray-900"
                  : "bg-[color:var(--rnest-accent)] text-white",
              )}
            >
              {authorFollowing ? "팔로잉" : "팔로우"}
            </button>
          ) : null}

          {showEditedBadge ? (
            <span className="text-[11px] font-medium text-gray-400">
              수정됨
            </span>
          ) : null}

          {canDelete ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 active:opacity-60"
                aria-label="게시글 옵션"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
              {showMenu ? (
                <div className="absolute right-0 top-9 z-20 min-w-[140px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                  {isOwnPost && onEdit ? (
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); onEdit(post); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[13px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-gray-500">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      수정하기
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[13px] font-medium text-red-500 hover:bg-red-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
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
      </div>

      {/* ── 이미지 영역 (full-bleed) ──────────────────────── */}
      {mediaUrls.length > 0 ? (
        <div className="relative w-full bg-black">
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className="relative block w-full select-none"
            style={{ touchAction: mediaUrls.length > 1 ? "pan-y" : "auto" }}
            onDoubleClick={handleImageDoubleClick}
            onTouchStart={handleMediaTouchStart}
            onTouchMove={handleMediaTouchMove}
            onTouchEnd={handleMediaTouchEnd}
            onTouchCancel={resetTouchGesture}
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#111]">
              <div
                className="flex h-full w-full transition-transform duration-200 ease-out will-change-transform"
                style={{
                  transform: `translate3d(-${activeImageIndex * 100}%, 0, 0)`,
                }}
              >
                {mediaUrls.map((mediaUrl, index) => (
                  <div
                    key={`${post.id}-media-${index}`}
                    className="relative h-full w-full shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl}
                      alt="게시글 사진"
                      className="h-full w-full object-cover"
                      loading={index === activeImageIndex ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 더블탭 하트 애니메이션 */}
            {showHeartAnim ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="white"
                  className={cn(
                    "w-24 h-24 drop-shadow-xl",
                    "animate-[heartPop_0.9s_ease_forwards]",
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
              <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
                {activeImageIndex + 1}/{mediaUrls.length}
              </div>

              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1">
                {mediaUrls.map((_, index) => (
                  <button
                    key={`dot-${post.id}-${index}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      goToImage(index);
                    }}
                    className={cn(
                      "h-[5px] rounded-full transition-all duration-200",
                      index === activeImageIndex
                        ? "w-4 bg-white"
                        : "w-[5px] bg-white/50",
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
              "flex items-center gap-1.5 transition-transform active:scale-90",
              liked ? "text-rose-500" : "text-gray-900",
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
              className={cn(
                "h-[26px] w-[26px] transition-all duration-150",
                liked && "scale-110",
              )}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="min-w-[1ch] text-[14px] font-semibold tabular-nums text-gray-900">
              {formatCount(likeCount)}
            </span>
          </button>

          {/* 댓글 */}
          <button
            type="button"
            onClick={() => onCommentOpen?.(post)}
            className="flex items-center gap-1.5 text-gray-900 transition-transform active:scale-90"
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
            <span className="min-w-[1ch] text-[14px] font-semibold tabular-nums">
              {formatCount(post.commentCount)}
            </span>
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
        {caption ? (
          <div className="text-[13.5px] leading-[1.5] text-gray-900">
            <p
              className={cn(
                !expanded && isLongCaption ? "line-clamp-2" : undefined,
              )}
            >
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
          <div className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-1">
            {post.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick?.(tag)}
                className="text-[13px] font-medium text-[color:var(--rnest-accent)] transition hover:underline active:opacity-70"
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : null}

        {/* ── 건강/교대 배지 ─────────────────────────────── */}
        {post.healthBadge ? (
          <HealthBadgeRow badge={post.healthBadge} />
        ) : null}

        {/* ── 회복 카드 ──────────────────────────────────── */}
        {post.recoveryCard ? (
          <RecoveryCardRow card={post.recoveryCard} />
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
