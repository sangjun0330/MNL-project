import { safeParse } from "@/lib/safeParse";
import type { HandoverSessionResult } from "@/lib/handoff/types";
import { sanitizeStructuredSession } from "@/lib/handoff/deidGuard";
import { handoffScopedKey, handoffScopedPrefix } from "@/lib/handoff/storageScope";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STRUCTURED_TTL_MS = 7 * DAY_MS;

export type StructuredSessionRecord = {
  id: string;
  createdAt: number;
  expiresAt: number;
  result: HandoverSessionResult;
};

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function safeGetItem(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function structuredPrefix() {
  return handoffScopedPrefix("structured");
}

function structuredIndexKey() {
  return handoffScopedKey("structured:index");
}

function readIndex(storage: Storage) {
  return safeParse<string[]>(safeGetItem(storage, structuredIndexKey()), []);
}

function writeIndex(storage: Storage, ids: string[]) {
  const unique = [...new Set(ids)];
  return safeSetItem(storage, structuredIndexKey(), JSON.stringify(unique));
}

function sanitizeRecord(record: StructuredSessionRecord) {
  const sanitized = sanitizeStructuredSession(record.result);
  const nextRecord = {
    ...record,
    result: sanitized.result,
  };

  if (!sanitized.issues.length) {
    return {
      record: nextRecord,
      changed: false,
      issueCount: 0,
      residualCount: sanitized.residualIssues.length,
    };
  }

  return {
    record: nextRecord,
    changed: true,
    issueCount: sanitized.issues.length,
    residualCount: sanitized.residualIssues.length,
  };
}

export function saveStructuredSession(result: HandoverSessionResult, ttlMs = DEFAULT_STRUCTURED_TTL_MS) {
  const storage = getStorage();
  if (!storage) return false;

  const sanitized = sanitizeStructuredSession(result);
  if (sanitized.residualIssues.length) {
    return false;
  }
  const now = Date.now();
  const record: StructuredSessionRecord = {
    id: sanitized.result.sessionId,
    createdAt: now,
    expiresAt: now + ttlMs,
    result: sanitized.result,
  };

  const stored = safeSetItem(storage, `${structuredPrefix()}${result.sessionId}`, JSON.stringify(record));
  if (!stored) return false;
  const index = readIndex(storage);
  const indexStored = writeIndex(storage, [result.sessionId, ...index.filter((id) => id !== result.sessionId)]);
  return Boolean(indexStored);
}

export function loadStructuredSession(sessionId: string): StructuredSessionRecord | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = safeGetItem(storage, `${structuredPrefix()}${sessionId}`);
  const record = safeParse<StructuredSessionRecord | null>(raw, null);
  if (!record) return null;

  if (record.expiresAt <= Date.now()) {
    deleteStructuredSession(sessionId);
    return null;
  }

  const sanitized = sanitizeRecord(record);
  if (sanitized.residualCount > 0) {
    deleteStructuredSession(sessionId);
    return null;
  }
  if (sanitized.changed) {
    safeSetItem(storage, `${structuredPrefix()}${sessionId}`, JSON.stringify(sanitized.record));
  }

  return sanitized.record;
}

export function listStructuredSessions(): StructuredSessionRecord[] {
  const storage = getStorage();
  if (!storage) return [];

  const now = Date.now();
  const index = readIndex(storage);
  const alive: string[] = [];
  const records: StructuredSessionRecord[] = [];

  index.forEach((id) => {
    const raw = safeGetItem(storage, `${structuredPrefix()}${id}`);
    const record = safeParse<StructuredSessionRecord | null>(raw, null);
    if (!record) return;
    if (record.expiresAt <= now) {
      safeRemoveItem(storage, `${structuredPrefix()}${id}`);
      return;
    }
    const sanitized = sanitizeRecord(record);
    if (sanitized.residualCount > 0) {
      safeRemoveItem(storage, `${structuredPrefix()}${id}`);
      return;
    }
    if (sanitized.changed) {
      safeSetItem(storage, `${structuredPrefix()}${id}`, JSON.stringify(sanitized.record));
    }
    alive.push(id);
    records.push(sanitized.record);
  });

  if (alive.length !== index.length) {
    writeIndex(storage, alive);
  }

  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteStructuredSession(sessionId: string) {
  const storage = getStorage();
  if (!storage) return;

  safeRemoveItem(storage, `${structuredPrefix()}${sessionId}`);
  const index = readIndex(storage);
  writeIndex(storage, index.filter((id) => id !== sessionId));
}

export function deleteAllStructuredSessions() {
  const storage = getStorage();
  if (!storage) return 0;

  const index = readIndex(storage);
  const unique = [...new Set(index)];
  unique.forEach((id) => {
    safeRemoveItem(storage, `${structuredPrefix()}${id}`);
  });
  safeRemoveItem(storage, structuredIndexKey());
  return unique.length;
}

export function purgeExpiredStructuredSessions() {
  const storage = getStorage();
  if (!storage) return 0;

  const now = Date.now();
  const index = readIndex(storage);
  let purged = 0;
  const alive: string[] = [];

  index.forEach((id) => {
    const raw = safeGetItem(storage, `${structuredPrefix()}${id}`);
    const record = safeParse<StructuredSessionRecord | null>(raw, null);
    if (!record || record.expiresAt <= now) {
      safeRemoveItem(storage, `${structuredPrefix()}${id}`);
      purged += 1;
      return;
    }
    alive.push(id);
  });

  if (alive.length !== index.length) writeIndex(storage, alive);
  return purged;
}
