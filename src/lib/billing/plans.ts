export type PlanTier = "free" | "pro";
export type BillingOrderKind = "subscription" | "credit_pack";
export type CheckoutProductId = "pro" | "credit10";

export type PlanDefinition = {
  tier: PlanTier;
  title: string;
  description: string;
  priceKrw: number;
  periodDays: number;
  orderName: string;
  checkoutEnabled: boolean;
  features: string[];
};

const DEFAULT_PERIOD_DAYS = 30;

const PLAN_MAP: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    title: "Free",
    description: "기록과 기본 인사이트를 사용할 수 있습니다.",
    priceKrw: 0,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Free Plan",
    checkoutEnabled: false,
    features: ["일정·건강 기록", "기본 인사이트", "회복 플래너 요약"],
  },
  pro: {
    tier: "pro",
    title: "Pro",
    description: "AI 맞춤회복, 오늘의 오더, AI 검색을 더 넓게 사용할 수 있습니다.",
    priceKrw: 14900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Pro Monthly",
    checkoutEnabled: true,
    features: [
      "AI 맞춤회복 전체",
      "오늘의 오더 체크리스트",
      "AI 약물·도구 검색 10회/일",
      "AI 검색 기록 저장",
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
    description: "AI 약물·도구 검색 추가 10회",
    priceKrw: 1500,
    orderName: "RNest AI Search Credit 10",
    checkoutEnabled: true,
    planTier: "pro",
    creditUnits: 10,
  },
};

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_MAP[tier];
}

export function listPlans(): PlanDefinition[] {
  return [PLAN_MAP.free, PLAN_MAP.pro];
}

export function asPlanTier(value: unknown): PlanTier | null {
  if (value === "free") return "free";
  if (value === "pro") return "pro";
  return null;
}

export function asCheckoutPlanTier(value: unknown): Exclude<PlanTier, "free"> | null {
  if (value === "pro") return "pro";
  return null;
}

export function getCheckoutProductDefinition(id: CheckoutProductId): CheckoutProductDefinition {
  return CHECKOUT_PRODUCT_MAP[id];
}

export function listCheckoutProducts(): CheckoutProductDefinition[] {
  return [CHECKOUT_PRODUCT_MAP.pro, CHECKOUT_PRODUCT_MAP.credit10];
}

export function asCheckoutProductId(value: unknown): CheckoutProductId | null {
  if (value === "pro") return "pro";
  if (value === "credit10") return "credit10";
  return null;
}

export function formatKrw(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")} KRW`;
}
