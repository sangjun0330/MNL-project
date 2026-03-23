import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { AppSettings, AppState, BioInputs, EmotionEntry } from "@/lib/model";
import type { SubscriptionSnapshot } from "@/lib/server/billingStore";
import type { Shift } from "@/lib/types";
import type { Json } from "@/types/supabase";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isISODateKey(value: string): value is ISODate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pickISODateEntries(value: unknown, cutoffISO: ISODate) {
  if (!isRecord(value)) return {};
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isISODateKey(key) || key < cutoffISO) continue;
    next[key] = entry;
  }
  return next;
}

function hasFiniteNumber(value: unknown) {
  return Number.isFinite(Number(value));
}

const SHIFT_SET = new Set<Shift>(["D", "E", "N", "M", "OFF", "VAC"]);

function clamp(value: number, min: number, max: number) {
  const n = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function asIso(value: unknown): ISODate | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isISODateKey(trimmed)) return null;
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
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
    if (tags.length >= maxItems) break;
  }
  return tags;
}

function sanitizeEmotion(entry: unknown, fallbackMood: number | null = null): EmotionEntry | undefined {
  if (!isRecord(entry)) return undefined;
  const tagsRaw = Array.isArray(entry.tags) ? entry.tags : [];
  const tags = tagsRaw
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
  const noteRaw = typeof entry.note === "string" ? entry.note.trim() : "";
  const createdAtNum = asFiniteNumber(entry.createdAt);
  const moodNum = asFiniteNumber(entry.mood) ?? fallbackMood;
  if (moodNum == null && !tags.length && !noteRaw && createdAtNum == null) return undefined;
  const mood = clamp(Math.round(moodNum ?? 3), 1, 5) as EmotionEntry["mood"];
  const out: EmotionEntry = { mood };
  if (tags.length) out.tags = tags;
  if (noteRaw) out.note = noteRaw.slice(0, 500);
  if (createdAtNum != null) out.createdAt = Math.round(createdAtNum);
  return out;
}

function sanitizeBio(entry: unknown): BioInputs | undefined {
  if (!isRecord(entry)) return undefined;
  const out: BioInputs = {};
  let touched = false;

  if (hasOwn(entry, "sleepHours")) {
    touched = true;
    if (entry.sleepHours == null) out.sleepHours = null;
    else {
      const sleepHours = asFiniteNumber(entry.sleepHours);
      if (sleepHours != null) out.sleepHours = Math.round(clamp(sleepHours, 0, 16) * 2) / 2;
    }
  }

  if (hasOwn(entry, "napHours")) {
    touched = true;
    if (entry.napHours == null) out.napHours = null;
    else {
      const napHours = asFiniteNumber(entry.napHours);
      if (napHours != null) out.napHours = Math.round(clamp(napHours, 0, 4) * 2) / 2;
    }
  }

  if (hasOwn(entry, "sleepQuality")) {
    touched = true;
    if (entry.sleepQuality == null) out.sleepQuality = null;
    else {
      const sleepQuality = asFiniteNumber(entry.sleepQuality);
      if (sleepQuality != null) out.sleepQuality = clamp(Math.round(sleepQuality), 1, 5) as BioInputs["sleepQuality"];
    }
  }

  if (hasOwn(entry, "sleepTiming")) {
    touched = true;
    if (
      entry.sleepTiming == null ||
      entry.sleepTiming === "auto" ||
      entry.sleepTiming === "night" ||
      entry.sleepTiming === "day" ||
      entry.sleepTiming === "mixed"
    ) {
      out.sleepTiming = (entry.sleepTiming as BioInputs["sleepTiming"]) ?? null;
    }
  }

  if (hasOwn(entry, "stress")) {
    touched = true;
    if (entry.stress == null) out.stress = null;
    else {
      const stress = asFiniteNumber(entry.stress);
      if (stress != null) out.stress = clamp(Math.round(stress), 0, 3) as BioInputs["stress"];
    }
  }

  if (hasOwn(entry, "activity")) {
    touched = true;
    if (entry.activity == null) out.activity = null;
    else {
      const activity = asFiniteNumber(entry.activity);
      if (activity != null) out.activity = clamp(Math.round(activity), 0, 3) as BioInputs["activity"];
    }
  }

  if (hasOwn(entry, "caffeineMg")) {
    touched = true;
    if (entry.caffeineMg == null) out.caffeineMg = null;
    else {
      const caffeineMg = asFiniteNumber(entry.caffeineMg);
      if (caffeineMg != null) out.caffeineMg = clamp(Math.round(caffeineMg), 0, 1000);
    }
  }

  if (hasOwn(entry, "mood")) {
    touched = true;
    if (entry.mood == null) out.mood = null;
    else {
      const mood = asFiniteNumber(entry.mood);
      if (mood != null) out.mood = clamp(Math.round(mood), 1, 5) as BioInputs["mood"];
    }
  }

  if (hasOwn(entry, "symptomSeverity")) {
    touched = true;
    if (entry.symptomSeverity == null) out.symptomSeverity = null;
    else {
      const symptomSeverity = asFiniteNumber(entry.symptomSeverity);
      if (symptomSeverity != null) {
        out.symptomSeverity = clamp(Math.round(symptomSeverity), 0, 3) as BioInputs["symptomSeverity"];
      }
    }
  }

  if (hasOwn(entry, "workEventTags")) {
    touched = true;
    if (entry.workEventTags == null) out.workEventTags = null;
    else {
      const tags = sanitizeTagList(entry.workEventTags);
      out.workEventTags = tags.length ? tags : null;
    }
  }

  if (hasOwn(entry, "workEventNote")) {
    touched = true;
    if (entry.workEventNote == null) out.workEventNote = null;
    else if (typeof entry.workEventNote === "string") {
      const note = entry.workEventNote.replace(/\s+/g, " ").trim().slice(0, 280);
      out.workEventNote = !note || note === "-" ? null : note;
    }
  }

  return touched ? out : undefined;
}

function defaultSettings(): AppSettings {
  return {
    defaultSchedulePattern: "D2E2N2M2OFF2",
    schedulePatternAppliedFrom: null,
    emotionTagsPositive: [],
    emotionTagsNegative: [],
    menstrual: {
      enabled: false,
      lastPeriodStart: null,
      cycleLength: 28,
      periodLength: 5,
      lutealLength: 14,
      pmsDays: 4,
      sensitivity: 1,
    },
    profile: {
      chronotype: 0.5,
      caffeineSensitivity: 1.0,
    },
    language: "ko",
    hasSeenOnboarding: false,
  };
}

function sanitizeSettings(raw: unknown): AppSettings {
  const defaults = defaultSettings();
  const loaded = isRecord(raw) ? raw : {};
  const loadedMenstrual = isRecord(loaded.menstrual) ? loaded.menstrual : {};
  const loadedProfile = isRecord(loaded.profile) ? loaded.profile : {};

  const cycleLengthNum = asFiniteNumber(loadedMenstrual.cycleLength);
  const periodLengthNum = asFiniteNumber(loadedMenstrual.periodLength);
  const chronotypeNum = asFiniteNumber(loadedProfile.chronotype);
  const sensitivityNum = asFiniteNumber(loadedProfile.caffeineSensitivity);

  return {
    ...defaults,
    language: loaded.language === "en" ? "en" : "ko",
    hasSeenOnboarding: Boolean(loaded.hasSeenOnboarding ?? defaults.hasSeenOnboarding),
    menstrual: {
      ...defaults.menstrual,
      enabled: Boolean(loadedMenstrual.enabled ?? defaults.menstrual.enabled),
      lastPeriodStart: asIso(loadedMenstrual.lastPeriodStart ?? loadedMenstrual.startISO) ?? null,
      cycleLength:
        cycleLengthNum == null ? defaults.menstrual.cycleLength : clamp(Math.round(cycleLengthNum), 20, 45),
      periodLength:
        periodLengthNum == null ? defaults.menstrual.periodLength : clamp(Math.round(periodLengthNum), 2, 10),
    },
    profile: {
      chronotype: chronotypeNum == null ? defaults.profile?.chronotype ?? 0.5 : clamp(chronotypeNum, 0, 1),
      caffeineSensitivity:
        sensitivityNum == null ? defaults.profile?.caffeineSensitivity ?? 1 : clamp(sensitivityNum, 0.5, 1.5),
    },
  };
}

function hasRawHealthInput(bio: unknown, emotion: unknown) {
  const emotionNode = isRecord(emotion) ? emotion : null;
  if (emotionNode && hasFiniteNumber(emotionNode.mood)) return true;

  const bioNode = isRecord(bio) ? bio : null;
  if (!bioNode) return false;

  if (hasFiniteNumber(bioNode.sleepHours)) return true;
  if (hasFiniteNumber(bioNode.napHours)) return true;
  if (hasFiniteNumber(bioNode.stress)) return true;
  if (hasFiniteNumber(bioNode.activity)) return true;
  if (hasFiniteNumber(bioNode.mood)) return true;
  if (Number(bioNode.caffeineMg) > 0) return true;
  if (Number(bioNode.symptomSeverity) > 0) return true;
  return false;
}

export function countHealthRecordedDaysFromRawPayload(rawPayload: unknown) {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const bio = isRecord(payload.bio) ? payload.bio : {};
  const emotions = isRecord(payload.emotions) ? payload.emotions : {};
  const dates = new Set<string>();

  for (const iso of new Set([...Object.keys(bio), ...Object.keys(emotions)])) {
    if (!isISODateKey(iso)) continue;
    if (hasRawHealthInput(bio[iso], emotions[iso])) dates.add(iso);
  }

  return dates.size;
}

export function buildRecoveryStateWindowPayload(rawPayload: unknown, cutoffISO: ISODate) {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  return {
    settings: payload.settings,
    bio: pickISODateEntries(payload.bio, cutoffISO),
    emotions: pickISODateEntries(payload.emotions, cutoffISO),
    schedule: pickISODateEntries(payload.schedule, cutoffISO),
    notes: pickISODateEntries(payload.notes, cutoffISO),
    shiftNames: pickISODateEntries(payload.shiftNames, cutoffISO),
  };
}

export function normalizeRecoveryRouteState(raw: unknown, languageHint: Language | null): AppState {
  const loaded = isRecord(raw) ? raw : {};

  const scheduleRaw = isRecord(loaded.schedule) ? loaded.schedule : {};
  const schedule: AppState["schedule"] = {};
  for (const [isoRaw, shiftRaw] of Object.entries(scheduleRaw)) {
    const iso = asIso(isoRaw);
    const shift = asShift(shiftRaw);
    if (!iso || !shift) continue;
    schedule[iso] = shift;
  }

  const notesRaw = isRecord(loaded.notes) ? loaded.notes : {};
  const notes: AppState["notes"] = {};
  for (const [isoRaw, noteRaw] of Object.entries(notesRaw)) {
    const iso = asIso(isoRaw);
    if (!iso || typeof noteRaw !== "string") continue;
    const note = noteRaw.trim();
    if (!note) continue;
    notes[iso] = note.slice(0, 1000);
  }

  const shiftNamesRaw = isRecord(loaded.shiftNames) ? loaded.shiftNames : {};
  const shiftNames: AppState["shiftNames"] = {};
  for (const [isoRaw, nameRaw] of Object.entries(shiftNamesRaw)) {
    const iso = asIso(isoRaw);
    if (!iso || typeof nameRaw !== "string") continue;
    const name = nameRaw.trim();
    if (!name) continue;
    shiftNames[iso] = name.slice(0, 40);
  }

  const bioRaw = isRecord(loaded.bio) ? loaded.bio : {};
  const bio: AppState["bio"] = {};
  for (const [isoRaw, bioEntryRaw] of Object.entries(bioRaw)) {
    const iso = asIso(isoRaw);
    if (!iso) continue;
    const bioEntry = sanitizeBio(bioEntryRaw);
    if (!bioEntry) continue;
    bio[iso] = bioEntry;
  }

  const emotionsRaw = isRecord(loaded.emotions) ? loaded.emotions : {};
  const emotions: AppState["emotions"] = {};
  for (const [isoRaw, emotionRaw] of Object.entries(emotionsRaw)) {
    const iso = asIso(isoRaw);
    if (!iso) continue;
    const emotion = sanitizeEmotion(emotionRaw, bio[iso]?.mood ?? null);
    if (!emotion) continue;
    emotions[iso] = emotion;
  }

  const settings = sanitizeSettings(loaded.settings);
  if (languageHint) settings.language = languageHint;

  return {
    selected: asIso(loaded.selected) ?? undefined,
    schedule,
    shiftNames,
    notes,
    emotions,
    bio,
    memo: {
      folders: {},
      documents: {},
      recent: [],
      personalTemplates: [],
    } as AppState["memo"],
    records: {
      templates: {},
      entries: {},
      recent: [],
    } as AppState["records"],
    settings,
  };
}

export async function safeReadUserId(req: Request): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) return "";

    const { readUserIdFromRequest } = await import("@/lib/server/readUserId");
    return await readUserIdFromRequest(req);
  } catch {
    return "";
  }
}

export async function safeHasCompletedServiceConsent(userId: string): Promise<boolean> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return false;

    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore");
    return await userHasCompletedServiceConsent(userId);
  } catch {
    return false;
  }
}

export async function safeLoadUserState(userId: string): Promise<{ payload: unknown } | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;

    const { loadUserState } = await import("@/lib/server/userStateStore");
    return await loadUserState(userId);
  } catch {
    return null;
  }
}

export async function safeLoadAIContent(
  userId: string
): Promise<{ dateISO: ISODate; language: Language; data: Json } | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;

    const { loadAIContent } = await import("@/lib/server/aiContentStore");
    const row = await loadAIContent(userId);
    if (!row) return null;
    return {
      dateISO: row.dateISO,
      language: row.language,
      data: row.data,
    };
  } catch {
    return null;
  }
}

export async function safeLoadSubscription(userId: string): Promise<SubscriptionSnapshot | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;

    const { readSubscription } = await import("@/lib/server/billingStore");
    return await readSubscription(userId);
  } catch {
    return null;
  }
}

export async function safeSaveAIContent(
  userId: string,
  dateISO: ISODate,
  language: Language,
  data: Json
): Promise<string | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return "missing_supabase_env";

    const { saveAIContent } = await import("@/lib/server/aiContentStore");
    const existing = await safeLoadAIContent(userId);
    const previous = isRecord(existing?.data) ? existing.data : {};
    const incoming = isRecord(data) ? data : {};
    const merged = { ...previous, ...incoming };

    await saveAIContent({ userId, dateISO, language, data: merged as Json });
    return null;
  } catch {
    return "save_ai_content_failed";
  }
}
