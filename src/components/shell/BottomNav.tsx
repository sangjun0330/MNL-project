"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { useAuthState } from "@/lib/auth";

const ITEMS = [
  { href: "/", label: "홈" },
  { href: "/schedule", label: "일정" },
  { href: "/insights", label: "인사이트" },
  { href: "/settings", label: "설정" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user: auth, status } = useAuthState();
  const isAuthed = Boolean(auth?.userId);
  const [hide, setHide] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [, startTransition] = useTransition();
  const goToSettings = useCallback((skipNavigate?: boolean) => {
    setLoginPromptOpen(false);
    setPendingHref(null);
    if (!skipNavigate) router.push("/settings");
  }, [router]);

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
    if (!loginPromptOpen) return;
    if (pathname?.startsWith("/settings")) {
      goToSettings(true);
      return;
    }
    const t = window.setTimeout(() => {
      goToSettings();
    }, 900);
    return () => window.clearTimeout(t);
  }, [loginPromptOpen, pathname, goToSettings]);

  useEffect(() => {
    if (!loginPromptOpen) return;
    if (isAuthed || pathname?.startsWith("/settings")) {
      goToSettings(true);
    }
  }, [loginPromptOpen, isAuthed, pathname, goToSettings]);

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
      {loginPromptOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-[360px] rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[16px] font-bold text-ios-text">로그인이 필요해요</div>
            <div className="mt-2 text-[13px] text-ios-sub">
              모든 기능을 사용하려면 로그인해야 합니다. 지금 설정으로 이동할게요.
            </div>
            <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="h-9 rounded-full bg-black px-4 text-[12px] font-semibold text-white"
                  onClick={() => goToSettings()}
                >
                  설정으로 이동
                </button>
            </div>
          </div>
        </div>
      ) : null}
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
                const blocked = !isAuthed && status !== "loading" && it.href !== "/settings";
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
                      if (activeHref !== it.href && !blocked) setPendingHref(it.href);
                      router.prefetch(it.href);
                    }}
                    onClick={(event) => {
                      if (activeHref === it.href) return;
                      event.preventDefault();
                      if (blocked) {
                        setLoginPromptOpen(true);
                        setPendingHref(null);
                        return;
                      }
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
