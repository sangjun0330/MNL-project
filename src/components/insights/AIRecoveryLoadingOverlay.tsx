"use client";

import { useEffect, useMemo, useState } from "react";
import { RNestMark } from "@/components/brand/RNestLogo";
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
};

const LOADING_COPY: Record<LoadingMode, LoadingCopy> = {
  recovery: {
    eyebrow: "AI CUSTOMIZED RECOVERY",
    title: "AI 맞춤회복을 준비하고 있어요",
    estimate: "보통 12~18초 정도 걸립니다.",
    helper: "네트워크 상태나 데이터 양에 따라 조금 달라질 수 있어요.",
    steps: [
      {
        title: "건강 데이터를 확인하고 있어요",
        detail: "오늘 수면과 최근 기록을 먼저 모아서 읽고 있습니다.",
        durationMs: 1700,
      },
      {
        title: "회복 흐름을 분석하고 있어요",
        detail: "최근 회복 패턴과 반복 신호를 비교하고 있습니다.",
        durationMs: 2200,
      },
      {
        title: "교대근무 리듬을 맞추고 있어요",
        detail: "다음 근무와 현재 컨디션 흐름을 함께 정리하고 있습니다.",
        durationMs: 1900,
      },
      {
        title: "맞춤회복 해설을 작성하고 있어요",
        detail: "오늘 먼저 봐야 할 카테고리별 해설을 만들고 있습니다.",
        durationMs: 2800,
      },
      {
        title: "추천 행동을 다듬고 있어요",
        detail: "바로 실행할 수 있는 행동 2개씩을 정교하게 정리하고 있습니다.",
        durationMs: 2200,
      },
      {
        title: "오늘의 오더까지 묶고 있어요",
        detail: "결과를 검토한 뒤 화면에 반영할 준비를 마무리하고 있습니다.",
        durationMs: 1800,
      },
    ],
  },
  orders: {
    eyebrow: "TODAY ORDERS",
    title: "오늘의 오더를 다시 정리하고 있어요",
    estimate: "보통 8~12초 정도 걸립니다.",
    helper: "이미 생성된 해설을 기준으로 체크리스트를 다시 다듬고 있어요.",
    steps: [
      {
        title: "기존 해설을 불러오고 있어요",
        detail: "현재 맞춤회복 해설과 오늘 상태를 함께 확인하고 있습니다.",
        durationMs: 1300,
      },
      {
        title: "실행 우선순위를 고르고 있어요",
        detail: "지금 바로 할 행동과 뒤로 미룰 행동을 다시 정리하고 있습니다.",
        durationMs: 1800,
      },
      {
        title: "오더 문장을 정리하고 있어요",
        detail: "체크 가능한 실행 문장으로 다시 쓰고 있습니다.",
        durationMs: 2000,
      },
      {
        title: "타이밍을 맞추고 있어요",
        detail: "지금, 근무 중, 퇴근 후 흐름으로 순서를 다듬고 있습니다.",
        durationMs: 1700,
      },
      {
        title: "최종 확인 중이에요",
        detail: "체크리스트 저장과 화면 반영 직전 단계입니다.",
        durationMs: 1500,
      },
    ],
  },
};

function getCurrentStepIndex(steps: LoadingStep[], elapsedMs: number) {
  let boundary = 0;
  for (let index = 0; index < steps.length; index += 1) {
    boundary += steps[index]!.durationMs;
    if (elapsedMs < boundary) return index;
  }
  return steps.length - 1;
}

function LoadingStepRow({
  step,
  index,
  currentIndex,
}: {
  step: LoadingStep;
  index: number;
  currentIndex: number;
}) {
  const done = index < currentIndex;
  const active = index === currentIndex;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[18px] px-3 py-2 transition",
        active ? "bg-[#F6F8FD]" : "bg-transparent"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          done ? "bg-[#111827] text-white" : active ? "bg-[#DDE7FF] text-[#315CA8]" : "bg-[#EEF1F5] text-[#98A2B3]"
        )}
      >
        {done ? "✓" : index + 1}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <div className={cn("text-[13px] font-semibold", active || done ? "text-[#111827]" : "text-[#98A2B3]")}>{step.title}</div>
        {active ? <p className="mt-1 break-keep text-[12px] leading-5 text-[#667085]">{step.detail}</p> : null}
      </div>
    </div>
  );
}

export function AIRecoveryLoadingOverlay({ mode }: AIRecoveryLoadingOverlayProps) {
  const copy = LOADING_COPY[mode];
  const totalDurationMs = useMemo(() => copy.steps.reduce((sum, step) => sum + step.durationMs, 0), [copy.steps]);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const update = () => setElapsedMs(performance.now() - startedAt);
    update();
    const id = window.setInterval(update, 120);
    return () => window.clearInterval(id);
  }, [mode]);

  const currentIndex = getCurrentStepIndex(copy.steps, elapsedMs);
  const currentStep = copy.steps[currentIndex] ?? copy.steps[copy.steps.length - 1]!;
  const progressPct = Math.min(elapsedMs / totalDurationMs, 1) * 100;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/90 px-6 backdrop-blur-sm">
      <div className="max-h-[82vh] w-full max-w-[360px] overflow-auto rounded-[30px] border border-black/[0.06] bg-white px-6 py-7 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(236,239,244,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_16px_30px_rgba(15,23,42,0.08)]">
          <RNestMark className="h-[52px] w-[88px]" />
        </div>

        <div className="mt-5 text-center">
          <div className="text-[10.5px] font-semibold tracking-[0.22em] text-[#8A93A3]">{copy.eyebrow}</div>
          <div className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-[#111827]">{copy.title}</div>
          <p className="mt-2 break-keep text-[13px] leading-6 text-[#667085]">
            {copy.estimate}
            <br />
            {copy.helper}
          </p>
        </div>

        <div className="mt-5 rounded-[24px] bg-[#F7F8FB] p-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#8A93A3]">
              현재 단계 {currentIndex + 1}/{copy.steps.length}
            </div>
            <div className="text-[11px] font-medium text-[#98A2B3]">{Math.round(progressPct)}%</div>
          </div>
          <div className="mt-2 text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">{currentStep.title}</div>
          <p className="mt-1 break-keep text-[12.5px] leading-5 text-[#667085]">{currentStep.detail}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2E5BFF_0%,#7A96FF_100%)] transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-4 space-y-1">
          {copy.steps.map((step, index) => (
            <LoadingStepRow key={`${mode}:${step.title}`} step={step} index={index} currentIndex={currentIndex} />
          ))}
        </div>
      </div>
    </div>
  );
}
