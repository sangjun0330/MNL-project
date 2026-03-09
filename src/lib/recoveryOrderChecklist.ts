export type RecoveryOrderDoneMap = Record<string, boolean>;

const STORAGE_PREFIX = "rnest:ai-recovery-orders:done:";

function storageKey(dateISO: string) {
  return `${STORAGE_PREFIX}${dateISO}`;
}

export function readRecoveryOrderDone(dateISO: string): RecoveryOrderDoneMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(dateISO));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: RecoveryOrderDoneMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && key) next[key] = Boolean(value);
    }
    return next;
  } catch {
    return {};
  }
}

export function writeRecoveryOrderDone(dateISO: string, next: RecoveryOrderDoneMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(dateISO), JSON.stringify(next ?? {}));
  } catch {
    // ignore local persistence failures
  }
}

export function markRecoveryOrderDone(dateISO: string, itemId: string) {
  if (!itemId) return;
  const current = readRecoveryOrderDone(dateISO);
  writeRecoveryOrderDone(dateISO, {
    ...current,
    [itemId]: true,
  });
}

export function clearStaleRecoveryOrderDone(dateISO: string, activeIds: string[]) {
  if (typeof window === "undefined") return;
  const keep = new Set(activeIds.filter(Boolean));
  const current = readRecoveryOrderDone(dateISO);
  let changed = false;
  const next: RecoveryOrderDoneMap = {};
  for (const [key, value] of Object.entries(current)) {
    if (keep.has(key) && value) {
      next[key] = true;
      continue;
    }
    if (value) changed = true;
  }
  if (changed) writeRecoveryOrderDone(dateISO, next);
}
