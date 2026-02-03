"use client";

import type { FactorKey } from "@/lib/insightsV2";

export type PieSlice = {
  key: FactorKey;
  label: string;
  pct: number; // 0..1
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function polar(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
}

function colorFor(k: FactorKey) {
  // 의미 기반 (고정 팔레트)
  switch (k) {
    case "sleep":
      return "#3B82F6";
    case "stress":
      return "#EF4444";
    case "activity":
      return "#10B981";
    case "shift":
      return "#A855F7";
    case "caffeine":
      return "#F59E0B";
    case "menstrual":
      return "#EC4899";
    case "mood":
      return "#64748B";
  }
}

export function PieBreakdown({ title, message, slices }: { title: string; message: string; slices: PieSlice[] }) {
  const W = 260;
  const H = 160;
  const cx = 80;
  const cy = 80;
  const r = 62;

  const clean = slices
    .map((s) => ({ ...s, pct: clamp(s.pct, 0, 1) }))
    .filter((s) => s.pct > 0.001)
    .sort((a, b) => b.pct - a.pct);

  let acc = -Math.PI / 2;

  return (
    <div className="rounded-2xl border border-ios-sep bg-white p-4">
      <div>
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="mt-1 text-[12.5px] text-ios-muted">{message}</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
        <div className="overflow-x-auto">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
            {clean.map((s, idx) => {
              const a0 = acc;
              const a1 = acc + s.pct * Math.PI * 2;
              acc = a1;
              return <path key={idx} d={arcPath(cx, cy, r, a0, a1)} fill={colorFor(s.key)} opacity={0.9} />;
            })}
            <circle cx={cx} cy={cy} r={28} fill="#fff" />
            <text x={cx} y={cy - 2} fontSize={12} fill="rgba(0,0,0,0.55)" textAnchor="middle">
              TOP 1
            </text>
            <text x={cx} y={cy + 14} fontSize={13} fontWeight={700} fill="rgba(0,0,0,0.85)" textAnchor="middle">
              {clean[0]?.label ?? "-"}
            </text>
          </svg>
        </div>

        <div className="space-y-2">
          {clean.slice(0, 5).map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-xl border border-ios-sep bg-ios-bg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorFor(s.key) }} />
                <div className="text-[12.5px] font-semibold">{s.label}</div>
              </div>
              <div className="text-[12.5px] text-ios-muted">{Math.round(s.pct * 100)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
