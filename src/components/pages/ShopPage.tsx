"use client";
/* eslint-disable @next/next/no-img-element */

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
  shipping: {
    recipientName: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string;
    deliveryNote: string;
  };
  refund: {
    status: "none" | "requested" | "rejected" | "done";
    reason: string | null;
    note: string | null;
  };
};

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="9" cy="19" r="1.25" />
      <circle cx="18" cy="19" r="1.25" />
      <path d="M3 4h2l2.2 9.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.76L20 7H7" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.8-3 4.1-4.5 7-4.5s5.2 1.5 7 4.5" />
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

  const featuredPrimary = allShopState.recommendations[0] ?? null;
  const featuredSecondary = allShopState.recommendations.slice(1, 3);

  return (
    <div className="-mx-4 pb-24">
      <div className="bg-[#69c8ee] px-4 py-3 text-center text-[12.5px] font-semibold text-white">
        {t("오늘 회복 흐름에 맞는 추천 상품과 구매 정보를 한눈에 확인하세요")}
      </div>

      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3">
          <button
            type="button"
            data-auth-allow
            onClick={() => {
              if (typeof window === "undefined") return;
              document.getElementById("shop-category-strip")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex h-10 w-10 items-center justify-center text-[#111827]"
            aria-label={t("카테고리로 이동")}
          >
            <MenuIcon />
          </button>
          <button
            type="button"
            data-auth-allow
            onClick={() => {
              if (typeof window === "undefined") return;
              document.getElementById("shop-category-strip")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex items-center gap-1 text-[#111827]"
            aria-label={t("카테고리 펼치기")}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] bg-[#f8fafc] text-[10px] font-bold text-[#11294b]">KR</span>
            <ChevronDownIcon />
          </button>
          <Link href="/shop" data-auth-allow className="justify-self-center text-[36px] font-black italic tracking-[-0.07em] text-[#69c8ee]">
            rnest
          </Link>
          <button
            type="button"
            data-auth-allow
            onClick={() => {
              if (typeof window === "undefined") return;
              document.getElementById(status === "authenticated" ? "shop-orders" : "shop-product-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex h-10 w-10 items-center justify-center text-[#111827]"
            aria-label={t("주문 영역으로 이동")}
          >
            <CartIcon />
          </button>
          <Link href="/settings/account" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label={t("계정 설정")}>
            <ProfileIcon />
          </Link>
        </div>
      </div>

      <div className="space-y-6 px-4 pt-6">
        {catalogError ? (
          <div className="rounded-3xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] text-[#a33a2b]">
            {t("카탈로그를 불러오지 못해 기본 상품 목록으로 보여주고 있습니다.")}
          </div>
        ) : null}

        {orderMessage ? (
          <div
            className={[
              "rounded-3xl px-4 py-3 text-[12.5px] leading-5",
              orderMessageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
            ].join(" ")}
          >
            {orderMessage}
          </div>
        ) : null}

        {featuredPrimary ? (
          <div className="space-y-4">
            <Link href={`/shop/${encodeURIComponent(featuredPrimary.product.id)}`} data-auth-allow className="block overflow-hidden rounded-[32px] border border-[#edf1f6] bg-white">
              <div className="relative bg-[#f3f5f7]">
                {featuredPrimary.product.imageUrls[0] ? (
                  <img
                    src={featuredPrimary.product.imageUrls[0]}
                    alt={featuredPrimary.product.name}
                    className="aspect-[1.15/1] w-full object-cover"
                  />
                ) : (
                  <div className={["flex aspect-[1.15/1] items-end px-6 py-6", productToneClass(featuredPrimary.product)].join(" ")}>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{featuredPrimary.product.partnerLabel}</div>
                      <div className="mt-3 text-[28px] font-bold tracking-[-0.03em]">{featuredPrimary.product.visualLabel}</div>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-4 right-4 rounded-full bg-black/12 px-3 py-1 text-[11px] font-semibold text-white">
                  1 / {Math.max(1, featuredPrimary.product.imageUrls.length || 1)}
                </div>
              </div>
              <div className="px-4 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8d99ab]">{t("오늘의 추천")}</div>
                <div className="mt-3 text-[16px] font-bold leading-7 tracking-[-0.02em] text-[#111827]">{featuredPrimary.product.name}</div>
                <div className="mt-2 text-[13px] leading-6 text-[#44556d]">{allShopState.focusSummary}</div>
                <div className="mt-4 text-[13px] font-semibold text-[#111827]">{formatShopPrice(featuredPrimary.product)}</div>
              </div>
            </Link>

            {featuredSecondary.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {featuredSecondary.map((entry) => (
                  <Link key={entry.product.id} href={`/shop/${encodeURIComponent(entry.product.id)}`} data-auth-allow className="block rounded-[28px] border border-[#edf1f6] bg-white p-3">
                    <div className="overflow-hidden rounded-[22px] bg-[#f3f5f7]">
                      {entry.product.imageUrls[0] ? (
                        <img src={entry.product.imageUrls[0]} alt={entry.product.name} className="aspect-square w-full object-cover" />
                      ) : (
                        <div className={["flex aspect-square items-end px-4 py-4", productToneClass(entry.product)].join(" ")}>
                          <div className="text-[20px] font-bold tracking-[-0.03em]">{entry.product.visualLabel}</div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-[14px] font-semibold leading-6 text-[#111827]">{entry.product.name}</div>
                    <div className="mt-2 text-[12px] font-semibold text-[#111827]">{formatShopPrice(entry.product)}</div>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div id="shop-category-strip" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
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
                  "shrink-0 rounded-full px-5 py-3 text-[13px] font-semibold transition",
                  active ? "bg-[#69c8ee] text-white" : "bg-transparent text-[#111827]",
                ].join(" ")}
              >
                {t(item.label)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-[#8d99ab]">{t("기준 날짜")} {selectedDateLabel}</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-[#111827]">{t(activeCategoryMeta.label)} {t("상품")}</div>
          </div>
          {isAdmin ? (
            <Link href="/settings/admin/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
              {t("운영 관리")}
            </Link>
          ) : (
            <div className="rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
              {catalogLoading ? t("불러오는 중") : `${recommendations.length}${t("개")}`}
            </div>
          )}
        </div>

        {topSignals.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topSignals.map((signal) => (
              <span key={signal.key} className="inline-flex rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
                {signal.label}
              </span>
            ))}
          </div>
        ) : null}

        <div id="shop-product-grid" className="grid grid-cols-2 gap-x-4 gap-y-7">
          {!catalogLoading &&
            recommendations.map((entry, index) => (
              <Link key={entry.product.id} href={`/shop/${encodeURIComponent(entry.product.id)}`} data-auth-allow className="block">
                <div className="relative overflow-hidden rounded-[2px] bg-[#f3f5f7]">
                  {entry.product.imageUrls[0] ? (
                    <img src={entry.product.imageUrls[0]} alt={entry.product.name} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className={["flex aspect-square items-center justify-center p-4", productToneClass(entry.product)].join(" ")}>
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-75">{entry.product.partnerLabel}</div>
                        <div className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{entry.product.visualLabel}</div>
                      </div>
                    </div>
                  )}
                  {index < 2 ? (
                    <div className="absolute left-3 top-3 border border-[#69c8ee] bg-white px-3 py-1 text-[11px] font-semibold text-[#69c8ee]">
                      NEW
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 text-[16px] font-semibold leading-7 tracking-[-0.02em] text-[#111827]">{entry.product.name}</div>
                <div className="mt-3 flex items-end gap-2">
                  <div className="text-[14px] font-bold text-[#111827]">{formatShopPrice(entry.product)}</div>
                  <div className="text-[12px] font-semibold text-[#d72f2f]">{entry.product.checkoutEnabled && entry.product.priceKrw ? t("바로결제") : t("상세보기")}</div>
                </div>
                <div className="mt-1 text-[11px] text-[#8d99ab]">{entry.primaryReason}</div>
              </Link>
            ))}

          {catalogLoading ? (
            <div className="col-span-2 rounded-3xl border border-[#edf1f6] bg-white px-5 py-6 text-[13px] text-[#65748b]">{t("상품을 불러오는 중입니다.")}</div>
          ) : null}

          {!catalogLoading && recommendations.length === 0 ? (
            <div className="col-span-2 rounded-3xl border border-[#edf1f6] bg-white px-5 py-6 text-[13px] text-[#65748b]">{t("현재 조건에 맞는 상품이 없습니다. 카테고리를 바꾸거나 잠시 후 다시 확인해 주세요.")}</div>
          ) : null}
        </div>

        {status === "authenticated" ? (
          <div id="shop-orders" className="rounded-[32px] border border-[#edf1f6] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("내 주문")}</div>
                <div className="mt-1 text-[12.5px] text-[#65748b]">{t("최근 주문을 확인하고 필요한 경우 환불 요청을 진행할 수 있습니다.")}</div>
              </div>
              <div className="rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
                {ordersLoading ? t("불러오는 중") : `${orders.length}${t("건")}`}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {orders.map((order) => (
                <div key={order.orderId} className="rounded-3xl border border-[#edf1f6] bg-[#f8fafc] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold text-[#111827]">{order.productSnapshot.name}</div>
                      <div className="mt-1 text-[11px] text-[#8d99ab]">
                        {t("수량")} {order.productSnapshot.quantity} · {Math.round(order.amount).toLocaleString("ko-KR")}원 · {formatDateLabel(order.createdAt)}
                      </div>
                      {order.shipping.addressLine1 ? (
                        <div className="mt-1 text-[11px] text-[#8d99ab]">
                          {order.shipping.recipientName} · {order.shipping.addressLine1}
                          {order.shipping.addressLine2 ? ` ${order.shipping.addressLine2}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>

                  {order.refund.status === "requested" ? <div className="mt-2 text-[11.5px] text-[#65748b]">{t("환불 요청 접수됨")} · {order.refund.reason ?? t("사유 없음")}</div> : null}
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
                <div className="rounded-3xl border border-[#edf1f6] bg-[#f8fafc] px-4 py-4 text-[12.5px] text-[#65748b]">{t("아직 주문이 없습니다. 상품 상세 페이지에서 바로 결제할 수 있습니다.")}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
