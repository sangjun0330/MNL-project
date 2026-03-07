"use client";

import type { SocialGroupRole } from "@/types/social";
import { cn } from "@/lib/cn";

const ROLE_LABELS: Record<SocialGroupRole, string> = {
  owner: "방장",
  admin: "관리자",
  member: "멤버",
};

export function SocialGroupRoleBadge({
  role,
  highlight = false,
  className,
}: {
  role: SocialGroupRole;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
        role === "owner"
          ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
          : role === "admin"
            ? "bg-sky-50 text-sky-700"
            : highlight
              ? "bg-ios-bg text-ios-muted"
              : "bg-ios-bg text-ios-muted",
        className
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

