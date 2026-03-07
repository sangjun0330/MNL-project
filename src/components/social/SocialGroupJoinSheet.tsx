"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { SocialGroupInvitePreview, SocialGroupSummary } from "@/types/social";
import { SocialGroupBadge } from "@/components/social/SocialGroupBadge";

type Props = {
  open: boolean;
  preview: SocialGroupInvitePreview | null;
  onClose: () => void;
  onJoined: (group: SocialGroupSummary) => void;
};

export function SocialGroupJoinSheet({ open, preview, onClose, onJoined }: Props) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setJoining(false);
    setError(null);
  }, [open, preview?.token]);

  const handleJoin = async () => {
    if (!preview || preview.state !== "joinable" || joining) return;
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/social/groups/invites/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: preview.token }),
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "group_full") throw new Error("이 그룹은 현재 정원이 가득 찼어요.");
        if (res.error === "invite_not_found_or_expired") throw new Error("그룹 초대 링크가 만료되었거나 더 이상 유효하지 않아요.");
        throw new Error("그룹에 참여하지 못했어요.");
      }

      onJoined(res.data);
    } catch (err: any) {
      setError(String(err?.message ?? "그룹에 참여하지 못했어요."));
    } finally {
      setJoining(false);
    }
  };

  const group = preview?.group ?? null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="그룹 참가"
      subtitle="초대 링크로 그룹에 들어갈 수 있어요"
      variant="appstore"
      maxHeightClassName="max-h-[68dvh]"
    >
      <div className="space-y-4 pb-6">
        {group ? (
          <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
            <div className="flex items-center gap-3">
              <SocialGroupBadge groupId={group.id} name={group.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ios-text">{group.name}</p>
                <p className="mt-0.5 text-[12.5px] text-ios-muted">멤버 {group.memberCount}명</p>
              </div>
            </div>

            {group.description ? (
              <p className="mt-4 rounded-2xl bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-muted">
                {group.description}
              </p>
            ) : null}

            <div className="mt-4 flex -space-x-1.5">
              {group.memberPreview.map((member) => (
                <span
                  key={member.userId}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white bg-ios-bg text-[15px]"
                >
                  {member.avatarEmoji || "🐧"}
                </span>
              ))}
            </div>

            {preview?.state === "already_member" ? (
              <Button
                variant="secondary"
                disabled
                className="mt-4 h-12 w-full rounded-2xl text-[15px]"
              >
                이미 참여 중인 그룹
              </Button>
            ) : preview?.state === "group_full" ? (
              <Button
                variant="secondary"
                disabled
                className="mt-4 h-12 w-full rounded-2xl text-[15px]"
              >
                정원이 가득 찼어요
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={joining}
                onClick={handleJoin}
                className="mt-4 h-12 w-full rounded-2xl text-[15px]"
              >
                {joining ? "참여 중…" : "이 그룹에 참여하기"}
              </Button>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
