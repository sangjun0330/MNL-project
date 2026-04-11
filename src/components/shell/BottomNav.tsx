"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactElement, SVGProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
};

const HomeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 10.5L12 4l8 6.5" />
    <path d="M6.5 9.5V20h11V9.5" />
  </svg>
);

const CalendarIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M8 3v4M16 3v4M4 9h16" />
  </svg>
);

const InsightsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 18h16" />
    <path d="M6 15l4-4 3 3 5-6" />
  </svg>
);

const ToolIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8 7h8" />
    <path d="M6 11h12" />
    <path d="M9 15h6" />
    <rect x="4" y="4" width="16" height="16" rx="3" />
  </svg>
);

const SocialIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="9" cy="7" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M13 20c0-2.8 1.8-5.1 4-5.8" />
  </svg>
);

const SocialFeedIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M5.5 4.75A2.75 2.75 0 0 0 2.75 7.5v9A2.75 2.75 0 0 0 5.5 19.25h13A2.75 2.75 0 0 0 21.25 16.5v-9A2.75 2.75 0 0 0 18.5 4.75h-13Zm1.25 2.5a1 1 0 0 1 1-1h8.5a1 1 0 1 1 0 2h-8.5a1 1 0 0 1-1-1Zm0 4.25a1 1 0 0 1 1-1h8.5a1 1 0 1 1 0 2h-8.5a1 1 0 0 1-1-1Zm0 4.25a1 1 0 0 1 1-1H13a1 1 0 1 1 0 2H7.75a1 1 0 0 1-1-1Zm10.25-3.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" />
  </svg>
);

const SocialSearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);

const SocialFriendsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="9" cy="8.25" r="3" />
    <path d="M4 18.75c0-2.9 2.24-5 5-5s5 2.1 5 5" />
    <circle cx="17.25" cy="9.25" r="2.25" />
    <path d="M14.75 18.75c.18-2.18 1.7-3.76 3.75-4.18" />
  </svg>
);

const SocialGroupsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="7.5" r="2.75" />
    <circle cx="6.25" cy="10.25" r="2.15" />
    <circle cx="17.75" cy="10.25" r="2.15" />
    <path d="M7.5 18.75c0-2.8 1.96-4.75 4.5-4.75s4.5 1.95 4.5 4.75" />
    <path d="M2.75 18.75c0-1.88 1.18-3.24 2.92-3.8" />
    <path d="M18.33 14.95c1.74.56 2.92 1.92 2.92 3.8" />
  </svg>
);

const DEFAULT_ITEMS: NavItem[] = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/schedule", label: "일정", Icon: CalendarIcon },
  { href: "/insights", label: "인사이트", Icon: InsightsIcon },
  { href: "/tools", label: "툴", Icon: ToolIcon },
  { href: "/social", label: "소셜", Icon: SocialIcon },
];

const SOCIAL_ROOT_ITEMS: NavItem[] = [
  { href: "/social", label: "피드", Icon: SocialFeedIcon },
  { href: "/social?tab=explore", label: "검색", Icon: SocialSearchIcon },
  { href: "/social?tab=friends", label: "친구", Icon: SocialFriendsIcon },
  { href: "/social?tab=groups", label: "그룹", Icon: SocialGroupsIcon },
];

function resolveSocialActiveHref(tab: string | null) {
  if (tab === "explore") return "/social?tab=explore";
  if (tab === "friends") return "/social?tab=friends";
  if (tab === "groups") return "/social?tab=groups";
  return "/social";
}

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [hide, setHide] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { t } = useI18n();
  const isSocialRoot = pathname === "/social";
  const searchKey = searchParams?.toString() ?? "";
  const items = isSocialRoot ? SOCIAL_ROOT_ITEMS : DEFAULT_ITEMS;

  useEffect(() => {
    if (typeof document !== "undefined") {
      setHide(document.body.classList.contains("rnest-sheet-open"));
    }

    const onSheet = (e: Event) => {
      const ce = e as CustomEvent<{ open: boolean }>;
      setHide(Boolean(ce.detail?.open));
    };
    window.addEventListener("rnest:sheet", onSheet as any);
    return () => window.removeEventListener("rnest:sheet", onSheet as any);
  }, []);

  useEffect(() => {
    for (const item of items) {
      router.prefetch(item.href);
    }
  }, [items, router]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname, searchKey]);

  const activeHref = useMemo(() => {
    if (isSocialRoot) {
      return resolveSocialActiveHref(searchParams?.get("tab"));
    }

    const hit = DEFAULT_ITEMS.find((it) =>
      it.href === "/" ? pathname === "/" : pathname?.startsWith(it.href)
    );
    if (hit) return hit.href;
    if (pathname?.startsWith("/settings")) return null;
    return "/";
  }, [isSocialRoot, pathname, searchParams]);
  const selectedHref = pendingHref ?? activeHref;

  if (hide || pathname === "/tools/med-safety") return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom))] z-50 pointer-events-none">
        <div className="mx-auto w-full max-w-md px-4">
          <nav
            className={cn(
              "pointer-events-auto",
              "rnest-nav-bar"
            )}
          >
            <div className={cn("grid gap-1 p-1.5", isSocialRoot ? "grid-cols-4" : "grid-cols-5")}>
              {items.map((it) => {
                const active = selectedHref === it.href;
                const Icon = it.Icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    scroll={false}
                    className={cn(
                      "touch-manipulation rnest-nav-item",
                      isSocialRoot ? "min-h-[50px] gap-0 py-3" : null,
                      active ? "rnest-nav-active" : "rnest-nav-inactive"
                    )}
                    onPointerDown={() => {
                      if (activeHref !== it.href) setPendingHref(it.href);
                    }}
                    onClick={(event) => {
                      if (activeHref === it.href) {
                        event.preventDefault();
                        return;
                      }
                      setPendingHref(it.href);
                    }}
                    aria-current={active ? "page" : undefined}
                    aria-label={t(it.label)}
                    title={t(it.label)}
                  >
                    <Icon
                      className={cn("rnest-nav-icon", isSocialRoot ? "h-6 w-6" : null)}
                      aria-hidden="true"
                      focusable="false"
                    />
                    <span className={isSocialRoot ? "sr-only" : "rnest-nav-label"}>{t(it.label)}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
