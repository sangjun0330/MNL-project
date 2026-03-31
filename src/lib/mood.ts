import type { BioInputs, EmotionEntry, MoodScore } from "@/lib/model";

function hasOwnMoodField(bio: BioInputs | null | undefined) {
  return Boolean(bio) && Object.prototype.hasOwnProperty.call(bio, "mood");
}

/**
 * Canonical mood source:
 * 1. `bio.mood` when the field exists on the daily bio record
 * 2. `emotions.mood` only as a compatibility fallback for legacy readers
 */
export function readRecordedMood(
  bio: BioInputs | null | undefined,
  emotion: EmotionEntry | null | undefined
): MoodScore | null {
  if (hasOwnMoodField(bio)) return (bio?.mood ?? null) as MoodScore | null;
  return (emotion?.mood ?? null) as MoodScore | null;
}

export function hasRecordedMood(
  bio: BioInputs | null | undefined,
  emotion: EmotionEntry | null | undefined
) {
  return readRecordedMood(bio, emotion) != null;
}

/**
 * `emotions.mood` is maintained only as a compatibility mirror.
 * Metadata-only emotion entries are not supported in the current store shape,
 * so clearing mood also clears the mirrored emotion record.
 */
export function syncEmotionMoodMirror(
  current: EmotionEntry | null | undefined,
  mood: MoodScore | null
): EmotionEntry | undefined {
  if (mood == null) return undefined;
  return {
    ...(current ?? {}),
    mood,
  };
}
