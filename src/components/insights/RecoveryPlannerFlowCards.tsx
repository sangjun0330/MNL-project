"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { DetailCard, DetailChip } from "@/components/pages/insights/InsightDetailShell";
import type { AIPlannerChecklistItem, AIPlannerChecklistModule, AIPlannerExplanationModule } from "@/lib/aiRecoveryPlanner";

function SurfaceLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.16em]" style={{ color }}>
      {children}
    </div>
  );
}

function LinkChevron() {
  return <div className="text-[24px] text-ios-muted">›</div>;
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
        style={{ background: "linear-gradient(180deg, rgba(249,250,254,0.98) 0%, #FFFFFF 78%)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-[680px]">
            <SurfaceLabel color="var(--rnest-accent)">AI CUSTOMIZED RECOVERY</SurfaceLabel>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{module.title}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">
              {ready ? module.headline : "오늘 회복 우선순위를 아직 분석하지 않았어요."}
            </p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">
              {ready
                ? module.summary
                : "상세 페이지에서 필수 기록을 확인한 뒤 AI 맞춤회복을 시작하면, 오늘 회복의 기준을 먼저 정리합니다."}
            </p>
          </div>
          <LinkChevron />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <DetailChip color="#1B2747">{focusLabel ? `회복 포커스 ${focusLabel}` : "오늘 회복"}</DetailChip>
          <DetailChip color="#5E6C84">{ready ? "상세에서 전체 보기" : "상세에서 분석 시작"}</DetailChip>
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
        style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-[680px]">
            <SurfaceLabel color="#1B2747">TODAY ORDERS</SurfaceLabel>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{module.title}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">
              {ready ? module.headline : "AI 맞춤회복을 시작하면 오늘의 오더가 생성돼요."}
            </p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">
              {ready ? module.summary : "허브에서는 최소한만 보여주고, 상세 페이지에서 체크리스트 전체를 확인할 수 있어요."}
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
            style={{ backgroundColor: "#F4F7FC", color: "#1B2747" }}
          >
            {item.when}
          </span>
          <div className="mt-3 break-keep text-[17px] font-bold leading-7 tracking-[-0.02em] text-ios-text">{item.title}</div>
          <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{item.body}</p>
        </div>
      </div>
    </DetailCard>
  );
}
