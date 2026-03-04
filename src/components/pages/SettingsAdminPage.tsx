"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/billing/client";
import { formatKrw } from "@/lib/billing/plans";
import { signInWithProvider, useAuthState } from "@/lib/auth";

type AdminRefundRowLite = {
  status: "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "EXECUTING" | "REFUNDED" | "FAILED_RETRYABLE" | "FAILED_FINAL" | "WITHDRAWN";
};

type AdminBillingOrderLite = {
  status: "READY" | "DONE" | "FAILED" | "CANCELED";
  amount: number;
};

type AdminShopOrderLite = {
  status: "READY" | "PAID" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED" | "SHIPPED" | "DELIVERED";
  amount: number;
};

type AdminShopProductLite = {
  active?: boolean;
};

type DashboardState = {
  shop: {
    totalOrders: number;
    totalSales: number;
    activeProducts: number;
    readyToShip: number;
    shipping: number;
    delivered: number;
    refundPending: number;
    issues: number;
  };
  billing: {
    totalRefunds: number;
    openRefunds: number;
    refunded: number;
    failedRefunds: number;
    paidOrders: number;
    queuedPayments: number;
    canceledPayments: number;
    totalAttemptAmount: number;
  };
};

const EMPTY_DASHBOARD: DashboardState = {
  shop: {
    totalOrders: 0,
    totalSales: 0,
    activeProducts: 0,
    readyToShip: 0,
    shipping: 0,
    delivered: 0,
    refundPending: 0,
    issues: 0,
  },
  billing: {
    totalRefunds: 0,
    openRefunds: 0,
    refunded: 0,
    failedRefunds: 0,
    paidOrders: 0,
    queuedPayments: 0,
    canceledPayments: 0,
    totalAttemptAmount: 0,
  },
};

function parseErrorMessage(input: string | null) {
  const text = String(input ?? "");
  if (!text) return "관리자 정보를 불러오지 못했습니다.";
  if (text.includes("admin_forbidden")) return "관리자 권한이 없는 계정입니다.";
  if (text.includes("billing_admin_not_configured")) return "BILLING_ADMIN_USER_IDS/BILLING_ADMIN_EMAILS가 설정되지 않았습니다.";
  if (text.includes("login_required")) return "로그인이 필요합니다.";
  return text;
}

async function readAdminArray<T>(path: string, headers: Record<string, string>, key: string): Promise<T[]> {
  const res = await fetch(path, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !Array.isArray(json?.data?.[key])) {
    throw new Error(`failed_to_load:${key}`);
  }
  return json.data[key] as T[];
}

function buildShopDashboard(orders: AdminShopOrderLite[], products: AdminShopProductLite[]): DashboardState["shop"] {
  const paidLikeStatuses: AdminShopOrderLite["status"][] = ["PAID", "SHIPPED", "DELIVERED", "REFUND_REQUESTED", "REFUND_REJECTED"];
  return {
    totalOrders: orders.length,
    totalSales: orders
      .filter((order) => paidLikeStatuses.includes(order.status))
      .reduce((sum, order) => sum + Math.max(0, Math.round(Number(order.amount) || 0)), 0),
    activeProducts: products.filter((product) => product.active !== false).length,
    readyToShip: orders.filter((order) => order.status === "PAID").length,
    shipping: orders.filter((order) => order.status === "SHIPPED").length,
    delivered: orders.filter((order) => order.status === "DELIVERED").length,
    refundPending: orders.filter((order) => order.status === "REFUND_REQUESTED").length,
    issues: orders.filter((order) => order.status === "FAILED" || order.status === "REFUND_REJECTED").length,
  };
}

function buildBillingDashboard(refunds: AdminRefundRowLite[], orders: AdminBillingOrderLite[]): DashboardState["billing"] {
  return {
    totalRefunds: refunds.length,
    openRefunds: refunds.filter((row) =>
      ["REQUESTED", "UNDER_REVIEW", "APPROVED", "EXECUTING", "FAILED_RETRYABLE"].includes(row.status)
    ).length,
    refunded: refunds.filter((row) => row.status === "REFUNDED").length,
    failedRefunds: refunds.filter((row) => row.status === "FAILED_FINAL" || row.status === "REJECTED").length,
    paidOrders: orders.filter((row) => row.status === "DONE").length,
    queuedPayments: orders.filter((row) => row.status === "READY").length,
    canceledPayments: orders.filter((row) => row.status === "CANCELED").length,
    totalAttemptAmount: orders.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.amount) || 0)), 0),
  };
}

function AdminMetricCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/88 px-4 py-4 shadow-[0_10px_30px_rgba(17,41,75,0.06)]">
      <div className="text-[11px] font-semibold text-ios-sub">{label}</div>
      <div className={`mt-2 text-[24px] font-extrabold tracking-[-0.03em] ${tone}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-ios-muted">{hint}</div> : null}
    </div>
  );
}

function AdminWorkspaceCard({
  title,
  description,
  href,
  cta,
  accent,
  metrics,
  chips,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  accent: string;
  metrics: Array<{ label: string; value: React.ReactNode; hint?: string; tone: string }>;
  chips: string[];
}) {
  return (
    <Link
      href={href}
      className="group rounded-[30px] border border-white/80 bg-white/92 p-5 shadow-[0_18px_50px_rgba(17,41,75,0.07)] transition hover:-translate-y-[1px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[20px] font-bold tracking-[-0.03em] text-ios-text">{title}</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{description}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-[11px] font-semibold ${accent}`}>{cta}</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => (
          <AdminMetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
            hint={metric.hint}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-[#d9e2ee] bg-[#f7f9fc] px-3 py-1 text-[11px] font-semibold text-[#41556f]"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-[#17324d]">
        바로 열기
        <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

export function SettingsAdminPage() {
  const { status } = useAuthState();
  const [accessState, setAccessState] = useState<"unknown" | "granted" | "denied">("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState>(EMPTY_DASHBOARD);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setAccessState("unknown");
      setError(null);
      setDashboard(EMPTY_DASHBOARD);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const accessRes = await fetch("/api/admin/billing/access", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        cache: "no-store",
      });
      const accessJson = await accessRes.json().catch(() => null);
      if (!accessRes.ok || !accessJson?.ok) {
        throw new Error(String(accessJson?.error ?? `failed_to_check_admin_access:${accessRes.status}`));
      }
      if (!accessJson?.data?.isAdmin) {
        setAccessState("denied");
        setDashboard(EMPTY_DASHBOARD);
        return;
      }

      setAccessState("granted");

      const [refundsResult, billingOrdersResult, shopOrdersResult, catalogResult] = await Promise.allSettled([
        readAdminArray<AdminRefundRowLite>("/api/admin/billing/refunds?limit=200", headers, "requests"),
        readAdminArray<AdminBillingOrderLite>("/api/admin/billing/orders?limit=200", headers, "orders"),
        readAdminArray<AdminShopOrderLite>("/api/admin/shop/orders?limit=200", headers, "orders"),
        readAdminArray<AdminShopProductLite>("/api/admin/shop/catalog", headers, "products"),
      ]);

      const nextDashboard: DashboardState = {
        shop:
          shopOrdersResult.status === "fulfilled" && catalogResult.status === "fulfilled"
            ? buildShopDashboard(shopOrdersResult.value, catalogResult.value)
            : EMPTY_DASHBOARD.shop,
        billing:
          refundsResult.status === "fulfilled" && billingOrdersResult.status === "fulfilled"
            ? buildBillingDashboard(refundsResult.value, billingOrdersResult.value)
            : EMPTY_DASHBOARD.billing,
      };
      setDashboard(nextDashboard);

      const partialFailures: string[] = [];
      if (shopOrdersResult.status === "rejected" || catalogResult.status === "rejected") partialFailures.push("쇼핑 운영");
      if (refundsResult.status === "rejected" || billingOrdersResult.status === "rejected") partialFailures.push("결제·환불 운영");
      setError(partialFailures.length > 0 ? `${partialFailures.join(", ")} 통계를 일부 불러오지 못했습니다.` : null);
    } catch (e: any) {
      setAccessState("denied");
      setDashboard(EMPTY_DASHBOARD);
      setError(parseErrorMessage(String(e?.message ?? "failed_to_load_admin_dashboard")));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const heroMetrics = useMemo(
    () => [
      {
        label: "쇼핑 주문",
        value: dashboard.shop.totalOrders,
        tone: "text-ios-text",
        hint: `활성 상품 ${dashboard.shop.activeProducts}개`,
      },
      {
        label: "발송 대기",
        value: dashboard.shop.readyToShip,
        tone: "text-[color:var(--rnest-accent)]",
        hint: `배송 중 ${dashboard.shop.shipping}건`,
      },
      {
        label: "열린 환불",
        value: dashboard.billing.openRefunds,
        tone: "text-[color:var(--rnest-accent)]",
        hint: `환불 완료 ${dashboard.billing.refunded}건`,
      },
      {
        label: "결제 승인",
        value: dashboard.billing.paidOrders,
        tone: "text-[#0B7A3E]",
        hint: `대기 ${dashboard.billing.queuedPayments}건`,
      },
    ],
    [dashboard]
  );

  const workspaceCards = useMemo(
    () => [
      {
        title: "쇼핑 운영",
        description: "상품 관리, 주문 흐름, 배송 시작, 배송 이슈 대응까지 한 번에 관리합니다.",
        href: "/settings/admin/shop",
        cta: "쇼핑 관리",
        accent: "bg-[#eaf1f8] text-[#17324d]",
        metrics: [
          {
            label: "활성 상품",
            value: dashboard.shop.activeProducts,
            hint: `총 ${dashboard.shop.totalOrders}건 주문`,
            tone: "text-ios-text",
          },
          {
            label: "배송 중",
            value: dashboard.shop.shipping,
            hint: `배송 완료 ${dashboard.shop.delivered}건`,
            tone: "text-[color:var(--rnest-accent)]",
          },
          {
            label: "쇼핑 환불 대기",
            value: dashboard.shop.refundPending,
            hint: `이슈 ${dashboard.shop.issues}건`,
            tone: dashboard.shop.refundPending > 0 ? "text-[#C2410C]" : "text-ios-text",
          },
          {
            label: "누적 매출",
            value: formatKrw(dashboard.shop.totalSales),
            hint: "유효 결제 주문 기준",
            tone: "text-ios-text",
          },
        ],
        chips: [
          `발송 대기 ${dashboard.shop.readyToShip}건`,
          `배송 중 ${dashboard.shop.shipping}건`,
          `배송 완료 ${dashboard.shop.delivered}건`,
        ],
      },
      {
        title: "결제·환불 로그",
        description: "Toss 결제 로그, 환불 상태 전환, 재시도 큐를 같은 기준으로 바로 확인합니다.",
        href: "/settings/admin/refunds",
        cta: "정산 관리",
        accent: "bg-[#eef4fb] text-[#11294b]",
        metrics: [
          {
            label: "열린 환불",
            value: dashboard.billing.openRefunds,
            hint: `총 요청 ${dashboard.billing.totalRefunds}건`,
            tone: "text-[color:var(--rnest-accent)]",
          },
          {
            label: "환불 완료",
            value: dashboard.billing.refunded,
            hint: `실패/거절 ${dashboard.billing.failedRefunds}건`,
            tone: "text-[#0B7A3E]",
          },
          {
            label: "승인 결제",
            value: dashboard.billing.paidOrders,
            hint: `취소/환불 ${dashboard.billing.canceledPayments}건`,
            tone: "text-ios-text",
          },
          {
            label: "결제 시도액",
            value: formatKrw(dashboard.billing.totalAttemptAmount),
            hint: "최근 200건 기준",
            tone: "text-ios-text",
          },
        ],
        chips: [
          `결제 대기 ${dashboard.billing.queuedPayments}건`,
          `승인 ${dashboard.billing.paidOrders}건`,
          `환불 완료 ${dashboard.billing.refunded}건`,
        ],
      },
    ],
    [dashboard]
  );

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/settings"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[18px] text-ios-text shadow-[0_8px_24px_rgba(17,41,75,0.06)]"
        >
          ←
        </Link>
        <div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">운영 관리자</div>
          <div className="text-[12.5px] text-ios-sub">쇼핑과 결제 운영 상태를 한 화면에서 확인하고 바로 이동합니다.</div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className="rnest-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 화면은 관리자 계정 로그인 후 접근할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="rnest-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          {accessState === "granted" ? (
            <>
              <section className="rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(244,248,252,0.95))] p-6 shadow-[0_22px_70px_rgba(17,41,75,0.08)]">
                <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                  <div>
                    <div className="inline-flex rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-[11px] font-semibold text-[#17324d]">
                      운영 센터
                    </div>
                    <div className="mt-4 text-[28px] font-bold tracking-[-0.04em] text-ios-text">
                      통계 확인과 처리 진입을 한 번에
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-ios-sub">
                      쇼핑 주문·배송 통계와 결제·환불 상태를 같은 기준으로 정리해, 어떤 운영 화면으로 들어가야 하는지 바로
                      판단할 수 있게 구성했습니다.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#d9e2ee] bg-white px-3 py-1 text-[11px] font-semibold text-[#41556f]">
                        쇼핑 매출 {formatKrw(dashboard.shop.totalSales)}
                      </span>
                      <span className="rounded-full border border-[#d9e2ee] bg-white px-3 py-1 text-[11px] font-semibold text-[#41556f]">
                        결제 시도액 {formatKrw(dashboard.billing.totalAttemptAmount)}
                      </span>
                      <span className="rounded-full border border-[#d9e2ee] bg-white px-3 py-1 text-[11px] font-semibold text-[#41556f]">
                        처리 필요 {dashboard.shop.readyToShip + dashboard.billing.openRefunds}건
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {heroMetrics.map((metric) => (
                      <AdminMetricCard
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        tone={metric.tone}
                        hint={metric.hint}
                      />
                    ))}
                  </div>
                </div>

                {loading ? <div className="mt-4 text-[12px] text-ios-muted">운영 통계를 불러오는 중...</div> : null}
                {error ? <div className="mt-4 text-[12px] text-red-600">{error}</div> : null}
              </section>

              <section className="mt-4 grid gap-4 xl:grid-cols-2">
                {workspaceCards.map((card) => (
                  <AdminWorkspaceCard key={card.title} {...card} />
                ))}
              </section>
            </>
          ) : (
            <section className="rnest-surface p-5">
              <div className="text-[15px] font-bold text-ios-text">관리자 권한 확인</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">
                {loading
                  ? "관리자 권한을 확인하는 중입니다."
                  : error || "현재 로그인한 계정은 운영 관리자 권한이 없습니다."}
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

export default SettingsAdminPage;
