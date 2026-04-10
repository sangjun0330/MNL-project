"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  SocialFollowSummary,
  SocialGroupSummary,
  SocialPost,
  SocialPostVisibility,
} from "@/types/social";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import { SocialPostCard } from "@/components/social/SocialPostCard";
import { SocialPostCommentSheet } from "@/components/social/SocialPostCommentSheet";
import { SocialPostComposer } from "@/components/social/SocialPostComposer";
import { useAuthState } from "@/lib/auth";

type Props = {
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  defaultVisibility?: SocialPostVisibility;
};

// ── 프로필 카드 (검색 결과) ──────────────────────────────────
function ExploreProfileCard({ profile }: { profile: SocialFollowSummary }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => profile.handle && router.push(`/social/profile/${profile.handle}`)}
      className="w-full bg-white px-4 py-3 text-left border-b border-gray-100 last:border-b-0 transition active:bg-gray-50"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-xl bg-gray-100 shrink-0">
          {profile.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profileImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <SocialAvatarGlyph emoji={profile.avatarEmoji} className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-[14px] font-semibold text-gray-900">
              {profile.displayName}
            </span>
            {profile.handle ? (
              <span className="shrink-0 text-[12px] text-gray-400">@{profile.handle}</span>
            ) : null}
          </div>
          {profile.bio ? (
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-gray-400">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-gray-400">
              {profile.statusMessage || "RNest 소셜 프로필"}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── 그리드 썸네일 셀 ─────────────────────────────────────────
function GridThumbnail({ post, onClick }: { post: SocialPost; onClick: () => void }) {
  const firstImage = post.imageUrls[0] ?? post.imageUrl ?? null;
  const hasMultiple = post.imageUrls.length > 1;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square overflow-hidden bg-gray-100 w-full"
      aria-label={post.body || "게시글 보기"}
    >
      {firstImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={firstImage}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2 bg-gray-50">
          <span className="text-[10px] text-gray-400 line-clamp-4 text-center leading-4">
            {post.body || "게시글"}
          </span>
        </div>
      )}

      {/* 멀티이미지 아이콘 */}
      {hasMultiple ? (
        <div className="absolute top-1.5 right-1.5">
          <svg viewBox="0 0 24 24" fill="white" className="w-[14px] h-[14px] drop-shadow">
            <rect x="5" y="2" width="14" height="16" rx="2" opacity="0.9" />
            <rect x="2" y="5" width="14" height="16" rx="2" stroke="white" strokeWidth="1.5" fill="rgba(0,0,0,0.35)" />
          </svg>
        </div>
      ) : null}

      {/* 좋아요 수 오버레이 (호버/포커스 시 나타남) */}
      {post.likeCount > 0 ? (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3 drop-shadow">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className="text-[11px] font-medium text-white">{post.likeCount}</span>
        </div>
      ) : null}
    </button>
  );
}

export function SocialExploreTab({ userGroups = [], defaultVisibility = "friends" }: Props) {
  const router = useRouter();
  const { user } = useAuthState();
  const currentUserId = user?.userId;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<SocialFollowSummary[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const isSearching = trimmedQuery.length > 0;

  const handlePosted = useCallback(
    (post: SocialPost) => {
      if (!isSearching && post.visibility === "public_internal") {
        setPosts((prev) => [post, ...prev]);
      }
      setComposerOpen(false);
    },
    [isSearching]
  );

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/social/search${trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : ""}`,
          { cache: "no-store" }
        ).then((r) => r.json());
        if (!cancelled && res.ok) {
          setProfiles(res.data?.profiles ?? []);
          setPosts(res.data?.posts ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, trimmedQuery ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedQuery]);

  return (
    <div className="relative pb-[calc(96px+env(safe-area-inset-bottom))]">
      {/* ── sticky 검색바 ─────────────────────────────────── */}
      <div className="sticky top-[104px] z-20 bg-white border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-2.5 rounded-xl bg-gray-100 px-3 py-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 text-gray-400 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사용자나 게시글 검색"
            className="social-search-input w-full bg-transparent text-gray-900 outline-none placeholder:text-gray-400 leading-none"
            style={{ fontSize: "16px" }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              className="text-gray-400 transition active:opacity-60"
              aria-label="검색어 지우기"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* ── 검색 결과 뷰 ─────────────────────────────────── */}
      {isSearching ? (
        <div>
          {/* 프로필 결과 */}
          {profiles.length > 0 ? (
            <section>
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h3 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">
                  사용자
                </h3>
              </div>
              <div>
                {profiles.map((profile) => (
                  <ExploreProfileCard
                    key={`${profile.userId}:${profile.handle ?? "no-handle"}`}
                    profile={profile}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* 게시글 결과 */}
          <section>
            {profiles.length > 0 ? (
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h3 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider">
                  게시글
                </h3>
              </div>
            ) : null}

            {loading ? (
              <div className="py-12 text-center text-[13px] text-gray-400">
                불러오는 중...
              </div>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-gray-400">
                검색 결과가 없어요.
              </div>
            ) : (
              posts.map((post) => (
                <SocialPostCard
                  key={post.id}
                  post={post}
                  currentUserId={currentUserId}
                  onCommentOpen={setCommentPost}
                  onStatsChange={(postId, patch) =>
                    setPosts((prev) =>
                      prev.map((item) => (item.id === postId ? { ...item, ...patch } : item))
                    )
                  }
                />
              ))
            )}
          </section>
        </div>
      ) : (
        /* ── 기본 뷰: 3열 그리드 ──────────────────────────── */
        <div>
          {loading ? (
            /* 그리드 스켈레톤 */
            <div className="grid grid-cols-3 gap-[1px] bg-gray-200">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-gray-100 animate-pulse"
                />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-3xl"
                style={{ backgroundColor: "var(--rnest-lavender-soft)" }}
              >
                🔍
              </div>
              <p className="text-[14px] font-semibold text-gray-700 mb-1">허브 공개 게시글이 아직 없어요</p>
              <p className="text-[12.5px] text-gray-400">게시글을 올려서 허브에서 발견되어 보세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1px] bg-gray-200">
              {posts.map((post) => (
                <GridThumbnail
                  key={post.id}
                  post={post}
                  onClick={() => router.push(`/social/posts/${post.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FAB: 게시글 작성 ─────────────────────────────── */}
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

      <SocialPostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
        userGroups={userGroups}
        defaultVisibility={defaultVisibility}
      />

      <SocialPostCommentSheet
        open={Boolean(commentPost)}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        currentUserId={currentUserId}
        onCommentCountChange={(postId, count) =>
          setPosts((prev) =>
            prev.map((item) => (item.id === postId ? { ...item, commentCount: count } : item))
          )
        }
      />
    </div>
  );
}
