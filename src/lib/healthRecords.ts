import type { BioInputs, EmotionEntry } from "@/lib/model";

function hasValue(v: unknown) {
  return v !== null && v !== undefined;
}

export function hasHealthInput(bio?: BioInputs | null, emotion?: EmotionEntry | null) {
  if (emotion && hasValue(emotion.mood)) return true;

  if (!bio) return false;

  if (hasValue(bio.sleepHours)) return true;
  if (hasValue(bio.napHours)) return true;
  if (hasValue(bio.sleepQuality)) return true;
  if (bio.sleepTiming && bio.sleepTiming !== "auto") return true;
  if (hasValue(bio.stress)) return true;
  if (hasValue(bio.activity)) return true;
  if (hasValue(bio.caffeineMg)) return true;
  if (hasValue(bio.caffeineLastAt)) return true;
  if (hasValue(bio.fatigueLevel)) return true;
  if (typeof bio.symptomSeverity === "number" && bio.symptomSeverity > 0) return true;
  if (bio.menstrualStatus && bio.menstrualStatus !== "none") return true;
  if (typeof bio.menstrualFlow === "number" && bio.menstrualFlow > 0) return true;
  if (typeof bio.shiftOvertimeHours === "number" && bio.shiftOvertimeHours > 0) return true;

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
