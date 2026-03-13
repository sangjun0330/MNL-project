import {
  buildServiceConsentEventPayload,
  PRIVACY_POLICY_VERSION,
  SERVICE_CONSENT_VERSION,
  SERVICE_CONSENT_GATE_RELEASED_AT,
  TERMS_OF_SERVICE_VERSION,
  type UserServiceConsentSnapshot,
} from "@/lib/serviceConsent";
import { ensureUserRow, loadUserState } from "@/lib/server/userStateStore";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { defaultMemoState, defaultRecordState } from "@/lib/notebook";

type ConsentRow = {
  user_id: string;
  records_storage_consented_at: string | null;
  ai_usage_consented_at: string | null;
  consent_completed_at: string | null;
  consent_version: string;
  privacy_version: string;
  terms_version: string;
};

type UserCreatedRow = {
  created_at: string | null;
  onboarding_completed_at: string | null;
};

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
      "user_id, records_storage_consented_at, ai_usage_consented_at, consent_completed_at, consent_version, privacy_version, terms_version"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const code = String((error as any)?.code ?? "");
    const msg = String((error as any)?.message ?? "").toLowerCase();
    // 테이블이 존재하지 않거나 스키마 캐시 문제인 경우 null 반환 (throw 안 함)
    if (
      code === "42P01" ||
      code === "PGRST204" ||
      code === "PGRST205" ||
      msg.includes("does not exist") ||
      msg.includes("schema cache")
    ) {
      console.error("[ServiceConsent] user_service_consents table issue, returning null", { code, msg: msg.slice(0, 120) });
      return null;
    }
    throw error;
  }

  return mapConsentRow((data as ConsentRow | null) ?? null);
}

function buildSyntheticLegacyConsent(): UserServiceConsentSnapshot {
  const now = new Date().toISOString();
  return {
    recordsStorageConsentedAt: now,
    aiUsageConsentedAt: now,
    consentCompletedAt: now,
    consentVersion: SERVICE_CONSENT_VERSION,
    privacyVersion: PRIVACY_POLICY_VERSION,
    termsVersion: TERMS_OF_SERVICE_VERSION,
  };
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
    // 테이블이 없거나 DB 오류 시에도 레거시 사용자는 동의 완료 처리
    console.error("[ServiceConsent] backfill failed, using synthetic consent", {
      code: (error as any)?.code,
      message: String((error as any)?.message ?? "").slice(0, 120),
    });
    return buildSyntheticLegacyConsent();
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
    // DB 오류 시 기존 사용자 데이터 접근을 차단하지 않도록 true 반환
    // (consent 테이블 미생성/스키마 불일치 등)
    console.error("[ServiceConsent] userHasCompletedServiceConsent failed, allowing access", {
      userId: userId.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export async function markUserOnboardingCompleted(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  await ensureUserRow(userId);

  const { error } = await admin
    .from("rnest_users")
    .update({
      onboarding_completed_at: now,
      last_seen: now,
    })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function completeUserServiceConsent(userId: string): Promise<UserServiceConsentSnapshot> {
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
    throw error;
  }

  const { error: eventError } = await admin.from("user_service_consent_events").insert({
    user_id: userId,
    event_type: "granted",
    payload: buildServiceConsentEventPayload(),
  });

  if (eventError) {
    throw eventError;
  }

  return mapConsentRow(data as ConsentRow)!;
}

export async function loadUserBootstrap(userId: string): Promise<{
  onboardingCompleted: boolean;
  consentCompleted: boolean;
  hasStoredState: boolean;
  consent: UserServiceConsentSnapshot | null;
  state: unknown | null;
  updatedAt: number | null;
}> {
  const admin = getSupabaseAdmin();

  await ensureUserRow(userId);

  const [{ data: rawUserRow, error: userError }, initialConsent, stateRow] = await Promise.all([
    admin
      .from("rnest_users")
      .select("created_at, onboarding_completed_at")
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
    updatedAt: consentCompleted ? (stateRow?.updatedAt ?? null) : null,
  };
}
