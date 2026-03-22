export type PlanTier = "free" | "plus" | "pro";
export type BillingOrderKind = "subscription" | "credit_pack";
export type SearchCreditType = "standard" | "premium";
export type CheckoutProductId = "plus" | "pro" | "standard10" | "standard30" | "premium10" | "premium30";

export type SearchCreditMeta = {
  type: SearchCreditType;
  title: string;
  shortTitle: string;
  description: string;
  purchaseHint: string;
  model: string;
};

export type PlanDefinition = {
  tier: PlanTier;
  title: string;
  description: string;
  priceKrw: number;
  periodDays: number;
  orderName: string;
  checkoutEnabled: boolean;
  aiRecoveryModel: string | null;
  includedSearchCredits: Record<SearchCreditType, number>;
  medSafetyIncludedCredits: number;
  medSafetyHistoryLimit: number;
  features: string[];
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
  creditType: SearchCreditType | null;
  creditUnits: number;
};

const DEFAULT_PERIOD_DAYS = 30;
export const PAID_PLAN_TIERS = ["plus", "pro"] as const;

export const SEARCH_CREDIT_META_MAP: Record<SearchCreditType, SearchCreditMeta> = {
  standard: {
    type: "standard",
    title: "기본 검색",
    shortTitle: "기본",
    description: "빠르고 실용적인 임상 검색",
    purchaseHint: "가볍고 빠르게 찾는 질문에 적합",
    model: "gpt-5.2",
  },
  premium: {
    type: "premium",
    title: "프리미엄 검색",
    shortTitle: "프리미엄",
    description: "더 깊고 정교한 고급 검색",
    purchaseHint: "더 깊은 해석과 정교한 답변이 필요한 질문에 추천",
    model: "gpt-5.4",
  },
};

export function isPaidPlanTier(value: PlanTier): value is Exclude<PlanTier, "free"> {
  return value === "plus" || value === "pro";
}

export function getPaidPlanRank(value: Exclude<PlanTier, "free">) {
  return value === "pro" ? 2 : 1;
}

export function getSearchCreditMeta(type: SearchCreditType) {
  return SEARCH_CREDIT_META_MAP[type];
}

export function getSearchModelForType(type: SearchCreditType) {
  return SEARCH_CREDIT_META_MAP[type].model;
}

export function getDefaultSearchTypeForTier(tier: PlanTier): SearchCreditType {
  return tier === "pro" ? "premium" : "standard";
}

export function getAIRecoveryModelForTier(tier: PlanTier) {
  if (tier === "pro") return "gpt-5.4";
  if (tier === "plus") return "gpt-5.2";
  return null;
}

const PLAN_MAP: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    title: "Free",
    description: "기록과 기본 인사이트를 사용하면서, 월마다 제공되는 소량의 AI 임상 검색 체험 크레딧으로 기능을 먼저 경험해 볼 수 있습니다.",
    priceKrw: 0,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Free Plan",
    checkoutEnabled: false,
    aiRecoveryModel: null,
    includedSearchCredits: {
      standard: 2,
      premium: 1,
    },
    medSafetyIncludedCredits: 3,
    medSafetyHistoryLimit: 5,
    features: ["일정·건강 기록", "기본 인사이트", "기본 검색 2회 + 프리미엄 검색 1회 체험", "추가 크레딧 구매 없음"],
  },
  plus: {
    tier: "plus",
    title: "Plus",
    description: "회복 플래너 화면과 기본 검색을 함께 쓰는 플랜입니다. 기본 검색 10회가 포함됩니다.",
    priceKrw: 9900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Plus Monthly",
    checkoutEnabled: true,
    aiRecoveryModel: "gpt-5.2",
    includedSearchCredits: {
      standard: 10,
      premium: 0,
    },
    medSafetyIncludedCredits: 10,
    medSafetyHistoryLimit: 5,
    features: [
      "회복 플래너 화면",
      "오늘의 오더 화면",
      "기본 검색 10회 포함",
      "기본 검색/프리미엄 검색 추가 구매 가능",
      "최근 AI 검색 기록 5개 저장",
    ],
  },
  pro: {
    tier: "pro",
    title: "Pro",
    description: "프리미엄 검색을 많이 쓰는 플랜입니다. 프리미엄 검색 100회가 포함됩니다.",
    priceKrw: 14900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Pro Monthly",
    checkoutEnabled: true,
    aiRecoveryModel: "gpt-5.4",
    includedSearchCredits: {
      standard: 0,
      premium: 100,
    },
    medSafetyIncludedCredits: 100,
    medSafetyHistoryLimit: 10,
    features: [
      "Plus 플랜의 모든 기능",
      "프리미엄 검색 100회 포함",
      "기본 검색/프리미엄 검색 추가 구매 가능",
      "더 높은 품질의 AI 검색",
      "최근 AI 검색 기록 10개 저장",
    ],
  },
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
    creditType: null,
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
    creditType: null,
    creditUnits: 0,
  },
  standard10: {
    id: "standard10",
    kind: "credit_pack",
    title: "기본 검색 10회",
    description: "빠르고 실용적인 임상 검색 10회",
    priceKrw: 1500,
    orderName: "RNest Standard Search Credit 10",
    checkoutEnabled: true,
    planTier: null,
    creditType: "standard",
    creditUnits: 10,
  },
  standard30: {
    id: "standard30",
    kind: "credit_pack",
    title: "기본 검색 30회",
    description: "빠르고 실용적인 임상 검색 30회",
    priceKrw: 3900,
    orderName: "RNest Standard Search Credit 30",
    checkoutEnabled: true,
    planTier: null,
    creditType: "standard",
    creditUnits: 30,
  },
  premium10: {
    id: "premium10",
    kind: "credit_pack",
    title: "프리미엄 검색 10회",
    description: "더 깊고 정교한 고급 검색 10회",
    priceKrw: 1900,
    orderName: "RNest Premium Search Credit 10",
    checkoutEnabled: true,
    planTier: null,
    creditType: "premium",
    creditUnits: 10,
  },
  premium30: {
    id: "premium30",
    kind: "credit_pack",
    title: "프리미엄 검색 30회",
    description: "더 깊고 정교한 고급 검색 30회",
    priceKrw: 4900,
    orderName: "RNest Premium Search Credit 30",
    checkoutEnabled: true,
    planTier: null,
    creditType: "premium",
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

export function asSearchCreditType(value: unknown): SearchCreditType | null {
  if (value === "standard") return "standard";
  if (value === "premium") return "premium";
  return null;
}

export function getCheckoutProductDefinition(id: CheckoutProductId): CheckoutProductDefinition {
  return CHECKOUT_PRODUCT_MAP[id];
}

export function listCheckoutProducts(): CheckoutProductDefinition[] {
  return [
    CHECKOUT_PRODUCT_MAP.plus,
    CHECKOUT_PRODUCT_MAP.pro,
    CHECKOUT_PRODUCT_MAP.standard10,
    CHECKOUT_PRODUCT_MAP.standard30,
    CHECKOUT_PRODUCT_MAP.premium10,
    CHECKOUT_PRODUCT_MAP.premium30,
  ];
}

export function listCreditPackProducts(type?: SearchCreditType | null): CheckoutProductDefinition[] {
  const all = [
    CHECKOUT_PRODUCT_MAP.standard10,
    CHECKOUT_PRODUCT_MAP.standard30,
    CHECKOUT_PRODUCT_MAP.premium10,
    CHECKOUT_PRODUCT_MAP.premium30,
  ];
  if (!type) return all;
  return all.filter((item) => item.creditType === type);
}

export function asCheckoutProductId(value: unknown): CheckoutProductId | null {
  if (value === "plus") return "plus";
  if (value === "pro") return "pro";
  if (value === "standard10") return "standard10";
  if (value === "standard30") return "standard30";
  if (value === "premium10") return "premium10";
  if (value === "premium30") return "premium30";
  return null;
}

export function formatKrw(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")} KRW`;
}
