import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";

const BIO_FIELDS = [
  "sleepHours",
  "napHours",
  "sleepQuality",
  "sleepTiming",
  "stress",
  "activity",
  "caffeineMg",
  "caffeineLastAt",
  "fatigueLevel",
  "symptomSeverity",
  "menstrualStatus",
  "menstrualFlow",
  "shiftOvertimeHours",
] as const;

function valueOrDash(value: unknown) {
  return value == null ? "-" : value;
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
    const fullBio: Record<string, unknown> = {};
    for (const key of BIO_FIELDS) {
      fullBio[key] = valueOrDash(bio[key]);
    }
    (next.bio as Record<string, any>)[iso] = fullBio;

    const emotion = (next.emotions?.[iso as keyof typeof next.emotions] ?? {}) as Record<string, unknown>;
    (next.emotions as Record<string, any>)[iso] = {
      mood: valueOrDash(emotion.mood),
      tags: Array.isArray(emotion.tags) && emotion.tags.length ? emotion.tags : "-",
      note: typeof emotion.note === "string" && emotion.note.trim().length ? emotion.note.trim() : "-",
      createdAt: typeof emotion.createdAt === "number" ? emotion.createdAt : "-",
    };
  }

  return next;
}
