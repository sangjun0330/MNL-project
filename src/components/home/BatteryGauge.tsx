import { cn } from "@/lib/cn";

export function BatteryGauge({
  value,
  label = "Battery",
  tone,
  kind,
  size = "default",
}: {
  value: number; // 0..100
  label?: string;
  tone?: "green" | "orange" | "red";
  kind?: "body" | "mental";
  size?: "default" | "large" | "compact";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const t = tone ?? (pct >= 67 ? "green" : pct >= 34 ? "orange" : "red");

  const ringColor = kind
    ? kind === "body"
      ? "#00C7BE"
      : "#FF8A80"
    : t === "green"
    ? "#10b981"
    : t === "orange"
    ? "#f59e0b"
    : "#ef4444";

  // ── Compact: horizontal progress bar ──
  if (size === "compact") {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-black/55">{label}</span>
          <span className="text-[14px] font-semibold leading-none tracking-[-0.02em]">
            {Math.round(pct)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: ringColor }}
          />
        </div>
      </div>
    );
  }

  // ── Circle gauge (default / large) ──
  const ring = kind
    ? kind === "body"
      ? "stroke-[#00C7BE]"
      : "stroke-[#FF8A80]"
    : t === "green"
    ? "stroke-emerald-500"
    : t === "orange"
    ? "stroke-amber-500"
    : "stroke-red-500";

  const isLarge = size === "large";
  const r = isLarge ? 42 : 40;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    // ✅ 모바일에서 카드 폭이 좁을 때 '원 + 텍스트'가 눌려 겹치는 문제 방지:
    // - 기본(모바일): 세로 배치
    // - sm 이상: 가로 배치
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* 원형 게이지: 모바일에서 살짝 작게 */}
      <div
        className={cn(
          "relative shrink-0",
          isLarge ? "h-[118px] w-[118px] sm:h-[132px] sm:w-[132px]" : "h-[86px] w-[86px] sm:h-[100px] sm:w-[100px]"
        )}
      >
        <svg viewBox="0 0 120 120" className="h-full w-full">
          <circle cx="60" cy="60" r={r} className="stroke-black/10" strokeWidth={isLarge ? 9 : 8} fill="none" />
          <circle
            cx="60"
            cy="60"
            r={r}
            className={cn("transition-all", ring)}
            strokeWidth={isLarge ? 9 : 8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform="rotate(-90 60 60)"
          />
        </svg>

        {/* 중앙 텍스트: iOS에서 line-height 때문에 겹쳐 보이는 현상 방지 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div
            className={cn(
              "font-semibold leading-none tracking-[-0.02em]",
              isLarge ? "text-[26px] sm:text-[30px]" : "text-[20px] sm:text-[22px]"
            )}
          >
            {Math.round(pct)}
          </div>
          <div className={cn("leading-none text-black/55", isLarge ? "mt-2 text-[11.5px]" : "mt-1 text-[10px]")}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
