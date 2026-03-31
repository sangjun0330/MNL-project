import type { BioInputs, EmotionEntry } from "@/lib/model";
import { hasRecordedMood } from "@/lib/mood";

function hasValue(v: unknown) {
  return v !== null && v !== undefined;
}

export function hasHealthInput(bio?: BioInputs | null, emotion?: EmotionEntry | null) {
  if (hasRecordedMood(bio, emotion)) return true;
  if (!bio) return false;

  if (hasValue(bio.sleepHours)) return true;
  if (hasValue(bio.napHours)) return true;
  if (hasValue(bio.stress)) return true;
  if (hasValue(bio.activity)) return true;
  if (hasValue(bio.caffeineMg)) return true;
  if (hasValue(bio.symptomSeverity)) return true;
  if (hasValue(bio.menstrualStatus)) return true;
  if (hasValue(bio.menstrualFlow)) return true;
  if (hasValue(bio.shiftOvertimeHours)) return true;
  if (Array.isArray(bio.workEventTags) && bio.workEventTags.length > 0) return true;
  if (typeof bio.workEventNote === "string" && bio.workEventNote.trim().length > 0) return true;

  return false;
}

export function countHealthRecordedDays(params: {
  bio?: Record<string, BioInputs | null | undefined>;
  emotions?: Record<string, EmotionEntry | null | undefined>;
}) {
  const dates = new Set<string>();
  const bio = params.bio ?? {};
  const emotions = params.emotions ?? {};

  for (const iso of new Set([...Object.keys(bio), ...Object.keys(emotions)])) {
    if (hasHealthInput(bio[iso] ?? null, emotions[iso] ?? null)) dates.add(iso);
  }

  return dates.size;
}
