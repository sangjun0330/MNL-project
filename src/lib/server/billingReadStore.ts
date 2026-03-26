import {
  PAID_PLAN_TIERS,
  getDefaultSearchTypeForTier,
  getPlanDefinition,
  type BillingOrderKind,
  type CheckoutProductId,
  type PlanTier,
  type SearchCreditType,
} from "@/lib/billing/plans";
import { buildBillingEntitlements, type BillingEntitlements } from "@/lib/billing/entitlements";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { ensureUserRow } from "@/lib/server/userRowStore";

export type BillingOrderStatus = "READY" | "DONE" | "FAILED" | "CANCELED";

export type SubscriptionStatus = "inactive" | "active" | "expired";

export type SubscriptionSnapshot = {
  tier: PlanTier;
  status: SubscriptionStatus;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string | null;
  customerKey: string;
  cancelAtPeriodEnd: boolean;
  cancelScheduledAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  hasPaidAccess: boolean;
  entitlements: BillingEntitlements;
  aiRecoveryModel: string | null;
  medSafetyQuota: MedSafetyQuotaSnapshot;
};

export type MedSafetyCreditQuota = {
  includedRemaining: number;
  extraRemaining: number;
  totalRemaining: number;
};

export type MedSafetyQuotaSnapshot = {
  timezone: "Asia/Seoul";
  standard: MedSafetyCreditQuota;
  premium: MedSafetyCreditQuota;
  recommendedDefaultSearchType: SearchCreditType;
  aiRecoveryModel: string | null;
  currentPlanTitle: string;
  totalRemaining: number;
};

export type BillingOrderSummary = {
  orderId: string;
  userId?: string;
  planTier: PlanTier;
  orderKind: BillingOrderKind;
  productId: CheckoutProductId | null;
  creditType: SearchCreditType | null;
  creditPackUnits: number;
  amount: number;
  currency: string;
  status: BillingOrderStatus;
  orderName: string;
  paymentKey: string | null;
  failCode: string | null;
  failMessage: string | null;
  approvedAt: string | null;
  createdAt: string | null;
};

export type BillingPurchaseSummary = {
  totalPaidAmount: number;
  subscriptionPaidAmount: number;
  creditPaidAmount: number;
  creditPurchasedUnits: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MED_SAFETY_TIMEZONE = "Asia/Seoul" as const;
const OPTIONAL_CANCEL_COLUMNS = [
  "subscription_cancel_at_period_end",
  "subscription_cancel_scheduled_at",
  "subscription_canceled_at",
  "subscription_cancel_reason",
] as const;
const OPTIONAL_MED_SAFETY_COLUMNS = [
  "med_safety_extra_credits",
  "med_safety_daily_used",
  "med_safety_usage_date",
  "med_safety_standard_included_credits",
  "med_safety_standard_extra_credits",
  "med_safety_premium_included_credits",
  "med_safety_premium_extra_credits",
] as const;
const BASE_SUBSCRIPTION_SELECT =
  "subscription_tier, subscription_status, subscription_started_at, subscription_current_period_end, subscription_updated_at, toss_customer_key";
const OPTIONAL_SUBSCRIPTION_COLUMNS = [...OPTIONAL_CANCEL_COLUMNS, ...OPTIONAL_MED_SAFETY_COLUMNS] as const;
const FULL_SUBSCRIPTION_SELECT = `${BASE_SUBSCRIPTION_SELECT}, ${OPTIONAL_SUBSCRIPTION_COLUMNS.join(", ")}`;
const OPTIONAL_BILLING_ORDER_COLUMNS = ["order_kind", "credit_pack_units", "product_id", "credit_type"] as const;
const BILLING_ORDER_SELECT_BASE =
  "order_id, user_id, plan_tier, amount, currency, status, order_name, payment_key, fail_code, fail_message, approved_at, created_at";
const BILLING_ORDER_SELECT_WITH_OPTIONAL = `${BILLING_ORDER_SELECT_BASE}, ${OPTIONAL_BILLING_ORDER_COLUMNS.join(", ")}`;

function isSchemaCacheMissingColumnError(error: any, column: string) {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  if (!message) return false;
  const lower = message.toLowerCase();
  const mentionsColumn =
    message.includes(`'${column}'`) ||
    message.includes(`.${column}`) ||
    new RegExp(`\\b${column}\\b`).test(message);

  if (!mentionsColumn) return false;

  if (lower.includes("schema cache") && (code === "PGRST204" || message.includes("Could not find the"))) {
    return true;
  }

  if (code === "42703" && lower.includes("does not exist")) {
    return true;
  }

  return false;
}

function isOptionalSubscriptionColumnError(error: any) {
  return OPTIONAL_SUBSCRIPTION_COLUMNS.some((column) => isSchemaCacheMissingColumnError(error, column));
}

function isOptionalBillingOrderColumnError(error: any) {
  return OPTIONAL_BILLING_ORDER_COLUMNS.some((column) => isSchemaCacheMissingColumnError(error, column));
}

function stripOptionalSubscriptionColumns(values: Record<string, unknown>) {
  const next = { ...values } as Record<string, unknown>;
  for (const column of OPTIONAL_SUBSCRIPTION_COLUMNS) {
    delete next[column];
  }
  return next;
}

async function updateUserWithOptionalSubscriptionFallback(userId: string, values: Record<string, unknown>) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("rnest_users").update(values).eq("user_id", userId);
  if (!error) return;

  if (!isOptionalSubscriptionColumnError(error)) {
    throw error;
  }

  const fallbackValues = stripOptionalSubscriptionColumns(values);
  if (Object.keys(fallbackValues).length === 0) {
    throw new Error("billing_schema_outdated_optional_columns");
  }

  const { error: fallbackError } = await admin.from("rnest_users").update(fallbackValues).eq("user_id", userId);
  if (fallbackError) throw fallbackError;
}

async function readUserSubscriptionRow(userId: string): Promise<{ data: any; supportsOptionalColumns: boolean }> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin.from("rnest_users").select(FULL_SUBSCRIPTION_SELECT).eq("user_id", userId).maybeSingle();
  if (!fullRes.error) {
    return {
      data: fullRes.data,
      supportsOptionalColumns: true,
    };
  }

  if (!isOptionalSubscriptionColumnError(fullRes.error)) {
    throw fullRes.error;
  }

  const fallbackRes = await admin.from("rnest_users").select(BASE_SUBSCRIPTION_SELECT).eq("user_id", userId).maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;

  return {
    data: fallbackRes.data,
    supportsOptionalColumns: false,
  };
}

function asPlanTier(value: unknown): PlanTier {
  if (value === "free") return "free";
  if (value === "plus") return "plus";
  if (value === "pro") return "pro";
  if (typeof value === "string" && value.trim()) return "pro";
  return "free";
}

function normalizePersistedPaidPlanTier(value: Exclude<PlanTier, "free">): Exclude<PlanTier, "free"> {
  return value === "plus" ? "pro" : value;
}

function isPlanTierConstraintError(error: any, column: "plan_tier" | "subscription_tier") {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  const lower = message.toLowerCase();
  if (!message) return false;

  const mentionsColumn = lower.includes(column) || lower.includes(`${column}_check`);
  const mentionsConstraint =
    lower.includes("check constraint") ||
    lower.includes("violates check constraint") ||
    lower.includes("invalid input value for enum");

  if (!mentionsColumn && !mentionsConstraint) return false;
  if (code === "23514" || code === "22P02") return true;
  return lower.includes(`${column}_check`) || lower.includes("invalid input value for enum");
}

function asSubscriptionStatus(value: unknown): SubscriptionStatus {
  if (value === "active" || value === "expired") return value;
  return "inactive";
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toNonNegativeInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(n));
}

function buildMedSafetyQuotaSnapshot(input: {
  tier: PlanTier;
  standardIncluded: number;
  standardExtra: number;
  premiumIncluded: number;
  premiumExtra: number;
}): MedSafetyQuotaSnapshot {
  const standard: MedSafetyCreditQuota = {
    includedRemaining: toNonNegativeInt(input.standardIncluded),
    extraRemaining: toNonNegativeInt(input.standardExtra),
    totalRemaining: toNonNegativeInt(input.standardIncluded) + toNonNegativeInt(input.standardExtra),
  };
  const premium: MedSafetyCreditQuota = {
    includedRemaining: toNonNegativeInt(input.premiumIncluded),
    extraRemaining: toNonNegativeInt(input.premiumExtra),
    totalRemaining: toNonNegativeInt(input.premiumIncluded) + toNonNegativeInt(input.premiumExtra),
  };
  const plan = getPlanDefinition(input.tier);
  return {
    timezone: MED_SAFETY_TIMEZONE,
    standard,
    premium,
    recommendedDefaultSearchType: getDefaultSearchTypeForTier(input.tier),
    aiRecoveryModel: plan.aiRecoveryModel,
    currentPlanTitle: plan.title,
    totalRemaining: standard.totalRemaining + premium.totalRemaining,
  };
}

function hasPaidAccessFromSnapshot(input: {
  tier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}) {
  if (input.tier === "free") return false;
  if (input.status !== "active") return false;
  const end = parseDate(input.currentPeriodEnd);
  if (!end) return true;
  return end.getTime() > Date.now();
}

function hasIncludedSearchCreditAccess(input: {
  tier: PlanTier;
  hasPaidAccess: boolean;
}) {
  return input.tier === "free" || input.hasPaidAccess;
}

function sanitizeCancelReason(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 220) : null;
}

function asOrderStatus(value: unknown): BillingOrderStatus {
  if (value === "DONE" || value === "FAILED" || value === "CANCELED") return value;
  return "READY";
}

function asOrderKind(value: unknown): BillingOrderKind {
  if (value === "credit_pack") return "credit_pack";
  return "subscription";
}

function inferPlanTierFromLegacyFields(row: any): PlanTier {
  const directTier = asPlanTier(row?.plan_tier);
  if (directTier === "plus") return "plus";

  const orderId = String(row?.order_id ?? "").toLowerCase();
  const orderName = String(row?.order_name ?? "").toLowerCase();
  if (/(^|_)plus(_|$)/.test(orderId) || /\bplus\b/.test(orderName)) return "plus";
  if (/(^|_)pro(_|$)/.test(orderId) || /\bpro\b/.test(orderName)) return "pro";
  return directTier;
}

function inferOrderKindFromLegacyFields(row: any): BillingOrderKind {
  if (row && Object.prototype.hasOwnProperty.call(row, "order_kind")) {
    return asOrderKind(row?.order_kind);
  }
  const orderId = String(row?.order_id ?? "").toLowerCase();
  const orderName = String(row?.order_name ?? "").toLowerCase();
  if (/(^|_)credit(?:10|30)?(_|$)/.test(orderId)) return "credit_pack";
  if (/credit|크레딧/.test(orderName)) return "credit_pack";
  return "subscription";
}

function inferCreditPackUnitsFromLegacyFields(row: any, orderKind: BillingOrderKind) {
  if (row && Object.prototype.hasOwnProperty.call(row, "credit_pack_units")) {
    return toNonNegativeInt(row?.credit_pack_units, 0);
  }
  if (orderKind !== "credit_pack") return 0;
  const fromOrderName = String(row?.order_name ?? "").match(/(\d+)\s*(?:회|credits?)/i);
  if (fromOrderName?.[1]) {
    return Math.max(1, toNonNegativeInt(fromOrderName[1], 10));
  }
  if (String(row?.order_id ?? "").toLowerCase().includes("standard30")) return 30;
  if (String(row?.order_id ?? "").toLowerCase().includes("standard10")) return 10;
  if (String(row?.order_id ?? "").toLowerCase().includes("premium30")) return 30;
  if (String(row?.order_id ?? "").toLowerCase().includes("premium10")) return 10;
  if (String(row?.order_id ?? "").toLowerCase().includes("credit30")) return 30;
  if (String(row?.order_id ?? "").toLowerCase().includes("credit10")) return 10;
  return 10;
}

function inferProductIdFromLegacyFields(row: any, orderKind: BillingOrderKind): CheckoutProductId | null {
  if (row && Object.prototype.hasOwnProperty.call(row, "product_id")) {
    const direct = row?.product_id;
    if (
      direct === "plus" ||
      direct === "pro" ||
      direct === "standard10" ||
      direct === "standard30" ||
      direct === "premium10" ||
      direct === "premium30"
    ) {
      return direct;
    }
  }

  const orderId = String(row?.order_id ?? "").toLowerCase();
  const orderName = String(row?.order_name ?? "").toLowerCase();
  if (orderKind === "subscription") {
    if (/(^|_)plus(_|$)/.test(orderId) || /\bplus\b/.test(orderName)) return "plus";
    if (/(^|_)pro(_|$)/.test(orderId) || /\bpro\b/.test(orderName)) return "pro";
    return null;
  }

  if (orderId.includes("premium30") || /premium.+30|프리미엄.+30/.test(orderName)) return "premium30";
  if (orderId.includes("premium10") || /premium.+10|프리미엄.+10/.test(orderName)) return "premium10";
  if (orderId.includes("standard30") || /standard.+30|기본.+30/.test(orderName)) return "standard30";
  if (orderId.includes("standard10") || /standard.+10|기본.+10/.test(orderName)) return "standard10";
  if (orderId.includes("credit30")) return "standard30";
  if (orderId.includes("credit10")) return "standard10";
  return null;
}

function inferCreditTypeFromLegacyFields(row: any, productId: CheckoutProductId | null): SearchCreditType | null {
  if (row && Object.prototype.hasOwnProperty.call(row, "credit_type")) {
    if (row?.credit_type === "standard" || row?.credit_type === "premium") {
      return row.credit_type;
    }
  }
  if (productId === "standard10" || productId === "standard30") return "standard";
  if (productId === "premium10" || productId === "premium30") return "premium";
  const orderName = String(row?.order_name ?? "").toLowerCase();
  if (orderName.includes("premium") || orderName.includes("프리미엄")) return "premium";
  if (inferOrderKindFromLegacyFields(row) === "credit_pack") return "standard";
  return null;
}

function toBillingOrderSummary(row: any): BillingOrderSummary {
  const orderKind = inferOrderKindFromLegacyFields(row);
  const creditPackUnits = inferCreditPackUnitsFromLegacyFields(row, orderKind);
  const productId = inferProductIdFromLegacyFields(row, orderKind);
  const creditType = inferCreditTypeFromLegacyFields(row, productId);
  return {
    orderId: row?.order_id ?? "",
    userId: row?.user_id ?? undefined,
    planTier: inferPlanTierFromLegacyFields(row),
    orderKind,
    productId,
    creditType,
    creditPackUnits,
    amount: Number(row?.amount ?? 0),
    currency: row?.currency ?? "KRW",
    status: asOrderStatus(row?.status),
    orderName: row?.order_name ?? "",
    paymentKey: row?.payment_key ?? null,
    failCode: row?.fail_code ?? null,
    failMessage: row?.fail_message ?? null,
    approvedAt: row?.approved_at ?? null,
    createdAt: row?.created_at ?? null,
  };
}

async function readLatestPaidDoneOrder(userId: string): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_WITH_OPTIONAL)
    .eq("user_id", userId)
    .eq("status", "DONE")
    .in("plan_tier", [...PAID_PLAN_TIERS])
    .eq("order_kind", "subscription")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fullRes.error) {
    if (!fullRes.data) return null;
    return toBillingOrderSummary(fullRes.data);
  }

  if (!isOptionalBillingOrderColumnError(fullRes.error)) {
    throw fullRes.error;
  }

  const fallbackRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_BASE)
    .eq("user_id", userId)
    .eq("status", "DONE")
    .order("created_at", { ascending: false })
    .limit(12);
  if (fallbackRes.error) throw fallbackRes.error;
  const rows = Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
  for (const row of rows) {
    const summary = toBillingOrderSummary(row);
    if (summary.orderKind === "subscription" && summary.planTier !== "free") {
      return summary;
    }
  }
  return null;
}

async function readLatestCanceledOrderUpdatedAt(userId: string): Promise<Date | null> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select("updated_at, created_at, order_kind")
    .eq("user_id", userId)
    .eq("status", "CANCELED")
    .eq("order_kind", "subscription")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fullRes.error) {
    if (!fullRes.data) return null;
    return parseDate(fullRes.data.updated_at ?? fullRes.data.created_at ?? null);
  }
  if (!isOptionalBillingOrderColumnError(fullRes.error)) throw fullRes.error;

  const fallbackRes = await admin
    .from("billing_orders")
    .select("updated_at, created_at")
    .eq("user_id", userId)
    .eq("status", "CANCELED")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data) return null;
  return parseDate(fallbackRes.data.updated_at ?? fallbackRes.data.created_at ?? null);
}

async function maybeRecoverSubscriptionFromLatestPaidOrder(
  userId: string,
  snapshot: SubscriptionSnapshot
): Promise<SubscriptionSnapshot | null> {
  if (snapshot.hasPaidAccess) return null;
  if (snapshot.cancelAtPeriodEnd) return null;

  const latestPaid = await readLatestPaidDoneOrder(userId);
  if (!latestPaid) return null;
  if (latestPaid.planTier === "free") return null;

  const paidBaseDate = parseDate(latestPaid.approvedAt ?? latestPaid.createdAt);
  if (!paidBaseDate) return null;

  const latestCanceledAt = await readLatestCanceledOrderUpdatedAt(userId);
  if (latestCanceledAt && latestCanceledAt.getTime() >= paidBaseDate.getTime()) {
    return null;
  }

  const canceledAt = parseDate(snapshot.canceledAt);
  if (canceledAt && canceledAt.getTime() >= paidBaseDate.getTime()) {
    return null;
  }

  const plan = getPlanDefinition(latestPaid.planTier);
  const recoveredPeriodEnd = new Date(paidBaseDate.getTime() + plan.periodDays * DAY_MS);
  if (!Number.isFinite(recoveredPeriodEnd.getTime()) || recoveredPeriodEnd.getTime() <= Date.now()) {
    return null;
  }

  const startedAt = snapshot.tier === latestPaid.planTier && snapshot.startedAt ? snapshot.startedAt : paidBaseDate.toISOString();
  const nowIso = new Date().toISOString();
  await updatePaidSubscriptionWithCompatibility(userId, latestPaid.planTier, {
    subscription_status: "active",
    subscription_started_at: startedAt,
    subscription_current_period_end: recoveredPeriodEnd.toISOString(),
    subscription_updated_at: nowIso,
    subscription_cancel_at_period_end: false,
    subscription_cancel_scheduled_at: null,
    subscription_cancel_reason: null,
    subscription_canceled_at: null,
    toss_customer_key: createCustomerKey(userId),
    toss_last_order_id: latestPaid.orderId,
    last_seen: nowIso,
  });

  return readSubscription(userId, { skipReconcile: true });
}

export function createCustomerKey(userId: string) {
  return `rnest_${userId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

async function updatePaidSubscriptionWithCompatibility(
  userId: string,
  planTier: PlanTier,
  values: Record<string, unknown>
) {
  if (planTier === "free") {
    throw new Error("invalid_paid_plan_tier");
  }

  try {
    await updateUserWithOptionalSubscriptionFallback(userId, {
      ...values,
      subscription_tier: planTier,
    });
    return;
  } catch (error) {
    const fallbackTier = normalizePersistedPaidPlanTier(planTier);
    if (fallbackTier === planTier || !isPlanTierConstraintError(error, "subscription_tier")) {
      throw error;
    }
  }

  await updateUserWithOptionalSubscriptionFallback(userId, {
    ...values,
    subscription_tier: normalizePersistedPaidPlanTier(planTier),
  });
}

async function maybeResolveLegacyPlusTier(userId: string, snapshot: SubscriptionSnapshot): Promise<SubscriptionSnapshot> {
  if (!snapshot.hasPaidAccess || snapshot.tier !== "pro") return snapshot;

  const latestPaid = await readLatestPaidDoneOrder(userId);
  if (!latestPaid || latestPaid.planTier !== "plus") return snapshot;

  const paidBaseDate = parseDate(latestPaid.approvedAt ?? latestPaid.createdAt);
  if (!paidBaseDate) return snapshot;

  const latestCanceledAt = await readLatestCanceledOrderUpdatedAt(userId);
  if (latestCanceledAt && latestCanceledAt.getTime() >= paidBaseDate.getTime()) {
    return snapshot;
  }

  return {
    ...snapshot,
    tier: "plus",
  };
}

export async function readSubscription(
  userId: string,
  options?: { skipReconcile?: boolean }
): Promise<SubscriptionSnapshot> {
  await ensureUserRow(userId);

  const { data, supportsOptionalColumns } = await readUserSubscriptionRow(userId);

  let tier = asPlanTier(data?.subscription_tier);
  let status = asSubscriptionStatus(data?.subscription_status);
  const startedAt = data?.subscription_started_at ?? null;
  let currentPeriodEnd = data?.subscription_current_period_end ?? null;
  let updatedAt = data?.subscription_updated_at ?? null;
  let cancelAtPeriodEnd = Boolean(data?.subscription_cancel_at_period_end);
  let cancelScheduledAt = data?.subscription_cancel_scheduled_at ?? null;
  const canceledAt = data?.subscription_canceled_at ?? null;
  const cancelReason = sanitizeCancelReason(data?.subscription_cancel_reason);
  const legacyStandardExtraCredits = toNonNegativeInt(data?.med_safety_extra_credits, 0);
  let standardIncludedCredits = supportsOptionalColumns ? toNonNegativeInt(data?.med_safety_standard_included_credits, 0) : 0;
  let standardExtraCredits = supportsOptionalColumns
    ? toNonNegativeInt(data?.med_safety_standard_extra_credits, legacyStandardExtraCredits)
    : legacyStandardExtraCredits;
  let premiumIncludedCredits = supportsOptionalColumns ? toNonNegativeInt(data?.med_safety_premium_included_credits, 0) : 0;
  let premiumExtraCredits = supportsOptionalColumns ? toNonNegativeInt(data?.med_safety_premium_extra_credits, 0) : 0;

  const endDate = parseDate(currentPeriodEnd);
  const now = Date.now();
  const shouldExpire = tier !== "free" && status === "active" && endDate && endDate.getTime() <= now;
  if (shouldExpire) {
    const nowIso = new Date(now).toISOString();
    try {
      await updateUserWithOptionalSubscriptionFallback(userId, {
        subscription_tier: "free",
        subscription_status: "expired",
        subscription_updated_at: nowIso,
        subscription_cancel_at_period_end: false,
        subscription_cancel_scheduled_at: null,
        med_safety_standard_included_credits: 0,
        med_safety_premium_included_credits: 0,
      });
      tier = "free";
      status = "inactive";
      updatedAt = nowIso;
      cancelAtPeriodEnd = false;
      cancelScheduledAt = null;
      standardIncludedCredits = 0;
      premiumIncludedCredits = 0;
    } catch {
      // Keep current snapshot if expiration write fails.
    }
  }

  if (tier === "free" && status !== "inactive") {
    status = "inactive";
  }

  if (tier === "free" && supportsOptionalColumns) {
    const freePlan = getPlanDefinition("free");
    const freeCycleEnd = parseDate(currentPeriodEnd);
    const shouldResetFreeTrialCycle =
      !freeCycleEnd ||
      freeCycleEnd.getTime() <= now ||
      standardIncludedCredits > freePlan.includedSearchCredits.standard ||
      premiumIncludedCredits > freePlan.includedSearchCredits.premium;

    if (shouldResetFreeTrialCycle) {
      const nowIso = new Date(now).toISOString();
      const nextCycleEndIso = new Date(now + freePlan.periodDays * DAY_MS).toISOString();
      try {
        await updateUserWithOptionalSubscriptionFallback(userId, {
          subscription_current_period_end: nextCycleEndIso,
          subscription_updated_at: nowIso,
          med_safety_standard_included_credits: freePlan.includedSearchCredits.standard,
          med_safety_premium_included_credits: freePlan.includedSearchCredits.premium,
          last_seen: nowIso,
        });
        currentPeriodEnd = nextCycleEndIso;
        updatedAt = nowIso;
        standardIncludedCredits = freePlan.includedSearchCredits.standard;
        premiumIncludedCredits = freePlan.includedSearchCredits.premium;
      } catch {
        // Keep current snapshot if free cycle reset write fails.
      }
    }
  }

  const hasPaidAccess = hasPaidAccessFromSnapshot({ tier, status, currentPeriodEnd });
  const includedCreditAccess = hasIncludedSearchCreditAccess({ tier, hasPaidAccess });
  const medSafetyQuota = buildMedSafetyQuotaSnapshot({
    tier,
    standardIncluded: includedCreditAccess ? standardIncludedCredits : 0,
    standardExtra: standardExtraCredits,
    premiumIncluded: includedCreditAccess ? premiumIncludedCredits : 0,
    premiumExtra: premiumExtraCredits,
  });
  const plan = getPlanDefinition(tier);

  const persistedCustomerKey = String(data?.toss_customer_key ?? "").trim();
  const normalizedCustomerKey = persistedCustomerKey.startsWith("rnest_")
    ? persistedCustomerKey
    : createCustomerKey(userId);

  const snapshot: SubscriptionSnapshot = {
    tier,
    status,
    startedAt,
    currentPeriodEnd,
    updatedAt,
    customerKey: normalizedCustomerKey,
    cancelAtPeriodEnd,
    cancelScheduledAt,
    canceledAt,
    cancelReason,
    hasPaidAccess,
    entitlements: buildBillingEntitlements({
      tier,
      hasPaidAccess,
      medSafetyTotalRemaining: medSafetyQuota.totalRemaining,
    }),
    aiRecoveryModel: plan.aiRecoveryModel,
    medSafetyQuota,
  };

  if (normalizedCustomerKey !== persistedCustomerKey) {
    updateUserWithOptionalSubscriptionFallback(userId, {
      toss_customer_key: normalizedCustomerKey,
      last_seen: new Date().toISOString(),
    }).catch(() => undefined);
  }

  const effectiveSnapshot = await maybeResolveLegacyPlusTier(userId, snapshot).catch(() => snapshot);

  if (options?.skipReconcile) {
    return effectiveSnapshot;
  }

  try {
    const recovered = await maybeRecoverSubscriptionFromLatestPaidOrder(userId, effectiveSnapshot);
    const nextSnapshot = recovered ?? effectiveSnapshot;
    return await maybeResolveLegacyPlusTier(userId, nextSnapshot).catch(() => nextSnapshot);
  } catch {
    return effectiveSnapshot;
  }
}

export async function readBillingPurchaseSummary(userId: string): Promise<BillingPurchaseSummary> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select("order_id, order_name, amount, order_kind, credit_pack_units, status")
    .eq("user_id", userId)
    .eq("status", "DONE");
  if (fullRes.error && !isOptionalBillingOrderColumnError(fullRes.error)) throw fullRes.error;

  let rows: any[] = Array.isArray(fullRes.data) ? [...fullRes.data] : [];
  if (fullRes.error && isOptionalBillingOrderColumnError(fullRes.error)) {
    const fallbackRes = await admin
      .from("billing_orders")
      .select("order_id, order_name, amount, status")
      .eq("user_id", userId)
      .eq("status", "DONE");
    if (fallbackRes.error) throw fallbackRes.error;
    rows = Array.isArray(fallbackRes.data) ? [...fallbackRes.data] : [];
  }

  let totalPaidAmount = 0;
  let subscriptionPaidAmount = 0;
  let creditPaidAmount = 0;
  let creditPurchasedUnits = 0;

  for (const row of rows) {
    const amount = toNonNegativeInt((row as any)?.amount, 0);
    const kind = inferOrderKindFromLegacyFields(row as any);
    const credits = inferCreditPackUnitsFromLegacyFields(row as any, kind);
    totalPaidAmount += amount;
    if (kind === "credit_pack") {
      creditPaidAmount += amount;
      creditPurchasedUnits += credits;
    } else {
      subscriptionPaidAmount += amount;
    }
  }

  return {
    totalPaidAmount,
    subscriptionPaidAmount,
    creditPaidAmount,
    creditPurchasedUnits,
  };
}

export async function listRecentBillingOrders(userId: string, limit = 12): Promise<BillingOrderSummary[]> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_WITH_OPTIONAL)
    .eq("user_id", userId)
    .in("status", ["DONE", "CANCELED"])
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.round(limit))));
  if (!fullRes.error) {
    return (fullRes.data ?? []).map((row) => toBillingOrderSummary(row));
  }
  if (!isOptionalBillingOrderColumnError(fullRes.error)) throw fullRes.error;
  const fallbackRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_BASE)
    .eq("user_id", userId)
    .in("status", ["DONE", "CANCELED"])
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.round(limit))));
  if (fallbackRes.error) throw fallbackRes.error;
  return (fallbackRes.data ?? []).map((row) => toBillingOrderSummary(row));
}
