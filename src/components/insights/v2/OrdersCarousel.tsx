"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/date";
import { fromISODate, todayISO } from "@/lib/date";
import type { DailyVital } from "@/lib/vitals";
import type { Shift } from "@/lib/types";
import {
  readOrdersDone,
  shiftWindow,
  writeOrdersDone,
  type OrderKey,
  RNEST_COLORS,
} from "@/lib/rnestInsight";

type OrderTone = "mint" | "pink" | "yellow" | "grey";

type OrderCard = {
  key: OrderKey;
  icon: string;
  titleEn: string;
  titleKo: string;
  detail: string;
  tone: OrderTone;
  actionLabel: string;
};

function toneColor(t: OrderTone) {
  if (t === "mint") return RNEST_COLORS.mint;
  if (t === "yellow") return RNEST_COLORS.yellow;
  if (t === "pink") return RNEST_COLORS.pink;
  return RNEST_COLORS.grey;
}

function shiftKo(shift: Shift) {
  switch (shift) {
    case "D":
      return "Shift D";
    case "E":
      return "Shift E";
    case "N":
      return "Shift N";
    case "M":
      return "Shift M";
    case "OFF":
      return "OFF";
    case "VAC":
      return "VA";
  }
}

function hoursTo1(n: number) {
  return Math.round(n * 10) / 10;
}

export function OrdersCarousel({ vital, pivotISO }: { vital: DailyVital | null; pivotISO?: ISODate }) {
  const dateISO = pivotISO ?? todayISO();
  const overlayStyle = {
    backgroundImage: "linear-gradient(135deg, rgba(27,39,71,0.18), rgba(255,255,255,0.98))",
  } as const;

  const [done, setDone] = useState<Record<OrderKey, boolean>>({} as any);

  useEffect(() => {
    setDone(readOrdersDone(dateISO));
  }, [dateISO]);

  const cards = useMemo(() => {
    if (!vital) return [] as OrderCard[];

    const shift = vital.shift;
    const now = new Date();
    const pivotDate = fromISODate(dateISO);
    const { start, end } = shiftWindow(shift, pivotDate);

    const sleepDebt = vital.engine?.sleepDebtHours ?? 0;
    const nightStreak = vital.engine?.nightStreak ?? 0;
    const sri = vital.engine?.SRI ?? vital.engine?.SRS ?? 1;
    const csi = vital.engine?.CSI ?? vital.engine?.CMF ?? 0;
    const cif = vital.engine?.CIF ?? (1 - (vital.engine?.CSD ?? 0));
    const slf = vital.engine?.SLF ?? 0;
    const menstrualLoad = vital.menstrual?.expectedImpact ?? 0;
    const menstrualPct = Math.round((menstrualLoad / 0.45) * 100);
    const phase = vital.menstrual?.dominantPhase ?? "uncertain";
    const menstrualReady =
      vital.menstrual?.isObservedToday ||
      (vital.menstrual?.confidence ?? 0) >= 0.45 ||
      menstrualLoad >= 0.08;

    const list: OrderCard[] = [];

    // 1) 수면 부채 경고
    if (sleepDebt > 2.0 || sri < 0.6) {
      list.push({
        key: "sleep_debt",
        icon: "🛌",
        titleEn: "Sleep Debt",
        titleKo: "수면 부채 경고",
        detail: `수면 부채 ${hoursTo1(sleepDebt)}h · SRI ${Math.round(sri * 100)}%. 오늘은 회복 우선(낮잠/루틴 고정)이 필요해요.`,
        tone: "pink",
        actionLabel: "낮잠 타이머",
      });
    }

    // 2) 카페인 금지 (퇴근 4시간 전)
    if (shift === "D" || shift === "E" || shift === "N" || shift === "M") {
      const cutoff = new Date(end.getTime() - 4 * 60 * 60 * 1000);
      const inWindow = now.getTime() >= cutoff.getTime() && now.getTime() <= end.getTime();
      if (inWindow || cif <= 0.75) {
        list.push({
          key: "caffeine_npo",
          icon: "☕️🚫",
          titleEn: "Caffeine NPO",
          titleKo: "카페인 금지 (NPO)",
          detail: `CIF ${Math.round(cif * 100)}% · ${shiftKo(shift)} 기준 퇴근 4시간 전 구간입니다. 지금부터 커피는 중단해요.`,
          tone: "yellow",
          actionLabel: "물 마시기",
        });
      }
    }

    // 3) 호르몬 & 듀티 (나이트 + PMS/생리)
    if (
      shift === "N" &&
      menstrualReady &&
      (phase === "pms" || phase === "period" || phase === "late_period_tail" || menstrualLoad >= 0.12)
    ) {
      list.push({
        key: "hormone_duty",
        icon: "🩸",
        titleEn: "Hormone & Duty",
        titleKo: "호르몬 & 듀티 이중고",
        detail: `주기 영향 ${menstrualPct}% + 나이트가 겹쳤습니다. 통증·피로가 빠르게 올라갈 수 있어요.`,
        tone: "pink",
        actionLabel: "증상 기록",
      });
    }

    // 4) 야행성 모드
    if (nightStreak >= 3 || csi >= 0.6 || slf >= 0.7) {
      list.push({
        key: "night_adapt",
        icon: "🕶️",
        titleEn: "Night Mode",
        titleKo: "야행성 적응 완료",
        detail: `CSI ${Math.round(csi * 100)}% · 스트레스 ${Math.round(slf * 100)}%. 지금은 회복 우선 모드예요.`,
        tone: "grey",
        actionLabel: "확인",
      });
    }

    return list;
  }, [dateISO, vital]);

  const markDone = (key: OrderKey) => {
    const next = { ...(done ?? {}), [key]: true } as Record<OrderKey, boolean>;
    setDone(next);
    writeOrdersDone(dateISO, next);
  };

  if (!cards.length) {
    return (
      <div className="relative overflow-hidden rounded-apple border border-ios-sep bg-white shadow-apple">
        <div className="pointer-events-none absolute inset-0 opacity-55" style={overlayStyle} />
        <div className="relative px-5 pt-5">
          <div className="text-[12px] font-semibold text-ios-sub">Dr. RNEST&apos;s Orders</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오늘 오더</div>
        </div>
        <div className="relative px-5 pb-5 pt-3 text-[13px] text-ios-sub">
          지금 당장 필요한 오더가 없어요. 현재는 Stable 유지 중입니다.
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-apple border border-ios-sep bg-white shadow-apple">
      <div className="pointer-events-none absolute inset-0 opacity-55" style={overlayStyle} />
      <div className="relative px-5 pt-5">
        <div className="text-[12px] font-semibold text-ios-sub">Dr. RNEST&apos;s Orders</div>
        <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">지금 바로 실행할 오더</div>
      </div>

      <div className="relative mt-4 overflow-x-auto px-5 pb-5">
        <div className="flex w-max gap-3">
          {cards.map((c) => {
            const isDone = Boolean(done?.[c.key]);
            const color = toneColor(c.tone);
            return (
              <div
                key={c.key}
                className={cn(
                  "w-[292px] shrink-0 rounded-apple border border-ios-sep bg-white/90 p-4 shadow-apple-sm",
                  isDone && "opacity-45"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border"
                    style={{ backgroundColor: `${color}22`, borderColor: `${color}33` }}
                    aria-hidden="true"
                  >
                    <span className="text-[22px]">{c.icon}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-ios-sub">{c.titleEn}</div>
                    <div className="mt-0.5 text-[16px] font-semibold tracking-[-0.01em]">{c.titleKo}</div>
                    <div className="mt-1 text-[13px] text-ios-sub">{c.detail}</div>

                    <div className="mt-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => markDone(c.key)}
                        disabled={isDone}
                        className={cn(
                          "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-[12.5px] font-semibold",
                          isDone ? "bg-ios-bg text-ios-muted" : "bg-white"
                        )}
                        style={isDone ? undefined : { borderColor: `${color}55`, color }}
                      >
                        {isDone ? "완료" : c.actionLabel}
                      </button>

                      {isDone ? (
                        <div className="text-[12px] font-semibold" style={{ color }}>
                          +1%
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
