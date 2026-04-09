"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  SocialFollowSummary,
  SocialGroupSummary,
  SocialPost,
  SocialPostVisibility,
} from "@/types/social";
import { SocialPostCard } from "@/components/social/SocialPostCard";
import { SocialPostCommentSheet } from "@/components/social/SocialPostCommentSheet";
import { SocialPostComposer } from "@/components/social/SocialPostComposer";
import { useAuthState } from "@/lib/auth";

type Props = {
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  defaultVisibility?: SocialPostVisibility;
};

function ExploreProfileCard({ profile }: { profile: SocialFollowSummary }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => profile.handle && router.push(`/social/profile/${profile.handle}`)}
      className="w-full rounded-2xl bg-white px-4 py-3 shadow-sm text-left"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-xl"
          style={{ backgroundColor: "var(--rnest-lavender-soft)" }}
        >
          {profile.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profileImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            profile.avatarEmoji
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-[14px] font-semibold text-[var(--rnest-text)]">
              {profile.displayName}
            </span>
            {profile.handle ? (
              <span className="shrink-0 text-[12px] text-[var(--rnest-muted)]">@{profile.handle}</span>
            ) : null}
          </div>
          {profile.bio ? (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-[var(--rnest-muted)]">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-1 text-[12.5px] text-[var(--rnest-muted)]">{profile.statusMessage || "RNest 소셜 프로필"}</p>
          )}
        </div>
      </div>
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

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/social/search${trimmedQuery ? `?q=${encodeURIComponent(trimmedQuery)}` : ""}`, {
          cache: "no-store",
        }).then((response) => response.json());
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
    <div className="relative px-4 pt-3 pb-24">
      <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 text-[var(--rnest-muted)]"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="사용자나 게시글 검색"
            className="w-full bg-transparent text-[14px] text-[var(--rnest-text)] outline-none placeholder:text-[var(--rnest-muted)]"
          />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {profiles.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[var(--rnest-muted)]">
                {trimmedQuery ? "사용자 결과" : "추천 프로필"}
              </h3>
            </div>
            {profiles.map((profile) => (
              <ExploreProfileCard key={`${profile.userId}:${profile.handle ?? "no-handle"}`} profile={profile} />
            ))}
          </section>
        ) : null}

        <section className="space-y-2.5">
          <h3 className="text-[13px] font-semibold text-[var(--rnest-muted)]">
            {trimmedQuery ? "게시글 결과" : "허브 공개 게시글"}
          </h3>
          {loading ? (
            <div className="rounded-2xl bg-white px-4 py-8 text-center text-[13px] text-[var(--rnest-muted)] shadow-sm">
              불러오는 중...
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-8 text-center text-[13px] text-[var(--rnest-muted)] shadow-sm">
              {trimmedQuery ? "검색 결과가 없어요." : "허브 공개 게시글이 아직 없어요."}
            </div>
          ) : (
            posts.map((post) => (
              <SocialPostCard
                key={post.id}
                post={post}
                currentUserId={currentUserId}
                onCommentOpen={setCommentPost}
                onStatsChange={(postId, patch) =>
                  setPosts((prev) => prev.map((item) => (item.id === postId ? { ...item, ...patch } : item)))
                }
              />
            ))
          )}
        </section>
      </div>

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
        onPosted={(post) => {
          setPosts((prev) => [post, ...prev]);
          setComposerOpen(false);
          router.refresh();
        }}
        userGroups={userGroups}
        defaultVisibility={defaultVisibility}
      />

      <SocialPostCommentSheet
        open={Boolean(commentPost)}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        currentUserId={currentUserId}
        onCommentCountChange={(postId, count) =>
          setPosts((prev) => prev.map((item) => (item.id === postId ? { ...item, commentCount: count } : item)))
        }
      />
    </div>
  );
}
