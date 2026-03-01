"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders, ensureTossScript } from "@/lib/billing/client";
import { formatShopPrice, getShopCategoryMeta, getShopSignalMeta, type ShopProduct } from "@/lib/shop";
import { loadShopClientState, markShopPartnerClick, markShopViewed, saveShopClientState } from "@/lib/shopClient";
import { useI18n } from "@/lib/useI18n";
import { ShopCheckoutSheet } from "@/components/shop/ShopCheckoutSheet";

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";

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

export function ShopProductDetailPage({ product }: { product: ShopProduct }) {
  const { t } = useI18n();
  const { status } = useAuthState();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const detail = product.detailPage;

  useEffect(() => {
    const current = loadShopClientState();
    saveShopClientState(markShopViewed(current, product.id));
  }, [product.id]);

  const matchedSignals = useMemo(
    () => product.matchSignals.map((key) => getShopSignalMeta(key)).filter(Boolean),
    [product.matchSignals]
  );

  const handleCheckout = async () => {
    if (!product.checkoutEnabled || !product.priceKrw) return;
    if (status !== "authenticated") {
      setMessageTone("error");
      setMessage("결제는 로그인 후 가능합니다.");
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
          quantity: 1,
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

  const handlePartnerClick = () => {
    const current = loadShopClientState();
    saveShopClientState(markShopPartnerClick(current, product.id));
  };

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <Link href="/shop" data-auth-allow className="inline-flex items-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 py-2 text-[12px] font-semibold text-[#11294b]">
        {t("쇼핑으로 돌아가기")}
      </Link>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="inline-flex rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
          {t(getShopCategoryMeta(product.category).label)} · {t(productAvailabilityLabel(product))}
        </div>
        <div className="mt-4 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{product.name}</div>
        <div className="mt-2 text-[14px] leading-6 text-ios-sub">{product.subtitle}</div>
        <div className="mt-4 text-[24px] font-bold tracking-[-0.02em] text-[#11294b]">{formatShopPrice(product)}</div>
        <div className="mt-1 text-[12px] text-ios-sub">{product.partnerStatus}</div>
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

      <div className={["rounded-[28px] px-5 py-5", productToneClass(product)].join(" ")}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">{product.partnerLabel}</div>
        <div className="mt-3 text-[28px] font-bold tracking-[-0.02em]">{detail.headline}</div>
        <div className="mt-2 text-[13px] leading-6 opacity-85">{detail.summary}</div>
      </div>

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
        <div className="mt-4 flex flex-wrap gap-2">
          {product.checkoutEnabled && product.priceKrw ? (
            <button type="button" data-auth-allow onClick={() => setCheckoutOpen(true)} className={`${PRIMARY_BUTTON} h-11 text-[13px]`}>
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

      <ShopCheckoutSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={() => void handleCheckout()}
        loading={checkoutLoading}
        productTitle={product.name}
        productSubtitle={product.subtitle}
        priceKrw={product.priceKrw ?? 0}
        quantity={1}
      />
    </div>
  );
}
