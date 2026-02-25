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

function hasMeaningfulScalar(value: unknown) {
  return value != null;
}

function normalizeWorkEventTags(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
  return tags.length ? tags : undefined;
}

function normalizeWorkEventNote(value: unknown) {
  if (typeof value !== "string") return undefined;
  const note = value.replace(/\s+/g, " ").trim().slice(0, 280);
  return note || undefined;
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
        if (hasMeaningfulScalar(mergedMood)) fullBio[key] = mergedMood;
        continue;
      }
      if (key === "workEventTags") {
        const tags = normalizeWorkEventTags(bio[key]);
        if (tags) fullBio[key] = tags;
        continue;
      }
      if (key === "workEventNote") {
        const note = normalizeWorkEventNote(bio[key]);
        if (note) fullBio[key] = note;
        continue;
      }
      if (hasMeaningfulScalar(bio[key])) fullBio[key] = bio[key];
    }
    if (Object.keys(fullBio).length) (next.bio as Record<string, any>)[iso] = fullBio;
    else delete (next.bio as Record<string, any>)[iso];

    const emotionOut: Record<string, unknown> = {};
    if (typeof emotion.mood === "number") emotionOut.mood = emotion.mood;
    if (Array.isArray(emotion.tags) && emotion.tags.length) emotionOut.tags = emotion.tags;
    if (typeof emotion.note === "string" && emotion.note.trim().length) emotionOut.note = emotion.note.trim();
    if (typeof emotion.createdAt === "number") emotionOut.createdAt = emotion.createdAt;
    if (Object.keys(emotionOut).length) (next.emotions as Record<string, any>)[iso] = emotionOut;
    else delete (next.emotions as Record<string, any>)[iso];
  }

  return next;
}
