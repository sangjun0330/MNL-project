"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { maskShopAddressLine, maskShopEmail, maskShopPhone, maskShopRecipientName } from "@/lib/shopPrivacy";
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
  "flex items-center justify-between gap-4 rounded-[24px] border-2 border-[#bfd0e1] bg-[#eef4fb] px-4 py-4 transition hover:border-[#17324d] hover:bg-[#dfe8f1]";

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
  const confirmedCount = useMemo(
    () => orders.filter((order) => Boolean(order.purchaseConfirmedAt)).length,
    [orders]
  );

  const orderLinks = [
    {
      href: "/shop/orders",
      title: t("주문 목록"),
      description: loading ? "주문 내역을 정리하는 중입니다." : `${orders.length}건의 주문과 환불 요청을 확인합니다.`,
    },
    {
      href: "/shop/orders?filter=progress",
      title: t("배송 현황"),
      description: loading
        ? "배송 진행 상태를 정리하는 중입니다."
        : inProgressCount > 0
          ? `${inProgressCount}건이 결제 또는 배송 단계에 있습니다.`
          : "현재 진행 중인 배송이 없습니다.",
    },
    {
      href: "/shop/orders?filter=delivered",
      title: t("구매 확정"),
      description: loading
        ? "구매 확정 대상을 확인하는 중입니다."
        : confirmPendingCount > 0
          ? `${confirmPendingCount}건이 구매 확정을 기다리고 있습니다.`
          : confirmedCount > 0
            ? `${confirmedCount}건의 구매 확정이 완료되었습니다.`
            : "배송 완료 후 구매 확정을 진행하면 리뷰 권한이 열립니다.",
    },
  ];

  const accountLinks = [
    {
      href: "/shop/cart",
      title: t("장바구니"),
      description: loading ? "담아둔 상품을 정리하는 중입니다." : `${cartCount}개 상품이 계정 장바구니에 저장되어 있습니다.`,
    },
    {
      href: "/shop/wishlist",
      title: t("위시리스트"),
      description: loading ? "계정 저장 상태를 확인하는 중입니다." : `${wishlistIds.length}개 상품이 계정에 저장되어 있습니다.`,
    },
    {
      href: "/settings/account/shipping",
      title: t("배송지 설정"),
      description: defaultAddress
        ? `${defaultAddress.label} · ${maskShopAddressLine(formatShopShippingSingleLine(defaultAddress))}`
        : "기본 배송지를 먼저 저장해 주세요.",
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
            <div className="rounded-[28px] bg-[#102a43] p-5 text-white shadow-[0_24px_64px_rgba(16,42,67,0.16)]">
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">{t("계정")}</div>
              <div className="mt-3 text-[24px] font-bold tracking-[-0.03em]">{maskShopEmail(user?.email)}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-[11px] text-white/70">진행 중 배송</div>
                  <div className="mt-1 text-[18px] font-bold">{loading ? "-" : inProgressCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-[11px] text-white/70">구매 확정 대기</div>
                  <div className="mt-1 text-[18px] font-bold">{loading ? "-" : confirmPendingCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-[11px] text-white/70">위시리스트</div>
                  <div className="mt-1 text-[18px] font-bold">{loading ? "-" : wishlistIds.length}</div>
                </div>
              </div>
            </div>

            {message ? (
              <div className="rounded-3xl border border-[#f1d0cc] bg-[#fff6f5] px-4 py-3 text-[12.5px] leading-5 text-[#a33a2b]">
                {message}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-5">
              <div className="text-[15px] font-bold text-[#102a43]">{t("쇼핑 개인정보")}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[24px] border-2 border-[#bfd0e1] bg-[#eef4fb] px-4 py-4 text-[13px] text-[#44556d]">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8092a8]">기본 배송지</div>
                  {defaultAddress ? (
                    <>
                      <div className="mt-2 text-[14px] font-semibold text-[#102a43]">{maskShopRecipientName(defaultAddress.recipientName)}</div>
                      <div className="mt-1">{maskShopPhone(defaultAddress.phone)}</div>
                      <div className="mt-1 leading-6">{maskShopAddressLine(formatShopShippingSingleLine(defaultAddress))}</div>
                    </>
                  ) : (
                    <div className="mt-2 leading-6">저장된 기본 배송지가 없습니다. 결제 전에 배송지를 먼저 등록해 주세요.</div>
                  )}
                </div>
                <div className="rounded-[24px] border-2 border-[#bfd0e1] bg-[#eef4fb] px-4 py-4 text-[12.5px] leading-6 text-[#44556d]">
                  결제 전에는 배송지와 연락처를 다시 확인한 뒤 진행하고, 배송 완료 후 구매 확정을 마쳐야 리뷰 권한이 활성화됩니다.
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-5">
              <div className="text-[14px] font-bold text-[#102a43]">{t("주문 관리")}</div>
              <div className="mt-3 grid gap-3">
                {orderLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-auth-allow
                    className={PROFILE_LINK_ROW}
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#102a43]">{item.title}</div>
                      <div className="mt-1 text-[12px] leading-5 text-[#61758a]">{item.description}</div>
                    </div>
                    <span className="shrink-0 text-[18px] text-[#8ca0b3]">›</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-5">
              <div className="text-[14px] font-bold text-[#102a43]">{t("보관함과 배송")}</div>
              <div className="mt-3 grid gap-3">
                {accountLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-auth-allow
                    className={PROFILE_LINK_ROW}
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#102a43]">{item.title}</div>
                      <div className="mt-1 text-[12px] leading-5 text-[#61758a]">{item.description}</div>
                    </div>
                    <span className="shrink-0 text-[18px] text-[#8ca0b3]">›</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
