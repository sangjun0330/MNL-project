import { NextResponse } from "next/server";
import { listRecentBillingOrders, readBillingPurchaseSummary, readSubscription } from "@/lib/server/billingStore";
import { getAIRecoveryModelForTier } from "@/lib/billing/plans";
import { readAuthIdentityFromRequest } from "@/lib/server/readUserId";
import { DEFAULT_BILLING_ENTITLEMENTS } from "@/lib/billing/entitlements";
import { isPrivilegedRecoveryTesterIdentity } from "@/lib/server/authAccess";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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
    const effectiveModel = getAIRecoveryModelForTier(subscription.tier) ?? (isPrivilegedTester ? "gpt-5.4" : null);
    const effectiveSubscription = isPrivilegedTester
      ? {
          ...subscription,
          entitlements: {
            ...subscription.entitlements,
            recoveryPlannerAI: true,
          },
          aiRecoveryModel: effectiveModel,
        }
      : {
          ...subscription,
          aiRecoveryModel: effectiveModel,
        };

    return NextResponse.json({
      ok: true,
      data: {
        subscription: effectiveSubscription,
        orders,
        purchaseSummary,
      },
    });
  } catch (err) {
    console.error("[BillingSubscription] failed_to_read_subscription", {
      userId: String(identity.userId).slice(0, 8),
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
    // 500 대신 free tier 기본값 반환으로 클라이언트가 정상 동작 가능하게 함
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
}
