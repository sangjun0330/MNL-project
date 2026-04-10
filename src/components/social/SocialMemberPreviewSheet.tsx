"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { SocialAvatarBadge } from "@/components/social/SocialAvatar";
import { cn } from "@/lib/cn";
import type { SocialMemberPreview } from "@/types/social";

type SocialAvatarStackButtonProps = {
  members: SocialMemberPreview[];
  onClick?: () => void;
  size?: "sm" | "md";
  maxVisible?: number;
  className?: string;
};

export function SocialAvatarStackButton({
  members,
  onClick,
  size = "md",
  maxVisible = 3,
  className,
}: SocialAvatarStackButtonProps) {
  if (members.length === 0) return null;

  const visibleMembers = members.slice(0, maxVisible);
  const extraCount = Math.max(0, members.length - visibleMembers.length);
  const circleClassName =
    size === "sm"
      ? "h-7 w-7 text-[13px] border-2 -ml-2 first:ml-0"
      : "h-8 w-8 text-[15px] border-2 -ml-2.5 first:ml-0";
  const counterClassName =
    size === "sm"
      ? "h-7 w-7 text-[9px] border-2 -ml-2"
      : "h-8 w-8 text-[10px] border-2 -ml-2.5";

  const content = (
    <>
      {visibleMembers.map((member, index) => (
        <span
          key={member.userId}
          className={cn(
            "relative inline-flex items-center justify-center rounded-full border-white bg-[linear-gradient(180deg,rgba(247,244,255,0.98),rgba(255,255,255,0.98))] shadow-sm",
            circleClassName
          )}
          style={{ zIndex: visibleMembers.length - index }}
          title={member.nickname || "익명"}
        >
          <SocialAvatarBadge emoji={member.avatarEmoji} className="h-full w-full bg-transparent" iconClassName="h-[70%] w-[70%]" />
        </span>
      ))}
      {extraCount > 0 ? (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full border-white bg-ios-bg font-semibold text-ios-muted shadow-sm",
            counterClassName
          )}
        >
          +{extraCount}
        </span>
      ) : null}
    </>
  );

  if (!onClick) {
    return (
      <div className={cn("flex items-center", className)} aria-label={members.map((member) => member.nickname || "익명").join(", ")}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center rounded-full transition active:scale-[0.98]", className)}
      aria-label={`${members.length}명 멤버 보기`}
    >
      {content}
    </button>
  );
}

type SocialMemberPreviewSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  members: SocialMemberPreview[];
};

export function SocialMemberPreviewSheet({
  open,
  onClose,
  title,
  subtitle,
  members,
}: SocialMemberPreviewSheetProps) {
  if (!open) return null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      variant="appstore"
      maxHeightClassName="max-h-[56dvh]"
    >
      <div className="space-y-2 pb-2">
        {members.map((member) => (
          <div key={member.userId} className="rounded-2xl bg-ios-bg px-4 py-3">
            <div className="flex items-center gap-3">
              <SocialAvatarBadge emoji={member.avatarEmoji} className="h-10 w-10" iconClassName="h-7 w-7" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ios-text">
                  {member.nickname || "익명"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
