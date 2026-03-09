export type RecoveryOrderDoneMap = Record<string, boolean>;

const STORAGE_PREFIX = "rnest:ai-recovery-orders:done:";

function storageKey(dateISO: string) {
  return `${STORAGE_PREFIX}${dateISO}`;
}

function pruneRecoveryOrderDoneStorage(activeDateISO: string) {
  if (typeof window === "undefined") return;
  try {
    const activeKey = storageKey(activeDateISO);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      if (key !== activeKey) window.localStorage.removeItem(key);
    }
  } catch {
    // ignore local persistence failures
  }
}

export function readRecoveryOrderDone(dateISO: string): RecoveryOrderDoneMap {
  if (typeof window === "undefined") return {};
  pruneRecoveryOrderDoneStorage(dateISO);
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
  pruneRecoveryOrderDoneStorage(dateISO);
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
  pruneRecoveryOrderDoneStorage(dateISO);
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
