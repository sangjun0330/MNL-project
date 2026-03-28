import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { ensureUserRow } from "@/lib/server/userRowStore";
import { summarizeAppState } from "@/lib/appStateIntegrity";

type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number | null;
};

export type UserStateSaveResult = {
  updatedAt: number | null;
  stateRevision: number | null;
  changed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ─── 날짜 기반 보존 기간 정책 ───────────────────────────────────────────────
// stateSanitizer.ts 와 동일한 기준을 서버 저장 직전에도 적용해
// DB가 절대 기준 기간을 초과하여 쌓이지 않도록 보장한다.
const PAYLOAD_SCHEDULE_RETENTION_DAYS = 180; // schedule / shiftNames
const PAYLOAD_HEALTH_RETENTION_DAYS = 90;    // bio / emotions / notes

function payloadISOCutoff(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function pruneDateEntries(map: Record<string, unknown>, cutoffISO: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key >= cutoffISO) out[key] = value;
  }
  return out;
}

function pruneAppStateDateMapsInPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const scheduleCutoff = payloadISOCutoff(PAYLOAD_SCHEDULE_RETENTION_DAYS);
  const healthCutoff   = payloadISOCutoff(PAYLOAD_HEALTH_RETENTION_DAYS);
  const pruned: Record<string, unknown> = { ...payload };

  for (const key of ["schedule", "shiftNames"] as const) {
    if (isRecord(pruned[key])) {
      pruned[key] = pruneDateEntries(pruned[key] as Record<string, unknown>, scheduleCutoff);
    }
  }
  for (const key of ["notes", "bio", "emotions"] as const) {
    if (isRecord(pruned[key])) {
      pruned[key] = pruneDateEntries(pruned[key] as Record<string, unknown>, healthCutoff);
    }
  }
  return pruned;
}

function countRecordKeys(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
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

const SERVER_MANAGED_PAYLOAD_KEYS = [
  "aiRecoveryDaily",
  "recoveryOrderCompletions",
  "shopWishlist",
  "shopCart",
  "shopShippingProfile",
  "shopShippingAddressBook",
  "shopOrders",
  "shopOrderBundles",
  "shopPurchaseConfirmations",
  "shopClaims",
  "notebookState",
] as const;

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

function preserveMissingPayloadDomains(nextPayload: Record<string, unknown>, existingPayload: Record<string, unknown>) {
  const keys = ["schedule", "shiftNames", "notes", "emotions", "bio", "settings"] as const;
  let merged: Record<string, unknown> | null = null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(nextPayload, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(existingPayload, key)) continue;
    if (!merged) merged = { ...nextPayload };
    merged[key] = existingPayload[key];
  }
  return merged ?? nextPayload;
}

function mergeScheduleSafely(nextPayload: Record<string, unknown>, existingPayload: Record<string, unknown>) {
  const existingSchedule = isRecord(existingPayload.schedule) ? existingPayload.schedule : null;
  if (!existingSchedule || Object.keys(existingSchedule).length === 0) return nextPayload;

  const nextSchedule = isRecord(nextPayload.schedule) ? nextPayload.schedule : null;
  if (!nextSchedule) {
    return {
      ...nextPayload,
      schedule: existingSchedule,
    };
  }

  const mergedSchedule = {
    ...existingSchedule,
    ...nextSchedule,
  };

  if (isJsonEqual(mergedSchedule, nextSchedule)) return nextPayload;

  return {
    ...nextPayload,
    schedule: mergedSchedule,
  };
}

type SuspiciousPayloadDrop = {
  key: "schedule" | "notes" | "emotions" | "bio" | "shiftNames";
  existingCount: number;
  nextCount: number;
};

function isSuspiciousProtectedDrop(existingCount: number, nextCount: number) {
  if (existingCount <= 0 || nextCount >= existingCount) return false;
  if (nextCount === 0) return true;
  return existingCount >= 6 && existingCount - nextCount >= 5 && nextCount <= Math.floor(existingCount * 0.35);
}

function mergeProtectedMaps(nextPayload: Record<string, unknown>, existingPayload: Record<string, unknown>) {
  const protectedKeys = ["schedule", "notes", "emotions", "bio", "shiftNames"] as const;
  const merged: Record<string, unknown> = { ...nextPayload };
  const suspiciousDrops: SuspiciousPayloadDrop[] = [];
  for (const key of protectedKeys) {
    const nextCount = countRecordKeys(nextPayload[key]);
    const existingCount = countRecordKeys(existingPayload[key]);
    // Prevent accidental wipe: keep existing non-empty maps when incoming map is empty.
    if (nextCount === 0 && existingCount > 0) {
      merged[key] = existingPayload[key];
      suspiciousDrops.push({ key, existingCount, nextCount });
      continue;
    }

    if (isSuspiciousProtectedDrop(existingCount, nextCount)) {
      merged[key] = {
        ...(isRecord(existingPayload[key]) ? existingPayload[key] : {}),
        ...(isRecord(nextPayload[key]) ? nextPayload[key] : {}),
      };
      suspiciousDrops.push({ key, existingCount, nextCount });
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
  return { merged, suspiciousDrops };
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

export { ensureUserRow };

export async function saveUserState(input: { userId: string; payload: any }): Promise<UserStateSaveResult> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const nowTs = new Date(now).getTime();
  let nextPayload = input.payload;
  let existingPayloadRaw: unknown = null;
  let existingPayload: Record<string, unknown> | null = null;
  let existingUpdatedAt: number | null = null;

  // Ensure parent row exists before writing child state row (FK-safe for first login).
  await ensureUserRow(input.userId);

  const { data: existing } = await admin
    .from("rnest_user_state")
    .select("payload, updated_at")
    .eq("user_id", input.userId)
    .maybeSingle();
  existingPayloadRaw = existing?.payload ?? null;
  existingUpdatedAt = toTimestamp(existing?.updated_at ?? null);
  if (isRecord(existing?.payload)) {
    existingPayload = existing.payload;
  }

  // Safety guard: never overwrite existing non-empty user maps with empty map payloads by accident,
  // even when the incoming payload still contains other meaningful domains like schedule.
  if (isRecord(nextPayload) && existingPayload && hasMeaningfulUserData(existingPayload)) {
    const protectedMerge = mergeProtectedMaps(nextPayload, existingPayload);
    nextPayload = protectedMerge.merged;
    if (protectedMerge.suspiciousDrops.length) {
      console.warn("[UserState] prevented_suspicious_payload_drop", {
        userId: input.userId.slice(0, 8),
        drops: protectedMerge.suspiciousDrops,
        before: summarizeAppState(existingPayload),
        incoming: summarizeAppState(input.payload),
        after: summarizeAppState(nextPayload),
      });
    }
  }

  // Partial payload writers can omit app-state domains entirely; keep the existing domains in that case.
  if (isRecord(nextPayload) && existingPayload) {
    nextPayload = preserveMissingPayloadDomains(nextPayload, existingPayload);
  }

  // Schedule currently supports overwrite/update flows but not true deletion.
  // If an incoming payload suddenly drops dates, preserve existing dates and only let the new payload
  // override values for dates it actually sent. This prevents degraded bootstrap/local fallback states
  // from wiping future schedule history.
  if (isRecord(nextPayload) && existingPayload) {
    nextPayload = mergeScheduleSafely(nextPayload, existingPayload);
  }

  // Keep menstrual cycle settings from being accidentally reset by a partial/default payload,
  // even when other domains (e.g. schedule) contain data.
  if (isRecord(nextPayload) && existingPayload) {
    nextPayload = preserveMenstrualSettingsIfNeeded(nextPayload, existingPayload);
  }

  // Preserve server-managed domains unless caller explicitly set/updated them.
  // This prevents app state sync payloads from wiping shop/account data that lives
  // in the same row but outside the AppState schema.
  if (isRecord(nextPayload) && existingPayload) {
    let mergedPayload: Record<string, unknown> | null = null;
    for (const key of SERVER_MANAGED_PAYLOAD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(nextPayload, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(existingPayload, key)) continue;
      if (!mergedPayload) mergedPayload = { ...nextPayload };
      mergedPayload[key] = existingPayload[key];
    }
    if (mergedPayload) {
      nextPayload = mergedPayload;
    }
  }

  // 날짜 기반 보존 기간 적용: 모든 merge 완료 후 최종적으로 오래된 날짜 항목을 정리.
  // merge 보호 로직이 복원한 항목도 기준 기간 초과분은 이 단계에서 제거된다.
  if (isRecord(nextPayload)) {
    nextPayload = pruneAppStateDateMapsInPayload(nextPayload);
  }

  // Skip no-op writes to avoid unnecessary updated_at churn and revision row growth.
  if (existingPayloadRaw !== null && isJsonEqual(existingPayloadRaw, nextPayload)) {
    return {
      updatedAt: existingUpdatedAt,
      stateRevision: existingUpdatedAt,
      changed: false,
    };
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

  return {
    updatedAt: nowTs,
    stateRevision: nowTs,
    changed: true,
  };
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
    updatedAt: toTimestamp(data.updated_at),
  };
}
