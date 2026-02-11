export type PlanTier = "free" | "basic" | "pro";

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
    features: ["Vital/Trend/Thieves statistics", "Basic schedule and health logging"],
  },
  basic: {
    tier: "basic",
    title: "Basic",
    description: "AI recovery guidance and daily coaching.",
    priceKrw: 5900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Basic Monthly",
    checkoutEnabled: true,
    features: ["AI recovery guidance", "Daily personalized coaching", "Weekly AI note"],
  },
  pro: {
    tier: "pro",
    title: "Pro",
    description: "Advanced AI analysis with high precision workflows.",
    priceKrw: 12900,
    periodDays: DEFAULT_PERIOD_DAYS,
    orderName: "RNest Pro Monthly",
    checkoutEnabled: true,
    features: ["Advanced AI analysis", "Precision recovery planning", "Weekly report and insights"],
  },
};

export function getPlanDefinition(tier: PlanTier): PlanDefinition {
  return PLAN_MAP[tier];
}

export function listPlans(): PlanDefinition[] {
  return [PLAN_MAP.free, PLAN_MAP.basic, PLAN_MAP.pro];
}

export function asPlanTier(value: unknown): PlanTier | null {
  if (value === "free" || value === "basic" || value === "pro") return value;
  return null;
}

export function asCheckoutPlanTier(value: unknown): Exclude<PlanTier, "free"> | null {
  if (value === "basic" || value === "pro") return value;
  return null;
}

export function formatKrw(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")} KRW`;
}
