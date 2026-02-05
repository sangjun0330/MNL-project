"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SVGProps } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element;
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

const SettingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 7h16M4 17h16" />
    <circle cx="9" cy="7" r="2" />
    <circle cx="15" cy="17" r="2" />
  </svg>
);

const ITEMS: NavItem[] = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/schedule", label: "일정", Icon: CalendarIcon },
  { href: "/insights", label: "인사이트", Icon: InsightsIcon },
  { href: "/settings", label: "설정", Icon: SettingsIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [hide, setHide] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (typeof document !== "undefined") {
      setHide(document.body.classList.contains("wnl-sheet-open"));
    }

    const onSheet = (e: Event) => {
      const ce = e as CustomEvent<{ open: boolean }>;
      setHide(Boolean(ce.detail?.open));
    };
    window.addEventListener("wnl:sheet", onSheet as any);
    return () => window.removeEventListener("wnl:sheet", onSheet as any);
  }, []);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefetchAll = () => {
      ITEMS.forEach((it) => router.prefetch(it.href));
    };
    const requestIdle = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
    const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
    if (requestIdle) {
      const id = requestIdle(prefetchAll, { timeout: 1200 });
      return () => cancelIdle?.(id);
    }
    const id = window.setTimeout(prefetchAll, 0);
    return () => window.clearTimeout(id);
  }, [router]);

  const activeHref = useMemo(() => {
    const hit = ITEMS.find((it) =>
      it.href === "/" ? pathname === "/" : pathname?.startsWith(it.href)
    );
    return hit?.href ?? "/";
  }, [pathname]);
  const selectedHref = pendingHref ?? activeHref;

  if (hide) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(14px+env(safe-area-inset-bottom))] z-50 pointer-events-none">
        <div className="mx-auto w-full max-w-md px-4">
          <nav
            className={cn(
              "pointer-events-auto",
              "wnl-nav-bar"
            )}
          >
            <div className="grid grid-cols-4 gap-1 p-1.5">
              {ITEMS.map((it) => {
                const active = selectedHref === it.href;
                const Icon = it.Icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn(
                      "touch-manipulation wnl-nav-item",
                      active ? "wnl-nav-active" : "wnl-nav-inactive"
                    )}
                    onPointerDown={() => {
                      if (activeHref !== it.href) setPendingHref(it.href);
                      router.prefetch(it.href);
                    }}
                    onClick={(event) => {
                      if (activeHref === it.href) return;
                      event.preventDefault();
                      setPendingHref(it.href);
                      startTransition(() => {
                        router.push(it.href);
                      });
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="wnl-nav-icon" aria-hidden="true" focusable="false" />
                    <span className="wnl-nav-label">{it.label}</span>
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
