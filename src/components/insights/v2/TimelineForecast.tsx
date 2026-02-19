"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { Shift } from "@/lib/types";
import type { DailyVital } from "@/lib/vitals";
import { round1, statusColor, statusFromScore, type VitalStatus, RNEST_COLORS } from "@/lib/rnestInsight";

type PhaseItem = {
  title: string;
  detail: string;
  icon: string;
  tone: "mint" | "pink" | "yellow" | "grey";
};

function toneColor(t: PhaseItem["tone"]) {
  if (t === "mint") return RNEST_COLORS.mint;
  if (t === "yellow") return RNEST_COLORS.yellow;
  if (t === "pink") return RNEST_COLORS.pink;
  return RNEST_COLORS.grey;
}

function focusFromScore(score: number) {
  if (score < 30) return { label: "회복 최우선", hint: "에너지 보존이 필요해요." };
  if (score < 70) return { label: "회복 강화", hint: "리듬 보정이 필요해요." };
  return { label: "리듬 유지", hint: "현재 루틴을 유지하세요." };
}

export function TimelineForecast({
  shift,
  vital,
  className,
}: {
  shift: Shift;
  vital: DailyVital | null;
  className?: string;
}) {
  const displayScore = useMemo(() => {
    if (!vital) return 50;
    return Math.round(Math.min(vital.body.value, vital.mental.ema));
  }, [vital]);

  const status: VitalStatus = useMemo(() => statusFromScore(displayScore), [displayScore]);
  const indicatorColor = useMemo(() => statusColor(status), [status]);

  const isRestDay = shift === "OFF" || shift === "VAC";
  const focus = useMemo(() => focusFromScore(displayScore), [displayScore]);

  const sleepDebt = round1(vital?.engine?.sleepDebtHours ?? 0);
  const nightStreak = vital?.engine?.nightStreak ?? 0;
  const sri = vital?.engine?.SRI ?? vital?.engine?.SRS ?? 1;
  const csi = vital?.engine?.CSI ?? vital?.engine?.CMF ?? 0;
  const cif = vital?.engine?.CIF ?? (1 - (vital?.engine?.CSD ?? 0));
  const slf = vital?.engine?.SLF ?? 0;
  const mif = vital?.engine?.MIF ?? 1;

  const analysisDetail = useMemo(() => {
    if (!vital) return "입력 데이터가 부족해 기본 회복 루틴으로 안내합니다.";
    const factors: string[] = [];
    if (sleepDebt >= 2) factors.push(`수면 부채 ${sleepDebt}h`);
    if (sri <= 0.6) factors.push(`SRI ${Math.round(sri * 100)}%`);
    if (csi >= 0.6) factors.push(`CSI ${Math.round(csi * 100)}%`);
    if (cif <= 0.75) factors.push(`CIF ${Math.round(cif * 100)}%`);
    if (slf >= 0.7) factors.push(`스트레스 ${Math.round(slf * 100)}%`);
    if (mif <= 0.8) factors.push(`주기 영향 ${Math.round(mif * 100)}%`);
    if (nightStreak >= 3) factors.push(`야간 연속 ${nightStreak}일`);
    if (factors.length) return factors.slice(0, 2).join(" · ");
    return isRestDay ? "근무 없이 회복 루틴을 최적화했어요." : "근무 단계에 맞춰 회복 루틴을 최적화했어요.";
  }, [cif, csi, isRestDay, mif, nightStreak, sleepDebt, slf, sri, vital]);

  const items = useMemo<PhaseItem[]>(() => {
    if (isRestDay) {
      const restDetail1 =
        sleepDebt >= 2
          ? `수면 부채 ${sleepDebt}h 해소가 최우선. 90분 단위로 보충하세요.`
          : "수면 루틴을 유지하고 충분히 쉬어 주세요.";

      const restDetail2Parts: string[] = [];
      if (nightStreak >= 3) restDetail2Parts.push("야간 연속으로 리듬이 흔들렸어요.");
      restDetail2Parts.push("기상/취침 시간을 일정하게 유지하세요.");
      if (cif <= 0.75) restDetail2Parts.push("카페인 컷오프를 앞당기세요.");
      const restDetail2 = restDetail2Parts.join(" ");

      const restDetail3 =
        displayScore < 30
          ? "가벼운 스트레칭과 햇빛 산책으로 회복을 돕습니다."
          : "20~30분 가벼운 활동으로 에너지 순환을 높이세요.";

      return [
        { title: "휴식 중심 회복", detail: restDetail1, icon: "🛌", tone: "mint" },
        { title: "리듬 유지", detail: restDetail2, icon: "🌿", tone: "yellow" },
        { title: "가벼운 활동", detail: restDetail3, icon: "🚶‍♀️", tone: "pink" },
      ];
    }

    const preDetailParts: string[] = [];
    if (displayScore < 30) preDetailParts.push("에너지 보존이 우선입니다.");
    else if (displayScore < 70) preDetailParts.push("리듬 보정을 시작하세요.");
    else preDetailParts.push("현재 루틴을 유지하세요.");
    if (sleepDebt >= 2) preDetailParts.push("20분 파워냅으로 집중력을 보정하세요.");
    preDetailParts.push(
      shift === "N"
        ? "야간 근무 전 밝은 빛 노출과 수분 보충이 도움 됩니다."
        : "출근 1~2시간 전 가벼운 스트레칭과 수분 보충을 권장합니다."
    );
    const preDetail = preDetailParts.join(" ");

    const duringDetailParts: string[] = [];
    if (displayScore < 30) duringDetailParts.push("업무를 단순화하고 휴식 시간을 확보하세요.");
    else duringDetailParts.push("90분마다 3분 리셋으로 피로를 분산하세요.");
    if (cif <= 0.75) {
      duringDetailParts.push("카페인은 근무 초반에만.");
    } else {
      duringDetailParts.push("카페인 컷오프는 근무 종료 4시간 전.");
    }
    const duringDetail = duringDetailParts.join(" ");

    const postDetailParts: string[] = [];
    if (shift === "N") {
      postDetailParts.push("퇴근 직후 빛 차단 후 90분 내 수면 진입을 목표로.");
    } else {
      postDetailParts.push("퇴근 후 2시간은 저조도/저자극으로 전환.");
    }
    if (sleepDebt >= 2) postDetailParts.push("수면 부채 해소를 위해 90분 단위로 보충하세요.");
    else postDetailParts.push("가벼운 스트레칭으로 회복 모드 전환.");
    const postDetail = postDetailParts.join(" ");

    return [
      { title: "출근 전 회복 세팅", detail: preDetail, icon: "⚡️", tone: "mint" },
      { title: "근무 중 컨디션 유지", detail: duringDetail, icon: "🏥", tone: "yellow" },
      { title: "퇴근 후 회복 전환", detail: postDetail, icon: "🌙", tone: "pink" },
    ];
  }, [cif, displayScore, isRestDay, nightStreak, shift, sleepDebt]);

  const badgeLabel = useMemo(() => {
    if (isRestDay) return shift === "VAC" ? "VA" : "OFF";
    return `Shift ${shift}`;
  }, [isRestDay, shift]);

  return (
    <div className={cn("relative overflow-hidden rounded-apple border border-ios-sep bg-white shadow-apple", className)}>
      <div
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{ backgroundImage: "linear-gradient(135deg, rgba(27,39,71,0.20), rgba(255,255,255,0.98))" }}
      />
      <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="text-[12px] font-semibold text-ios-sub">Timeline Forecast</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">타임라인 예보</div>
        </div>
        <div className="text-[12.5px] font-semibold" style={{ color: indicatorColor }}>
          {badgeLabel}
        </div>
      </div>

      <div className="relative px-5 pb-5 pt-4">
        <div className="rounded-apple border border-ios-sep bg-white/90 p-4">
          <div className="rounded-xl border border-ios-sep bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-ios-sub">알고리즘 분석</div>
              <div className="text-[12px] font-semibold" style={{ color: indicatorColor }}>
                {focus.label} · {displayScore}%
              </div>
            </div>
            <div className="mt-1 text-[14px] font-semibold text-ios-text">
              {isRestDay ? "휴식일 회복 추천" : "근무 단계별 회복 추천"}
            </div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{analysisDetail}</div>
            <div className="mt-2 text-[12px] text-ios-muted">{focus.hint}</div>
          </div>

          <div className="mt-3 space-y-2">
            {items.map((it, idx) => {
              const c = toneColor(it.tone);
              return (
                <div key={idx} className="flex gap-3 rounded-2xl border border-ios-sep bg-white px-3 py-3">
                  <div className="flex h-10 w-10 items-center justify-center">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full border bg-white"
                      style={{ borderColor: `${c}33` }}
                    >
                      <span className="text-[18px]" aria-hidden="true">
                        {it.icon}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold" style={{ color: c }}>
                      {it.title}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ios-sub">{it.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-[12.5px] text-ios-muted">* 추천은 입력 데이터 기반으로 조정됩니다.</div>
      </div>
    </div>
  );
}
