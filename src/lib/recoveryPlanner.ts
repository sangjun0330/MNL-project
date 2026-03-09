import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate } from "@/lib/date";
import { topFactors, type FactorKey } from "@/lib/insightsV2";
import type { AppState, ProfileSettings } from "@/lib/model";
import type { Shift } from "@/lib/types";
import type { DailyVital } from "@/lib/vitals";

export type RecoveryPlannerTone = "stable" | "noti" | "warning";
export type RecoveryPlannerState = "needs_records" | "preview" | "full";

export type PlannerOrderPreview = {
  rank: number;
  title: string;
  text: string;
};

export type PlannerTimelinePreview = {
  phase: string;
  text: string;
};

export type NextDutyInfo = {
  shift: Shift;
  dateISO: ISODate;
  offsetDays: number;
};

export type PlannerContext = {
  focusFactor: { key: FactorKey; label: string; pct: number } | null;
  primaryAction: string | null;
  avoidAction: string | null;
  nextDuty: Shift | null;
  nextDutyDate: ISODate | null;
  plannerTone: RecoveryPlannerTone;
  ordersTop3: PlannerOrderPreview[];
};

export type ChronotypePreset = "morning" | "balanced" | "evening";
export type CaffeineSensitivityPreset = "low" | "normal" | "high";

function clamp(n: number, min: number, max: number) {
  const value = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, value));
}

function shiftLabel(shift: Shift | null) {
  if (shift === "D") return "데이";
  if (shift === "E") return "이브";
  if (shift === "N") return "나이트";
  if (shift === "M") return "미들";
  if (shift === "VAC") return "휴가";
  return "오프";
}

function formatMinutes(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function cutoffForNextDuty(nextDuty: Shift | null, profile?: ProfileSettings | null) {
  let minutes = 14 * 60;
  if (nextDuty === "D") minutes = 15 * 60;
  if (nextDuty === "M") minutes = 15 * 60 + 30;
  if (nextDuty === "E") minutes = 16 * 60;
  if (nextDuty === "N") minutes = 60;

  const sensitivity = clamp(Number(profile?.caffeineSensitivity ?? 1), 0.5, 1.5);
  if (sensitivity >= 1.15) minutes -= 30;
  if (sensitivity <= 0.85) minutes += 30;
  return formatMinutes(minutes);
}

function compactSummary(vital: DailyVital | null) {
  const body = vital?.body.value ?? 50;
  const mental = vital?.mental.ema ?? 50;
  const debt = vital?.engine?.sleepDebtHours ?? 0;
  const csi = vital?.engine?.CSI ?? vital?.engine?.CMF ?? 0;
  const sri = vital?.engine?.SRI ?? vital?.engine?.SRS ?? 1;
  const cif = vital?.engine?.CIF ?? (1 - (vital?.engine?.CSD ?? 0));
  const slf = vital?.engine?.SLF ?? 0;
  const mif = vital?.engine?.MIF ?? 1;
  const night = vital?.engine?.nightStreak ?? 0;

  return {
    body,
    mental,
    vital: Math.round((body + mental) / 2),
    debt,
    csi,
    sri,
    cif,
    slf,
    mif,
    night,
  };
}

export function findNextActualDuty(
  schedule: AppState["schedule"] | Record<ISODate, Shift | undefined> | undefined,
  pivotISO: ISODate,
  maxDays = 14
): NextDutyInfo | null {
  for (let offsetDays = 1; offsetDays <= maxDays; offsetDays += 1) {
    const dateISO = toISODate(addDays(fromISODate(pivotISO), offsetDays)) as ISODate;
    const shift = schedule?.[dateISO] as Shift | undefined;
    if (!shift || shift === "OFF" || shift === "VAC") continue;
    return { shift, dateISO, offsetDays };
  }
  return null;
}

export function getRecoveryPlannerTone(vital: DailyVital | null): RecoveryPlannerTone {
  if (!vital) return "stable";

  const summary = compactSummary(vital);
  const warning =
    summary.vital <= 45 ||
    summary.debt >= 7 ||
    (summary.night >= 2 && (summary.csi >= 0.6 || summary.sri <= 0.55)) ||
    summary.cif <= 0.7 ||
    summary.slf >= 0.75 ||
    summary.mif <= 0.75;

  if (warning) return "warning";

  const noti =
    summary.vital <= 60 ||
    summary.debt >= 3 ||
    summary.csi >= 0.45 ||
    summary.sri <= 0.7 ||
    summary.cif <= 0.85 ||
    summary.slf >= 0.55 ||
    summary.mif <= 0.85;

  return noti ? "noti" : "stable";
}

export function buildPlannerPrimaryAction(
  focusKey: FactorKey | null,
  nextDuty: Shift | null,
  vital: DailyVital | null,
  tone: RecoveryPlannerTone,
  profile?: ProfileSettings | null
) {
  const summary = compactSummary(vital);
  const cutoff = cutoffForNextDuty(nextDuty, profile);
  const chronotype = clamp(Number(profile?.chronotype ?? 0.5), 0, 1);

  if (focusKey === "sleep") {
    if (nextDuty === "N") return "나이트 전 선행수면 20~90분을 먼저 확보해요.";
    if (nextDuty === "D" && chronotype >= 0.67) return "저녁형 리듬이면 취침을 평소보다 30~60분 앞당겨 데이 준비를 해요.";
    return summary.debt >= 4 ? "오늘 수면을 60~90분 보충해 수면부채를 먼저 줄여요." : "오늘 수면을 20~30분만 보강해 회복 여유를 만들어요.";
  }
  if (focusKey === "caffeine") return `카페인 컷오프를 ${cutoff} 이전으로 당겨 수면 간섭을 줄여요.`;
  if (focusKey === "shift") {
    if (nextDuty === "N" && chronotype <= 0.33) return "아침형 리듬이면 나이트 전 빛 차단과 낮잠 타이밍을 더 일찍 준비해요.";
    return nextDuty === "N" ? "빛 노출과 낮잠 타이밍을 고정해 나이트 전환 리듬을 먼저 맞춰요." : "기상과 취침 시간을 조금만 고정해 교대 리듬을 안정화해요.";
  }
  if (focusKey === "stress") return tone === "warning" ? "오늘 할 일을 줄이고 60초 회복 브레이크를 먼저 확보해요." : "오늘 처리량을 낮추고 중간 리셋 시간을 미리 잡아둬요.";
  if (focusKey === "activity") return "강한 운동보다 10~15분 가벼운 걷기로 순환을 먼저 살려요.";
  if (focusKey === "mood") return "샤워·산책·정리 중 하나로 멘탈 배터리를 먼저 안정화해요.";
  if (focusKey === "menstrual") return "따뜻함과 수분, 가벼운 스트레칭으로 자극을 낮춰요.";
  return tone === "warning" ? "오늘은 회복 우선으로 일정과 자극을 줄여요." : "오늘은 회복 루틴 하나만 고정해 컨디션을 지켜요.";
}

export function buildPlannerAvoidAction(
  focusKey: FactorKey | null,
  nextDuty: Shift | null,
  tone: RecoveryPlannerTone,
  profile?: ProfileSettings | null
) {
  const cutoff = cutoffForNextDuty(nextDuty, profile);

  if (focusKey === "sleep") return "늦은 화면 노출과 취침 직전 과한 자극은 피하세요.";
  if (focusKey === "caffeine") return `${cutoff} 이후 카페인 추가 섭취는 피하세요.`;
  if (focusKey === "shift") return "교대 전환일에 취침·기상 시간을 크게 흔들지 마세요.";
  if (focusKey === "stress") return "오늘 할 일을 과하게 늘리거나 휴식 없이 밀어붙이지 마세요.";
  if (focusKey === "activity") return "지친 날 과한 운동으로 회복을 더 늦추지 마세요.";
  if (focusKey === "mood") return "컨디션이 흔들릴 때 자책하거나 목표 난이도를 올리지 마세요.";
  if (focusKey === "menstrual") return "증상 신호가 강한 날 무리한 일정과 강한 운동은 피하세요.";
  return tone === "warning" ? "오늘은 추가 약속과 과한 자극을 줄이세요." : "회복 루틴을 깨는 늦은 자극은 피하세요.";
}

export function buildPlannerOrderPreview(args: {
  focusKey: FactorKey;
  label: string;
  rank: number;
  nextDuty: Shift | null;
  vital: DailyVital | null;
  tone: RecoveryPlannerTone;
  profile?: ProfileSettings | null;
}): PlannerOrderPreview {
  const { focusKey, label, rank, nextDuty, vital, tone, profile } = args;
  const summary = compactSummary(vital);
  const cutoff = cutoffForNextDuty(nextDuty, profile);

  let text = buildPlannerPrimaryAction(focusKey, nextDuty, vital, tone, profile) ?? "오늘 회복 루틴을 먼저 고정해요.";

  if (focusKey === "sleep" && summary.debt >= 3) text = `수면부채 ${Math.round(summary.debt * 10) / 10}h 기준으로 보충수면을 먼저 확보해요.`;
  if (focusKey === "shift") text = nextDuty === "N" ? "나이트 전환을 위해 빛·낮잠·수분 루틴을 먼저 고정해요." : "다음 근무 전 리듬 흔들림을 줄이는 루틴부터 맞춰요.";
  if (focusKey === "caffeine") text = `카페인 컷오프 ${cutoff}를 지켜 수면 회복을 방해하지 않게 해요.`;
  if (focusKey === "stress") text = "오늘은 처리량보다 실수 방지와 짧은 리셋에 집중해요.";

  return {
    rank,
    title: label,
    text,
  };
}

export function buildPlannerTimelinePreview(
  shift: Shift | null,
  vital: DailyVital | null,
  profile?: ProfileSettings | null
): PlannerTimelinePreview[] {
  const summary = compactSummary(vital);
  const workday = shift && shift !== "OFF" && shift !== "VAC";
  const chronotype = clamp(Number(profile?.chronotype ?? 0.5), 0, 1);

  if (!workday) {
    return [
      { phase: "수면 보충", text: summary.debt >= 2 ? `수면부채 ${Math.round(summary.debt * 10) / 10}h 회복을 먼저 챙겨요.` : "취침과 기상 시간을 크게 흔들지 않고 리듬을 지켜요." },
      { phase: "리듬 유지", text: chronotype >= 0.67 ? "늦은 저녁 자극을 줄이고 아침 빛 10분으로 낮 리듬을 다시 맞춰요." : "햇빛 10분과 가벼운 움직임으로 낮 리듬을 유지해요." },
      { phase: "저녁 전환", text: chronotype <= 0.33 ? "저녁에는 조도와 자극을 낮춰 이른 회복 루틴을 지켜요." : "저녁에는 조도와 자극을 낮춰 다음 날 회복 흐름을 준비해요." },
    ];
  }

  return [
    {
      phase: "출근 전",
      text:
        summary.debt >= 2
          ? "수분 보충과 짧은 낮잠 또는 스트레칭으로 회복 여유를 만들어요."
          : chronotype >= 0.67 && shift === "D"
            ? "저녁형 리듬이면 출근 전 강한 빛과 가벼운 움직임으로 각성을 먼저 올려요."
            : "수분과 가벼운 스트레칭으로 근무 전 컨디션을 세팅해요.",
    },
    {
      phase: "근무 중",
      text: summary.cif <= 0.75 ? "카페인은 초반에만 쓰고, 중간엔 짧은 브레이크로 피로를 분산해요." : "90분마다 짧게 리셋해 집중력을 분산하세요.",
    },
    {
      phase: "퇴근 후",
      text: shift === "N" ? "퇴근 후 조도를 낮추고 빠르게 수면 모드로 전환해요." : "퇴근 후 2시간은 저자극 루틴으로 회복 모드로 바꿔요.",
    },
  ];
}

export function buildPlannerContext(args: {
  pivotISO: ISODate;
  schedule: AppState["schedule"];
  todayVital: DailyVital | null;
  factorVitals: DailyVital[];
  profile?: ProfileSettings | null;
}): PlannerContext {
  const nextDutyInfo = findNextActualDuty(args.schedule, args.pivotISO);
  const plannerTone = getRecoveryPlannerTone(args.todayVital);
  const profile = normalizeProfileSettings(args.profile);
  const factors = topFactors(args.factorVitals, 3).map((item) => ({
    key: item.key as FactorKey,
    label: item.label,
    pct: item.pct,
  }));
  const focusFactor = factors[0] ?? null;
  const nextDuty = nextDutyInfo?.shift ?? null;
  const ordersTop3 = factors.map((factor, index) =>
    buildPlannerOrderPreview({
      focusKey: factor.key,
      label: factor.label,
      rank: index + 1,
      nextDuty,
      vital: args.todayVital,
      tone: plannerTone,
      profile,
    })
  );

  return {
    focusFactor,
    primaryAction: buildPlannerPrimaryAction(focusFactor?.key ?? null, nextDuty, args.todayVital, plannerTone, profile),
    avoidAction: buildPlannerAvoidAction(focusFactor?.key ?? null, nextDuty, plannerTone, profile),
    nextDuty,
    nextDutyDate: nextDutyInfo?.dateISO ?? null,
    plannerTone,
    ordersTop3,
  };
}

export function chronotypePresetFromValue(value: number): ChronotypePreset {
  if (value <= 0.33) return "morning";
  if (value >= 0.67) return "evening";
  return "balanced";
}

export function chronotypeValueFromPreset(preset: ChronotypePreset) {
  if (preset === "morning") return 0.2;
  if (preset === "evening") return 0.8;
  return 0.5;
}

export function caffeineSensitivityPresetFromValue(value: number): CaffeineSensitivityPreset {
  if (value <= 0.85) return "low";
  if (value >= 1.15) return "high";
  return "normal";
}

export function caffeineSensitivityValueFromPreset(preset: CaffeineSensitivityPreset) {
  if (preset === "low") return 0.75;
  if (preset === "high") return 1.25;
  return 1.0;
}

export function chronotypePresetLabel(preset: ChronotypePreset) {
  if (preset === "morning") return "아침형";
  if (preset === "evening") return "저녁형";
  return "중간형";
}

export function chronotypePresetDescription(preset: ChronotypePreset) {
  if (preset === "morning") return "이른 시간에 더 잘 깨어나고 일찍 쉬는 편";
  if (preset === "evening") return "늦은 시간까지 각성이 잘 유지되는 편";
  return "근무에 따라 비교적 유연하게 적응하는 편";
}

export function caffeineSensitivityPresetLabel(preset: CaffeineSensitivityPreset) {
  if (preset === "low") return "낮음";
  if (preset === "high") return "높음";
  return "보통";
}

export function caffeineSensitivityPresetDescription(preset: CaffeineSensitivityPreset) {
  if (preset === "low") return "카페인이 비교적 빨리 빠져 수면 간섭이 적은 편";
  if (preset === "high") return "카페인이 오래 남아 늦은 섭취에 민감한 편";
  return "일반적인 반응으로 컷오프 시간을 지키면 안정적인 편";
}

export function normalizeProfileSettings(profile: ProfileSettings | null | undefined): ProfileSettings {
  return {
    chronotype: clamp(Number(profile?.chronotype ?? 0.5), 0, 1),
    caffeineSensitivity: clamp(Number(profile?.caffeineSensitivity ?? 1), 0.5, 1.5),
  };
}

export function formatRelativeDutyKorean(nextDutyDate: ISODate | null, pivotISO: ISODate) {
  if (!nextDutyDate) return "다음 근무 미정";
  const deltaDays = Math.round(
    (fromISODate(nextDutyDate).getTime() - fromISODate(pivotISO).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (deltaDays <= 1) return "다음 근무";
  return `${deltaDays}일 후 근무`;
}

export function formatShiftBadge(shift: Shift | null) {
  return shift ? shiftLabel(shift) : "미정";
}
