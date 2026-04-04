import type { PlanTier } from "@/lib/billing/plans";

export type BillingEntitlement =
  | "recoveryPlannerSummary"
  | "recoveryPlannerFull"
  | "recoveryPlannerAI"
  | "advancedCalculators"
  | "medSafety"
  | "medSafetyImageQueries"
  | "socialGroupCreate"
  | "socialGroupBrief";

export type BillingEntitlements = Record<BillingEntitlement, boolean>;

export const DEFAULT_BILLING_ENTITLEMENTS: BillingEntitlements = {
  recoveryPlannerSummary: true,
  recoveryPlannerFull: false,
  recoveryPlannerAI: false,
  advancedCalculators: false,
  medSafety: false,
  medSafetyImageQueries: false,
  socialGroupCreate: false,
  socialGroupBrief: false,
};

export function buildBillingEntitlements(args: {
  tier: PlanTier;
  hasPaidAccess: boolean;
  medSafetyTotalRemaining: number;
}): BillingEntitlements {
  const recoveryPlannerAvailable = args.hasPaidAccess && args.tier !== "free";
  const medSafetyAvailable = args.medSafetyTotalRemaining > 0;

  return {
    recoveryPlannerSummary: true,
    recoveryPlannerFull: recoveryPlannerAvailable,
    recoveryPlannerAI: recoveryPlannerAvailable,
    // 통합 간호 계산기는 현재 모든 플랜에서 공통 제공한다.
    advancedCalculators: true,
    medSafety: medSafetyAvailable,
    medSafetyImageQueries: medSafetyAvailable,
    socialGroupCreate: recoveryPlannerAvailable,
    socialGroupBrief: recoveryPlannerAvailable,
  };
}

export function hasBillingEntitlement(
  entitlements: Partial<BillingEntitlements> | null | undefined,
  key: BillingEntitlement
) {
  return Boolean(entitlements?.[key] ?? DEFAULT_BILLING_ENTITLEMENTS[key]);
}
