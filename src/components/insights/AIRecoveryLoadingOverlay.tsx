"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type LoadingMode = "recovery" | "orders";

type LoadingStep = {
  text: string;
  durationMs: number;
};

type AIRecoveryLoadingOverlayProps = {
  mode: LoadingMode;
  open: boolean;
};

/* ── Steps ─────────────────────────────────────────────────────────
 * recovery: 10 steps ≈ 63s total  (실제 AI 생성 ~60-90s)
 * orders:    6 steps ≈ 32s total  (실제 AI 생성 ~30-45s)
 * 마지막 단계는 overlay가 닫힐 때까지 무한 대기 (1 사이클만 돈다)
 * ────────────────────────────────────────────────────────────── */
const STEPS: Record<LoadingMode, LoadingStep[]> = {
  recovery: [
    { text: "최근 7일간의 건강 기록을 불러오고 있어요", durationMs: 6_000 },
    { text: "수면 패턴과 회복 흐름을 분석하고 있어요", durationMs: 7_000 },
    { text: "교대근무 리듬에 맞춰 컨디션을 평가하고 있어요", durationMs: 7_000 },
    { text: "신체·정신 소모 신호를 정리하고 있어요", durationMs: 7_000 },
    { text: "반복되는 피로 요인을 찾고 있어요", durationMs: 7_000 },
    { text: "핵심 회복 포인트를 선별하고 있어요", durationMs: 7_000 },
    { text: "근무 일정에 맞춘 회복 해설을 작성하고 있어요", durationMs: 8_000 },
    { text: "실천 가능한 추천 행동을 다듬고 있어요", durationMs: 7_000 },
    { text: "오더 흐름과 우선순위를 정리하고 있어요", durationMs: 7_000 },
    { text: "마무리하고 있어요, 거의 완료됐어요", durationMs: Infinity },
  ],
  orders: [
    { text: "기존 맞춤회복 해설을 확인하고 있어요", durationMs: 5_000 },
    { text: "컨디션 변화에 따라 실행 우선순위를 정하고 있어요", durationMs: 6_000 },
    { text: "근무 일정에 맞춘 오더 문장을 작성하고 있어요", durationMs: 7_000 },
    { text: "실천 타이밍과 순서를 맞추고 있어요", durationMs: 7_000 },
    { text: "오더 완성도를 점검하고 있어요", durationMs: 7_000 },
    { text: "최종 정리 중이에요, 거의 완료됐어요", durationMs: Infinity },
  ],
};

const TITLE: Record<LoadingMode, string> = {
  recovery: "맞춤회복을 준비하고 있어요",
  orders: "오더를 정리하고 있어요",
};

const ESTIMATE: Record<LoadingMode, string> = {
  recovery: "보통 약 1분",
  orders: "보통 15초",
};

export function AIRecoveryLoadingOverlay({ mode, open }: AIRecoveryLoadingOverlayProps) {
  const steps = STEPS[mode];
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepFading, setStepFading] = useState(false);
  const fadeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setCurrentIndex(0);
      setStepFading(false);
      const id = window.setTimeout(() => setVisible(true), 20);
      return () => window.clearTimeout(id);
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), 400);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    const prevRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevRoot;
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    let cancelled = false;

    const advance = (idx: number) => {
      if (idx >= steps.length - 1 || cancelled) return; // last step → stay forever
      const dur = steps[idx]!.durationMs;
      if (!isFinite(dur)) return; // safety: Infinity means stop
      const fadeOutTime = dur - 200;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setStepFading(true);
        fadeTimerRef.current = window.setTimeout(() => {
          if (cancelled) return;
          setCurrentIndex(idx + 1);
          setStepFading(false);
          advance(idx + 1);
        }, 200);
      }, fadeOutTime);
    };

    setCurrentIndex(0);
    setStepFading(false);
    advance(0);

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      if (fadeTimerRef.current != null) window.clearTimeout(fadeTimerRef.current);
    };
  }, [open, steps]);

  if (!mounted || !portalEl) return null;

  const step = steps[Math.min(currentIndex, steps.length - 1)]!;
  /* progress: last step = 100% */
  const progress = Math.min((currentIndex + 1) / steps.length, 1);

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[120] transition-all duration-500",
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
      aria-live="polite"
      aria-busy={open}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-white" />

      {/* Content */}
      <div
        className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6"
        style={{
          paddingTop: "max(48px, env(safe-area-inset-top))",
          paddingBottom: "max(48px, env(safe-area-inset-bottom))",
        }}
      >
        {/* Logo with breathing animation */}
        <div
          className={cn(
            "transition-all duration-700",
            visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          <div className="rnest-loading-breathe">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rnest-mark.png" alt="RNest" width={156} height={96} style={{ display: "block" }} />
          </div>
        </div>

        {/* Title */}
        <div
          className={cn(
            "mt-10 transition-all delay-200 duration-700",
            visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
        >
          <h2 className="text-center text-[20px] font-semibold tracking-[-0.03em] text-[#161616]/90">
            {TITLE[mode]}
          </h2>
        </div>

        {/* Step text with crossfade */}
        <div
          className={cn(
            "mt-4 h-[28px] transition-all delay-300 duration-700",
            visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <p
            className={cn(
              "text-center text-[15px] font-medium tracking-[-0.01em] text-[#161616]/40 transition-opacity duration-300",
              stepFading ? "opacity-0" : "opacity-100",
            )}
          >
            {step.text}
          </p>
        </div>

        {/* Progress bar */}
        <div
          className={cn(
            "mt-10 w-full max-w-[200px] transition-all delay-500 duration-700",
            visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#161616]/[0.06]">
            <div
              className="h-full rounded-full bg-[#161616]/20 transition-all duration-[1200ms] ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Estimate */}
        <div
          className={cn(
            "mt-5 transition-all delay-500 duration-700",
            visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          <p className="text-center text-[13px] text-[#161616]/20">
            {ESTIMATE[mode]}
          </p>
        </div>
      </div>

      {/* Breathing animation keyframes */}
      <style>{`
        @keyframes rnest-breathe {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        .rnest-loading-breathe {
          animation: rnest-breathe 3s ease-in-out infinite;
        }
      `}</style>
    </div>,
    portalEl,
  );
}
