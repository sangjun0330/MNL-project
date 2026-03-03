"use client";
/* eslint-disable @next/next/no-img-element */

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import {
  buildShopRecommendations,
  formatShopCurrency,
  formatShopPrice,
  getShopCategoryMeta,
  getShopImageSrc,
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  type ShopCategoryKey,
  type ShopProduct,
} from "@/lib/shop";
import { ShopBrandLogo } from "@/components/shop/ShopBrandLogo";
import { ShopLanguageSwitcher } from "@/components/shop/ShopLanguageSwitcher";
import { useAppStoreSelector } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";
import {
  getWishlist,
  loadShopClientState,
  toggleWishlist,
} from "@/lib/shopClient";

type SortKey = "recommended" | "newest" | "price_asc" | "price_desc";
type PriceFilter = "all" | "free" | "under20k" | "under50k" | "over50k";

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
    <svg viewBox="0 0 24 24" fill={filled ? "#e63946" : "none"} stroke={filled ? "#e63946" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
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

function productToneClass(product: ShopProduct) {
  if (product.checkoutEnabled && product.priceKrw) return "border border-[#11294b] bg-[#11294b] text-white";
  if (product.externalUrl) return "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  return "border border-[#e1e7f0] bg-[#f7f9fc] text-[#11294b]";
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
  const { t, lang } = useI18n();
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
    const clientState = loadShopClientState();
    setRecentIds(clientState.recentIds);
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setWishlist([]);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        const headers = await authHeaders();
        const ids = await getWishlist(headers);
        if (!active) return;
        setWishlist(ids);
      } catch {
        if (!active) return;
        setWishlist([]);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

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
      const localized = [
        p.name,
        t(p.name),
        p.subtitle,
        t(p.subtitle),
        p.description,
        t(p.description),
        ...p.benefitTags,
        ...p.benefitTags.map((tag) => t(tag)),
      ].join(" ").toLowerCase();
      return localized.includes(keyword);
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
  }, [filteredShopState.recommendations, priceFilter, searchQuery, sortKey, t]);

  const selectedDateLabel = useMemo(() => {
    const date = new Date(allShopState.selectedDate);
    if (Number.isNaN(date.getTime())) return allShopState.selectedDate;
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }, [allShopState.selectedDate, lang]);
  const topSignals = allShopState.signals.slice(0, 4);
  const activeCategoryMeta = getShopCategoryMeta(category);

  // 최근 본 상품
  const recentProducts = useMemo(
    () => recentIds.map((id) => catalog.find((p) => p.id === id)).filter((p): p is ShopProduct => Boolean(p)).slice(0, 6),
    [recentIds, catalog]
  );

  const featuredPrimary = allShopState.recommendations[0] ?? null;
  const featuredSecondary = allShopState.recommendations.slice(1, 3);

  const handleToggleWishlist = async (productId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "authenticated" || !user?.userId) {
      setOrderMessageTone("error");
      setOrderMessage(t("위시리스트는 로그인한 계정에 저장됩니다."));
      return;
    }
    try {
      const headers = await authHeaders();
      const next = await toggleWishlist(productId, headers);
      setWishlist(next.ids);
    } catch {
      setOrderMessageTone("error");
      setOrderMessage(t("위시리스트 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    }
  };

  return (
    <div className="-mx-4 pb-24">
      <div className="bg-[#102a43] px-4 py-3 text-center text-[12.5px] font-semibold text-white">
        {t("오늘 회복 흐름에 맞는 추천 상품과 구매 정보를 한눈에 확인하세요")}
      </div>

      {/* 헤더 */}
      <div className="relative z-[60] border-b border-[#edf1f6] bg-white px-4 py-3">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <ShopLanguageSwitcher />
          <Link href="/shop" data-auth-allow className="justify-self-center">
            <ShopBrandLogo className="h-9 w-[146px]" />
          </Link>
          <div className="ml-auto flex items-center gap-0.5">
            <Link href="/shop/wishlist" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label={t("찜한 상품")}>
              <WishlistIcon />
            </Link>
            <Link href="/shop/cart" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label={t("장바구니")}>
              <CartIcon />
            </Link>
            <Link href="/shop/profile" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label={t("쇼핑 프로필")}>
              <ProfileIcon />
            </Link>
          </div>
        </div>
      </div>

      {/* 검색창 */}
      <div className="relative z-10 bg-white border-b border-[#edf1f6] px-4 py-3">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8d99ab]"><SearchIcon /></span>
          <input
            type="text"
            placeholder={t("상품 이름, 효능, 태그로 검색...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-[#edf1f6] bg-[#f8fafc] py-2.5 pl-9 pr-4 text-[13px] text-[#111827] outline-none placeholder:text-[#92a0b4] focus:border-[#102a43]"
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
            {t("필터")} {(priceFilter !== "all" || sortKey !== "recommended") ? <span className="rounded-full bg-[#102a43] px-1.5 py-0.5 text-[10px] text-white">ON</span> : null}
          </button>
          {(searchQuery || priceFilter !== "all" || sortKey !== "recommended") ? (
            <button type="button" data-auth-allow onClick={() => { setSearchQuery(""); setPriceFilter("all"); setSortKey("recommended"); }} className="text-[11px] text-[#8d99ab]">
              {t("초기화")}
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
                      "rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition",
                      sortKey === item.key ? "border-[#17324d] bg-[#d1deea] text-[#2f4d6a]" : "border-[#bfd0e1] bg-white text-[#60768d]",
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
                      "rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition",
                      priceFilter === item.key ? "border-[#17324d] bg-[#d1deea] text-[#2f4d6a]" : "border-[#bfd0e1] bg-white text-[#60768d]",
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
                    <img src={getShopImageSrc(featuredPrimary.product.imageUrls[0])} alt={t(featuredPrimary.product.name)} className="aspect-[1.15/1] w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className={["flex aspect-[1.15/1] items-end px-6 py-6", productToneClass(featuredPrimary.product)].join(" ")}>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{t(featuredPrimary.product.partnerLabel)}</div>
                        <div className="mt-3 text-[28px] font-bold tracking-[-0.03em]">{t(featuredPrimary.product.visualLabel)}</div>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-4 right-4 rounded-full bg-black/12 px-3 py-1 text-[11px] font-semibold text-white">
                    1 / {Math.max(1, featuredPrimary.product.imageUrls.length || 1)}
                  </div>
                  {featuredPrimary.product.outOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[32px]">
                      <span className="rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#111827]">{t("품절")}</span>
                    </div>
                  )}
                </div>
                <div className="px-4 py-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8d99ab]">{t("오늘의 추천")}</div>
                  <div className="mt-3 text-[16px] font-bold leading-7 tracking-[-0.02em] text-[#111827]">{t(featuredPrimary.product.name)}</div>
                  <div className="mt-2 text-[13px] leading-6 text-[#44556d]">{allShopState.focusSummary}</div>
                  <div className="mt-4 flex items-center gap-2">
                    {featuredPrimary.product.originalPriceKrw && featuredPrimary.product.priceKrw && featuredPrimary.product.originalPriceKrw > featuredPrimary.product.priceKrw ? (
                      <>
                        <span className="text-[12px] text-[#8d99ab] line-through">{formatShopCurrency(featuredPrimary.product.originalPriceKrw)}</span>
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
                          <img src={getShopImageSrc(entry.product.imageUrls[0])} alt={t(entry.product.name)} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className={["flex aspect-square items-end px-4 py-4", productToneClass(entry.product)].join(" ")}>
                            <div className="text-[20px] font-bold tracking-[-0.03em]">{t(entry.product.visualLabel)}</div>
                          </div>
                        )}
                        {entry.product.outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-[22px]">
                            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#111827]">{t("품절")}</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 text-[14px] font-semibold leading-6 text-[#111827]">{t(entry.product.name)}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {entry.product.originalPriceKrw && entry.product.priceKrw && entry.product.originalPriceKrw > entry.product.priceKrw ? (
                          <>
                            <span className="text-[11px] text-[#8d99ab] line-through">{formatShopCurrency(entry.product.originalPriceKrw)}</span>
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
                  "shrink-0 rounded-full border-2 px-5 py-3 text-[13px] font-semibold transition",
                  active ? "border-[#17324d] bg-[#d1deea] text-[#2f4d6a]" : "border-transparent bg-transparent text-[#60768d]",
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
            {catalogLoading ? t("불러오는 중") : `${finalRecommendations.length} ${t("개")}`}
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
                    <img src={getShopImageSrc(entry.product.imageUrls[0])} alt={t(entry.product.name)} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className={["flex aspect-square items-center justify-center p-4", productToneClass(entry.product)].join(" ")}>
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-75">{t(entry.product.partnerLabel)}</div>
                        <div className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{t(entry.product.visualLabel)}</div>
                      </div>
                    </div>
                  )}
                  {entry.product.outOfStock ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-[#111827]">{t("품절")}</span>
                    </div>
                  ) : index < 2 ? (
                    <div className="absolute left-3 top-3 border border-[#3b6fc9] bg-white px-3 py-1 text-[11px] font-semibold text-[#3b6fc9]">NEW</div>
                  ) : null}
                  {entry.product.stockCount !== null && entry.product.stockCount > 0 && entry.product.stockCount <= 5 && !entry.product.outOfStock ? (
                    <div className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-bold text-[#e63946]">
                      {t("잔여 {count}개", { count: entry.product.stockCount })}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 text-[16px] font-semibold leading-7 tracking-[-0.02em] text-[#111827]">{t(entry.product.name)}</div>
                <div className="mt-1 flex flex-wrap items-end gap-1.5">
                  {entry.product.originalPriceKrw && entry.product.priceKrw && entry.product.originalPriceKrw > entry.product.priceKrw ? (
                    <>
                      <span className="text-[11px] text-[#8d99ab] line-through">{formatShopCurrency(entry.product.originalPriceKrw)}</span>
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
              {searchQuery
                ? (lang === "en" ? `No products match "${searchQuery}".` : `"${searchQuery}"에 맞는 상품이 없습니다.`)
                : t("현재 조건에 맞는 상품이 없습니다. 카테고리를 바꾸거나 잠시 후 다시 확인해 주세요.")}
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
                      <img src={getShopImageSrc(product.imageUrls[0])} alt={t(product.name)} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className={["flex aspect-square items-center justify-center", productToneClass(product)].join(" ")}>
                        <div className="text-[16px] font-bold">{t(product.visualLabel).slice(0, 3)}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 text-[12px] font-semibold leading-5 text-[#111827] line-clamp-2">{t(product.name)}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#44556d]">{formatShopPrice(product)}</div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* 법적 푸터 */}
        <div className="mt-8 space-y-3 border-t border-[#edf1f6] pt-6 text-[11px] leading-5 text-[#8d99ab]">
          <div className="space-y-1">
            <div className="font-semibold text-[#65748b]">RNest</div>
            <div>{t("대표: [대표자명] · 사업자등록번호: 000-00-00000")}</div>
            <div>{t("통신판매업신고번호: 제2025-서울○○-0000호")}</div>
            <div>{t("주소: 서울특별시 ○○구 ○○로 000, 0층")}</div>
            <div>{t("고객센터:")} <a href="mailto:support@rnest.kr" className="text-[#3b6fc9]">support@rnest.kr</a></div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/shop/policy" data-auth-allow className="underline hover:text-[#111827]">{t("환불·반품 정책")}</Link>
            <span>·</span>
            <Link href="/terms" data-auth-allow className="underline hover:text-[#111827]">{t("이용약관")}</Link>
            <span>·</span>
            <Link href="/privacy" data-auth-allow className="underline hover:text-[#111827]">{t("개인정보처리방침")}</Link>
          </div>
          <div>© RNest. All rights reserved.</div>
        </div>
      </div>
    </div>
  );
}
