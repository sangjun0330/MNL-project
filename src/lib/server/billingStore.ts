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

export function createCustomerKey(userId: string) {
  return `wnl_${userId.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export async function readSubscription(userId: string): Promise<SubscriptionSnapshot> {
  await ensureUserRow(userId);
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("wnl_users")
    .select(
      "subscription_tier, subscription_status, subscription_started_at, subscription_current_period_end, subscription_updated_at, toss_customer_key, subscription_cancel_at_period_end, subscription_cancel_scheduled_at, subscription_canceled_at, subscription_cancel_reason"
    )
    .eq("user_id", userId)
    .maybeSingle();

  let tier = asPlanTier(data?.subscription_tier);
  let status = asSubscriptionStatus(data?.subscription_status);
  let startedAt = data?.subscription_started_at ?? null;
  let currentPeriodEnd = data?.subscription_current_period_end ?? null;
  let updatedAt = data?.subscription_updated_at ?? null;
  let cancelAtPeriodEnd = Boolean(data?.subscription_cancel_at_period_end);
  let cancelScheduledAt = data?.subscription_cancel_scheduled_at ?? null;
  let canceledAt = data?.subscription_canceled_at ?? null;
  let cancelReason = sanitizeCancelReason(data?.subscription_cancel_reason);

  const endDate = parseDate(currentPeriodEnd);
  const now = Date.now();
  const shouldExpire = tier !== "free" && status === "active" && endDate && endDate.getTime() <= now;
  if (shouldExpire) {
    const nowIso = new Date(now).toISOString();
    const { error } = await admin
      .from("wnl_users")
      .update({
        subscription_tier: "free",
        subscription_status: "expired",
        subscription_updated_at: nowIso,
        subscription_cancel_at_period_end: false,
        subscription_cancel_scheduled_at: null,
      })
      .eq("user_id", userId);
    if (!error) {
      tier = "free";
      status = "expired";
      updatedAt = nowIso;
      cancelAtPeriodEnd = false;
      cancelScheduledAt = null;
      // Preserve canceledAt/cancelReason for history.
      startedAt = startedAt ?? null;
      currentPeriodEnd = currentPeriodEnd ?? null;
      canceledAt = canceledAt ?? null;
      cancelReason = cancelReason ?? null;
    }
  }

  return {
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

  const { error: userErr } = await admin
    .from("wnl_users")
    .update({
      toss_customer_key: createCustomerKey(input.userId),
      toss_last_order_id: input.orderId,
      subscription_cancel_at_period_end: false,
      subscription_cancel_scheduled_at: null,
      subscription_cancel_reason: null,
      last_seen: now,
    })
    .eq("user_id", input.userId);
  if (userErr) throw userErr;

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
    .eq("user_id", input.userId)
    .neq("status", "DONE");

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

  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("wnl_users")
    .update({
      subscription_cancel_at_period_end: true,
      subscription_cancel_scheduled_at: nowIso,
      subscription_cancel_reason: sanitizeCancelReason(input.reason),
      subscription_updated_at: nowIso,
      last_seen: nowIso,
    })
    .eq("user_id", input.userId);
  if (error) throw error;

  return readSubscription(input.userId);
}

export async function resumeScheduledSubscription(input: { userId: string }): Promise<SubscriptionSnapshot> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("wnl_users")
    .update({
      subscription_cancel_at_period_end: false,
      subscription_cancel_scheduled_at: null,
      subscription_cancel_reason: null,
      subscription_updated_at: nowIso,
      last_seen: nowIso,
    })
    .eq("user_id", input.userId);
  if (error) throw error;

  return readSubscription(input.userId);
}

export async function downgradeToFreeNow(input: {
  userId: string;
  reason?: string | null;
}): Promise<SubscriptionSnapshot> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("wnl_users")
    .update({
      subscription_tier: "free",
      subscription_status: "inactive",
      subscription_current_period_end: nowIso,
      subscription_updated_at: nowIso,
      subscription_cancel_at_period_end: false,
      subscription_cancel_scheduled_at: null,
      subscription_canceled_at: nowIso,
      subscription_cancel_reason: sanitizeCancelReason(input.reason),
      last_seen: nowIso,
    })
    .eq("user_id", input.userId);
  if (error) throw error;
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

  const paidPlanTier = asPlanTier(order.plan_tier);
  if (paidPlanTier === "free") {
    throw new Error("invalid_plan");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const plan = getPlanDefinition(paidPlanTier);

  const current = await readSubscription(input.userId);
  const currentEnd = current.currentPeriodEnd ? new Date(current.currentPeriodEnd) : null;

  const isSamePlan = current.tier === paidPlanTier;
  const hasRemaining = Boolean(currentEnd && Number.isFinite(currentEnd.getTime()) && currentEnd.getTime() > now.getTime());
  const baseDate = isSamePlan && hasRemaining && currentEnd ? currentEnd : now;
  const nextEnd = new Date(baseDate.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);

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

  const { error: userErr } = await admin
    .from("wnl_users")
    .update({
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
    })
    .eq("user_id", input.userId);
  if (userErr) throw userErr;

  return readSubscription(input.userId);
}
