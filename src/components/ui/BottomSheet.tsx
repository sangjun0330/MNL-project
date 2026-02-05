"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const SHEET_DURATION_MS = 520;
const SHEET_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SHEET_CLOSE_DELAY_MS = 220;

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /**
   * Optional fixed footer area (e.g. action buttons).
   * - 내부 스크롤 영역과 분리되어 항상 하단에 고정됩니다.
   */
  footer?: React.ReactNode;
  /**
   * Sheet panel max height.
   * 기본값은 iOS 스타일(반 화면 + 조금)로 설정.
   * 예) "max-h-[70dvh]"
   */
  maxHeightClassName?: string;
  /**
   * Visual style variant.
   */
  variant?: "default" | "appstore";
};

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeightClassName,
  variant = "default",
}: Props) {
  // unmount 시점 제어(닫힐 때 애니메이션 종료 후 제거)
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    lastT: 0,
    translate: 0,
  });

  const maxH = useMemo(() => maxHeightClassName ?? "max-h-[68dvh]", [maxHeightClassName]);
  const isAppStore = variant === "appstore";

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
    const t = setTimeout(() => setMounted(false), SHEET_DURATION_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  // ✅ 시트가 열려있는 동안: 바텀탭 숨김 + 배경 스크롤 방지
  useEffect(() => {
    if (!mounted) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;

    body.classList.add("wnl-sheet-open");
    body.style.overflow = "hidden";
    window.dispatchEvent(new CustomEvent("wnl:sheet", { detail: { open: true } }));

    return () => {
      body.classList.remove("wnl-sheet-open");
      body.style.overflow = prevOverflow;
      window.dispatchEvent(new CustomEvent("wnl:sheet", { detail: { open: false } }));
    };
  }, [mounted]);

  const closeWithAnimation = () => {
    // 외부 state가 open을 false로 바꿔서 내려가도록
    onClose();
  };

  const closeWithSlide = () => {
    applyTranslate(600, true);
    onClose();
  };

  const applyTranslate = (y: number, withTransition: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = withTransition ? `transform ${SHEET_DURATION_MS}ms ${SHEET_EASE}` : "none";
    el.style.transform = `translate3d(0, ${Math.max(0, y)}px, 0)`;
  };

  const onDragStart = (clientY: number) => {
    drag.current.active = true;
    drag.current.startY = clientY;
    drag.current.lastY = clientY;
    drag.current.lastT = performance.now();
    drag.current.translate = 0;
    applyTranslate(0, false);
  };

  const onDragMove = (clientY: number) => {
    if (!drag.current.active) return;
    const dy = clientY - drag.current.startY;
    if (dy < 0) {
      applyTranslate(0, false);
      return;
    }
    drag.current.translate = dy;
    drag.current.lastY = clientY;
    drag.current.lastT = performance.now();
    applyTranslate(dy, false);
  };

  const onDragEnd = (clientY: number) => {
    if (!drag.current.active) return;
    drag.current.active = false;

    const dy = clientY - drag.current.startY;
    const dt = Math.max(1, performance.now() - drag.current.lastT);
    const vy = (clientY - drag.current.lastY) / dt; // px/ms

    // 조건: 충분히 내려오거나, 빠르게 스와이프 다운하면 닫기
    const shouldClose = dy > 90 || vy > 0.9;

    if (shouldClose) {
      // 내려가는 애니메이션을 살짝 보여준 뒤 close
      applyTranslate(Math.max(0, dy), false);
      applyTranslate(600, true);
      setTimeout(() => closeWithAnimation(), SHEET_CLOSE_DELAY_MS);
      return;
    }
    // 원위치 스냅
    applyTranslate(0, true);
  };

  if (!mounted || !portalEl) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Close"
        className={cn(
          "absolute inset-0",
          // backdrop도 부드럽게
          isAppStore
            ? "bg-black/45 backdrop-blur-[10px]"
            : "bg-black/35 backdrop-blur-[6px]",
          "transition-opacity duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "wnl-backdrop",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={closeWithAnimation}
        data-auth-allow
      />
      <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-[460px]">
        <div
          ref={panelRef}
          className={cn(
            isAppStore
              ? "rounded-[28px] border border-black/5 bg-[#F1F1F1] shadow-apple-lg"
              : "rounded-t-[26px] border border-ios-sep bg-white shadow-apple-lg",
            // ✅ iOS/Safari에서 스크롤이 제대로 동작하려면
            // 부모가 height 제한 + overflow-hidden + flex-col 구조여야 합니다.
            maxH,
            "overflow-hidden flex flex-col",
            // enter/exit (slide up)
            "transition-[transform,opacity] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
            visible ? "translate-y-0 opacity-100" : "translate-y-[20px] opacity-0"
          )}
          role="dialog"
          aria-modal="true"
        >
          {!isAppStore ? (
            <>
              <div
                className="flex justify-center pt-2"
                // 드래그 핸들(스와이프 닫기)
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
                  onDragStart(e.clientY);
                }}
                onPointerMove={(e) => onDragMove(e.clientY)}
                onPointerUp={(e) => onDragEnd(e.clientY)}
                onPointerCancel={(e) => onDragEnd(e.clientY)}
              >
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
          ) : (
            <div
              className="px-5 pt-4"
              onPointerDown={(e) => {
                (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
                onDragStart(e.clientY);
              }}
              onPointerMove={(e) => onDragMove(e.clientY)}
              onPointerUp={(e) => onDragEnd(e.clientY)}
              onPointerCancel={(e) => onDragEnd(e.clientY)}
            >
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/80 text-[16px] text-ios-text"
                  onClick={closeWithSlide}
                  data-auth-allow
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <div
            className={cn(
              // ✅ flex-1 + min-h-0 로 내부 scroll 컨테이너 높이가 고정되어 스크롤됨
              "flex-1 min-h-0 overflow-y-auto overscroll-contain",
              isAppStore ? "px-4 pt-4" : "px-5 pt-4",
              footer ? "pb-4" : "pb-[calc(20px+env(safe-area-inset-bottom))]"
            )}
          >
            {children}
          </div>

          {footer ? (
            <div className="border-t border-ios-sep bg-white px-5 py-4">
              <div className="pb-[env(safe-area-inset-bottom)]">{footer}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    portalEl
  );
}
