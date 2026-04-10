"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { sanitizeInternalPath } from "@/lib/navigation";
import type { FeedPage, SocialPost, SocialProfile, SocialProfileHeader } from "@/types/social";
import { SocialFeedTab } from "@/components/social/SocialFeedTab";
import { SocialProfileSheet } from "@/components/social/SocialProfileSheet";

type Props = {
  handle: string;
};

type ProfileTab = "posts" | "saved" | "liked";

function GridTabIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-5 w-5 ${active ? "text-gray-900" : "text-gray-400"}`}>
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

function MultiPhotoBadge() {
  return (
    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
        <rect x="8" y="5" width="11" height="11" rx="1.5" />
        <path d="M5 8.5V17a2 2 0 0 0 2 2h8.5" />
      </svg>
    </span>
  );
}

function ProfilePostTile({ post }: { post: SocialPost }) {
  const mediaUrls = post.imageUrls.length > 0 ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [];
  const coverImage = mediaUrls[0] ?? null;
  const caption = post.body.trim();

  return (
    <div className="relative aspect-square overflow-hidden bg-white">
      {coverImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverImage} alt="게시글 미리보기" className="h-full w-full object-cover" loading="lazy" />
          {mediaUrls.length > 1 ? <MultiPhotoBadge /> : null}
        </>
      ) : (
        <div className="flex h-full flex-col justify-between bg-gradient-to-br from-[#f9fafb] via-white to-[#eef2ff] p-3">
          <p className="line-clamp-5 text-[11px] leading-4 text-gray-700">
            {caption || "사진 없이 작성한 게시글"}
          </p>
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[18px] leading-none">{post.authorProfile.avatarEmoji || "📝"}</span>
            {post.tags.length > 0 ? (
              <span className="text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                #{post.tags[0]}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfilePostsGrid({
  handle,
  emptyCopy,
}: {
  handle: string;
  emptyCopy: string;
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
        params.set("scope", "profile");
        params.set("handle", handle);
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
    [handle]
  );

  useEffect(() => {
    setPosts([]);
    setNextCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setHasLoaded(false);
  }, [handle]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  if (loading && !hasLoaded) {
    return (
      <div className="border-y border-gray-200 bg-gray-200">
        <div className="grid grid-cols-3 gap-[1px]">
          {Array.from({ length: 9 }, (_, index) => (
            <div key={`profile-grid-skeleton-${index}`} className="aspect-square animate-pulse bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (hasLoaded && posts.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 text-gray-700">
          <GridTabIcon active />
        </div>
        <p className="mt-4 text-[14px] font-semibold text-gray-900">아직 게시글이 없어요</p>
        <p className="mt-1 text-[13px] leading-6 text-gray-500">{emptyCopy}</p>
      </div>
    );
  }

  return (
    <>
      <div className="border-y border-gray-200 bg-gray-200">
        <div className="grid grid-cols-3 gap-[1px]">
          {posts.map((post) => (
            <ProfilePostTile key={post.id} post={post} />
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
  const { status } = useAuthState();
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
  const [actionLoading, setActionLoading] = useState<"follow" | "friend" | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, ownProfileRes] = await Promise.all([
        fetch(`/api/social/profiles/${encodeURIComponent(handle)}`, { cache: "no-store" }).then((response) =>
          response.json()
        ),
        fetch("/api/social/profile", { cache: "no-store" }).then((response) => response.json()),
      ]);

      if (!profileRes.ok) {
        throw new Error(
          profileRes.error === "not_found" ? "프로필을 찾을 수 없어요." : "프로필을 불러오지 못했어요."
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

  const isSelf = profile?.relationship.isSelf ?? false;
  const headerLabel = profile?.handle ? `@${profile.handle}` : `@${handle}`;
  const visibleTab: ProfileTab = isSelf ? tab : "posts";

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
      const res = await fetch(`/api/social/profiles/${encodeURIComponent(profile.handle)}/friend-request`, {
        method: "POST",
      }).then((response) => response.json());
      if (!res.ok) {
        if (res.error === "already_connected") throw new Error("이미 친구 연결이 되어 있어요.");
        if (res.error === "request_already_pending") throw new Error("친구 요청이 이미 진행 중이에요.");
        if (res.error === "invites_disabled") throw new Error("이 사용자는 친구 요청을 받지 않도록 설정했어요.");
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

  if (status !== "authenticated") {
    return (
      <div className="-mx-4 pb-8">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 active:opacity-60"
            aria-label="뒤로"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="truncate text-[16px] font-bold text-gray-900">{headerLabel}</h1>
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
    <div className="-mx-4 pb-8">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
          aria-label="뒤로"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="truncate px-4 text-[16px] font-bold text-gray-900">{headerLabel}</h1>
        <button
          type="button"
          onClick={handleShare}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
          aria-label="프로필 더보기"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
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
          <section className="px-4 py-6">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#FA7E1E] to-[#D62976] p-[3px]">
                <div className="rounded-full bg-white p-[3px]">
                  <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full bg-gray-100 text-[34px]">
                    {profile.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.profileImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      profile.avatarEmoji
                    )}
                  </div>
                </div>
              </div>
              <h2 className="mt-4 text-[18px] font-bold text-gray-900">{profile.displayName}</h2>
              <p className="mt-2 max-w-[360px] whitespace-pre-wrap text-[14px] leading-6 text-gray-700">
                {profile.bio || profile.statusMessage || "RNest 소셜 프로필"}
              </p>
            </div>
          </section>

          <div className="flex justify-around border-y border-gray-100 py-3">
            {[
              { label: "게시글", value: profile.postCount },
              { label: "팔로워", value: profile.followerCount },
              { label: "팔로잉", value: profile.followingCount },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-0.5">
                <span className="text-[17px] font-bold text-gray-900">{item.value}</span>
                <span className="text-[12px] text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 px-4 py-3">
            {isSelf ? (
              <>
                <button
                  type="button"
                  onClick={() => setOpenProfileEditor(true)}
                  className="flex-1 rounded-lg bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[13px] font-semibold text-white"
                >
                  프로필 수정
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-[13px] font-semibold text-gray-900"
                >
                  공유
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleFollow}
                  disabled={actionLoading === "follow"}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition ${
                    profile.relationship.isFollowing
                      ? "bg-gray-100 text-gray-900"
                      : "bg-[color:var(--rnest-accent)] text-white"
                  }`}
                >
                  {profile.relationship.isFollowing ? "팔로잉" : "팔로우"}
                </button>
                <button
                  type="button"
                  onClick={handleFriendRequest}
                  disabled={friendButtonDisabled}
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-[13px] font-semibold text-gray-900 disabled:opacity-50"
                >
                  {friendButtonLabel}
                </button>
              </>
            )}
          </div>

          <div className="flex border-b border-gray-200">
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
                    {visibleTab === item.id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gray-900" /> : null}
                  </button>
                );
              })}
          </div>

          {visibleTab === "posts" ? (
            <ProfilePostsGrid
              handle={profile.handle ?? handle}
              emptyCopy={
                isSelf
                  ? "첫 게시글을 올리면 프로필 그리드가 채워져요."
                  : "이 사용자의 게시글이 올라오면 여기에 표시돼요."
              }
            />
          ) : (
            <SocialFeedTab
              key={`${profile.handle ?? handle}:${visibleTab}`}
              scope={visibleTab === "saved" ? "saved" : "liked"}
              handle={profile.handle ?? handle}
              showComposer={false}
              defaultVisibility={ownProfile?.defaultPostVisibility ?? "friends"}
            />
          )}
        </>
      )}

      <SocialProfileSheet
        open={openProfileEditor}
        onClose={() => setOpenProfileEditor(false)}
        profile={ownProfile}
        onSaved={(nextProfile) => {
          setOwnProfile(nextProfile);
          setOpenProfileEditor(false);
          if (nextProfile.handle && nextProfile.handle !== handle) {
            router.replace(`/social/profile/${nextProfile.handle}`);
            return;
          }
          void loadProfile();
        }}
      />
    </div>
  );
}
