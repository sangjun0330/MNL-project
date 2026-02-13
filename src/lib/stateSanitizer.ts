import type { ISODate } from "@/lib/date";
import { defaultSettings, emptyState, type AppSettings, type AppState, type BioInputs, type EmotionEntry } from "@/lib/model";
import type { Shift } from "@/lib/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_SET = new Set<Shift>(["D", "E", "N", "M", "OFF", "VAC"]);

function clamp(value: number, min: number, max: number) {
  const n = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function asIso(value: unknown): ISODate | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_RE.test(trimmed)) return null;
  return trimmed as ISODate;
}

function asShift(value: unknown): Shift | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as Shift;
  return SHIFT_SET.has(trimmed) ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sanitizeTagList(value: unknown, maxItems = 8, maxLength = 28) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
    if (tags.length >= maxItems) break;
  }
  return tags;
}

function sanitizeEmotion(entry: unknown, fallbackMood: number | null = null): EmotionEntry | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const tagsRaw = Array.isArray((entry as any).tags) ? (entry as any).tags : [];
  const tags = tagsRaw
    .map((tag: unknown) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
  const noteRaw = typeof (entry as any).note === "string" ? (entry as any).note.trim() : "";
  const createdAtNum = asFiniteNumber((entry as any).createdAt);
  const moodNum = asFiniteNumber((entry as any).mood) ?? fallbackMood;
  if (moodNum == null && !tags.length && !noteRaw && createdAtNum == null) return undefined;
  const mood = clamp(Math.round(moodNum ?? 3), 1, 5) as EmotionEntry["mood"];
  const out: EmotionEntry = { mood };
  if (tags.length) out.tags = tags;
  if (noteRaw) out.note = noteRaw.slice(0, 500);
  if (createdAtNum != null) out.createdAt = Math.round(createdAtNum);
  return out;
}

function sanitizeBio(entry: unknown): BioInputs | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const source = entry as Record<string, unknown>;
  const out: BioInputs = {};
  let touched = false;

  if (hasOwn(source, "sleepHours")) {
    touched = true;
    if (source.sleepHours == null) out.sleepHours = null;
    else {
      const sleepHours = asFiniteNumber(source.sleepHours);
      if (sleepHours != null) out.sleepHours = Math.round(clamp(sleepHours, 0, 16) * 2) / 2;
    }
  }

  if (hasOwn(source, "napHours")) {
    touched = true;
    if (source.napHours == null) out.napHours = null;
    else {
      const napHours = asFiniteNumber(source.napHours);
      if (napHours != null) out.napHours = Math.round(clamp(napHours, 0, 4) * 2) / 2;
    }
  }

  if (hasOwn(source, "sleepQuality")) {
    touched = true;
    if (source.sleepQuality == null) out.sleepQuality = null;
    else {
      const sleepQuality = asFiniteNumber(source.sleepQuality);
      if (sleepQuality != null) out.sleepQuality = clamp(Math.round(sleepQuality), 1, 5) as BioInputs["sleepQuality"];
    }
  }

  if (hasOwn(source, "sleepTiming")) {
    touched = true;
    const timing = source.sleepTiming;
    if (timing == null) out.sleepTiming = null;
    else if (timing === "auto" || timing === "night" || timing === "day" || timing === "mixed") {
      out.sleepTiming = timing;
    }
  }

  if (hasOwn(source, "stress")) {
    touched = true;
    if (source.stress == null) out.stress = null;
    else {
      const stress = asFiniteNumber(source.stress);
      if (stress != null) out.stress = clamp(Math.round(stress), 0, 3) as BioInputs["stress"];
    }
  }

  if (hasOwn(source, "activity")) {
    touched = true;
    if (source.activity == null) out.activity = null;
    else {
      const activity = asFiniteNumber(source.activity);
      if (activity != null) out.activity = clamp(Math.round(activity), 0, 3) as BioInputs["activity"];
    }
  }

  if (hasOwn(source, "caffeineMg")) {
    touched = true;
    if (source.caffeineMg == null) out.caffeineMg = null;
    else {
      const caffeineMg = asFiniteNumber(source.caffeineMg);
      if (caffeineMg != null) out.caffeineMg = clamp(Math.round(caffeineMg), 0, 1000);
    }
  }

  if (hasOwn(source, "mood")) {
    touched = true;
    if (source.mood == null) out.mood = null;
    else {
      const mood = asFiniteNumber(source.mood);
      if (mood != null) out.mood = clamp(Math.round(mood), 1, 5) as BioInputs["mood"];
    }
  }

  if (hasOwn(source, "symptomSeverity")) {
    touched = true;
    if (source.symptomSeverity == null) out.symptomSeverity = null;
    else {
      const symptomSeverity = asFiniteNumber(source.symptomSeverity);
      if (symptomSeverity != null) {
        out.symptomSeverity = clamp(Math.round(symptomSeverity), 0, 3) as BioInputs["symptomSeverity"];
      }
    }
  }

  if (hasOwn(source, "workEventTags")) {
    touched = true;
    if (source.workEventTags == null) out.workEventTags = null;
    else {
      const tags = sanitizeTagList(source.workEventTags);
      out.workEventTags = tags.length ? tags : null;
    }
  }

  if (hasOwn(source, "workEventNote")) {
    touched = true;
    if (source.workEventNote == null) out.workEventNote = null;
    else if (typeof source.workEventNote === "string") {
      const note = source.workEventNote.replace(/\s+/g, " ").trim().slice(0, 280);
      out.workEventNote = !note || note === "-" ? null : note;
    }
  }

  return touched ? out : undefined;
}

function sanitizeSettings(raw: unknown): AppSettings {
  const defaults = defaultSettings();
  const loaded = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const loadedMenstrual =
    loaded.menstrual && typeof loaded.menstrual === "object"
      ? (loaded.menstrual as Record<string, unknown>)
      : {};
  const loadedProfile =
    loaded.profile && typeof loaded.profile === "object"
      ? (loaded.profile as Record<string, unknown>)
      : {};

  const menstrualEnabled = Boolean(loadedMenstrual.enabled ?? defaults.menstrual.enabled);
  const cycleLengthNum = asFiniteNumber(loadedMenstrual.cycleLength);
  const periodLengthNum = asFiniteNumber(loadedMenstrual.periodLength);
  const chronotypeNum = asFiniteNumber(loadedProfile.chronotype);
  const sensitivityNum = asFiniteNumber(loadedProfile.caffeineSensitivity);

  return {
    ...defaults,
    theme: loaded.theme === "dark" ? "dark" : "light",
    language: loaded.language === "en" ? "en" : "ko",
    menstrual: {
      ...defaults.menstrual,
      enabled: menstrualEnabled,
      lastPeriodStart: asIso(loadedMenstrual.lastPeriodStart ?? loadedMenstrual.startISO) ?? null,
      cycleLength: cycleLengthNum == null ? defaults.menstrual.cycleLength : clamp(Math.round(cycleLengthNum), 20, 45),
      periodLength: periodLengthNum == null ? defaults.menstrual.periodLength : clamp(Math.round(periodLengthNum), 2, 10),
    },
    profile: {
      chronotype: chronotypeNum == null ? defaults.profile?.chronotype ?? 0.5 : clamp(chronotypeNum, 0, 1),
      caffeineSensitivity:
        sensitivityNum == null ? defaults.profile?.caffeineSensitivity ?? 1 : clamp(sensitivityNum, 0.5, 1.5),
    },
  };
}

export function sanitizeStatePayload(raw: unknown): AppState {
  const loaded = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = emptyState();

  const scheduleRaw = loaded.schedule && typeof loaded.schedule === "object" ? (loaded.schedule as Record<string, unknown>) : {};
  const schedule: Record<ISODate, Shift | undefined> = {};
  for (const [isoRaw, shiftRaw] of Object.entries(scheduleRaw)) {
    const iso = asIso(isoRaw);
    const shift = asShift(shiftRaw);
    if (!iso || !shift) continue;
    schedule[iso] = shift;
  }

  const notesRaw = loaded.notes && typeof loaded.notes === "object" ? (loaded.notes as Record<string, unknown>) : {};
  const notes: Record<ISODate, string | undefined> = {};
  for (const [isoRaw, noteRaw] of Object.entries(notesRaw)) {
    const iso = asIso(isoRaw);
    if (!iso || typeof noteRaw !== "string") continue;
    const note = noteRaw.trim();
    if (!note) continue;
    notes[iso] = note.slice(0, 1000);
  }

  const shiftNamesRaw =
    loaded.shiftNames && typeof loaded.shiftNames === "object" ? (loaded.shiftNames as Record<string, unknown>) : {};
  const shiftNames: Record<ISODate, string | undefined> = {};
  for (const [isoRaw, nameRaw] of Object.entries(shiftNamesRaw)) {
    const iso = asIso(isoRaw);
    if (!iso || typeof nameRaw !== "string") continue;
    const name = nameRaw.trim();
    if (!name) continue;
    shiftNames[iso] = name.slice(0, 40);
  }

  const bioRaw = loaded.bio && typeof loaded.bio === "object" ? (loaded.bio as Record<string, unknown>) : {};
  const bio: Record<ISODate, BioInputs | undefined> = {};
  for (const [isoRaw, bioEntryRaw] of Object.entries(bioRaw)) {
    const iso = asIso(isoRaw);
    if (!iso) continue;
    const bioEntry = sanitizeBio(bioEntryRaw);
    if (!bioEntry) continue;
    bio[iso] = bioEntry;
  }

  const emotionsRaw =
    loaded.emotions && typeof loaded.emotions === "object" ? (loaded.emotions as Record<string, unknown>) : {};
  const emotions: Record<ISODate, EmotionEntry | undefined> = {};
  for (const [isoRaw, emoRaw] of Object.entries(emotionsRaw)) {
    const iso = asIso(isoRaw);
    if (!iso) continue;
    const fallbackMood = bio[iso]?.mood ?? null;
    const emotion = sanitizeEmotion(emoRaw, fallbackMood);
    if (!emotion) continue;
    emotions[iso] = emotion;
  }

  return {
    ...base,
    selected: asIso(loaded.selected) ?? base.selected,
    schedule,
    shiftNames,
    notes,
    emotions,
    bio,
    settings: sanitizeSettings(loaded.settings),
  };
}
