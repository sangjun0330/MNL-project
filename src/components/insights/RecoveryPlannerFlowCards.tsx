"use client";

import Link from "next/link";
import { DetailCard, DetailChip } from "@/components/pages/insights/InsightDetailShell";
import type { AIPlannerChecklistItem, AIPlannerChecklistModule, AIPlannerExplanationModule } from "@/lib/aiRecoveryPlanner";

function SurfaceLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.16em]" style={{ color }}>
      {children}
    </div>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] bg-ios-bg px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{label}</div>
      <div className="mt-1 break-keep text-[14px] font-semibold leading-6 text-ios-text">{value}</div>
    </div>
  );
}

function OrderPreviewRow({ item }: { item: AIPlannerChecklistItem }) {
  return (
    <div className="rounded-[20px] bg-ios-bg px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <DetailChip color="#1B2747">{item.when}</DetailChip>
        {item.chips?.slice(0, 2).map((chip) => (
          <DetailChip key={`${item.id}-${chip}`} color="#5E6C84">
            {chip}
          </DetailChip>
        ))}
      </div>
      <div className="mt-3 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{item.title}</div>
      <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{item.body}</p>
    </div>
  );
}

export function RecoveryAIOverviewLinkCard({
  href,
  module,
  focusLabel,
  primaryAction,
  avoidAction,
}: {
  href: string;
  module: AIPlannerExplanationModule;
  focusLabel: string | null;
  primaryAction: string | null;
  avoidAction: string | null;
}) {
  return (
    <Link href={href} className="block">
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{ background: "linear-gradient(180deg, rgba(249,250,254,0.98) 0%, #FFFFFF 78%)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[680px]">
            <SurfaceLabel color="var(--rnest-accent)">AI CUSTOMIZED RECOVERY</SurfaceLabel>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{module.title}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">{module.headline}</p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{module.summary}</p>
          </div>
          <div className="text-[24px] text-ios-muted">›</div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <MetricTile label="회복 포커스" value={focusLabel ?? "오늘 회복"} />
          <MetricTile label="지금 할 1개" value={primaryAction ?? "회복 행동 하나만 먼저 시작해요."} />
          <MetricTile label="피해야 할 것" value={avoidAction ?? "늦은 자극과 과한 일정"} />
        </div>
      </DetailCard>
    </Link>
  );
}

export function RecoveryOrdersLinkCard({
  href,
  module,
  activeItems,
  completedCount,
}: {
  href: string;
  module: AIPlannerChecklistModule;
  activeItems: AIPlannerChecklistItem[];
  completedCount: number;
}) {
  const preview = activeItems.slice(0, 2);
  return (
    <Link href={href} className="block">
      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[680px]">
            <SurfaceLabel color="#1B2747">TODAY ORDERS</SurfaceLabel>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{module.title}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">{module.headline}</p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{module.summary}</p>
          </div>
          <div className="text-[24px] text-ios-muted">›</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <DetailChip color="#1B2747">남은 오더 {activeItems.length}개</DetailChip>
          {completedCount > 0 ? <DetailChip color="#5E6C84">완료 {completedCount}개</DetailChip> : null}
        </div>

        <div className="mt-5 grid gap-3">
          {preview.length ? (
            preview.map((item) => <OrderPreviewRow key={item.id} item={item} />)
          ) : (
            <div className="rounded-[20px] bg-ios-bg px-4 py-4 text-[14px] leading-6 text-ios-sub">
              오늘의 오더를 모두 완료했어요. 필요하면 상세 페이지에서 전체 흐름을 다시 확인할 수 있어요.
            </div>
          )}
        </div>
      </DetailCard>
    </Link>
  );
}

export function RecoveryChecklistItemCard({
  item,
  onComplete,
}: {
  item: AIPlannerChecklistItem;
  onComplete: (id: string) => void;
}) {
  return (
    <DetailCard className="overflow-hidden px-5 py-5 sm:px-6">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => onComplete(item.id)}
          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1B2747] bg-white text-[12px] text-[#1B2747] transition hover:bg-[#1B2747] hover:text-white"
          aria-label={`${item.title} 완료`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DetailChip color="#1B2747">{item.when}</DetailChip>
            {item.chips?.slice(0, 3).map((chip) => (
              <DetailChip key={`${item.id}-${chip}`} color="#5E6C84">
                {chip}
              </DetailChip>
            ))}
          </div>
          <div className="mt-3 break-keep text-[18px] font-bold leading-7 tracking-[-0.02em] text-ios-text">{item.title}</div>
          <p className="mt-2 break-keep text-[14px] leading-6 text-ios-text">{item.body}</p>
          {item.reason ? <p className="mt-3 break-keep text-[13px] leading-6 text-ios-sub">{item.reason}</p> : null}
        </div>
      </div>
    </DetailCard>
  );
}
