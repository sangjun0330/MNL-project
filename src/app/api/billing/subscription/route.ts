import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function emptyResponse() {
  return {
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
        entitlements: {
          recoveryPlannerSummary: true,
          recoveryPlannerFull: false,
          recoveryPlannerAI: false,
          advancedCalculators: true,
          medSafety: false,
          medSafetyImageQueries: false,
        },
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
  };
}

export async function GET(req: Request) {
  let identity: { userId: string; email: string | null } = { userId: "", email: null };
  try {
    const { readAuthIdentityFromRequest } = await import("@/lib/server/readUserId");
    identity = await readAuthIdentityFromRequest(req);
  } catch (err) {
    console.error("[BillingSubscription] readAuthIdentity failed", {
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
    return NextResponse.json(emptyResponse());
  }

  if (!identity.userId) {
    return NextResponse.json(emptyResponse());
  }

  try {
    const [
      { listRecentBillingOrders, readBillingPurchaseSummary, readSubscription },
      { isPrivilegedRecoveryTesterIdentity },
    ] = await Promise.all([
      import("@/lib/server/billingReadStore"),
      import("@/lib/server/authAccess"),
    ]);

    // readSubscription은 플랜 정보의 핵심 — 실패하면 catch로 이동
    const subscription = await readSubscription(identity.userId);

    // orders/summary는 부가 정보 — 실패해도 구독 상태는 정상 반환
    const [orders, purchaseSummary] = await Promise.all([
      listRecentBillingOrders(identity.userId, 12).catch((err) => {
        console.error("[BillingSubscription] listRecentBillingOrders failed", {
          userId: String(identity.userId).slice(0, 8),
          code: (err as any)?.code,
          message: String((err as any)?.message ?? err).slice(0, 200),
        });
        return [] as Awaited<ReturnType<typeof listRecentBillingOrders>>;
      }),
      readBillingPurchaseSummary(identity.userId).catch((err) => {
        console.error("[BillingSubscription] readBillingPurchaseSummary failed", {
          userId: String(identity.userId).slice(0, 8),
          code: (err as any)?.code,
          message: String((err as any)?.message ?? err).slice(0, 200),
        });
        return { totalPaidAmount: 0, subscriptionPaidAmount: 0, creditPaidAmount: 0, creditPurchasedUnits: 0 };
      }),
    ]);

    const isPrivilegedTester = isPrivilegedRecoveryTesterIdentity({
      userId: identity.userId,
      email: identity.email,
    });
    const effectiveModel = subscription.aiRecoveryModel ?? (isPrivilegedTester ? "gpt-5.4" : null);
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
    // readSubscription 자체가 실패한 경우 — free tier 기본값 반환
    console.error("[BillingSubscription] readSubscription failed", {
      userId: String(identity.userId).slice(0, 8),
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
    return NextResponse.json(emptyResponse());
  }
}
