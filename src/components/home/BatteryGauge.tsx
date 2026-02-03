import { cn } from "@/lib/cn";

export function BatteryGauge({
  value,
  label = "Battery",
  tone,
  kind,
}: {
  value: number; // 0..100
  label?: string;
  tone?: "green" | "orange" | "red";
  kind?: "body" | "mental";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const t = tone ?? (pct >= 67 ? "green" : pct >= 34 ? "orange" : "red");

  // 기본은 위험도 색(초록/주황/빨강), kind가 있으면 테마 색으로 고정
  const ring = kind
    ? kind === "body"
      ? "stroke-[#00C7BE]"
      : "stroke-[#FF8A80]"
    : t === "green"
    ? "stroke-emerald-500"
    : t === "orange"
    ? "stroke-amber-500"
    : "stroke-red-500";

  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    // ✅ 모바일에서 카드 폭이 좁을 때 '원 + 텍스트'가 눌려 겹치는 문제 방지:
    // - 기본(모바일): 세로 배치
    // - sm 이상: 가로 배치
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* 원형 게이지: 모바일에서 살짝 작게 */}
      <div className="relative h-[86px] w-[86px] shrink-0 sm:h-[100px] sm:w-[100px]">
        <svg viewBox="0 0 120 120" className="h-full w-full">
          <circle cx="60" cy="60" r={r} className="stroke-black/10" strokeWidth="8" fill="none" />
          <circle
            cx="60"
            cy="60"
            r={r}
            className={cn("transition-all", ring)}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform="rotate(-90 60 60)"
          />
        </svg>

        {/* 중앙 텍스트: iOS에서 line-height 때문에 겹쳐 보이는 현상 방지 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] sm:text-[22px]">
            {Math.round(pct)}
          </div>
          <div className="mt-1 text-[10px] leading-none text-black/55">{label}</div>
        </div>
      </div>
    </div>
  );
}
