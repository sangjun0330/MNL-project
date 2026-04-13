"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { sanitizeInternalPath } from "@/lib/navigation";
import type { FeedPage, SocialPost, SocialProfile, SocialProfileHeader } from "@/types/social";
import { SocialAvatarBadge, SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import { SocialProfileSheet } from "@/components/social/SocialProfileSheet";
import { SocialProfilePostViewer } from "@/components/social/SocialProfilePostViewer";
import { SocialFollowListSheet } from "@/components/social/SocialFollowListSheet";

type Props = {
  handle: string;
};

type ProfileTab = "posts" | "saved" | "liked";
type ProfileGridScope = "profile" | "saved" | "liked";
type ProfileGridSelection = {
  post: SocialPost;
  posts: SocialPost[];
  nextCursor: string | null;
  handle?: string | null;
  scope: ProfileGridScope;
};

function formatProfileCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function ProfileStat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="text-[17px] font-bold text-gray-900 sm:text-[18px]">
        {formatProfileCount(value)}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-gray-500 sm:text-[12px]">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-[#faf8ff] px-2.5 py-2 text-center transition active:opacity-70 sm:px-3 sm:py-2.5"
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-[#faf8ff] px-2.5 py-2 text-center sm:px-3 sm:py-2.5">
      {inner}
    </div>
  );
}

function GridTabIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`h-5 w-5 ${active ? "text-gray-900" : "text-gray-400"}`}
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function HeartTabIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${active ? "text-gray-900" : "text-gray-400"}`}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BookmarkTabIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${active ? "text-gray-900" : "text-gray-400"}`}
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function EmptyTabIcon({ scope }: { scope: ProfileGridScope }) {
  if (scope === "liked") {
    return <HeartTabIcon active />;
  }
  if (scope === "saved") {
    return <BookmarkTabIcon active />;
  }
  return <GridTabIcon active />;
}

function MultiPhotoBadge() {
  return (
    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-3.5 w-3.5"
      >
        <rect x="8" y="5" width="11" height="11" rx="1.5" />
        <path d="M5 8.5V17a2 2 0 0 0 2 2h8.5" />
      </svg>
    </span>
  );
}

function ProfilePostTile({
  post,
  onClick,
}: {
  post: SocialPost;
  onClick: () => void;
}) {
  const mediaUrls = post.imageUrls.length > 0 ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
  const coverImage = mediaUrls[0] ?? null;
  const caption = post.body.trim();

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square overflow-hidden bg-white text-left"
      aria-label={caption || "게시글 보기"}
    >
      {coverImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImage}
            alt="게시글 미리보기"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {mediaUrls.length > 1 ? <MultiPhotoBadge /> : null}
        </>
      ) : (
        <div className="flex h-full flex-col justify-between bg-gradient-to-br from-[#f9fafb] via-white to-[#eef2ff] p-3">
          <p className="line-clamp-5 text-[11px] leading-4 text-gray-700">
            {caption || "사진 없이 작성한 게시글"}
          </p>
          <div className="flex items-center justify-between text-gray-400">
            <SocialAvatarBadge
              emoji={post.authorProfile.avatarEmoji || "📝"}
              className="h-7 w-7 bg-transparent"
              iconClassName="h-5 w-5"
            />
            {post.tags.length > 0 ? (
              <span className="text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                #{post.tags[0]}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </button>
  );
}

function ProfilePostsGrid({
  scope,
  handle,
  emptyTitle,
  emptyCopy,
  onPostSelect,
}: {
  scope: ProfileGridScope;
  handle?: string | null;
  emptyTitle: string;
  emptyCopy: string;
  onPostSelect: (selection: ProfileGridSelection) => void;
}) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadPosts = useCallback(
    async (cursor?: string | null) => {
      const isInitial = !cursor;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams();
        params.set("scope", scope);
        if (scope === "profile" && handle) params.set("handle", handle);
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(`/api/social/feed?${params.toString()}`, {
          cache: "no-store",
        }).then((response) => response.json());

        if (res.ok) {
          const data = res.data as FeedPage;
          if (isInitial) {
            setPosts(data.posts);
          } else {
            setPosts((prev) => {
              const existing = new Set(prev.map((post) => post.id));
              const next = data.posts.filter((post) => !existing.has(post.id));
              return [...prev, ...next];
            });
          }
          setNextCursor(data.nextCursor);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setHasLoaded(true);
      }
    },
    [handle, scope]
  );

  useEffect(() => {
    setPosts([]);
    setNextCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setHasLoaded(false);
  }, [handle, scope]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await loadPosts();
    };

    if (!cancelled) {
      void run();
    }

    return () => {
      cancelled = true;
    };
  }, [loadPosts]);

  if (loading && !hasLoaded) {
    return (
      <div className="border-y border-gray-200 bg-gray-200">
        <div className="grid grid-cols-3 gap-[1px]">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={`${scope}-grid-skeleton-${index}`}
              className="aspect-square animate-pulse bg-gray-100"
            />
          ))}
        </div>
      </div>
    );
  }

  if (hasLoaded && posts.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 text-gray-700">
          <EmptyTabIcon scope={scope} />
        </div>
        <p className="mt-4 text-[14px] font-semibold text-gray-900">{emptyTitle}</p>
        <p className="mt-1 text-[13px] leading-6 text-gray-500">{emptyCopy}</p>
      </div>
    );
  }

  return (
    <>
      <div className="border-y border-gray-200 bg-gray-200">
        <div className="grid grid-cols-3 gap-[1px]">
          {posts.map((post) => (
            <ProfilePostTile
              key={post.id}
              post={post}
              onClick={() =>
                onPostSelect({
                  post,
                  posts: [...posts],
                  nextCursor,
                  handle,
                  scope,
                })
              }
            />
          ))}
        </div>
      </div>
      {nextCursor ? (
        <div className="px-4 py-4">
          <button
            type="button"
            onClick={() => void loadPosts(nextCursor)}
            disabled={loadingMore}
            className="w-full rounded-xl bg-gray-100 px-4 py-3 text-[13px] font-semibold text-gray-700 transition active:opacity-60 disabled:opacity-40"
          >
            {loadingMore ? "불러오는 중..." : "게시글 더 보기"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function SocialProfilePage({ handle }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const returnTo = useMemo(
    () => sanitizeInternalPath(searchParams.get("returnTo"), "/social"),
    [searchParams]
  );

  const [profile, setProfile] = useState<SocialProfileHeader | null>(null);
  const [ownProfile, setOwnProfile] = useState<SocialProfile | null>(null);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openProfileEditor, setOpenProfileEditor] = useState(false);
  const [followListType, setFollowListType] = useState<"followers" | "following" | null>(null);
  const [actionLoading, setActionLoading] = useState<"follow" | "friend" | null>(null);
  const [selectedPost, setSelectedPost] = useState<{
    post: SocialPost;
    initialPosts?: SocialPost[];
    initialNextCursor?: string | null;
    fallbackHandle?: string | null;
  } | null>(null);


  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, ownProfileRes] = await Promise.all([
        fetch(`/api/social/profiles/${encodeURIComponent(handle)}`, {
          cache: "no-store",
        }).then((response) => response.json()),
        fetch("/api/social/profile", { cache: "no-store" }).then((response) => response.json()),
      ]);

      if (!profileRes.ok) {
        throw new Error(
          profileRes.error === "not_found"
            ? "프로필을 찾을 수 없어요."
            : "프로필을 불러오지 못했어요."
        );
      }

      setProfile(profileRes.data?.profile ?? null);
      setOwnProfile(ownProfileRes.ok ? ownProfileRes.data ?? null : null);
    } catch (loadError: any) {
      setError(String(loadError?.message ?? "프로필을 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void loadProfile();
  }, [loadProfile, status]);

  useEffect(() => {
    setSelectedPost(null);
  }, [handle]);

  const handlePostSelect = useCallback((selection: ProfileGridSelection) => {
    const isProfileScope = selection.scope === "profile";
    setSelectedPost({
      post: selection.post,
      initialPosts: isProfileScope ? selection.posts : undefined,
      initialNextCursor: isProfileScope ? selection.nextCursor : undefined,
      fallbackHandle: isProfileScope ? selection.handle ?? selection.post.authorProfile.handle : null,
    });
  }, []);

  const isSelf = profile?.relationship.isSelf ?? false;
  const isLocked = profile?.isProfileLocked ?? false;
  const canOpenFollowLists = isSelf || !isLocked;
  const headerLabel = profile?.handle ? `@${profile.handle}` : `@${handle}`;
  const visibleTab: ProfileTab = isSelf ? tab : "posts";
  const activeProfileHandle = profile?.handle ?? handle;

  useEffect(() => {
    if (!isSelf && tab !== "posts") {
      setTab("posts");
    }
  }, [isSelf, tab]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(returnTo || "/social");
  }, [returnTo, router]);

  const handleFollow = useCallback(async () => {
    if (!profile?.handle || actionLoading) return;
    setActionLoading("follow");
    setNotice(null);
    try {
      const res = await fetch(`/api/social/profiles/${encodeURIComponent(profile.handle)}/follow`, {
        method: "POST",
      }).then((response) => response.json());
      if (!res.ok) throw new Error("팔로우 상태를 변경하지 못했어요.");
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              followerCount: res.data.followerCount,
              relationship: {
                ...prev.relationship,
                isFollowing: res.data.isFollowing,
                isFollowedByViewer: res.data.isFollowing,
              },
            }
          : prev
      );
    } catch (followError: any) {
      setNotice(String(followError?.message ?? "팔로우 상태를 변경하지 못했어요."));
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, profile?.handle]);

  const handleFriendRequest = useCallback(async () => {
    if (!profile?.handle || actionLoading) return;
    setActionLoading("friend");
    setNotice(null);
    try {
      const res = await fetch(
        `/api/social/profiles/${encodeURIComponent(profile.handle)}/friend-request`,
        {
          method: "POST",
        }
      ).then((response) => response.json());
      if (!res.ok) {
        if (res.error === "already_connected") throw new Error("이미 친구 연결이 되어 있어요.");
        if (res.error === "request_already_pending") {
          throw new Error("친구 요청이 이미 진행 중이에요.");
        }
        if (res.error === "invites_disabled") {
          throw new Error("이 사용자는 친구 요청을 받지 않도록 설정했어요.");
        }
        throw new Error("친구 요청을 보내지 못했어요.");
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              relationship: {
                ...prev.relationship,
                hasOutgoingFriendRequest: true,
              },
            }
          : prev
      );
      setNotice("친구 요청을 보냈어요.");
    } catch (friendError: any) {
      setNotice(String(friendError?.message ?? "친구 요청을 보내지 못했어요."));
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, profile?.handle]);

  const handleShare = useCallback(async () => {
    if (!profile?.handle) return;
    const url = `${window.location.origin}/social/profile/${profile.handle}`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    try {
      if (typeof nav.share === "function") {
        await nav.share({ title: `${profile.displayName}님의 프로필`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("프로필 링크를 복사했어요.");
      }
    } catch {}
  }, [profile?.displayName, profile?.handle]);


  const friendButtonLabel = profile?.relationship.isFriend
    ? "친구"
    : profile?.relationship.hasOutgoingFriendRequest
      ? "요청 보냄"
      : profile?.relationship.hasIncomingFriendRequest
        ? "요청 받음"
        : "친구 요청";
  const friendButtonDisabled =
    actionLoading === "friend" ||
    Boolean(
      profile?.relationship.isFriend ||
        profile?.relationship.hasOutgoingFriendRequest ||
        profile?.relationship.hasIncomingFriendRequest
    );
  const profileBio = profile?.bio.trim() ?? "";
  const profileDisplayLabel = profile
    ? (profile.displayName || profile.nickname).trim()
    : "";

  const tabConfig = useMemo(() => {
    if (visibleTab === "liked") {
      return {
        scope: "liked" as const,
        emptyTitle: "좋아요한 게시글이 없어요",
        emptyCopy: "좋아요를 누른 게시글이 생기면 여기에서 같은 그리드로 모아볼 수 있어요.",
      };
    }

    if (visibleTab === "saved") {
      return {
        scope: "saved" as const,
        emptyTitle: "저장한 게시글이 없어요",
        emptyCopy: "다시 보고 싶은 글을 저장하면 여기에서 바로 모아볼 수 있어요.",
      };
    }

    return {
      scope: "profile" as const,
      emptyTitle: isLocked ? "볼 수 있는 게시글이 아직 없어요" : "아직 게시글이 없어요",
      emptyCopy: isSelf
        ? "첫 게시글을 올리면 프로필 그리드가 채워져요."
        : isLocked
          ? "비공개 계정이에요. 허브 공개 게시글이나 권한이 있는 게시글만 여기에 표시돼요."
          : "이 사용자의 게시글이 올라오면 여기에 표시돼요.",
    };
  }, [isLocked, isSelf, visibleTab]);

  if (status !== "authenticated") {
    return (
      <div className="w-full overflow-x-hidden bg-white pb-[calc(104px+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] backdrop-blur">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 active:opacity-60"
            aria-label="뒤로"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="truncate px-4 text-[16px] font-bold text-gray-900">{headerLabel}</h1>
          <div className="h-9 w-9" />
        </div>
        <div className="px-4 py-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <p className="text-[14px] text-gray-500">로그인 후 프로필을 볼 수 있어요.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-x-hidden bg-white pb-[calc(104px+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] backdrop-blur">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
            aria-label="뒤로"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="truncate px-4 text-[16px] font-bold text-gray-900">{headerLabel}</h1>
          {isSelf ? (
            <button
              type="button"
              onClick={() => setOpenProfileEditor(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
              aria-label="설정"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleShare()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
              aria-label="공유하기"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          )}
        </div>

        {notice ? (
          <div className="px-4 pt-4">
            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-700">
              {notice}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="px-4 py-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <p className="text-[13px] text-gray-500">프로필을 불러오는 중...</p>
            </div>
          </div>
        ) : error || !profile ? (
          <div className="px-4 py-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-5">
              <p className="text-[13px] text-red-500">{error ?? "프로필을 찾을 수 없어요."}</p>
            </div>
          </div>
        ) : (
          <>
            <section className="px-4 py-5 sm:py-6">
              <div className="grid grid-cols-[98px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[118px_minmax(0,1fr)] sm:gap-6">
                <div className="shrink-0">
                  <div className="rnest-social-avatar-ring inline-flex rounded-full p-[3px]">
                    <div className="rnest-social-avatar-shell inline-flex rounded-full p-[4px]">
                      <div className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full bg-[#f6f4ff] text-[30px] sm:h-[104px] sm:w-[104px] sm:text-[36px]">
                        {profile.profileImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.profileImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <SocialAvatarGlyph emoji={profile.avatarEmoji} className="h-14 w-14 sm:h-[68px] sm:w-[68px]" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 pl-1 sm:pl-2">
                  {profileDisplayLabel ? (
                    <div className="mb-2 flex items-center gap-2 pl-1 sm:mb-3 sm:pl-2">
                      <p className="truncate text-[15px] font-semibold leading-tight text-gray-900 sm:text-[16px]">
                        {profileDisplayLabel}
                      </p>
                      {profile.accountVisibility === "private" ? (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">
                          비공개
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <ProfileStat label="포스트" value={profile.postCount} />
                    <ProfileStat
                      label="팔로워"
                      value={profile.followerCount}
                      onClick={
                        canOpenFollowLists
                          ? () => setFollowListType("followers")
                          : undefined
                      }
                    />
                    <ProfileStat
                      label="팔로잉"
                      value={profile.followingCount}
                      onClick={
                        canOpenFollowLists
                          ? () => setFollowListType("following")
                          : undefined
                      }
                    />
                  </div>
                </div>
              </div>

              {isLocked ? (
                <div className="mt-4 rounded-2xl border border-gray-100 bg-[#faf8ff] px-4 py-3">
                  <p className="text-[13px] font-semibold text-gray-900">비공개 계정</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-gray-500">
                    친구나 같은 그룹 멤버가 아니면 프로필 정보는 제한돼요. 허브 공개 게시글이나 접근 권한이 있는 게시글만 볼 수 있어요.
                  </p>
                </div>
              ) : null}

              {profileBio ? (
                <div className="mt-4 min-w-0">
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-gray-700">
                    {profileBio}
                  </p>
                </div>
              ) : null}

              {!isSelf ? (
                <div className="mt-5 grid grid-cols-2 gap-2 sm:max-w-[420px]">
                  <button
                    type="button"
                    onClick={handleFollow}
                    disabled={actionLoading === "follow"}
                    className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold transition ${
                      profile.relationship.isFollowing
                        ? "border border-gray-200 bg-[#f6f4ff] text-gray-900"
                        : "bg-[color:var(--rnest-accent)] text-white shadow-[0_12px_28px_rgba(123,111,208,0.22)]"
                    }`}
                  >
                    {profile.relationship.isFollowing ? "팔로잉" : "팔로우"}
                  </button>
                  <button
                    type="button"
                    onClick={handleFriendRequest}
                    disabled={friendButtonDisabled}
                    className="rounded-xl border border-gray-200 bg-[#f6f4ff] px-4 py-2.5 text-[13px] font-semibold text-gray-900 disabled:opacity-50"
                  >
                    {friendButtonLabel}
                  </button>
                </div>
              ) : null}
            </section>

            <div className="flex border-y border-gray-200">
              {(
                [
                  { id: "posts", icon: GridTabIcon },
                  { id: "liked", icon: HeartTabIcon },
                  { id: "saved", icon: BookmarkTabIcon },
                ] as const
              )
                .filter((item) => isSelf || item.id === "posts")
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`relative flex flex-1 items-center justify-center py-3 transition ${
                        visibleTab === item.id ? "text-gray-900" : "text-gray-400"
                      }`}
                      aria-label={item.id}
                    >
                      <Icon active={visibleTab === item.id} />
                      {visibleTab === item.id ? (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gray-900" />
                      ) : null}
                    </button>
                  );
                })}
            </div>

            <ProfilePostsGrid
              key={`${activeProfileHandle}:${visibleTab}`}
              scope={tabConfig.scope}
              handle={tabConfig.scope === "profile" ? activeProfileHandle : null}
              emptyTitle={tabConfig.emptyTitle}
              emptyCopy={tabConfig.emptyCopy}
              onPostSelect={handlePostSelect}
            />
          </>
        )}

        <SocialFollowListSheet
          open={followListType !== null}
          onClose={() => setFollowListType(null)}
          handle={activeProfileHandle}
          type={followListType ?? "followers"}
        />

        <SocialProfileSheet
          open={openProfileEditor}
          onClose={() => setOpenProfileEditor(false)}
          profile={ownProfile}
          onSaved={(nextProfile) => {
            setOwnProfile(nextProfile);
            if (nextProfile.handle && nextProfile.handle !== handle) {
              router.replace(`/social/profile/${nextProfile.handle}`);
              return;
            }
            void loadProfile();
          }}
        />
      </div>

      <SocialProfilePostViewer
        open={Boolean(selectedPost)}
        post={selectedPost?.post ?? null}
        initialPosts={selectedPost?.initialPosts}
        initialNextCursor={selectedPost?.initialNextCursor}
        fallbackHandle={selectedPost?.fallbackHandle ?? (visibleTab === "posts" ? activeProfileHandle : null)}
        currentUserId={user?.userId}
        onClose={() => setSelectedPost(null)}
      />
    </>
  );
}
