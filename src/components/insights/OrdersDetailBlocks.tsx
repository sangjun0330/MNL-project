"use client";

import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";
import type { AppState } from "@/lib/model";
import { useRecoveryPlanData } from "@/components/insights/RecoveryPrescription";
import { shiftKo } from "@/components/insights/useInsightsData";
import {
  DetailCard,
  DetailChip,
  DetailSummaryCard,
  DETAIL_ACCENTS,
} from "@/components/pages/insights/InsightDetailShell";

type OrdersSummary = {
  count: number;
  headline: string;
};

type Props = {
  state: AppState;
  pivotISO: ISODate;
  todayShift: Shift;
  ordersSummary: OrdersSummary;
  className?: string;
  showSummary?: boolean;
};

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function OrdersDetailBlocks({
  state,
  pivotISO,
  todayShift,
  ordersSummary,
  className,
  showSummary = true,
}: Props) {
  const { orderOneLiners, orders, nextDuty } = useRecoveryPlanData(state, pivotISO);

  return (
    <div className={cn("space-y-4", className)}>
      {showSummary ? (
        <DetailSummaryCard
          accent="navy"
          label="Dr. WNL's Orders"
          title="오늘 오더"
          metric={ordersSummary.count}
          metricLabel="Orders"
          summary={(
            <>
              <span className="font-bold">즉시 실행 오더</span> · {ordersSummary.headline}
            </>
          )}
          detail="작은 오더부터 실행하면 회복 효율이 올라갑니다."
          chips={(
            <>
              <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip>
              <DetailChip color={DETAIL_ACCENTS.navy}>내일 {shiftKo(nextDuty)}</DetailChip>
            </>
          )}
        />
      ) : null}

      <DetailCard>
        <div className="px-5 pt-5">
          <div className="text-[12px] font-semibold text-ios-sub">Priority Orders</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">오늘의 우선순위 오더 TOP 3</div>
        </div>
        <div className="space-y-3 px-5 pb-5 pt-4">
          {orderOneLiners.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12.5px] text-ios-muted">
              데이터가 부족합니다. 수면/카페인/기분 중 1개만 입력해도 추천이 더 정교해집니다.
            </div>
          ) : (
            orderOneLiners.slice(0, 3).map((o) => (
              <div key={o.key} className="rounded-2xl border border-ios-sep bg-white/90 p-4 shadow-apple-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DetailChip color={DETAIL_ACCENTS.navy}>오더 {o.rank}</DetailChip>
                    <div className="text-[14px] font-bold text-ios-text">{o.title}</div>
                    <div className="text-[12px] text-ios-muted">{pct(o.pct)}</div>
                  </div>
                  <DetailChip color={DETAIL_ACCENTS.navy}>내일 {shiftKo(nextDuty)}</DetailChip>
                </div>
                <div className="mt-2 text-[13px] text-ios-sub">{o.line.text}</div>
              </div>
            ))
          )}
        </div>
      </DetailCard>

      <DetailCard>
        <div className="px-5 pt-5">
          <div className="text-[12px] font-semibold text-ios-sub">Personalized Orders</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">맞춤 회복 오더</div>
        </div>
        <div className="space-y-3 px-5 pb-5 pt-4">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12.5px] text-ios-muted">
              데이터가 부족합니다. 수면/카페인/기분 중 1개만 입력해도 추천이 더 정교해집니다.
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.key} className="rounded-2xl border border-ios-sep bg-white/90 p-4 shadow-apple-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <DetailChip color={DETAIL_ACCENTS.navy}>오더 {o.rank}</DetailChip>
                      <div className="truncate text-[13px] font-semibold">드라이버 · {o.label}</div>
                      <div className="text-[12px] text-ios-muted">{pct(o.pct)}</div>
                    </div>
                  </div>
                  <DetailChip color={DETAIL_ACCENTS.navy}>내일 {shiftKo(nextDuty)}</DetailChip>
                </div>

                <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] text-ios-sub">
                  {o.lines.map((l, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {l.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </DetailCard>
    </div>
  );
}
