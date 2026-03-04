"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { formatShopCurrency } from "@/lib/shop";
import { SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";
import { useShopOrderRealtimeRefresh } from "@/components/shop/useShopOrderRealtimeRefresh";

type ShopOrderDetail = {
  orderId: string;
  status: string;
  amount: number;
  subtotalKrw: number;
  shippingFeeKrw: number;
  createdAt: string;
  approvedAt: string | null;
  paymentMethod: string | null;
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

type ShopLiveTrackingState = {
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
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTrackingDateTimeLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

const SECONDARY_BUTTON = SHOP_BUTTON_PRIMARY;

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#edf1f6] py-3 last:border-b-0">
      <span className="text-[12.5px] text-[#8d99ab]">{label}</span>
      <span className="text-right text-[12.5px] text-[#111827]">{value}</span>
    </div>
  );
}

function resolveDetailFlowLabel(order: ShopOrderDetail) {
  if (order.purchaseConfirmedAt) return translate("구매 확정 완료");
  if (order.refund.status === "done") return translate("환불 완료");
  if (order.refund.status === "rejected") return translate("환불 반려");
  if (order.refund.status === "requested") return translate("환불 요청");
  if (order.tracking?.statusLabel) return translate(order.tracking.statusLabel);
  return orderStatusLabel(order.status);
}

function buildDetailFlowDescription(order: ShopOrderDetail) {
  if (order.purchaseConfirmedAt) return translate("결제 확인 · 배송 완료 · 구매 확정까지 모두 마쳤습니다.");
  if (order.refund.status === "done") return translate("환불이 완료되어 주문이 안전하게 마감되었습니다.");
  if (order.refund.status === "rejected") return translate("환불이 반려되어 기존 주문 상태가 유지됩니다.");
  if (order.refund.status === "requested") return translate("환불 요청이 접수되어 관리자 검토를 기다리는 중입니다.");
  if (order.status === "DELIVERED") return translate("상품 수령이 끝났습니다. 구매 확정을 진행하면 리뷰 작성이 열립니다.");
  if (order.status === "SHIPPED") return translate("배송 이동 중입니다. 상품을 받으면 직접 배송 완료 확인이 가능합니다.");
  if (order.status === "PAID") return translate("결제는 확인되었고 발송 준비가 진행 중입니다.");
  return translate("주문 상태를 확인하는 중입니다.");
}

function resolveDetailProgressClass(order: ShopOrderDetail) {
  if (order.purchaseConfirmedAt || order.refund.status === "done") return "w-full";
  if (order.status === "FAILED" || order.status === "CANCELED" || order.refund.status === "rejected") return "w-full";
  if (order.status === "DELIVERED" || order.refund.status === "requested") return "w-[78%]";
  if (order.status === "SHIPPED") return "w-[58%]";
  if (order.status === "PAID") return "w-[32%]";
  return "w-[12%]";
}

function resolveTrackingErrorMessage(code: string | null) {
  const normalized = String(code ?? "").trim();
  if (!normalized) return null;
  if (normalized === "tracking_not_available") return translate("배송 조회에 필요한 택배사 정보가 아직 저장되지 않았습니다.");
  if (normalized === "order_not_trackable") return translate("배송 중 상태 주문만 실시간 조회할 수 있습니다.");
  if (normalized === "missing_config") return translate("배송 조회 연동 설정이 아직 완료되지 않았습니다.");
  if (normalized === "invalid_input") return translate("택배사 또는 운송장 정보가 아직 정확하지 않습니다.");
  if (normalized === "not_found") return translate("택배사 조회 결과가 아직 없습니다. 잠시 후 다시 확인해 주세요.");
  return translate("택배사 정보를 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function StatusTimeline({ order, trackingUrl }: { order: ShopOrderDetail; trackingUrl?: string | null }) {
  if (order.status === "FAILED" || order.status === "CANCELED") {
    return (
      <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
        <h2 className="mb-3 text-[14px] font-bold text-[#111827]">{translate("주문 진행 상태")}</h2>
        <div className="rounded-2xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] text-[#a33a2b]">
          {order.status === "FAILED"
            ? translate("결제 단계에서 주문이 완료되지 않았습니다.")
            : translate("주문이 취소되어 후속 배송이 진행되지 않습니다.")}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
      <h2 className="mb-3 text-[14px] font-bold text-[#111827]">{translate("주문 진행 상태")}</h2>
      <div className="rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] font-semibold text-[#17324d]">{resolveDetailFlowLabel(order)}</div>
          <div className="text-[11px] font-semibold text-[#7b8fa6]">{translate("현재 상태")}</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[#e4ebf3]">
          <div
            className={["h-2 rounded-full bg-[#11294b] transition-[width]", resolveDetailProgressClass(order)].join(" ")}
          />
        </div>
        <div className="mt-3 text-[11.5px] leading-5 text-[#60768d]">
          {buildDetailFlowDescription(order)}
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-3">
        {order.trackingNumber ? (
          <div className="text-[11.5px] leading-5 text-[#60768d]">
            {order.courier ?? "-"} · {order.trackingNumber}
            {trackingUrl ? (
              <>
                {" · "}
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#2b5faa]"
                >
                  {translate("배송 조회하기")}
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ShopOrderDetailPage({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [order, setOrder] = useState<ShopOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionTone, setActionTone] = useState<"error" | "notice">("notice");
  const [actionLoading, setActionLoading] = useState<"refund" | "purchase" | "delivery" | "cancel" | null>(null);
  const [liveTracking, setLiveTracking] = useState<ShopLiveTrackingState | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadOrder = useCallback(
    async (showLoading = false) => {
      if (status !== "authenticated") return;
      if (showLoading && mountedRef.current) setLoading(true);
      if (mountedRef.current) setError(null);

      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/shop/orders/${encodeURIComponent(orderId)}`, {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!mountedRef.current) return;
        if (!res.ok || !json?.ok || !json?.data?.order) throw new Error(String(json?.error ?? `http_${res.status}`));
        setOrder(json.data.order as ShopOrderDetail);
      } catch {
        if (!mountedRef.current) return;
        if (showLoading) {
          setError(t("주문 정보를 불러오지 못했습니다."));
        }
      } finally {
        if (showLoading && mountedRef.current) setLoading(false);
      }
    },
    [orderId, status, t]
  );

  const loadLiveTracking = useCallback(
    async (force = false) => {
      if (status !== "authenticated" || !order) return;
      if (order.status !== "SHIPPED" || !order.trackingNumber) {
        setLiveTracking(null);
        return;
      }
      if (force && mountedRef.current) setTrackingLoading(true);

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
        setLiveTracking({
          statusLabel: json.data.statusLabel ?? null,
          lastEventAt: json.data.lastEventAt ?? null,
          lastPolledAt: json.data.lastPolledAt ?? null,
          trackingUrl: json.data.trackingUrl ?? null,
          delivered: Boolean(json.data.delivered),
          cached: Boolean(json.data.cached),
          error: resolveTrackingErrorMessage(json.data.error ?? null),
        });
        setOrder((current) => {
          if (!current) return current;
          return {
            ...current,
            status: json.data.delivered ? "DELIVERED" : current.status,
            deliveredAt: json.data.delivered
              ? json.data.lastEventAt ?? current.deliveredAt ?? new Date().toISOString()
              : current.deliveredAt,
            tracking: {
              carrierCode: current.tracking?.carrierCode ?? null,
              trackingUrl: json.data.trackingUrl ?? current.tracking?.trackingUrl ?? null,
              statusLabel: json.data.statusLabel ?? current.tracking?.statusLabel ?? null,
              lastEventAt: json.data.lastEventAt ?? current.tracking?.lastEventAt ?? null,
              lastPolledAt: json.data.lastPolledAt ?? current.tracking?.lastPolledAt ?? null,
            },
          };
        });
        if (json.data.delivered) {
          void loadOrder(false);
        }
      } catch (error: any) {
        if (!mountedRef.current) return;
        const code = String(error?.message ?? "");
        setLiveTracking((current) => ({
          statusLabel: current?.statusLabel ?? order.tracking?.statusLabel ?? t("배송 조회중"),
          lastEventAt: current?.lastEventAt ?? order.tracking?.lastEventAt ?? null,
          lastPolledAt: current?.lastPolledAt ?? order.tracking?.lastPolledAt ?? null,
          trackingUrl: current?.trackingUrl ?? order.tracking?.trackingUrl ?? null,
          delivered: current?.delivered ?? Boolean(order.deliveredAt),
          cached: true,
          error: resolveTrackingErrorMessage(code) ?? t("택배사 정보를 다시 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."),
        }));
      } finally {
        if (force && mountedRef.current) setTrackingLoading(false);
      }
    },
    [loadOrder, order, status, t]
  );

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      return;
    }

    void loadOrder(true);

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadOrder(false);
    };

    const intervalId = window.setInterval(refreshIfVisible, 15000); // 30s → 15s: 실시간 연동 실패 시 폴링 응답성 개선
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadOrder, status]);

  useShopOrderRealtimeRefresh({
    enabled: status === "authenticated",
    userId: user?.userId ?? null,
    scope: `shop-order-${orderId}`,
    onRefresh: () => loadOrder(false),
  });

  useEffect(() => {
    if (status !== "authenticated" || !order || order.status !== "SHIPPED" || !order.trackingNumber) {
      setLiveTracking(null);
      setTrackingLoading(false);
      return;
    }

    void loadLiveTracking(false);

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadLiveTracking(false);
    };

    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [loadLiveTracking, order, status]);

  const requestRefund = async () => {
    if (status !== "authenticated" || !order) return;
    setActionMessage(null);
    setActionLoading("refund");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/refund", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId: order.orderId, reason: t("주문 상세에서 접수한 환불 요청") }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      setOrder(json.data.order as ShopOrderDetail);
      setActionTone("notice");
      setActionMessage(
        json?.data?.bundleRefundApplied
          ? t("묶음 주문 전체에 환불 요청이 접수되었습니다. 관리자 검토 후 순차 처리됩니다.")
          : t("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.")
      );
    } catch (error: any) {
      const code = String(error?.message ?? "");
      setActionTone("error");
      if (code.includes("shop_order_storage_unavailable")) {
        setActionMessage(t("주문 저장소 설정이 아직 완료되지 않았습니다. 관리자에게 주문 저장 환경 구성을 확인해 주세요."));
      } else {
        setActionMessage(t("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const confirmPurchase = async () => {
    if (status !== "authenticated" || !order) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(t("정말 구매 확정을 진행하시겠습니까? 확정 후에는 되돌릴 수 없습니다."));
      if (!confirmed) return;
    }
    setActionMessage(null);
    setActionLoading("purchase");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/complete", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      setOrder(json.data.order as ShopOrderDetail);
      setActionTone("notice");
      setActionMessage(t("구매가 확정되었습니다. 이제 해당 상품 리뷰를 작성할 수 있습니다."));
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_confirm_shop_order_purchase");
      setActionTone("error");
      if (code.includes("not_delivered")) {
        setActionMessage(t("배송 완료된 주문만 구매 확정할 수 있습니다."));
      } else if (code.includes("shop_order_storage_unavailable")) {
        setActionMessage(t("주문 저장소 설정이 아직 완료되지 않았습니다. 관리자에게 주문 저장 환경 구성을 확인해 주세요."));
      } else {
        setActionMessage(t("구매 확정 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelivery = async () => {
    if (status !== "authenticated" || !order) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(t("정말 배송확정을 하시겠습니까? 상품을 실제로 받은 경우에만 진행해 주세요."));
      if (!confirmed) return;
    }
    setActionMessage(null);
    setActionLoading("delivery");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/delivered", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      setOrder(json.data.order as ShopOrderDetail);
      setActionTone("notice");
      setActionMessage(t("배송 수령을 확인했습니다. 이제 구매 확정을 진행해 주세요."));
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_confirm_shop_order_delivery");
      setActionTone("error");
      if (code.includes("not_shipped")) {
        setActionMessage(t("배송 중인 주문만 직접 배송 완료 처리할 수 있습니다."));
      } else if (code.includes("shop_order_storage_unavailable")) {
        setActionMessage(t("주문 저장소 설정이 아직 완료되지 않았습니다. 관리자에게 주문 저장 환경 구성을 확인해 주세요."));
      } else {
        setActionMessage(t("배송 완료 확인에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const cancelOrder = async () => {
    if (status !== "authenticated" || !order) return;
    setActionMessage(null);
    setActionLoading("cancel");
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/cancel", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      setOrder(json.data.order as ShopOrderDetail);
      setActionTone("notice");
      setActionMessage(
        json?.data?.refunded
          ? t("주문이 취소되었습니다. 결제 금액이 환불 처리됩니다.")
          : t("주문이 취소되었습니다.")
      );
    } catch (error: any) {
      const code = String(error?.message ?? "");
      setActionTone("error");
      if (code.includes("shop_order_cancel_window_expired") || code.includes("shop_order_already_shipped")) {
        setActionMessage(t("즉시 취소 기간이 지났습니다. 환불 신청을 이용해 주세요."));
      } else if (code.includes("shop_bundle_cancel_use_refund")) {
        setActionMessage(t("묶음 결제 주문은 개별 취소가 불가합니다. 환불 신청을 이용해 주세요."));
      } else {
        setActionMessage(t("주문 취소에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const trackingSnapshot = order
    ? {
        statusLabel: liveTracking?.statusLabel ?? order.tracking?.statusLabel ?? null,
        lastEventAt: liveTracking?.lastEventAt ?? order.tracking?.lastEventAt ?? null,
        lastPolledAt: liveTracking?.lastPolledAt ?? order.tracking?.lastPolledAt ?? null,
        trackingUrl: liveTracking?.trackingUrl ?? order.tracking?.trackingUrl ?? null,
        delivered: liveTracking?.delivered ?? Boolean(order.deliveredAt),
        cached: liveTracking?.cached ?? true,
        error: liveTracking?.error ?? null,
      }
    : null;

  return (
    <div className="-mx-4 pb-24">
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop/orders" label={t("주문 목록으로")} />
          <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("주문 상세")}</h1>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {status !== "authenticated" ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">{t("로그인 후 확인할 수 있습니다.")}</div>
        ) : loading ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">{t("불러오는 중...")}</div>
        ) : error || !order ? (
          <div className="rounded-3xl border border-[#f1d0cc] bg-[#fff6f5] p-5 text-[13px] text-[#a33a2b]">{error ?? t("주문 정보를 찾을 수 없습니다.")}</div>
        ) : (
          <>
            {actionMessage ? (
              <div className={[
                "rounded-3xl px-4 py-3 text-[12.5px]",
                actionTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
              ].join(" ")}>
                {actionMessage}
              </div>
            ) : null}

            {/* 상태 헤더 */}
            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[16px] font-bold text-[#111827]">{t(order.productSnapshot.name)}</div>
                  <div className="mt-1 text-[12px] text-[#8d99ab]">{t("수량")} {order.productSnapshot.quantity}</div>
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${orderStatusClass(order.status)}`}>
                  {orderStatusLabel(order.status)}
                </span>
              </div>
              <div className="mt-4 text-[28px] font-extrabold tracking-[-0.03em] text-[#111827]">
                {formatShopCurrency(order.amount)}
              </div>
              <div className="mt-3 rounded-[20px] border border-[#dbe4ef] bg-[#f7fafc] px-3 py-3 text-[12px] text-[#5b7087]">
                <div className="flex items-center justify-between gap-3">
                  <span>{t("상품 금액")}</span>
                  <span className="font-semibold text-[#425a76]">{formatShopCurrency(order.subtotalKrw)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span>{t("배송비")}</span>
                  <span className="font-semibold text-[#425a76]">
                    {order.shippingFeeKrw > 0 ? formatShopCurrency(order.shippingFeeKrw) : t("무료")}
                  </span>
                </div>
              </div>
            </div>

            <StatusTimeline order={order} trackingUrl={trackingSnapshot?.trackingUrl ?? order.tracking?.trackingUrl} />

            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <h2 className="mb-3 text-[14px] font-bold text-[#111827]">{t("결제·배송 정보")}</h2>

              <div className="rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-1">
                <div className="border-b border-[#edf1f6] py-3 text-[11px] font-semibold text-[#60768d]">{t("주문 정보")}</div>
                <InfoRow label={t("주문번호")} value={<span className="break-all font-mono text-[11px]">{order.orderId}</span>} />
                <InfoRow label={t("주문일시")} value={formatDateLabel(order.createdAt)} />
                {order.approvedAt ? <InfoRow label={t("결제일시")} value={formatDateLabel(order.approvedAt)} /> : null}
                {order.paymentMethod ? <InfoRow label={t("결제수단")} value={order.paymentMethod} /> : null}
                <InfoRow label={t("상품 금액")} value={formatShopCurrency(order.subtotalKrw)} />
                <InfoRow label={t("배송비")} value={order.shippingFeeKrw > 0 ? formatShopCurrency(order.shippingFeeKrw) : t("무료")} />
                {order.status === "FAILED" && order.failMessage ? (
                  <InfoRow label={t("실패 사유")} value={<span className="text-[#a33a2b]">{order.failMessage}</span>} />
                ) : null}
              </div>

              <div className="mt-3 rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-1">
                <div className="border-b border-[#edf1f6] py-3 text-[11px] font-semibold text-[#60768d]">{t("배송 현황")}</div>
                <div className="py-3 text-[11.5px] leading-5 text-[#61758a]">
                  {t("민감정보 보호를 위해 배송 정보는 일부 마스킹되어 표시됩니다.")}
                </div>
                <InfoRow label={t("수령인")} value={order.shipping.recipientName} />
                <InfoRow label={t("연락처")} value={order.shipping.phone} />
                <InfoRow label={t("우편번호")} value={order.shipping.postalCode} />
                <InfoRow
                  label={t("주소")}
                  value={
                    <>
                      {order.shipping.addressLine1}
                      {order.shipping.addressLine2 ? <><br />{order.shipping.addressLine2}</> : null}
                    </>
                  }
                />
                {order.shipping.deliveryNote ? <InfoRow label={t("배송 메모")} value={order.shipping.deliveryNote} /> : null}
                {order.trackingNumber ? (
                  <>
                    <InfoRow label={t("택배사")} value={order.courier ?? "-"} />
                    <InfoRow label={t("운송장번호")} value={<span className="font-mono font-semibold">{order.trackingNumber}</span>} />
                    {trackingSnapshot?.statusLabel ? <InfoRow label={t("배송 상태")} value={t(trackingSnapshot.statusLabel)} /> : null}
                    {trackingSnapshot?.lastEventAt ? <InfoRow label={t("마지막 이벤트")} value={formatTrackingDateTimeLabel(trackingSnapshot.lastEventAt)} /> : null}
                    {order.shippedAt ? <InfoRow label={t("발송일")} value={formatDateLabel(order.shippedAt)} /> : null}
                    {order.deliveredAt ? <InfoRow label={t("배송 완료")} value={formatDateLabel(order.deliveredAt)} /> : null}
                    {order.status === "SHIPPED" ? (
                      <div className="py-3">
                        <div className="rounded-[24px] border border-[#dbe4ef] bg-white px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-[11px] font-semibold text-[#60768d]">{t("실시간 배송 확인")}</div>
                              <div className="mt-1 text-[14px] font-semibold text-[#17324d]">
                                {trackingSnapshot?.statusLabel ? t(trackingSnapshot.statusLabel) : t("택배사 상태를 확인하는 중입니다.")}
                              </div>
                              <div className="mt-1 text-[11.5px] leading-5 text-[#60768d]">
                                {trackingSnapshot?.lastPolledAt
                                  ? `${t("마지막 확인")} ${formatTrackingDateTimeLabel(trackingSnapshot.lastPolledAt)}`
                                  : t("택배사 상태가 갱신되면 여기에 바로 반영됩니다.")}
                              </div>
                            </div>
                            <button
                              type="button"
                              data-auth-allow
                              onClick={() => void loadLiveTracking(true)}
                              disabled={trackingLoading}
                              className="inline-flex h-10 min-w-[108px] items-center justify-center rounded-full border border-[#d7dfeb] bg-[#f8fafc] px-4 text-[12px] font-semibold text-[#11294b] transition hover:border-[#11294b]"
                            >
                              {trackingLoading ? t("확인 중...") : t("지금 확인")}
                            </button>
                          </div>
                          {trackingSnapshot?.trackingUrl ? (
                            <a
                              href={trackingSnapshot.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex text-[12px] font-semibold text-[#2b5faa]"
                            >
                              {t("택배사 배송 조회 열기")}
                            </a>
                          ) : null}
                          {trackingSnapshot?.error ? (
                            <div className="mt-3 rounded-2xl border border-[#edf1f6] bg-[#f8fafc] px-3 py-2 text-[11.5px] leading-5 text-[#60768d]">
                              {trackingSnapshot.error}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            {(order.status === "READY" ||
              order.status === "SHIPPED" ||
              order.status === "DELIVERED" ||
              Boolean(order.purchaseConfirmedAt) ||
              order.refund.status !== "none" ||
              (order.status === "PAID" && order.refund.status === "none")) ? (
              <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
                <h2 className="mb-3 text-[14px] font-bold text-[#111827]">{t("후속 처리")}</h2>

                {order.status === "READY" ? (
                  <div className="rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4">
                    <div className="text-[11px] font-semibold text-[#60768d]">{t("주문 취소")}</div>
                    <div className="mt-2 rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[12.5px] leading-6 text-[#44556d]">
                      {t("결제가 완료되기 전 주문은 즉시 취소할 수 있습니다.")}
                    </div>
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void cancelOrder()}
                      disabled={actionLoading === "cancel"}
                      className={`${SECONDARY_BUTTON} mt-4 h-11 w-full text-[13px]`}
                    >
                      {actionLoading === "cancel" ? t("처리 중...") : t("주문 취소")}
                    </button>
                  </div>
                ) : null}

                {order.status === "PAID" && !order.shippedAt && order.refund.status === "none" &&
                  order.approvedAt && Date.now() - new Date(order.approvedAt).getTime() < 60 * 60 * 1000 ? (
                  <div className="rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4">
                    <div className="text-[11px] font-semibold text-[#60768d]">{t("주문 취소")}</div>
                    <div className="mt-2 rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[12.5px] leading-6 text-[#44556d]">
                      {t("결제 후 1시간 이내 발송 전 주문은 즉시 취소 및 환불이 가능합니다.")}
                    </div>
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void cancelOrder()}
                      disabled={actionLoading === "cancel"}
                      className={`${SECONDARY_BUTTON} mt-4 h-11 w-full text-[13px]`}
                    >
                      {actionLoading === "cancel" ? t("처리 중...") : t("주문 취소 및 환불")}
                    </button>
                  </div>
                ) : null}

                {order.status === "SHIPPED" && !order.deliveredAt ? (
                  <div className="rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4">
                    <div className="text-[11px] font-semibold text-[#60768d]">{t("배송 완료")}</div>
                    <div className="mt-2 rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[12.5px] leading-6 text-[#44556d]">
                      {t("실시간 배송 반영이 늦을 수 있어 상품을 받았다면 직접 배송 완료를 확인할 수 있습니다.")}
                    </div>
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void confirmDelivery()}
                      disabled={actionLoading === "delivery"}
                      className={`${SECONDARY_BUTTON} mt-4 h-11 w-full text-[13px]`}
                    >
                      {actionLoading === "delivery" ? t("처리 중...") : t("배송 완료 확인")}
                    </button>
                  </div>
                ) : null}

                {(order.status === "DELIVERED" || Boolean(order.purchaseConfirmedAt)) ? (
                  <div className={`${order.status === "SHIPPED" && !order.deliveredAt ? "mt-3 " : ""}rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4`}>
                    <div className="text-[11px] font-semibold text-[#60768d]">{t("구매 확정")}</div>
                    {order.purchaseConfirmedAt ? (
                      <>
                        <div className="mt-2 text-[12px] font-semibold text-[#17324d]">{t("구매 확정 완료")}</div>
                        <div className="mt-1 text-[11.5px] text-[#60768d]">{formatDateLabel(order.purchaseConfirmedAt)}</div>
                        <div className="mt-3 rounded-2xl border border-[#d7dfeb] bg-[#eef4fb] px-4 py-3 text-[12px] leading-5 text-[#102a43]">
                          {t("구매 확정이 완료되어 이 계정으로 리뷰를 작성할 수 있습니다.")}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[12.5px] leading-6 text-[#44556d]">
                          {t("배송지와 수령 정보를 확인한 뒤 구매를 확정하면 리뷰 작성 권한이 활성화됩니다.")}
                        </div>
                        <button
                          type="button"
                          data-auth-allow
                          onClick={() => void confirmPurchase()}
                          disabled={actionLoading === "purchase"}
                          className={`${SECONDARY_BUTTON} mt-4 h-11 w-full text-[13px]`}
                        >
                          {actionLoading === "purchase" ? t("처리 중...") : t("구매 확정하기")}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}

                {order.refund.status !== "none" ? (
                  <div className="mt-3 rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4">
                    <div className="text-[11px] font-semibold text-[#60768d]">{t("환불 상태")}</div>
                    <div className="mt-2 text-[12px] font-semibold text-[#17324d]">
                      {order.refund.status === "requested"
                        ? t("검토 중")
                        : order.refund.status === "rejected"
                          ? t("반려됨")
                          : t("완료")}
                    </div>
                    {order.refund.reason ? (
                      <div className="mt-1 text-[11.5px] text-[#60768d]">
                        {t("요청 사유")} · {order.refund.reason}
                      </div>
                    ) : null}
                    {order.refund.note ? (
                      <div className="mt-1 text-[11.5px] text-[#60768d]">
                        {t("처리 메모")} · {order.refund.note}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {order.status === "PAID" && order.refund.status === "none" ? (
                  <div className="mt-3 rounded-2xl border border-[#dbe4ef] bg-[#f8fafc] px-4 py-4">
                    <div className="text-[11px] font-semibold text-[#60768d]">{t("환불 상태")}</div>
                    <div className="mt-2 text-[12px] text-[#44556d]">{t("결제 완료 후 아직 별도 요청이 없습니다.")}</div>
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void requestRefund()}
                      disabled={actionLoading === "refund"}
                      className={`${SECONDARY_BUTTON} mt-4 h-11 w-full text-[13px]`}
                    >
                      {actionLoading === "refund" ? t("처리 중...") : t("환불 요청하기")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
