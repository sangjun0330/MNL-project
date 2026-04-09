"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { sanitizeInternalPath } from "@/lib/navigation";
import type { SocialProfile, SocialProfileHeader } from "@/types/social";
import { SocialFeedTab } from "@/components/social/SocialFeedTab";
import { SocialProfileSheet } from "@/components/social/SocialProfileSheet";

type Props = {
  handle: string;
};

type ProfileTab = "posts" | "saved" | "liked";

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
        fetch(`/api/social/profiles/${encodeURIComponent(handle)}`, { cache: "no-store" }).then((response) => response.json()),
        fetch("/api/social/profile", { cache: "no-store" }).then((response) => response.json()),
      ]);

      if (!profileRes.ok) {
        throw new Error(profileRes.error === "not_found" ? "프로필을 찾을 수 없어요." : "프로필을 불러오지 못했어요.");
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
  const feedScope = tab === "saved" ? "saved" : tab === "liked" ? "liked" : "profile";

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

  if (status !== "authenticated") {
    return (
      <div className="space-y-4 pb-6">
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
            aria-label="뒤로"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-[17px] font-bold text-ios-text">프로필</h1>
          <div className="h-9 w-9" />
        </div>
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <p className="text-[14px] text-ios-muted">로그인 후 프로필을 볼 수 있어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
          aria-label="뒤로"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-[17px] font-bold text-ios-text">프로필</h1>
        <div className="h-9 w-9" />
      </div>

      {notice ? (
        <div className="rounded-2xl border border-ios-sep bg-white px-4 py-3 text-[13px] text-ios-text shadow-apple">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <p className="text-[13px] text-ios-muted">프로필을 불러오는 중...</p>
        </div>
      ) : error || !profile ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <p className="text-[13px] text-red-500">{error ?? "프로필을 찾을 수 없어요."}</p>
        </div>
      ) : (
        <>
          <section className="rounded-[28px] bg-white px-5 py-5 shadow-apple">
            <div className="flex items-start gap-4">
              <div
                className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-[34px] shrink-0"
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[20px] font-bold tracking-[-0.03em] text-ios-text">
                    {profile.displayName}
                  </h2>
                  {profile.handle ? (
                    <span className="text-[13px] text-ios-muted">@{profile.handle}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] text-ios-muted">{profile.statusMessage || "RNest 소셜 프로필"}</p>
                {profile.bio ? (
                  <p className="mt-3 whitespace-pre-wrap text-[14px] leading-6 text-ios-text">{profile.bio}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <div className="rounded-2xl bg-ios-bg px-4 py-3 flex-1">
                <div className="text-[11px] font-medium text-ios-muted">팔로워</div>
                <div className="mt-1 text-[18px] font-semibold text-ios-text">{profile.followerCount}</div>
              </div>
              <div className="rounded-2xl bg-ios-bg px-4 py-3 flex-1">
                <div className="text-[11px] font-medium text-ios-muted">팔로잉</div>
                <div className="mt-1 text-[18px] font-semibold text-ios-text">{profile.followingCount}</div>
              </div>
              <div className="rounded-2xl bg-ios-bg px-4 py-3 flex-1">
                <div className="text-[11px] font-medium text-ios-muted">게시글</div>
                <div className="mt-1 text-[18px] font-semibold text-ios-text">{profile.postCount}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {isSelf ? (
                <button
                  type="button"
                  onClick={() => setOpenProfileEditor(true)}
                  className="rounded-full bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[13px] font-semibold text-white"
                >
                  프로필 수정
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleFollow}
                    disabled={actionLoading === "follow"}
                    className={`rounded-full px-4 py-2.5 text-[13px] font-semibold ${
                      profile.relationship.isFollowing
                        ? "bg-ios-bg text-ios-text"
                        : "bg-[color:var(--rnest-accent)] text-white"
                    }`}
                  >
                    {profile.relationship.isFollowing ? "Following" : "Follow"}
                  </button>
                  <button
                    type="button"
                    onClick={handleFriendRequest}
                    disabled={actionLoading === "friend" || profile.relationship.isFriend || profile.relationship.hasOutgoingFriendRequest}
                    className="rounded-full bg-ios-bg px-4 py-2.5 text-[13px] font-semibold text-ios-text"
                  >
                    {profile.relationship.isFriend
                      ? "친구"
                      : profile.relationship.hasOutgoingFriendRequest
                        ? "요청 보냄"
                        : "친구 요청"}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleShare}
                className="rounded-full bg-ios-bg px-4 py-2.5 text-[13px] font-semibold text-ios-text"
              >
                공유
              </button>
            </div>
          </section>

          <div className="rounded-2xl bg-ios-bg p-1 shadow-apple">
            <div className="flex items-center gap-1">
              {([
                { id: "posts", label: "Posts" },
                { id: "saved", label: "Saved" },
                { id: "liked", label: "Liked" },
              ] as const)
                .filter((item) => isSelf || item.id === "posts")
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`flex-1 rounded-[14px] px-3 py-2.5 text-[13px] font-semibold transition ${
                      tab === item.id ? "bg-white text-ios-text shadow-sm" : "text-ios-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </div>

          <SocialFeedTab
            key={`${profile.handle ?? handle}:${tab}`}
            scope={feedScope}
            handle={profile.handle ?? handle}
            showComposer={isSelf && tab === "posts"}
            defaultVisibility={ownProfile?.defaultPostVisibility ?? "friends"}
          />
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
