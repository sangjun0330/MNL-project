"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RNestMark } from "@/components/brand/RNestLogo";
import { cn } from "@/lib/cn";

type LoadingMode = "recovery" | "orders";

type LoadingStep = {
  title: string;
  detail: string;
  durationMs: number;
};

type LoadingCopy = {
  title: string;
  estimate: string;
  steps: LoadingStep[];
};

type AIRecoveryLoadingOverlayProps = {
  mode: LoadingMode;
  open: boolean;
};

const LOADING_COPY: Record<LoadingMode, LoadingCopy> = {
  recovery: {
    title: "AI 맞춤회복을 준비하고 있어요",
    estimate: "보통 1~2분 정도 걸립니다.",
    steps: [
      {
        title: "건강 데이터를 불러오고 있어요",
        detail: "오늘 기록과 최근 흐름을 먼저 정리하고 있습니다.",
        durationMs: 9000,
      },
      {
        title: "수면 회복 흐름을 살피고 있어요",
        detail: "수면 길이와 남아 있는 회복 압력을 함께 보고 있습니다.",
        durationMs: 9000,
      },
      {
        title: "교대근무 리듬을 맞추고 있어요",
        detail: "다음 근무와 지금 회복 타이밍을 함께 맞추고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "반복 소모 신호를 정리하고 있어요",
        detail: "최근 자주 겹친 부담 신호를 먼저 추리고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "핵심 회복 포인트를 고르고 있어요",
        detail: "지금 가장 먼저 봐야 할 기준을 좁히고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "맞춤회복 해설을 쓰고 있어요",
        detail: "카테고리별로 꼭 봐야 할 해설을 정리하고 있습니다.",
        durationMs: 11000,
      },
      {
        title: "추천 행동을 다듬고 있어요",
        detail: "바로 실행할 행동을 겹치지 않게 정리하고 있습니다.",
        durationMs: 11000,
      },
      {
        title: "오늘 오더 흐름을 정리하고 있어요",
        detail: "해설과 이어지는 실행 순서를 함께 묶고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "문장을 더 간단히 다듬고 있어요",
        detail: "바로 이해되는 표현만 남기고 있습니다.",
        durationMs: 9000,
      },
      {
        title: "결과를 화면에 반영할 준비 중이에요",
        detail: "완료되면 바로 현재 페이지에 보여드립니다.",
        durationMs: 9000,
      },
    ],
  },
  orders: {
    title: "오늘의 오더를 정리하고 있어요",
    estimate: "보통 1~2분 정도 걸립니다.",
    steps: [
      {
        title: "기존 해설을 확인하고 있어요",
        detail: "현재 해설과 오늘 상태를 함께 읽고 있습니다.",
        durationMs: 9000,
      },
      {
        title: "실행 우선순위를 고르고 있어요",
        detail: "지금 먼저 해야 할 행동부터 다시 추리고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "오더 문장을 쓰고 있어요",
        detail: "체크 가능한 실행 문장으로 정리하고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "타이밍을 맞추고 있어요",
        detail: "자연스럽게 따라갈 수 있는 순서로 다듬고 있습니다.",
        durationMs: 10000,
      },
      {
        title: "설명을 간단히 다듬고 있어요",
        detail: "바로 이해되는 문장만 남기고 있습니다.",
        durationMs: 9000,
      },
      {
        title: "결과를 화면에 반영할 준비 중이에요",
        detail: "완료되면 바로 현재 페이지에 보여드립니다.",
        durationMs: 9000,
      },
    ],
  },
};

export function AIRecoveryLoadingOverlay({ mode, open }: AIRecoveryLoadingOverlayProps) {
  const copy = LOADING_COPY[mode];
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setCurrentIndex(0);
      const timeoutId = window.setTimeout(() => setVisible(true), 16);
      return () => window.clearTimeout(timeoutId);
    }
    setVisible(false);
    const timeoutId = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    let timeoutId: number | undefined;
    let cancelled = false;

    const scheduleNext = (index: number) => {
      if (index >= copy.steps.length - 1) return;
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setCurrentIndex(index + 1);
        scheduleNext(index + 1);
      }, copy.steps[index]!.durationMs);
    };

    setCurrentIndex(0);
    scheduleNext(0);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [open, copy.steps]);

  if (!mounted || !portalEl) return null;

  const currentStep = copy.steps[Math.min(currentIndex, copy.steps.length - 1)]!;

  return createPortal(
    <div
      className={cn("fixed inset-0 z-[120] transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")}
      aria-live="polite"
      aria-busy={open}
    >
      <div className="absolute inset-0 bg-white/55 backdrop-blur-xl" />
      <div
        className="relative flex min-h-[100dvh] items-center justify-center px-5"
        style={{
          paddingTop: "max(24px, env(safe-area-inset-top))",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "w-full max-w-[320px] rounded-[28px] border border-white/70 bg-white/90 px-6 py-7 text-center shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl transition-all duration-300",
            visible ? "translate-y-0 scale-100" : "translate-y-2 scale-[0.985]"
          )}
        >
          <div className="mx-auto flex h-9 w-14 items-center justify-center">
            <RNestMark className="h-7 w-12 text-[#161616]" />
          </div>
          <div className="mt-3 break-keep text-[24px] font-semibold leading-[1.25] tracking-[-0.05em] text-[#111827] sm:text-[26px]">
            {copy.title}
          </div>
          <p className="mt-3 break-keep text-[14px] leading-6 text-[#5F6B7C]">{copy.estimate}</p>
          <div key={`${mode}:${currentIndex}`} className="mt-8">
            <div className="break-keep text-[20px] font-semibold leading-[1.4] tracking-[-0.04em] text-[#111827] sm:text-[22px]">
              {currentStep.title}
            </div>
            <p className="mt-3 break-keep text-[15px] leading-7 text-[#5F6B7C]">{currentStep.detail}</p>
          </div>
        </div>
      </div>
    </div>,
    portalEl
  );
}
