"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";

const STEPS = 3;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-black" : "w-2 bg-black/20"
          )}
        />
      ))}
    </div>
  );
}

function StepIcon({ step }: { step: number }) {
  if (step === 0) {
    // Calendar icon
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="10" width="28" height="24" rx="4" stroke="white" strokeWidth="2.5" fill="none" />
          <line x1="6" y1="18" x2="34" y2="18" stroke="white" strokeWidth="2" />
          <line x1="14" y1="6" x2="14" y2="14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="26" y1="6" x2="26" y2="14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="15" cy="24" r="2" fill="white" />
          <circle cx="20" cy="24" r="2" fill="white" />
          <circle cx="25" cy="24" r="2" fill="white" />
          <circle cx="15" cy="30" r="2" fill="white" />
          <circle cx="20" cy="30" r="2" fill="white" />
        </svg>
      </div>
    );
  }
  if (step === 1) {
    // Health record icon
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="8" y="6" width="24" height="28" rx="4" stroke="white" strokeWidth="2.5" fill="none" />
          <line x1="14" y1="14" x2="26" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="14" y1="20" x2="24" y2="20" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="14" y1="26" x2="20" y2="26" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M24 24 L26 26.5 L30 22" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  // Insights icon
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-violet-400 to-purple-600 shadow-lg">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="8" y="28" width="5" height="8" rx="1.5" fill="white" opacity="0.7" transform="rotate(180 10.5 32)" />
        <rect x="15.5" y="22" width="5" height="14" rx="1.5" fill="white" opacity="0.85" transform="rotate(180 18 29)" />
        <rect x="23" y="16" width="5" height="20" rx="1.5" fill="white" transform="rotate(180 25.5 26)" />
        <circle cx="28" cy="12" r="4" stroke="white" strokeWidth="2" fill="none" />
        <path d="M30.5 9.5L33 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

type Props = {
  open: boolean;
  onComplete: () => void;
};

export function OnboardingGuide({ open, onComplete }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setStep(0);
      const timer = setTimeout(() => setVisible(true), 30);
      return () => clearTimeout(timer);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), 400);
    return () => clearTimeout(timer);
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  const handleNext = useCallback(() => {
    if (step < STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [step, onComplete]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  if (!mounted || !portalEl) return null;

  const titles = [
    t("캘린더에 근무를 입력하세요"),
    t("매일 건강 상태를 기록하세요"),
    t("맞춤 인사이트를 받아보세요"),
  ];
  const descriptions = [
    t("캘린더에서 날짜를 누르고 근무를 설정하세요.\n근무 패턴이 회복 분석의 기반이 됩니다."),
    t("일정 탭에서 날짜를 누르고 수면, 스트레스, 기분 등을 입력하세요.\n하루에 하나만 입력해도 충분합니다."),
    t("3일 이상 기록하면 Body·Mental 배터리가 나타납니다.\n기록할수록 회복 처방이 더 정교해져요."),
  ];

  const isLast = step === STEPS - 1;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-400",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="relative flex h-full w-full max-w-[460px] flex-col items-center justify-between px-6 py-safe">
        {/* Skip button */}
        <div className="flex w-full justify-end pt-4">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-ios-muted transition-colors active:bg-black/5"
          >
            {t("건너뛰기")}
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-2">
          <div
            key={step}
            className="flex flex-col items-center gap-5 animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <StepIcon step={step} />
            <div className="text-center">
              <h2 className="text-[22px] font-bold tracking-[-0.02em] text-ios-text">
                {titles[step]}
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-ios-sub">
                {descriptions[step]}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex w-full flex-col items-center gap-4 pb-8">
          <StepIndicator current={step} total={STEPS} />
          <button
            type="button"
            onClick={handleNext}
            className="h-12 w-full rounded-2xl bg-black text-[15px] font-semibold text-white shadow-apple transition-transform active:scale-[0.97]"
          >
            {isLast ? t("시작하기") : t("다음")}
          </button>
        </div>
      </div>
    </div>,
    portalEl
  );
}
