"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { SHOP_BUTTON_ACTIVE, SHOP_BUTTON_PRIMARY, SHOP_BUTTON_SECONDARY } from "@/lib/shopUi";

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

function maskTrackingNumber(value: string | null) {
  const safe = String(value ?? "").trim();
  if (!safe) return "-";
  if (safe.length <= 4) return `${safe.slice(0, 1)}***`;
  return `${safe.slice(0, 3)}••••${safe.slice(-4)}`;
}

const PRIMARY_BUTTON = SHOP_BUTTON_ACTIVE;
const SECONDARY_BUTTON = SHOP_BUTTON_PRIMARY;
const ORDERS_PER_PAGE = 12;
type OrderFilter = "all" | "progress" | "delivered" | "refund" | "issue";

export function ShopOrdersPage() {
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

  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  const currentOffset = (page - 1) * ORDERS_PER_PAGE;
  const visibleOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "progress") return orders.filter((order) => order.status === "PAID" || order.status === "SHIPPED");
    if (filter === "delivered") return orders.filter((order) => order.status === "DELIVERED");
    if (filter === "refund") {
      return orders.filter((order) =>
        order.status === "REFUND_REQUESTED" || order.status === "REFUND_REJECTED" || order.status === "REFUNDED"
      );
    }
    return orders.filter((order) => order.status === "FAILED" || order.status === "CANCELED");
  }, [filter, orders]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setOrders([]);
      setTotal(0);
      setLoading(false);
      return () => { active = false; };
    }

    const run = async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/shop/orders?limit=${ORDERS_PER_PAGE}&offset=${currentOffset}`, {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) throw new Error();
        setOrders(json.data.orders as ShopOrderSummary[]);
        setTotal(Math.max(0, Number(json?.data?.total ?? 0)));
      } catch {
        if (!active) return;
        setOrders([]);
        setTotal(0);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [currentOffset, status, user?.userId]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const nextFilter = searchParams.get("filter");
    if (
      nextFilter === "all" ||
      nextFilter === "progress" ||
      nextFilter === "delivered" ||
      nextFilter === "refund" ||
      nextFilter === "issue"
    ) {
      setFilter(nextFilter);
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
        body: JSON.stringify({ orderId, reason: "주문 내역 페이지에서 접수한 환불 요청" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
      const nextOrder = json.data.order as ShopOrderSummary;
      setOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)]);
      setMessageTone("notice");
      setMessage("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.");
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_request_shop_refund");
      setMessageTone("error");
      if (code.includes("shop_order_bundle_refund_requires_manual_review")) {
        setMessage("묶음 결제로 승인된 주문은 부분 환불을 자동 처리할 수 없습니다. 고객센터 또는 관리자 검토를 통해 접수해 주세요.");
      } else {
        setMessage("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
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
      setMessage("구매가 확정되었습니다. 이제 해당 상품 리뷰를 작성할 수 있습니다.");
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_confirm_shop_order_purchase");
      setMessageTone("error");
      if (code.includes("not_delivered")) {
        setMessage("배송 완료된 주문만 구매 확정할 수 있습니다.");
      } else {
        setMessage("구매 확정 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="-mx-4 pb-24">
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/shop" data-auth-allow className={`h-10 w-10 px-0 text-[#425a76] ${SHOP_BUTTON_SECONDARY}`} aria-label="쇼핑으로 돌아가기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5" /><path d="M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">내 주문 내역</h1>
            {!loading && <p className="text-[12px] text-[#65748b]">전체 {total}건</p>}
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {([
              { key: "all", label: "전체" },
              { key: "progress", label: "진행 중" },
              { key: "delivered", label: "배송 완료" },
              { key: "refund", label: "환불" },
              { key: "issue", label: "문제" },
            ] as { key: OrderFilter; label: string }[]).map((item) => (
              <button
                key={item.key}
                type="button"
                data-auth-allow
                onClick={() => setFilter(item.key)}
                className={[
                  "shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold transition",
                  filter === item.key ? "border-2 border-[#17324d] bg-[#d1deea] text-[#2f4d6a]" : "border-2 border-[#bfd0e1] bg-white text-[#60768d]",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
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
        ) : visibleOrders.length === 0 ? (
          <div className="rounded-3xl border border-[#edf1f6] bg-white p-5">
            <p className="text-[14px] font-semibold text-[#111827]">{filter === "all" ? "아직 주문이 없습니다" : "선택한 상태의 주문이 없습니다"}</p>
            <p className="mt-1 text-[13px] text-[#65748b]">
              {filter === "all" ? "상품 상세 페이지에서 바로 결제할 수 있습니다." : "다른 필터를 선택해 주문 상태를 다시 확인해 주세요."}
            </p>
            <div className="mt-4">
              <Link href="/shop" data-auth-allow className={`${PRIMARY_BUTTON} h-10 text-[13px]`}>쇼핑하러 가기</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleOrders.map((order) => (
              <div key={order.orderId} className="rounded-3xl border border-[#edf1f6] bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-[#111827]">{order.productSnapshot.name}</div>
                    <div className="mt-1 text-[11px] text-[#8d99ab]">
                        수량 {order.productSnapshot.quantity} · 총 {Math.round(order.amount).toLocaleString("ko-KR")}원 · {formatDateLabel(order.createdAt)}
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
                    📦 {order.courier} · {maskTrackingNumber(order.trackingNumber)}
                    {order.shippedAt ? ` · 발송일 ${formatDateLabel(order.shippedAt)}` : ""}
                  </div>
                ) : null}
                <div className="mt-2 rounded-2xl border border-[#dbe4ef] bg-white px-3 py-2 text-[11.5px] text-[#5b7087]">
                  상품 {order.subtotalKrw.toLocaleString("ko-KR")}원 · 배송비 {order.shippingFeeKrw > 0 ? `${order.shippingFeeKrw.toLocaleString("ko-KR")}원` : "무료"}
                </div>

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
                {order.purchaseConfirmedAt ? (
                  <div className="mt-2 text-[11.5px] text-[#102a43]">구매 확정 완료 · {formatDateLabel(order.purchaseConfirmedAt)}</div>
                ) : null}
                {order.status === "FAILED" && order.failMessage && (
                  <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/shop/orders/${encodeURIComponent(order.orderId)}`} data-auth-allow className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                    상세 보기
                  </Link>
                  {order.status === "DELIVERED" && !order.purchaseConfirmedAt ? (
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => void confirmPurchase(order.orderId)}
                      disabled={actionLoadingId === order.orderId}
                      className={`${SECONDARY_BUTTON} h-9 text-[11px]`}
                    >
                      {actionLoadingId === order.orderId ? "처리 중..." : "구매 확정"}
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
                      환불 요청
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {totalPages > 1 ? (
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
