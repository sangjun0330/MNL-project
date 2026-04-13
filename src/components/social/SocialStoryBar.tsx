"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SocialStory } from "@/types/social";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import { cn } from "@/lib/cn";

// ── 스토리 추가 버튼 (내 스토리) ────────────────────────────
function MyStoryAdd({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 shrink-0"
      aria-label="스토리 만들기"
    >
      <div className="relative">
        <div className="h-[62px] w-[62px] rounded-full bg-gray-100 flex items-center justify-center ring-2 ring-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6 text-gray-400">
            <circle cx="12" cy="8" r="4" />
            <path d="M20 21a8 8 0 1 0-16 0" />
          </svg>
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-[color:var(--rnest-accent)] flex items-center justify-center ring-2 ring-white">
          <svg viewBox="0 0 12 12" fill="white" className="h-2.5 w-2.5">
            <path d="M6 2v8M2 6h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <span className="text-[10.5px] text-gray-500 font-medium leading-none w-[62px] text-center truncate">
        내 스토리
      </span>
    </button>
  );
}

// ── 스토리 아바타 링 (Instagram-clone 스타일 그라디언트 링) ─
function StoryRing({
  story,
  onClick,
}: {
  story: SocialStory;
  onClick: () => void;
}) {
  const label = story.authorProfile.displayName || story.authorProfile.nickname || "사용자";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 shrink-0"
      aria-label={`${label}의 스토리`}
    >
      {/* 그라디언트 링 (미시청: 컬러, 시청: 회색) */}
      <div
        className={cn(
          "h-[66px] w-[66px] rounded-full p-[2.5px]",
          story.isViewed
            ? "bg-gray-200"
            : "bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]",
        )}
      >
        <div className="h-full w-full rounded-full bg-white p-[2px]">
          <div className="h-full w-full rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
            {story.authorProfile.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={story.authorProfile.profileImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <SocialAvatarGlyph
                emoji={story.authorProfile.avatarEmoji}
                className="h-7 w-7"
              />
            )}
          </div>
        </div>
      </div>
      <span className="text-[10.5px] text-gray-700 font-medium leading-none w-[66px] text-center truncate">
        {label}
      </span>
    </button>
  );
}

type Props = {
  onOpenComposer: () => void;
  onOpenViewer: (stories: SocialStory[], startIndex: number) => void;
};

// 작성자별로 스토리 그룹화
function groupStoriesByAuthor(stories: SocialStory[]): Array<{ authorUserId: string; stories: SocialStory[] }> {
  const map = new Map<string, SocialStory[]>();
  for (const s of stories) {
    const existing = map.get(s.authorUserId) ?? [];
    existing.push(s);
    map.set(s.authorUserId, existing);
  }
  return Array.from(map.entries()).map(([authorUserId, authorStories]) => ({ authorUserId, stories: authorStories }));
}

export function SocialStoryBar({ onOpenComposer, onOpenViewer }: Props) {
  const [stories, setStories] = useState<SocialStory[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const loadStories = useCallback(async () => {
    try {
      const res = await fetch("/api/social/stories", { cache: "no-store" }).then((r) => r.json());
      if (res.ok) {
        setStories(res.data?.stories ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadStories();
  }, [loadStories]);

  const groups = groupStoriesByAuthor(stories);

  if (!loading && stories.length === 0) {
    // 스토리 없을 때: 내 스토리 추가 버튼만
    return (
      <div className="flex items-center gap-3 px-3 pt-3 pb-2 overflow-x-auto scrollbar-none bg-white border-b border-gray-100">
        <MyStoryAdd onClick={onOpenComposer} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 pt-3 pb-2 overflow-x-auto scrollbar-none bg-white border-b border-gray-100">
      {/* 내 스토리 추가 */}
      <MyStoryAdd onClick={onOpenComposer} />

      {/* 로딩 스켈레톤 */}
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="h-[66px] w-[66px] rounded-full bg-gray-100 animate-pulse" />
            <div className="h-2 w-10 rounded bg-gray-100 animate-pulse" />
          </div>
        ))
      ) : (
        groups.map((group, groupIdx) => {
          const firstStory = group.stories[0]!;
          const allViewed = group.stories.every((s) => s.isViewed);
          return (
            <StoryRing
              key={group.authorUserId}
              story={{ ...firstStory, isViewed: allViewed }}
              onClick={() => onOpenViewer(stories, groupIdx * group.stories.length)}
            />
          );
        })
      )}
    </div>
  );
}
