import type { ISODate } from "@/lib/date";
import { defaultSettings, emptyState, type AppSettings, type AppState, type BioInputs, type EmotionEntry } from "@/lib/model";
import type { Shift } from "@/lib/types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
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

function asTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return TIME_RE.test(trimmed) ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeEmotion(entry: unknown): EmotionEntry | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const moodNum = asFiniteNumber((entry as any).mood);
  if (moodNum == null) return undefined;
  const mood = clamp(Math.round(moodNum), 1, 5) as EmotionEntry["mood"];
  const tagsRaw = Array.isArray((entry as any).tags) ? (entry as any).tags : [];
  const tags = tagsRaw
    .map((tag: unknown) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
  const noteRaw = typeof (entry as any).note === "string" ? (entry as any).note.trim() : "";
  const createdAtNum = asFiniteNumber((entry as any).createdAt);
  const out: EmotionEntry = { mood };
  if (tags.length) out.tags = tags;
  if (noteRaw) out.note = noteRaw.slice(0, 500);
  if (createdAtNum != null) out.createdAt = Math.round(createdAtNum);
  return out;
}

function sanitizeBio(entry: unknown): BioInputs | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const out: BioInputs = {};

  const sleepHours = asFiniteNumber((entry as any).sleepHours);
  if (sleepHours != null) out.sleepHours = Math.round(clamp(sleepHours, 0, 16) * 2) / 2;

  const napHours = asFiniteNumber((entry as any).napHours);
  if (napHours != null) out.napHours = Math.round(clamp(napHours, 0, 4) * 2) / 2;

  const stress = asFiniteNumber((entry as any).stress);
  if (stress != null) out.stress = clamp(Math.round(stress), 0, 3) as BioInputs["stress"];

  const activity = asFiniteNumber((entry as any).activity);
  if (activity != null) out.activity = clamp(Math.round(activity), 0, 3) as BioInputs["activity"];

  const caffeineMg = asFiniteNumber((entry as any).caffeineMg);
  if (caffeineMg != null) out.caffeineMg = clamp(Math.round(caffeineMg), 0, 1000);

  const caffeineLastAt = asTime((entry as any).caffeineLastAt);
  if (caffeineLastAt) out.caffeineLastAt = caffeineLastAt;

  const symptomSeverity = asFiniteNumber((entry as any).symptomSeverity);
  if (symptomSeverity != null) {
    out.symptomSeverity = clamp(Math.round(symptomSeverity), 0, 3) as BioInputs["symptomSeverity"];
  }

  if (out.caffeineMg === 0 && !out.caffeineLastAt) {
    delete (out as any).caffeineMg;
  }
  if (out.symptomSeverity === 0) {
    delete (out as any).symptomSeverity;
  }

  const hasPrimarySignal =
    out.sleepHours != null ||
    out.napHours != null ||
    out.caffeineMg != null ||
    out.caffeineLastAt != null ||
    out.symptomSeverity != null;
  if (!hasPrimarySignal) {
    if (out.stress === 1) delete (out as any).stress;
    if (out.activity === 1) delete (out as any).activity;
  }

  return Object.keys(out).length ? out : undefined;
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

  const emotionsRaw =
    loaded.emotions && typeof loaded.emotions === "object" ? (loaded.emotions as Record<string, unknown>) : {};
  const emotions: Record<ISODate, EmotionEntry | undefined> = {};
  for (const [isoRaw, emoRaw] of Object.entries(emotionsRaw)) {
    const iso = asIso(isoRaw);
    if (!iso) continue;
    const emotion = sanitizeEmotion(emoRaw);
    if (!emotion) continue;
    emotions[iso] = emotion;
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
