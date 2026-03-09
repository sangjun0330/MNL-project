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

export function doneMapFromIds(ids: string[]): RecoveryOrderDoneMap {
  const next: RecoveryOrderDoneMap = {};
  for (const id of ids) {
    if (typeof id === "string" && id) next[id] = true;
  }
  return next;
}

function completedIdsFromDoneMap(doneMap: RecoveryOrderDoneMap): string[] {
  return Object.entries(doneMap)
    .filter(([, done]) => Boolean(done))
    .map(([id]) => id);
}

export async function readRemoteRecoveryOrderDone(dateISO: string): Promise<RecoveryOrderDoneMap> {
  if (typeof window === "undefined") return {};
  try {
    const res = await fetch(`/api/insights/recovery/orders/progress?dateISO=${encodeURIComponent(dateISO)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return {};
    const json = await res.json().catch(() => null);
    const completedIds = Array.isArray(json?.data?.completedIds)
      ? json.data.completedIds.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];
    return doneMapFromIds(completedIds);
  } catch {
    return {};
  }
}

export async function writeRemoteRecoveryOrderDone(dateISO: string, doneMap: RecoveryOrderDoneMap) {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/insights/recovery/orders/progress", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateISO,
        completedIds: completedIdsFromDoneMap(doneMap),
      }),
    });
  } catch {
    // ignore remote persistence failures
  }
}
