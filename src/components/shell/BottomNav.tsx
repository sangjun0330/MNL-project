"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/schedule", label: "일정" },
  { href: "/insights", label: "인사이트" },
  { href: "/settings", label: "설정" },
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
              "rounded-full border border-ios-sep bg-white/85",
              "shadow-[0_12px_36px_rgba(0,0,0,0.12)]",
              "backdrop-blur-xl"
            )}
          >
            <div className="grid grid-cols-4 gap-1 p-1.5">
              {ITEMS.map((it) => {
                const active = selectedHref === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-full text-[13px] font-semibold transition touch-manipulation",
                      active ? "wnl-nav-active" : "wnl-nav-inactive",
                      active
                        ? "bg-black text-white"
                        : "text-ios-muted hover:bg-black/5"
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
                    {it.label}
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
