export type PlanTier = "free" | "plus" | "pro";
export type BillingOrderKind = "subscription" | "credit_pack";
export type CheckoutProductId = "plus" | "pro" | "credit10" | "credit30";

export type PlanDefinition = {
  tier: PlanTier;
  title: string;
  description: string;
  priceKrw: number;
  periodDays: number;
  orderName: string;
  checkoutEnabled: boolean;
  medSafetyIncludedCredits: number;
  medSafetyHistoryLimit: number;
  features: string[];
};

const DEFAULT_PERIOD_DAYS = 30;
export const PAID_PLAN_TIERS = ["plus", "pro"] as const;

export function isPaidPlanTier(value: PlanTier): value is Exclude<PlanTier, "free"> {
  return value === "plus" || value === "pro";
}

export function getPaidPlanRank(value: Exclude<PlanTier, "free">) {
  return value === "pro" ? 2 : 1;
}

const PLAN_MAP: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    title: "Free",
    description: "기록과 기본 인사이트를 사용할 수 있습니다.",
    priceKrw: 0,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Free Plan",
    checkoutEnabled: false,
    medSafetyIncludedCredits: 0,
    medSafetyHistoryLimit: 5,
    features: ["일정·건강 기록", "기본 인사이트", "회복 플래너 요약"],
  },
  plus: {
    tier: "plus",
    title: "Plus",
    description: "AI 맞춤회복과 오늘의 오더를 중심으로 쓰는 월 플랜입니다. 결제 시 AI 임상 검색 크레딧 10회가 함께 지급됩니다.",
    priceKrw: 9900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Plus Monthly",
    checkoutEnabled: true,
    medSafetyIncludedCredits: 10,
    medSafetyHistoryLimit: 5,
    features: [
      "AI 맞춤회복 전체 이용",
      "오늘의 오더 체크리스트",
      "AI 임상 검색 크레딧 10회 지급",
      "최근 AI 검색 기록 5개 저장",
    ],
  },
  pro: {
    tier: "pro",
    title: "Pro",
    description: "Plus 전체 기능에 AI 임상 검색 크레딧 100회를 제공하는 월 플랜입니다.",
    priceKrw: 14900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Pro Monthly",
    checkoutEnabled: true,
    medSafetyIncludedCredits: 100,
    medSafetyHistoryLimit: 10,
    features: [
      "Plus 플랜의 모든 기능",
      "AI 임상 검색 크레딧 100회 지급",
      "최근 AI 검색 기록 10개 저장",
    ],
  },
};

export type CheckoutProductDefinition = {
  id: CheckoutProductId;
  kind: BillingOrderKind;
  title: string;
  description: string;
  priceKrw: number;
  orderName: string;
  checkoutEnabled: boolean;
  planTier: Exclude<PlanTier, "free"> | null;
  creditUnits: number;
};

const CHECKOUT_PRODUCT_MAP: Record<CheckoutProductId, CheckoutProductDefinition> = {
  plus: {
    id: "plus",
    kind: "subscription",
    title: PLAN_MAP.plus.title,
    description: PLAN_MAP.plus.description,
    priceKrw: PLAN_MAP.plus.priceKrw,
    orderName: PLAN_MAP.plus.orderName,
    checkoutEnabled: PLAN_MAP.plus.checkoutEnabled,
    planTier: "plus",
    creditUnits: 0,
  },
  pro: {
    id: "pro",
    kind: "subscription",
    title: PLAN_MAP.pro.title,
    description: PLAN_MAP.pro.description,
    priceKrw: PLAN_MAP.pro.priceKrw,
    orderName: PLAN_MAP.pro.orderName,
    checkoutEnabled: PLAN_MAP.pro.checkoutEnabled,
    planTier: "pro",
    creditUnits: 0,
  },
  credit10: {
    id: "credit10",
    kind: "credit_pack",
    title: "AI 검색 크레딧 10회",
    description: "AI 임상 검색 추가 크레딧 10회",
    priceKrw: 1500,
    orderName: "RNest AI Search Credit 10",
    checkoutEnabled: true,
    planTier: "plus",
    creditUnits: 10,
  },
  credit30: {
    id: "credit30",
    kind: "credit_pack",
    title: "AI 검색 크레딧 30회",
    description: "AI 임상 검색 추가 크레딧 30회",
    priceKrw: 3900,
    orderName: "RNest AI Search Credit 30",
    checkoutEnabled: true,
    planTier: "plus",
    creditUnits: 30,
  },
};

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_MAP[tier];
}

export function listPlans(): PlanDefinition[] {
  return [PLAN_MAP.free, PLAN_MAP.plus, PLAN_MAP.pro];
}

export function asPlanTier(value: unknown): PlanTier | null {
  if (value === "free") return "free";
  if (value === "plus") return "plus";
  if (value === "pro") return "pro";
  return null;
}

export function asCheckoutPlanTier(value: unknown): Exclude<PlanTier, "free"> | null {
  if (value === "plus") return "plus";
  if (value === "pro") return "pro";
  return null;
}

export function getCheckoutProductDefinition(id: CheckoutProductId): CheckoutProductDefinition {
  return CHECKOUT_PRODUCT_MAP[id];
}

export function listCheckoutProducts(): CheckoutProductDefinition[] {
  return [CHECKOUT_PRODUCT_MAP.plus, CHECKOUT_PRODUCT_MAP.pro, CHECKOUT_PRODUCT_MAP.credit10, CHECKOUT_PRODUCT_MAP.credit30];
}

export function asCheckoutProductId(value: unknown): CheckoutProductId | null {
  if (value === "plus") return "plus";
  if (value === "pro") return "pro";
  if (value === "credit10") return "credit10";
  if (value === "credit30") return "credit30";
  return null;
}

export function formatKrw(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")} KRW`;
}
