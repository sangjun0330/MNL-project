import {
  buildServiceConsentEventPayload,
  PRIVACY_POLICY_VERSION,
  SERVICE_CONSENT_VERSION,
  SERVICE_CONSENT_GATE_RELEASED_AT,
  TERMS_OF_SERVICE_VERSION,
  type UserServiceConsentSnapshot,
} from "@/lib/serviceConsent";
import { ensureUserRow, loadUserState } from "@/lib/server/userStateStore";
import { loadAIRecoverySummary } from "@/lib/server/aiRecoveryStateStore";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { defaultMemoState, defaultRecordState } from "@/lib/notebook";
import type { RecoverySummary } from "@/lib/accountBootstrap";

type ConsentRow = {
  user_id: string;
  records_storage_consented_at: string | null;
  ai_usage_consented_at: string | null;
  consent_completed_at: string | null;
  consent_version: string;
  privacy_version: string;
  terms_version: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type UserCreatedRow = {
  created_at: string | null;
  onboarding_completed_at: string | null;
  updated_at?: string | null;
};

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function maxTimestamp(values: Array<number | null | undefined>) {
  let max: number | null = null;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    max = max == null ? value : Math.max(max, value);
  }
  return max;
}

function isServiceConsentSchemaUnavailableError(error: unknown) {
  const code = String((error as any)?.code ?? "").toUpperCase();
  const message = String((error as any)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the column")
  );
}

function mapConsentRow(row: ConsentRow | null): UserServiceConsentSnapshot | null {
  if (!row) return null;
  return {
    recordsStorageConsentedAt: row.records_storage_consented_at,
    aiUsageConsentedAt: row.ai_usage_consented_at,
    consentCompletedAt: row.consent_completed_at,
    consentVersion: row.consent_version,
    privacyVersion: row.privacy_version,
    termsVersion: row.terms_version,
  };
}

function buildGrantedConsentSnapshot(consentedAt: string): UserServiceConsentSnapshot {
  return {
    recordsStorageConsentedAt: consentedAt,
    aiUsageConsentedAt: consentedAt,
    consentCompletedAt: consentedAt,
    consentVersion: SERVICE_CONSENT_VERSION,
    privacyVersion: PRIVACY_POLICY_VERSION,
    termsVersion: TERMS_OF_SERVICE_VERSION,
  };
}

function wasExistingUserBeforeConsentGate(createdAt: string | null | undefined) {
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const releasedMs = new Date(SERVICE_CONSENT_GATE_RELEASED_AT).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(releasedMs)) return false;
  return createdMs < releasedMs;
}

function isLegacyConsentEligible(input: { createdAt: string | null | undefined; hasStoredState: boolean }) {
  return input.hasStoredState || wasExistingUserBeforeConsentGate(input.createdAt);
}

export function hasCompletedServiceConsent(consent: UserServiceConsentSnapshot | null | undefined) {
  return Boolean(consent?.consentCompletedAt);
}

export async function loadUserServiceConsent(userId: string): Promise<UserServiceConsentSnapshot | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("user_service_consents")
    .select(
      "user_id, records_storage_consented_at, ai_usage_consented_at, consent_completed_at, consent_version, privacy_version, terms_version, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isServiceConsentSchemaUnavailableError(error)) {
      console.error("[ServiceConsent] user_service_consents schema unavailable, returning empty consent", {
        code: (error as any)?.code,
        message: String((error as any)?.message ?? "").slice(0, 120),
      });
      return null;
    }
    throw error;
  }

  return mapConsentRow((data as ConsentRow | null) ?? null);
}

async function backfillLegacyServiceConsent(userId: string): Promise<UserServiceConsentSnapshot> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  await ensureUserRow(userId);

  const row = {
    user_id: userId,
    records_storage_consented_at: now,
    ai_usage_consented_at: now,
    consent_completed_at: now,
    consent_version: SERVICE_CONSENT_VERSION,
    privacy_version: PRIVACY_POLICY_VERSION,
    terms_version: TERMS_OF_SERVICE_VERSION,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("user_service_consents")
    .upsert(row, { onConflict: "user_id" })
    .select(
      "user_id, records_storage_consented_at, ai_usage_consented_at, consent_completed_at, consent_version, privacy_version, terms_version"
    )
    .single();

  if (error) {
    console.error("[ServiceConsent] backfill failed", {
      code: (error as any)?.code,
      message: String((error as any)?.message ?? "").slice(0, 120),
    });
    throw error;
  }

  const { error: eventError } = await admin.from("user_service_consent_events").insert({
    user_id: userId,
    event_type: "legacy_backfill",
    payload: {
      ...buildServiceConsentEventPayload(),
      source: "legacy_backfill",
    },
  });

  if (eventError) {
    console.error("failed_to_log_legacy_service_consent_backfill", eventError);
  }

  return mapConsentRow(data as ConsentRow)!;
}

async function ensureEffectiveServiceConsent(
  userId: string,
  input?: {
    consent?: UserServiceConsentSnapshot | null;
    userRow?: UserCreatedRow | null;
    hasStoredState?: boolean;
  }
): Promise<UserServiceConsentSnapshot | null> {
  const existingConsent = input?.consent ?? (await loadUserServiceConsent(userId));
  if (hasCompletedServiceConsent(existingConsent)) return existingConsent;

  let userRow = input?.userRow ?? null;
  let hasStoredState = Boolean(input?.hasStoredState);

  if (!userRow || input?.hasStoredState === undefined) {
    const admin = getSupabaseAdmin();
    await ensureUserRow(userId);
    const [{ data: loadedUserRow, error: userError }, stateRow] = await Promise.all([
      admin
        .from("rnest_users")
        .select("created_at, onboarding_completed_at")
        .eq("user_id", userId)
        .maybeSingle(),
      loadUserState(userId),
    ]);

    if (userError) {
      throw userError;
    }

    userRow = (loadedUserRow as UserCreatedRow | null) ?? null;
    hasStoredState = Boolean(stateRow?.payload);
  }

  if (!isLegacyConsentEligible({ createdAt: userRow?.created_at ?? null, hasStoredState })) {
    return existingConsent;
  }

  return backfillLegacyServiceConsent(userId);
}

export async function userHasCompletedServiceConsent(userId: string): Promise<boolean> {
  try {
    const consent = await ensureEffectiveServiceConsent(userId);
    return hasCompletedServiceConsent(consent);
  } catch (error) {
    console.error("[ServiceConsent] userHasCompletedServiceConsent failed, denying access", {
      userId: userId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function markUserOnboardingCompleted(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    await ensureUserRow(userId);
  } catch (ensureErr) {
    // Best-effort: don't block onboarding completion on a transient DB error.
    // The user row will be created on the next successful API call.
    console.error("[ServiceConsent] ensureUserRow failed in markUserOnboardingCompleted, skipping update", {
      userId: userId.slice(0, 8),
      code: (ensureErr as any)?.code,
      message: String((ensureErr as any)?.message ?? ensureErr).slice(0, 200),
    });
    return;
  }

  const { error } = await admin
    .from("rnest_users")
    .update({
      onboarding_completed_at: now,
      last_seen: now,
    })
    .eq("user_id", userId);

  if (error) {
    if (isServiceConsentSchemaUnavailableError(error)) {
      console.error("[ServiceConsent] onboarding_completed_at schema unavailable, skipping onboarding write", {
        userId: userId.slice(0, 8),
        code: (error as any)?.code,
        message: String((error as any)?.message ?? "").slice(0, 160),
      });
      return;
    }
    // Non-schema error: log but don't throw — onboarding update is best-effort.
    console.error("[ServiceConsent] markUserOnboardingCompleted update failed, continuing", {
      userId: userId.slice(0, 8),
      code: (error as any)?.code,
      message: String((error as any)?.message ?? "").slice(0, 200),
    });
  }
}

export async function completeUserServiceConsent(userId: string): Promise<UserServiceConsentSnapshot> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    await ensureUserRow(userId);
  } catch (ensureErr) {
    // Log but don't immediately throw. Attempt the upsert anyway:
    // - If the row was actually created despite the error (transient glitch), it will succeed.
    // - If the row is truly missing, the FK constraint will fail with code 23503,
    //   which is caught and logged below.
    console.error("[ServiceConsent] ensureUserRow failed in completeUserServiceConsent", {
      userId: userId.slice(0, 8),
      code: (ensureErr as any)?.code,
      message: String((ensureErr as any)?.message ?? ensureErr).slice(0, 200),
    });
  }

  const row = {
    user_id: userId,
    records_storage_consented_at: now,
    ai_usage_consented_at: now,
    consent_completed_at: now,
    consent_version: SERVICE_CONSENT_VERSION,
    privacy_version: PRIVACY_POLICY_VERSION,
    terms_version: TERMS_OF_SERVICE_VERSION,
    updated_at: now,
  };

  // Step 1: upsert without chaining .select().single() to avoid PGRST116 edge cases
  // on some PostgREST / Edge Runtime combinations.
  const { error: upsertError } = await admin
    .from("user_service_consents")
    .upsert(row, { onConflict: "user_id" });

  if (upsertError) {
    const errCode = String((upsertError as any)?.code ?? "");
    console.error("[ServiceConsent] user_service_consents upsert failed", {
      userId: userId.slice(0, 8),
      code: errCode,
      message: String((upsertError as any)?.message ?? "").slice(0, 200),
    });
    throw upsertError;
  }

  // Step 2: read back the saved row via a separate SELECT
  const { data, error: selectError } = await admin
    .from("user_service_consents")
    .select(
      "user_id, records_storage_consented_at, ai_usage_consented_at, consent_completed_at, consent_version, privacy_version, terms_version"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError || !data) {
    console.error("[ServiceConsent] consent read-back after upsert failed", {
      userId: userId.slice(0, 8),
      code: (selectError as any)?.code,
      message: String((selectError as any)?.message ?? "").slice(0, 200),
    });
    void admin.from("user_service_consent_events").insert({
      user_id: userId,
      event_type: "granted",
      payload: buildServiceConsentEventPayload(),
    });
    return buildGrantedConsentSnapshot(now);
  }

  // Step 3: log the consent event (non-critical)
  const { error: eventError } = await admin.from("user_service_consent_events").insert({
    user_id: userId,
    event_type: "granted",
    payload: buildServiceConsentEventPayload(),
  });

  if (eventError) {
    // 이벤트 로그 실패는 동의 저장 자체를 실패시키지 않음
    console.error("[ServiceConsent] failed_to_log_consent_event", {
      code: (eventError as any)?.code,
      message: String((eventError as any)?.message ?? "").slice(0, 120),
    });
  }

  return mapConsentRow(data as ConsentRow)!;
}

export async function loadUserBootstrap(userId: string): Promise<{
  onboardingCompleted: boolean;
  consentCompleted: boolean;
  hasStoredState: boolean;
  consent: UserServiceConsentSnapshot | null;
  state: unknown | null;
  stateRevision: number | null;
  bootstrapRevision: number | null;
  updatedAt: number | null;
  recoverySummary: RecoverySummary | null;
}> {
  const admin = getSupabaseAdmin();

  await ensureUserRow(userId);

  const [{ data: rawUserRow, error: userError }, initialConsent, stateRow] = await Promise.all([
    admin
      .from("rnest_users")
      .select("created_at, onboarding_completed_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    loadUserServiceConsent(userId),
    loadUserState(userId),
  ]);

  if (userError) {
    throw userError;
  }

  const userRow = (rawUserRow as UserCreatedRow | null) ?? null;
  const hasStoredState = Boolean(stateRow?.payload);
  const consent = await ensureEffectiveServiceConsent(userId, {
    consent: initialConsent,
    userRow,
    hasStoredState,
  });
  const consentCompleted = hasCompletedServiceConsent(consent);
  const userRevision = maxTimestamp([toTimestamp(userRow?.updated_at ?? null), toTimestamp(userRow?.created_at ?? null)]);
  const stateRevision = stateRow?.updatedAt ?? null;
  let consentRevisionRow: Pick<ConsentRow, "updated_at" | "created_at"> | null = null;
  if (consentCompleted) {
    try {
      const { data, error } = await admin
        .from("user_service_consents")
        .select("updated_at, created_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (!error) {
        consentRevisionRow = (data as Pick<ConsentRow, "updated_at" | "created_at"> | null) ?? null;
      }
    } catch {
      consentRevisionRow = null;
    }
  }
  const consentRevision = maxTimestamp([
    toTimestamp(consentRevisionRow?.updated_at ?? null),
    toTimestamp(consentRevisionRow?.created_at ?? null),
  ]);
  const bootstrapRevision = maxTimestamp([userRevision, consentRevision, stateRevision]);
  const recoverySummary = consentCompleted ? await loadAIRecoverySummary(userId) : null;

  return {
    onboardingCompleted:
      Boolean(userRow?.onboarding_completed_at) ||
      hasStoredState ||
      wasExistingUserBeforeConsentGate(userRow?.created_at ?? null),
    consentCompleted,
    hasStoredState,
    consent,
    state:
      consentCompleted && stateRow?.payload
        ? {
            ...sanitizeStatePayload(stateRow.payload),
            memo: defaultMemoState(),
            records: defaultRecordState(),
          }
        : null,
    stateRevision,
    bootstrapRevision,
    updatedAt: stateRevision,
    recoverySummary,
  };
}
