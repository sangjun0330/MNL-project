import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";

const BIO_FIELDS = [
  "sleepHours",
  "napHours",
  "stress",
  "activity",
  "caffeineMg",
  "mood",
  "symptomSeverity",
  "workEventTags",
  "workEventNote",
] as const;

function valueOrDash(value: unknown) {
  return value == null ? "-" : value;
}

function normalizeWorkEventTags(value: unknown) {
  if (!Array.isArray(value)) return "-";
  const tags = value
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
  return tags.length ? tags : "-";
}

function normalizeWorkEventNote(value: unknown) {
  if (typeof value !== "string") return "-";
  const note = value.replace(/\s+/g, " ").trim().slice(0, 280);
  return note || "-";
}

export function serializeStateForSupabase(raw: unknown): AppState {
  const sanitized = sanitizeStatePayload(raw);
  const next: AppState = {
    ...sanitized,
    bio: { ...(sanitized.bio ?? {}) },
    emotions: { ...(sanitized.emotions ?? {}) },
  };

  const dateSet = new Set<string>([
    ...Object.keys(next.bio ?? {}),
    ...Object.keys(next.emotions ?? {}),
  ]);

  for (const iso of dateSet) {
    const bio = (next.bio?.[iso as keyof typeof next.bio] ?? {}) as Record<string, unknown>;
    const emotion = (next.emotions?.[iso as keyof typeof next.emotions] ?? {}) as Record<string, unknown>;
    const mergedMood = bio.mood ?? emotion.mood ?? null;
    const fullBio: Record<string, unknown> = {};
    for (const key of BIO_FIELDS) {
      if (key === "mood") {
        fullBio[key] = valueOrDash(mergedMood);
        continue;
      }
      if (key === "workEventTags") {
        fullBio[key] = normalizeWorkEventTags(bio[key]);
        continue;
      }
      if (key === "workEventNote") {
        fullBio[key] = normalizeWorkEventNote(bio[key]);
        continue;
      }
      fullBio[key] = valueOrDash(bio[key]);
    }
    (next.bio as Record<string, any>)[iso] = fullBio;

    (next.emotions as Record<string, any>)[iso] = {
      tags: Array.isArray(emotion.tags) && emotion.tags.length ? emotion.tags : "-",
      note: typeof emotion.note === "string" && emotion.note.trim().length ? emotion.note.trim() : "-",
      createdAt: typeof emotion.createdAt === "number" ? emotion.createdAt : "-",
    };
  }

  return next;
}
