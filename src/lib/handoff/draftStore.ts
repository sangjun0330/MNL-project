import { safeParse } from "@/lib/safeParse";
import { handoffScopedKey } from "@/lib/handoff/storageScope";
import type { DutyType } from "@/lib/handoff/types";

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type HandoffDraftMeta = {
  sessionId: string;
  dutyType: DutyType;
  updatedAt: number;
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

function draftMetaKey() {
  return handoffScopedKey("draft:meta");
}

export function saveHandoffDraftMeta(meta: HandoffDraftMeta) {
  const storage = getStorage();
  if (!storage) return;
  safeSetItem(storage, draftMetaKey(), JSON.stringify(meta));
}

export function loadHandoffDraftMeta(): HandoffDraftMeta | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = safeGetItem(storage, draftMetaKey());
  const parsed = safeParse<HandoffDraftMeta | null>(raw, null);
  if (!parsed) return null;

  if (!parsed.sessionId || !parsed.dutyType || !parsed.updatedAt) {
    safeRemoveItem(storage, draftMetaKey());
    return null;
  }

  if (Date.now() - parsed.updatedAt > DRAFT_MAX_AGE_MS) {
    safeRemoveItem(storage, draftMetaKey());
    return null;
  }

  return parsed;
}

export function clearHandoffDraftMeta(sessionId?: string) {
  const storage = getStorage();
  if (!storage) return;

  if (!sessionId) {
    safeRemoveItem(storage, draftMetaKey());
    return;
  }

  const current = loadHandoffDraftMeta();
  if (!current || current.sessionId === sessionId) {
    safeRemoveItem(storage, draftMetaKey());
  }
}

export function clearAllHandoffDraftMeta() {
  const storage = getStorage();
  if (!storage) return;
  safeRemoveItem(storage, draftMetaKey());
}
