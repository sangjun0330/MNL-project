"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { DailyVital } from "@/lib/vitals";
import { aggregateFactors, FACTOR_LABEL_KO, topFactors, type FactorKey } from "@/lib/insightsV2";
import { useI18n } from "@/lib/useI18n";

const INSIGHT_BLUE = "#007AFF";
const INSIGHT_NAVY = "#1B2747";
const INSIGHT_PINK = "#E87485";

type Segment = {
  key: FactorKey;
  label: string;
  pct: number; // 0..1
  color: string;
};

function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function pctLabel(p01: number) {
  const p = clamp(p01, 0, 1) * 100;
  return `${Math.round(p)}%`;
}

function colorForFactor(k: FactorKey) {
  switch (k) {
    case "activity":
      return INSIGHT_BLUE;
    case "stress":
      return INSIGHT_PINK;
    case "mood":
      return INSIGHT_PINK;
    case "menstrual":
      return INSIGHT_PINK;
    case "caffeine":
      return INSIGHT_NAVY;
    case "shift":
      return INSIGHT_NAVY;
    case "sleep":
    default:
      return INSIGHT_BLUE;
  }
}

function Donut({ segments }: { segments: Segment[] }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="block">
      <g transform="rotate(-90 60 60)">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="14" />
        {segments
          .filter((s) => s.pct > 0.001)
          .map((s) => {
            const dash = c * s.pct;
            const gap = c - dash;
            const el = (
              <circle
                key={s.key}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-c * acc}
              />
            );
            acc += s.pct;
            return el;
          })}
      </g>
      <circle cx="60" cy="60" r="28" fill="#fff" />
    </svg>
  );
}

export function BatteryThieves({ vitals, periodLabel, className }: { vitals: DailyVital[]; periodLabel?: string; className?: string }) {
  const { t } = useI18n();
  const segments = useMemo(() => {
    const agg = aggregateFactors(vitals);
    const keys = Object.keys(agg) as FactorKey[];
    return keys
      .map((k) => ({
        key: k,
        label: t(FACTOR_LABEL_KO[k]),
        pct: clamp(agg[k] ?? 0, 0, 1),
        color: colorForFactor(k),
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [vitals, t]);

  const top3 = useMemo(() => topFactors(vitals, 3), [vitals]);
  const top1 = top3?.[0];

  const avgDebt = useMemo(() => {
    if (!vitals.length) return 0;
    const sum = vitals.reduce((a, v) => a + (v.engine?.sleepDebtHours ?? 0), 0);
    return sum / Math.max(1, vitals.length);
  }, [vitals]);

  const message = useMemo(() => {
    if (!top1) return t("방전 요인을 계산할 데이터가 없어요.");
    const base = t("{label}이(가) 전체 소모의 {pct}를 차지했어요.", {
      label: top1.label,
      pct: pctLabel(top1.pct),
    });
    if (top1.key === "sleep") {
      return t("{base} · 평균 수면부채 {debt}h.", {
        base,
        debt: Math.round(avgDebt * 10) / 10,
      });
    }
    return base;
  }, [top1, avgDebt, t]);

  return (
    <div className={cn("rounded-apple border border-ios-sep bg-white shadow-apple", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="text-[12px] font-semibold text-ios-sub">Battery Thieves</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{t("에너지 도둑 분석")}</div>
        </div>
        <div className="text-[12.5px] text-ios-muted">{periodLabel ?? t("최근 7일 기준")}</div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="text-center text-[15px] font-semibold tracking-[-0.01em]">{message}</div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
          <div className="mx-auto">
            <Donut segments={segments} />
          </div>

          <div className="space-y-2">
            {(top3 ?? []).map((r) => (
              <div
                key={r.key}
                className="flex items-center justify-between rounded-2xl border border-ios-sep bg-white/90 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForFactor(r.key) }} />
                  <div className="text-[13px] font-semibold">{r.label}</div>
                </div>
                <div className="text-[13px] font-semibold text-ios-sub">{pctLabel(r.pct)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-[12.5px] text-ios-muted">{t("팁: 도둑 1~2개만 잡아도 체감 피로가 크게 줄어요.")}</div>
      </div>
    </div>
  );
}
