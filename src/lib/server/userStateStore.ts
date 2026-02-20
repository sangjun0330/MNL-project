import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function countRecordKeys(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readMenstrualSettings(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  const settings = payload.settings;
  if (!isRecord(settings)) return null;
  const menstrual = settings.menstrual;
  if (!isRecord(menstrual)) return null;
  return menstrual;
}

function hasMeaningfulMenstrualSettings(payload: unknown): boolean {
  const menstrual = readMenstrualSettings(payload);
  if (!menstrual) return false;

  const enabled = Boolean(menstrual.enabled);
  const lastPeriodStart =
    typeof menstrual.lastPeriodStart === "string" && menstrual.lastPeriodStart.trim().length
      ? menstrual.lastPeriodStart.trim()
      : null;

  const cycleLength = toFiniteNumber(menstrual.cycleLength);
  const periodLength = toFiniteNumber(menstrual.periodLength);
  const lutealLength = toFiniteNumber(menstrual.lutealLength);
  const pmsDays = toFiniteNumber(menstrual.pmsDays);
  const sensitivity = toFiniteNumber(menstrual.sensitivity);

  return (
    enabled ||
    Boolean(lastPeriodStart) ||
    (cycleLength != null && Math.round(cycleLength) !== 28) ||
    (periodLength != null && Math.round(periodLength) !== 5) ||
    (lutealLength != null && Math.round(lutealLength) !== 14) ||
    (pmsDays != null && Math.round(pmsDays) !== 4) ||
    (sensitivity != null && Number(sensitivity.toFixed(2)) !== 1)
  );
}

function normalizeJsonForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonForCompare(item));
  }
  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJsonForCompare(value[key]);
    }
    return normalized;
  }
  return value;
}

function isJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeJsonForCompare(a)) === JSON.stringify(normalizeJsonForCompare(b));
}

function hasMeaningfulUserData(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    countRecordKeys(value.schedule) > 0 ||
    countRecordKeys(value.notes) > 0 ||
    countRecordKeys(value.emotions) > 0 ||
    countRecordKeys(value.bio) > 0 ||
    countRecordKeys(value.shiftNames) > 0 ||
    hasMeaningfulMenstrualSettings(value)
  );
}

function mergeProtectedMaps(nextPayload: Record<string, unknown>, existingPayload: Record<string, unknown>) {
  const protectedKeys = ["schedule", "notes", "emotions", "bio", "shiftNames"] as const;
  const merged: Record<string, unknown> = { ...nextPayload };
  for (const key of protectedKeys) {
    const nextCount = countRecordKeys(nextPayload[key]);
    const existingCount = countRecordKeys(existingPayload[key]);
    // Prevent accidental wipe: keep existing non-empty maps when incoming map is empty.
    if (nextCount === 0 && existingCount > 0) {
      merged[key] = existingPayload[key];
    }
  }

  // Prevent accidental wipe of menstrual cycle configuration during deploy/rehydration paths.
  if (hasMeaningfulMenstrualSettings(existingPayload) && !hasMeaningfulMenstrualSettings(nextPayload)) {
    const nextSettings = isRecord(nextPayload.settings) ? nextPayload.settings : {};
    const existingSettings = isRecord(existingPayload.settings) ? existingPayload.settings : {};
    const existingMenstrual = isRecord(existingSettings.menstrual) ? existingSettings.menstrual : null;
    if (existingMenstrual) {
      merged.settings = {
        ...nextSettings,
        menstrual: existingMenstrual,
      };
    }
  }

  return merged;
}

function preserveMenstrualSettingsIfNeeded(
  nextPayload: Record<string, unknown>,
  existingPayload: Record<string, unknown>
) {
  if (!hasMeaningfulMenstrualSettings(existingPayload)) return nextPayload;
  if (hasMeaningfulMenstrualSettings(nextPayload)) return nextPayload;

  const nextSettings = isRecord(nextPayload.settings) ? nextPayload.settings : {};
  const existingSettings = isRecord(existingPayload.settings) ? existingPayload.settings : {};
  const existingMenstrual = isRecord(existingSettings.menstrual) ? existingSettings.menstrual : null;
  if (!existingMenstrual) return nextPayload;

  return {
    ...nextPayload,
    settings: {
      ...nextSettings,
      menstrual: existingMenstrual,
    },
  };
}

export async function ensureUserRow(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("rnest_users")
    .upsert(
      {
        user_id: userId,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}

export async function saveUserState(input: { userId: string; payload: any }): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  let nextPayload = input.payload;
  let existingPayloadRaw: unknown = null;
  let existingPayload: Record<string, unknown> | null = null;

  // Ensure parent row exists before writing child state row (FK-safe for first login).
  await ensureUserRow(input.userId);

  const { data: existing } = await admin
    .from("rnest_user_state")
    .select("payload")
    .eq("user_id", input.userId)
    .maybeSingle();
  existingPayloadRaw = existing?.payload ?? null;
  if (isRecord(existing?.payload)) {
    existingPayload = existing.payload;
  }

  // Safety guard: never overwrite existing non-empty user maps with an empty payload by accident.
  if (
    isRecord(nextPayload) &&
    existingPayload &&
    hasMeaningfulUserData(existingPayload) &&
    !hasMeaningfulUserData(nextPayload)
  ) {
    nextPayload = mergeProtectedMaps(nextPayload, existingPayload);
  }

  // Keep menstrual cycle settings from being accidentally reset by a partial/default payload,
  // even when other domains (e.g. schedule) contain data.
  if (isRecord(nextPayload) && existingPayload) {
    nextPayload = preserveMenstrualSettingsIfNeeded(nextPayload, existingPayload);
  }

  // Preserve server-managed daily AI cache unless caller explicitly set/updated it.
  if (isRecord(nextPayload) && !Object.prototype.hasOwnProperty.call(nextPayload, "aiRecoveryDaily")) {
    if (existingPayload && Object.prototype.hasOwnProperty.call(existingPayload, "aiRecoveryDaily")) {
      nextPayload = {
        ...nextPayload,
        aiRecoveryDaily: existingPayload.aiRecoveryDaily,
      };
    }
  }

  // Skip no-op writes to avoid unnecessary updated_at churn and revision row growth.
  if (existingPayloadRaw !== null && isJsonEqual(existingPayloadRaw, nextPayload)) {
    return;
  }

  const { error } = await admin
    .from("rnest_user_state")
    .upsert(
      {
        user_id: input.userId,
        payload: nextPayload,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}

export async function loadUserState(userId: string): Promise<UserStateRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("rnest_user_state")
    .select("user_id, payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    userId: data.user_id,
    payload: data.payload,
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
  };
}
