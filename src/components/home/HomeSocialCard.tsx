"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { SocialGroupBadge } from "@/components/social/SocialGroupBadge";
import type { SocialGroupSummary } from "@/types/social";

type Props = { deferred: boolean };

function IconPeople({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SectionHeader({
  label,
  linkLabel,
  href = "/social",
}: {
  label: string;
  linkLabel?: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div
        className="flex items-center gap-1.5"
        style={{ color: "var(--rnest-muted)" }}
      >
        <IconPeople size={15} />
        <span className="text-[11px] font-semibold uppercase tracking-widest">
          {label}
        </span>
      </div>
      {linkLabel && (
        <Link
          href={href}
          className="text-[12px] font-medium active:opacity-60"
          style={{ color: "var(--rnest-accent)" }}
        >
          {linkLabel} ›
        </Link>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-[22px] px-4 py-4 shadow-apple-sm"
      style={{ background: "var(--rnest-card)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div
          className="h-3 w-20 animate-pulse rounded-full"
          style={{ background: "var(--rnest-sep)" }}
        />
        <div
          className="h-3 w-14 animate-pulse rounded-full"
          style={{ background: "var(--rnest-sep)" }}
        />
      </div>
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div
              className="h-12 w-12 animate-pulse rounded-[18px]"
              style={{ background: "var(--rnest-sep)" }}
            />
            <div
              className="h-2.5 w-10 animate-pulse rounded-full"
              style={{ background: "var(--rnest-sep)" }}
            />
            <div
              className="h-2 w-7 animate-pulse rounded-full"
              style={{ background: "var(--rnest-sep)" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeSocialCard({ deferred }: Props) {
  const { status, user } = useAuthState();
  const [groups, setGroups] = useState<SocialGroupSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!deferred || !user) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/social/groups", { method: "GET", cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.ok && Array.isArray(json?.data?.groups)) {
          setGroups(json.data.groups as SocialGroupSummary[]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deferred, user]);

  // ── Not logged in ─────────────────────────────────────────────
  if (status !== "loading" && !user) {
    return (
      <div
        className="rounded-[22px] px-4 py-4 shadow-apple-sm"
        style={{ background: "var(--rnest-card)" }}
      >
        <SectionHeader label="소셜" />
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--rnest-sub)" }}
        >
          로그인하면 동료와 그룹을 만들고 함께 챌린지에 도전할 수 있어요.
        </p>
        <Link
          href="/social"
          className="mt-3 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-semibold active:opacity-70"
          style={{
            background: "var(--rnest-accent-soft)",
            color: "var(--rnest-accent)",
          }}
        >
          소셜 시작하기
          <IconChevronRight />
        </Link>
      </div>
    );
  }

  // ── Loading skeleton ───────────────────────────────────────────
  if (status === "loading" || loading || (deferred && groups === null && !!user)) {
    return <SkeletonCard />;
  }

  // ── No groups ─────────────────────────────────────────────────
  if (groups !== null && groups.length === 0) {
    return (
      <div
        className="rounded-[22px] px-4 py-4 shadow-apple-sm"
        style={{ background: "var(--rnest-card)" }}
      >
        <SectionHeader label="소셜 그룹" />
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--rnest-sub)" }}
        >
          아직 참여한 그룹이 없어요. 동료와 함께 그룹을 만들어 보세요.
        </p>
        <Link
          href="/social"
          className="mt-3 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-semibold active:opacity-70"
          style={{
            background: "var(--rnest-accent-soft)",
            color: "var(--rnest-accent)",
          }}
        >
          그룹 참여·만들기
          <IconChevronRight />
        </Link>
      </div>
    );
  }

  // ── Has groups ────────────────────────────────────────────────
  if (groups && groups.length > 0) {
    const totalPending = groups.reduce(
      (s, g) => s + (g.pendingJoinRequestCount ?? 0),
      0
    );

    return (
      <div
        className="rounded-[22px] px-4 py-4 shadow-apple-sm"
        style={{ background: "var(--rnest-card)" }}
      >
        <SectionHeader label="소셜 그룹" linkLabel="전체 보기" />

        {/* Group tiles — horizontal scroll */}
        <div
          className="flex gap-4 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <style>{`.home-social-scroll::-webkit-scrollbar { display: none; }`}</style>

          {groups.slice(0, 10).map((group) => (
            <Link
              key={group.id}
              href={`/social/groups/${group.id}`}
              className="home-social-scroll flex shrink-0 flex-col items-center gap-1.5 active:opacity-70"
            >
              {/* Badge with optional pending indicator */}
              <div className="relative">
                <SocialGroupBadge groupId={group.id} name={group.name} size="md" />
                {group.pendingJoinRequestCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                    style={{ background: "var(--rnest-accent)" }}
                  >
                    {group.pendingJoinRequestCount > 9
                      ? "9+"
                      : group.pendingJoinRequestCount}
                  </span>
                )}
              </div>

              <p
                className="max-w-[52px] truncate text-center text-[10.5px] font-semibold leading-none"
                style={{ color: "var(--rnest-text)" }}
              >
                {group.name}
              </p>
              <p
                className="text-[10px]"
                style={{ color: "var(--rnest-muted)" }}
              >
                {group.memberCount}명
              </p>
            </Link>
          ))}

          {/* "전체" shortcut at end */}
          <Link
            href="/social"
            className="flex shrink-0 flex-col items-center gap-1.5 active:opacity-70"
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-[18px]"
              style={{
                background: "var(--rnest-accent-soft)",
                color: "var(--rnest-accent)",
              }}
            >
              <IconChevronRight />
            </div>
            <p
              className="text-[10.5px] font-medium"
              style={{ color: "var(--rnest-muted)" }}
            >
              전체
            </p>
            {/* spacer to match height of member count row */}
            <p className="text-[10px] opacity-0" aria-hidden>
              ·
            </p>
          </Link>
        </div>

        {/* Footer stats */}
        <div
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5"
          style={{ borderColor: "var(--rnest-sep)" }}
        >
          <span
            className="text-[11.5px]"
            style={{ color: "var(--rnest-muted)" }}
          >
            <span
              className="font-semibold"
              style={{ color: "var(--rnest-text)" }}
            >
              {groups.length}
            </span>
            개 그룹 참여 중
          </span>
          {totalPending > 0 && (
            <>
              <span style={{ color: "var(--rnest-sep)" }}>·</span>
              <span
                className="text-[11.5px] font-semibold"
                style={{ color: "var(--rnest-accent)" }}
              >
                가입 신청 {totalPending}건 대기
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
