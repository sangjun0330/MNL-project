import { safeParse } from "@/lib/safeParse";
import { handoffScopedKey } from "@/lib/handoff/storageScope";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AUDIT_TTL_MS = 30 * DAY_MS;
const MAX_AUDIT_EVENT_COUNT = 300;

export type HandoffAuditAction =
  | "policy_blocked"
  | "pipeline_run"
  | "session_saved"
  | "session_shred"
  | "all_data_purged";

export type HandoffAuditEvent = {
  id: string;
  at: number;
  action: HandoffAuditAction;
  sessionId: string | null;
  detail: string | null;
};

type StoredAuditLog = {
  createdAt: number;
  expiresAt: number;
  events: HandoffAuditEvent[];
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

function auditLogKey() {
  return handoffScopedKey("audit:log");
}

function sanitizeDetail(detail: string | null | undefined) {
  if (!detail) return null;
  const normalized = detail
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\w .:/()\-|%]/g, "")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, 180);
}

function nextAuditId() {
  return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAuditLog(storage: Storage): StoredAuditLog {
  const raw = safeGetItem(storage, auditLogKey());
  const parsed = safeParse<StoredAuditLog | null>(raw, null);
  if (!parsed?.events?.length || parsed.expiresAt <= Date.now()) {
    return {
      createdAt: Date.now(),
      expiresAt: Date.now() + DEFAULT_AUDIT_TTL_MS,
      events: [],
    };
  }
  return parsed;
}

export function appendHandoffAuditEvent(input: {
  action: HandoffAuditAction;
  sessionId?: string | null;
  detail?: string | null;
}) {
  const storage = getStorage();
  if (!storage) return false;

  const log = readAuditLog(storage);
  const event: HandoffAuditEvent = {
    id: nextAuditId(),
    at: Date.now(),
    action: input.action,
    sessionId: input.sessionId ?? null,
    detail: sanitizeDetail(input.detail),
  };
  const next: StoredAuditLog = {
    createdAt: log.createdAt,
    expiresAt: Date.now() + DEFAULT_AUDIT_TTL_MS,
    events: [event, ...log.events].slice(0, MAX_AUDIT_EVENT_COUNT),
  };
  return safeSetItem(storage, auditLogKey(), JSON.stringify(next));
}

export function listHandoffAuditEvents(limit = 30): HandoffAuditEvent[] {
  const storage = getStorage();
  if (!storage) return [];
  const log = readAuditLog(storage);
  return log.events.slice(0, Math.max(1, limit));
}

export function purgeExpiredHandoffAuditEvents() {
  const storage = getStorage();
  if (!storage) return 0;

  const raw = safeGetItem(storage, auditLogKey());
  const parsed = safeParse<StoredAuditLog | null>(raw, null);
  if (!parsed) return 0;
  if (parsed.expiresAt > Date.now()) return 0;

  safeRemoveItem(storage, auditLogKey());
  return 1;
}
