"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders, ensureTossScript } from "@/lib/billing/client";
import { cn } from "@/lib/cn";
import { formatShopPrice, type ShopProduct } from "@/lib/shop";
import { formatShopShippingSingleLine, isCompleteShopShippingProfile, type ShopShippingProfile } from "@/lib/shopProfile";
import { loadShopClientState, markShopPartnerClick, markShopViewed, saveShopClientState } from "@/lib/shopClient";
import { useI18n } from "@/lib/useI18n";
import { ShopCheckoutSheet } from "@/components/shop/ShopCheckoutSheet";

type ShopReviewRecord = {
  id: number;
  productId: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type ShopReviewSummary = {
  count: number;
  averageRating: number;
};

const REVIEWS_PER_PAGE = 5;
const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";
const INPUT_CLASS = "w-full rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[14px] text-[#11294b] outline-none transition placeholder:text-[#92a0b4] focus:border-[#11294b]";

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

function productToneClass(product: ShopProduct) {
  if (product.checkoutEnabled && product.priceKrw) return "border border-[#11294b] bg-[#11294b] text-white";
  if (product.externalUrl) return "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  return "border border-[#e1e7f0] bg-[#f7f9fc] text-[#11294b]";
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => (index < Math.round(rating) ? "★" : "☆")).join("");
}

function reviewBarWidthClass(percent: number) {
  if (percent >= 95) return "w-full";
  if (percent >= 90) return "w-[90%]";
  if (percent >= 80) return "w-[80%]";
  if (percent >= 70) return "w-[70%]";
  if (percent >= 60) return "w-[60%]";
  if (percent >= 50) return "w-1/2";
  if (percent >= 40) return "w-[40%]";
  if (percent >= 30) return "w-[30%]";
  if (percent >= 20) return "w-[20%]";
  if (percent >= 10) return "w-[10%]";
  if (percent > 0) return "w-[4%]";
  return "w-0";
}

export function ShopProductDetailPage({ product }: { product: ShopProduct }) {
  const { t } = useI18n();
  const { status } = useAuthState();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [shippingProfile, setShippingProfile] = useState<ShopShippingProfile | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [reviews, setReviews] = useState<ShopReviewRecord[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ShopReviewSummary>({ count: 0, averageRating: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [expandedReviews, setExpandedReviews] = useState<Record<number, boolean>>({});
  const [reviewSort, setReviewSort] = useState<"recommended" | "latest" | "rating_high" | "rating_low">("recommended");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewMinRating, setReviewMinRating] = useState(0);
  const [reviewDraft, setReviewDraft] = useState({
    rating: 5,
    title: "",
    body: "",
  });
  const detail = product.detailPage;

  useEffect(() => {
    const current = loadShopClientState();
    saveShopClientState(markShopViewed(current, product.id));
  }, [product.id]);

  useEffect(() => {
    setSelectedImageIndex(0);
    setReviewPage(1);
    setExpandedReviews({});
  }, [product.id]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setReviewsLoading(true);
      try {
        const res = await fetch(`/api/shop/reviews?productId=${encodeURIComponent(product.id)}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
        setReviews(Array.isArray(json?.data?.reviews) ? (json.data.reviews as ShopReviewRecord[]) : []);
        setReviewSummary((json?.data?.summary as ShopReviewSummary) ?? { count: 0, averageRating: 0 });
      } catch {
        if (!active) return;
        setReviews([]);
        setReviewSummary({ count: 0, averageRating: 0 });
      } finally {
        if (!active) return;
        setReviewsLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [product.id]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated") {
      setShippingProfile(null);
      setShippingLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setShippingLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/profile", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
        setShippingProfile((json?.data?.profile as ShopShippingProfile | null) ?? null);
      } catch {
        if (!active) return;
        setShippingProfile(null);
      } finally {
        if (!active) return;
        setShippingLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status]);

  const selectedImageUrl = product.imageUrls[selectedImageIndex] ?? null;
  const shippingReady = Boolean(shippingProfile && isCompleteShopShippingProfile(shippingProfile));
  const shippingLabel = shippingProfile ? `${shippingProfile.recipientName} · ${shippingProfile.phone} · ${formatShopShippingSingleLine(shippingProfile)}` : null;
  const totalPrice = Math.round((product.priceKrw ?? 0) * quantity);
  const reviewDistribution = useMemo(() => {
    const buckets = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => review.rating === rating).length,
    }));
    return buckets.map((item) => ({
      ...item,
      percent: reviewSummary.count > 0 ? Math.round((item.count / reviewSummary.count) * 100) : 0,
    }));
  }, [reviews, reviewSummary.count]);
  const filteredReviews = useMemo(() => {
    const keyword = reviewSearch.trim().toLowerCase();
    const base = reviews.filter((review) => {
      if (reviewMinRating > 0 && review.rating < reviewMinRating) return false;
      if (!keyword) return true;
      return `${review.title} ${review.body}`.toLowerCase().includes(keyword);
    });

    return [...base].sort((a, b) => {
      if (reviewSort === "rating_high") {
        return b.rating - a.rating || new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      }
      if (reviewSort === "rating_low") {
        return a.rating - b.rating || new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      }
      if (reviewSort === "latest") {
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      }
      const scoreDiff = b.rating - a.rating;
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  }, [reviewMinRating, reviewSearch, reviewSort, reviews]);
  const totalReviewPages = Math.max(1, Math.ceil(filteredReviews.length / REVIEWS_PER_PAGE));
  const visibleReviews = useMemo(
    () => filteredReviews.slice((reviewPage - 1) * REVIEWS_PER_PAGE, reviewPage * REVIEWS_PER_PAGE),
    [filteredReviews, reviewPage]
  );

  useEffect(() => {
    setReviewPage(1);
  }, [reviewSort, reviewSearch, reviewMinRating, product.id]);

  const handleCheckout = async () => {
    if (!product.checkoutEnabled || !product.priceKrw) return;
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage("결제는 로그인 후 가능합니다.");
      return;
    }
    if (!shippingReady) {
      setMessageTone("error");
      setMessage("주문 전에 계정 설정에서 기본 배송지를 먼저 저장해 주세요.");
      return;
    }

    setCheckoutLoading(true);
    setMessage(null);

    try {
      const headers = await authHeaders();
      const checkoutRes = await fetch("/api/shop/orders/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          productId: product.id,
          quantity,
        }),
      });
      const checkoutJson = await checkoutRes.json().catch(() => null);
      if (!checkoutRes.ok || !checkoutJson?.ok) {
        throw new Error(String(checkoutJson?.error ?? `checkout_http_${checkoutRes.status}`));
      }

      const data = checkoutJson.data as {
        orderId: string;
        orderName: string;
        amount: number;
        currency: "KRW";
        clientKey: string;
        customerKey: string;
        customerEmail: string | null;
        customerName: string | null;
        successUrl: string;
        failUrl: string;
      };

      await ensureTossScript();
      if (!window.TossPayments) throw new Error("missing_toss_sdk");

      const tossPayments = window.TossPayments(data.clientKey);
      const payment = tossPayments.payment({ customerKey: data.customerKey });

      await payment.requestPayment({
        method: "CARD",
        amount: {
          currency: data.currency,
          value: data.amount,
        },
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: data.successUrl,
        failUrl: data.failUrl,
        customerEmail: data.customerEmail ?? undefined,
        customerName: data.customerName ?? undefined,
        card: {
          useEscrow: false,
          useCardPoint: false,
          useAppCardOnly: false,
        },
      });
    } catch (error: any) {
      const text = String(error?.message ?? "failed_to_start_shop_checkout");
      setMessageTone("error");
      if (text.includes("too_many_pending_shop_orders")) {
        setMessage("결제 대기 주문이 많습니다. 기존 결제를 마친 뒤 다시 시도해 주세요.");
      } else if (text.includes("shop_checkout_disabled")) {
        setMessage("현재 이 상품은 앱 내 결제가 비활성화되어 있습니다.");
      } else if (text.includes("missing_shipping_address")) {
        setMessage("기본 배송지가 없어 주문을 진행할 수 없습니다. 계정에서 배송지를 먼저 저장해 주세요.");
      } else if (text.includes("shop_profile_storage_unavailable")) {
        setMessage("배송지 저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      } else if (text.includes("missing_toss_sdk")) {
        setMessage("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        setMessage("결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setCheckoutLoading(false);
      setCheckoutOpen(false);
    }
  };

  const handleOpenCheckout = () => {
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage("결제는 로그인 후 가능합니다.");
      return;
    }
    if (!shippingReady) {
      setMessageTone("error");
      setMessage("주문 전에 계정 설정에서 기본 배송지를 먼저 저장해 주세요.");
      return;
    }
    setCheckoutOpen(true);
  };

  const handlePartnerClick = () => {
    const current = loadShopClientState();
    saveShopClientState(markShopPartnerClick(current, product.id));
  };

  const submitReview = async () => {
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage("리뷰는 로그인 후 작성할 수 있습니다.");
      return;
    }
    if (!reviewDraft.body.trim()) {
      setMessageTone("error");
      setMessage("리뷰 내용을 입력해 주세요.");
      return;
    }

    setReviewSaving(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/reviews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          productId: product.id,
          rating: reviewDraft.rating,
          title: reviewDraft.title,
          body: reviewDraft.body,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      setReviews(Array.isArray(json?.data?.reviews) ? (json.data.reviews as ShopReviewRecord[]) : []);
      setReviewSummary((json?.data?.summary as ShopReviewSummary) ?? { count: 0, averageRating: 0 });
      setReviewDraft({
        rating: 5,
        title: "",
        body: "",
      });
      setMessageTone("notice");
      setMessage("리뷰가 저장되었습니다.");
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_save_shop_review");
      setMessageTone("error");
      if (code === "shop_review_storage_unavailable") {
        setMessage("리뷰 저장소를 아직 사용할 수 없습니다. Supabase shop 확장 마이그레이션을 먼저 적용해 주세요.");
      } else if (code === "invalid_shop_review") {
        setMessage("평점과 리뷰 내용을 확인해 주세요.");
      } else {
        setMessage("리뷰 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <div className="-mx-4 pb-[calc(182px+env(safe-area-inset-bottom))]">
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
              document.getElementById("shop-product-info")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex h-10 w-10 items-center justify-center text-[#111827]"
            aria-label={t("상세 정보로 이동")}
          >
            <MenuIcon />
          </button>
          <button
            type="button"
            data-auth-allow
            onClick={() => setSelectedImageIndex((current) => (current + 1) % Math.max(1, product.imageUrls.length || 1))}
            className="inline-flex items-center gap-1 text-[#111827]"
            aria-label={t("다음 상품 이미지")}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d7dfeb] bg-[#f8fafc] text-[10px] font-bold text-[#11294b]">
              {selectedImageIndex + 1}
            </span>
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
              document.getElementById("shop-detail-buybar")?.scrollIntoView({ behavior: "smooth", block: "end" });
            }}
            className="inline-flex h-10 w-10 items-center justify-center text-[#111827]"
            aria-label={t("구매 영역으로 이동")}
          >
            <CartIcon />
          </button>
          <Link href="/settings/account" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label={t("계정 설정")}>
            <ProfileIcon />
          </Link>
        </div>
      </div>

      <div className="space-y-6 bg-[#f8f9fb] pb-8">
        {message ? (
          <div
            className={[
              "mx-4 mt-5 rounded-3xl px-4 py-3 text-[12.5px] leading-5",
              messageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
            ].join(" ")}
          >
            {message}
          </div>
        ) : null}

        <section id="shop-product-gallery" className="bg-white">
          <div className="relative bg-[#eef1f4]">
            {selectedImageUrl ? (
              <img src={selectedImageUrl} alt={product.name} className="aspect-square w-full object-cover" />
            ) : (
              <div className={cn("flex aspect-square w-full items-end p-8", productToneClass(product))}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{product.partnerLabel}</div>
                  <div className="mt-3 text-[30px] font-bold tracking-[-0.03em]">{product.visualLabel}</div>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 right-4 rounded-full bg-black/10 px-3 py-1 text-[11px] font-semibold text-white">
              {selectedImageIndex + 1} / {Math.max(1, product.imageUrls.length || 1)}
            </div>
          </div>

          {product.imageUrls.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {product.imageUrls.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  data-auth-allow
                  onClick={() => setSelectedImageIndex(index)}
                  className={cn(
                    "shrink-0 overflow-hidden rounded-2xl border bg-white",
                    index === selectedImageIndex ? "border-[#69c8ee]" : "border-[#e6ebf2]"
                  )}
                >
                  <img src={url} alt={`${product.name} ${index + 1}`} className="h-16 w-16 object-cover" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-4 px-4 py-5">
            <div className="text-[16px] font-semibold leading-7 tracking-[-0.02em] text-[#111827]">{product.name}</div>
            <div className="text-[13px] leading-6 text-[#65748b]">{product.subtitle}</div>
            <div className="space-y-1">
              <div className="text-[12px] text-[#9aa6b6]">{product.partnerStatus}</div>
              <div className="text-[32px] font-bold tracking-[-0.04em] text-[#111827]">{formatShopPrice(product)}</div>
            </div>

            {product.checkoutEnabled && product.priceKrw ? (
              <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold text-[#111827]">{t("수량")}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                      className={`${SECONDARY_BUTTON} h-10 w-10 px-0 text-[16px]`}
                    >
                      -
                    </button>
                    <div className="flex h-10 min-w-[56px] items-center justify-center rounded-2xl border border-[#d7dfeb] bg-white px-4 text-[14px] font-semibold text-[#11294b]">
                      {quantity}
                    </div>
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => setQuantity((current) => Math.min(9, current + 1))}
                      className={`${SECONDARY_BUTTON} h-10 w-10 px-0 text-[16px]`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-[13px] font-semibold text-[#111827]">
                  {t("총 결제 금액")} · <span className="text-[#11294b]">{totalPrice.toLocaleString("ko-KR")}원</span>
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-7 text-[#111827]">
              <div className="font-semibold text-[#11294b]">{detail.headline}</div>
              <div className="mt-2 text-[#44556d]">{detail.summary}</div>
              {product.useMoments.length > 0 ? (
                <div className="mt-3 space-y-1 text-[#44556d]">
                  {product.useMoments.slice(0, 3).map((item) => (
                    <div key={item}>• {item}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section id="shop-product-info" className="space-y-6 bg-white px-4 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            {product.imageUrls.slice(0, 2).map((url, index) => (
              <div key={`${url}-${index}`} className="overflow-hidden rounded-[2px] bg-[#eef1f4]">
                <img src={url} alt={`${product.name} gallery ${index + 1}`} className="aspect-square w-full object-cover" />
              </div>
            ))}
          </div>

          <div className="text-[28px] font-bold leading-tight tracking-[-0.04em] text-[#111827]">{detail.storyTitle}</div>
          <div className="text-[15px] leading-8 text-[#44556d]">{detail.storyBody}</div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-[#69c8ee] px-5 py-6 text-white">
              <div className="text-[22px] font-bold tracking-[-0.03em]">{detail.featureTitle}</div>
              <div className="mt-4 space-y-2 text-[13px] leading-6 text-white/90">
                {detail.featureItems.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] px-5 py-6">
              <div className="text-[22px] font-bold tracking-[-0.03em] text-[#111827]">{detail.routineTitle}</div>
              <div className="mt-4 space-y-2 text-[13px] leading-6 text-[#44556d]">
                {detail.routineItems.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            </div>
          </div>

          {product.specs.length > 0 ? (
            <div className="space-y-3 border-t border-[#edf1f6] pt-5">
              {product.specs.map((spec) => (
                <div key={`${spec.label}-${spec.value}`} className="grid grid-cols-[110px_1fr] gap-4 text-[13px]">
                  <div className="text-[#9aa6b6]">{spec.label}</div>
                  <div className="font-medium text-[#111827]">{spec.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-3 border-t border-[#edf1f6] pt-5 text-[13px]">
            <div className="grid grid-cols-[110px_1fr] gap-4">
              <div className="text-[#9aa6b6]">{t("국내·해외배송")}</div>
              <div className="font-medium text-[#111827]">{t("국내배송")}</div>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-4">
              <div className="text-[#9aa6b6]">{t("배송방법")}</div>
              <div className="font-medium text-[#111827]">{t("택배")}</div>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-4">
              <div className="text-[#9aa6b6]">{t("배송비")}</div>
              <div className="font-medium text-[#111827]">{t("3,000원 (50,000원 이상 구매 시 무료)")}</div>
            </div>
          </div>
        </section>

        <section id="shop-product-reviews" className="space-y-6 bg-white px-4 py-6">
          <div className="text-[22px] font-bold tracking-[-0.03em] text-[#111827]">
            {t("리뷰")} ({reviewSummary.count})
          </div>

          <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] px-4 py-5">
            <div className="text-center">
              <div className="text-[40px] font-bold tracking-[-0.04em] text-[#11294b]">
                {reviewSummary.count > 0 ? reviewSummary.averageRating.toFixed(1) : "0.0"}
              </div>
              <div className="mt-1 text-[14px] font-semibold text-[#69c8ee]">
                {reviewSummary.count.toLocaleString("ko-KR")} {t("개 리뷰")}
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {reviewDistribution.map((item) => (
                <div key={item.rating} className="grid grid-cols-[72px_1fr_44px] items-center gap-3 text-[12px]">
                  <div className="text-[#69c8ee]">{item.rating}점</div>
                  <div className="h-3 rounded-full bg-[#edf1f6]">
                    <div className={cn("h-3 rounded-full bg-[#69c8ee]", reviewBarWidthClass(item.percent))} />
                  </div>
                  <div className="text-right text-[#8d99ab]">{item.percent}%</div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            data-auth-allow
            onClick={() => {
              if (typeof window === "undefined") return;
              document.getElementById("shop-review-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex h-14 w-full items-center justify-center rounded-3xl bg-[#69c8ee] text-[15px] font-semibold text-white"
          >
            {t("리뷰작성")}
          </button>

          <div className="grid gap-3 border-y border-[#edf1f6] py-4">
            <div className="flex items-center gap-4 text-[13px] text-[#8d99ab]">
              <span className="font-semibold text-[#111827]">{t("포토&동영상")}</span>
              <select
                value={reviewSort}
                onChange={(event) => setReviewSort(event.target.value as "recommended" | "latest" | "rating_high" | "rating_low")}
                className="min-w-[110px] bg-transparent font-semibold text-[#111827] outline-none"
              >
                <option value="recommended">{t("추천순")}</option>
                <option value="latest">{t("최신순")}</option>
                <option value="rating_high">{t("별점 높은순")}</option>
                <option value="rating_low">{t("별점 낮은순")}</option>
              </select>
            </div>
            <input
              value={reviewSearch}
              onChange={(event) => setReviewSearch(event.target.value)}
              className="w-full rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[13px] text-[#111827] outline-none placeholder:text-[#a6afbb]"
              placeholder={t("직접검색")}
            />
          </div>

          <div className="inline-flex w-[140px] rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3">
            <select
              value={reviewMinRating}
              onChange={(event) => setReviewMinRating(Number(event.target.value))}
              className="w-full bg-transparent text-[13px] font-semibold text-[#111827] outline-none"
            >
              <option value={0}>{t("별점 전체")}</option>
              <option value={5}>{t("5점만")}</option>
              <option value={4}>{t("4점 이상")}</option>
              <option value={3}>{t("3점 이상")}</option>
              <option value={2}>{t("2점 이상")}</option>
              <option value={1}>{t("1점 이상")}</option>
            </select>
          </div>

          <div className="space-y-8 border-t border-[#edf1f6] pt-6">
            {visibleReviews.map((review) => {
              const expanded = Boolean(expandedReviews[review.id]);
              const longReview = review.body.length > 110;
              const preview = longReview && !expanded ? `${review.body.slice(0, 110)}...` : review.body;
              return (
                <div key={review.id} className="space-y-4">
                  <div className="text-[20px] tracking-[0.15em] text-[#69c8ee]">{renderStars(review.rating)}</div>
                  <div className="flex items-center gap-3 text-[13px] text-[#4f5d72]">
                    <span>{t("회원님")} · {formatDateLabel(review.updatedAt || review.createdAt)}</span>
                    <span className="rounded-xl bg-[#f1f3f6] px-3 py-2 text-[12px] font-semibold text-[#66758a]">{t("리뷰")}</span>
                  </div>
                  <div className="border-l-4 border-[#dfe4ea] pl-4 text-[13px] text-[#9aa6b6]">
                    {product.useMoments[0] ? `${t("사용 시점")} · ${product.useMoments[0]}` : t("구매 정보가 저장되면 여기에 표시됩니다.")}
                  </div>
                  <div className="text-[15px] font-medium leading-8 text-[#111827]">{preview}</div>
                  {longReview ? (
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() =>
                        setExpandedReviews((current) => ({
                          ...current,
                          [review.id]: !current[review.id],
                        }))
                      }
                      className="text-[13px] font-semibold text-[#9aa6b6]"
                    >
                      {expanded ? t("접기") : t("더보기")}
                    </button>
                  ) : null}
                  <div className="border-b border-[#edf1f6]" />
                </div>
              );
            })}

            {!reviewsLoading && visibleReviews.length === 0 ? (
              <div className="text-[13px] leading-6 text-[#65748b]">
                {reviews.length === 0 ? t("아직 등록된 리뷰가 없습니다. 첫 리뷰를 남겨 주세요.") : t("현재 필터 조건에 맞는 리뷰가 없습니다.")}
              </div>
            ) : null}
          </div>

          {totalReviewPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                data-auth-allow
                onClick={() => setReviewPage((current) => Math.max(1, current - 1))}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-white text-[#8d99ab]"
              >
                ‹
              </button>
              {Array.from({ length: totalReviewPages }, (_, index) => index + 1).slice(0, 5).map((page) => (
                <button
                  key={page}
                  type="button"
                  data-auth-allow
                  onClick={() => setReviewPage(page)}
                  className={cn(
                    "inline-flex h-12 w-12 items-center justify-center rounded-2xl border text-[14px] font-semibold",
                    reviewPage === page ? "border-[#11294b] bg-[#11294b] text-white" : "border-[#d7dfeb] bg-white text-[#11294b]"
                  )}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                data-auth-allow
                onClick={() => setReviewPage((current) => Math.min(totalReviewPages, current + 1))}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-white text-[#8d99ab]"
              >
                ›
              </button>
            </div>
          ) : null}

          <div id="shop-review-form" className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
            <div className="text-[15px] font-semibold text-[#111827]">{t("리뷰 작성")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = reviewDraft.rating === value;
                return (
                  <button
                    key={value}
                    type="button"
                    data-auth-allow
                    onClick={() => setReviewDraft((current) => ({ ...current, rating: value }))}
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-[14px] font-semibold transition",
                      active ? "border-[#11294b] bg-[#11294b] text-white" : "border-[#d7dfeb] bg-white text-[#11294b]"
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <input
              className={`${INPUT_CLASS} mt-3`}
              value={reviewDraft.title}
              onChange={(event) => setReviewDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder={t("한 줄 제목")}
            />
            <textarea
              className={`${INPUT_CLASS} mt-3 min-h-[140px] resize-none`}
              value={reviewDraft.body}
              onChange={(event) => setReviewDraft((current) => ({ ...current, body: event.target.value }))}
              placeholder={t("실제 사용감과 장단점을 남겨 주세요.")}
            />
            <div className="mt-3 flex justify-end">
              <button type="button" data-auth-allow onClick={() => void submitReview()} disabled={reviewSaving} className={`${PRIMARY_BUTTON} h-11 text-[12px]`}>
                {reviewSaving ? t("저장 중...") : t("리뷰 저장")}
              </button>
            </div>
          </div>
        </section>

        <section id="shop-product-purchase" className="space-y-4 bg-white px-4 py-6">
          <div className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("구매 안내")}</div>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
              <div className="text-[13px] font-semibold text-[#111827]">{t("결제 안내")}</div>
              <div className="mt-3 text-[12.5px] leading-6 text-[#44556d]">
                {product.checkoutEnabled && product.priceKrw
                  ? t("토스 결제로 바로 결제할 수 있으며, 승인 완료 후 주문 내역에서 상태를 확인할 수 있습니다.")
                  : t("외부 판매처 가격과 재고는 판매처 기준으로 운영되며, 최종 결제 조건은 판매처에서 확인해야 합니다.")}
              </div>
            </div>
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
              <div className="text-[13px] font-semibold text-[#111827]">{t("배송지")}</div>
              {status !== "authenticated" ? (
                <div className="mt-3 text-[12.5px] leading-6 text-[#65748b]">{t("로그인 후 계정에 저장한 기본 배송지로 바로 주문할 수 있습니다.")}</div>
              ) : shippingLoading ? (
                <div className="mt-3 text-[12.5px] leading-6 text-[#65748b]">{t("배송지 정보를 불러오는 중입니다.")}</div>
              ) : shippingReady && shippingProfile ? (
                <div className="mt-3 text-[12.5px] leading-6 text-[#44556d]">{shippingLabel}</div>
              ) : (
                <div className="mt-3 text-[12.5px] leading-6 text-[#a33a2b]">{t("계정에서 기본 배송지를 먼저 저장해야 합니다.")}</div>
              )}
              <div className="mt-4">
                <Link href="/settings/account/shipping" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
                  {t("배송지 수정")}
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
              <div className="text-[13px] font-semibold text-[#111827]">{detail.noticeTitle}</div>
              <div className="mt-3 text-[12.5px] leading-6 text-[#44556d]">{detail.noticeBody}</div>
            </div>
          </div>
        </section>
      </div>

      <div id="shop-detail-buybar" className="fixed inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom))] z-40 px-4">
        <div className="mx-auto flex w-full max-w-[688px] items-center gap-3">
          <button
            type="button"
            data-auth-allow
            onClick={() => {
              if (typeof window === "undefined") return;
              document.getElementById("shop-product-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="relative inline-flex h-16 flex-1 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-white text-[15px] font-semibold text-[#111827]"
          >
            {reviewSummary.count > 0 ? (
              <span className="absolute -top-3 rounded-full bg-[#69c8ee] px-3 py-1 text-[11px] font-semibold text-white">
                {reviewSummary.count.toLocaleString("ko-KR")}
              </span>
            ) : null}
            {t("리뷰보기")}
          </button>

          {product.checkoutEnabled && product.priceKrw ? (
            <button type="button" data-auth-allow onClick={handleOpenCheckout} className="inline-flex h-16 flex-[1.2] items-center justify-center rounded-2xl bg-[#69c8ee] text-[15px] font-semibold text-white">
              {t("구매하기")}
            </button>
          ) : product.externalUrl ? (
            <a
              href={product.externalUrl}
              target="_blank"
              rel="noreferrer"
              onClick={handlePartnerClick}
              className="inline-flex h-16 flex-[1.2] items-center justify-center rounded-2xl bg-[#69c8ee] text-[15px] font-semibold text-white"
            >
              {t("구매하기")}
            </a>
          ) : (
            <button type="button" disabled className="inline-flex h-16 flex-[1.2] items-center justify-center rounded-2xl bg-[#b9dff0] text-[15px] font-semibold text-white">
              {t("판매 준비중")}
            </button>
          )}
        </div>
      </div>

      <ShopCheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={() => void handleCheckout()}
        loading={checkoutLoading}
        productTitle={product.name}
        productSubtitle={product.subtitle}
        priceKrw={product.priceKrw ?? 0}
        quantity={quantity}
        shippingLabel={shippingLabel}
      />
    </div>
  );
}
