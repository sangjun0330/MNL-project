"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";

const TOTAL_STEPS = 4;

/* ────────────────────────────────────────────
   Step dot indicator (Apple style)
   ──────────────────────────────────────────── */
function Dots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-[6px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block rounded-full transition-all duration-500 ease-[cubic-bezier(.4,0,.2,1)]",
            i === current
              ? "h-[7px] w-[7px] bg-black/80"
              : "h-[6px] w-[6px] bg-black/15"
          )}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────
   Large SF-Symbol-style emoji icons
   ──────────────────────────────────────────── */
function StepVisual({ step, animKey }: { step: number; animKey: number }) {
  const emojis = ["📅", "✏️", "📊", "💡"];
  return (
    <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[26px] bg-black/[0.03]">
      <span
        key={`icon-${animKey}`}
        className="text-[44px] leading-none animate-[onb-icon-pop_0.5s_cubic-bezier(0.175,0.885,0.32,1.1)_both]"
        style={{ animationDelay: "100ms" }}
      >
        {emojis[step]}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────
   Feature bullet
   ──────────────────────────────────────────── */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-[3px] block h-[5px] w-[5px] shrink-0 rounded-full bg-black/30" />
      <span className="text-[13.5px] leading-[1.55] text-black/55">{children}</span>
    </div>
  );
}

/* ────────────────────────────────────────────
   Main
   ──────────────────────────────────────────── */
type Props = {
  open: boolean;
  onComplete: () => void;
};

export function OnboardingGuide({ open, onComplete }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const animKey = useRef(0);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setStep(0);
      animKey.current = 0;
      const t1 = setTimeout(() => setVisible(true), 40);
      return () => clearTimeout(t1);
    }
    setVisible(false);
    const t2 = setTimeout(() => setMounted(false), 500);
    return () => clearTimeout(t2);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      setDirection("next");
      animKey.current += 1;
      setStep((s) => s + 1);
    } else {
      onComplete();
    }
  }, [step, onComplete]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection("prev");
      animKey.current += 1;
      setStep((s) => s - 1);
    }
  }, [step]);

  const skip = useCallback(() => onComplete(), [onComplete]);

  if (!mounted || !portalEl) return null;

  /* ── Content per step ── */
  const steps = [
    {
      title: t("근무 일정을 등록하세요"),
      desc: t("캘린더에서 날짜를 탭하고 근무 유형을 선택하세요"),
      tips: [
        t("Day · Eve · Night · Off 중 선택할 수 있어요"),
        t("길게 눌러 여러 날을 한번에 설정할 수 있어요"),
        t("근무 패턴이 회복 분석의 기반이 됩니다"),
      ],
    },
    {
      title: t("매일 건강을 기록하세요"),
      desc: t("하루 1분, 오늘의 컨디션만 입력하면 돼요"),
      tips: [
        t("수면 시간 · 수면 질 · 스트레스 · 기분을 기록해요"),
        t("카페인, 운동, 음주 등 세부 항목도 추가 가능해요"),
        t("하루에 하나만 입력해도 분석이 시작돼요"),
      ],
    },
    {
      title: t("나만의 통계를 확인하세요"),
      desc: t("3일 이상 기록하면 맞춤 인사이트가 열려요"),
      tips: [
        t("Body · Mental 배터리로 회복 상태를 한눈에 봐요"),
        t("근무 유형별 컨디션 변화를 그래프로 비교해요"),
        t("기록이 쌓일수록 분석이 더 정교해져요"),
      ],
    },
    {
      title: t("맞춤 회복 추천을 받으세요"),
      desc: t("AI가 당신의 패턴을 분석해 회복 방법을 알려줘요"),
      tips: [
        t("다음 근무 전 수면·수분·카페인 타이밍을 추천해요"),
        t("연속 야간 근무 시 맞춤 회복 전략을 제공해요"),
      ],
    },
  ];

  const cur = steps[step];
  const isLast = step === TOTAL_STEPS - 1;

  const slideClass =
    direction === "next"
      ? "animate-[onb-slide-in-right_0.45s_cubic-bezier(0.22,1,0.36,1)_both]"
      : "animate-[onb-slide-in-left_0.45s_cubic-bezier(0.22,1,0.36,1)_both]";

  return createPortal(
    <>
      {/* keyframe injection (only once) */}
      <style>{`
        @keyframes onb-slide-in-right {
          from { opacity: 0; transform: translateX(50px) scale(0.96); filter: blur(4px); }
          40%  { filter: blur(0); }
          to   { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
        }
        @keyframes onb-slide-in-left {
          from { opacity: 0; transform: translateX(-50px) scale(0.96); filter: blur(4px); }
          40%  { filter: blur(0); }
          to   { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
        }
        @keyframes onb-icon-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className={cn(
          "fixed inset-0 z-[100] bg-white transition-opacity duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          visible ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="mx-auto flex h-full max-w-[400px] flex-col px-7 pb-[env(safe-area-inset-bottom)]">
          {/* ── Top bar ── */}
          <div className="flex h-14 items-center justify-between pt-[env(safe-area-inset-top)]">
            {step > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="text-[15px] font-medium text-black/40 active:text-black/60"
              >
                {t("이전")}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={skip}
              className="text-[15px] font-medium text-black/40 active:text-black/60"
            >
              {t("건너뛰기")}
            </button>
          </div>

          {/* ── Content (animated) ── */}
          <div className="flex flex-1 flex-col justify-center">
            <div key={animKey.current} className={slideClass}>
              {/* Icon */}
              <div className="flex justify-center">
                <StepVisual step={step} animKey={animKey.current} />
              </div>

              {/* Title */}
              <h1 className="mt-7 text-center text-[26px] font-bold tracking-[-0.03em] text-black/90 leading-[1.25]">
                {cur.title}
              </h1>

              {/* Description */}
              <p className="mt-3 text-center text-[15px] leading-[1.6] text-black/50">
                {cur.desc}
              </p>

              {/* Tips */}
              <div className="mx-auto mt-7 flex max-w-[320px] flex-col gap-2.5">
                {cur.tips.map((tip, i) => (
                  <Tip key={i}>{tip}</Tip>
                ))}
              </div>
            </div>
          </div>

          {/* ── Bottom ── */}
          <div className="flex flex-col items-center gap-5 pb-8">
            <Dots current={step} total={TOTAL_STEPS} />
            <button
              type="button"
              onClick={goNext}
              className={cn(
                "h-[52px] w-full rounded-[14px] text-[16px] font-semibold transition-all duration-200 active:scale-[0.97]",
                isLast
                  ? "bg-black text-white shadow-[0_2px_12px_rgba(0,0,0,0.18)]"
                  : "bg-black/[0.06] text-black/80"
              )}
            >
              {isLast ? t("시작하기") : t("다음")}
            </button>
          </div>
        </div>
      </div>
    </>,
    portalEl
  );
}
