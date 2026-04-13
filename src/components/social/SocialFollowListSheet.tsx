"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import type { SocialFollowSummary } from "@/types/social";

type Props = {
  open: boolean;
  onClose: () => void;
  handle: string;
  type: "followers" | "following";
};

function UserRow({
  user,
  onTap,
}: {
  user: SocialFollowSummary;
  onTap: () => void;
}) {
  const displayLabel = (user.displayName || user.nickname).trim();
  const handleLabel = user.handle ? `@${user.handle}` : null;

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition active:bg-gray-50"
    >
      <div className="rnest-social-avatar-ring shrink-0 rounded-full p-[2px]">
        <div className="rnest-social-avatar-shell flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#f6f4ff] text-[20px]">
          {user.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.profileImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <SocialAvatarGlyph emoji={user.avatarEmoji} className="h-6 w-6" />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-gray-900">
          {displayLabel || handleLabel || "알 수 없는 사용자"}
        </p>
        {handleLabel ? (
          <p className="mt-0.5 truncate text-[12px] text-gray-500">{handleLabel}</p>
        ) : null}
        {user.bio ? (
          <p className="mt-0.5 truncate text-[11.5px] text-gray-400">{user.bio}</p>
        ) : null}
      </div>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-gray-300"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

export function SocialFollowListSheet({ open, onClose, handle, type }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<SocialFollowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = type === "followers" ? "팔로워" : "팔로잉";

  const loadItems = useCallback(async () => {
    if (!handle) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        type === "followers"
          ? `/api/social/profiles/${encodeURIComponent(handle)}/followers`
          : `/api/social/profiles/${encodeURIComponent(handle)}/following`;
      const res = await fetch(endpoint, { cache: "no-store" }).then((r) => r.json());
      if (!res.ok) {
        if (res.error === "profile_locked") {
          throw new Error("비공개 프로필에서는 팔로워와 팔로잉 목록을 볼 수 없어요.");
        }
        throw new Error("목록을 불러오지 못했어요.");
      }
      setItems((res.data?.items ?? []) as SocialFollowSummary[]);
    } catch (err: any) {
      setError(String(err?.message ?? "목록을 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, [handle, type]);

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setError(null);
    void loadItems();
  }, [open, loadItems]);

  const handleUserTap = useCallback(
    (user: SocialFollowSummary) => {
      if (!user.handle) return;
      onClose();
      router.push(`/social/profile/${user.handle}`);
    },
    [onClose, router]
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      variant="appstore"
      maxHeightClassName="max-h-[78dvh]"
    >
      <div className="pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-[14px] text-gray-400">불러오는 중...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <p className="text-[13px] text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => void loadItems()}
              className="text-[13px] font-semibold text-[color:var(--rnest-accent)] underline underline-offset-2"
            >
              다시 시도
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-[14px] text-gray-400">
              {type === "followers" ? "팔로워가 없어요" : "팔로잉한 사람이 없어요"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((user) => (
              <UserRow
                key={user.userId}
                user={user}
                onTap={() => handleUserTap(user)}
              />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
