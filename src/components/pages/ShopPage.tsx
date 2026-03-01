"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { formatKoreanDate } from "@/lib/date";
import {
  buildShopRecommendations,
  formatShopPrice,
  getShopCategoryMeta,
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  type ShopCategoryKey,
  type ShopProduct,
} from "@/lib/shop";
import { useAppStoreSelector } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

type ShopOrderSummary = {
  orderId: string;
  status: "READY" | "PAID" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED";
  amount: number;
  createdAt: string;
  approvedAt: string | null;
  failMessage: string | null;
  productSnapshot: {
    name: string;
    quantity: number;
  };
  refund: {
    status: "none" | "requested" | "rejected" | "done";
    reason: string | null;
    note: string | null;
  };
};

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";

function StorefrontIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 10l1.4-4.6A2 2 0 0 1 7.3 4h9.4a2 2 0 0 1 1.9 1.4L20 10" />
      <path d="M5 10h14" />
      <path d="M6 10v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" />
      <path d="M9 19v-4h6v4" />
    </svg>
  );
}

function orderStatusLabel(status: ShopOrderSummary["status"]) {
  switch (status) {
    case "READY":
      return "결제 대기";
    case "PAID":
      return "결제 완료";
    case "FAILED":
      return "결제 실패";
    case "CANCELED":
      return "주문 취소";
    case "REFUND_REQUESTED":
      return "환불 요청";
    case "REFUND_REJECTED":
      return "환불 반려";
    case "REFUNDED":
      return "환불 완료";
    default:
      return status;
  }
}

function orderStatusClass(status: ShopOrderSummary["status"]) {
  if (status === "PAID" || status === "REFUNDED") return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  if (status === "FAILED" || status === "REFUND_REJECTED") return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  return "border-[#dfe5ee] bg-[#f7f8fb] text-[#3d4d63]";
}

function productToneClass(product: ShopProduct) {
  if (product.checkoutEnabled && product.priceKrw) return "border border-[#11294b] bg-[#11294b] text-white";
  if (product.externalUrl) return "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  return "border border-[#e1e7f0] bg-[#f7f9fc] text-[#11294b]";
}

function productAvailabilityLabel(product: ShopProduct) {
  if (product.checkoutEnabled && product.priceKrw) return "앱 내 결제";
  if (product.externalUrl) return "외부 판매처";
  return "판매 준비중";
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function ShopPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const store = useAppStoreSelector(
    (s) => ({
      selected: s.selected,
      schedule: s.schedule,
      bio: s.bio,
      settings: s.settings,
    }),
    (a, b) =>
      a.selected === b.selected &&
      a.schedule === b.schedule &&
      a.bio === b.bio &&
      a.settings === b.settings
  );

  const [category, setCategory] = useState<ShopCategoryKey>("all");
  const deferredCategory = useDeferredValue(category);
  const [catalog, setCatalog] = useState<ShopProduct[]>(SHOP_PRODUCTS);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [orderMessageTone, setOrderMessageTone] = useState<"error" | "notice">("notice");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await fetch("/api/shop/catalog", { method: "GET", cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.products)) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setCatalog(json.data.products as ShopProduct[]);
      } catch {
        if (!active) return;
        setCatalog(SHOP_PRODUCTS);
        setCatalogError("catalog_load_failed");
      } finally {
        if (!active) return;
        setCatalogLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setIsAdmin(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/billing/access", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        setIsAdmin(Boolean(res.ok && json?.ok && json?.data?.isAdmin));
      } catch {
        if (!active) return;
        setIsAdmin(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setOrders([]);
      setOrdersLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setOrdersLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/orders?limit=3", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setOrders(json.data.orders as ShopOrderSummary[]);
      } catch {
        if (!active) return;
        setOrders([]);
      } finally {
        if (!active) return;
        setOrdersLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  const allShopState = useMemo(
    () =>
      buildShopRecommendations({
        selected: store.selected,
        schedule: store.schedule,
        bio: store.bio,
        settings: store.settings,
        products: catalog,
      }),
    [catalog, store.selected, store.schedule, store.bio, store.settings]
  );

  const filteredShopState = useMemo(
    () =>
      buildShopRecommendations({
        selected: store.selected,
        schedule: store.schedule,
        bio: store.bio,
        settings: store.settings,
        category: deferredCategory,
        products: catalog,
      }),
    [catalog, deferredCategory, store.selected, store.schedule, store.bio, store.settings]
  );

  const selectedDateLabel = formatKoreanDate(allShopState.selectedDate);
  const topSignals = allShopState.signals.slice(0, 4);
  const recommendations = filteredShopState.recommendations;
  const activeCategoryMeta = getShopCategoryMeta(category);

  const requestRefund = async (orderId: string) => {
    if (status !== "authenticated") {
      setOrderMessageTone("error");
      setOrderMessage("환불 요청은 로그인 후 가능합니다.");
      return;
    }

    setOrderMessage(null);

    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/refund", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          orderId,
          reason: "쇼핑 탭에서 접수한 환불 요청",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      const nextOrder = json.data.order as ShopOrderSummary;
      setOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)].slice(0, 3));
      setOrderMessageTone("notice");
      setOrderMessage("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.");
    } catch (error: any) {
      const text = String(error?.message ?? "failed_to_request_shop_refund");
      setOrderMessageTone("error");
      if (text.includes("not_refundable")) {
        setOrderMessage("이 주문은 현재 환불 요청을 받을 수 없는 상태입니다.");
      } else {
        setOrderMessage("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]">
            <StorefrontIcon />
          </span>
          <div>
            <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("쇼핑")}</div>
            <div className="mt-0.5 text-[13px] text-ios-sub">{t("지금 상태에 맞는 상품만 가볍게 보고 상세 페이지에서 바로 구매합니다.")}</div>
          </div>
        </div>
        {isAdmin ? (
          <Link href="/settings/admin/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
            {t("운영 관리")}
          </Link>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5f7087]">{t("오늘의 추천 기준")}</div>
        <div className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-[#11294b]">{allShopState.focusSummary}</div>
        <div className="mt-2 text-[12.5px] leading-5 text-ios-sub">
          {t("기준 날짜")} {selectedDateLabel} · {t("근무, 수면, 스트레스 흐름만 읽어서 상품 순서를 간단히 정합니다.")}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {topSignals.map((signal) => (
            <span key={signal.key} className="inline-flex rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
              {signal.label}
            </span>
          ))}
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SHOP_CATEGORIES.map((item) => {
          const active = item.key === category;
          return (
            <button
              key={item.key}
              type="button"
              data-auth-allow
              onClick={() =>
                startTransition(() => {
                  setCategory(item.key);
                })
              }
              className={[
                "shrink-0 rounded-2xl px-4 py-2 text-left transition",
                active ? "border border-[#11294b] bg-[#11294b] text-white" : "border border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]",
              ].join(" ")}
            >
              <div className="text-[12px] font-semibold">{t(item.label)}</div>
              <div className={["mt-0.5 text-[10.5px]", active ? "text-white/70" : "text-[#6b7c92]"].join(" ")}>{t(item.subtitle)}</div>
            </button>
          );
        })}
      </div>

      {catalogError ? (
        <div className="rounded-2xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] text-[#a33a2b]">
          {t("카탈로그를 불러오지 못해 기본 상품 목록으로 보여주고 있습니다.")}
        </div>
      ) : null}

      {orderMessage ? (
        <div
          className={[
            "rounded-2xl px-4 py-3 text-[12.5px] leading-5",
            orderMessageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
          ].join(" ")}
        >
          {orderMessage}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">
              {t(activeCategoryMeta.label)} {t("상품")}
            </div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("상세 페이지에서 설명과 구매 흐름을 한 번에 확인합니다.")}</div>
          </div>
          <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {catalogLoading ? t("불러오는 중") : `${recommendations.length}${t("개")}`}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {catalogLoading ? (
          <div className="rounded-[28px] border border-ios-sep bg-white px-5 py-6 text-[13px] text-ios-sub">{t("상품을 불러오는 중입니다.")}</div>
        ) : null}

        {!catalogLoading && recommendations.length === 0 ? (
          <div className="rounded-[28px] border border-ios-sep bg-white px-5 py-6 text-[13px] text-ios-sub">{t("현재 조건에 맞는 상품이 없습니다. 카테고리를 바꾸거나 잠시 후 다시 확인해 주세요.")}</div>
        ) : null}

        {!catalogLoading &&
          recommendations.map((entry) => {
            const href = `/shop/${encodeURIComponent(entry.product.id)}`;
            return (
              <div key={entry.product.id} className="rounded-[28px] border border-ios-sep bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-2.5 py-1 text-[10.5px] font-semibold text-[#11294b]">
                      {t(getShopCategoryMeta(entry.product.category).label)} · {t(productAvailabilityLabel(entry.product))}
                    </div>
                    <div className="mt-3 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{entry.product.name}</div>
                    <div className="mt-1 text-[13px] leading-5 text-ios-sub">{entry.product.subtitle}</div>
                  </div>
                  <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">{entry.score}</div>
                </div>

                <div className={["mt-4 rounded-[24px] px-4 py-4", productToneClass(entry.product)].join(" ")}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{entry.product.partnerLabel}</div>
                  <div className="mt-3 text-[22px] font-bold tracking-[-0.02em]">{entry.product.visualLabel}</div>
                  <div className="mt-1 text-[12px] leading-5 opacity-80">{entry.primaryReason}</div>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[#11294b]">{formatShopPrice(entry.product)}</div>
                    <div className="mt-1 text-[11px] text-ios-sub">{entry.product.partnerStatus}</div>
                  </div>
                  <Link href={href} data-auth-allow className={`${PRIMARY_BUTTON} h-10 text-[12px]`}>
                    {t("상세 보기")}
                  </Link>
                </div>
              </div>
            );
          })}
      </div>

      {status === "authenticated" ? (
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("내 주문")}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("최근 주문 3건만 간단히 보고 필요한 경우 바로 환불 요청할 수 있습니다.")}</div>
            </div>
            <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
              {ordersLoading ? t("불러오는 중") : `${orders.length}${t("건")}`}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {orders.map((order) => (
              <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-ios-text">{order.productSnapshot.name}</div>
                    <div className="mt-1 text-[11px] text-ios-sub">
                      {t("수량")} {order.productSnapshot.quantity} · {Math.round(order.amount).toLocaleString("ko-KR")}원 · {formatDateLabel(order.createdAt)}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                </div>

                {order.refund.status === "requested" ? <div className="mt-2 text-[11.5px] text-ios-sub">{t("환불 요청 접수됨")} · {order.refund.reason ?? t("사유 없음")}</div> : null}
                {order.refund.status === "rejected" ? <div className="mt-2 text-[11.5px] text-[#a33a2b]">{t("환불 반려")} · {order.refund.note ?? t("사유 없음")}</div> : null}
                {order.refund.status === "done" ? <div className="mt-2 text-[11.5px] text-[#11294b]">{t("환불 완료")}</div> : null}
                {order.status === "FAILED" && order.failMessage ? <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div> : null}

                {order.status === "PAID" && order.refund.status === "none" ? (
                  <div className="mt-3">
                    <button type="button" data-auth-allow onClick={() => void requestRefund(order.orderId)} className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                      {t("환불 요청")}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}

            {!ordersLoading && orders.length === 0 ? (
              <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("아직 주문이 없습니다. 상품 상세 페이지에서 바로 결제할 수 있습니다.")}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
