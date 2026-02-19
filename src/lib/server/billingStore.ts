import { getPlanDefinition, type BillingOrderKind, type PlanTier } from "@/lib/billing/plans";
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
  medSafetyQuota: MedSafetyQuotaSnapshot;
};

export type MedSafetyCreditSource = "daily" | "extra";

export type MedSafetyQuotaSnapshot = {
  timezone: "Asia/Seoul";
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  extraCredits: number;
  totalRemaining: number;
  usageDate: string;
  nextResetAt: string;
  isPro: boolean;
};

export type MedSafetyCreditConsumeResult = {
  allowed: boolean;
  source: MedSafetyCreditSource | null;
  quota: MedSafetyQuotaSnapshot;
  reason: string | null;
};

export type BillingOrderSummary = {
  orderId: string;
  userId?: string;
  planTier: PlanTier;
  orderKind: BillingOrderKind;
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

export type BillingRefundRequestStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "REFUNDED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL"
  | "WITHDRAWN";

export type BillingRefundRequestSummary = {
  id: number;
  userId: string;
  orderId: string;
  reason: string;
  status: BillingRefundRequestStatus;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  executedBy: string | null;
  executedAt: string | null;
  cancelAmount: number | null;
  currency: string;
  tossPaymentKeySnapshot: string | null;
  tossCancelTransactionKey: string | null;
  gatewayResponse: Json | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
  notifiedAt: string | null;
  notifyUserSentAt: string | null;
};

export type BillingRefundEventSummary = {
  id: number;
  requestId: number;
  userId: string;
  orderId: string;
  actorUserId: string | null;
  actorRole: "user" | "admin" | "system";
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  metadata: Json | null;
  createdAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MED_SAFETY_DAILY_LIMIT_PRO = 10;
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
] as const;
const BASE_SUBSCRIPTION_SELECT =
  "subscription_tier, subscription_status, subscription_started_at, subscription_current_period_end, subscription_updated_at, toss_customer_key";
const OPTIONAL_SUBSCRIPTION_COLUMNS = [...OPTIONAL_CANCEL_COLUMNS, ...OPTIONAL_MED_SAFETY_COLUMNS] as const;
const FULL_SUBSCRIPTION_SELECT = `${BASE_SUBSCRIPTION_SELECT}, ${OPTIONAL_SUBSCRIPTION_COLUMNS.join(", ")}`;
const REFUND_REQUEST_SELECT = [
  "id",
  "user_id",
  "order_id",
  "reason",
  "status",
  "admin_note",
  "reviewed_by",
  "reviewed_at",
  "review_note",
  "executed_by",
  "executed_at",
  "cancel_amount",
  "currency",
  "toss_payment_key_snapshot",
  "toss_cancel_transaction_key",
  "gateway_response",
  "error_code",
  "error_message",
  "retry_count",
  "next_retry_at",
  "requested_at",
  "updated_at",
  "notified_at",
  "notify_user_sent_at",
].join(", ");
const OPEN_REFUND_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "EXECUTING", "FAILED_RETRYABLE", "PENDING"];
const OPTIONAL_BILLING_ORDER_COLUMNS = ["order_kind", "credit_pack_units"] as const;
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

  // PostgREST schema cache mismatch
  if (lower.includes("schema cache") && (code === "PGRST204" || message.includes("Could not find the"))) {
    return true;
  }

  // PostgreSQL unknown-column error (ex: "column wnl_users.xxx does not exist")
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
  const { error } = await admin.from("wnl_users").update(values).eq("user_id", userId);
  if (!error) return;

  if (!isOptionalSubscriptionColumnError(error)) {
    throw error;
  }

  const fallbackValues = stripOptionalSubscriptionColumns(values);
  if (Object.keys(fallbackValues).length === 0) {
    throw new Error("billing_schema_outdated_optional_columns");
  }

  const { error: fallbackError } = await admin.from("wnl_users").update(fallbackValues).eq("user_id", userId);
  if (fallbackError) throw fallbackError;
}

async function readUserSubscriptionRow(userId: string): Promise<{ data: any; supportsOptionalColumns: boolean }> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin.from("wnl_users").select(FULL_SUBSCRIPTION_SELECT).eq("user_id", userId).maybeSingle();
  if (!fullRes.error) {
    return {
      data: fullRes.data,
      supportsOptionalColumns: true,
    };
  }

  if (!isOptionalSubscriptionColumnError(fullRes.error)) {
    throw fullRes.error;
  }

  const fallbackRes = await admin.from("wnl_users").select(BASE_SUBSCRIPTION_SELECT).eq("user_id", userId).maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;

  return {
    data: fallbackRes.data,
    supportsOptionalColumns: false,
  };
}

function asPlanTier(value: unknown): PlanTier {
  if (value === "free") return "free";
  if (typeof value === "string" && value.trim()) return "pro";
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

function toKstDateISO(value: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MED_SAFETY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)) {
    return `${year}-${month}-${day}`;
  }
  return value.toISOString().slice(0, 10);
}

function sanitizeIsoDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return "";
}

function toNonNegativeInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(n));
}

function buildMedSafetyQuotaSnapshot(input: {
  hasPaidAccess: boolean;
  usageDate: string;
  dailyUsed: number;
  extraCredits: number;
}): MedSafetyQuotaSnapshot {
  const now = new Date();
  const today = toKstDateISO(now);
  const isToday = input.usageDate === today;
  const normalizedUsed = isToday ? toNonNegativeInt(input.dailyUsed) : 0;
  const normalizedExtra = toNonNegativeInt(input.extraCredits);
  const dailyRemaining = input.hasPaidAccess ? Math.max(0, MED_SAFETY_DAILY_LIMIT_PRO - normalizedUsed) : 0;
  const nextReset = new Date(now.getTime() + DAY_MS);
  return {
    timezone: MED_SAFETY_TIMEZONE,
    dailyLimit: MED_SAFETY_DAILY_LIMIT_PRO,
    dailyUsed: normalizedUsed,
    dailyRemaining,
    extraCredits: normalizedExtra,
    totalRemaining: dailyRemaining + normalizedExtra,
    usageDate: today,
    nextResetAt: toKstDateISO(nextReset),
    isPro: input.hasPaidAccess,
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

function inferOrderKindFromLegacyFields(row: any): BillingOrderKind {
  if (row && Object.prototype.hasOwnProperty.call(row, "order_kind")) {
    return asOrderKind(row?.order_kind);
  }
  const orderId = String(row?.order_id ?? "").toLowerCase();
  const orderName = String(row?.order_name ?? "").toLowerCase();
  if (/(^|_)credit(?:10)?(_|$)/.test(orderId)) return "credit_pack";
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
  if (String(row?.order_id ?? "").toLowerCase().includes("credit10")) return 10;
  return 10;
}

function toBillingOrderSummary(row: any): BillingOrderSummary {
  const orderKind = inferOrderKindFromLegacyFields(row);
  const creditPackUnits = inferCreditPackUnitsFromLegacyFields(row, orderKind);
  return {
    orderId: row?.order_id ?? "",
    userId: row?.user_id ?? undefined,
    planTier: asPlanTier(row?.plan_tier),
    orderKind,
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

function asRefundRequestStatus(value: unknown): BillingRefundRequestStatus {
  if (value === "REQUESTED") return "REQUESTED";
  if (value === "UNDER_REVIEW") return "UNDER_REVIEW";
  if (value === "APPROVED") return "APPROVED";
  if (value === "REJECTED") return "REJECTED";
  if (value === "EXECUTING") return "EXECUTING";
  if (value === "REFUNDED") return "REFUNDED";
  if (value === "FAILED_RETRYABLE") return "FAILED_RETRYABLE";
  if (value === "FAILED_FINAL") return "FAILED_FINAL";
  if (value === "WITHDRAWN") return "WITHDRAWN";
  if (value === "PENDING") return "REQUESTED";
  if (value === "CANCELED") return "WITHDRAWN";
  return "REQUESTED";
}

function sanitizeRefundReason(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "사용자 요청";
  return text.slice(0, 500);
}

function sanitizeShortText(value: unknown, limit = 220) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, limit);
}

function toRefundAmount(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function toRefundRequestSummary(row: any): BillingRefundRequestSummary {
  return {
    id: Number(row?.id ?? 0),
    userId: String(row?.user_id ?? ""),
    orderId: String(row?.order_id ?? ""),
    reason: sanitizeRefundReason(row?.reason),
    status: asRefundRequestStatus(row?.status),
    adminNote: row?.admin_note ?? null,
    reviewedBy: row?.reviewed_by ?? null,
    reviewedAt: row?.reviewed_at ?? null,
    reviewNote: row?.review_note ?? null,
    executedBy: row?.executed_by ?? null,
    executedAt: row?.executed_at ?? null,
    cancelAmount: toRefundAmount(row?.cancel_amount),
    currency: String(row?.currency ?? "KRW"),
    tossPaymentKeySnapshot: row?.toss_payment_key_snapshot ?? null,
    tossCancelTransactionKey: row?.toss_cancel_transaction_key ?? null,
    gatewayResponse: (row?.gateway_response ?? null) as Json | null,
    errorCode: row?.error_code ?? null,
    errorMessage: row?.error_message ?? null,
    retryCount: Number(row?.retry_count ?? 0),
    nextRetryAt: row?.next_retry_at ?? null,
    requestedAt: row?.requested_at ?? null,
    updatedAt: row?.updated_at ?? null,
    notifiedAt: row?.notified_at ?? null,
    notifyUserSentAt: row?.notify_user_sent_at ?? null,
  };
}

function asRefundActorRole(value: unknown): "user" | "admin" | "system" {
  if (value === "user" || value === "admin") return value;
  return "system";
}

function toRefundEventSummary(row: any): BillingRefundEventSummary {
  return {
    id: Number(row?.id ?? 0),
    requestId: Number(row?.request_id ?? 0),
    userId: String(row?.user_id ?? ""),
    orderId: String(row?.order_id ?? ""),
    actorUserId: row?.actor_user_id ?? null,
    actorRole: asRefundActorRole(row?.actor_role),
    eventType: String(row?.event_type ?? ""),
    fromStatus: row?.from_status ?? null,
    toStatus: row?.to_status ?? null,
    message: row?.message ?? null,
    metadata: (row?.metadata ?? null) as Json | null,
    createdAt: row?.created_at ?? null,
  };
}

async function appendRefundEvent(input: {
  requestId: number;
  userId: string;
  orderId: string;
  actorUserId?: string | null;
  actorRole: "user" | "admin" | "system";
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  message?: string | null;
  metadata?: Json | null;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("billing_refund_events").insert({
    request_id: input.requestId,
    user_id: input.userId,
    order_id: input.orderId,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole,
    event_type: input.eventType.slice(0, 80),
    from_status: sanitizeShortText(input.fromStatus, 40),
    to_status: sanitizeShortText(input.toStatus, 40),
    message: sanitizeShortText(input.message, 500),
    metadata: (input.metadata ?? null) as Json | null,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function transitionRefundRequestStatus(input: {
  requestId: number;
  expectedStatuses: string[];
  toStatus: BillingRefundRequestStatus;
  actorRole: "user" | "admin" | "system";
  actorUserId?: string | null;
  eventType: string;
  message?: string | null;
  metadata?: Json | null;
  patch?: Record<string, unknown>;
}): Promise<BillingRefundRequestSummary> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const current = await readRefundRequestById(input.requestId);
  if (!current) throw new Error("refund_request_not_found");
  if (!input.expectedStatuses.includes(current.status)) {
    if (current.status === input.toStatus) return current;
    throw new Error(`invalid_refund_request_state:${current.status}`);
  }

  const payload = {
    status: input.toStatus,
    updated_at: nowIso,
    ...input.patch,
  } as Record<string, unknown>;

  const { data, error } = await admin
    .from("billing_refund_requests")
    .update(payload)
    .eq("id", input.requestId)
    .in("status", input.expectedStatuses)
    .select(REFUND_REQUEST_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const latest = await readRefundRequestById(input.requestId);
    if (latest && latest.status === input.toStatus) return latest;
    throw new Error("refund_request_conflict");
  }

  const next = toRefundRequestSummary(data);
  await appendRefundEvent({
    requestId: next.id,
    userId: next.userId,
    orderId: next.orderId,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    fromStatus: current.status,
    toStatus: next.status,
    message: input.message ?? null,
    metadata: input.metadata ?? null,
  });
  return next;
}

export async function readRefundRequestById(id: number): Promise<BillingRefundRequestSummary | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_refund_requests")
    .select(REFUND_REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toRefundRequestSummary(data);
}

export async function listRefundRequestsForUser(userId: string, limit = 20): Promise<BillingRefundRequestSummary[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_refund_requests")
    .select(REFUND_REQUEST_SELECT)
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.round(limit))));
  if (error) throw error;
  return (data ?? []).map((row) => toRefundRequestSummary(row));
}

export async function listRefundRequestsForAdmin(input?: {
  status?: string | null;
  userId?: string | null;
  limit?: number;
}): Promise<BillingRefundRequestSummary[]> {
  const admin = getSupabaseAdmin();
  const limit = Math.max(1, Math.min(200, Math.round(input?.limit ?? 50)));

  let query = admin
    .from("billing_refund_requests")
    .select(REFUND_REQUEST_SELECT)
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (input?.status) {
    query = query.eq("status", String(input.status).trim().toUpperCase());
  }
  if (input?.userId) {
    query = query.eq("user_id", String(input.userId).trim());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => toRefundRequestSummary(row));
}

export async function listRefundEventsByRequestId(requestId: number, limit = 50): Promise<BillingRefundEventSummary[]> {
  if (!Number.isInteger(requestId) || requestId <= 0) return [];
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_refund_events")
    .select("id, request_id, user_id, order_id, actor_user_id, actor_role, event_type, from_status, to_status, message, metadata, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Math.round(limit))));
  if (error) throw error;
  return (data ?? []).map((row) => toRefundEventSummary(row));
}

async function readLatestPaidDoneOrder(userId: string): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_WITH_OPTIONAL)
    .eq("user_id", userId)
    .eq("status", "DONE")
    .eq("plan_tier", "pro")
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
    .eq("plan_tier", "pro")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data) return null;
  const summary = toBillingOrderSummary(fallbackRes.data);
  return summary.orderKind === "subscription" ? summary : null;
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
  if (latestPaid.planTier !== "pro") return null;

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
  await updateUserWithOptionalSubscriptionFallback(userId, {
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
  const medSafetyExtraCredits = toNonNegativeInt(data?.med_safety_extra_credits, 0);
  const medSafetyDailyUsedRaw = toNonNegativeInt(data?.med_safety_daily_used, 0);
  const medSafetyUsageDate = sanitizeIsoDate(data?.med_safety_usage_date);

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

  const hasPaidAccess = hasPaidAccessFromSnapshot({ tier, status, currentPeriodEnd });
  const medSafetyQuota = buildMedSafetyQuotaSnapshot({
    hasPaidAccess,
    usageDate: medSafetyUsageDate,
    dailyUsed: medSafetyDailyUsedRaw,
    extraCredits: medSafetyExtraCredits,
  });

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
    hasPaidAccess,
    medSafetyQuota,
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

function isMissingMedSafetyCreditColumnError(error: any) {
  return OPTIONAL_MED_SAFETY_COLUMNS.some((column) => isSchemaCacheMissingColumnError(error, column));
}

async function readMedSafetyCreditRow(userId: string): Promise<{
  extraCredits: number;
  dailyUsed: number;
  usageDate: string;
}> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("wnl_users")
    .select("med_safety_extra_credits, med_safety_daily_used, med_safety_usage_date")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingMedSafetyCreditColumnError(error)) {
      throw new Error("med_safety_credit_columns_missing");
    }
    throw error;
  }
  return {
    extraCredits: toNonNegativeInt(data?.med_safety_extra_credits, 0),
    dailyUsed: toNonNegativeInt(data?.med_safety_daily_used, 0),
    usageDate: sanitizeIsoDate(data?.med_safety_usage_date),
  };
}

export async function addMedSafetyExtraCredits(input: {
  userId: string;
  credits: number;
  nowIso?: string;
}): Promise<SubscriptionSnapshot> {
  const credits = Math.max(0, Math.round(input.credits));
  if (credits <= 0) return readSubscription(input.userId);
  await ensureUserRow(input.userId);

  const admin = getSupabaseAdmin();
  const nowIso = input.nowIso ?? new Date().toISOString();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await readMedSafetyCreditRow(input.userId);
    const nextExtra = row.extraCredits + credits;
    const { data, error } = await admin
      .from("wnl_users")
      .update({
        med_safety_extra_credits: nextExtra,
        last_seen: nowIso,
      })
      .eq("user_id", input.userId)
      .eq("med_safety_extra_credits", row.extraCredits)
      .select("user_id")
      .maybeSingle();
    if (error) {
      if (isMissingMedSafetyCreditColumnError(error)) {
        throw new Error("med_safety_credit_columns_missing");
      }
      throw error;
    }
    if (data) return readSubscription(input.userId, { skipReconcile: true });
  }

  throw new Error("med_safety_credit_race_retry_exceeded");
}

export async function consumeMedSafetyCredit(input: {
  userId: string;
}): Promise<MedSafetyCreditConsumeResult> {
  await ensureUserRow(input.userId);
  const admin = getSupabaseAdmin();
  const subscription = await readSubscription(input.userId);
  const hasPaidAccess = subscription.hasPaidAccess;
  const today = toKstDateISO(new Date());
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await readMedSafetyCreditRow(input.userId);
    const usedToday = row.usageDate === today ? row.dailyUsed : 0;
    const extraCredits = row.extraCredits;

    let source: MedSafetyCreditSource | null = null;
    let nextDailyUsed = usedToday;
    let nextExtra = extraCredits;

    if (hasPaidAccess && usedToday < MED_SAFETY_DAILY_LIMIT_PRO) {
      source = "daily";
      nextDailyUsed = usedToday + 1;
    } else if (extraCredits > 0) {
      source = "extra";
      nextExtra = extraCredits - 1;
    } else {
      return {
        allowed: false,
        source: null,
        reason: "insufficient_med_safety_credits",
        quota: buildMedSafetyQuotaSnapshot({
          hasPaidAccess,
          usageDate: today,
          dailyUsed: usedToday,
          extraCredits,
        }),
      };
    }

    const { data, error } = await admin
      .from("wnl_users")
      .update({
        med_safety_usage_date: today,
        med_safety_daily_used: nextDailyUsed,
        med_safety_extra_credits: nextExtra,
        last_seen: nowIso,
      })
      .eq("user_id", input.userId)
      .eq("med_safety_daily_used", row.dailyUsed)
      .eq("med_safety_extra_credits", row.extraCredits)
      .select("user_id")
      .maybeSingle();
    if (error) {
      if (isMissingMedSafetyCreditColumnError(error)) {
        throw new Error("med_safety_credit_columns_missing");
      }
      throw error;
    }
    if (!data) continue;

    return {
      allowed: true,
      source,
      reason: null,
      quota: buildMedSafetyQuotaSnapshot({
        hasPaidAccess,
        usageDate: today,
        dailyUsed: nextDailyUsed,
        extraCredits: nextExtra,
      }),
    };
  }

  throw new Error("med_safety_credit_race_retry_exceeded");
}

export async function restoreConsumedMedSafetyCredit(input: {
  userId: string;
  source: MedSafetyCreditSource;
}): Promise<void> {
  await ensureUserRow(input.userId);
  const admin = getSupabaseAdmin();
  const today = toKstDateISO(new Date());

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await readMedSafetyCreditRow(input.userId);
    const usedToday = row.usageDate === today ? row.dailyUsed : 0;
    const extraCredits = row.extraCredits;
    const nextDailyUsed = input.source === "daily" ? Math.max(0, usedToday - 1) : usedToday;
    const nextExtra = input.source === "extra" ? extraCredits + 1 : extraCredits;
    const nextUsageDate = row.usageDate || today;

    const { data, error } = await admin
      .from("wnl_users")
      .update({
        med_safety_usage_date: nextUsageDate,
        med_safety_daily_used: nextDailyUsed,
        med_safety_extra_credits: nextExtra,
      })
      .eq("user_id", input.userId)
      .eq("med_safety_daily_used", row.dailyUsed)
      .eq("med_safety_extra_credits", row.extraCredits)
      .select("user_id")
      .maybeSingle();

    if (error) {
      if (isMissingMedSafetyCreditColumnError(error)) return;
      throw error;
    }
    if (data) return;
  }
}

export type BillingPurchaseSummary = {
  totalPaidAmount: number;
  subscriptionPaidAmount: number;
  creditPaidAmount: number;
  creditPurchasedUnits: number;
};

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

export async function createBillingOrder(input: {
  userId: string;
  orderId: string;
  planTier: Exclude<PlanTier, "free">;
  orderKind?: BillingOrderKind;
  creditPackUnits?: number;
  amount: number;
  currency?: string;
  orderName?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const plan = getPlanDefinition(input.planTier);
  const orderKind: BillingOrderKind = input.orderKind === "credit_pack" ? "credit_pack" : "subscription";
  const creditPackUnits = orderKind === "credit_pack" ? Math.max(1, toNonNegativeInt(input.creditPackUnits, 10)) : 0;

  await ensureUserRow(input.userId);

  const baseUserUpdate: Record<string, unknown> = {
    toss_customer_key: createCustomerKey(input.userId),
    toss_last_order_id: input.orderId,
    last_seen: now,
  };
  if (orderKind === "subscription") {
    baseUserUpdate.subscription_cancel_at_period_end = false;
    baseUserUpdate.subscription_cancel_scheduled_at = null;
    baseUserUpdate.subscription_cancel_reason = null;
  }
  await updateUserWithOptionalSubscriptionFallback(input.userId, baseUserUpdate);

  const fullInsert = await admin.from("billing_orders").insert({
    order_id: input.orderId,
    user_id: input.userId,
    plan_tier: input.planTier,
    order_kind: orderKind,
    credit_pack_units: creditPackUnits,
    amount: Math.round(input.amount),
    currency: input.currency ?? "KRW",
    status: "READY",
    order_name: input.orderName ?? plan.orderName,
    created_at: now,
    updated_at: now,
  });
  if (!fullInsert.error) return;
  if (!isOptionalBillingOrderColumnError(fullInsert.error)) throw fullInsert.error;
  if (orderKind === "credit_pack") {
    throw new Error("billing_schema_outdated_credit_pack_columns");
  }

  const fallbackInsert = await admin.from("billing_orders").insert({
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
  if (fallbackInsert.error) throw fallbackInsert.error;
}

export async function readBillingOrderByOrderId(input: {
  userId: string;
  orderId: string;
}): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_WITH_OPTIONAL)
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!fullRes.error) {
    if (!fullRes.data) return null;
    return toBillingOrderSummary(fullRes.data);
  }
  if (!isOptionalBillingOrderColumnError(fullRes.error)) throw fullRes.error;

  const fallbackRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_BASE)
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data) return null;
  return toBillingOrderSummary(fallbackRes.data);
}

export async function readBillingOrderByOrderIdAny(orderId: string): Promise<BillingOrderSummary | null> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_WITH_OPTIONAL)
    .eq("order_id", orderId)
    .maybeSingle();
  if (!fullRes.error) {
    if (!fullRes.data) return null;
    return toBillingOrderSummary(fullRes.data);
  }
  if (!isOptionalBillingOrderColumnError(fullRes.error)) throw fullRes.error;
  const fallbackRes = await admin.from("billing_orders").select(BILLING_ORDER_SELECT_BASE).eq("order_id", orderId).maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data) return null;
  return toBillingOrderSummary(fallbackRes.data);
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

export async function removeUnsettledBillingOrder(input: {
  userId: string;
  orderId: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("billing_orders")
    .delete()
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .neq("status", "DONE");
  if (error) throw error;
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
  const fullRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_WITH_OPTIONAL)
    .eq("user_id", userId)
    .eq("status", "DONE")
    .eq("order_kind", "subscription")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!fullRes.error) {
    if (!fullRes.data) return null;
    return toBillingOrderSummary(fullRes.data);
  }
  if (!isOptionalBillingOrderColumnError(fullRes.error)) throw fullRes.error;
  const fallbackRes = await admin
    .from("billing_orders")
    .select(BILLING_ORDER_SELECT_BASE)
    .eq("user_id", userId)
    .eq("status", "DONE")
    .eq("plan_tier", "pro")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallbackRes.error) throw fallbackRes.error;
  if (!fallbackRes.data) return null;
  const summary = toBillingOrderSummary(fallbackRes.data);
  return summary.orderKind === "subscription" ? summary : null;
}

export async function readPendingRefundRequestByOrder(input: {
  userId: string;
  orderId: string;
}): Promise<BillingRefundRequestSummary | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_refund_requests")
    .select(REFUND_REQUEST_SELECT)
    .eq("user_id", input.userId)
    .eq("order_id", input.orderId)
    .in("status", OPEN_REFUND_STATUSES)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toRefundRequestSummary(data);
}

export async function createRefundRequest(input: {
  userId: string;
  orderId: string;
  reason: string;
  cancelAmount?: number | null;
  currency?: string | null;
  paymentKeySnapshot?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const cancelAmount = toRefundAmount(input.cancelAmount);
  const currency = sanitizeShortText(input.currency, 12) ?? "KRW";
  const paymentKeySnapshot = sanitizeShortText(input.paymentKeySnapshot, 220);
  const { data, error } = await admin
    .from("billing_refund_requests")
    .insert({
      user_id: input.userId,
      order_id: input.orderId,
      reason: sanitizeRefundReason(input.reason),
      status: "REQUESTED",
      cancel_amount: cancelAmount,
      currency,
      toss_payment_key_snapshot: paymentKeySnapshot,
      requested_at: nowIso,
      updated_at: nowIso,
    })
    .select(REFUND_REQUEST_SELECT)
    .single();
  if (error) {
    if (String((error as any)?.code ?? "") === "23505") {
      const existing = await readPendingRefundRequestByOrder({
        userId: input.userId,
        orderId: input.orderId,
      });
      if (existing) return existing;
    }
    throw error;
  }
  const created = toRefundRequestSummary(data);
  await appendRefundEvent({
    requestId: created.id,
    userId: created.userId,
    orderId: created.orderId,
    actorRole: "user",
    actorUserId: created.userId,
    eventType: "refund.requested",
    fromStatus: null,
    toStatus: created.status,
    message: "환불 요청이 접수되었습니다.",
    metadata: {
      reason: created.reason,
      cancelAmount: created.cancelAmount,
      currency: created.currency,
    },
  });
  return created;
}

export async function markRefundRequestNotified(input: { id: number }): Promise<void> {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const current = await readRefundRequestById(input.id);
  if (!current) throw new Error("refund_request_not_found");
  const { error } = await admin
    .from("billing_refund_requests")
    .update({
      notified_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.id);
  if (error) throw error;
  await appendRefundEvent({
    requestId: current.id,
    userId: current.userId,
    orderId: current.orderId,
    actorRole: "system",
    eventType: "refund.admin_notified",
    fromStatus: current.status,
    toStatus: current.status,
    message: "관리자 알림 메일이 발송되었습니다.",
  });
}

export async function approveRefundRequest(input: {
  id: number;
  adminUserId: string;
  note?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const note = sanitizeShortText(input.note, 500);
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["REQUESTED", "UNDER_REVIEW", "FAILED_RETRYABLE", "PENDING"],
    toStatus: "APPROVED",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    eventType: "refund.approved",
    message: note ?? "환불 요청 승인",
    patch: {
      reviewed_by: input.adminUserId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
      admin_note: note,
      error_code: null,
      error_message: null,
      next_retry_at: null,
    },
  });
}

export async function markRefundRequestUnderReview(input: {
  id: number;
  adminUserId: string;
  note?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const note = sanitizeShortText(input.note, 500);
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["REQUESTED", "FAILED_RETRYABLE"],
    toStatus: "UNDER_REVIEW",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    eventType: "refund.under_review",
    message: note ?? "환불 요청 검토 시작",
    patch: {
      reviewed_by: input.adminUserId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
      admin_note: note,
    },
  });
}

export async function rejectRefundRequest(input: {
  id: number;
  adminUserId: string;
  reason: string;
  note?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const reason = sanitizeRefundReason(input.reason);
  const note = sanitizeShortText(input.note, 500);
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "FAILED_RETRYABLE", "PENDING"],
    toStatus: "REJECTED",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    eventType: "refund.rejected",
    message: reason,
    metadata: {
      reason,
    },
    patch: {
      reviewed_by: input.adminUserId,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? reason,
      admin_note: note ?? reason,
      error_code: null,
      error_message: null,
      next_retry_at: null,
    },
  });
}

export async function markRefundRequestExecuting(input: {
  id: number;
  adminUserId: string;
  note?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const note = sanitizeShortText(input.note, 500);
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["APPROVED", "FAILED_RETRYABLE"],
    toStatus: "EXECUTING",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    eventType: "refund.executing",
    message: note ?? "환불 실행 시작",
    patch: {
      executed_by: input.adminUserId,
      executed_at: new Date().toISOString(),
      admin_note: note,
      next_retry_at: null,
    },
  });
}

export async function markRefundRequestRefunded(input: {
  id: number;
  adminUserId: string;
  transactionKey?: string | null;
  gatewayResponse?: Json | null;
  note?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const note = sanitizeShortText(input.note, 500);
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["EXECUTING", "APPROVED"],
    toStatus: "REFUNDED",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    eventType: "refund.refunded",
    message: note ?? "환불 처리 완료",
    metadata: {
      transactionKey: sanitizeShortText(input.transactionKey, 220),
    },
    patch: {
      toss_cancel_transaction_key: sanitizeShortText(input.transactionKey, 220),
      gateway_response: (input.gatewayResponse ?? null) as Json | null,
      error_code: null,
      error_message: null,
      next_retry_at: null,
      admin_note: note,
      executed_by: input.adminUserId,
      executed_at: new Date().toISOString(),
    },
  });
}

export async function markRefundRequestRefundedBySystem(input: {
  id: number;
  reason?: string | null;
  transactionKey?: string | null;
  gatewayResponse?: Json | null;
}): Promise<BillingRefundRequestSummary> {
  const reason = sanitizeShortText(input.reason, 500) ?? "Webhook cancel sync";
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "EXECUTING", "FAILED_RETRYABLE", "PENDING"],
    toStatus: "REFUNDED",
    actorRole: "system",
    actorUserId: null,
    eventType: "refund.refunded_by_webhook",
    message: reason,
    metadata: {
      transactionKey: sanitizeShortText(input.transactionKey, 220),
    },
    patch: {
      toss_cancel_transaction_key: sanitizeShortText(input.transactionKey, 220),
      gateway_response: (input.gatewayResponse ?? null) as Json | null,
      error_code: null,
      error_message: null,
      next_retry_at: null,
      admin_note: reason,
      executed_by: "system:webhook",
      executed_at: new Date().toISOString(),
    },
  });
}

export async function markRefundRequestFailed(input: {
  id: number;
  adminUserId: string;
  code: string;
  message: string;
  retryable: boolean;
  gatewayResponse?: Json | null;
}): Promise<BillingRefundRequestSummary> {
  const current = await readRefundRequestById(input.id);
  if (!current) throw new Error("refund_request_not_found");

  const retryCount = Math.max(0, current.retryCount) + 1;
  const nextRetryAt = input.retryable ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  return transitionRefundRequestStatus({
    requestId: input.id,
    expectedStatuses: ["EXECUTING", "APPROVED", "FAILED_RETRYABLE"],
    toStatus: input.retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL",
    actorRole: "admin",
    actorUserId: input.adminUserId,
    eventType: input.retryable ? "refund.failed_retryable" : "refund.failed_final",
    message: sanitizeShortText(input.message, 500) ?? "환불 처리 실패",
    metadata: {
      code: sanitizeShortText(input.code, 120),
      retryCount,
    },
    patch: {
      error_code: sanitizeShortText(input.code, 120),
      error_message: sanitizeShortText(input.message, 500),
      gateway_response: (input.gatewayResponse ?? null) as Json | null,
      retry_count: retryCount,
      next_retry_at: nextRetryAt,
      admin_note: sanitizeShortText(input.message, 500),
      executed_by: input.adminUserId,
      executed_at: new Date().toISOString(),
    },
  });
}

export async function withdrawRefundRequestByUser(input: {
  id: number;
  userId: string;
  note?: string | null;
}): Promise<BillingRefundRequestSummary> {
  const admin = getSupabaseAdmin();
  const current = await readRefundRequestById(input.id);
  if (!current) throw new Error("refund_request_not_found");
  if (current.userId !== input.userId) throw new Error("refund_request_forbidden");
  if (!["REQUESTED", "PENDING"].includes(current.status)) {
    throw new Error(`invalid_refund_request_state:${current.status}`);
  }

  const note = sanitizeShortText(input.note, 500) ?? "사용자 요청 철회";
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("billing_refund_requests")
    .delete()
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .in("status", ["REQUESTED", "PENDING"])
    .select(REFUND_REQUEST_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const latest = await readRefundRequestById(input.id);
    if (!latest) throw new Error("refund_request_not_found");
    if (latest.userId !== input.userId) throw new Error("refund_request_forbidden");
    throw new Error("refund_request_conflict");
  }

  const removed = toRefundRequestSummary(data);
  return {
    ...removed,
    status: "WITHDRAWN",
    adminNote: note,
    updatedAt: nowIso,
  };
}

export async function listDueRetryableRefundRequests(limit = 20): Promise<BillingRefundRequestSummary[]> {
  const admin = getSupabaseAdmin();
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
  const { data, error } = await admin
    .from("billing_refund_requests")
    .select(REFUND_REQUEST_SELECT)
    .eq("status", "FAILED_RETRYABLE")
    .order("next_retry_at", { ascending: true, nullsFirst: true })
    .limit(safeLimit);
  if (error) throw error;

  const now = Date.now();
  return (data ?? [])
    .map((row) => toRefundRequestSummary(row))
    .filter((row) => {
      if (!row.nextRetryAt) return true;
      const next = parseDate(row.nextRetryAt);
      return Boolean(next && next.getTime() <= now);
    });
}

export async function scheduleSubscriptionCancelAtPeriodEnd(input: {
  userId: string;
  reason?: string | null;
}): Promise<SubscriptionSnapshot> {
  const current = await readSubscription(input.userId);
  if (!current.hasPaidAccess) throw new Error("no_active_paid_subscription");

  const nowIso = new Date().toISOString();
  await updateUserWithOptionalSubscriptionFallback(input.userId, {
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
  await updateUserWithOptionalSubscriptionFallback(input.userId, {
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
  await updateUserWithOptionalSubscriptionFallback(input.userId, {
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

  const fullOrderRes = await admin
    .from("billing_orders")
    .select("order_id, user_id, plan_tier, order_name, order_kind, credit_pack_units, amount, status")
    .eq("order_id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (fullOrderRes.error && !isOptionalBillingOrderColumnError(fullOrderRes.error)) throw fullOrderRes.error;
  let order: any = fullOrderRes.data;
  if (fullOrderRes.error && isOptionalBillingOrderColumnError(fullOrderRes.error)) {
    const fallbackOrderRes = await admin
      .from("billing_orders")
      .select("order_id, user_id, plan_tier, order_name, amount, status")
      .eq("order_id", input.orderId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (fallbackOrderRes.error) throw fallbackOrderRes.error;
    order = fallbackOrderRes.data;
  }
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

  const now = new Date();
  const nowIso = now.toISOString();
  const orderKind = inferOrderKindFromLegacyFields(order);
  const paidPlanTier = asPlanTier(order.plan_tier);
  const creditPackUnits = inferCreditPackUnitsFromLegacyFields(order, orderKind);
  if (orderKind === "subscription" && paidPlanTier === "free") {
    throw new Error("invalid_plan");
  }
  if (orderKind === "credit_pack" && creditPackUnits <= 0) {
    throw new Error("invalid_credit_pack_units");
  }

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

  if (orderKind === "credit_pack") {
    await addMedSafetyExtraCredits({
      userId: input.userId,
      credits: creditPackUnits,
      nowIso,
    });
    return readSubscription(input.userId, { skipReconcile: true });
  }

  const plan = getPlanDefinition(paidPlanTier);
  const current = await readSubscription(input.userId, { skipReconcile: true });
  const currentEnd = parseDate(current.currentPeriodEnd);
  const isSamePlan = current.tier === paidPlanTier;
  const hasRemaining = Boolean(currentEnd && Number.isFinite(currentEnd.getTime()) && currentEnd.getTime() > now.getTime());
  const baseDate = isSamePlan && hasRemaining && currentEnd ? currentEnd : now;
  const nextEnd = new Date(baseDate.getTime() + plan.periodDays * DAY_MS);
  const startedAt = isSamePlan && current.startedAt ? current.startedAt : nowIso;

  await updateUserWithOptionalSubscriptionFallback(input.userId, {
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
