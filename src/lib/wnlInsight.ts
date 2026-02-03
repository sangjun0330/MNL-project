// src/lib/wnlInsight.ts
// Insight v2.x: UI helpers + palette + per-day Orders done state
//
// ✅ Backward compatible with older patch exports
//   - shiftTimes
//   - rollingRange
//   - readDoneKeys / writeDoneKeys
//
// ✅ New Insight v2.1 exports
//   - shiftWindow
//   - readOrdersDone / writeOrdersDone

import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";

export const WNL_COLORS = {
  // theme
  mint: "#6CDAC3", // Stable
  pink: "#FF9EAA", // Care/Warn
  yellow: "#FFD93D", // Caution

  // text / UI
  text: "#2D3436",
  textLight: "#B2BEC3",
  sub: "#B2BEC3",
  bg: "#FFFFFF",
  grey: "#B2BEC3",

  // optional night palette (used by older patches)
  nightBg: "#0B1220",
  nightCard: "#111A2E",
} as const;

export type VitalStatus = "stable" | "caution" | "warning" | "observation" | "critical";

function normalizeStatus(status: VitalStatus): "stable" | "caution" | "warning" {
  if (status === "observation") return "caution";
  if (status === "critical") return "warning";
  return status as any;
}

export function statusFromScore(score: number): VitalStatus {
  const s = Number.isFinite(score) ? score : 0;
  if (s >= 70) return "stable";
  if (s >= 30) return "caution";
  return "warning";
}

export function statusLabel(status: VitalStatus) {
  const s = normalizeStatus(status);
  if (s === "stable") return "Stable";
  if (s === "caution") return "Observation Needed";
  return "Critical - Rest Needed";
}

export function statusColor(status: VitalStatus) {
  const s = normalizeStatus(status);
  if (s === "stable") return WNL_COLORS.mint;
  if (s === "caution") return WNL_COLORS.yellow;
  return WNL_COLORS.pink;
}

export function statusCopy(status: VitalStatus) {
  const s = normalizeStatus(status);
  if (s === "stable") return "선생님, 현재 바이탈은 아주 Stable 합니다.";
  if (s === "caution") return "관찰이 필요합니다. 휴식 오더를 한 번 확인해 주세요.";
  return "배터리가 Critical 수준입니다. 오프(OFF)가 절실해요.";
}

export function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function formatHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// =========================
// Legacy helpers
// =========================

export function rollingRange(endISO: ISODate, days: number) {
  const e = fromISODate(endISO);
  const s = addDays(e, -(Math.max(1, days) - 1));
  return { start: toISODate(s), end: endISO };
}

export function shiftTimes(iso: ISODate, shift: Shift): { start: Date; end: Date } | null {
  if (shift === "OFF" || shift === "VAC") return null;

  const base = fromISODate(iso);
  const mk = (h: number, m: number, dayOffset = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  };

  if (shift === "D") return { start: mk(7, 0), end: mk(15, 0) };
  if (shift === "M") return { start: mk(11, 0), end: mk(19, 0) };
  if (shift === "E") return { start: mk(15, 0), end: mk(23, 0) };
  // N: 23:00 ~ 07:00(+1d)
  return { start: mk(23, 0), end: mk(7, 0, 1) };
}

// =========================
// v2.1 helpers
// =========================

function toDateWithHM(base: Date, hm: string) {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/**
 * v2.1 shift window used by OrdersCarousel / TimelineForecast.
 * Always returns a start/end even for OFF/VAC (daytime window).
 */
export function shiftWindow(shift: Shift, pivotDate: Date) {
  if (shift === "D") {
    return { start: toDateWithHM(pivotDate, "07:00"), end: toDateWithHM(pivotDate, "15:00") };
  }
  if (shift === "M") {
    return { start: toDateWithHM(pivotDate, "11:00"), end: toDateWithHM(pivotDate, "19:00") };
  }
  if (shift === "E") {
    return { start: toDateWithHM(pivotDate, "15:00"), end: toDateWithHM(pivotDate, "23:00") };
  }
  if (shift === "N") {
    const start = toDateWithHM(pivotDate, "23:00");
    const end = toDateWithHM(pivotDate, "07:00");
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  // OFF/VAC
  return { start: toDateWithHM(pivotDate, "09:00"), end: toDateWithHM(pivotDate, "23:00") };
}

// =========================
// Orders: per-day done state (new + legacy compatible)
// =========================

const LEGACY_PREFIX = "wnl_orders_done_";

export type OrderKey = "sleep_debt" | "caffeine_npo" | "hormone_duty" | "night_adapt";

const ORDER_KEYS: OrderKey[] = ["sleep_debt", "caffeine_npo", "hormone_duty", "night_adapt"];

export function storageKeyForOrdersDone(dateISO: string) {
  return `wnl:orders:done:${dateISO}`;
}

/**
 * New format: Record<OrderKey, boolean>
 * Legacy format: string[]
 */
export function readOrdersDone(dateISO: string): Record<OrderKey, boolean> {
  const out: Record<OrderKey, boolean> = {
    sleep_debt: false,
    caffeine_npo: false,
    hormone_duty: false,
    night_adapt: false,
  };

  if (typeof window === "undefined") return out;

  // 1) new record
  try {
    const raw = window.localStorage.getItem(storageKeyForOrdersDone(dateISO));
    if (raw) {
      const obj = JSON.parse(raw) ?? {};
      for (const k of ORDER_KEYS) out[k] = Boolean((obj as any)[k]);
    }
  } catch {
    // ignore
  }

  // 2) legacy array
  try {
    const raw = window.localStorage.getItem(`${LEGACY_PREFIX}${dateISO}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const k of ORDER_KEYS) {
          if (arr.includes(k)) out[k] = true;
        }
      }
    }
  } catch {
    // ignore
  }

  return out;
}

export function writeOrdersDone(dateISO: string, next: Record<OrderKey, boolean>) {
  if (typeof window === "undefined") return;

  // write new record
  try {
    window.localStorage.setItem(storageKeyForOrdersDone(dateISO), JSON.stringify(next ?? {}));
  } catch {
    // ignore
  }

  // keep legacy array in sync (older UI)
  try {
    const keys = ORDER_KEYS.filter((k) => Boolean((next as any)?.[k]));
    window.localStorage.setItem(`${LEGACY_PREFIX}${dateISO}`, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

/**
 * Legacy API: string[] list of done keys
 */
export function readDoneKeys(day: ISODate): string[] {
  const set = new Set<string>();

  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(`${LEGACY_PREFIX}${day}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((x) => typeof x === "string" && set.add(x));
    }
  } catch {
    // ignore
  }

  // merge new record -> string list
  try {
    const rec = readOrdersDone(day);
    for (const k of ORDER_KEYS) {
      if (rec[k]) set.add(k);
    }
  } catch {
    // ignore
  }

  return Array.from(set);
}

export function writeDoneKeys(day: ISODate, keys: string[]) {
  if (typeof window === "undefined") return;

  const uniq = Array.from(new Set(keys.filter((x) => typeof x === "string")));

  try {
    window.localStorage.setItem(`${LEGACY_PREFIX}${day}`, JSON.stringify(uniq));
  } catch {
    // ignore
  }

  // also update new record for known keys
  try {
    const cur = readOrdersDone(day);
    const next: Record<OrderKey, boolean> = { ...cur };
    for (const k of ORDER_KEYS) next[k] = uniq.includes(k);
    writeOrdersDone(day, next);
  } catch {
    // ignore
  }
}
