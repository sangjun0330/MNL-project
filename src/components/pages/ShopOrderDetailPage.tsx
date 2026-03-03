"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { formatShopCurrency } from "@/lib/shop";
import { SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { translate } from "@/lib/i18n";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";

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
  shippedAt: string | null;
  deliveredAt: string | null;
  purchaseConfirmedAt: string | null;
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

const SECONDARY_BUTTON = SHOP_BUTTON_PRIMARY;

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#edf1f6] py-3 last:border-b-0">
      <span className="text-[12.5px] text-[#8d99ab]">{label}</span>
      <span className="text-right text-[12.5px] text-[#111827]">{value}</span>
    </div>
  );
}

function StatusTimeline({ status, purchaseConfirmedAt }: { status: string; purchaseConfirmedAt: string | null }) {
  const steps = [
    { key: "order", label: translate("주문 접수"), done: true },
    {
      key: "paid",
      label: translate("결제 완료"),
      done: ["PAID", "SHIPPED", "DELIVERED", "REFUND_REQUESTED", "REFUND_REJECTED", "REFUNDED"].includes(status),
    },
    {
      key: "shipped",
      label: translate("배송 중"),
      done: ["SHIPPED", "DELIVERED", "REFUND_REQUESTED", "REFUND_REJECTED", "REFUNDED"].includes(status),
    },
    {
      key: "delivered",
      label: translate("배송 완료"),
      done: ["DELIVERED", "REFUND_REQUESTED", "REFUND_REJECTED", "REFUNDED"].includes(status),
    },
    {
      key: "purchase",
      label: translate("구매 확정"),
      done: Boolean(purchaseConfirmedAt),
    },
  ];

  if (status === "FAILED" || status === "CANCELED") {
    return (
      <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
        <h2 className="mb-3 text-[14px] font-bold text-[#111827]">{translate("주문 진행 상태")}</h2>
        <div className="rounded-2xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] text-[#a33a2b]">
          {status === "FAILED" ? translate("결제 단계에서 주문이 완료되지 않았습니다.") : translate("주문이 취소되어 후속 배송이 진행되지 않습니다.")}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
      <h2 className="mb-3 text-[14px] font-bold text-[#111827]">{translate("주문 진행 상태")}</h2>
      <div className="grid grid-cols-5 gap-2">
        {steps.map((step, index) => (
          <div key={step.key} className="relative">
            {index < steps.length - 1 ? (
              <div className={["absolute left-[calc(50%+12px)] right-[-50%] top-3 h-[2px]", step.done ? "bg-[#102a43]" : "bg-[#d7dfeb]"].join(" ")} />
            ) : null}
            <div className="relative flex flex-col items-center gap-2 text-center">
              <div
                className={[
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold",
                  step.done ? "border-[#102a43] bg-[#102a43] text-white" : "border-[#d7dfeb] bg-white text-[#8d99ab]",
                ].join(" ")}
              >
                {index + 1}
              </div>
              <div className={["text-[11px] font-semibold leading-4", step.done ? "text-[#11294b]" : "text-[#8d99ab]"].join(" ")}>
                {step.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShopOrderDetailPage({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const { status } = useAuthState();
  const [order, setOrder] = useState<ShopOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionTone, setActionTone] = useState<"error" | "notice">("notice");
  const [actionLoading, setActionLoading] = useState<"refund" | "purchase" | null>(null);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated") {
      setLoading(false);
      return () => { active = false; };
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/shop/orders/${encodeURIComponent(orderId)}`, {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !json?.data?.order) throw new Error(String(json?.error ?? `http_${res.status}`));
        setOrder(json.data.order as ShopOrderDetail);
      } catch {
        if (!active) return;
        setError(t("주문 정보를 불러오지 못했습니다."));
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [orderId, status, t]);

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
      if (!res.ok || !json?.ok) throw new Error();
      setOrder(json.data.order as ShopOrderDetail);
      setActionTone("notice");
      setActionMessage(
        json?.data?.bundleRefundApplied
          ? t("묶음 주문 전체에 환불 요청이 접수되었습니다. 관리자 검토 후 순차 처리됩니다.")
          : t("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.")
      );
    } catch {
      setActionTone("error");
      setActionMessage(t("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setActionLoading(null);
    }
  };

  const confirmPurchase = async () => {
    if (status !== "authenticated" || !order) return;
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
      } else {
        setActionMessage(t("구매 확정 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setActionLoading(null);
    }
  };

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

            <StatusTimeline status={order.status} purchaseConfirmedAt={order.purchaseConfirmedAt} />

            {/* 주문 정보 */}
            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-[#111827]">{t("주문 정보")}</h2>
              <InfoRow label={t("주문번호")} value={<span className="break-all font-mono text-[11px]">{order.orderId}</span>} />
              <InfoRow label={t("주문일시")} value={formatDateLabel(order.createdAt)} />
              {order.approvedAt ? <InfoRow label={t("결제일시")} value={formatDateLabel(order.approvedAt)} /> : null}
              {order.purchaseConfirmedAt ? <InfoRow label={t("구매 확정")} value={formatDateLabel(order.purchaseConfirmedAt)} /> : null}
              {order.paymentMethod ? <InfoRow label={t("결제수단")} value={order.paymentMethod} /> : null}
              <InfoRow label={t("상품 금액")} value={formatShopCurrency(order.subtotalKrw)} />
              <InfoRow label={t("배송비")} value={order.shippingFeeKrw > 0 ? formatShopCurrency(order.shippingFeeKrw) : t("무료")} />
              {order.status === "FAILED" && order.failMessage ? (
                <InfoRow label={t("실패 사유")} value={<span className="text-[#a33a2b]">{order.failMessage}</span>} />
              ) : null}
            </div>

            {/* 배송지 */}
            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-[#111827]">{t("배송지")}</h2>
              <div className="mb-2 rounded-2xl border border-[#dbe4ef] bg-[#f7fafc] px-3 py-3 text-[11.5px] leading-5 text-[#61758a]">
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
            </div>

            {/* 배송 추적 */}
            {order.trackingNumber ? (
              <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
                <h2 className="mb-1 text-[14px] font-bold text-[#111827]">{t("배송 현황")}</h2>
                <InfoRow label={t("택배사")} value={order.courier ?? "-"} />
                <InfoRow label={t("운송장번호")} value={<span className="font-mono font-semibold">{order.trackingNumber}</span>} />
                {order.shippedAt ? <InfoRow label={t("발송일")} value={formatDateLabel(order.shippedAt)} /> : null}
                {order.deliveredAt ? <InfoRow label={t("배달 완료")} value={formatDateLabel(order.deliveredAt)} /> : null}
                {order.courier && order.trackingNumber ? (
                  <div className="mt-3">
                    <a
                      href={`https://trace.cjlogistics.com/web/detail.jsp?slipno=${order.trackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${SECONDARY_BUTTON} h-9 text-[11px]`}
                    >
                      {t("배송 조회하기")} →
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(order.status === "DELIVERED" || Boolean(order.purchaseConfirmedAt)) ? (
              <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
                <h2 className="mb-1 text-[14px] font-bold text-[#111827]">{t("구매 확정")}</h2>
                {order.purchaseConfirmedAt ? (
                  <>
                    <InfoRow label={t("확정일시")} value={formatDateLabel(order.purchaseConfirmedAt)} />
                    <div className="mt-3 rounded-2xl border border-[#d7dfeb] bg-[#eef4fb] px-4 py-3 text-[12px] leading-5 text-[#102a43]">
                      {t("구매 확정이 완료되어 이 계정으로 리뷰를 작성할 수 있습니다.")}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-[#d7dfeb] bg-[#f8fafc] px-4 py-3 text-[12.5px] leading-6 text-[#44556d]">
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

            {/* 환불 상태 */}
            {order.refund.status !== "none" ? (
              <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
                <h2 className="mb-1 text-[14px] font-bold text-[#111827]">{t("환불 상태")}</h2>
                <InfoRow label={t("상태")} value={
                  order.refund.status === "requested" ? t("검토 중") :
                  order.refund.status === "rejected" ? <span className="text-[#a33a2b]">{t("반려됨")}</span> :
                  order.refund.status === "done" ? <span className="text-[#11294b]">{t("완료")}</span> : "-"
                } />
                {order.refund.reason ? <InfoRow label={t("요청 사유")} value={order.refund.reason} /> : null}
                {order.refund.note ? <InfoRow label={t("처리 메모")} value={order.refund.note} /> : null}
              </div>
            ) : null}

            {/* 환불 요청 버튼 */}
            {order.status === "PAID" && order.refund.status === "none" ? (
              <button
                type="button"
                data-auth-allow
                onClick={() => void requestRefund()}
                disabled={actionLoading === "refund"}
                className={`${SECONDARY_BUTTON} h-11 w-full text-[13px]`}
              >
                {actionLoading === "refund" ? t("처리 중...") : t("환불 요청하기")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
