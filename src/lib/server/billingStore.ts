import { getPlanDefinition, type PlanTier } from "@/lib/billing/plans";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { ensureUserRow } from "@/lib/server/userStateStore";
import type { Json } from "@/types/supabase";

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
};

export type BillingOrderSummary = {
  orderId: string;
  userId?: string;
  planTier: PlanTier;
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

const DAY_MS = 24 * 60 * 60 * 1000;
const OPTIONAL_CANCEL_COLUMNS = [
  "subscription_cancel_at_period_end",
  "subscription_cancel_scheduled_at",
  "subscription_canceled_at",
  "subscription_cancel_reason",
] as const;
const BASE_SUBSCRIPTION_SELECT =
  "subscription_tier, subscription_status, subscription_started_at, subscription_current_period_end, subscription_updated_at, toss_customer_key";
const FULL_SUBSCRIPTION_SELECT = `${BASE_SUBSCRIPTION_SELECT}, ${OPTIONAL_CANCEL_COLUMNS.join(", ")}`;

function isSchemaCacheMissingColumnError(error: any, column: string) {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  if (!message) return false;
  if (!message.includes(`'${column}'`)) return false;
  if (!message.includes("wnl_users")) return false;
  if (!message.toLowerCase().includes("schema cache")) return false;
  return code === "PGRST204" || message.includes("Could not find the");
}

function isOptionalCancelColumnError(error: any) {
  return OPTIONAL_CANCEL_COLUMNS.some((column) => isSchemaCacheMissingColumnError(error, column));
}

function stripOptionalCancelColumns(values: Record<string, unknown>) {
  const next = { ...values } as Record<string, unknown>;
  for (const column of OPTIONAL_CANCEL_COLUMNS) {
    delete next[column];
  }
  return next;
}

async function updateUserWithOptionalCancelFallback(userId: string, values: Record<string, unknown>) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("wnl_users").update(values).eq("user_id", userId);
  if (!error) return;

  if (!isOptionalCancelColumnError(error)) {
    throw error;
  }

  const fallbackValues = stripOptionalCancelColumns(values);
  if (Object.keys(fallbackValues).length === 0) {
    throw new Error("billing_schema_outdated_optional_columns");
  }

  const { error: fallbackError } = await admin.from("wnl_users").update(fallbackValues).eq("user_id", userId);
  if (fallbackError) throw fallbackError;
}

async function readUserSubscriptionRow(userId: string): Promise<{ data: any; supportsCancelColumns: boolean }> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin.from("wnl_users").select(FULL_SUBSCRIPTION_SELECT).eq("user_id", userId).maybeSingle();
  if (!fullRes.error) {
    return {
      data: fullRes.data,
      supportsCancelColumns: true,
    };
  }

  if (!isOptionalCancelColumnError(fullRes.error)) {
    throw fullRes.error;
  }

  const fallbackRes = await admin.from("wnl_users").select(BASE_SUBSCRIPTION_SELECT).eq("user_id", userId).maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;

  return {
    data: fallbackRes.data,
    supportsCancelColumns: false,
  };
}

function asPlanTier(value: unknown): PlanTier {
  if (value === "basic" || value === "pro") return value;
  return "free";
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

function sanitizeCancelReason(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 220) : null;
}

function asOrderStatus(value: unknown): BillingOrderStatus {
  if (value === "DONE" || value === "FAILED" || value === "CANCELED") return value;
  return "READY";
}

function toBillingOrderSummary(row: any): BillingOrderSummary {
  return {
    orderId: row?.order_id ?? "",
    userId: row?.user_id ?? undefined,
    planTier: asPlanTier(row?.plan_tier),
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
  const { data, error } = await admin
    .from("billing_orders")
    .select("order_id, plan_tier, amount, currency, status, order_name, payment_key, fail_code, fail_message, approved_at, created_at")
    .eq("user_id", userId)
    .eq("status", "DONE")
    .in("plan_tier", ["basic", "pro"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toBillingOrderSummary(data);
}

async function readLatestCanceledOrderUpdatedAt(userId: string): Promise<Date | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_orders")
    .select("updated_at, created_at")
    .eq("user_id", userId)
    .eq("status", "CANCELED")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return parseDate(data.updated_at ?? data.created_at ?? null);
}

async function maybeRecoverSubscriptionFromLatestPaidOrder(
  userId: string,
  snapshot: SubscriptionSnapshot
): Promise<SubscriptionSnapshot | null> {
  if (snapshot.hasPaidAccess) return null;
  if (snapshot.cancelAtPeriodEnd) return null;

  const latestPaid = await readLatestPaidDoneOrder(userId);
  if (!latestPaid) return null;
  if (latestPaid.planTier !== "basic" && latestPaid.planTier !== "pro") return null;

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
  await updateUserWithOptionalCancelFallback(userId, {
    subscription_tier: latestPaid.planTier,
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
  return `wnl_${userId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export async function readSubscription(
  userId: string,
  options?: { skipReconcile?: boolean }
): Promise<SubscriptionSnapshot> {
  await ensureUserRow(userId);

  const { data } = await readUserSubscriptionRow(userId);

  let tier = asPlanTier(data?.subscription_tier);
  let status = asSubscriptionStatus(data?.subscription_status);
  const startedAt = data?.subscription_started_at ?? null;
  const currentPeriodEnd = data?.subscription_current_period_end ?? null;
  let updatedAt = data?.subscription_updated_at ?? null;
  let cancelAtPeriodEnd = Boolean(data?.subscription_cancel_at_period_end);
  let cancelScheduledAt = data?.subscription_cancel_scheduled_at ?? null;
  const canceledAt = data?.subscription_canceled_at ?? null;
  const cancelReason = sanitizeCancelReason(data?.subscription_cancel_reason);

  const endDate = parseDate(currentPeriodEnd);
  const now = Date.now();
  const shouldExpire = tier !== "free" && status === "active" && endDate && endDate.getTime() <= now;
  if (shouldExpire) {
    const nowIso = new Date(now).toISOString();
    try {
      await updateUserWithOptionalCancelFallback(userId, {
        subscription_tier: "free",
        subscription_status: "expired",
        subscription_updated_at: nowIso,
        subscription_cancel_at_period_end: false,
        subscription_cancel_scheduled_at: null,
      });
      tier = "free";
      status = "expired";
      updatedAt = nowIso;
      cancelAtPeriodEnd = false;
      cancelScheduledAt = null;
    } catch {
      // Keep current snapshot if expiration write fails.
    }
  }

  const snapshot: SubscriptionSnapshot = {
    tier,
    status,
    startedAt,
    currentPeriodEnd,
    updatedAt,
    customerKey: data?.toss_customer_key || createCustomerKey(userId),
    cancelAtPeriodEnd,
    cancelScheduledAt,
    canceledAt,
    cancelReason,
    hasPaidAccess: hasPaidAccessFromSnapshot({ tier, status, currentPeriodEnd }),
  };

  if (options?.skipReconcile) {
    return snapshot;
  }

  try {
    const recovered = await maybeRecoverSubscriptionFromLatestPaidOrder(userId, snapshot);
    return recovered ?? snapshot;
  } catch {
    return snapshot;
  }
}

export async function createBillingOrder(input: {
  userId: string;
  orderId: string;
  planTier: Exclude<PlanTier, "free">;
  amount: number;
  currency?: string;
  orderName?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const plan = getPlanDefinition(input.planTier);

  await ensureUserRow(input.userId);

  await updateUserWithOptionalCancelFallback(input.userId, {
    toss_customer_key: createCustomerKey(input.userId),
    toss_last_order_id: input.orderId,
    subscription_cancel_at_period_end: false,
    subscription_cancel_scheduled_at: null,
    subscription_cancel_reason: null,
    last_seen: now,
  });

  const { error } = await admin.from("billing_orders").insert({
    order_id: input.orderId,
    user_id: input.userId,
    plan_tier: input.planTier,
    amount: Math.round(input.amount),
    currency: input.currency ?? "KRW",
    status: "READY",
    order_name: input.orderName ?? plan.orderName,
    created_at: now,
    updated_at: now,
  });

  if (error) throw error;
}

export async function readBillingOrderByOrderId(input: {
  userId: string;
  orderId: string;
}): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_orders")
    .select(
      "order_id, plan_tier, amount, currency, status, order_name, payment_key, fail_code, fail_message, approved_at, created_at"
    )
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toBillingOrderSummary(data);
}

export async function readBillingOrderByOrderIdAny(orderId: string): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_orders")
    .select(
      "order_id, user_id, plan_tier, amount, currency, status, order_name, payment_key, fail_code, fail_message, approved_at, created_at"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toBillingOrderSummary(data);
}

export async function listRecentBillingOrders(userId: string, limit = 12): Promise<BillingOrderSummary[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_orders")
    .select(
      "order_id, plan_tier, amount, currency, status, order_name, payment_key, fail_code, fail_message, approved_at, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.round(limit))));

  if (error) throw error;

  return (data ?? []).map((row) => toBillingOrderSummary(row));
}

export async function markBillingOrderFailed(input: {
  userId: string;
  orderId: string;
  code: string;
  message: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("billing_orders")
    .update({
      status: "FAILED",
      fail_code: input.code.slice(0, 80),
      fail_message: input.message.slice(0, 220),
      updated_at: now,
    })
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .neq("status", "DONE");

  if (error) throw error;
}

export async function markBillingOrderCanceled(input: {
  userId: string;
  orderId: string;
  message?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("billing_orders")
    .update({
      status: "CANCELED",
      fail_code: "canceled",
      fail_message: input.message?.slice(0, 220) ?? "Payment was canceled.",
      updated_at: now,
    })
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId);

  if (error) throw error;
}

export async function readLatestRefundableOrder(userId: string): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_orders")
    .select(
      "order_id, user_id, plan_tier, amount, currency, status, order_name, payment_key, fail_code, fail_message, approved_at, created_at"
    )
    .eq("user_id", userId)
    .eq("status", "DONE")
    .not("payment_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toBillingOrderSummary(data);
}

export async function scheduleSubscriptionCancelAtPeriodEnd(input: {
  userId: string;
  reason?: string | null;
}): Promise<SubscriptionSnapshot> {
  const current = await readSubscription(input.userId);
  if (!current.hasPaidAccess) throw new Error("no_active_paid_subscription");

  const nowIso = new Date().toISOString();
  await updateUserWithOptionalCancelFallback(input.userId, {
    subscription_cancel_at_period_end: true,
    subscription_cancel_scheduled_at: nowIso,
    subscription_cancel_reason: sanitizeCancelReason(input.reason),
    subscription_updated_at: nowIso,
    last_seen: nowIso,
  });

  return readSubscription(input.userId);
}

export async function resumeScheduledSubscription(input: { userId: string }): Promise<SubscriptionSnapshot> {
  const nowIso = new Date().toISOString();
  await updateUserWithOptionalCancelFallback(input.userId, {
    subscription_cancel_at_period_end: false,
    subscription_cancel_scheduled_at: null,
    subscription_cancel_reason: null,
    subscription_updated_at: nowIso,
    last_seen: nowIso,
  });

  return readSubscription(input.userId);
}

export async function downgradeToFreeNow(input: {
  userId: string;
  reason?: string | null;
}): Promise<SubscriptionSnapshot> {
  const nowIso = new Date().toISOString();
  await updateUserWithOptionalCancelFallback(input.userId, {
    subscription_tier: "free",
    subscription_status: "inactive",
    subscription_current_period_end: nowIso,
    subscription_updated_at: nowIso,
    subscription_cancel_at_period_end: false,
    subscription_cancel_scheduled_at: null,
    subscription_canceled_at: nowIso,
    subscription_cancel_reason: sanitizeCancelReason(input.reason),
    last_seen: nowIso,
  });
  return readSubscription(input.userId);
}

export async function markBillingOrderDoneAndApplyPlan(input: {
  userId: string;
  orderId: string;
  paymentKey: string;
  approvedAt: string | null;
  amount: number;
  tossResponse: Json;
}): Promise<SubscriptionSnapshot> {
  const admin = getSupabaseAdmin();

  const { data: order, error: orderErr } = await admin
    .from("billing_orders")
    .select("order_id, user_id, plan_tier, amount, status")
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!order) throw new Error("order_not_found");

  const expectedAmount = Math.round(Number(order.amount ?? 0));
  if (expectedAmount !== Math.round(input.amount)) {
    throw new Error("amount_mismatch");
  }

  if (order.status === "DONE") {
    return readSubscription(input.userId);
  }
  if (order.status === "CANCELED") {
    throw new Error("order_canceled");
  }

  const paidPlanTier = asPlanTier(order.plan_tier);
  if (paidPlanTier === "free") {
    throw new Error("invalid_plan");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const plan = getPlanDefinition(paidPlanTier);

  const current = await readSubscription(input.userId, { skipReconcile: true });
  const currentEnd = parseDate(current.currentPeriodEnd);

  const isSamePlan = current.tier === paidPlanTier;
  const hasRemaining = Boolean(currentEnd && Number.isFinite(currentEnd.getTime()) && currentEnd.getTime() > now.getTime());
  const baseDate = isSamePlan && hasRemaining && currentEnd ? currentEnd : now;
  const nextEnd = new Date(baseDate.getTime() + plan.periodDays * DAY_MS);

  const startedAt = isSamePlan && current.startedAt ? current.startedAt : nowIso;

  const { data: updatedOrderRow, error: orderUpdateErr } = await admin
    .from("billing_orders")
    .update({
      status: "DONE",
      payment_key: input.paymentKey,
      approved_at: input.approvedAt,
      fail_code: null,
      fail_message: null,
      toss_response: input.tossResponse,
      updated_at: nowIso,
    })
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .neq("status", "DONE")
    .select("order_id")
    .maybeSingle();
  if (orderUpdateErr) throw orderUpdateErr;
  if (!updatedOrderRow) {
    // Another request already finalized this order.
    return readSubscription(input.userId);
  }

  await updateUserWithOptionalCancelFallback(input.userId, {
    subscription_tier: paidPlanTier,
    subscription_status: "active",
    subscription_started_at: startedAt,
    subscription_current_period_end: nextEnd.toISOString(),
    subscription_updated_at: nowIso,
    subscription_cancel_at_period_end: false,
    subscription_cancel_scheduled_at: null,
    subscription_cancel_reason: null,
    subscription_canceled_at: null,
    toss_customer_key: createCustomerKey(input.userId),
    toss_last_order_id: input.orderId,
    last_seen: nowIso,
  });

  return readSubscription(input.userId);
}
