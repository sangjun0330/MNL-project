import type { ISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";

/**
 * Local-only persistence.
 * v2 adds `notes` (per-day memo).
 */
const KEY = "rnest_bodybattery_v2";

export type PersistedState = {
  version: 2;
  schedule: Record<ISODate, Shift>;
  notes: Record<ISODate, string>;
};

export function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedState;

    if (!parsed || parsed.version !== 2) return null;
    if (!parsed.schedule) return null;
    if (!parsed.notes) parsed.notes = {};

    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function resetState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
