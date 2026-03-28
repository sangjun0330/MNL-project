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
    description: "임상 현장에서 빠르게 확인하는 실용 검색",
    purchaseHint: "투약·용량·금기 등 빠르게 확인할 때 적합",
    model: "gpt-5.2",
  },
  premium: {
    type: "premium",
    title: "프리미엄 검색",
    shortTitle: "프리미엄",
    description: "복잡한 임상 판단을 뒷받침하는 고급 검색",
    purchaseHint: "복합 약물 상호작용·희귀 케이스 등 깊은 해석이 필요할 때 추천",
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
    description: "근무 일정과 건강 기록으로 내 패턴을 파악하고, 체험 크레딧으로 AI 임상 검색을 먼저 경험해 보세요.",
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
    features: [
      "근무 일정 · 건강 기록",
      "기본 회복 인사이트",
      "AI 임상 검색 체험 — 기본 2회 + 프리미엄 1회",
    ],
  },
  plus: {
    tier: "plus",
    title: "Plus",
    description: "교대 근무의 피로 패턴을 읽고 오늘 내 회복 상태를 AI로 파악합니다. 임상 현장에서 바로 쓸 수 있는 AI 검색 크레딧이 매달 채워집니다.",
    priceKrw: 9900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Plus Monthly",
    checkoutEnabled: true,
    aiRecoveryModel: "gpt-5.2",
    includedSearchCredits: {
      standard: 20,
      premium: 5,
    },
    medSafetyIncludedCredits: 25,
    medSafetyHistoryLimit: 10,
    features: [
      "AI 7일 회복 플래너 — 오늘의 배터리·수면·피로 분석",
      "오늘의 오더 화면",
      "AI 임상 검색 — 기본 20회 + 프리미엄 5회 포함",
      "부족하면 추가 크레딧 구매 가능",
      "AI 검색 기록 최근 10개 저장",
    ],
  },
  pro: {
    tier: "pro",
    title: "Pro",
    description: "14일 앞을 내다보는 맞춤 회복 계획으로 번아웃 없이 근무를 이어갑니다. 더 깊은 임상 분석이 필요할 때 프리미엄 AI 검색이 답합니다.",
    priceKrw: 14900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Pro Monthly",
    checkoutEnabled: true,
    aiRecoveryModel: "gpt-5.4",
    includedSearchCredits: {
      standard: 50,
      premium: 30,
    },
    medSafetyIncludedCredits: 80,
    medSafetyHistoryLimit: 20,
    features: [
      "Plus 모든 기능 포함",
      "14일 맞춤 회복 계획 — AI Pro 모델로 근무 강도에 맞게 설계",
      "AI 임상 검색 — 기본 50회 + 프리미엄 30회 매달 포함",
      "더 깊은 임상 해석의 프리미엄 AI 검색",
      "부족하면 추가 크레딧 구매 가능",
      "AI 검색 기록 최근 20개 저장",
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
    description: "임상 현장에서 빠르게 확인하는 실용 검색 10회",
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
    description: "임상 현장에서 빠르게 확인하는 실용 검색 30회",
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
    description: "복잡한 임상 판단을 뒷받침하는 고급 검색 10회",
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
    description: "복잡한 임상 판단을 뒷받침하는 고급 검색 30회",
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
