// src/lib/date.ts
export type ISODate = `${number}-${string}-${string}`;

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isISODate(v: any): v is ISODate {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * ISO(YYYY-MM-DD) -> Date(UTC 정오)
 * - 타임존/서버-클라 차이로 날짜가 밀리는 문제를 피하기 위해 "UTC 12:00"로 고정
 */
export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/** Date -> ISO(YYYY-MM-DD) (UTC 기준) */
export function toISODate(date: Date): ISODate {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(d)}` as ISODate;
}

/** 오늘(한국 KST 기준) ISO */
export function todayISO(): ISODate {
  const now = Date.now();
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(d)}` as ISODate;
}

/** Date를 UTC 정오 기준 날짜로 정규화 */
export function startOfDay(d: Date): Date {
  return fromISODate(toISODate(d));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * ✅ addMonths (재귀 없이)
 * - 목표 월의 마지막 일 계산은 "day=0 트릭"으로 구함 (재귀 호출 금지)
 */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();

  const base = new Date(Date.UTC(y, m, 1, 12, 0, 0, 0));
  base.setUTCMonth(base.getUTCMonth() + months);

  const ty = base.getUTCFullYear();
  const tm = base.getUTCMonth();

  const daysInTargetMonth = new Date(Date.UTC(ty, tm + 1, 0, 12, 0, 0, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(ty, tm, clampedDay, 12, 0, 0, 0));
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12, 0, 0, 0));
}

/**
 * ✅ endOfMonth (재귀 없이)
 * - 다음달 0일 = 이번달 마지막날
 */
export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12, 0, 0, 0));
}

/** 월요일 시작(월~일) 주간 범위 계산용: 주의 시작(월) */
export function startOfWeekMonday(d: Date): Date {
  // getUTCDay(): 0=Sun..6=Sat
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day; // Sunday면 -6
  return startOfDay(addDays(d, delta));
}

/** 월요일 시작(월~일) 주간 범위 계산용: 주의 끝(일) */
export function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  return startOfDay(addDays(start, 6));
}

export function formatMonthTitle(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}년 ${m}월`;
}

export function formatKoreanDate(iso: ISODate): string {
  const [y, m, d] = iso.split("-");
  return `${y}. ${m}. ${d}.`;
}

// 호환용 export (프로젝트 내 다른 파일들이 이 이름을 쓰는 경우 대비)
export function parseISO(iso: ISODate): Date {
  return fromISODate(iso);
}
export function formatISO(d: Date): ISODate {
  return toISODate(d);
}

/** 두 ISODate 간 일수 차이 (a - b) */
export function diffDays(a: ISODate, b: ISODate): number {
  const da = fromISODate(a).getTime();
  const db = fromISODate(b).getTime();
  return Math.round((da - db) / DAY_MS);
}
