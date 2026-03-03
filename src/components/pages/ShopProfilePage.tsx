"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { maskShopAddressLine, maskShopEmail } from "@/lib/shopPrivacy";
import { formatShopShippingSingleLine, resolveDefaultShopShippingAddress, type ShopShippingAddress } from "@/lib/shopProfile";
import { getCart, getWishlist } from "@/lib/shopClient";
import { SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";

type ShopOrderSummary = {
  orderId: string;
  status: "READY" | "PAID" | "SHIPPED" | "DELIVERED" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED";
  purchaseConfirmedAt: string | null;
};

type ShopProfileResponse = {
  addresses?: ShopShippingAddress[];
  defaultAddressId?: string | null;
};

const PROFILE_LINK_ROW =
  "flex items-center justify-between gap-4 rounded-[22px] border border-[#d9e2ec] bg-[#f8fbfd] px-4 py-4 transition hover:border-[#b8c8d9] hover:bg-white";

export function ShopProfilePage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [addresses, setAddresses] = useState<ShopShippingAddress[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setAddresses([]);
      setDefaultAddressId(null);
      setOrders([]);
      setWishlistIds([]);
      setCartCount(0);
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
        const [profileRes, ordersRes, wishlist, cartItems] = await Promise.all([
          fetch("/api/shop/profile", {
            method: "GET",
            headers: { "content-type": "application/json", ...headers },
            cache: "no-store",
          }),
          fetch("/api/shop/orders?limit=20", {
            method: "GET",
            headers: { "content-type": "application/json", ...headers },
            cache: "no-store",
          }),
          getWishlist(headers),
          getCart(headers),
        ]);
        const profileJson = await profileRes.json().catch(() => null);
        const ordersJson = await ordersRes.json().catch(() => null);
        if (!active) return;
        if (!profileRes.ok || !profileJson?.ok) throw new Error(String(profileJson?.error ?? `profile_http_${profileRes.status}`));
        if (!ordersRes.ok || !ordersJson?.ok) throw new Error(String(ordersJson?.error ?? `orders_http_${ordersRes.status}`));

        const profileData = (profileJson?.data ?? {}) as ShopProfileResponse;
        setAddresses(Array.isArray(profileData.addresses) ? profileData.addresses : []);
        setDefaultAddressId(typeof profileData.defaultAddressId === "string" ? profileData.defaultAddressId : null);
        setOrders(Array.isArray(ordersJson?.data?.orders) ? (ordersJson.data.orders as ShopOrderSummary[]) : []);
        setWishlistIds(wishlist);
        setCartCount(cartItems.reduce((sum, item) => sum + item.quantity, 0));
      } catch {
        if (!active) return;
        setAddresses([]);
        setDefaultAddressId(null);
        setOrders([]);
        setWishlistIds([]);
        setCartCount(0);
        setMessage("쇼핑 계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
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

  const defaultAddress = useMemo(
    () => resolveDefaultShopShippingAddress({ addresses, defaultAddressId }),
    [addresses, defaultAddressId]
  );
  const inProgressCount = useMemo(
    () => orders.filter((order) => order.status === "PAID" || order.status === "SHIPPED").length,
    [orders]
  );
  const confirmPendingCount = useMemo(
    () => orders.filter((order) => order.status === "DELIVERED" && !order.purchaseConfirmedAt).length,
    [orders]
  );
  const hubLinks = [
    {
      href: "/shop/orders",
      title: "주문 · 배송",
      description: loading
        ? "주문과 배송 상태를 정리하는 중입니다."
        : `${orders.length}건 주문 · 진행 ${inProgressCount}건 · 구매 확정 대기 ${confirmPendingCount}건`,
    },
    {
      href: "/shop/profile/saved",
      title: "보관함",
      description: loading
        ? "장바구니와 위시리스트를 정리하는 중입니다."
        : `장바구니 ${cartCount}개 · 위시리스트 ${wishlistIds.length}개`,
    },
    {
      href: "/shop/profile/account",
      title: "배송지 · 계정",
      description: defaultAddress
        ? `${defaultAddress.label} · ${maskShopAddressLine(formatShopShippingSingleLine(defaultAddress))}`
        : "배송지와 주문 전 확인 정보를 관리합니다.",
    },
  ];

  return (
    <div className="-mx-4 min-h-[calc(100dvh-72px)] bg-[#f4f7fb] pb-24">
      <div className="border-b border-[#dbe4ef] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop" label={t("쇼핑으로 돌아가기")} />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#102a43]">{t("쇼핑 프로필")}</h1>
            <p className="text-[12px] text-[#61758a]">{t("주문, 배송, 배송지, 위시리스트를 한 곳에서 관리합니다.")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {status !== "authenticated" ? (
          <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
            <div className="text-[16px] font-bold text-[#102a43]">{t("로그인 후 쇼핑 프로필을 사용할 수 있습니다")}</div>
            <div className="mt-2 text-[13px] leading-6 text-[#5a6b80]">{t("위시리스트, 배송지, 주문 정보는 모두 계정 기준으로 안전하게 저장됩니다.")}</div>
            <Link href="/settings/account" data-auth-allow className={`mt-5 h-11 px-5 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("로그인하러 가기")}
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] bg-[#102a43] px-5 py-5 text-white shadow-[0_18px_46px_rgba(16,42,67,0.12)]">
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">{t("계정")}</div>
              <div className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{maskShopEmail(user?.email)}</div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-white/78">
                <span>주문 {loading ? "-" : orders.length}</span>
                <span>배송 중 {loading ? "-" : inProgressCount}</span>
                <span>보관 {loading ? "-" : cartCount + wishlistIds.length}</span>
              </div>
            </div>

            {message ? (
              <div className="rounded-3xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] leading-5 text-[#a33a2b]">
                {message}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-4">
              <div className="grid gap-3">
                {hubLinks.map((item) => (
                  <Link key={item.href} href={item.href} data-auth-allow className={PROFILE_LINK_ROW}>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#102a43]">{item.title}</div>
                      <div className="mt-1 text-[12px] leading-5 text-[#61758a]">{item.description}</div>
                    </div>
                    <span className="shrink-0 text-[18px] text-[#8ca0b3]">›</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="px-1 text-[12px] leading-6 text-[#61758a]">
              배송, 환불, 구매 확정, 장바구니, 위시리스트, 배송지 정보는 각 상세 허브에서 정리해서 확인할 수 있습니다.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
