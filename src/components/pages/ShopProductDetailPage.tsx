"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders, ensureTossScript } from "@/lib/billing/client";
import { cn } from "@/lib/cn";
import {
  calculateShopPricing,
  formatShopCurrency,
  formatShopPrice,
  getShopImageSrc,
  isShopProductExternalOnly,
  isShopProductSoldOut,
  type ShopProduct,
} from "@/lib/shop";
import {
  buildShopShippingVerificationValue,
  formatShopShippingSingleLine,
  isCompleteShopShippingProfile,
  resolveDefaultShopShippingAddress,
  type ShopShippingAddress,
  type ShopShippingProfile,
} from "@/lib/shopProfile";
import { addToCart, getCart, getWishlist, loadShopClientState, markShopPartnerClick, markShopViewed, saveShopClientState, toggleWishlist } from "@/lib/shopClient";
import { SHOP_BUTTON_ACTIVE, SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";
import { ShopBrandLogo } from "@/components/shop/ShopBrandLogo";
import { ShopCheckoutSheet } from "@/components/shop/ShopCheckoutSheet";
import { BottomSheet } from "@/components/ui/BottomSheet";

type ShopReviewRecord = {
  id: number;
  productId: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorLabel: string;
  verifiedPurchase?: boolean;
};

type ShopReviewSummary = {
  count: number;
  averageRating: number;
};

type ShopProfileResponse = {
  profile?: ShopShippingProfile | null;
  addresses?: ShopShippingAddress[];
  defaultAddressId?: string | null;
};

const REVIEWS_PER_PAGE = 5;
const PRIMARY_BUTTON = SHOP_BUTTON_ACTIVE;
const SECONDARY_BUTTON = SHOP_BUTTON_PRIMARY;
const INPUT_CLASS = "w-full rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[14px] text-[#11294b] outline-none transition placeholder:text-[#92a0b4] focus:border-[#11294b]";

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

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "#e63946" : "none"} stroke={filled ? "#e63946" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
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

export function ShopProductDetailPage({ product, allProducts }: { product: ShopProduct; allProducts?: ShopProduct[] }) {
  const { t, lang } = useI18n();
  const { status } = useAuthState();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [externalPurchaseOpen, setExternalPurchaseOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [shippingProfile, setShippingProfile] = useState<ShopShippingProfile | null>(null);
  const [shippingAddresses, setShippingAddresses] = useState<ShopShippingAddress[]>([]);
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState<string | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [reviews, setReviews] = useState<ShopReviewRecord[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ShopReviewSummary>({ count: 0, averageRating: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [canWriteReview, setCanWriteReview] = useState(false);
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
  const [wishlisted, setWishlisted] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartLoading, setCartLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ShopProduct[]>(allProducts ?? []);
  const detail = product.detailPage;
  const externalOnlyProduct = isShopProductExternalOnly(product);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated") {
      setWishlisted(false);
      setCartCount(0);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        const headers = await authHeaders();
        const [ids, cartItems] = await Promise.all([getWishlist(headers), getCart(headers)]);
        if (!active) return;
        setWishlisted(ids.includes(product.id));
        setCartCount(cartItems.reduce((sum, item) => sum + item.quantity, 0));
      } catch {
        if (!active) return;
        setWishlisted(false);
        setCartCount(0);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [product.id, status]);

  // 최신 카탈로그 로드 (관련 상품용)
  useEffect(() => {
    if (allProducts && allProducts.length > 0) return;
    const run = async () => {
      try {
        const res = await fetch("/api/shop/catalog", { method: "GET", cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok && Array.isArray(json?.data?.products)) {
          setCatalogProducts(json.data.products as ShopProduct[]);
        }
      } catch {
        // 무시
      }
    };
    void run();
  }, [allProducts]);

  useEffect(() => {
    const current = loadShopClientState();
    saveShopClientState(markShopViewed(current, product.id));
  }, [product.id]);

  useEffect(() => {
    setSelectedImageIndex(0);
    setReviewPage(1);
    setExpandedReviews({});
    setExternalPurchaseOpen(false);
  }, [product.id]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setReviewsLoading(true);
      try {
        const headers = status === "authenticated" ? await authHeaders() : {};
        const res = await fetch(`/api/shop/reviews?productId=${encodeURIComponent(product.id)}`, {
          method: "GET",
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));
        setReviews(Array.isArray(json?.data?.reviews) ? (json.data.reviews as ShopReviewRecord[]) : []);
        setReviewSummary((json?.data?.summary as ShopReviewSummary) ?? { count: 0, averageRating: 0 });
        setCanWriteReview(Boolean(json?.data?.viewerCanWrite));
      } catch {
        if (!active) return;
        setReviews([]);
        setReviewSummary({ count: 0, averageRating: 0 });
        setCanWriteReview(false);
      } finally {
        if (!active) return;
        setReviewsLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [product.id, status]);

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
        const data = (json?.data ?? {}) as ShopProfileResponse;
        const addresses = Array.isArray(data.addresses) ? data.addresses : [];
        const defaultAddressId =
          typeof data.defaultAddressId === "string" && data.defaultAddressId ? data.defaultAddressId : null;
        const selectedAddress =
          (defaultAddressId ? addresses.find((item) => item.id === defaultAddressId) : null) ??
          resolveDefaultShopShippingAddress({ addresses, defaultAddressId });
        setShippingAddresses(addresses);
        setSelectedShippingAddressId(selectedAddress?.id ?? null);
        setShippingProfile(selectedAddress ?? (data.profile ?? null));
      } catch {
        if (!active) return;
        setShippingProfile(null);
        setShippingAddresses([]);
        setSelectedShippingAddressId(null);
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

  const galleryImageUrls = useMemo(
    () => product.imageUrls.map((url) => getShopImageSrc(url)).filter(Boolean),
    [product.imageUrls]
  );
  const detailImageUrls = useMemo(
    () => detail.detailImageUrls.map((url) => getShopImageSrc(url)).filter(Boolean),
    [detail.detailImageUrls]
  );
  const detailSectionImageUrls = detailImageUrls.length > 0 ? detailImageUrls : galleryImageUrls.slice(0, 2);
  const partnerHostLabel = useMemo(() => {
    if (!product.externalUrl) return null;
    try {
      return new URL(product.externalUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }, [product.externalUrl]);
  const selectedImageUrl = galleryImageUrls[selectedImageIndex] ?? null;
  const selectedShippingAddress =
    (selectedShippingAddressId ? shippingAddresses.find((item) => item.id === selectedShippingAddressId) : null) ??
    null;
  const effectiveShippingProfile = selectedShippingAddress ?? shippingProfile;
  const shippingReady = Boolean(effectiveShippingProfile && isCompleteShopShippingProfile(effectiveShippingProfile));
  const shippingLabel = effectiveShippingProfile
    ? `${effectiveShippingProfile.recipientName} · ${effectiveShippingProfile.phone} · ${formatShopShippingSingleLine(effectiveShippingProfile)}`
    : null;
  const shippingVerificationValue = effectiveShippingProfile
    ? buildShopShippingVerificationValue(effectiveShippingProfile)
    : "";
  const hardOutOfStock = isShopProductSoldOut(product);
  const maxSelectableQuantity =
    typeof product.stockCount === "number" && product.stockCount > 0 ? Math.max(1, Math.min(9, product.stockCount)) : 9;
  const pricing = calculateShopPricing({ priceKrw: product.priceKrw, quantity });
  const discountPercent = product.originalPriceKrw && product.priceKrw && product.originalPriceKrw > product.priceKrw
    ? Math.round((1 - product.priceKrw / product.originalPriceKrw) * 100)
    : 0;

  // 관련 상품: 같은 카테고리 상품 (현재 상품 제외)
  const relatedProducts = useMemo(() => {
    return catalogProducts
      .filter((p) => p.id !== product.id && p.category === product.category)
      .slice(0, 6);
  }, [catalogProducts, product.id, product.category]);

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

  useEffect(() => {
    setQuantity((current) => Math.max(1, Math.min(current, maxSelectableQuantity)));
  }, [maxSelectableQuantity]);

  const handleWishlistToggle = async () => {
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage(t("위시리스트는 로그인한 계정에 저장됩니다."));
      return;
    }
    try {
      const headers = await authHeaders();
      const next = await toggleWishlist(product.id, headers);
      setWishlisted(next.active);
    } catch {
      setMessageTone("error");
      setMessage(t("위시리스트 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    }
  };

  const handleAddToCart = async () => {
    if (hardOutOfStock) {
      setMessageTone("error");
      setMessage(t("현재 품절된 상품입니다."));
      return;
    }
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage(t("장바구니는 로그인한 계정에 저장됩니다."));
      return;
    }
    setCartLoading(true);
    try {
      const headers = await authHeaders();
      const items = await addToCart(product.id, quantity, headers);
      setCartCount(items.reduce((sum, item) => sum + item.quantity, 0));
      setMessageTone("notice");
      setMessage(t("장바구니에 담았습니다. 계정 기준으로 저장됩니다."));
    } catch {
      setMessageTone("error");
      setMessage(t("장바구니 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setCartLoading(false);
    }
  };

  const handleCheckout = async (verification: {
    shippingConfirmed: boolean;
    contactConfirmed: boolean;
  }) => {
    if (!product.checkoutEnabled || !product.priceKrw) return;
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage(t("결제는 로그인 후 가능합니다."));
      return;
    }
    if (!shippingReady) {
      setMessageTone("error");
      setMessage(t("주문 전에 계정 설정에서 기본 배송지를 먼저 저장해 주세요."));
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
          shippingAddressId: selectedShippingAddressId,
          shippingVerificationValue,
          verification,
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
        subtotalKrw: number;
        shippingFeeKrw: number;
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
        setMessage(t("결제 대기 주문이 많습니다. 기존 결제를 마친 뒤 다시 시도해 주세요."));
      } else if (text.includes("shop_product_out_of_stock")) {
        setMessage(t("현재 품절되어 주문을 진행할 수 없습니다."));
      } else if (text.includes("shop_product_insufficient_stock")) {
        setMessage(t("남아 있는 재고보다 많은 수량을 선택했습니다. 수량을 줄여 다시 시도해 주세요."));
      } else if (text.includes("shop_checkout_disabled")) {
        setMessage(t("현재 이 상품은 앱 내 결제가 비활성화되어 있습니다."));
      } else if (text.includes("missing_shipping_address")) {
        setMessage(t("기본 배송지가 없어 주문을 진행할 수 없습니다. 계정에서 배송지를 먼저 저장해 주세요."));
      } else if (text.includes("invalid_shipping_address")) {
        setMessage(t("선택한 배송지를 찾지 못했습니다. 배송지를 다시 선택해 주세요."));
      } else if (text.includes("shop_profile_storage_unavailable")) {
        setMessage(t("배송지 저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요."));
      } else if (text.includes("shop_order_storage_unavailable")) {
        setMessage(t("주문 저장소 설정이 아직 완료되지 않았습니다. 관리자에게 주문 저장 환경 구성을 확인해 주세요."));
      } else if (text.includes("shop_checkout_verification_required")) {
        setMessage(t("배송지와 개인정보 확인 항목을 모두 체크한 뒤 결제를 진행해 주세요."));
      } else if (text.includes("shop_checkout_verification_mismatch")) {
        setMessage(t("결제 전 확인한 정보와 현재 저장된 배송지가 달라졌습니다. 배송지를 다시 확인해 주세요."));
      } else if (text.includes("missing_toss_client_key")) {
        setMessage(t("결제 설정이 아직 완료되지 않았습니다. 관리자에게 결제 키 설정을 확인해 주세요."));
      } else if (text.includes("missing_origin") || text.includes("invalid_referer") || text.includes("invalid_referer_origin")) {
        setMessage(t("현재 브라우저 보안 정보가 누락되어 결제를 시작할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."));
      } else if (text.includes("invalid_origin")) {
        setMessage(t("결제 이동 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } else if (text.includes("missing_toss_sdk")) {
        setMessage(t("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } else if (text.includes("failed_to_create_shop_order")) {
        setMessage(t("주문서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } else {
        setMessage(t("결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleOpenCheckout = () => {
    if (hardOutOfStock) {
      setMessageTone("error");
      setMessage(t("현재 품절된 상품입니다."));
      return;
    }
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage(t("결제는 로그인 후 가능합니다."));
      return;
    }
    if (!shippingReady) {
      setMessageTone("error");
      setMessage(t("주문 전에 계정 설정에서 기본 배송지를 먼저 저장해 주세요."));
      return;
    }
    setCheckoutOpen(true);
  };

  const handlePartnerClick = () => {
    const current = loadShopClientState();
    saveShopClientState(markShopPartnerClick(current, product.id));
  };

  const openPartnerPurchaseGuide = () => {
    if (!product.externalUrl) return;
    setExternalPurchaseOpen(true);
  };

  const handlePartnerMove = () => {
    if (!product.externalUrl) return;
    handlePartnerClick();
    setExternalPurchaseOpen(false);
    if (typeof window !== "undefined") {
      window.open(product.externalUrl, "_blank", "noopener,noreferrer");
    }
  };

  const submitReview = async () => {
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage(t("리뷰는 로그인 후 작성할 수 있습니다."));
      return;
    }
    if (!canWriteReview) {
      setMessageTone("error");
      setMessage(t("배송 완료 후 구매 확정까지 마친 주문이 있는 상품만 리뷰를 작성할 수 있습니다."));
      return;
    }
    if (!reviewDraft.body.trim()) {
      setMessageTone("error");
      setMessage(t("리뷰 내용을 입력해 주세요."));
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
      setMessage(t("리뷰가 저장되었습니다."));
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_save_shop_review");
      setMessageTone("error");
      if (code === "shop_review_storage_unavailable") {
        setMessage(t("리뷰 저장소를 아직 사용할 수 없습니다. Supabase shop 확장 마이그레이션을 먼저 적용해 주세요."));
      } else if (code === "invalid_shop_review") {
        setMessage(t("평점과 리뷰 내용을 확인해 주세요."));
      } else if (code === "shop_review_requires_purchase_confirmation") {
        setMessage(t("배송 완료 후 구매 확정이 확인된 사용자만 리뷰를 작성할 수 있습니다."));
      } else {
        setMessage(t("리뷰 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."));
      }
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <div className="-mx-4 pb-[calc(100px+env(safe-area-inset-bottom))]">
      <div className="bg-[#102a43] px-4 py-3 text-center text-[12.5px] font-semibold text-white">
        {t("오늘 회복 흐름에 맞는 추천 상품과 구매 정보를 한눈에 확인하세요")}
      </div>

      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3">
          <ShopBackLink href="/shop" label={t("쇼핑으로 돌아가기")} />
          <Link href="/shop" data-auth-allow className="justify-self-center">
            <ShopBrandLogo className="w-[158px]" />
          </Link>
          <button
            type="button"
            data-auth-allow
            onClick={handleWishlistToggle}
            className="inline-flex h-11 w-11 items-center justify-center text-[#111827]"
            aria-label={wishlisted ? t("찜 해제") : t("찜하기")}
          >
            <HeartIcon filled={wishlisted} />
          </button>
          <Link href="/shop/cart" data-auth-allow className="relative inline-flex h-11 w-11 items-center justify-center text-[#111827]" aria-label={t("장바구니")}>
            {cartCount > 0 ? (
              <span aria-hidden className="absolute right-1.5 top-1.5 inline-flex min-w-[15px] items-center justify-center rounded-full bg-[#17324d] px-1 py-[1px] text-[8px] font-bold leading-none text-white">
                {cartCount > 99 ? "99+" : cartCount.toLocaleString(lang === "en" ? "en-US" : "ko-KR")}
              </span>
            ) : null}
            <CartIcon />
          </Link>
          <Link href="/shop/profile" data-auth-allow className="inline-flex h-11 w-11 items-center justify-center text-[#111827]" aria-label={t("쇼핑 프로필")}>
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
              <img src={selectedImageUrl} alt={t(product.name)} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className={cn("flex aspect-square w-full items-end p-8", productToneClass(product))}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{t(product.partnerLabel)}</div>
                  <div className="mt-3 text-[30px] font-bold tracking-[-0.03em]">{t(product.visualLabel)}</div>
                </div>
              </div>
            )}
            {/* 품절 오버레이 */}
            {hardOutOfStock ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-[#111827]">{t("품절")}</span>
              </div>
            ) : null}
            {/* 이미지 카운터 */}
            <div className="absolute bottom-4 right-4 rounded-full bg-black/10 px-3 py-1 text-[11px] font-semibold text-white">
              {selectedImageIndex + 1} / {Math.max(1, galleryImageUrls.length || 1)}
            </div>
            {/* 찜하기 플로팅 버튼 */}
            <button
              type="button"
              data-auth-allow
              onClick={handleWishlistToggle}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/85 shadow-md backdrop-blur-sm"
              aria-label={wishlisted ? t("찜 해제") : t("찜하기")}
            >
              <HeartIcon filled={wishlisted} />
            </button>
          </div>

          {galleryImageUrls.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {galleryImageUrls.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  data-auth-allow
                  onClick={() => setSelectedImageIndex(index)}
                  className={cn(
                    "shrink-0 overflow-hidden rounded-2xl border bg-white",
                    index === selectedImageIndex ? "border-[#102a43]" : "border-[#e6ebf2]"
                  )}
                >
                  <img src={url} alt={`${t(product.name)} ${index + 1}`} className="h-16 w-16 object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-4 px-4 py-5">
            <div className="text-[16px] font-semibold leading-7 tracking-[-0.02em] text-[#111827]">{t(product.name)}</div>
            <div className="text-[13px] leading-6 text-[#65748b]">{t(product.subtitle)}</div>
            <div className="space-y-1">
              <div className="text-[12px] text-[#9aa6b6]">{t(product.partnerStatus)}</div>
              {/* 할인 가격 표시 */}
              {discountPercent > 0 && product.originalPriceKrw ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[20px] font-bold tracking-[-0.03em] text-[#e63946]">-{discountPercent}%</span>
                  <span className="text-[32px] font-bold tracking-[-0.04em] text-[#111827]">{formatShopPrice(product)}</span>
                </div>
              ) : (
                <div className="text-[32px] font-bold tracking-[-0.04em] text-[#111827]">{formatShopPrice(product)}</div>
              )}
              {discountPercent > 0 && product.originalPriceKrw ? (
                <div className="text-[14px] text-[#9aa6b6] line-through">
                  {formatShopCurrency(product.originalPriceKrw)}
                </div>
              ) : null}
              {/* 재고 표시 */}
              {product.stockCount !== null && product.stockCount > 0 && product.stockCount <= 10 && !hardOutOfStock ? (
                <div className="text-[12px] font-semibold text-[#e63946]">{t("잔여 {count}개", { count: product.stockCount })}</div>
              ) : null}
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
                      onClick={() => setQuantity((current) => Math.min(maxSelectableQuantity, current + 1))}
                      className={`${SECONDARY_BUTTON} h-10 w-10 px-0 text-[16px]`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-[20px] border border-[#d6e0ea] bg-white px-3 py-3 text-[12.5px] text-[#5c7187]">
                  <div className="flex items-center justify-between gap-3">
                    <span>{t("상품 금액")}</span>
                    <span className="font-semibold text-[#425a76]">{formatShopCurrency(pricing.subtotalKrw)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span>{t("배송비")}</span>
                    <span className="font-semibold text-[#425a76]">
                      {pricing.shippingFeeKrw > 0 ? formatShopCurrency(pricing.shippingFeeKrw) : t("무료")}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#e6edf4] pt-2">
                    <span className="font-semibold text-[#2f4d6a]">{t("총 결제 금액")}</span>
                    <span className="font-bold text-[#2f4d6a]">{formatShopCurrency(pricing.totalKrw)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* 장바구니 / 구매하기 버튼 — 수량 선택 바로 아래 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-auth-allow
                onClick={() => void handleAddToCart()}
                disabled={cartLoading}
                className={`relative h-14 flex-1 text-[15px] ${SECONDARY_BUTTON}`}
              >
                {cartCount > 0 ? (
                  <span className="absolute -top-3 rounded-full bg-[#17324d] px-3 py-1 text-[11px] font-semibold text-white">
                    {cartCount.toLocaleString(lang === "en" ? "en-US" : "ko-KR")}
                  </span>
                ) : null}
                {cartLoading ? t("담는 중...") : t("장바구니")}
              </button>

              {hardOutOfStock ? (
                <button type="button" disabled className="inline-flex h-14 flex-[1.2] items-center justify-center rounded-2xl bg-[#b0b8c5] text-[15px] font-semibold text-white">
                  {t("품절")}
                </button>
              ) : product.checkoutEnabled && product.priceKrw ? (
                <button type="button" data-auth-allow onClick={handleOpenCheckout} className={`h-14 flex-[1.2] text-[15px] ${PRIMARY_BUTTON}`}>
                  {t("구매하기")}
                </button>
              ) : product.externalUrl ? (
                <button
                  type="button"
                  data-auth-allow
                  onClick={openPartnerPurchaseGuide}
                  className={`inline-flex h-14 flex-[1.2] items-center justify-center text-[15px] ${PRIMARY_BUTTON}`}
                >
                  {t("구매하기")}
                </button>
              ) : (
                <button type="button" disabled className="inline-flex h-14 flex-[1.2] items-center justify-center rounded-2xl bg-[#8da8d8] text-[15px] font-semibold text-white">
                  {t("판매 준비중")}
                </button>
              )}
            </div>

            {externalOnlyProduct ? (
              <div className="rounded-3xl border border-[#ddd7ff] bg-[#f3f0ff] px-4 py-4 text-[12.5px] leading-6 text-[#44556d]">
                <div className="font-semibold text-[#47326f]">{t("구매 안내")}</div>
                <div className="mt-2">
                  {t("구매하기를 누르면 안내를 한 번 더 확인한 뒤 연결된 구매 페이지에서 결제가 이어집니다.")}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] px-4 py-4 text-[13px] leading-7 text-[#111827]">
              <div className="font-semibold text-[#11294b]">{t(detail.headline)}</div>
              <div className="mt-2 text-[#44556d]">{t(detail.summary)}</div>
              {product.useMoments.length > 0 ? (
                <div className="mt-3 space-y-1 text-[#44556d]">
                  {product.useMoments.slice(0, 3).map((item) => (
                    <div key={item}>• {t(item)}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section id="shop-product-info" className="space-y-6 bg-white px-4 py-6">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.04em] text-[#111827]">{t(detail.storyTitle)}</div>
          <div className="text-[15px] leading-8 text-[#44556d]">{t(detail.storyBody)}</div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-[#ddd7ff] bg-[#f3f0ff] px-5 py-6 text-[#31244d]">
              <div className="text-[22px] font-bold tracking-[-0.03em]">{t(detail.featureTitle)}</div>
              <div className="mt-4 space-y-2 text-[13px] leading-6 text-[#5d4d88]">
                {detail.featureItems.map((item) => (
                  <div key={item}>{t(item)}</div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] px-5 py-6">
              <div className="text-[22px] font-bold tracking-[-0.03em] text-[#111827]">{t(detail.routineTitle)}</div>
              <div className="mt-4 space-y-2 text-[13px] leading-6 text-[#44556d]">
                {detail.routineItems.map((item) => (
                  <div key={item}>{t(item)}</div>
                ))}
              </div>
            </div>
          </div>

          {product.specs.length > 0 ? (
            <div className="space-y-3 border-t border-[#edf1f6] pt-5">
              {product.specs.map((spec) => (
                <div key={`${spec.label}-${spec.value}`} className="grid grid-cols-[110px_1fr] gap-4 text-[13px]">
                  <div className="text-[#9aa6b6]">{t(spec.label)}</div>
                  <div className="font-medium text-[#111827]">{t(spec.value)}</div>
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

          {detailSectionImageUrls.length > 0 ? (
            <div className="space-y-4 border-t border-[#edf1f6] pt-5">
              {detailSectionImageUrls.map((url, index) => (
                <div key={`${url}-${index}`} className="bg-transparent">
                  <img
                    src={url}
                    alt={`${t(product.name)} detail ${index + 1}`}
                    className="h-auto w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          ) : null}
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
              <div className="mt-1 text-[14px] font-semibold text-[#102a43]">
                {reviewSummary.count.toLocaleString(lang === "en" ? "en-US" : "ko-KR")} {t("개 리뷰")}
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {reviewDistribution.map((item) => (
                <div key={item.rating} className="grid grid-cols-[72px_1fr_44px] items-center gap-3 text-[12px]">
                    <div className="text-[#102a43]">{lang === "en" ? `${item.rating} stars` : `${item.rating}점`}</div>
                  <div className="h-3 rounded-full bg-[#edf1f6]">
                    <div className={cn("h-3 rounded-full bg-[#102a43]", reviewBarWidthClass(item.percent))} />
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
            className={`h-14 w-full text-[15px] ${SECONDARY_BUTTON}`}
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
                  <div className="text-[20px] tracking-[0.15em] text-[#3b6fc9]">{renderStars(review.rating)}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#4f5d72]">
                    <span>{review.authorLabel} · {formatDateLabel(review.updatedAt || review.createdAt)}</span>
                    <span className="rounded-xl bg-[#f1f3f6] px-3 py-2 text-[12px] font-semibold text-[#66758a]">{t("리뷰")}</span>
                    {review.verifiedPurchase ? (
                      <span className="rounded-xl bg-[#eef4fb] px-3 py-2 text-[12px] font-semibold text-[#3b6fc9]">{t("구매 확인")}</span>
                    ) : null}
                  </div>
                <div className="border-l-4 border-[#dfe4ea] pl-4 text-[13px] text-[#9aa6b6]">
                    {product.useMoments[0] ? `${t("사용 시점")} · ${t(product.useMoments[0])}` : t("구매 정보가 저장되면 여기에 표시됩니다.")}
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
                    "inline-flex h-12 w-12 items-center justify-center rounded-full border-2 text-[14px] font-semibold",
                    reviewPage === page ? "border-[#17324d] bg-[#d1deea] text-[#2f4d6a]" : "border-[#bfd0e1] bg-white text-[#60768d]"
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
            {status !== "authenticated" ? (
              <div className="mt-3 rounded-2xl border border-[#d7dfeb] bg-white px-4 py-4 text-[12.5px] leading-6 text-[#65748b]">
                {t("리뷰는 로그인 후 작성할 수 있습니다.")}
              </div>
            ) : !canWriteReview ? (
              <div className="mt-3 rounded-2xl border border-[#d7dfeb] bg-white px-4 py-4 text-[12.5px] leading-6 text-[#44556d]">
                <div className="font-semibold text-[#11294b]">{t("리뷰 작성 조건")}</div>
                <div className="mt-1">{t("배송 완료 후 구매 확정까지 완료한 사용자만 이 상품 리뷰를 작성하거나 수정할 수 있습니다.")}</div>
              </div>
            ) : (
              <>
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
                          "inline-flex h-10 w-10 items-center justify-center rounded-full border-2 text-[14px] font-semibold transition",
                          active ? "border-[#17324d] bg-[#d1deea] text-[#2f4d6a]" : "border-[#bfd0e1] bg-white text-[#60768d]"
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
              </>
            )}
          </div>
        </section>

        <section id="shop-product-purchase" className="space-y-4 bg-white px-4 py-6">
          <div className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("구매 안내")}</div>
          <div className="grid gap-4">
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
              <div className="text-[13px] font-semibold text-[#111827]">{t("결제 안내")}</div>
              <div className="mt-3 text-[12.5px] leading-6 text-[#44556d]">
                {product.checkoutEnabled && product.priceKrw
                  ? t("토스 결제로 바로 결제할 수 있으며, 배송비 3,000원은 50,000원 이상 구매 시 자동으로 무료 처리됩니다.")
                  : t("연결된 구매 페이지 기준으로 가격과 재고가 운영되며, 구매하기를 누르면 안내 확인 후 계속 진행할 수 있습니다.")}
              </div>
            </div>
            <div className="rounded-3xl border border-[#e6ebf2] bg-[#f8fafc] p-4">
              <div className="text-[13px] font-semibold text-[#111827]">{t(detail.noticeTitle)}</div>
              <div className="mt-3 text-[12.5px] leading-6 text-[#44556d]">{t(detail.noticeBody)}</div>
            </div>
          </div>
        </section>

        {/* 관련 상품 섹션 */}
        {relatedProducts.length > 0 ? (
          <section className="bg-white px-4 py-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("관련 상품")}</div>
              <Link href="/shop" data-auth-allow className="text-[13px] font-semibold text-[#3b6fc9]">{t("전체 보기")}</Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {relatedProducts.map((p) => (
                <Link key={p.id} href={`/shop/${encodeURIComponent(p.id)}`} data-auth-allow className="shrink-0 w-[140px] block">
                  <div className="relative overflow-hidden rounded-[2px] bg-[#f3f5f7]">
                    {p.imageUrls[0] ? (
                      <img src={getShopImageSrc(p.imageUrls[0])} alt={t(p.name)} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className={cn("flex aspect-square items-center justify-center p-3", productToneClass(p))}>
                        <div className="text-center">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.2em] opacity-75">{t(p.partnerLabel)}</div>
                          <div className="mt-1 text-[16px] font-bold tracking-[-0.02em]">{t(p.visualLabel)}</div>
                        </div>
                      </div>
                    )}
                    {isShopProductSoldOut(p) ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#111827]">{t("품절")}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 text-[13px] font-semibold leading-5 tracking-[-0.02em] text-[#111827] line-clamp-2">{t(p.name)}</div>
                  <div className="mt-1 text-[12px] font-bold text-[#111827]">{formatShopPrice(p)}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <ShopCheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={(verification) => void handleCheckout(verification)}
        loading={checkoutLoading}
        productTitle={t(product.name)}
        productSubtitle={t(product.subtitle)}
        priceKrw={product.priceKrw ?? 0}
        quantity={quantity}
        addresses={shippingAddresses}
        selectedAddressId={selectedShippingAddressId}
        onSelectAddress={setSelectedShippingAddressId}
        shippingLabel={shippingLabel}
      />

      <BottomSheet
        open={externalPurchaseOpen && externalOnlyProduct && Boolean(product.externalUrl)}
        onClose={() => setExternalPurchaseOpen(false)}
        variant="appstore"
        title={t("구매 안내")}
        subtitle={t("한 번 더 확인한 뒤 계속 진행할 수 있습니다.")}
        maxHeightClassName="max-h-[76dvh]"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-auth-allow
              onClick={() => setExternalPurchaseOpen(false)}
              className={`${SECONDARY_BUTTON} h-11 text-[14px]`}
            >
              {t("취소")}
            </button>
            <button
              type="button"
              data-auth-allow
              onClick={handlePartnerMove}
              className={`${PRIMARY_BUTTON} h-11 text-[14px]`}
            >
              {t("계속하기")}
            </button>
          </div>
        }
      >
        <div className="rounded-[22px] border border-ios-sep bg-white p-4">
          <div className="rounded-[20px] border border-[#ddd7ff] bg-[#f3f0ff] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a6aa8]">
              {t("구매 계속")}
            </div>
            <div className="mt-2 text-[18px] font-bold tracking-[-0.02em] text-[#1f1a2e]">{t(product.name)}</div>
            <div className="mt-1 text-[12.5px] text-[#5d4d88]">{t(product.priceLabel || "옵션을 확인하고 구매를 이어가세요.")}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-[#6c5f92]">
              <span className="rounded-full border border-[#d8d2f0] bg-white/75 px-2.5 py-1">
                {t("연결 페이지")} · {partnerHostLabel ?? t("확인 필요")}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] border border-[#d6e0ea] bg-[#f7fafc] px-4 py-4">
            <div className="text-[12px] font-semibold text-[#11294b]">{t("계속하기 전에 아래 내용을 확인해 주세요.")}</div>
            <div className="mt-3 space-y-2 text-[12.5px] leading-6 text-[#44556d]">
              <div>• {t("선택한 옵션과 결제 조건은 연결된 구매 페이지 기준으로 적용됩니다.")}</div>
              <div>• {t("결제, 배송, 교환·환불 정책은 연결된 구매 페이지 안내를 따릅니다.")}</div>
              <div>• {t("새 탭에서 안전하게 이어지며, 원하면 언제든 다시 돌아올 수 있습니다.")}</div>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
