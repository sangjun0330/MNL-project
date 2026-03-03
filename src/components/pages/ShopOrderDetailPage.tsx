"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";

type ShopOrderDetail = {
  orderId: string;
  status: string;
  amount: number;
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
  shippedAt: string | null;
  deliveredAt: string | null;
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
  return map[status] ?? status;
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

const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#edf1f6] py-3 last:border-b-0">
      <span className="text-[12.5px] text-[#8d99ab]">{label}</span>
      <span className="text-right text-[12.5px] text-[#111827]">{value}</span>
    </div>
  );
}

export function ShopOrderDetailPage({ orderId }: { orderId: string }) {
  const { status } = useAuthState();
  const [order, setOrder] = useState<ShopOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [refundTone, setRefundTone] = useState<"error" | "notice">("notice");

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
        setError("주문 정보를 불러오지 못했습니다.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [orderId, status]);

  const requestRefund = async () => {
    if (status !== "authenticated" || !order) return;
    setRefundMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/refund", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId: order.orderId, reason: "주문 상세에서 접수한 환불 요청" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error();
      setOrder(json.data.order as ShopOrderDetail);
      setRefundTone("notice");
      setRefundMessage("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.");
    } catch {
      setRefundTone("error");
      setRefundMessage("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="-mx-4 pb-24">
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/shop/orders" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label="주문 목록으로">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5" /><path d="M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">주문 상세</h1>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {status !== "authenticated" ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">로그인 후 확인할 수 있습니다.</div>
        ) : loading ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">불러오는 중...</div>
        ) : error || !order ? (
          <div className="rounded-3xl border border-[#f1d0cc] bg-[#fff6f5] p-5 text-[13px] text-[#a33a2b]">{error ?? "주문 정보를 찾을 수 없습니다."}</div>
        ) : (
          <>
            {refundMessage ? (
              <div className={[
                "rounded-3xl px-4 py-3 text-[12.5px]",
                refundTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
              ].join(" ")}>
                {refundMessage}
              </div>
            ) : null}

            {/* 상태 헤더 */}
            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[16px] font-bold text-[#111827]">{order.productSnapshot.name}</div>
                  <div className="mt-1 text-[12px] text-[#8d99ab]">수량 {order.productSnapshot.quantity}</div>
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${orderStatusClass(order.status)}`}>
                  {orderStatusLabel(order.status)}
                </span>
              </div>
              <div className="mt-4 text-[28px] font-extrabold tracking-[-0.03em] text-[#111827]">
                {Math.round(order.amount).toLocaleString("ko-KR")}원
              </div>
            </div>

            {/* 주문 정보 */}
            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-[#111827]">주문 정보</h2>
              <InfoRow label="주문번호" value={<span className="break-all font-mono text-[11px]">{order.orderId}</span>} />
              <InfoRow label="주문일시" value={formatDateLabel(order.createdAt)} />
              {order.approvedAt ? <InfoRow label="결제일시" value={formatDateLabel(order.approvedAt)} /> : null}
              {order.status === "FAILED" && order.failMessage ? (
                <InfoRow label="실패 사유" value={<span className="text-[#a33a2b]">{order.failMessage}</span>} />
              ) : null}
            </div>

            {/* 배송지 */}
            <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
              <h2 className="mb-1 text-[14px] font-bold text-[#111827]">배송지</h2>
              <InfoRow label="수령인" value={order.shipping.recipientName} />
              <InfoRow label="연락처" value={order.shipping.phone} />
              <InfoRow label="우편번호" value={order.shipping.postalCode} />
              <InfoRow
                label="주소"
                value={
                  <>
                    {order.shipping.addressLine1}
                    {order.shipping.addressLine2 ? <><br />{order.shipping.addressLine2}</> : null}
                  </>
                }
              />
              {order.shipping.deliveryNote ? <InfoRow label="배송 메모" value={order.shipping.deliveryNote} /> : null}
            </div>

            {/* 배송 추적 */}
            {order.trackingNumber ? (
              <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
                <h2 className="mb-1 text-[14px] font-bold text-[#111827]">배송 현황</h2>
                <InfoRow label="택배사" value={order.courier ?? "-"} />
                <InfoRow label="운송장번호" value={<span className="font-mono font-semibold">{order.trackingNumber}</span>} />
                {order.shippedAt ? <InfoRow label="발송일" value={formatDateLabel(order.shippedAt)} /> : null}
                {order.deliveredAt ? <InfoRow label="배달 완료" value={formatDateLabel(order.deliveredAt)} /> : null}
                {order.courier && order.trackingNumber ? (
                  <div className="mt-3">
                    <a
                      href={`https://trace.cjlogistics.com/web/detail.jsp?slipno=${order.trackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${SECONDARY_BUTTON} h-9 text-[11px]`}
                    >
                      배송 조회하기 →
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 환불 상태 */}
            {order.refund.status !== "none" ? (
              <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
                <h2 className="mb-1 text-[14px] font-bold text-[#111827]">환불 상태</h2>
                <InfoRow label="상태" value={
                  order.refund.status === "requested" ? "검토 중" :
                  order.refund.status === "rejected" ? <span className="text-[#a33a2b]">반려됨</span> :
                  order.refund.status === "done" ? <span className="text-[#11294b]">완료</span> : "-"
                } />
                {order.refund.reason ? <InfoRow label="요청 사유" value={order.refund.reason} /> : null}
                {order.refund.note ? <InfoRow label="처리 메모" value={order.refund.note} /> : null}
              </div>
            ) : null}

            {/* 환불 요청 버튼 */}
            {order.status === "PAID" && order.refund.status === "none" ? (
              <button type="button" data-auth-allow onClick={() => void requestRefund()} className={`${SECONDARY_BUTTON} h-11 w-full text-[13px]`}>
                환불 요청하기
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
