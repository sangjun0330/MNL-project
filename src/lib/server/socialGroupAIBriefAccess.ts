type PlanTier = "free" | "plus" | "pro";
type SubscriptionStatus = "inactive" | "active" | "expired";

export type SocialGroupAIBriefSubscriptionSnapshot = {
  tier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  hasPaidAccess: boolean;
  hasBriefAccess: boolean;
  hasProBriefAccess: boolean;
};

function asPlanTier(value: unknown): PlanTier {
  if (value === "plus") return "plus";
  if (value === "pro") return "pro";
  return "free";
}

function asSubscriptionStatus(value: unknown): SubscriptionStatus {
  if (value === "active" || value === "expired") return value;
  return "inactive";
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function hasPaidAccess(args: {
  tier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}) {
  if (args.tier === "free") return false;
  if (args.status !== "active") return false;
  const end = parseDate(args.currentPeriodEnd);
  if (!end) return true;
  return end.getTime() > Date.now();
}

function isSchemaUnavailableError(error: unknown) {
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

function isLegacyConsentEligible(createdAt: string | null | undefined, hasStoredState: boolean) {
  if (hasStoredState) return true;
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  const releasedMs = new Date("2026-03-12T00:00:00+09:00").getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(releasedMs)) return false;
  return createdMs < releasedMs;
}

export async function readSocialGroupAIBriefSubscription(
  admin: any,
  userId: string,
  options?: { strict?: boolean }
): Promise<SocialGroupAIBriefSubscriptionSnapshot | null> {
  const { data, error } = await (admin as any)
    .from("rnest_users")
    .select("subscription_tier, subscription_status, subscription_current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (options?.strict) throw error;
    return null;
  }

  const tier = asPlanTier(data?.subscription_tier);
  const status = asSubscriptionStatus(data?.subscription_status);
  const currentPeriodEnd = typeof data?.subscription_current_period_end === "string" ? data.subscription_current_period_end : null;
  const paid = hasPaidAccess({ tier, status, currentPeriodEnd });

  return {
    tier,
    status,
    currentPeriodEnd,
    hasPaidAccess: paid,
    hasBriefAccess: paid && tier !== "free",
    hasProBriefAccess: paid && tier === "pro",
  };
}

export async function readSocialGroupAIBriefConsentMap(admin: any, userIds: string[]) {
  const result = new Map<string, boolean>();
  const ids = Array.from(new Set(userIds.map((value) => String(value)).filter(Boolean)));
  if (ids.length === 0) return result;

  const [consentRes, userRowsRes, stateRowsRes] = await Promise.all([
    (admin as any)
      .from("user_service_consents")
      .select("user_id, consent_completed_at")
      .in("user_id", ids),
    (admin as any)
      .from("rnest_users")
      .select("user_id, created_at")
      .in("user_id", ids),
    (admin as any)
      .from("rnest_user_state")
      .select("user_id")
      .in("user_id", ids),
  ]);

  if (consentRes.error && isSchemaUnavailableError(consentRes.error)) {
    for (const userId of ids) result.set(userId, true);
    return result;
  }
  if (consentRes.error) throw consentRes.error;
  if (userRowsRes.error) throw userRowsRes.error;
  if (stateRowsRes.error) throw stateRowsRes.error;

  const consentMap = new Map<string, string | null>();
  for (const row of consentRes.data ?? []) {
    consentMap.set(String(row.user_id), typeof row.consent_completed_at === "string" ? row.consent_completed_at : null);
  }

  const createdAtMap = new Map<string, string | null>();
  for (const row of userRowsRes.data ?? []) {
    createdAtMap.set(String(row.user_id), typeof row.created_at === "string" ? row.created_at : null);
  }

  const stateSet = new Set<string>((stateRowsRes.data ?? []).map((row: any) => String(row.user_id)));

  for (const userId of ids) {
    const consentCompletedAt = consentMap.get(userId) ?? null;
    if (consentCompletedAt) {
      result.set(userId, true);
      continue;
    }
    result.set(userId, isLegacyConsentEligible(createdAtMap.get(userId) ?? null, stateSet.has(userId)));
  }

  return result;
}

export async function userHasSocialGroupAIBriefConsent(admin: any, userId: string) {
  const map = await readSocialGroupAIBriefConsentMap(admin, [userId]);
  return map.get(userId) === true;
}
