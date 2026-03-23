"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type LoadingMode = "recovery" | "orders";

type LoadingStep = {
  title: string;
  detail: string;
  durationMs: number;
};

type LoadingCopy = {
  eyebrow: string;
  title: string;
  estimate: string;
  helper: string;
  steps: LoadingStep[];
};

type AIRecoveryLoadingOverlayProps = {
  mode: LoadingMode;
  open: boolean;
};

const LOADING_COPY: Record<LoadingMode, LoadingCopy> = {
  recovery: {
    eyebrow: "AI CUSTOMIZED RECOVERY",
    title: "AI 맞춤회복을 준비하고 있어요",
    estimate: "보통 16~22초 정도 걸립니다.",
    helper: "완료되면 자동으로 닫히고 해설 화면으로 바로 돌아갑니다.",
    steps: [
      {
        title: "건강 데이터를 확인하고 있어요",
        detail: "오늘 수면과 최근 기록을 먼저 모아서 읽고 있습니다.",
        durationMs: 2600,
      },
      {
        title: "회복 흐름을 분석하고 있어요",
        detail: "최근 회복 패턴과 반복 신호를 비교하고 있습니다.",
        durationMs: 3000,
      },
      {
        title: "교대근무 리듬을 맞추고 있어요",
        detail: "다음 근무와 현재 컨디션 흐름을 함께 정리하고 있습니다.",
        durationMs: 2800,
      },
      {
        title: "맞춤회복 해설을 작성하고 있어요",
        detail: "오늘 먼저 봐야 할 카테고리별 해설을 만들고 있습니다.",
        durationMs: 3400,
      },
      {
        title: "추천 행동을 다듬고 있어요",
        detail: "바로 실행할 수 있는 행동 2개씩을 정교하게 정리하고 있습니다.",
        durationMs: 3200,
      },
      {
        title: "오늘의 오더까지 묶고 있어요",
        detail: "결과를 검토한 뒤 화면에 반영할 준비를 마무리하고 있습니다.",
        durationMs: 2600,
      },
    ],
  },
  orders: {
    eyebrow: "TODAY ORDERS",
    title: "오늘의 오더를 다시 정리하고 있어요",
    estimate: "보통 10~14초 정도 걸립니다.",
    helper: "완료되면 자동으로 닫히고 체크리스트만 남습니다.",
    steps: [
      {
        title: "기존 해설을 불러오고 있어요",
        detail: "현재 맞춤회복 해설과 오늘 상태를 함께 확인하고 있습니다.",
        durationMs: 2200,
      },
      {
        title: "실행 우선순위를 고르고 있어요",
        detail: "지금 바로 할 행동과 뒤로 미룰 행동을 다시 정리하고 있습니다.",
        durationMs: 2600,
      },
      {
        title: "오더 문장을 정리하고 있어요",
        detail: "체크 가능한 실행 문장으로 다시 쓰고 있습니다.",
        durationMs: 2900,
      },
      {
        title: "타이밍을 맞추고 있어요",
        detail: "지금, 근무 중, 퇴근 후 흐름으로 순서를 다듬고 있습니다.",
        durationMs: 2400,
      },
      {
        title: "최종 확인 중이에요",
        detail: "체크리스트 저장과 화면 반영 직전 단계입니다.",
        durationMs: 2200,
      },
    ],
  },
};

export function AIRecoveryLoadingOverlay({ mode, open }: AIRecoveryLoadingOverlayProps) {
  const copy = LOADING_COPY[mode];
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
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
            "w-full max-w-[420px] rounded-[34px] border border-white/70 bg-white/88 px-7 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-2xl transition-all duration-300",
            visible ? "translate-y-0 scale-100" : "translate-y-2 scale-[0.985]"
          )}
        >
          <div className="text-[10.5px] font-semibold tracking-[0.22em] text-[#98A2B3]">{copy.eyebrow}</div>
          <div className="mt-3 break-keep text-[30px] font-semibold leading-[1.2] tracking-[-0.05em] text-[#111827] sm:text-[32px]">
            {copy.title}
          </div>
          <p className="mt-4 break-keep text-[15px] leading-7 text-[#5F6B7C]">{copy.estimate}</p>

          <div className="mt-10 text-[12px] font-semibold tracking-[0.16em] text-[#98A2B3]">
            현재 단계 {currentIndex + 1} / {copy.steps.length}
          </div>
          <div key={`${mode}:${currentIndex}`} className="mt-4 animate-in fade-in duration-500">
            <div className="break-keep text-[24px] font-semibold leading-[1.35] tracking-[-0.04em] text-[#111827] sm:text-[26px]">
              {currentStep.title}
            </div>
            <p className="mt-4 break-keep text-[16px] leading-7 text-[#5F6B7C]">{currentStep.detail}</p>
          </div>

          <p className="mt-10 break-keep text-[13px] leading-6 text-[#98A2B3]">{copy.helper}</p>
        </div>
      </div>
    </div>,
    portalEl
  );
}
