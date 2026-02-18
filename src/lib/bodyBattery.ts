import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";

/**
 * NurseBioRhythmAI (TypeScript port)
 * - 1시간 단위 시뮬레이션으로 배터리(0~100)를 업데이트합니다.
 * - 원본 Python 로직과 메시지 톤/구조를 최대한 동일하게 유지했습니다.
 */

export type ActivityType = "Work" | "Rest" | "Sleep";
export type ScheduleType = "Day" | "Eve" | "Night" | "Off";

export class NurseBioRhythmAI {
  name: string;
  battery: number;
  maxBattery = 100.0;
  minBattery = 0.0;

  // 상태 변수
  consecutiveNightCount = 0; // 연속 나이트 근무 횟수 (외부에서 세팅)
  sleepDebt = 0.0; // (현재 버전에서는 사용하지 않지만, 확장성을 위해 유지)

  // --- [상수 설정: 생체 리듬 파라미터] ---
  // 1. 소모 계수 (Drain Rates)
  DRAIN_RESTING = 3.5; // 휴식 중 (깨어있음)
  DRAIN_WORKING = 7.5; // 근무 중 (기본)
  DRAIN_HIGH_STRESS = 2.0; // 인계 시간/라운딩 피크 타임 추가 소모 (원본에서 미사용)

  // 2. 충전 계수 (Charge Rates)
  CHARGE_NIGHT_SLEEP = 15.0; // 밤잠 (최적)
  CHARGE_DAY_SLEEP = 9.0; // 낮잠 (나이트 후) - 효율 60%
  CHARGE_NAP = 5.0; // 쪽잠 (원본에서 미사용)

  // 3. 페널티 계수
  PENALTY_ZOMBIE_ZONE = 6.0; // 새벽 3~5시 추가 소모 (최대치)
  PENALTY_CONSECUTIVE_NIGHT = 1.1; // 연속 나이트 시 소모율 10% 증가

  constructor(name = "간호사", startBattery = 90.0) {
    this.name = name;
    this.battery = startBattery;
  }

  private clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  private getCircadianFactor(hour: number) {
    /**
     * [정교함 UP] 시간대에 따른 생체 리듬 부하 계산
     * 새벽 4시를 정점으로 하는 종 모양(Bell Curve)의 피로도 함수
     */
    if (2 <= hour && hour <= 6) {
      const distance = Math.abs(hour - 4);
      const intensity = Math.max(0, 1.0 - distance * 0.35);
      return this.PENALTY_ZOMBIE_ZONE * intensity;
    }
    return 0.0;
  }

  private generateMessage(hour: number, status: ActivityType, battery: number, isNightShift: boolean) {
    /**
     * [감성 UP] 상황과 배터리에 따른 초정밀 공감 멘트 생성기
     * (원본 Python과 동일한 분기)
     */
    // 1) 수면
    if (status === "Sleep") {
      if (8 <= hour && hour <= 16) return "😴 암막 커튼 필수! 멜라토닌이 부족해요. 푹 주무세요.";
      return "🌙 내일 근무를 위해 충전 중... 좋은 꿈 꾸세요.";
    }

    // 2) 근무
    if (status === "Work") {
      if (hour === 7 || hour === 15 || hour === 23) {
        if (battery > 70) return `💪 ${this.name} 선생님, 인계 파이팅! 컨디션 좋네요.`;
        return "🔥 전쟁 같은 인계 시간... 정신 바짝 차려야 해요!";
      }

      if (3 <= hour && hour <= 5) {
        if (battery < 30) return "🚨 [위험] 투약 사고 주의보! 반드시 더블 체크 하세요. 카페인 수혈 시급!";
        return "🧟‍♀️ 마의 시간 4시입니다. 스트레칭 한 번 하고 차트 보세요.";
      }

      if (battery < 20) return "🪫 선생님 쓰러지기 일보 직전... 동료에게 도움을 요청하세요.";
      if (battery < 50) return "⚠️ 집중력이 떨어지고 있어요. 루틴 업무만 처리하고 복잡한 건 미루세요.";
      return "💉 오늘도 평화로운 병동... 이기를 바랍니다.";
    }

    // 3) 휴식
    if (status === "Rest") {
      if (battery < 30) return "🏠 제발 집에 가서 주무세요. 놀 체력이 아닙니다.";
      if (isNightShift && hour < 14) return "☀️ 나이트 퇴근하셨군요! 선글라스 끼고 퇴근하세요 (수면 유도).";
      return "☕ 맛있는 거 먹고 넷플릭스 보면서 힐링하세요!";
    }

    return "상태 확인 중...";
  }

  processHour(hour: number, activityType: ActivityType, scheduleType: ScheduleType) {
    /**
     * 1시간 단위 시뮬레이션 실행 함수
     * 원본 Python 로직과 동일한 방식으로 battery를 업데이트합니다.
     */
    const isNight = scheduleType === "Night";

    // --- 1. 연속 근무 감지 로직 ---
    let nightFactor = 1.0;
    if (isNight && activityType === "Work") {
      nightFactor = this.consecutiveNightCount >= 2 ? this.PENALTY_CONSECUTIVE_NIGHT : 1.0;
    }

    let currentDrain = 0.0;
    let currentCharge = 0.0;

    // --- 2. 배터리 변동 계산 ---
    if (activityType === "Sleep") {
      const chargeRate = (22 <= hour || hour <= 8) ? this.CHARGE_NIGHT_SLEEP : this.CHARGE_DAY_SLEEP;
      currentCharge = chargeRate;
      this.battery += currentCharge;
    } else {
      const baseRate = activityType === "Work" ? this.DRAIN_WORKING : this.DRAIN_RESTING;
      const circadianPenalty = this.getCircadianFactor(hour);
      currentDrain = (baseRate + circadianPenalty) * nightFactor;
      this.battery -= currentDrain;
    }

    this.battery = this.clamp(this.battery, this.minBattery, this.maxBattery);

    const message = this.generateMessage(hour, activityType, this.battery, isNight);

    return {
      hour,
      battery: Math.round(this.battery * 10) / 10,
      status: activityType,
      change: Math.round((currentCharge - currentDrain) * 10) / 10,
      message,
    };
  }
}

export type BatteryDay = {
  date: ISODate;
  shift: Shift;
  level: number;          // 0..100 (해당 "근무/하루"에서 가장 낮은 배터리)
  band: "위험" | "주의" | "양호";
  color: "red" | "orange" | "green";
  notes: string[];
  sleepWindow: string;
  caffeineCutoff: string;
};

function sleepWindow(shift: Shift) {
  switch (shift) {
    case "D": return "23:00–07:00";
    case "M": return "00:00–08:00";
    case "E": return "01:00–09:00";
    case "N": return "10:30–17:30 (암실)";
    case "OFF": return "00:00–08:00 (자율)";
    case "VAC": return "00:00–08:30 (회복)";
  }
}

function caffeineCutoff(shift: Shift) {
  switch (shift) {
    case "D": return "14:00 이전";
    case "M": return "15:00 이전";
    case "E": return "17:00 이전";
    case "N": return "03:00 이전";
    case "OFF": return "16:00 이전";
    case "VAC": return "16:00 이전";
  }
}

function bandFromLevel(level: number) {
  if (level < 20) return { band: "위험" as const, color: "red" as const };
  if (level < 50) return { band: "주의" as const, color: "orange" as const };
  return { band: "양호" as const, color: "green" as const };
}

function shiftToScheduleType(shift: Shift): ScheduleType {
  if (shift === "D") return "Day";
  if (shift === "M") return "Eve";
  if (shift === "E") return "Eve";
  if (shift === "N") return "Night";
  return "Off";
}

/**
 * 1시간 단위로 "그 시간에 무엇을 하는지"를 일정표 기반으로 결정합니다.
 * - MVP용 기본값이며, 향후 개인 루틴 설정으로 확장 가능합니다.
 */
function hourContext(
  schedule: Record<ISODate, Shift>,
  dateISO: ISODate,
  hour: number
): { activity: ActivityType; scheduleType: ScheduleType; nightStartDateISO?: ISODate } {
  const curShift = schedule[dateISO] ?? "OFF";
  const prevISO = toISODate(addDays(fromISODate(dateISO), -1));
  const prevShift = schedule[prevISO] ?? "OFF";

  // 1) Work blocks
  // Carry-over from previous Night shift (00:00 ~ 07:00)
  if (prevShift === "N" && 0 <= hour && hour <= 7) {
    return { activity: "Work", scheduleType: "Night", nightStartDateISO: prevISO };
  }

  // Day shift work (07:00 ~ 14:00)
  if (curShift === "D" && 7 <= hour && hour <= 14) {
    return { activity: "Work", scheduleType: "Day" };
  }

  // Middle shift work (11:00 ~ 19:00)
  if (curShift === "M" && 11 <= hour && hour <= 19) {
    return { activity: "Work", scheduleType: "Eve" };
  }

  // Evening shift work (15:00 ~ 22:00)
  if (curShift === "E" && 15 <= hour && hour <= 22) {
    return { activity: "Work", scheduleType: "Eve" };
  }

  // Night shift starts (22:00 ~ 23:00)
  if (curShift === "N" && (hour === 22 || hour === 23)) {
    return { activity: "Work", scheduleType: "Night", nightStartDateISO: dateISO };
  }

  // 2) Sleep blocks (default assumptions)
  // Day sleep after Night shift (09:00 ~ 13:00)
  if (prevShift === "N" && 9 <= hour && hour <= 13) {
    return { activity: "Sleep", scheduleType: shiftToScheduleType(curShift) };
  }

  // Night-shift day: day sleep (09:00 ~ 13:00)
  if (curShift === "N" && 9 <= hour && hour <= 13) {
    return { activity: "Sleep", scheduleType: "Night" };
  }

  // Normal night sleep for Day shift (23:00 or 00~06)
  if (curShift === "D" && (hour == 23 || hour <= 6)) {
    return { activity: "Sleep", scheduleType: "Day" };
  }

  // Evening shift typical sleep (01:00 ~ 08:00)
  if (curShift === "E" && 1 <= hour && hour <= 8) {
    return { activity: "Sleep", scheduleType: "Eve" };
  }

  // Off/Vac typical sleep (00:00 ~ 07:00)
  if ((curShift === "OFF" || curShift === "VAC") && hour <= 7) {
    return { activity: "Sleep", scheduleType: "Off" };
  }

  // 3) Otherwise Rest
  return { activity: "Rest", scheduleType: shiftToScheduleType(curShift) };
}

function consecutiveNightMap(schedule: Record<ISODate, Shift>, start: ISODate, end: ISODate) {
  const map: Record<ISODate, number> = {};
  let count = 0;
  for (let d = fromISODate(start); d <= fromISODate(end); d = addDays(d, 1)) {
    const iso = toISODate(d);
    const shift = schedule[iso] ?? "OFF";
    if (shift === "N") count += 1;
    else count = 0;
    map[iso] = count;
  }
  return map;
}

/**
 * 위험도를 현실적으로 반영하기 위한 평가 시간대
 * - D/E: 해당 근무 시간대 최저 배터리
 * - N: (22~23) + (다음날 0~7) 최저 배터리 (좀비존 포함)
 * - OFF/VAC: 정오(12시) 배터리
 */
function hoursToEvaluateForDate(shift: Shift, dateISO: ISODate) {
  if (shift === "D") {
    return Array.from({ length: 8 }, (_, i) => ({ iso: dateISO, hour: 7 + i })); // 7..14
  }
  if (shift === "E") {
    return Array.from({ length: 8 }, (_, i) => ({ iso: dateISO, hour: 15 + i })); // 15..22
  }
  if (shift === "N") {
    const nextISO = toISODate(addDays(fromISODate(dateISO), 1));
    return [
      { iso: dateISO, hour: 22 },
      { iso: dateISO, hour: 23 },
      ...Array.from({ length: 8 }, (_, i) => ({ iso: nextISO, hour: i })), // 0..7
    ];
  }
  return [{ iso: dateISO, hour: 12 }];
}

type HourKey = `${ISODate}T${string}`;
function hourKey(iso: ISODate, hour: number): HourKey {
  return `${iso}T${String(hour).padStart(2, "0")}:00` as HourKey;
}

export function forecastBattery(
  schedule: Record<ISODate, Shift>,
  startDate: ISODate,
  days: number,
  opts?: { startBattery?: number; nurseName?: string }
): BatteryDay[] {
  const startBattery = opts?.startBattery ?? 90.0;
  const nurseName = opts?.nurseName ?? "간호사";

  const simStart = toISODate(addDays(fromISODate(startDate), -7));
  const simEnd = toISODate(addDays(fromISODate(startDate), days + 1)); // +1 for night carryover

  const cnMap = consecutiveNightMap(schedule, simStart, simEnd);
  const ai = new NurseBioRhythmAI(nurseName, startBattery);

  const hourly: Record<
    HourKey,
    { battery: number; message: string; status: ActivityType; scheduleType: ScheduleType; change: number }
  > = {};

  for (let d = fromISODate(simStart); d <= fromISODate(simEnd); d = addDays(d, 1)) {
    const dateISO = toISODate(d);

    for (let hour = 0; hour <= 23; hour++) {
      const ctx = hourContext(schedule, dateISO, hour);

      // Keep the "consecutive night" factor compatible with original intent.
      if (ctx.scheduleType === "Night" && ctx.activity === "Work") {
        const nightStart = (ctx.nightStartDateISO ?? dateISO) as ISODate;
        ai.consecutiveNightCount = cnMap[nightStart] ?? 0;
      } else {
        ai.consecutiveNightCount = 0;
      }

      const res = ai.processHour(hour, ctx.activity, ctx.scheduleType);

      hourly[hourKey(dateISO, hour)] = {
        battery: res.battery,
        message: res.message,
        status: ctx.activity,
        scheduleType: ctx.scheduleType,
        change: res.change,
      };
    }
  }

  const out: BatteryDay[] = [];
  for (let i = 0; i < days; i++) {
    const dateISO = toISODate(addDays(fromISODate(startDate), i));
    const shift = schedule[dateISO] ?? "OFF";

    const evalHours = hoursToEvaluateForDate(shift, dateISO);

    let minBattery = 101;
    let minAt = evalHours[0];

    for (const h of evalHours) {
      const entry = hourly[hourKey(h.iso as ISODate, h.hour)];
      if (!entry) continue;
      if (entry.battery < minBattery) {
        minBattery = entry.battery;
        minAt = h;
      }
    }

    if (minBattery === 101) minBattery = startBattery;

    const { band, color } = bandFromLevel(minBattery);

    const msgEntry = hourly[hourKey(minAt.iso as ISODate, minAt.hour)];
    const notes: string[] = [];
    if (msgEntry?.message) notes.push(msgEntry.message);
    if (shift === "N") notes.push("🧠 새벽 3–5시는 실수 위험이 커져요. 중요한 투약/처치는 더블 체크를 루틴으로!");

    out.push({
      date: dateISO,
      shift,
      level: Math.round(minBattery),
      band,
      color,
      notes,
      sleepWindow: sleepWindow(shift),
      caffeineCutoff: caffeineCutoff(shift),
    });
  }

  return out;
}

export function summarizeBattery(days: BatteryDay[]) {
  const avg = Math.round(days.reduce((a, d) => a + d.level, 0) / Math.max(days.length, 1));
  const min = Math.min(...days.map((d) => d.level));
  const max = Math.max(...days.map((d) => d.level));
  const riskDays = days.filter((d) => d.band === "위험").length;
  const cautionDays = days.filter((d) => d.band === "주의").length;
  return { avg, min, max, riskDays, cautionDays };
}
