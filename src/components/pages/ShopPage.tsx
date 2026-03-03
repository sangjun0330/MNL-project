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
import {
  getWishlist,
  loadShopClientState,
  toggleWishlist,
} from "@/lib/shopClient";

type ShopOrderSummary = {
  orderId: string;
  status: "READY" | "PAID" | "SHIPPED" | "DELIVERED" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED";
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
  refund: { status: "none" | "requested" | "rejected" | "done"; reason: string | null; note: string | null };
  trackingNumber: string | null;
  courier: string | null;
};

type SortKey = "recommended" | "newest" | "price_asc" | "price_desc";
type PriceFilter = "all" | "free" | "under20k" | "under50k" | "over50k";

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
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
      <circle cx="9" cy="19" r="1.25" /><circle cx="18" cy="19" r="1.25" />
      <path d="M3 4h2l2.2 9.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.76L20 7H7" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="8" r="3.2" /><path d="M5 19c1.8-3 4.1-4.5 7-4.5s5.2 1.5 7 4.5" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "#e63946" : "none"} stroke={filled ? "#e63946" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function WishlistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function orderStatusLabel(status: ShopOrderSummary["status"]) {
  const map: Record<string, string> = {
    READY: "결제 대기", PAID: "결제 완료", SHIPPED: "배송 중", DELIVERED: "배달 완료",
    FAILED: "결제 실패", CANCELED: "주문 취소",
    REFUND_REQUESTED: "환불 요청", REFUND_REJECTED: "환불 반려", REFUNDED: "환불 완료",
  };
  return map[status] ?? status;
}

function orderStatusClass(status: ShopOrderSummary["status"]) {
  if (status === "PAID" || status === "SHIPPED" || status === "DELIVERED" || status === "REFUNDED") return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  if (status === "FAILED" || status === "REFUND_REJECTED") return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  return "border-[#dfe5ee] bg-[#f7f8fb] text-[#3d4d63]";
}

function productToneClass(product: ShopProduct) {
  if (product.checkoutEnabled && product.priceKrw) return "border border-[#11294b] bg-[#11294b] text-white";
  if (product.externalUrl) return "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  return "border border-[#e1e7f0] bg-[#f7f9fc] text-[#11294b]";
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function matchesPriceFilter(product: ShopProduct, filter: PriceFilter): boolean {
  if (filter === "all") return true;
  const price = product.priceKrw ?? 0;
  if (filter === "free") return !product.checkoutEnabled || price === 0;
  if (filter === "under20k") return price > 0 && price < 20000;
  if (filter === "under50k") return price >= 20000 && price < 50000;
  if (filter === "over50k") return price >= 50000;
  return true;
}

export function ShopPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const store = useAppStoreSelector(
    (s) => ({ selected: s.selected, schedule: s.schedule, bio: s.bio, settings: s.settings }),
    (a, b) => a.selected === b.selected && a.schedule === b.schedule && a.bio === b.bio && a.settings === b.settings
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

  // 검색/필터/정렬
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [showFilter, setShowFilter] = useState(false);

  // 위시리스트
  const [wishlist, setWishlist] = useState<string[]>([]);

  // 최근 본 상품
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setWishlist(getWishlist());
    const clientState = loadShopClientState();
    setRecentIds(clientState.recentIds);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await fetch("/api/shop/catalog", { method: "GET", cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.products)) throw new Error(String(json?.error ?? `http_${res.status}`));
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
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setOrders([]);
      setOrdersLoading(false);
      return () => { active = false; };
    }
    const run = async () => {
      setOrdersLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/orders?limit=3", {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) throw new Error(String(json?.error ?? `http_${res.status}`));
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
    return () => { active = false; };
  }, [status, user?.userId]);

  const allShopState = useMemo(
    () => buildShopRecommendations({ selected: store.selected, schedule: store.schedule, bio: store.bio, settings: store.settings, products: catalog }),
    [catalog, store.selected, store.schedule, store.bio, store.settings]
  );

  const filteredShopState = useMemo(
    () => buildShopRecommendations({ selected: store.selected, schedule: store.schedule, bio: store.bio, settings: store.settings, category: deferredCategory, products: catalog }),
    [catalog, deferredCategory, store.selected, store.schedule, store.bio, store.settings]
  );

  // 검색 + 필터 + 정렬 적용
  const finalRecommendations = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    let result = filteredShopState.recommendations.filter((entry) => {
      const p = entry.product;
      if (!matchesPriceFilter(p, priceFilter)) return false;
      if (!keyword) return true;
      return `${p.name} ${p.subtitle} ${p.description} ${p.benefitTags.join(" ")}`.toLowerCase().includes(keyword);
    });

    if (sortKey === "price_asc") {
      result = [...result].sort((a, b) => (a.product.priceKrw ?? 0) - (b.product.priceKrw ?? 0));
    } else if (sortKey === "price_desc") {
      result = [...result].sort((a, b) => (b.product.priceKrw ?? 0) - (a.product.priceKrw ?? 0));
    } else if (sortKey === "newest") {
      result = [...result].sort((a, b) => b.product.priority - a.product.priority);
    }
    // "recommended" = 기본 순서 유지

    return result;
  }, [filteredShopState.recommendations, searchQuery, sortKey, priceFilter]);

  const selectedDateLabel = formatKoreanDate(allShopState.selectedDate);
  const topSignals = allShopState.signals.slice(0, 4);
  const activeCategoryMeta = getShopCategoryMeta(category);

  // 최근 본 상품
  const recentProducts = useMemo(
    () => recentIds.map((id) => catalog.find((p) => p.id === id)).filter((p): p is ShopProduct => Boolean(p)).slice(0, 6),
    [recentIds, catalog]
  );

  const featuredPrimary = allShopState.recommendations[0] ?? null;
  const featuredSecondary = allShopState.recommendations.slice(1, 3);

  const handleToggleWishlist = (productId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleWishlist(productId);
    setWishlist((current) => next ? [...current, productId] : current.filter((id) => id !== productId));
  };

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
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ orderId, reason: "쇼핑 탭에서 접수한 환불 요청" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
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
    <div className="-mx-4 pb-24">
      <div className="bg-[#3b6fc9] px-4 py-3 text-center text-[12.5px] font-semibold text-white">
        {t("오늘 회복 흐름에 맞는 추천 상품과 구매 정보를 한눈에 확인하세요")}
      </div>

      {/* 헤더 */}
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-2">
          <button
            type="button" data-auth-allow
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
            type="button" data-auth-allow
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
          <Link href="/shop" data-auth-allow className="justify-self-center">
            <img src="/rnest-logo.png" alt="RNest" className="h-9 w-auto object-contain" />
          </Link>
          <Link href="/shop/wishlist" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label={t("찜한 상품")}>
            <WishlistIcon />
          </Link>
          <button
            type="button" data-auth-allow
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

      {/* 검색창 */}
      <div className="bg-white border-b border-[#edf1f6] px-4 py-3">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8d99ab]"><SearchIcon /></span>
          <input
            type="text"
            placeholder={t("상품 이름, 효능, 태그로 검색...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-[#edf1f6] bg-[#f8fafc] py-2.5 pl-9 pr-4 text-[13px] text-[#111827] outline-none placeholder:text-[#92a0b4] focus:border-[#3b6fc9]"
          />
          {searchQuery ? (
            <button type="button" data-auth-allow onClick={() => setSearchQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8d99ab]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button" data-auth-allow
            onClick={() => setShowFilter((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-[#65748b]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
            {t("필터")} {(priceFilter !== "all" || sortKey !== "recommended") ? <span className="rounded-full bg-[#3b6fc9] px-1.5 py-0.5 text-[10px] text-white">ON</span> : null}
          </button>
          {(searchQuery || priceFilter !== "all" || sortKey !== "recommended") ? (
            <button type="button" data-auth-allow onClick={() => { setSearchQuery(""); setPriceFilter("all"); setSortKey("recommended"); }} className="text-[11px] text-[#8d99ab]">
              초기화
            </button>
          ) : null}
        </div>
        {showFilter ? (
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-[#8d99ab]">{t("정렬")}</div>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: "recommended", label: "추천순" },
                  { key: "newest", label: "최신순" },
                  { key: "price_asc", label: "가격 낮은순" },
                  { key: "price_desc", label: "가격 높은순" },
                ] as { key: SortKey; label: string }[]).map((item) => (
                  <button
                    key={item.key}
                    type="button" data-auth-allow
                    onClick={() => setSortKey(item.key)}
                    className={[
                      "rounded-full px-3 py-1.5 text-[12px] font-semibold border transition",
                      sortKey === item.key ? "bg-[#11294b] text-white border-[#11294b]" : "bg-white text-[#44556d] border-[#d7dfeb]",
                    ].join(" ")}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-[#8d99ab]">{t("가격")}</div>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: "all", label: "전체" },
                  { key: "free", label: "외부판매" },
                  { key: "under20k", label: "2만원 미만" },
                  { key: "under50k", label: "2만~5만원" },
                  { key: "over50k", label: "5만원 이상" },
                ] as { key: PriceFilter; label: string }[]).map((item) => (
                  <button
                    key={item.key}
                    type="button" data-auth-allow
                    onClick={() => setPriceFilter(item.key)}
                    className={[
                      "rounded-full px-3 py-1.5 text-[12px] font-semibold border transition",
                      priceFilter === item.key ? "bg-[#11294b] text-white border-[#11294b]" : "bg-white text-[#44556d] border-[#d7dfeb]",
                    ].join(" ")}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-6 px-4 pt-6">
        {catalogError ? (
          <div className="rounded-3xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] text-[#a33a2b]">
            {t("카탈로그를 불러오지 못해 기본 상품 목록으로 보여주고 있습니다.")}
          </div>
        ) : null}

        {orderMessage ? (
          <div className={[
            "rounded-3xl px-4 py-3 text-[12.5px] leading-5",
            orderMessageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
          ].join(" ")}>
            {orderMessage}
          </div>
        ) : null}

        {/* 히어로 카드 (검색/필터 없을 때만) */}
        {!searchQuery && priceFilter === "all" && sortKey === "recommended" && featuredPrimary ? (
          <div className="space-y-4">
            <div className="relative">
              <Link href={`/shop/${encodeURIComponent(featuredPrimary.product.id)}`} data-auth-allow className="block overflow-hidden rounded-[32px] border border-[#edf1f6] bg-white">
                <div className="relative bg-[#f3f5f7]">
                  {featuredPrimary.product.imageUrls[0] ? (
                    <img src={featuredPrimary.product.imageUrls[0]} alt={featuredPrimary.product.name} className="aspect-[1.15/1] w-full object-cover" />
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
                  {featuredPrimary.product.outOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[32px]">
                      <span className="rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#111827]">품절</span>
                    </div>
                  )}
                </div>
                <div className="px-4 py-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8d99ab]">{t("오늘의 추천")}</div>
                  <div className="mt-3 text-[16px] font-bold leading-7 tracking-[-0.02em] text-[#111827]">{featuredPrimary.product.name}</div>
                  <div className="mt-2 text-[13px] leading-6 text-[#44556d]">{allShopState.focusSummary}</div>
                  <div className="mt-4 flex items-center gap-2">
                    {featuredPrimary.product.originalPriceKrw && featuredPrimary.product.priceKrw && featuredPrimary.product.originalPriceKrw > featuredPrimary.product.priceKrw ? (
                      <>
                        <span className="text-[12px] text-[#8d99ab] line-through">{featuredPrimary.product.originalPriceKrw.toLocaleString("ko-KR")}원</span>
                        <span className="text-[14px] font-bold text-[#111827]">{formatShopPrice(featuredPrimary.product)}</span>
                        <span className="rounded-full bg-[#fff0f0] px-2 py-0.5 text-[11px] font-semibold text-[#e63946]">
                          -{Math.round((1 - featuredPrimary.product.priceKrw / featuredPrimary.product.originalPriceKrw) * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-[13px] font-semibold text-[#111827]">{formatShopPrice(featuredPrimary.product)}</span>
                    )}
                  </div>
                </div>
              </Link>
              <button
                type="button" data-auth-allow
                onClick={(e) => handleToggleWishlist(featuredPrimary.product.id, e)}
                className="absolute right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 shadow backdrop-blur-sm"
              >
                <HeartIcon filled={wishlist.includes(featuredPrimary.product.id)} />
              </button>
            </div>

            {featuredSecondary.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {featuredSecondary.map((entry) => (
                  <div key={entry.product.id} className="relative">
                    <Link href={`/shop/${encodeURIComponent(entry.product.id)}`} data-auth-allow className="block rounded-[28px] border border-[#edf1f6] bg-white p-3">
                      <div className="relative overflow-hidden rounded-[22px] bg-[#f3f5f7]">
                        {entry.product.imageUrls[0] ? (
                          <img src={entry.product.imageUrls[0]} alt={entry.product.name} className="aspect-square w-full object-cover" />
                        ) : (
                          <div className={["flex aspect-square items-end px-4 py-4", productToneClass(entry.product)].join(" ")}>
                            <div className="text-[20px] font-bold tracking-[-0.03em]">{entry.product.visualLabel}</div>
                          </div>
                        )}
                        {entry.product.outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[22px]">
                            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#111827]">품절</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 text-[14px] font-semibold leading-6 text-[#111827]">{entry.product.name}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {entry.product.originalPriceKrw && entry.product.priceKrw && entry.product.originalPriceKrw > entry.product.priceKrw ? (
                          <>
                            <span className="text-[11px] text-[#8d99ab] line-through">{entry.product.originalPriceKrw.toLocaleString("ko-KR")}원</span>
                            <span className="text-[12px] font-bold text-[#111827]">{formatShopPrice(entry.product)}</span>
                          </>
                        ) : (
                          <span className="text-[12px] font-semibold text-[#111827]">{formatShopPrice(entry.product)}</span>
                        )}
                      </div>
                    </Link>
                    <button
                      type="button" data-auth-allow
                      onClick={(e) => handleToggleWishlist(entry.product.id, e)}
                      className="absolute right-5 top-5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 shadow backdrop-blur-sm"
                    >
                      <HeartIcon filled={wishlist.includes(entry.product.id)} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 카테고리 스트립 */}
        <div id="shop-category-strip" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {SHOP_CATEGORIES.map((item) => {
            const active = item.key === category;
            return (
              <button
                key={item.key}
                type="button" data-auth-allow
                onClick={() => startTransition(() => { setCategory(item.key); })}
                className={[
                  "shrink-0 rounded-full px-5 py-3 text-[13px] font-semibold transition",
                  active ? "bg-[#3b6fc9] text-white" : "bg-transparent text-[#111827]",
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
          <div className="rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {catalogLoading ? t("불러오는 중") : `${finalRecommendations.length}${t("개")}`}
          </div>
        </div>

        {topSignals.length > 0 && !searchQuery ? (
          <div className="flex flex-wrap gap-2">
            {topSignals.map((signal) => (
              <span key={signal.key} className="inline-flex rounded-full bg-[#eef4fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
                {signal.label}
              </span>
            ))}
          </div>
        ) : null}

        {/* 상품 그리드 */}
        <div id="shop-product-grid" className="grid grid-cols-2 gap-x-4 gap-y-7">
          {!catalogLoading && finalRecommendations.map((entry, index) => (
            <div key={entry.product.id} className="relative block">
              <button
                type="button" data-auth-allow
                onClick={(e) => handleToggleWishlist(entry.product.id, e)}
                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 shadow backdrop-blur-sm"
              >
                <HeartIcon filled={wishlist.includes(entry.product.id)} />
              </button>
              <Link href={`/shop/${encodeURIComponent(entry.product.id)}`} data-auth-allow className="block">
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
                  {entry.product.outOfStock ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-[#111827]">품절</span>
                    </div>
                  ) : index < 2 ? (
                    <div className="absolute left-3 top-3 border border-[#3b6fc9] bg-white px-3 py-1 text-[11px] font-semibold text-[#3b6fc9]">NEW</div>
                  ) : null}
                  {entry.product.stockCount !== null && entry.product.stockCount > 0 && entry.product.stockCount <= 5 && !entry.product.outOfStock ? (
                    <div className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold text-[#e63946]">
                      잔여 {entry.product.stockCount}개
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 text-[16px] font-semibold leading-7 tracking-[-0.02em] text-[#111827]">{entry.product.name}</div>
                <div className="mt-1 flex flex-wrap items-end gap-1.5">
                  {entry.product.originalPriceKrw && entry.product.priceKrw && entry.product.originalPriceKrw > entry.product.priceKrw ? (
                    <>
                      <span className="text-[11px] text-[#8d99ab] line-through">{entry.product.originalPriceKrw.toLocaleString("ko-KR")}원</span>
                      <span className="text-[14px] font-bold text-[#111827]">{formatShopPrice(entry.product)}</span>
                      <span className="text-[11px] font-semibold text-[#e63946]">
                        -{Math.round((1 - entry.product.priceKrw / entry.product.originalPriceKrw) * 100)}%
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="text-[14px] font-bold text-[#111827]">{formatShopPrice(entry.product)}</div>
                      <div className="text-[12px] font-semibold text-[#d72f2f]">
                        {entry.product.checkoutEnabled && entry.product.priceKrw ? t("바로결제") : t("상세보기")}
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-[#8d99ab]">{entry.primaryReason}</div>
              </Link>
            </div>
          ))}

          {catalogLoading ? (
            <div className="col-span-2 rounded-3xl border border-[#edf1f6] bg-white px-5 py-6 text-[13px] text-[#65748b]">{t("상품을 불러오는 중입니다.")}</div>
          ) : null}

          {!catalogLoading && finalRecommendations.length === 0 ? (
            <div className="col-span-2 rounded-3xl border border-[#edf1f6] bg-white px-5 py-6 text-[13px] text-[#65748b]">
              {searchQuery ? `"${searchQuery}"에 맞는 상품이 없습니다.` : t("현재 조건에 맞는 상품이 없습니다. 카테고리를 바꾸거나 잠시 후 다시 확인해 주세요.")}
            </div>
          ) : null}
        </div>

        {/* 최근 본 상품 */}
        {recentProducts.length > 0 ? (
          <div>
            <div className="mb-3 text-[14px] font-bold text-[#111827]">{t("최근 본 상품")}</div>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
              {recentProducts.map((product) => (
                <Link key={product.id} href={`/shop/${encodeURIComponent(product.id)}`} data-auth-allow className="block shrink-0 w-[120px]">
                  <div className="overflow-hidden rounded-2xl bg-[#f3f5f7]">
                    {product.imageUrls[0] ? (
                      <img src={product.imageUrls[0]} alt={product.name} className="aspect-square w-full object-cover" />
                    ) : (
                      <div className={["flex aspect-square items-center justify-center", productToneClass(product)].join(" ")}>
                        <div className="text-[16px] font-bold">{product.visualLabel.slice(0, 3)}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 text-[12px] font-semibold leading-5 text-[#111827] line-clamp-2">{product.name}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#44556d]">{formatShopPrice(product)}</div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* 주문 내역 섹션 */}
        {status === "authenticated" ? (
          <div id="shop-orders" className="rounded-[32px] border border-[#edf1f6] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("내 주문")}</div>
                <div className="mt-1 text-[12.5px] text-[#65748b]">{t("최근 주문을 확인하고 필요한 경우 환불 요청을 진행할 수 있습니다.")}</div>
              </div>
              <Link href="/shop/orders" data-auth-allow className={`${SECONDARY_BUTTON} h-9 shrink-0 text-[11px]`}>
                {t("전체 보기")}
              </Link>
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
                          {order.shipping.recipientName} · {order.shipping.addressLine1}{order.shipping.addressLine2 ? ` ${order.shipping.addressLine2}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>

                  {order.trackingNumber ? (
                    <div className="mt-2 rounded-2xl bg-[#eef4fb] px-3 py-1.5 text-[11px] text-[#44556d]">
                      📦 {order.courier} · {order.trackingNumber}
                    </div>
                  ) : null}

                  {order.refund.status === "requested" && <div className="mt-2 text-[11.5px] text-[#65748b]">{t("환불 요청 접수됨")} · {order.refund.reason ?? t("사유 없음")}</div>}
                  {order.refund.status === "rejected" && <div className="mt-2 text-[11.5px] text-[#a33a2b]">{t("환불 반려")} · {order.refund.note ?? t("사유 없음")}</div>}
                  {order.refund.status === "done" && <div className="mt-2 text-[11.5px] text-[#11294b]">{t("환불 완료")}</div>}
                  {order.status === "FAILED" && order.failMessage && <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div>}

                  <div className="mt-3 flex gap-2">
                    <Link href={`/shop/orders/${encodeURIComponent(order.orderId)}`} data-auth-allow className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                      상세
                    </Link>
                    {order.status === "PAID" && order.refund.status === "none" ? (
                      <button type="button" data-auth-allow onClick={() => void requestRefund(order.orderId)} className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                        {t("환불 요청")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}

              {!ordersLoading && orders.length === 0 ? (
                <div className="rounded-3xl border border-[#edf1f6] bg-[#f8fafc] px-4 py-4 text-[12.5px] text-[#65748b]">{t("아직 주문이 없습니다. 상품 상세 페이지에서 바로 결제할 수 있습니다.")}</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 법적 푸터 */}
        <div className="mt-8 space-y-3 border-t border-[#edf1f6] pt-6 text-[11px] leading-5 text-[#8d99ab]">
          <div className="space-y-1">
            <div className="font-semibold text-[#65748b]">RNest</div>
            <div>대표: [대표자명] · 사업자등록번호: 000-00-00000</div>
            <div>통신판매업신고번호: 제2025-서울○○-0000호</div>
            <div>주소: 서울특별시 ○○구 ○○로 000, 0층</div>
            <div>고객센터: <a href="mailto:support@rnest.kr" className="text-[#3b6fc9]">support@rnest.kr</a></div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/shop/policy" data-auth-allow className="underline hover:text-[#111827]">환불·반품 정책</Link>
            <span>·</span>
            <Link href="/terms" data-auth-allow className="underline hover:text-[#111827]">이용약관</Link>
            <span>·</span>
            <Link href="/privacy" data-auth-allow className="underline hover:text-[#111827]">개인정보처리방침</Link>
          </div>
          <div>© RNest. All rights reserved.</div>
        </div>
      </div>
    </div>
  );
}
