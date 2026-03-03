"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";

type ShopOrderSummary = {
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
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";

export function ShopOrdersPage() {
  const { status, user } = useAuthState();
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setLoading(false);
      return () => { active = false; };
    }

    const run = async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/orders?limit=50", {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) throw new Error();
        setOrders(json.data.orders as ShopOrderSummary[]);
      } catch {
        if (!active) return;
        setOrders([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [status, user?.userId]);

  const requestRefund = async (orderId: string) => {
    if (status !== "authenticated") return;
    setMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/refund", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId, reason: "주문 내역 페이지에서 접수한 환불 요청" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      const nextOrder = json.data.order as ShopOrderSummary;
      setOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)]);
      setMessageTone("notice");
      setMessage("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.");
    } catch {
      setMessageTone("error");
      setMessage("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="-mx-4 pb-24">
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/shop" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label="쇼핑으로 돌아가기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5" /><path d="M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">내 주문 내역</h1>
            {!loading && <p className="text-[12px] text-[#65748b]">전체 {orders.length}건</p>}
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

        {status !== "authenticated" ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">
            로그인 후 주문 내역을 확인할 수 있습니다.
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5 text-[13px] text-[#65748b]">
            주문 내역을 불러오는 중입니다...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <p className="text-[14px] font-semibold text-[#111827]">아직 주문이 없습니다</p>
            <p className="mt-1 text-[13px] text-[#65748b]">상품 상세 페이지에서 바로 결제할 수 있습니다.</p>
            <div className="mt-4">
              <Link href="/shop" data-auth-allow className={`${PRIMARY_BUTTON} h-10 text-[13px]`}>쇼핑하러 가기</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.orderId} className="rounded-3xl border border-[#edf1f6] bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[#111827]">{order.productSnapshot.name}</div>
                    <div className="mt-1 text-[11px] text-[#8d99ab]">
                      수량 {order.productSnapshot.quantity} · {Math.round(order.amount).toLocaleString("ko-KR")}원 · {formatDateLabel(order.createdAt)}
                    </div>
                    {order.shipping.addressLine1 ? (
                      <div className="mt-1 text-[11px] text-[#8d99ab]">
                        {order.shipping.recipientName} · {order.shipping.addressLine1}{order.shipping.addressLine2 ? ` ${order.shipping.addressLine2}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                </div>

                {/* 배송 추적 정보 */}
                {order.trackingNumber ? (
                  <div className="mt-2 rounded-2xl bg-[#f4f7fb] px-3 py-2 text-[11.5px] text-[#44556d]">
                    📦 {order.courier} · {order.trackingNumber}
                    {order.shippedAt ? ` · 발송일 ${formatDateLabel(order.shippedAt)}` : ""}
                  </div>
                ) : null}

                {/* 환불 상태 */}
                {order.refund.status === "requested" && (
                  <div className="mt-2 text-[11.5px] text-[#65748b]">환불 요청 접수됨 · {order.refund.reason ?? "사유 없음"}</div>
                )}
                {order.refund.status === "rejected" && (
                  <div className="mt-2 text-[11.5px] text-[#a33a2b]">환불 반려 · {order.refund.note ?? "사유 없음"}</div>
                )}
                {order.refund.status === "done" && (
                  <div className="mt-2 text-[11.5px] text-[#11294b]">환불 완료</div>
                )}
                {order.status === "FAILED" && order.failMessage && (
                  <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/shop/orders/${encodeURIComponent(order.orderId)}`} data-auth-allow className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                    상세 보기
                  </Link>
                  {order.status === "PAID" && order.refund.status === "none" ? (
                    <button type="button" data-auth-allow onClick={() => void requestRefund(order.orderId)} className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                      환불 요청
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
