"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders, ensureTossScript } from "@/lib/billing/client";
import { calculateShopPricing, calculateShopShippingFee, formatShopPrice, getShopImageSrc, type ShopProduct } from "@/lib/shop";
import {
  buildShopShippingVerificationValue,
  formatShopShippingSingleLine,
  isCompleteShopShippingProfile,
  resolveDefaultShopShippingAddress,
  type ShopShippingAddress,
  type ShopShippingProfile,
} from "@/lib/shopProfile";
import { clearCart, getCart, removeFromCart, updateCartQuantity, type ShopCartItem } from "@/lib/shopClient";
import { SHOP_BUTTON_ACTIVE, SHOP_BUTTON_PRIMARY, SHOP_BUTTON_SECONDARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";
import { ShopCheckoutSheet } from "@/components/shop/ShopCheckoutSheet";

type ShopProfileResponse = {
  profile?: ShopShippingProfile | null;
  addresses?: ShopShippingAddress[];
  defaultAddressId?: string | null;
};

type CartLine = {
  item: ShopCartItem;
  product: ShopProduct;
};

type CheckoutTarget =
  | { mode: "single"; productId: string }
  | { mode: "bundle" }
  | null;

export function ShopCartPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [cartItems, setCartItems] = useState<ShopCartItem[]>([]);
  const [catalog, setCatalog] = useState<ShopProduct[]>([]);
  const [shippingProfile, setShippingProfile] = useState<ShopShippingProfile | null>(null);
  const [shippingAddresses, setShippingAddresses] = useState<ShopShippingAddress[]>([]);
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const knownProductIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setCartItems([]);
      setCatalog([]);
      setShippingProfile(null);
      setShippingAddresses([]);
      setSelectedShippingAddressId(null);
      setSelectedProductIds([]);
      setSelectionTouched(false);
      setCheckoutTarget(null);
      knownProductIdsRef.current = [];
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const headers = await authHeaders();
        const [items, catalogRes, profileRes] = await Promise.all([
          getCart(headers),
          fetch("/api/shop/catalog", { method: "GET", cache: "no-store" }),
          fetch("/api/shop/profile", {
            method: "GET",
            headers: { "content-type": "application/json", ...headers },
            cache: "no-store",
          }),
        ]);
        const catalogJson = await catalogRes.json().catch(() => null);
        const profileJson = await profileRes.json().catch(() => null);
        if (!active) return;
        if (!catalogRes.ok || !catalogJson?.ok || !Array.isArray(catalogJson?.data?.products)) {
          throw new Error(String(catalogJson?.error ?? `catalog_http_${catalogRes.status}`));
        }
        if (!profileRes.ok || !profileJson?.ok) {
          throw new Error(String(profileJson?.error ?? `profile_http_${profileRes.status}`));
        }

        const products = catalogJson.data.products as ShopProduct[];
        const profileData = (profileJson?.data ?? {}) as ShopProfileResponse;
        const addresses = Array.isArray(profileData.addresses) ? profileData.addresses : [];
        const defaultAddressId =
          typeof profileData.defaultAddressId === "string" && profileData.defaultAddressId ? profileData.defaultAddressId : null;
        const selectedAddress =
          (defaultAddressId ? addresses.find((item) => item.id === defaultAddressId) : null) ??
          resolveDefaultShopShippingAddress({ addresses, defaultAddressId });

        setCatalog(products);
        setCartItems(items);
        setShippingAddresses(addresses);
        setSelectedShippingAddressId(selectedAddress?.id ?? null);
        setShippingProfile(selectedAddress ?? (profileData.profile ?? null));
      } catch {
        if (!active) return;
        setCartItems([]);
        setCatalog([]);
        setShippingProfile(null);
        setShippingAddresses([]);
        setSelectedShippingAddressId(null);
        setMessageTone("error");
        setMessage("장바구니 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  const lines = useMemo<CartLine[]>(
    () =>
      cartItems
        .map((item) => {
          const product = catalog.find((entry) => entry.id === item.productId);
          if (!product) return null;
          return { item, product };
        })
        .filter((item): item is CartLine => Boolean(item)),
    [cartItems, catalog]
  );

  useEffect(() => {
    const availableIds = lines.map((line) => line.product.id);
    setSelectedProductIds((current) => {
      if (availableIds.length === 0) {
        knownProductIdsRef.current = [];
        return [];
      }
      if (!selectionTouched) {
        knownProductIdsRef.current = availableIds;
        return availableIds;
      }
      const previousIds = knownProductIdsRef.current;
      const kept = current.filter((id) => availableIds.includes(id));
      const additions = availableIds.filter((id) => !previousIds.includes(id));
      knownProductIdsRef.current = availableIds;
      return [...kept, ...additions];
    });
  }, [lines, selectionTouched]);

  const selectedLines = useMemo(
    () => lines.filter((line) => selectedProductIds.includes(line.product.id)),
    [lines, selectedProductIds]
  );
  const checkoutLine = useMemo(
    () =>
      checkoutTarget?.mode === "single"
        ? lines.find((line) => line.product.id === checkoutTarget.productId) ?? null
        : null,
    [checkoutTarget, lines]
  );
  const selectedShippingAddress =
    (selectedShippingAddressId ? shippingAddresses.find((item) => item.id === selectedShippingAddressId) : null) ?? null;
  const effectiveShippingProfile = selectedShippingAddress ?? shippingProfile;
  const shippingReady = Boolean(effectiveShippingProfile && isCompleteShopShippingProfile(effectiveShippingProfile));
  const shippingLabel = effectiveShippingProfile
    ? `${effectiveShippingProfile.recipientName} · ${effectiveShippingProfile.phone} · ${formatShopShippingSingleLine(effectiveShippingProfile)}`
    : null;
  const shippingVerificationValue = effectiveShippingProfile ? buildShopShippingVerificationValue(effectiveShippingProfile) : "";

  const cartPricing = useMemo(() => {
    const subtotalKrw = selectedLines.reduce((sum, line) => {
      const unitPriceKrw = Math.max(0, Math.round(Number(line.product.priceKrw) || 0));
      return sum + unitPriceKrw * line.item.quantity;
    }, 0);
    const shippingFeeKrw = calculateShopShippingFee(subtotalKrw);
    return {
      subtotalKrw,
      shippingFeeKrw,
      totalKrw: subtotalKrw + shippingFeeKrw,
    };
  }, [selectedLines]);
  const selectedQuantity = useMemo(
    () => selectedLines.reduce((sum, line) => sum + line.item.quantity, 0),
    [selectedLines]
  );

  const syncCart = async (action: Promise<ShopCartItem[]>, successMessage?: string) => {
    try {
      const items = await action;
      setCartItems(items);
      if (successMessage) {
        setMessageTone("notice");
        setMessage(successMessage);
      }
    } catch {
      setMessageTone("error");
      setMessage("장바구니 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const changeQuantity = async (productId: string, nextQuantity: number) => {
    if (status !== "authenticated") return;
    setSavingProductId(productId);
    setMessage(null);
    try {
      const headers = await authHeaders();
      await syncCart(updateCartQuantity(productId, nextQuantity, headers));
    } finally {
      setSavingProductId(null);
    }
  };

  const removeItem = async (productId: string) => {
    if (status !== "authenticated") return;
    setSavingProductId(productId);
    setMessage(null);
    try {
      const headers = await authHeaders();
      await syncCart(removeFromCart(productId, headers), "선택한 상품을 장바구니에서 제거했습니다.");
      if (checkoutTarget?.mode === "single" && checkoutTarget.productId === productId) {
        setCheckoutTarget(null);
      }
    } finally {
      setSavingProductId(null);
    }
  };

  const clearAll = async () => {
    if (status !== "authenticated") return;
    setMessage(null);
    try {
      const headers = await authHeaders();
      await syncCart(clearCart(headers), "장바구니를 비웠습니다.");
      setCheckoutTarget(null);
      setSelectedProductIds([]);
      setSelectionTouched(false);
      knownProductIdsRef.current = [];
    } catch {
      setMessageTone("error");
      setMessage("장바구니를 비우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  useEffect(() => {
    if (!checkoutTarget) return;
    if (checkoutTarget.mode === "single" && !checkoutLine) {
      setCheckoutTarget(null);
      return;
    }
    if (checkoutTarget.mode === "bundle" && selectedLines.length === 0) {
      setCheckoutTarget(null);
    }
  }, [checkoutLine, checkoutTarget, selectedLines.length]);

  const toggleSelectedProduct = (productId: string) => {
    setSelectionTouched(true);
    setSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
  };

  const selectAll = () => {
    setSelectionTouched(true);
    if (selectedLines.length === lines.length) {
      setSelectedProductIds([]);
      return;
    }
    setSelectedProductIds(lines.map((line) => line.product.id));
  };

  const openCheckoutFor = (productId: string) => {
    const line = lines.find((entry) => entry.product.id === productId);
    if (!line) return;
    if (!line.product.checkoutEnabled || !line.product.priceKrw) {
      setMessageTone("error");
      setMessage("이 상품은 앱 내 결제를 지원하지 않습니다.");
      return;
    }
    if (line.product.outOfStock) {
      setMessageTone("error");
      setMessage("품절된 상품은 주문할 수 없습니다.");
      return;
    }
    if (!shippingReady) {
      setMessageTone("error");
      setMessage("결제 전에 기본 배송지를 먼저 저장해 주세요.");
      return;
    }
    setCheckoutTarget({ mode: "single", productId });
  };

  const openBundleCheckout = () => {
    if (selectedLines.length === 0) {
      setMessageTone("error");
      setMessage("먼저 결제할 상품을 선택해 주세요.");
      return;
    }
    if (!shippingReady) {
      setMessageTone("error");
      setMessage("결제 전에 기본 배송지를 먼저 저장해 주세요.");
      return;
    }
    const invalidLine = selectedLines.find(
      (line) => !line.product.checkoutEnabled || !line.product.priceKrw || line.product.outOfStock
    );
    if (invalidLine) {
      setMessageTone("error");
      setMessage("선택한 상품 중 앱 내 결제가 불가능한 상품이 있어 묶음 결제를 진행할 수 없습니다.");
      return;
    }
    setCheckoutTarget({ mode: "bundle" });
  };

  const handleCheckout = async (verification: {
    shippingConfirmed: boolean;
    contactConfirmed: boolean;
  }) => {
    if (!checkoutTarget) return;
    if (checkoutTarget.mode === "single" && !checkoutLine) return;
    if (checkoutTarget.mode === "bundle" && selectedLines.length === 0) return;
    setCheckoutLoading(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      const checkoutUrl = checkoutTarget.mode === "bundle" ? "/api/shop/cart/checkout" : "/api/shop/orders/checkout";
      const checkoutBody =
        checkoutTarget.mode === "bundle"
          ? {
              productIds: selectedLines.map((line) => line.product.id),
              shippingAddressId: selectedShippingAddressId,
              shippingVerificationValue,
              verification,
            }
          : {
              productId: checkoutLine?.product.id,
              quantity: checkoutLine?.item.quantity,
              shippingAddressId: selectedShippingAddressId,
              shippingVerificationValue,
              verification,
            };

      const checkoutRes = await fetch(checkoutUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(checkoutBody),
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
      if (text.includes("empty_shop_cart_selection")) {
        setMessage("선택한 상품이 없어 묶음 결제를 진행할 수 없습니다.");
      } else if (text.includes("invalid_cart_selection")) {
        setMessage("장바구니 구성이 변경되었습니다. 다시 선택한 뒤 결제를 시도해 주세요.");
      } else if (text.includes("too_many_pending_shop_orders")) {
        setMessage("결제 대기 주문이 많습니다. 기존 결제를 마친 뒤 다시 시도해 주세요.");
      } else if (text.includes("shop_product_out_of_stock")) {
        setMessage("선택한 상품 중 품절된 상품이 있어 결제를 진행할 수 없습니다.");
      } else if (text.includes("shop_product_insufficient_stock")) {
        setMessage("선택한 상품 중 재고가 부족한 상품이 있어 수량을 다시 확인해 주세요.");
      } else if (text.includes("shop_checkout_disabled")) {
        setMessage("선택한 상품 중 앱 내 결제를 지원하지 않는 상품이 있습니다.");
      } else if (text.includes("shop_checkout_verification_required")) {
        setMessage("배송지와 개인정보 확인 항목을 모두 체크한 뒤 결제를 진행해 주세요.");
      } else if (text.includes("shop_checkout_verification_mismatch")) {
        setMessage("결제 전 확인한 배송지 정보가 변경되었습니다. 다시 확인해 주세요.");
      } else if (text.includes("missing_shipping_address")) {
        setMessage("기본 배송지가 없어 주문을 진행할 수 없습니다.");
      } else if (text.includes("missing_toss_client_key")) {
        setMessage("결제 설정이 아직 완료되지 않았습니다. 관리자에게 결제 설정을 확인해 주세요.");
      } else if (text.includes("missing_origin") || text.includes("invalid_referer") || text.includes("invalid_referer_origin")) {
        setMessage("현재 브라우저 보안 정보가 누락되어 결제를 시작할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      } else if (text.includes("invalid_origin")) {
        setMessage("결제 이동 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else if (text.includes("missing_toss_sdk")) {
        setMessage("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else if (text.includes("failed_to_create_shop_bundle_order")) {
        setMessage("묶음 주문서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else if (text.includes("failed_to_create_shop_order")) {
        setMessage("주문서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        setMessage("결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="-mx-4 min-h-[calc(100dvh-72px)] bg-[#f4f7fb] pb-24">
      <div className="border-b border-[#dbe4ef] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop" label={t("쇼핑으로 돌아가기")} />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#102a43]">{t("장바구니")}</h1>
            <p className="text-[12px] text-[#61758a]">{t("상품은 계정 기준으로 저장되며 선택한 상품만 묶음 결제할 수 있습니다.")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {message ? (
          <div
            className={[
              "rounded-[26px] px-4 py-3 text-[12.5px] leading-6",
              messageTone === "error"
                ? "border border-[#efc7be] bg-[#fff5f3] text-[#b14a36]"
                : "border border-[#d6e0ea] bg-[#f7fafc] text-[#425a76]",
            ].join(" ")}
          >
            {message}
          </div>
        ) : null}

        {status !== "authenticated" ? (
          <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
            <div className="text-[16px] font-bold text-[#102a43]">{t("로그인 후 장바구니를 사용할 수 있습니다")}</div>
            <div className="mt-2 text-[13px] leading-6 text-[#61758a]">{t("담은 상품은 계정에 저장되어 기기가 바뀌어도 이어집니다.")}</div>
            <Link href="/settings/account" data-auth-allow className={`mt-5 h-11 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("로그인하러 가기")}
            </Link>
          </div>
        ) : loading ? (
          <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-5 text-[13px] text-[#61758a]">
            {t("장바구니를 불러오는 중입니다...")}
          </div>
        ) : lines.length === 0 ? (
          <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6 text-center">
            <div className="text-[16px] font-bold text-[#102a43]">{t("장바구니가 비어 있습니다")}</div>
            <div className="mt-2 text-[13px] leading-6 text-[#61758a]">{t("상품 상세에서 원하는 수량으로 담아두고 나중에 결제할 수 있습니다.")}</div>
            <Link href="/shop" data-auth-allow className={`mt-5 h-11 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("상품 보러 가기")}
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold text-[#102a43]">{t("담아둔 상품")}</div>
                  <div className="mt-1 text-[12px] text-[#61758a]">
                    {lines.length}종 · 총 {cartItems.reduce((sum, item) => sum + item.quantity, 0)}개
                    {selectedLines.length > 0 ? ` · 선택 ${selectedLines.length}종` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" data-auth-allow onClick={selectAll} className={`h-10 text-[12px] ${SHOP_BUTTON_SECONDARY}`}>
                    {selectedLines.length === lines.length ? t("선택 해제") : t("전체 선택")}
                  </button>
                  <button type="button" data-auth-allow onClick={() => void clearAll()} className={`h-10 text-[12px] ${SHOP_BUTTON_SECONDARY}`}>
                    {t("전체 비우기")}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {lines.map((line) => {
                  const pricing = calculateShopPricing({
                    priceKrw: line.product.priceKrw,
                    quantity: line.item.quantity,
                  });
                  const selected = selectedProductIds.includes(line.product.id);
                  return (
                    <div key={line.product.id} className="rounded-[24px] border border-[#dbe4ef] bg-[#f7fafc] p-4">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          data-auth-allow
                          onClick={() => toggleSelectedProduct(line.product.id)}
                          className={[
                            "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition",
                            selected ? "border-[#17324d] bg-[#17324d] text-white" : "border-[#bfd0e1] bg-white text-[#8ca0b3]",
                          ].join(" ")}
                          aria-label={selected ? "선택 해제" : "선택"}
                        >
                          {selected ? "✓" : ""}
                        </button>
                        <Link href={`/shop/${encodeURIComponent(line.product.id)}`} data-auth-allow className="shrink-0 overflow-hidden rounded-[20px] bg-white">
                          {line.product.imageUrls[0] ? (
                            <img src={getShopImageSrc(line.product.imageUrls[0])} alt={line.product.name} className="h-24 w-24 object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center bg-[#dde7f0] text-[12px] font-semibold text-[#425a76]">
                              {line.product.visualLabel}
                            </div>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-semibold text-[#102a43]">{line.product.name}</div>
                          <div className="mt-1 text-[12px] leading-5 text-[#61758a]">{line.product.subtitle}</div>
                          <div className="mt-2 text-[13px] font-bold text-[#425a76]">{formatShopPrice(line.product)}</div>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              data-auth-allow
                              onClick={() => void changeQuantity(line.product.id, line.item.quantity - 1)}
                              disabled={savingProductId === line.product.id}
                              className={`h-10 w-10 px-0 text-[16px] ${SHOP_BUTTON_SECONDARY}`}
                            >
                              -
                            </button>
                            <div className="flex h-10 min-w-[56px] items-center justify-center rounded-[999px] border-2 border-[#bfd0e1] bg-white px-4 text-[13px] font-semibold text-[#425a76]">
                              {line.item.quantity}
                            </div>
                            <button
                              type="button"
                              data-auth-allow
                              onClick={() => void changeQuantity(line.product.id, line.item.quantity + 1)}
                              disabled={savingProductId === line.product.id}
                              className={`h-10 w-10 px-0 text-[16px] ${SHOP_BUTTON_SECONDARY}`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-[20px] border border-[#d6e0ea] bg-white px-3 py-3 text-[12px] text-[#5c7187]">
                        <div className="flex items-center justify-between gap-3">
                          <span>상품 금액</span>
                          <span className="font-semibold text-[#425a76]">{pricing.subtotalKrw.toLocaleString("ko-KR")}원</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span>배송비</span>
                          <span className="font-semibold text-[#425a76]">
                            {pricing.shippingFeeKrw > 0 ? `${pricing.shippingFeeKrw.toLocaleString("ko-KR")}원` : "무료"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-2">
                          <span className="font-semibold text-[#2f4d6a]">예상 결제</span>
                          <span className="font-bold text-[#2f4d6a]">{pricing.totalKrw.toLocaleString("ko-KR")}원</span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-auth-allow
                          onClick={() => void removeItem(line.product.id)}
                          disabled={savingProductId === line.product.id}
                          className={`h-10 text-[12px] ${SHOP_BUTTON_SECONDARY}`}
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          data-auth-allow
                          onClick={() => openCheckoutFor(line.product.id)}
                          className={`h-10 text-[12px] ${SHOP_BUTTON_PRIMARY}`}
                        >
                          이 상품 결제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-5">
              <div className="text-[15px] font-bold text-[#102a43]">장바구니 요약</div>
              <div className="mt-3 space-y-2 text-[13px] text-[#5c7187]">
                <div className="flex items-center justify-between gap-3">
                  <span>선택 상품</span>
                  <span className="font-semibold text-[#425a76]">{selectedLines.length}종 · {selectedQuantity}개</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>상품 합계</span>
                  <span className="font-semibold text-[#425a76]">{cartPricing.subtotalKrw.toLocaleString("ko-KR")}원</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>묶음 배송비</span>
                  <span className="font-semibold text-[#425a76]">{cartPricing.shippingFeeKrw.toLocaleString("ko-KR")}원</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-2">
                  <span className="font-semibold text-[#2f4d6a]">묶음 결제 총액</span>
                  <span className="font-bold text-[#2f4d6a]">{cartPricing.totalKrw.toLocaleString("ko-KR")}원</span>
                </div>
              </div>
              <div className="mt-3 rounded-[20px] border border-[#d6e0ea] bg-[#f7fafc] px-3 py-3 text-[12px] leading-5 text-[#5c7187]">
                선택한 상품은 1회 결제로 묶어서 승인되며, 주문 내역에는 상품별 주문으로 안전하게 분리 저장됩니다.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-auth-allow
                  onClick={openBundleCheckout}
                  disabled={selectedLines.length === 0}
                  className={`h-11 text-[13px] ${SHOP_BUTTON_ACTIVE}`}
                >
                  선택 상품 묶음 결제
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ShopCheckoutSheet
        open={Boolean(checkoutTarget)}
        onClose={() => setCheckoutTarget(null)}
        onConfirm={(verification) => void handleCheckout(verification)}
        loading={checkoutLoading}
        productTitle={checkoutTarget?.mode === "bundle" ? "장바구니 묶음 결제" : checkoutLine?.product.name ?? ""}
        productSubtitle={
          checkoutTarget?.mode === "bundle"
            ? `${selectedLines.length}종 · 총 ${selectedQuantity}개`
            : checkoutLine?.product.subtitle ?? ""
        }
        priceKrw={checkoutLine?.product.priceKrw ?? 0}
        quantity={checkoutLine?.item.quantity ?? 1}
        pricingOverride={checkoutTarget?.mode === "bundle" ? cartPricing : null}
        addresses={shippingAddresses}
        selectedAddressId={selectedShippingAddressId}
        onSelectAddress={setSelectedShippingAddressId}
        shippingLabel={shippingLabel}
      />
    </div>
  );
}
