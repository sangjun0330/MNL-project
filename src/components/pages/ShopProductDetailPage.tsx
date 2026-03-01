"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders, ensureTossScript } from "@/lib/billing/client";
import { cn } from "@/lib/cn";
import { formatShopPrice, getShopCategoryMeta, getShopSignalMeta, type ShopProduct } from "@/lib/shop";
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

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";
const INPUT_CLASS = "w-full rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[14px] text-[#11294b] outline-none transition placeholder:text-[#92a0b4] focus:border-[#11294b]";

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

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => (index < Math.round(rating) ? "★" : "☆")).join("");
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

  const matchedSignals = useMemo(
    () => product.matchSignals.map((key) => getShopSignalMeta(key)).filter(Boolean),
    [product.matchSignals]
  );

  const selectedImageUrl = product.imageUrls[selectedImageIndex] ?? null;
  const shippingReady = Boolean(shippingProfile && isCompleteShopShippingProfile(shippingProfile));
  const shippingLabel = shippingProfile ? `${shippingProfile.recipientName} · ${shippingProfile.phone} · ${formatShopShippingSingleLine(shippingProfile)}` : null;

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
    <div className="mx-auto w-full max-w-[880px] space-y-4 px-4 pb-24 pt-6">
      <Link href="/shop" data-auth-allow className="inline-flex items-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 py-2 text-[12px] font-semibold text-[#11294b]">
        {t("쇼핑으로 돌아가기")}
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-ios-sep bg-white p-4">
          <div className="overflow-hidden rounded-[24px] border border-[#eef2f7] bg-[#f8fafc]">
            {selectedImageUrl ? (
              <img src={selectedImageUrl} alt={product.name} className="aspect-[1.12/1] w-full object-cover" />
            ) : (
              <div className={cn("flex aspect-[1.12/1] w-full items-end p-5", productToneClass(product))}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{product.partnerLabel}</div>
                  <div className="mt-3 text-[30px] font-bold tracking-[-0.02em]">{product.visualLabel}</div>
                  <div className="mt-2 max-w-[360px] text-[13px] leading-6 opacity-80">{product.subtitle}</div>
                </div>
              </div>
            )}
          </div>

          {product.imageUrls.length > 1 ? (
            <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-5">
              {product.imageUrls.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  data-auth-allow
                  onClick={() => setSelectedImageIndex(index)}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white",
                    index === selectedImageIndex ? "border-[#11294b]" : "border-[#eef2f7]"
                  )}
                >
                  <img src={url} alt={`${product.name} ${index + 1}`} className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-ios-sep bg-white p-5">
            <div className="inline-flex rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
              {t(getShopCategoryMeta(product.category).label)} · {t(productAvailabilityLabel(product))}
            </div>
            <div className="mt-4 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{product.name}</div>
            <div className="mt-2 text-[14px] leading-6 text-ios-sub">{product.subtitle}</div>
            <div className="mt-4 text-[24px] font-bold tracking-[-0.02em] text-[#11294b]">{formatShopPrice(product)}</div>
            <div className="mt-1 text-[12px] text-ios-sub">{product.partnerStatus}</div>

            {product.checkoutEnabled && product.priceKrw ? (
              <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4">
                <div className="text-[12px] font-semibold text-[#11294b]">{t("수량 선택")}</div>
                <div className="mt-3 flex items-center gap-2">
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
                  <div className="ml-auto text-right">
                    <div className="text-[11px] text-ios-sub">{t("총 결제 금액")}</div>
                    <div className="text-[18px] font-bold tracking-[-0.02em] text-[#11294b]">
                      {Math.round((product.priceKrw ?? 0) * quantity).toLocaleString("ko-KR")}원
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {product.checkoutEnabled && product.priceKrw ? (
                <button type="button" data-auth-allow onClick={handleOpenCheckout} className={`${PRIMARY_BUTTON} h-11 text-[13px]`}>
                  {t("바로 결제")}
                </button>
              ) : null}
              {!product.checkoutEnabled && product.externalUrl ? (
                <a
                  href={product.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={handlePartnerClick}
                  className={`${PRIMARY_BUTTON} h-11 text-[13px]`}
                >
                  {t("판매처로 이동")}
                </a>
              ) : null}
              {!product.checkoutEnabled && !product.externalUrl ? (
                <button type="button" disabled className={`${SECONDARY_BUTTON} h-11 text-[13px]`}>
                  {t("판매 준비중")}
                </button>
              ) : null}
            </div>
          </div>

          {message ? (
            <div
              className={[
                "rounded-2xl px-4 py-3 text-[12.5px] leading-5",
                messageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
              ].join(" ")}
            >
              {message}
            </div>
          ) : null}

          <div className="rounded-[28px] border border-ios-sep bg-white p-5">
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("기본 배송지")}</div>
            {status !== "authenticated" ? (
              <div className="mt-2 text-[12.5px] leading-5 text-ios-sub">{t("로그인 후 계정에서 저장한 배송지로 바로 주문할 수 있습니다.")}</div>
            ) : shippingLoading ? (
              <div className="mt-2 text-[12.5px] leading-5 text-ios-sub">{t("배송지 정보를 불러오는 중입니다.")}</div>
            ) : shippingReady && shippingProfile ? (
              <>
                <div className="mt-2 text-[13px] font-semibold text-ios-text">{shippingProfile.recipientName} · {shippingProfile.phone}</div>
                <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{formatShopShippingSingleLine(shippingProfile)}</div>
                {shippingProfile.deliveryNote ? <div className="mt-1 text-[12px] text-ios-sub">{shippingProfile.deliveryNote}</div> : null}
              </>
            ) : (
              <div className="mt-2 text-[12.5px] leading-5 text-[#a33a2b]">{t("아직 기본 배송지가 없습니다. 계정에서 먼저 저장해야 결제를 진행할 수 있습니다.")}</div>
            )}
            <div className="mt-3">
              <Link href="/settings/account" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
                {t("계정에서 배송지 수정")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className={["rounded-[28px] px-5 py-5", productToneClass(product)].join(" ")}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{product.partnerLabel}</div>
        <div className="mt-3 text-[28px] font-bold tracking-[-0.02em]">{detail.headline}</div>
        <div className="mt-2 text-[13px] leading-6 opacity-85">{detail.summary}</div>
      </div>

      {product.specs.length > 0 ? (
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("제품 정보")}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {product.specs.map((spec) => (
              <div key={`${spec.label}-${spec.value}`} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3">
                <div className="text-[11px] font-semibold text-[#6b7c92]">{spec.label}</div>
                <div className="mt-1 text-[13px] font-semibold text-ios-text">{spec.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("이 상품이 지금 맞는 이유")}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {matchedSignals.map((signal) => (
            <span key={signal.key} className="inline-flex rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
              {signal.label}
            </span>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {matchedSignals.map((signal) => (
            <div key={`${signal.key}-reason`} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3 text-[12.5px] leading-5 text-[#44556d]">
              {signal.reason}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{detail.storyTitle}</div>
        <div className="mt-3 text-[13px] leading-6 text-[#44556d]">{detail.storyBody}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{detail.featureTitle}</div>
          <div className="mt-3 space-y-2">
            {detail.featureItems.map((item) => (
              <div key={item} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3 text-[12.5px] text-[#44556d]">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{detail.routineTitle}</div>
          <div className="mt-3 space-y-2">
            {detail.routineItems.map((item) => (
              <div key={item} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-3 text-[12.5px] text-[#44556d]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{detail.noticeTitle}</div>
        <div className="mt-2 text-[12.5px] leading-6 text-ios-sub">{detail.noticeBody}</div>
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("리뷰")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">
              {reviewsLoading
                ? t("리뷰를 불러오는 중입니다.")
                : reviewSummary.count > 0
                  ? `${renderStars(reviewSummary.averageRating)} ${reviewSummary.averageRating.toFixed(1)} · ${reviewSummary.count}개`
                  : t("아직 등록된 리뷰가 없습니다.")}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-ios-text">{review.title || "후기"}</div>
                  <div className="mt-1 text-[11px] text-[#11294b]">{renderStars(review.rating)} · {formatDateLabel(review.updatedAt || review.createdAt)}</div>
                </div>
              </div>
              <div className="mt-2 text-[12.5px] leading-6 text-[#44556d]">{review.body}</div>
            </div>
          ))}

          {!reviewsLoading && reviews.length === 0 ? (
            <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] text-ios-sub">
              {t("첫 리뷰를 남겨 제품 경험을 공유해 주세요.")}
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4">
          <div className="text-[13px] font-semibold text-ios-text">{t("리뷰 작성")}</div>
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
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              className={INPUT_CLASS}
              value={reviewDraft.title}
              onChange={(event) => setReviewDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder={t("한 줄 제목")}
            />
            <div className="flex items-center rounded-2xl border border-[#d7dfeb] bg-white px-4 text-[12px] text-ios-sub">
              {t("제품당 리뷰 1개를 저장하고, 다시 작성하면 수정됩니다.")}
            </div>
          </div>
          <textarea
            className={`${INPUT_CLASS} mt-3 min-h-[120px] resize-none`}
            value={reviewDraft.body}
            onChange={(event) => setReviewDraft((current) => ({ ...current, body: event.target.value }))}
            placeholder={t("실제 사용감과 장단점을 남겨 주세요.")}
          />
          <div className="mt-3 flex justify-end">
            <button type="button" data-auth-allow onClick={() => void submitReview()} disabled={reviewSaving} className={`${PRIMARY_BUTTON} h-10 text-[12px]`}>
              {reviewSaving ? t("저장 중...") : t("리뷰 저장")}
            </button>
          </div>
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
