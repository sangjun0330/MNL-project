"use client";

import type { Shift } from "@/lib/types";
import { useI18n } from "@/lib/useI18n";

export type TrendPoint = {
  label: string; // e.g. 01/24
  body: number; // 0..100
  mental: number; // 0..100
  shift: Shift;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function shiftFill(shift: Shift) {
  // 배경 바탕색: 근무 유형에 따라 아주 연하게
  switch (shift) {
    case "D":
      return "rgba(59,130,246,0.10)";
    case "E":
      return "rgba(99,102,241,0.10)";
    case "N":
      return "rgba(168,85,247,0.12)";
    case "M":
      return "rgba(6,182,212,0.12)";
    case "OFF":
      return "rgba(16,185,129,0.10)";
    case "VAC":
      return "rgba(245,158,11,0.10)";
  }
}

function buildPath(xs: number[], ys: number[]) {
  if (!xs.length) return "";
  let d = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 1; i < xs.length; i++) d += ` L ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`;
  return d;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const { t } = useI18n();
  const W = 680;
  const H = 220;
  const padX = 14;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const n = data.length;
  if (n === 0) {
    return <div className="rounded-2xl border border-ios-sep bg-white p-4 text-[12.5px] text-ios-muted">{t("데이터가 없어요")}</div>;
  }

  const xs = data.map((_, i) => padX + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1)));
  const y = (v: number) => padY + (1 - clamp(v, 0, 100) / 100) * innerH;
  const ysBody = data.map((p) => y(p.body));
  const ysMental = data.map((p) => y(p.mental));

  const pathBody = buildPath(xs, ysBody);
  const pathMental = buildPath(xs, ysMental);

  // 배경 밴드(근무)
  const bandW = n === 1 ? innerW : innerW / n;

  return (
    <div className="rounded-2xl border border-ios-sep bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold">{t("에너지 흐름")}</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">{t("배경 색은 근무 유형을 의미해요")}</div>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-ios-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#00C7BE]" /> {t("신체")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#FF8A80]" /> {t("멘탈")}
          </span>
        </div>
      </div>

      <div
        className="mt-3 overflow-x-auto touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
          {/* background bands */}
          {data.map((p, i) => {
            const x0 = padX + i * bandW;
            return <rect key={i} x={x0} y={padY} width={bandW + 0.5} height={innerH} fill={shiftFill(p.shift)} />;
          })}

          {/* grid lines */}
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={padX} y1={y(t)} x2={W - padX} y2={y(t)} stroke="rgba(0,0,0,0.07)" strokeWidth={1} />
              <text x={padX} y={y(t) - 2} fontSize={10} fill="rgba(0,0,0,0.40)">
                {t}
              </text>
            </g>
          ))}

          {/* lines */}
          <path d={pathBody} fill="none" stroke="#00C7BE" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
          <path d={pathMental} fill="none" stroke="#FF8A80" strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />

          {/* dots */}
          {data.map((p, i) => (
            <g key={i}>
              <circle cx={xs[i]} cy={ysBody[i]} r={3} fill="#00C7BE" />
              <circle cx={xs[i]} cy={ysMental[i]} r={3} fill="#FF8A80" />
            </g>
          ))}

          {/* x labels (sparse) */}
          {data.map((p, i) => {
            const show = n <= 10 ? true : i === 0 || i === n - 1 || i % Math.ceil(n / 6) === 0;
            if (!show) return null;
            return (
              <text key={i} x={xs[i]} y={H - 4} fontSize={10} fill="rgba(0,0,0,0.45)" textAnchor="middle">
                {p.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
