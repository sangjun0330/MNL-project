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
import { useAuthState } from "@/lib/auth";

// 간호사 카테고리 태그 (고정)
const NURSE_CATEGORY_TAGS = [
  { label: "야간", tag: "야간" },
  { label: "회복", tag: "회복" },
  { label: "임상팁", tag: "임상팁" },
  { label: "번아웃", tag: "번아웃" },
  { label: "교대", tag: "교대" },
  { label: "데이", tag: "데이" },
  { label: "이브닝", tag: "이브닝" },
  { label: "수면", tag: "수면" },
];

type TrendingTag = { tag: string; count: number };

type Props = {
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  defaultVisibility?: SocialPostVisibility;
  query?: string;
  tag?: string;
  isAdmin?: boolean;
  onTagChange?: (tag: string) => void;
};

// ── 프로필 카드 (검색 결과) ──────────────────────────────────
function ExploreProfileCard({ profile }: { profile: SocialFollowSummary }) {
  const router = useRouter();
  const bio = profile.bio.trim();

  return (
    <button
      type="button"
      onClick={() =>
        profile.handle && router.push(`/social/profile/${profile.handle}`)
      }
      className="w-full bg-white px-4 py-3 text-left border-b border-gray-100 last:border-b-0 transition active:bg-gray-50"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-xl bg-gray-100 shrink-0">
          {profile.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profileImageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <SocialAvatarGlyph
              emoji={profile.avatarEmoji}
              className="h-6 w-6"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-[14px] font-semibold text-gray-900">
              {profile.displayName}
            </span>
            {profile.handle ? (
              <span className="shrink-0 text-[12px] text-gray-400">
                @{profile.handle}
              </span>
            ) : null}
          </div>
          {bio ? (
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-gray-400">
              {bio}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ── 그리드 썸네일 셀 ─────────────────────────────────────────
function GridThumbnail({
  post,
  onClick,
}: {
  post: SocialPost;
  onClick: () => void;
}) {
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
          <svg
            viewBox="0 0 24 24"
            fill="white"
            className="w-[14px] h-[14px] drop-shadow"
          >
            <rect x="5" y="2" width="14" height="16" rx="2" opacity="0.9" />
            <rect
              x="2"
              y="5"
              width="14"
              height="16"
              rx="2"
              stroke="white"
              strokeWidth="1.5"
              fill="rgba(0,0,0,0.35)"
            />
          </svg>
        </div>
      ) : null}

      {/* 좋아요 수 오버레이 */}
      {post.likeCount > 0 ? (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3 drop-shadow">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className="text-[11px] font-medium text-white">
            {post.likeCount}
          </span>
        </div>
      ) : null}

      {/* 건강 배지 인디케이터 */}
      {post.healthBadge || post.recoveryCard ? (
        <div className="absolute top-1.5 left-1.5">
          <div className="w-2 h-2 rounded-full bg-[color:var(--rnest-accent)]" />
        </div>
      ) : null}
    </button>
  );
}

// ── 트렌딩 태그 칩 ──────────────────────────────────────────
function TrendingTagChip({
  tag,
  count,
  active,
  onClick,
}: {
  tag: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition active:scale-95 ${
        active
          ? "bg-[color:var(--rnest-accent)] text-white shadow-[0_2px_8px_rgba(107,99,255,0.35)]"
          : "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-[color:var(--rnest-accent)]/40"
      }`}
    >
      <span>#{tag}</span>
      {count !== undefined && count > 0 ? (
        <span className={`text-[10px] font-medium ${active ? "text-white/70" : "text-gray-400"}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function SocialExploreTab({ query = "", tag = "", isAdmin = false, onTagChange }: Props) {
  const router = useRouter();
  const { user } = useAuthState();
  const currentUserId = user?.userId;

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<SocialFollowSummary[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [commentPost, setCommentPost] = useState<SocialPost | null>(null);
  const [trendingTags, setTrendingTags] = useState<TrendingTag[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  const activeTag = tag.trim();
  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const isSearching = trimmedQuery.length > 0 || activeTag.length > 0;

  // 트렌딩 태그 로드 (한번만)
  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);
    fetch("/api/social/search?trending=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res.ok) {
          setTrendingTags(res.data?.trending ?? []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTrendingLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 게시글 검색 (query + tag 변경 시)
  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(
      async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams();
          if (trimmedQuery) params.set("q", trimmedQuery);
          if (activeTag) params.set("tag", activeTag);
          const res = await fetch(
            `/api/social/search${params.toString() ? `?${params.toString()}` : ""}`,
            { cache: "no-store" },
          ).then((r) => r.json());
          if (!cancelled && res.ok) {
            setProfiles(res.data?.profiles ?? []);
            setPosts(res.data?.posts ?? []);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      trimmedQuery ? 220 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [trimmedQuery, activeTag]);

  const handleAuthorFollowChange = useCallback(
    (authorUserId: string, isFollowing: boolean) => {
      setPosts((prev) =>
        prev.map((post) =>
          post.authorUserId === authorUserId
            ? { ...post, authorProfile: { ...post.authorProfile, isFollowing } }
            : post,
        ),
      );
    },
    [],
  );

  const handleTagClick = useCallback((t: string) => {
    onTagChange?.(t === activeTag ? "" : t);
  }, [activeTag, onTagChange]);

  return (
    <div className="relative pb-[calc(96px+env(safe-area-inset-bottom))]">
      {/* ── 트렌딩 태그 + 카테고리 필터 ─────────────────────── */}
      {!trimmedQuery ? (
        <div className="px-4 pt-3 pb-2">
          {/* 트렌딩 태그 (socialens 스타일 — 게시 수 포함) */}
          {!trendingLoading && trendingTags.length > 0 ? (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-rose-500">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 0 0-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 0 0-.613 3.58 2.64 2.64 0 0 1-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 0 0 5.05 6.05 6.981 6.981 0 0 0 3 11a7 7 0 1 0 11.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03z" clipRule="evenodd" />
                </svg>
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">트렌딩 태그</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {trendingTags.map(({ tag: t, count }) => (
                  <TrendingTagChip
                    key={t}
                    tag={t}
                    count={count}
                    active={activeTag === t}
                    onClick={() => handleTagClick(t)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* 간호 카테고리 필터 */}
          <div className="flex items-center gap-1.5 mb-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[color:var(--rnest-accent)]">
              <path fillRule="evenodd" d="M3 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-.293.707L13 10.414V15a1 1 0 0 1-.553.894l-4 2A1 1 0 0 1 7 17v-6.586L3.293 6.707A1 1 0 0 1 3 6V3z" clipRule="evenodd" />
            </svg>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">카테고리</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {NURSE_CATEGORY_TAGS.map(({ label, tag: t }) => (
              <TrendingTagChip
                key={t}
                tag={label}
                active={activeTag === t}
                onClick={() => handleTagClick(t)}
              />
            ))}
          </div>

          {/* 활성 태그 표시 */}
          {activeTag ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[12.5px] text-gray-500">
                <span className="font-semibold text-[color:var(--rnest-accent)]">#{activeTag}</span> 태그 게시글
              </span>
              <button
                type="button"
                onClick={() => onTagChange?.("")}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                aria-label="태그 필터 제거"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

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
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7 text-gray-400">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-gray-700 mb-1">
                  {activeTag ? `#${activeTag} 게시글이 없어요` : "검색 결과가 없어요"}
                </p>
                <p className="text-[12.5px] text-gray-400">
                  다른 태그나 키워드로 검색해 보세요
                </p>
              </div>
            ) : (
              <div>
                {activeTag ? (
                  <div className="grid grid-cols-3 gap-[1px] bg-gray-200">
                    {posts.map((post) => (
                      <GridThumbnail
                        key={post.id}
                        post={post}
                        onClick={() => router.push(`/social/posts/${post.id}`)}
                      />
                    ))}
                  </div>
                ) : (
                  posts.map((post) => (
                    <SocialPostCard
                      key={post.id}
                      post={post}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      onCommentOpen={setCommentPost}
                      onAuthorFollowChange={handleAuthorFollowChange}
                      onTagClick={(t) => {
                        onTagChange?.(t);
                      }}
                      onStatsChange={(postId, patch) =>
                        setPosts((prev) =>
                          prev.map((item) =>
                            item.id === postId ? { ...item, ...patch } : item,
                          ),
                        )
                      }
                    />
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ── 기본 뷰: 3열 그리드 ──────────────────────────── */
        <div>
          {loading ? (
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
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: "var(--rnest-lavender-soft)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8 text-[color:var(--rnest-accent)]">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <p className="text-[14px] font-semibold text-gray-700 mb-1">
                허브 공개 게시글이 아직 없어요
              </p>
              <p className="text-[12.5px] text-gray-400">
                게시글을 올려서 허브에서 발견되어 보세요
              </p>
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

      <SocialPostCommentSheet
        open={Boolean(commentPost)}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onCommentCountChange={(postId, count) =>
          setPosts((prev) =>
            prev.map((item) =>
              item.id === postId ? { ...item, commentCount: count } : item,
            ),
          )
        }
      />
    </div>
  );
}
