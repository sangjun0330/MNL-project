"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { formatShopCurrency } from "@/lib/shop";
import { SHOP_BUTTON_ACTIVE, SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";
import { useShopOrderRealtimeRefresh } from "@/components/shop/useShopOrderRealtimeRefresh";

type ShopOrderSummary = {
  orderId: string;
  status: string;
  amount: number;
  subtotalKrw: number;
  shippingFeeKrw: number;
  createdAt: string;
  approvedAt: string | null;
  failMessage: string | null;
  productSnapshot: { name: string; quantity: number };
  shipping: {
    recipientName: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string;
    deliveryNote: string;
  };
  refund: { status: string; reason: string | null; note: string | null };
  trackingNumber: string | null;
  courier: string | null;
  tracking: {
    carrierCode: string | null;
    trackingUrl: string | null;
    statusLabel: string | null;
    lastEventAt: string | null;
    lastPolledAt: string | null;
  } | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  purchaseConfirmedAt: string | null;
};

type ShopOrderTrackingSnapshot = {
  statusLabel: string | null;
  lastEventAt: string | null;
  lastPolledAt: string | null;
  trackingUrl: string | null;
  delivered: boolean;
  cached: boolean;
  error: string | null;
};

function orderStatusLabel(status: string) {
  const map: Record<string, string> = {
    READY: "결제 대기",
    PAID: "결제 완료",
    SHIPPED: "배송 중",
    DELIVERED: "배달 완료",
    FAILED: "결제 실패",
    CANCELED: "주문 취소",
    REFUND_REQUESTED: "환불 요청",
    REFUND_REJECTED: "환불 반려",
    REFUNDED: "환불 완료",
  };
  return translate(map[status] ?? status);
}

function orderStatusClass(status: string) {
  if (status === "PAID" || status === "SHIPPED" || status === "DELIVERED" || status === "REFUNDED") {
    return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  }
  if (status === "FAILED" || status === "REFUND_REJECTED") {
    return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  }
  return "border-[#dfe5ee] bg-[#f7f8fb] text-[#3d4d63]";
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function maskTrackingNumber(value: string | null) {
  const safe = String(value ?? "").trim();
  if (!safe) return "-";
  if (safe.length <= 4) return `${safe.slice(0, 1)}***`;
  return `${safe.slice(0, 3)}••••${safe.slice(-4)}`;
}

const PRIMARY_BUTTON = SHOP_BUTTON_ACTIVE;
const SECONDARY_BUTTON = SHOP_BUTTON_PRIMARY;
const ORDERS_PER_PAGE = 12;
type OrderFilter = "all" | "active" | "closed";

function isOrderClosed(order: ShopOrderSummary) {
  if (order.purchaseConfirmedAt) return true;
  return (
    order.status === "FAILED" ||
    order.status === "CANCELED" ||
    order.status === "REFUND_REJECTED" ||
    order.status === "REFUNDED"
  );
}

function resolveOrderFlowLabel(order: ShopOrderSummary) {
  if (order.purchaseConfirmedAt) return translate("구매 확정 완료");
  if (order.refund.status === "done") return translate("환불 완료");
  if (order.refund.status === "rejected") return translate("환불 반려");
  if (order.refund.status === "requested") return translate("환불 요청");
  if (order.tracking?.statusLabel) return translate(order.tracking.statusLabel);
  return orderStatusLabel(order.status);
}

function buildOrderFlowDescription(order: ShopOrderSummary) {
  if (order.purchaseConfirmedAt) return translate("결제 확인 · 배송 완료 · 구매 확정 완료");
  if (order.refund.status === "done") return translate("환불이 완료되어 주문이 마감되었습니다.");
  if (order.refund.status === "rejected") return translate("환불 반려 후 기존 주문 흐름이 유지됩니다.");
  if (order.refund.status === "requested") return translate("환불 요청이 접수되어 관리자 검토를 기다리는 중입니다.");
  if (order.status === "FAILED") return translate("결제 단계에서 주문이 완료되지 않았습니다.");
  if (order.status === "CANCELED") return translate("주문이 취소되어 더 이상 진행되지 않습니다.");
  if (order.status === "DELIVERED") return translate("배송 완료 · 구매 확정 대기");
  if (order.status === "SHIPPED") return translate("배송 이동 중 · 상품 수령 후 직접 배송 완료 확인 가능");
  if (order.status === "PAID") return translate("결제 확인 · 배송 준비 중");
  return translate("결제 대기");
}

function resolveTrackingErrorMessage(code: string | null) {
  const normalized = String(code ?? "").trim();
  if (!normalized) return null;
  if (normalized === "missing_config") return translate("배송 조회 연동 설정이 아직 완료되지 않았습니다.");
  if (normalized === "invalid_input") return translate("택배사 또는 운송장 정보가 아직 정확하지 않습니다.");
  if (normalized === "not_found") return translate("택배사 조회 결과가 아직 없습니다. 잠시 후 다시 확인해 주세요.");
  return translate("택배사 정보를 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export function ShopOrdersPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [trackingByOrderId, setTrackingByOrderId] = useState<Record<string, ShopOrderTrackingSnapshot>>({});
  const [trackingLoadingId, setTrackingLoadingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  const currentOffset = (page - 1) * ORDERS_PER_PAGE;
  const fetchLimit = filter === "all" ? ORDERS_PER_PAGE : 48;
  const fetchOffset = filter === "all" ? currentOffset : 0;
  const visibleOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "active") return orders.filter((order) => !isOrderClosed(order));
    return orders.filter((order) => isOrderClosed(order));
  }, [filter, orders]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOrders = useCallback(
    async (showLoading = false) => {
      if (status !== "authenticated" || !user?.userId) return;
      if (showLoading && mountedRef.current) setLoading(true);

      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/shop/orders?limit=${fetchLimit}&offset=${fetchOffset}`, {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!mountedRef.current) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) throw new Error();
        setOrders(json.data.orders as ShopOrderSummary[]);
        setTotal(Math.max(0, Number(json?.data?.total ?? 0)));
      } catch {
        if (!mountedRef.current) return;
        if (showLoading) {
          setOrders([]);
          setTotal(0);
        }
      } finally {
        if (showLoading && mountedRef.current) setLoading(false);
      }
    },
    [fetchLimit, fetchOffset, status, user?.userId]
  );

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setOrders([]);
      setTotal(0);
      setLoading(false);
      return () => { active = false; };
    }

    void loadOrders(true);

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!active) return;
      void loadOrders(false);
    };

    const intervalId = window.setInterval(refreshIfVisible, 30000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadOrders, status, user?.userId]);

  useShopOrderRealtimeRefresh({
    enabled: status === "authenticated",
    userId: user?.userId ?? null,
    scope: "shop-orders-page",
    onRefresh: () => loadOrders(false),
  });

  const loadTrackingSnapshot = useCallback(
    async (order: ShopOrderSummary, force = false) => {
      if (status !== "authenticated") return;
      if (order.status !== "SHIPPED" || !order.trackingNumber) return;
      if (force) setTrackingLoadingId(order.orderId);

      try {
        const headers = await authHeaders();
        const query = new URLSearchParams({ orderId: order.orderId });
        if (force) query.set("force", "1");
        const res = await fetch(`/api/shop/tracking?${query.toString()}`, {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!mountedRef.current) return;
        if (!res.ok || !json?.ok || !json?.data) throw new Error(String(json?.error ?? `http_${res.status}`));
        setTrackingByOrderId((current) => ({
          ...current,
          [order.orderId]: {
            statusLabel: json.data.statusLabel ?? null,
            lastEventAt: json.data.lastEventAt ?? null,
            lastPolledAt: json.data.lastPolledAt ?? null,
            trackingUrl: json.data.trackingUrl ?? null,
            delivered: Boolean(json.data.delivered),
            cached: Boolean(json.data.cached),
            error: resolveTrackingErrorMessage(json.data.error ?? null),
          },
        }));
        if (json.data.delivered) {
          void loadOrders(false);
        }
      } catch {
        if (!mountedRef.current) return;
        setTrackingByOrderId((current) => ({
          ...current,
          [order.orderId]: {
            statusLabel: current[order.orderId]?.statusLabel ?? order.tracking?.statusLabel ?? t("배송 조회중"),
            lastEventAt: current[order.orderId]?.lastEventAt ?? order.tracking?.lastEventAt ?? null,
            lastPolledAt: current[order.orderId]?.lastPolledAt ?? order.tracking?.lastPolledAt ?? null,
            trackingUrl: current[order.orderId]?.trackingUrl ?? order.tracking?.trackingUrl ?? null,
            delivered: current[order.orderId]?.delivered ?? Boolean(order.deliveredAt),
            cached: true,
            error: t("택배사 정보를 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."),
          },
        }));
      } finally {
        if (force) setTrackingLoadingId(null);
      }
    },
    [loadOrders, status, t]
  );

  useEffect(() => {
    if (status !== "authenticated") {
      setTrackingByOrderId({});
      setTrackingLoadingId(null);
      return;
    }

    const trackableOrders = visibleOrders
      .filter((order) => order.status === "SHIPPED" && Boolean(order.trackingNumber))
      .slice(0, 3);

    if (trackableOrders.length === 0) {
      setTrackingByOrderId({});
      setTrackingLoadingId(null);
      return;
    }

    void Promise.all(trackableOrders.map((order) => loadTrackingSnapshot(order, false)));

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all(trackableOrders.map((order) => loadTrackingSnapshot(order, false)));
    };

    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadTrackingSnapshot, status, visibleOrders]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const nextFilter = searchParams.get("filter");
    if (nextFilter === "all" || nextFilter === "active" || nextFilter === "closed") {
      setFilter(nextFilter);
      return;
    }
    if (nextFilter === "progress" || nextFilter === "delivered") {
      setFilter("active");
      return;
    }
    if (nextFilter === "refund" || nextFilter === "issue") {
      setFilter("closed");
    }
  }, [searchParams]);

  const requestRefund = async (orderId: string) => {
    if (status !== "authenticated") return;
    setMessage(null);
    setActionLoadingId(orderId);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/refund", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId, reason: t("주문 내역 페이지에서 접수한 환불 요청") }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      const nextOrders = Array.isArray(json?.data?.orders) ? (json.data.orders as ShopOrderSummary[]) : [];
      const nextOrder = (json.data.order as ShopOrderSummary) ?? nextOrders[0];
      const nextOrderMap = new Map(nextOrders.map((item) => [item.orderId, item] as const));
      setOrders((current) => {
        const replaced = current.map((item) => nextOrderMap.get(item.orderId) ?? item);
        if (!nextOrder) return replaced;
        if (replaced.some((item) => item.orderId === nextOrder.orderId)) return replaced;
        return [nextOrder, ...replaced];
      });
      setMessageTone("notice");
      setMessage(
        json?.data?.bundleRefundApplied
          ? t("묶음 주문 전체에 환불 요청이 접수되었습니다. 관리자 검토 후 순차 처리됩니다.")
          : t("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.")
      );
    } catch (error: any) {
      setMessageTone("error");
      setMessage(t("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmDelivery = async (orderId: string) => {
    if (status !== "authenticated") return;
    setMessage(null);
    setActionLoadingId(orderId);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/delivered", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      const nextOrder = json.data.order as ShopOrderSummary;
      setOrders((current) => current.map((item) => (item.orderId === nextOrder.orderId ? nextOrder : item)));
      setMessageTone("notice");
      setMessage(t("배송 수령을 확인했습니다. 이제 구매 확정을 진행해 주세요."));
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_confirm_shop_order_delivery");
      setMessageTone("error");
      if (code.includes("not_shipped")) {
        setMessage(t("배송 중인 주문만 직접 배송 완료 처리할 수 있습니다."));
      } else {
        setMessage(t("배송 완료 확인에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const confirmPurchase = async (orderId: string) => {
    if (status !== "authenticated") return;
    setMessage(null);
    setActionLoadingId(orderId);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/complete", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      const nextOrder = json.data.order as ShopOrderSummary;
      setOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)]);
      setMessageTone("notice");
      setMessage(t("구매가 확정되었습니다. 이제 해당 상품 리뷰를 작성할 수 있습니다."));
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_confirm_shop_order_purchase");
      setMessageTone("error");
      if (code.includes("not_delivered")) {
        setMessage(t("배송 완료된 주문만 구매 확정할 수 있습니다."));
      } else {
        setMessage(t("구매 확정 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="-mx-4 pb-24">
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop" label={t("쇼핑으로 돌아가기")} />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("내 주문 내역")}</h1>
            {!loading && <p className="text-[12px] text-[#65748b]">{t("전체")} {total} {t("건")}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {message ? (
          <div className={[
            "rounded-3xl px-4 py-3 text-[12.5px] leading-5",
            messageTone === "error"
              ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]"
              : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
          ].join(" ")}>
            {message}
          </div>
        ) : null}

        {status === "authenticated" && !loading ? (
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "all", label: "전체" },
              { key: "active", label: "진행 중" },
              { key: "closed", label: "완료" },
            ] as { key: OrderFilter; label: string }[]).map((item) => (
              <button
                key={item.key}
                type="button"
                data-auth-allow
                onClick={() => setFilter(item.key)}
                className={[
                  "rounded-3xl border px-3 py-3 text-[12px] font-semibold transition",
                  filter === item.key
                    ? "border-[#17324d] bg-[#eaf1f8] text-[#17324d]"
                    : "border-[#d7dfeb] bg-white text-[#60768d]",
                ].join(" ")}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        ) : null}

        {status !== "authenticated" ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">
            {t("로그인 후 주문 내역을 확인할 수 있습니다.")}
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">
            {t("주문 내역을 불러오는 중입니다...")}
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <p className="text-[14px] font-semibold text-[#111827]">{filter === "all" ? t("아직 주문이 없습니다") : t("선택한 상태의 주문이 없습니다")}</p>
            <p className="mt-1 text-[13px] text-[#65748b]">
              {filter === "all" ? t("상품 상세 페이지에서 바로 결제할 수 있습니다.") : t("다른 필터를 선택해 주문 상태를 다시 확인해 주세요.")}
            </p>
            <div className="mt-4">
              <Link href="/shop" data-auth-allow className={`${PRIMARY_BUTTON} h-10 text-[13px]`}>{t("쇼핑하러 가기")}</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleOrders.map((order) => (
              <div key={order.orderId} className="rounded-3xl border border-[#edf1f6] bg-white px-4 py-4">
                {(() => {
                  const trackingSnapshot = trackingByOrderId[order.orderId];
                  const liveFlowLabel = trackingSnapshot?.statusLabel ? t(trackingSnapshot.statusLabel) : resolveOrderFlowLabel(order);
                  const liveFlowDescription = trackingSnapshot?.delivered ? t("배송 완료 · 구매 확정 대기") : buildOrderFlowDescription(order);
                  const liveTrackingUrl = trackingSnapshot?.trackingUrl ?? order.tracking?.trackingUrl ?? null;

                  return (
                    <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-[#8d99ab]">{formatDateLabel(order.createdAt)}</div>
                    <div className="mt-1 text-[15px] font-semibold text-[#111827]">{t(order.productSnapshot.name)}</div>
                    <div className="mt-1 text-[11.5px] text-[#66788f]">
                      {t("수량")} {order.productSnapshot.quantity} · {t("총 결제 금액")} {formatShopCurrency(order.amount)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                </div>

                <div className="mt-3 rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[#17324d]">{liveFlowLabel}</div>
                      <div className="mt-1 text-[11.5px] leading-5 text-[#60768d]">{liveFlowDescription}</div>
                    </div>
                    <div className="shrink-0 text-[11px] font-semibold text-[#7b8fa6]">{t("현재 상태")}</div>
                  </div>
                  <div className="mt-2 text-[11.5px] text-[#60768d]">
                    {t("상품 금액")} {formatShopCurrency(order.subtotalKrw)} · {t("배송비")}{" "}
                    {order.shippingFeeKrw > 0 ? formatShopCurrency(order.shippingFeeKrw) : t("무료")}
                  </div>
                  {order.trackingNumber ? (
                    <div className="mt-1 text-[11.5px] text-[#60768d]">
                      {order.courier ?? "-"} · {maskTrackingNumber(order.trackingNumber)}
                      {liveTrackingUrl ? (
                        <>
                          {" · "}
                          <a href={liveTrackingUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#2b5faa]">
                            {t("배송조회")}
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {order.purchaseConfirmedAt ? (
                  <div className="mt-1 text-[11px] text-[#60768d]">{formatDateLabel(order.purchaseConfirmedAt)}</div>
                  ) : null}
                </div>

                {order.status === "SHIPPED" && order.trackingNumber ? (
                  <div className="mt-2 rounded-2xl border border-[#e5ecf4] bg-[#fbfcfe] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#60768d]">{t("실시간 배송 확인")}</div>
                        <div className="mt-1 text-[12px] font-semibold text-[#17324d]">
                          {trackingSnapshot?.statusLabel ? t(trackingSnapshot.statusLabel) : t("택배사 상태를 확인하는 중입니다.")}
                        </div>
                        <div className="mt-1 text-[11px] leading-5 text-[#60768d]">
                          {trackingSnapshot?.lastPolledAt
                            ? `${t("마지막 확인")} ${formatDateLabel(trackingSnapshot.lastPolledAt)}`
                            : t("택배사 상태가 갱신되면 여기에 바로 반영됩니다.")}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-auth-allow
                        onClick={() => void loadTrackingSnapshot(order, true)}
                        disabled={trackingLoadingId === order.orderId}
                        className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-full border border-[#d7dfeb] bg-white px-3 text-[11px] font-semibold text-[#11294b] transition hover:border-[#11294b]"
                      >
                        {trackingLoadingId === order.orderId ? t("확인 중...") : t("지금 확인")}
                      </button>
                    </div>
                    {trackingSnapshot?.error ? (
                      <div className="mt-2 text-[11px] text-[#60768d]">{trackingSnapshot.error}</div>
                    ) : null}
                  </div>
                ) : null}

                {order.refund.status === "requested" ? (
                  <div className="mt-2 text-[11.5px] text-[#65748b]">{t("환불 요청 접수됨")} · {order.refund.reason ?? t("사유 없음")}</div>
                ) : null}
                {order.refund.status === "rejected" ? (
                  <div className="mt-2 text-[11.5px] text-[#a33a2b]">{t("환불 반려")} · {order.refund.note ?? t("사유 없음")}</div>
                ) : null}
                {order.status === "FAILED" && order.failMessage ? (
                  <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/shop/orders/${encodeURIComponent(order.orderId)}`} data-auth-allow className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                    {t("상세 보기")}
                  </Link>
                  {order.status === "SHIPPED" && !order.deliveredAt ? (
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void confirmDelivery(order.orderId)}
                      disabled={actionLoadingId === order.orderId}
                      className={`${SECONDARY_BUTTON} h-9 text-[11px]`}
                    >
                      {actionLoadingId === order.orderId ? t("처리 중...") : t("배송 완료 확인")}
                    </button>
                  ) : null}
                  {order.status === "DELIVERED" && !order.purchaseConfirmedAt ? (
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void confirmPurchase(order.orderId)}
                      disabled={actionLoadingId === order.orderId}
                      className={`${SECONDARY_BUTTON} h-9 text-[11px]`}
                    >
                      {actionLoadingId === order.orderId ? t("처리 중...") : t("구매 확정")}
                    </button>
                  ) : null}
                  {order.status === "PAID" && order.refund.status === "none" ? (
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void requestRefund(order.orderId)}
                      disabled={actionLoadingId === order.orderId}
                      className={`${SECONDARY_BUTTON} h-9 text-[11px]`}
                    >
                      {t("환불 요청")}
                    </button>
                  ) : null}
                </div>
                    </>
                  );
                })()}
              </div>
            ))}

            {filter === "all" && totalPages > 1 ? (
              <div className="flex items-center justify-center gap-2 pt-3">
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-white text-[#8d99ab] disabled:opacity-40"
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
                  .map((value) => (
                    <button
                      key={value}
                      type="button"
                      data-auth-allow
                      onClick={() => setPage(value)}
                      className={[
                        "inline-flex h-11 min-w-[44px] items-center justify-center rounded-2xl border px-3 text-[13px] font-semibold",
                        value === page
                          ? "border-[#11294b] bg-[#11294b] text-white"
                          : "border-[#d7dfeb] bg-white text-[#11294b]",
                      ].join(" ")}
                    >
                      {value}
                    </button>
                  ))}
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-white text-[#8d99ab] disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
