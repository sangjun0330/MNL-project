// src/lib/menstrual.ts
import type { ISODate } from "@/lib/date";
import { addDays, diffDays, fromISODate, toISODate } from "@/lib/date";
import type { BioInputs, MenstrualSettings } from "@/lib/model";

export type MenstrualPhase = "period" | "pms" | "ovulation" | "follicular" | "luteal" | "none";

export type MenstrualContext = {
  iso: ISODate;
  enabled: boolean;
  phase: MenstrualPhase;
  // 0..cycleLength-1 (internal index)
  dayIndexInCycle: number;
  // ✅ UI friendly fields
  dayInCycle: number | null; // 1..cycleLength
  label: string;
  cycleLength: number;
  periodLength: number;
};

function clampInt(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, v));
}

function flowLevel(bio?: BioInputs | null) {
  const raw = Number((bio as any)?.menstrualFlow ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return clampInt(raw, 0, 3);
}

function statusOf(bio?: BioInputs | null) {
  const raw = (bio as any)?.menstrualStatus ?? null;
  if (raw === "period" || raw === "pms" || raw === "none") return raw as "period" | "pms" | "none";
  return null;
}

function labelFromPhase(phase: MenstrualPhase) {
  switch (phase) {
    case "period":
      return "생리 기간";
    case "pms":
      return "생리 직전 기간";
    case "ovulation":
      return "컨디션 안정 기간";
    case "follicular":
      return "컨디션 안정 기간";
    case "luteal":
      return "컨디션 변화가 큰 날";
    default:
      return "주기";
  }
}

/**
 * 매우 보수적으로(안전하게) "예측 표기"만 위한 계산:
 * - cycleLength: 20~45
 * - periodLength: 2~10
 * - PMS: 다음 생리 시작 5일 전~전날(기본 5일)
 * - Ovulation: cycleLength-14 (대략 배란일)
 */
export function menstrualContextForDate(iso: ISODate, ms?: MenstrualSettings | null): MenstrualContext {
  const enabled = !!ms?.enabled;

  // ✅ key 호환: lastPeriodStart(현재) / startISO(구버전)
  const last = (ms?.lastPeriodStart ?? (ms as any)?.startISO ?? null) as ISODate | null;

  const cycleLength = clampInt((ms as any)?.cycleLength ?? 28, 20, 45);
  const periodLength = clampInt((ms as any)?.periodLength ?? 5, 2, 10);

  if (!enabled || !last) {
    return {
      iso,
      enabled: false,
      phase: "none",
      dayIndexInCycle: 0,
      dayInCycle: null,
      label: labelFromPhase("none"),
      cycleLength,
      periodLength,
    };
  }

  const delta = diffDays(iso, last); // iso - last
  // 음수(시작일 이전)면 “표기 없음” 처리
  if (delta < 0) {
    return {
      iso,
      enabled,
      phase: "none",
      dayIndexInCycle: 0,
      dayInCycle: null,
      label: labelFromPhase("none"),
      cycleLength,
      periodLength,
    };
  }

  const dayIndexInCycle = ((delta % cycleLength) + cycleLength) % cycleLength;

  const ovulationDay = clampInt(cycleLength - 14, 6, cycleLength - 8); // 대략
  const pmsDays = clampInt((ms as any)?.pmsDays ?? 5, 2, 10);
  const pmsStart = Math.max(0, cycleLength - pmsDays);
  const pmsEnd = cycleLength - 1;

  let phase: MenstrualPhase = "none";

  if (dayIndexInCycle >= 0 && dayIndexInCycle <= periodLength - 1) {
    phase = "period";
  } else if (dayIndexInCycle >= pmsStart && dayIndexInCycle <= pmsEnd) {
    phase = "pms";
  } else if (dayIndexInCycle === ovulationDay) {
    phase = "ovulation";
  } else if (dayIndexInCycle < ovulationDay) {
    phase = "follicular";
  } else {
    phase = "luteal";
  }

  return {
    iso,
    enabled,
    phase,
    dayIndexInCycle,
    dayInCycle: dayIndexInCycle + 1,
    label: labelFromPhase(phase),
    cycleLength,
    periodLength,
  };
}

/**
 * vitals에서 위험도/점수에 반영하기 위한 델타(가중치) 예시.
 */
export function menstrualDeltasFromContext(ctx: MenstrualContext) {
  switch (ctx.phase) {
    case "period":
      return { fatigue: +2, mood: -1, recovery: -1 };
    case "pms":
      return { fatigue: +1, mood: -1, recovery: -1 };
    case "ovulation":
      return { fatigue: 0, mood: +1, recovery: +1 };
    case "follicular":
      return { fatigue: 0, mood: +1, recovery: +1 };
    case "luteal":
      return { fatigue: +1, mood: 0, recovery: 0 };
    default:
      return { fatigue: 0, mood: 0, recovery: 0 };
  }
}

// =========================
// Auto-adjust (state-based)
// =========================
export function autoAdjustMenstrualSettings(args: {
  settings: MenstrualSettings;
  iso: ISODate;
  bio?: BioInputs | null;
  prevBio?: BioInputs | null;
  bioMap?: Record<ISODate, BioInputs | undefined>;
}): MenstrualSettings | null {
  const { settings, iso, bio, prevBio, bioMap } = args;
  if (!bio) return null;

  const flowToday = flowLevel(bio);
  const flowPrev = flowLevel(prevBio);
  const statusToday = statusOf(bio);
  const statusPrev = statusOf(prevBio);

  const isPeriodSignal = flowToday > 0 || statusToday === "period";
  const wasPeriodSignal = flowPrev > 0 || statusPrev === "period";

  const started = isPeriodSignal && !wasPeriodSignal;
  const ended = !isPeriodSignal && wasPeriodSignal;

  let changed = false;
  const next: MenstrualSettings = {
    ...settings,
    enabled: Boolean(settings?.enabled),
    lastPeriodStart: (settings?.lastPeriodStart ?? null) as ISODate | null,
    cycleLength: clampInt((settings as any)?.cycleLength ?? 28, 20, 45),
    periodLength: clampInt((settings as any)?.periodLength ?? 5, 2, 10),
  };

  if (isPeriodSignal && !next.enabled) {
    next.enabled = true;
    changed = true;
  }

  if (started) {
    const last = next.lastPeriodStart;
    if (last) {
      const observed = diffDays(iso, last);
      if (observed >= 20 && observed <= 45) {
        const blended = Math.round(next.cycleLength * 0.7 + observed * 0.3);
        const clamped = clampInt(blended, 20, 45);
        if (clamped !== next.cycleLength) {
          next.cycleLength = clamped;
          changed = true;
        }
      }
    }

    if (next.lastPeriodStart !== iso) {
      next.lastPeriodStart = iso;
      changed = true;
    }
  }

  if (ended && bioMap) {
    let len = 0;
    let d = addDays(fromISODate(iso), -1);
    while (len < 15) {
      const key = toISODate(d);
      const b = bioMap[key];
      const f = flowLevel(b);
      const s = statusOf(b);
      if (f > 0 || s === "period") {
        len += 1;
        d = addDays(d, -1);
        continue;
      }
      break;
    }

    if (len >= 2 && len <= 10) {
      const blended = Math.round(next.periodLength * 0.7 + len * 0.3);
      const clamped = clampInt(blended, 2, 10);
      if (clamped !== next.periodLength) {
        next.periodLength = clamped;
        changed = true;
      }
    }
  }

  if (statusToday === "pms") {
    const cur = clampInt((next as any)?.pmsDays ?? 5, 2, 10);
    const bumped = clampInt(Math.max(cur, 4), 2, 10);
    if (bumped !== cur) {
      (next as any).pmsDays = bumped;
      changed = true;
    }
  }

  return changed ? next : null;
}
