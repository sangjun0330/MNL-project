import type { AppState } from "@/lib/model";
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

export function readAppStateDraft(userId: string | null): AppStateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(userId ? buildDraftKey(userId) : GUEST_APP_STATE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown; state?: unknown } | null;
    const updatedAt =
      typeof parsed?.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now();
    const state = serializeStateForSupabase(sanitizeStatePayload(parsed?.state));
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
