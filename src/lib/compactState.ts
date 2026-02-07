import type { AppSettings, AppState, BioInputs, EmotionEntry } from "@/lib/model";
import { defaultSettings } from "@/lib/model";

function compactEmotion(entry?: EmotionEntry) {
  if (!entry) return undefined;
  const mood = entry.mood;
  const tags = Array.isArray(entry.tags) && entry.tags.length ? entry.tags : undefined;
  const note = typeof entry.note === "string" && entry.note.trim().length ? entry.note.trim() : undefined;
  if (mood == null && !tags && !note) return undefined;
  const next: EmotionEntry = { mood } as EmotionEntry;
  if (tags) next.tags = tags;
  if (note) next.note = note;
  return next;
}

function compactBio(bio?: BioInputs) {
  if (!bio) return undefined;
  const next: BioInputs = {};
  if (bio.sleepHours != null) next.sleepHours = bio.sleepHours;
  if (bio.napHours != null) next.napHours = bio.napHours;
  if (bio.sleepQuality != null) next.sleepQuality = bio.sleepQuality;
  if (bio.sleepTiming && bio.sleepTiming !== "auto") next.sleepTiming = bio.sleepTiming;
  if (bio.stress != null) next.stress = bio.stress;
  if (bio.activity != null) next.activity = bio.activity;
  if (bio.caffeineMg != null) next.caffeineMg = bio.caffeineMg;
  if (bio.caffeineLastAt) next.caffeineLastAt = bio.caffeineLastAt;
  if (bio.fatigueLevel != null) next.fatigueLevel = bio.fatigueLevel;
  if (bio.symptomSeverity != null) next.symptomSeverity = bio.symptomSeverity;
  if (bio.menstrualStatus && bio.menstrualStatus !== "none") next.menstrualStatus = bio.menstrualStatus;
  if (bio.menstrualFlow != null) next.menstrualFlow = bio.menstrualFlow;
  if (bio.shiftOvertimeHours != null) next.shiftOvertimeHours = bio.shiftOvertimeHours;

  return Object.keys(next).length ? next : undefined;
}

function compactSettings(settings: AppSettings) {
  const defaults = defaultSettings();
  const next: Partial<AppSettings> = {};

  if (settings.defaultSchedulePattern && settings.defaultSchedulePattern !== defaults.defaultSchedulePattern) {
    next.defaultSchedulePattern = settings.defaultSchedulePattern;
  }
  if (settings.schedulePatternAppliedFrom) {
    next.schedulePatternAppliedFrom = settings.schedulePatternAppliedFrom;
  }
  if (settings.emotionTagsPositive && settings.emotionTagsPositive.length) {
    next.emotionTagsPositive = settings.emotionTagsPositive;
  }
  if (settings.emotionTagsNegative && settings.emotionTagsNegative.length) {
    next.emotionTagsNegative = settings.emotionTagsNegative;
  }

  const menstrual = settings.menstrual ?? defaults.menstrual;
  const m: any = {};
  if (menstrual.enabled !== defaults.menstrual.enabled) m.enabled = menstrual.enabled;
  if (menstrual.lastPeriodStart) m.lastPeriodStart = menstrual.lastPeriodStart;
  if (menstrual.cycleLength !== defaults.menstrual.cycleLength) m.cycleLength = menstrual.cycleLength;
  if (menstrual.periodLength !== defaults.menstrual.periodLength) m.periodLength = menstrual.periodLength;
  if (menstrual.lutealLength != null && menstrual.lutealLength !== defaults.menstrual.lutealLength) {
    m.lutealLength = menstrual.lutealLength;
  }
  if (menstrual.pmsDays != null && menstrual.pmsDays !== defaults.menstrual.pmsDays) {
    m.pmsDays = menstrual.pmsDays;
  }
  if (menstrual.sensitivity != null && menstrual.sensitivity !== defaults.menstrual.sensitivity) {
    m.sensitivity = menstrual.sensitivity;
  }
  if (Object.keys(m).length) next.menstrual = m;

  const profile = settings.profile ?? defaults.profile;
  if (profile) {
    const p: any = {};
    if (profile.chronotype !== defaults.profile?.chronotype) p.chronotype = profile.chronotype;
    if (profile.caffeineSensitivity !== defaults.profile?.caffeineSensitivity) {
      p.caffeineSensitivity = profile.caffeineSensitivity;
    }
    if (Object.keys(p).length) next.profile = p;
  }

  return Object.keys(next).length ? next : undefined;
}

export function compactStateForStorage(state: AppState): Partial<AppState> {
  const compact: Partial<AppState> = {};

  const schedule: Record<string, any> = {};
  for (const [iso, shift] of Object.entries(state.schedule ?? {})) {
    if (!shift || shift === "OFF") continue;
    schedule[iso] = shift;
  }
  if (Object.keys(schedule).length) compact.schedule = schedule as any;

  const shiftNames: Record<string, any> = {};
  for (const [iso, name] of Object.entries(state.shiftNames ?? {})) {
    const v = typeof name === "string" ? name.trim() : "";
    if (!v) continue;
    shiftNames[iso] = v;
  }
  if (Object.keys(shiftNames).length) compact.shiftNames = shiftNames as any;

  const notes: Record<string, any> = {};
  for (const [iso, note] of Object.entries(state.notes ?? {})) {
    const v = typeof note === "string" ? note.trim() : "";
    if (!v) continue;
    notes[iso] = v;
  }
  if (Object.keys(notes).length) compact.notes = notes as any;

  const emotions: Record<string, any> = {};
  for (const [iso, emo] of Object.entries(state.emotions ?? {})) {
    const v = compactEmotion(emo as EmotionEntry | undefined);
    if (!v) continue;
    emotions[iso] = v;
  }
  if (Object.keys(emotions).length) compact.emotions = emotions as any;

  const bio: Record<string, any> = {};
  for (const [iso, entry] of Object.entries(state.bio ?? {})) {
    const v = compactBio(entry as BioInputs | undefined);
    if (!v) continue;
    bio[iso] = v;
  }
  if (Object.keys(bio).length) compact.bio = bio as any;

  if (state.settings) {
    const settings = compactSettings(state.settings);
    if (settings) compact.settings = settings as any;
  }

  return compact;
}
