"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export const BOTTOM_SHEET_DURATION_MS = 500;
let OPEN_SHEET_COUNT = 0;

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  /**
   * Optional fixed footer area (e.g. action buttons).
   * - 내부 스크롤 영역과 분리되어 항상 하단에 고정됩니다.
   */
  footer?: React.ReactNode;
  footerClassName?: string;
  /**
   * Sheet panel max height.
   * 기본값은 iOS 스타일(반 화면 + 조금)로 설정.
   * 예) "max-h-[70dvh]"
   */
  maxHeightClassName?: string;
  contentClassName?: string;
  panelClassName?: string;
  presentation?: "sheet" | "fullscreen";
  /**
   * Visual style variant.
   */
  variant?: "default" | "appstore";
  /**
   * Optional backdrop style override.
   */
  backdropClassName?: string;
};

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  dismissible = true,
  footer,
  footerClassName,
  maxHeightClassName,
  contentClassName,
  panelClassName,
  presentation = "sheet",
  variant = "default",
  backdropClassName,
}: Props) {
  // unmount 시점 제어(닫힐 때 애니메이션 종료 후 제거)
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const maxH = useMemo(() => maxHeightClassName ?? "max-h-[68dvh]", [maxHeightClassName]);
  const isAppStore = variant === "appstore";
  const isFullscreen = presentation === "fullscreen";

  useEffect(() => {
    // open/close 상태에 맞춰 mount/visible을 동기화
    if (open) {
      setMounted(true);
      // 다음 tick에 visible true로 (enter 애니메이션)
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    }
    // close: exit 애니메이션 후 unmount
    setVisible(false);
    const t = setTimeout(() => setMounted(false), BOTTOM_SHEET_DURATION_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissible, mounted, onClose]);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  // ✅ 시트가 열려있는 동안: 바텀탭 숨김 + 배경 스크롤 방지
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const body = document.body;
    const becameFirstSheet = OPEN_SHEET_COUNT === 0;
    if (becameFirstSheet) {
      root.classList.add("rnest-sheet-open");
      body.classList.add("rnest-sheet-open");
      window.dispatchEvent(new CustomEvent("rnest:sheet", { detail: { open: true } }));
    }
    OPEN_SHEET_COUNT += 1;

    return () => {
      OPEN_SHEET_COUNT = Math.max(0, OPEN_SHEET_COUNT - 1);
      if (OPEN_SHEET_COUNT > 0) return;
      root.classList.remove("rnest-sheet-open");
      body.classList.remove("rnest-sheet-open");
      window.dispatchEvent(new CustomEvent("rnest:sheet", { detail: { open: false } }));
    };
  }, [mounted]);

  if (!mounted || !portalEl) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0",
          backdropClassName
            ? backdropClassName
            : isAppStore
              ? "bg-black/45 backdrop-blur-[10px]"
              : "bg-black/35 backdrop-blur-[6px]",
          "transition-[opacity,backdrop-filter] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "rnest-backdrop",
          visible ? "opacity-100" : "opacity-0",
          dismissible ? "cursor-pointer" : "cursor-default"
        )}
        onClick={dismissible ? onClose : undefined}
        data-auth-allow
      />
      <div
        className={cn(
          "absolute mx-auto w-full",
          isFullscreen ? "inset-0 max-w-[460px]" : "bottom-0 left-0 right-0 max-w-[460px]"
        )}
      >
        <div
          className={cn(
            isFullscreen
              ? "h-[100dvh] max-h-none rounded-none border-0 bg-transparent shadow-none"
              : isAppStore
                ? "rounded-[28px] border border-black/5 bg-[#F1F1F1] shadow-apple-lg"
                : "rounded-t-[26px] border border-ios-sep bg-white shadow-apple-lg",
            !isFullscreen ? maxH : null,
            "overflow-hidden flex flex-col",
            // enter/exit (slide up)
            "transition-[transform,opacity] duration-[500ms] ease-[cubic-bezier(0.175,0.885,0.32,1.05)] will-change-transform",
            visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
            panelClassName
          )}
          role="dialog"
          aria-modal="true"
        >
          {!isFullscreen && !isAppStore ? (
            <>
              <div className="flex justify-center pt-2">
                <div className="h-1.5 w-12 rounded-full bg-ios-sep" />
              </div>

              {(title || subtitle) ? (
                <div className="px-5 pt-3">
                  {title ? (
                    <div className="text-[15px] font-semibold tracking-[-0.01em]">{title}</div>
                  ) : null}
                  {subtitle ? (
                    <div className="mt-0.5 text-[12.5px] text-ios-muted">{subtitle}</div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : !isFullscreen ? (
            <div className="px-5 pt-3">
              <div className="mb-3 flex justify-center">
                <div className="h-1.5 w-12 rounded-full bg-black/15" />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {title ? (
                    <div className="text-[15px] font-semibold tracking-[-0.01em] break-words">{title}</div>
                  ) : null}
                  {subtitle ? (
                    <div className="mt-0.5 text-[12.5px] text-ios-muted break-words">{subtitle}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={!dismissible}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/80 text-[16px] text-ios-text"
                  onClick={dismissible ? onClose : undefined}
                  data-auth-allow
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              isFullscreen
                ? "flex-1 min-h-0 overflow-hidden"
                : "flex-1 min-h-0 overflow-y-auto overscroll-contain",
              isFullscreen ? "px-0 pt-0" : isAppStore ? "px-4 pt-4" : "px-5 pt-4",
              footer
                ? isFullscreen
                  ? "pb-0"
                  : "pb-4"
                : isFullscreen
                  ? "pb-0"
                  : "pb-[calc(20px+env(safe-area-inset-bottom))]",
              contentClassName
            )}
          >
            {children}
          </div>

          {footer ? (
            <div
              className={cn(
                "border-t border-ios-sep bg-white px-5 py-4",
                footerClassName
              )}
            >
              <div className="pb-[env(safe-area-inset-bottom)]">{footer}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    portalEl
  );
}
