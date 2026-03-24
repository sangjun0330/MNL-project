import { NextResponse } from "next/server";
import { listRecentBillingOrders, readBillingPurchaseSummary, readSubscription } from "@/lib/server/billingStore";
import { readAuthIdentityFromRequest } from "@/lib/server/readUserId";
import { DEFAULT_BILLING_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { isPrivilegedRecoveryTesterIdentity } from "@/lib/server/authAccess";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  const identity = await readAuthIdentityFromRequest(req);
  if (!identity.userId) {
    return NextResponse.json({
      ok: true,
      data: {
        subscription: {
          tier: "free",
          status: "inactive",
          startedAt: null,
          currentPeriodEnd: null,
          updatedAt: null,
          customerKey: "",
          cancelAtPeriodEnd: false,
          cancelScheduledAt: null,
          canceledAt: null,
          cancelReason: null,
          hasPaidAccess: false,
          entitlements: DEFAULT_BILLING_ENTITLEMENTS,
          aiRecoveryModel: null,
          medSafetyQuota: {
            timezone: "Asia/Seoul",
            standard: { includedRemaining: 0, extraRemaining: 0, totalRemaining: 0 },
            premium: { includedRemaining: 0, extraRemaining: 0, totalRemaining: 0 },
            totalRemaining: 0,
            recommendedDefaultSearchType: "standard",
          },
        },
        orders: [],
        purchaseSummary: {
          totalPaidAmount: 0,
          subscriptionPaidAmount: 0,
          creditPaidAmount: 0,
          creditPurchasedUnits: 0,
        },
      },
    });
  }

  try {
    const [subscription, orders, purchaseSummary] = await Promise.all([
      readSubscription(identity.userId),
      listRecentBillingOrders(identity.userId, 12),
      readBillingPurchaseSummary(identity.userId),
    ]);
    const isPrivilegedTester = isPrivilegedRecoveryTesterIdentity({
      userId: identity.userId,
      email: identity.email,
    });
    const effectiveSubscription = isPrivilegedTester
      ? {
          ...subscription,
          entitlements: {
            ...subscription.entitlements,
            recoveryPlannerAI: true,
          },
          aiRecoveryModel: subscription.aiRecoveryModel ?? "gpt-5.4",
        }
      : subscription;

    return NextResponse.json({
      ok: true,
      data: {
        subscription: effectiveSubscription,
        orders,
        purchaseSummary,
      },
    });
  } catch {
    return bad(500, "failed_to_read_subscription");
  }
}
