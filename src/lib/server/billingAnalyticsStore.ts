import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { PlanTier, SearchCreditType } from "@/lib/billing/plans";
import type { Json } from "@/types/supabase";

const DAY_MS = 24 * 60 * 60 * 1000;

type BillingAnalyticsEventRow = {
  user_id: string;
  event_name: string;
  plan_tier_snapshot: string | null;
  props: Json | null;
  created_at: string | null;
};

type BillingOrderRow = {
  user_id: string;
  plan_tier: string;
  order_kind: string;
  product_id?: string | null;
  credit_type?: string | null;
  order_id: string;
  order_name: string;
  amount: number;
  status: string;
  approved_at: string | null;
  created_at: string | null;
};

type MedSafetyUsageEventRow = {
  user_id: string;
  source: string;
  delta: number;
  reason: string;
  metadata: Json | null;
  created_at: string | null;
};

type UserRow = {
  user_id: string;
  subscription_tier: string;
};

export type AdminAIBillingSummary = {
  periodDays: number;
  userCounts: Record<PlanTier, number>;
  usage: {
    plusStandardSearchUses: number;
    plusPremiumSearchUses: number;
    burnRate: Record<SearchCreditType, { consumed: number; granted: number; burnRatePct: number }>;
  };
  purchases: {
    freeCreditPurchaseUsers: number;
    plusPremiumPurchaseUsers: number;
    plusPremiumPurchaseRatePct: number;
    plusPremiumToProConversionRatePct: number;
    proPremiumExtraPurchaseUsers: number;
    proPremiumExtraPurchaseRatePct: number;
    proStandardPurchaseUsers: number;
    proStandardPurchaseRatePct: number;
  };
  revenue: {
    revenueByPlan: Record<PlanTier, number>;
    arpuByPlan: Record<PlanTier, number>;
  };
  conversion: {
    planPaymentConversionRatePct: { plus: number; pro: number };
    creditPackPaymentConversionRatePct: number;
    upsellViewCount: number;
    upsellClickCount: number;
    upsellConversionRatePct: number;
  };
  quality: {
    officialCitationRate: number;
    unsupportedClaimRate: number;
    verificationFailRate: number;
    groundingMissRate: number;
    highRiskQueryShare: number;
    totalResults: number;
  };
};

function asPlanTier(value: unknown): PlanTier {
  return value === "plus" || value === "pro" ? value : "free";
}

function asSearchCreditType(value: unknown): SearchCreditType | null {
  return value === "premium" ? "premium" : value === "standard" ? "standard" : null;
}

function toRatePct(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getOrderTimestampMs(row: Pick<BillingOrderRow, "approved_at" | "created_at">) {
  return parseDate(row.approved_at ?? row.created_at)?.getTime() ?? 0;
}

function readJsonRecord(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : null;
}

function inferProductId(row: BillingOrderRow): string | null {
  if (row.product_id) return row.product_id;
  const orderId = String(row.order_id ?? "").toLowerCase();
  const orderName = String(row.order_name ?? "").toLowerCase();
  if (orderId.includes("premium30") || /premium.+30|프리미엄.+30/.test(orderName)) return "premium30";
  if (orderId.includes("premium10") || /premium.+10|프리미엄.+10/.test(orderName)) return "premium10";
  if (orderId.includes("standard30")) return "standard30";
  if (orderId.includes("standard10")) return "standard10";
  if (orderId.includes("credit30")) return "standard30";
  if (orderId.includes("credit10")) return "standard10";
  if (orderId.includes("plus")) return "plus";
  if (orderId.includes("pro")) return "pro";
  return null;
}

function inferCreditType(row: BillingOrderRow): SearchCreditType | null {
  if (row.credit_type === "standard" || row.credit_type === "premium") return row.credit_type;
  const productId = inferProductId(row);
  if (productId?.startsWith("premium")) return "premium";
  if (productId?.startsWith("standard")) return "standard";
  return null;
}

function readUsageMeta(row: MedSafetyUsageEventRow) {
  const metadata = readJsonRecord(row.metadata);
  return {
    eventType: String(metadata?.eventType ?? ""),
    searchType: asSearchCreditType(metadata?.searchType),
    planTierSnapshot: asPlanTier(metadata?.planTierSnapshot),
  };
}

function isMissingTable(error: any, table: string) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  if (code === "42P01" || code === "42703") return true;
  return message.includes(table);
}

async function readAnalyticsEvents(sinceIso: string): Promise<BillingAnalyticsEventRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("billing_analytics_events")
    .select("user_id, event_name, plan_tier_snapshot, props, created_at")
    .gte("created_at", sinceIso);
  if (error) {
    if (isMissingTable(error, "billing_analytics_events")) return [];
    throw error;
  }
  return (data ?? []) as BillingAnalyticsEventRow[];
}

async function readUsageEvents(sinceIso: string): Promise<MedSafetyUsageEventRow[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("med_safety_usage_events")
    .select("user_id, source, delta, reason, metadata, created_at")
    .gte("created_at", sinceIso);
  if (error) {
    if (isMissingTable(error, "med_safety_usage_events")) return [];
    throw error;
  }
  return (data ?? []) as MedSafetyUsageEventRow[];
}

async function readBillingOrdersForAnalytics(sinceIso: string): Promise<BillingOrderRow[]> {
  const admin = getSupabaseAdmin();
  const fullRes = await admin
    .from("billing_orders")
    .select("user_id, plan_tier, order_kind, product_id, credit_type, order_id, order_name, amount, status, approved_at, created_at")
    .gte("created_at", sinceIso);
  if (!fullRes.error) return (fullRes.data ?? []) as BillingOrderRow[];
  if (!isMissingTable(fullRes.error, "product_id") && !isMissingTable(fullRes.error, "credit_type")) throw fullRes.error;

  const fallbackRes = await admin
    .from("billing_orders")
    .select("user_id, plan_tier, order_kind, order_id, order_name, amount, status, approved_at, created_at")
    .gte("created_at", sinceIso);
  if (fallbackRes.error) throw fallbackRes.error;
  return (fallbackRes.data ?? []) as BillingOrderRow[];
}

export async function readAdminAIBillingSummary(rangeDays = 30): Promise<AdminAIBillingSummary> {
  const safeRangeDays = Math.max(7, Math.min(180, Math.round(rangeDays)));
  const sinceIso = new Date(Date.now() - safeRangeDays * DAY_MS).toISOString();
  const conversionWindowIso = new Date(Date.now() - Math.max(safeRangeDays, 60) * DAY_MS).toISOString();
  const sinceMs = parseDate(sinceIso)?.getTime() ?? Date.now() - safeRangeDays * DAY_MS;
  const admin = getSupabaseAdmin();

  const [usersRes, ordersRes, usageEvents, analyticsEvents, qualitySummary] = await Promise.all([
    admin.from("rnest_users").select("user_id, subscription_tier"),
    readBillingOrdersForAnalytics(conversionWindowIso),
    readUsageEvents(sinceIso),
    readAnalyticsEvents(sinceIso),
    import("@/lib/server/medSafetySearchResultStore")
      .then((module) => module.readMedSafetySearchQualitySummary(safeRangeDays))
      .catch(() => ({
        officialCitationRate: 0,
        unsupportedClaimRate: 0,
        verificationFailRate: 0,
        groundingMissRate: 0,
        highRiskQueryShare: 0,
        totalResults: 0,
      })),
  ]);

  if (usersRes.error) throw usersRes.error;

  const users = (usersRes.data ?? []) as UserRow[];
  const orders = (ordersRes as BillingOrderRow[]).filter((row) => row.status === "DONE");
  const ordersInRange = orders.filter((row) => getOrderTimestampMs(row) >= sinceMs);
  const userCounts: Record<PlanTier, number> = { free: 0, plus: 0, pro: 0 };
  for (const user of users) {
    userCounts[asPlanTier(user.subscription_tier)] += 1;
  }

  const plusPremiumPurchasers = new Set<string>();
  const proPremiumPurchasers = new Set<string>();
  const proStandardPurchasers = new Set<string>();
  const freeCreditPurchasers = new Set<string>();
  const revenueByPlan: Record<PlanTier, number> = { free: 0, plus: 0, pro: 0 };
  const proSuccessByUser = new Map<string, number[]>();

  for (const row of ordersInRange) {
    const planTier = asPlanTier(row.plan_tier);
    revenueByPlan[planTier] += Math.max(0, Math.round(Number(row.amount) || 0));

    const productId = inferProductId(row);
    const creditType = inferCreditType(row);

    if (row.order_kind === "subscription" && productId === "pro") {
      continue;
    }
    if (row.order_kind !== "credit_pack") continue;
    if (planTier === "free") freeCreditPurchasers.add(row.user_id);
    if (planTier === "plus" && creditType === "premium") plusPremiumPurchasers.add(row.user_id);
    if (planTier === "pro" && creditType === "premium") proPremiumPurchasers.add(row.user_id);
    if (planTier === "pro" && creditType === "standard") proStandardPurchasers.add(row.user_id);
  }

  for (const row of orders) {
    if (row.order_kind !== "subscription") continue;
    if (inferProductId(row) !== "pro") continue;
    const createdAtMs = getOrderTimestampMs(row);
    proSuccessByUser.set(row.user_id, [...(proSuccessByUser.get(row.user_id) ?? []), createdAtMs]);
  }

  const plusPremiumToProConverterUsers = new Set<string>();
  for (const row of ordersInRange) {
    if (row.order_kind !== "credit_pack") continue;
    if (asPlanTier(row.plan_tier) !== "plus") continue;
    if (inferCreditType(row) !== "premium") continue;
    const purchaseAt = getOrderTimestampMs(row);
    if (!purchaseAt) continue;
    const proSuccesses = proSuccessByUser.get(row.user_id) ?? [];
    const hasConverted = proSuccesses.some((timestamp) => timestamp >= purchaseAt && timestamp <= purchaseAt + 30 * DAY_MS);
    if (hasConverted) plusPremiumToProConverterUsers.add(row.user_id);
  }

  let plusStandardSearchUses = 0;
  let plusPremiumSearchUses = 0;
  const grantByType: Record<SearchCreditType, number> = { standard: 0, premium: 0 };
  const consumeByType: Record<SearchCreditType, number> = { standard: 0, premium: 0 };

  for (const row of usageEvents) {
    const meta = readUsageMeta(row);
    if (!meta.searchType) continue;
    if (meta.eventType === "consume" && row.delta < 0) {
      consumeByType[meta.searchType] += Math.abs(row.delta);
      if (meta.planTierSnapshot === "plus" && meta.searchType === "standard") plusStandardSearchUses += Math.abs(row.delta);
      if (meta.planTierSnapshot === "plus" && meta.searchType === "premium") plusPremiumSearchUses += Math.abs(row.delta);
    }
    if (meta.eventType === "grant" && row.delta > 0) {
      grantByType[meta.searchType] += row.delta;
    }
  }

  const planCheckoutStarts = { plus: 0, pro: 0 };
  const planCheckoutSuccess = { plus: 0, pro: 0 };
  let creditCheckoutStarts = 0;
  let creditCheckoutSuccess = 0;
  let upsellViewCount = 0;
  let upsellClickCount = 0;
  const upsellClickedUsers = new Set<string>();

  for (const row of analyticsEvents) {
    const props = readJsonRecord(row.props);
    const productId = String(props?.productId ?? "");
    if (row.event_name === "plan_checkout_started" && (productId === "plus" || productId === "pro")) {
      planCheckoutStarts[productId] += 1;
    }
    if (row.event_name === "plan_checkout_succeeded" && (productId === "plus" || productId === "pro")) {
      planCheckoutSuccess[productId] += 1;
    }
    if (row.event_name === "credit_pack_checkout_started") creditCheckoutStarts += 1;
    if (row.event_name === "credit_pack_checkout_succeeded") creditCheckoutSuccess += 1;
    if (row.event_name === "pro_upsell_viewed") upsellViewCount += 1;
    if (row.event_name === "pro_upsell_clicked") {
      upsellClickCount += 1;
      upsellClickedUsers.add(row.user_id);
    }
  }

  let upsellConvertedUsers = 0;
  for (const userId of upsellClickedUsers) {
    const clicks = analyticsEvents
      .filter((event) => event.user_id === userId && event.event_name === "pro_upsell_clicked")
      .map((event) => parseDate(event.created_at)?.getTime() ?? 0)
      .filter(Boolean);
    const successTimes = proSuccessByUser.get(userId) ?? [];
    const converted = clicks.some((clickAt) => successTimes.some((successAt) => successAt >= clickAt && successAt <= clickAt + 30 * DAY_MS));
    if (converted) upsellConvertedUsers += 1;
  }

  return {
    periodDays: safeRangeDays,
    userCounts,
    usage: {
      plusStandardSearchUses,
      plusPremiumSearchUses,
      burnRate: {
        standard: {
          consumed: consumeByType.standard,
          granted: grantByType.standard,
          burnRatePct: toRatePct(consumeByType.standard, grantByType.standard),
        },
        premium: {
          consumed: consumeByType.premium,
          granted: grantByType.premium,
          burnRatePct: toRatePct(consumeByType.premium, grantByType.premium),
        },
      },
    },
    purchases: {
      freeCreditPurchaseUsers: freeCreditPurchasers.size,
      plusPremiumPurchaseUsers: plusPremiumPurchasers.size,
      plusPremiumPurchaseRatePct: toRatePct(plusPremiumPurchasers.size, userCounts.plus),
      plusPremiumToProConversionRatePct: toRatePct(plusPremiumToProConverterUsers.size, plusPremiumPurchasers.size),
      proPremiumExtraPurchaseUsers: proPremiumPurchasers.size,
      proPremiumExtraPurchaseRatePct: toRatePct(proPremiumPurchasers.size, userCounts.pro),
      proStandardPurchaseUsers: proStandardPurchasers.size,
      proStandardPurchaseRatePct: toRatePct(proStandardPurchasers.size, userCounts.pro),
    },
    revenue: {
      revenueByPlan,
      arpuByPlan: {
        free: Math.round(revenueByPlan.free / Math.max(1, userCounts.free)),
        plus: Math.round(revenueByPlan.plus / Math.max(1, userCounts.plus)),
        pro: Math.round(revenueByPlan.pro / Math.max(1, userCounts.pro)),
      },
    },
    conversion: {
      planPaymentConversionRatePct: {
        plus: toRatePct(planCheckoutSuccess.plus, planCheckoutStarts.plus),
        pro: toRatePct(planCheckoutSuccess.pro, planCheckoutStarts.pro),
      },
      creditPackPaymentConversionRatePct: toRatePct(creditCheckoutSuccess, creditCheckoutStarts),
      upsellViewCount,
      upsellClickCount,
      upsellConversionRatePct: toRatePct(upsellConvertedUsers, upsellClickedUsers.size),
    },
    quality: qualitySummary,
  };
}
