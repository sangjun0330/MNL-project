"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DetailCard, DetailChip } from "@/components/pages/insights/InsightDetailShell";
import type { AIPlannerChecklistItem, AIPlannerChecklistModule, AIPlannerExplanationModule } from "@/lib/aiRecoveryPlanner";

function clampText(lines: number): CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

function SurfaceLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="text-[10.5px] font-semibold tracking-[0.18em]" style={{ color }}>
      {children}
    </div>
  );
}

function LinkChevron() {
  return <div className="text-[24px] text-black/28">›</div>;
}

export function RecoveryPhaseTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(251,252,255,0.96)_0%,rgba(245,247,252,0.96)_100%)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_12px_32px_rgba(15,36,74,0.05)]">
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => !item.disabled && onChange(item.value)}
              disabled={item.disabled}
              className={cn(
                "min-w-0 rounded-[18px] px-3 py-3 text-left transition-all duration-200",
                active
                  ? "bg-white shadow-[0_10px_24px_rgba(18,35,73,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]"
                  : "bg-transparent",
                item.disabled ? "opacity-45" : "hover:bg-white/70"
              )}
            >
              <div className={cn("text-[13px] font-semibold tracking-[-0.02em]", active ? "text-[#17386D]" : "text-ios-sub")}>
                {item.label}
              </div>
              {item.hint ? (
                <div className={cn("mt-1 text-[11px] leading-4", active ? "text-[#5B6B88]" : "text-black/34")}>
                  {item.hint}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RecoveryAIOverviewLinkCard({
  href,
  module,
  focusLabel,
  ready,
}: {
  href: string;
  module: AIPlannerExplanationModule;
  focusLabel: string | null;
  ready: boolean;
}) {
  return (
    <Link href={href} className="block">
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-[680px]">
            <SurfaceLabel color="var(--rnest-accent)">AI CUSTOMIZED RECOVERY</SurfaceLabel>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{module.title}</div>
            <p className="mt-3 break-keep text-[16px] font-bold leading-7 tracking-[-0.03em] text-ios-text" style={clampText(2)}>
              {ready ? module.headline : "오늘 회복 우선순위를 아직 분석하지 않았어요."}
            </p>
            <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub" style={clampText(2)}>
              {ready
                ? module.summary
                : "상세 페이지에서 필수 기록을 확인한 뒤 AI 맞춤회복을 시작하면, 오늘 회복의 기준을 먼저 정리합니다."}
            </p>
          </div>
          <LinkChevron />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <DetailChip color="#1B2747">{focusLabel ? `회복 포커스 ${focusLabel}` : "오늘 회복"}</DetailChip>
          <DetailChip color="#5E6C84">{ready ? "상세 보기" : "분석 시작"}</DetailChip>
        </div>
      </DetailCard>
    </Link>
  );
}

export function RecoveryOrdersLinkCard({
  href,
  module,
  ready,
  activeCount,
  completedCount,
}: {
  href: string;
  module: AIPlannerChecklistModule;
  ready: boolean;
  activeCount: number | null;
  completedCount: number | null;
}) {
  return (
    <Link href={href} className="block">
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(248,250,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-[680px]">
            <SurfaceLabel color="#1B2747">TODAY ORDERS</SurfaceLabel>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{ready ? "오늘의 오더" : module.title}</div>
            <p className="mt-3 break-keep text-[16px] font-bold leading-7 tracking-[-0.03em] text-ios-text" style={clampText(2)}>
              {ready ? module.items?.[0]?.title ?? module.headline : "AI 맞춤회복을 시작하면 오늘의 오더가 생성돼요."}
            </p>
            <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub" style={clampText(2)}>
              {ready
                ? module.items?.[0]?.body ?? module.summary
                : "허브에서는 최소한만 보여주고, 상세 페이지에서 체크리스트 전체를 확인할 수 있어요."}
            </p>
          </div>
          <LinkChevron />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ready && activeCount != null ? <DetailChip color="#1B2747">남은 오더 {activeCount}개</DetailChip> : null}
          {ready && completedCount != null ? <DetailChip color="#5E6C84">완료 {completedCount}개</DetailChip> : null}
          {!ready ? <DetailChip color="#5E6C84">AI 맞춤회복 후 생성</DetailChip> : null}
        </div>
      </DetailCard>
    </Link>
  );
}

export function RecoveryChecklistItemCard({
  item,
  completing = false,
  onComplete,
}: {
  item: AIPlannerChecklistItem;
  completing?: boolean;
  onComplete: (id: string) => void;
}) {
  return (
      <DetailCard
        className={cn(
        "overflow-hidden px-5 py-5 sm:px-6 transition-[opacity,transform,filter] duration-300",
        completing ? "rnest-order-card-exit pointer-events-none" : ""
      )}
      style={{
        background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 14px 34px rgba(15,36,74,0.05)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
          <button
            type="button"
            onClick={() => onComplete(item.id)}
            disabled={completing}
            aria-pressed={completing}
            aria-label={`${item.title} 완료`}
            className={cn(
              "relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300",
              completing
                ? "rnest-order-check-pop border-[#163B73] bg-[#163B73] text-white shadow-[0_12px_24px_rgba(15,79,203,0.18)]"
                : "border-[#1B2747] bg-white text-transparent hover:border-[#163B73] hover:bg-[#EEF4FF]"
            )}
          >
            <svg viewBox="0 0 20 20" className={cn("h-4 w-4 transition-all duration-200", completing ? "scale-100 opacity-100" : "scale-75 opacity-0")} fill="none" aria-hidden="true">
              <path d="M5 10.2 8.2 13.5 15 6.7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {completing ? (
            <>
              <span className="rnest-order-sparkle pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[#91BFFF]" style={{ animationDelay: "0ms", transform: "translate(-50%, -50%)" }} />
              <span className="rnest-order-sparkle pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[#B7D4FF]" style={{ animationDelay: "40ms", transform: "translate(-50%, -50%)" }} />
              <span className="rnest-order-sparkle pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[#DDEAFF]" style={{ animationDelay: "80ms", transform: "translate(-50%, -50%)" }} />
              <span className="rnest-order-float-badge pointer-events-none absolute -right-5 -top-3 rounded-full bg-[#EEF4FF] px-2 py-1 text-[10px] font-semibold text-[#0F4FCB] shadow-apple-sm">
                완료
              </span>
            </>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: "#F5F8FF", color: "#365487", boxShadow: "inset 0 0 0 1px rgba(54,84,135,0.08)" }}
          >
            {item.when}
          </span>
          <div className="mt-3 break-keep text-[16px] font-bold leading-7 tracking-[-0.02em] text-ios-text">{item.title}</div>
          <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub">{item.body}</p>
        </div>
      </div>
    </DetailCard>
  );
}
