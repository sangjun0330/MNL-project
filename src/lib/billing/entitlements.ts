export type BillingEntitlement =
  | "recoveryPlannerSummary"
  | "recoveryPlannerFull"
  | "recoveryPlannerAI"
  | "advancedCalculators"
  | "medSafety"
  | "medSafetyImageQueries";

export type BillingEntitlements = Record<BillingEntitlement, boolean>;

export const DEFAULT_BILLING_ENTITLEMENTS: BillingEntitlements = {
  recoveryPlannerSummary: true,
  recoveryPlannerFull: false,
  recoveryPlannerAI: false,
  advancedCalculators: false,
  medSafety: false,
  medSafetyImageQueries: false,
};

export function buildBillingEntitlements(args: {
  hasPaidAccess: boolean;
  medSafetyTotalRemaining: number;
}): BillingEntitlements {
  const medSafetyAvailable = args.hasPaidAccess || args.medSafetyTotalRemaining > 0;

  return {
    recoveryPlannerSummary: true,
    recoveryPlannerFull: args.hasPaidAccess,
    recoveryPlannerAI: args.hasPaidAccess,
    advancedCalculators: args.hasPaidAccess,
    medSafety: medSafetyAvailable,
    medSafetyImageQueries: medSafetyAvailable,
  };
}

export function hasBillingEntitlement(
  entitlements: Partial<BillingEntitlements> | null | undefined,
  key: BillingEntitlement
) {
  return Boolean(entitlements?.[key] ?? DEFAULT_BILLING_ENTITLEMENTS[key]);
}
