import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { SubscriptionSnapshot } from "@/lib/server/billingStore";
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
