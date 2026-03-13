import type { AppState } from "@/lib/model";
import { defaultSettings } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { serializeStateForSupabase } from "@/lib/statePersistence";

const APP_STATE_DRAFT_KEY = "rnest_app_state_draft_v1";
const GUEST_APP_STATE_DRAFT_KEY = `${APP_STATE_DRAFT_KEY}:guest`;

export type AppStateDraft = {
  updatedAt: number;
  state: AppState;
};

function buildDraftKey(userId: string) {
  return `${APP_STATE_DRAFT_KEY}:${userId}`;
}

function countKeys(value: unknown) {
  return value && typeof value === "object" ? Object.keys(value as Record<string, unknown>).length : 0;
}

function hasMeaningfulSettings(state: AppState) {
  return JSON.stringify(state.settings) !== JSON.stringify(defaultSettings());
}

export function hasMeaningfulAppState(rawState: unknown): boolean {
  const state = serializeStateForSupabase(sanitizeStatePayload(rawState));
  return (
    countKeys(state.schedule) > 0 ||
    countKeys(state.shiftNames) > 0 ||
    countKeys(state.notes) > 0 ||
    countKeys(state.emotions) > 0 ||
    countKeys(state.bio) > 0 ||
    hasMeaningfulSettings(state)
  );
}

function clearDraft(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(userId ? buildDraftKey(userId) : GUEST_APP_STATE_DRAFT_KEY);
  } catch {
    // Ignore local draft clear failures.
  }
}

export function readAppStateDraft(userId: string | null): AppStateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(userId ? buildDraftKey(userId) : GUEST_APP_STATE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown; state?: unknown } | null;
    const updatedAt =
      typeof parsed?.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now();
    const state = serializeStateForSupabase(sanitizeStatePayload(parsed?.state));
    if (!hasMeaningfulAppState(state)) return null;
    return { updatedAt, state };
  } catch {
    return null;
  }
}

export function readPreferredAppStateDraft(userId: string | null): AppStateDraft | null {
  const scoped = readAppStateDraft(userId);
  if (!userId) return scoped;
  const guest = readAppStateDraft(null);
  if (!guest) return scoped;
  if (!scoped) return guest;
  return guest.updatedAt > scoped.updatedAt ? guest : scoped;
}

export function writeAppStateDraft(userId: string | null, rawState: unknown) {
  if (typeof window === "undefined") return;
  try {
    const state = serializeStateForSupabase(sanitizeStatePayload(rawState));
    if (!hasMeaningfulAppState(state)) {
      clearDraft(userId);
      return;
    }
    window.localStorage.setItem(
      userId ? buildDraftKey(userId) : GUEST_APP_STATE_DRAFT_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        state,
      })
    );
  } catch {
    // Ignore draft write failures.
  }
}
