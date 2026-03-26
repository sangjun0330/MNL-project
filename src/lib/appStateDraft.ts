import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { compareDraftCandidates, hasMeaningfulTrackedAppState } from "@/lib/appStateIntegrity";

const APP_STATE_DRAFT_KEY = "rnest_app_state_draft_v1";
const APP_STATE_BACKUP_KEY = "rnest_app_state_backup_v1";
const GUEST_APP_STATE_DRAFT_KEY = `${APP_STATE_DRAFT_KEY}:guest`;
const GUEST_APP_STATE_BACKUP_KEY = `${APP_STATE_BACKUP_KEY}:guest`;
const APP_STATE_BACKUP_LIMIT = 8;
const APP_STATE_BACKUP_RETENTION_MS = 1000 * 60 * 60 * 24 * 45;

export type AppStateDraft = {
  updatedAt: number;
  state: AppState;
};

type StoredAppStateDraft = AppStateDraft & {
  signature?: string;
};

function buildDraftKey(userId: string) {
  return `${APP_STATE_DRAFT_KEY}:${userId}`;
}

function buildBackupKey(userId: string) {
  return `${APP_STATE_BACKUP_KEY}:${userId}`;
}

function getDraftStorageKey(userId: string | null) {
  return userId ? buildDraftKey(userId) : GUEST_APP_STATE_DRAFT_KEY;
}

function getBackupStorageKey(userId: string | null) {
  return userId ? buildBackupKey(userId) : GUEST_APP_STATE_BACKUP_KEY;
}

function normalizeDraftCandidate(input: { updatedAt?: unknown; state?: unknown; signature?: unknown } | null): StoredAppStateDraft | null {
  if (!input) return null;
  const updatedAt = typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now();
  const state = serializeStateForSupabase(sanitizeStatePayload(input.state));
  if (!hasMeaningfulTrackedAppState(state)) return null;
  const signature =
    typeof input.signature === "string" && input.signature.trim().length ? input.signature : JSON.stringify(state);
  return { updatedAt, state, signature };
}

function readStoredDraft(userId: string | null): StoredAppStateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(userId));
    if (!raw) return null;
    return normalizeDraftCandidate(JSON.parse(raw) as { updatedAt?: unknown; state?: unknown; signature?: unknown } | null);
  } catch {
    return null;
  }
}

function readStoredBackups(userId: string | null): StoredAppStateDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getBackupStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const minUpdatedAt = Date.now() - APP_STATE_BACKUP_RETENTION_MS;
    return parsed
      .map((item) => normalizeDraftCandidate(item as { updatedAt?: unknown; state?: unknown; signature?: unknown } | null))
      .filter((item): item is StoredAppStateDraft => item !== null)
      .filter((item) => item.updatedAt >= minUpdatedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function pickBestDraftCandidate(candidates: Array<StoredAppStateDraft | null | undefined>): AppStateDraft | null {
  const valid = candidates.filter((candidate): candidate is StoredAppStateDraft => Boolean(candidate));
  if (!valid.length) return null;
  valid.sort(compareDraftCandidates);
  const [best] = valid;
  if (!best) return null;
  return { updatedAt: best.updatedAt, state: best.state };
}

function persistBackupSnapshot(userId: string | null, nextDraft: StoredAppStateDraft) {
  if (typeof window === "undefined") return;
  try {
    const backupKey = getBackupStorageKey(userId);
    const minUpdatedAt = Date.now() - APP_STATE_BACKUP_RETENTION_MS;
    const existing = readStoredBackups(userId).filter((item) => item.updatedAt >= minUpdatedAt);
    const deduped = existing.filter((item) => item.signature !== nextDraft.signature);
    const snapshots = [nextDraft, ...deduped].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, APP_STATE_BACKUP_LIMIT);
    window.localStorage.setItem(backupKey, JSON.stringify(snapshots));
  } catch {
    // Ignore local backup failures.
  }
}

export function hasMeaningfulAppState(rawState: unknown): boolean {
  const state = serializeStateForSupabase(sanitizeStatePayload(rawState));
  return hasMeaningfulTrackedAppState(state);
}

function clearDraft(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftStorageKey(userId));
    window.localStorage.removeItem(getBackupStorageKey(userId));
  } catch {
    // Ignore local draft clear failures.
  }
}

export function readAppStateDraft(userId: string | null): AppStateDraft | null {
  return pickBestDraftCandidate([readStoredDraft(userId), ...readStoredBackups(userId)]);
}

export function readPreferredAppStateDraft(userId: string | null): AppStateDraft | null {
  if (!userId) return readAppStateDraft(null);
  return readAppStateDraft(userId);
}

export function writeAppStateDraft(userId: string | null, rawState: unknown) {
  if (typeof window === "undefined") return;
  try {
    const state = serializeStateForSupabase(sanitizeStatePayload(rawState));
    if (!hasMeaningfulAppState(state)) {
      return;
    }
    const nextDraft: StoredAppStateDraft = {
      updatedAt: Date.now(),
      state,
      signature: JSON.stringify(state),
    };
    window.localStorage.setItem(getDraftStorageKey(userId), JSON.stringify(nextDraft));
    persistBackupSnapshot(userId, nextDraft);
  } catch {
    // Ignore draft write failures.
  }
}

export function purgeAllAppStateDrafts() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(APP_STATE_DRAFT_KEY) || key.startsWith(APP_STATE_BACKUP_KEY)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    clearDraft(null);
  }
}
