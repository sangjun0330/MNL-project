import type { AppState, BioInputs, EmotionEntry } from "@/lib/model";
import type { ISODate } from "@/lib/date";

function hasMeaningfulBio(bio?: BioInputs | null): boolean {
  if (!bio) return false;
  return (
    bio.sleepHours != null ||
    bio.napHours != null ||
    bio.sleepQuality != null ||
    (bio.sleepTiming != null && bio.sleepTiming !== "auto") ||
    bio.stress != null ||
    bio.activity != null ||
    bio.caffeineMg != null ||
    bio.caffeineLastAt != null ||
    bio.fatigueLevel != null ||
    bio.symptomSeverity != null ||
    bio.menstrualStatus != null ||
    bio.menstrualFlow != null ||
    bio.shiftOvertimeHours != null
  );
}

function hasMeaningfulEmotion(emotion?: EmotionEntry | null): boolean {
  if (!emotion) return false;
  return emotion.mood != null;
}

export function hasHealthInput(bio?: BioInputs | null, emotion?: EmotionEntry | null): boolean {
  return hasMeaningfulBio(bio) || hasMeaningfulEmotion(emotion);
}

export function countHealthRecordedDays(state: Pick<AppState, "bio" | "emotions">): number {
  const dates = new Set<ISODate>();
  const bioEntries = state.bio ?? {};
  const emotionEntries = state.emotions ?? {};
  const allDates = new Set<ISODate>([...Object.keys(bioEntries), ...Object.keys(emotionEntries)] as ISODate[]);

  for (const iso of allDates) {
    if (hasHealthInput(bioEntries[iso], emotionEntries[iso])) {
      dates.add(iso);
    }
  }

  return dates.size;
}
