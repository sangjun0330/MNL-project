"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SocialStory } from "@/types/social";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";

const STORY_DURATION_MS = 5000;

// 반응 버튼 (SVG 아이콘)
const REACTION_BUTTONS = [
  {
    key: "strength",
    label: "화이팅 반응",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
  },
  {
    key: "heart",
    label: "응원 반응",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    key: "moon",
    label: "수면 반응",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    key: "hug",
    label: "포옹 반응",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <circle cx="12" cy="8" r="3" />
        <path d="M12 11c-3.86 0-7 2.24-7 5v1h14v-1c0-2.76-3.14-5-7-5z" />
        <path d="M5 16c-1.5 0-2-1-2-2" />
        <path d="M19 16c1.5 0 2-1 2-2" />
      </svg>
    ),
  },
  {
    key: "spark",
    label: "멋져요 반응",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
];

// 배경색 팔레트
const BG_COLORS: Record<string, string> = {
  "#6c63ff": "bg-[#6c63ff]",
  "#ee2a7b": "bg-[#ee2a7b]",
  "#f9ce34": "bg-[#f9ce34]",
  "#4ade80": "bg-[#4ade80]",
  "#38bdf8": "bg-[#38bdf8]",
  "#1e1e2e": "bg-[#1e1e2e]",
};

type Props = {
  stories: SocialStory[];
  startIndex?: number;
  onClose: () => void;
  onStoryViewed?: (storyId: number) => void;
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (h >= 1) return `${h}시간 전`;
  if (m >= 1) return `${m}분 전`;
  return "방금";
}

export function SocialStoryViewer({ stories, startIndex = 0, onClose, onStoryViewed }: Props) {
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, Math.min(startIndex, stories.length - 1)));
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const viewedRef = useRef<Set<number>>(new Set());

  const currentStory = stories[currentIndex];

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= stories.length - 1) {
        onClose();
        return prev;
      }
      return prev + 1;
    });
    setProgress(0);
  }, [stories.length, onClose]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setProgress(0);
  }, []);

  // 진행 타이머
  useEffect(() => {
    if (!currentStory) return;
    setProgress(0);

    const interval = 50;
    const step = (interval / STORY_DURATION_MS) * 100;

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step;
        if (next >= 100) {
          goToNext();
          return 100;
        }
        return next;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, currentStory, goToNext]);

  // 스토리 조회 기록
  useEffect(() => {
    if (!currentStory || viewedRef.current.has(currentStory.id)) return;
    viewedRef.current.add(currentStory.id);
    fetch(`/api/social/stories/${currentStory.id}/view`, { method: "POST" }).catch(() => {});
    onStoryViewed?.(currentStory.id);
  }, [currentStory, onStoryViewed]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    if (startX === null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    touchStartXRef.current = null;

    if (Math.abs(delta) > 50) {
      if (delta < 0) goToNext(); else goToPrev();
    }
  }, [goToNext, goToPrev]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) goToPrev(); else goToNext();
  }, [goToNext, goToPrev]);

  if (!currentStory) return null;

  const bg = currentStory.bgColor && BG_COLORS[currentStory.bgColor]
    ? BG_COLORS[currentStory.bgColor]
    : "bg-[#1e1e2e]";

  const textColor = currentStory.textColor ?? "#ffffff";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ touchAction: "none" }}
    >
      {/* 배경 */}
      <div className={`absolute inset-0 ${bg}`} />

      {/* 이미지 배경 */}
      {currentStory.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentStory.mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {/* 어두운 오버레이 */}
      <div className="absolute inset-0 bg-black/20" />

      {/* 진행 바 */}
      <div className="relative z-10 flex gap-1 px-3 pt-[calc(12px+env(safe-area-inset-top))]">
        {stories.map((_, idx) => (
          <div key={idx} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-white transition-none"
              style={{
                width: idx < currentIndex ? "100%" : idx === currentIndex ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      {/* 헤더: 아바타 + 이름 + 닫기 */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-3 pb-2">
        <div className="h-9 w-9 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0">
          {currentStory.authorProfile.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentStory.authorProfile.profileImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <SocialAvatarGlyph emoji={currentStory.authorProfile.avatarEmoji} className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white leading-none truncate">
            {currentStory.authorProfile.displayName || currentStory.authorProfile.nickname}
          </p>
          <p className="text-[11px] text-white/60 mt-0.5">
            {formatRelativeTime(currentStory.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="스토리 닫기"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* 스토리 콘텐츠 — 탭 영역 */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-center"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* 텍스트 카드 / 회복 카드 */}
        {currentStory.contentType === "text" && currentStory.text ? (
          <div className="px-8 text-center">
            <p
              className="text-[22px] font-bold leading-snug whitespace-pre-wrap drop-shadow-md"
              style={{ color: textColor }}
            >
              {currentStory.text}
            </p>
          </div>
        ) : null}

        {currentStory.contentType === "recovery" && currentStory.recoverySnapshot ? (
          <div className="mx-6 overflow-hidden rounded-[20px] bg-white/10 backdrop-blur-sm px-5 py-5 text-white">
            <div className="flex items-center gap-2 mb-3">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-yellow-300">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10a1 1 0 0 1 1.12-.38z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">회복 카드</span>
            </div>
            <p className="text-[18px] font-bold leading-snug mb-3">
              {currentStory.recoverySnapshot.headline}
            </p>
            <div className="flex gap-4 text-[12px] text-white/70">
              {currentStory.recoverySnapshot.batteryAvg !== null && currentStory.recoverySnapshot.batteryAvg !== undefined ? (
                <span>배터리 {currentStory.recoverySnapshot.batteryAvg}%</span>
              ) : null}
              {currentStory.recoverySnapshot.sleepDebtHours !== null && currentStory.recoverySnapshot.sleepDebtHours !== undefined ? (
                <span>수면부채 {currentStory.recoverySnapshot.sleepDebtHours.toFixed(1)}h</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* 하단 반응 버튼 행 (SVG 아이콘) */}
      <div className="relative z-10 flex items-center justify-center gap-4 px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
        {REACTION_BUTTONS.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-125"
            aria-label={label}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  );
}
