export type PlanTier = "free" | "pro";

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
    description: "Statistics-focused insights without AI recovery.",
    priceKrw: 0,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Free Plan",
    checkoutEnabled: false,
    features: ["Vital/Trend/Thieves statistics", "Core schedule and health logging"],
  },
  pro: {
    tier: "pro",
    title: "Pro",
    description: "AI 맞춤회복 + AI 약물기구안전가이드 포함",
    priceKrw: 12900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Pro Monthly",
    checkoutEnabled: true,
    features: ["AI 맞춤회복", "AI 약물기구안전가이드"],
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

export function formatKrw(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")} KRW`;
}
