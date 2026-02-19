"use client";

import { cn } from "@/lib/cn";
import type { DailyVital } from "@/lib/vitals";
import { statusCopy, statusFromScore, statusLabel, vitalDisplayScore } from "@/lib/rnestInsight";
import { useI18n } from "@/lib/useI18n";

const INSIGHT_BLUE = "#007AFF";
const INSIGHT_NAVY = "#1B2747";
const INSIGHT_PINK = "#E87485";

function statusAccent(status: ReturnType<typeof statusFromScore>) {
  if (status === "stable") return INSIGHT_BLUE;
  if (status === "caution" || status === "observation") return INSIGHT_NAVY;
  return INSIGHT_PINK;
}

function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function CircleGauge({ value, color }: { value: number; color: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = clamp(value, 0, 100) / 100;
  const dash = c * pct;
  const gap = c - dash;
  const offset = c * 0.25; // start at top

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="block">
      <g transform={`rotate(-90 60 60)`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          strokeDashoffset={offset}
        />
      </g>
    </svg>
  );
}

export function HeroDashboard({
  vital,
  syncLabel,
  fastCharge,
  className,
}: {
  vital: DailyVital | null;
  syncLabel?: string;
  fastCharge?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const displayScore = vital ? vitalDisplayScore(vital) : 0;
  const status = statusFromScore(displayScore);
  const color = statusAccent(status);

  if (!vital) {
    return (
      <div className={cn("rounded-apple border border-ios-sep bg-white shadow-apple", className)}>
        <div
          className="relative overflow-hidden rounded-apple"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(255,255,255,1) 55%)",
          }}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ios-sub">RNest Vital</div>
              <div className="mt-3 text-[42px] font-extrabold leading-none tracking-[-0.03em] text-ios-muted">—</div>
              <div className="mt-2 text-[16px] font-semibold text-ios-text">{t("데이터가 없어요")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">{t("기록 입력 시 자세한 정보 제공")}</div>
            </div>

          <div className="shrink-0 text-right">
            {syncLabel ? (
              <div className="inline-flex max-w-[168px] items-center justify-end rounded-full border border-ios-sep bg-white px-3 py-1 text-[12px] font-semibold leading-tight text-ios-sub whitespace-normal text-right">
                {syncLabel}
              </div>
            ) : null}
            <div className="mt-2 flex justify-end">
              <CircleGauge value={0} color="rgba(0,0,0,0.2)" />
              </div>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="mt-2 h-3 w-full rounded-full bg-ios-bg">
              <div className="h-3 rounded-full" style={{ width: "0%", backgroundColor: "rgba(0,0,0,0.2)" }} />
            </div>
            <div className="mt-2 flex justify-between text-[11.5px] text-ios-muted">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-apple border border-ios-sep bg-white shadow-apple", className)}>
      <div
        className="relative overflow-hidden rounded-apple"
        style={{
          background:
            status === "stable"
              ? "linear-gradient(180deg, rgba(0,122,255,0.14), rgba(255,255,255,1) 55%)"
              : status === "caution"
              ? "linear-gradient(180deg, rgba(27,39,71,0.14), rgba(255,255,255,1) 55%)"
              : "linear-gradient(180deg, rgba(255,158,170,0.22), rgba(255,255,255,1) 55%)",
        }}
      >
        {/* Breathing glow */}
        <div
          className={cn(
            "pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full blur-3xl opacity-60",
            "animate-pulse"
          )}
          style={{ backgroundColor: color }}
        />

        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ios-sub">RNest Vital</div>
            <div className="mt-3 flex items-end gap-3">
              <div className="text-[52px] font-extrabold leading-none tracking-[-0.03em]" style={{ color }}>
                {displayScore}
              </div>
              {fastCharge ? (
                <div className="mb-2 rounded-full border border-ios-sep bg-white px-2.5 py-1 text-[12px] font-semibold">
                  <span className="mr-1">⚡️</span>
                  {t("급속 회복")}
                </div>
              ) : null}
            </div>
            <div className="mt-2 text-[16px] font-semibold">{t(statusLabel(status))}</div>
            <div className="mt-1 text-[13px] text-ios-sub">{t(statusCopy(status))}</div>
          </div>

          <div className="shrink-0 text-right">
            {syncLabel ? (
              <div className="inline-flex max-w-[168px] items-center justify-end rounded-full border border-ios-sep bg-white px-3 py-1 text-[12px] font-semibold leading-tight text-ios-sub whitespace-normal text-right">
                {syncLabel}
              </div>
            ) : null}
            <div className="mt-2 flex justify-end">
              <CircleGauge value={displayScore} color={color} />
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="mt-2 h-3 w-full rounded-full bg-ios-bg">
            <div className="h-3 rounded-full" style={{ width: `${clamp(displayScore, 0, 100)}%`, backgroundColor: color }} />
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-ios-muted">
            <span>0</span>
            <span>100</span>
          </div>
        </div>
      </div>
    </div>
  );
}
