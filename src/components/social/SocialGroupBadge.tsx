"use client";

import { cn } from "@/lib/cn";

type Props = {
  groupId: number;
  name: string;
  size?: "sm" | "md" | "lg";
};

const GROUP_BADGE_THEMES = [
  "bg-[#E9F5FF] text-[#0F5E9C]",
  "bg-[#F5F0FF] text-[#6B46C1]",
  "bg-[#EEF8EE] text-[#1F7A3D]",
  "bg-[#FFF4E7] text-[#B45309]",
  "bg-[#FCEEF2] text-[#BE185D]",
  "bg-[#EFF6FF] text-[#1D4ED8]",
];

function firstLabel(name: string) {
  const chars = Array.from(String(name ?? "").trim());
  return chars[0] ?? "G";
}

export function SocialGroupBadge({ groupId, name, size = "md" }: Props) {
  const theme = GROUP_BADGE_THEMES[Math.abs(groupId) % GROUP_BADGE_THEMES.length];
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 rounded-2xl text-[15px]"
      : size === "lg"
        ? "h-16 w-16 rounded-[22px] text-[24px]"
        : "h-12 w-12 rounded-[18px] text-[18px]";

  return (
    <div
      className={cn("flex shrink-0 items-center justify-center font-semibold tracking-[-0.02em]", theme, sizeClass)}
      aria-hidden="true"
    >
      {firstLabel(name)}
    </div>
  );
}
