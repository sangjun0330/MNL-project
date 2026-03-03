"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { getCart, getWishlist } from "@/lib/shopClient";
import { SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";

const HUB_ROW =
  "flex items-center justify-between gap-4 rounded-[22px] border border-[#d9e2ec] bg-[#f8fbfd] px-4 py-4 transition hover:border-[#b8c8d9] hover:bg-white";

export function ShopProfileSavedPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setWishlistIds([]);
      setCartCount(0);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const [wishlist, cartItems] = await Promise.all([getWishlist(headers), getCart(headers)]);
        if (!active) return;
        setWishlistIds(wishlist);
        setCartCount(cartItems.reduce((sum, item) => sum + item.quantity, 0));
      } catch {
        if (!active) return;
        setWishlistIds([]);
        setCartCount(0);
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

  return (
    <div className="-mx-4 min-h-[calc(100dvh-72px)] bg-[#f4f7fb] pb-24">
      <div className="border-b border-[#dbe4ef] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop/profile" label="쇼핑 프로필로 돌아가기" />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#102a43]">보관함</h1>
            <p className="text-[12px] text-[#61758a]">장바구니와 위시리스트를 한 페이지에서 정리합니다.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {status !== "authenticated" ? (
          <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
            <div className="text-[16px] font-bold text-[#102a43]">로그인 후 보관함을 사용할 수 있습니다</div>
            <div className="mt-2 text-[13px] leading-6 text-[#61758a]">계정 기준으로 저장된 장바구니와 위시리스트를 안전하게 불러옵니다.</div>
            <Link href="/settings/account" data-auth-allow className={`mt-5 h-11 px-5 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("로그인하러 가기")}
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] bg-[#102a43] px-5 py-5 text-white shadow-[0_18px_46px_rgba(16,42,67,0.12)]">
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">Saved</div>
              <div className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{loading ? "-" : cartCount + wishlistIds.length}</div>
              <div className="mt-2 text-[12px] text-white/78">
                장바구니 {loading ? "-" : cartCount}개 · 위시리스트 {loading ? "-" : wishlistIds.length}개
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-4">
              <div className="grid gap-3">
                <Link href="/shop/cart" data-auth-allow className={HUB_ROW}>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#102a43]">장바구니</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#61758a]">
                      {loading ? "장바구니를 정리하는 중입니다." : `${cartCount}개 상품을 바로 결제하거나 수량을 조정할 수 있습니다.`}
                    </div>
                  </div>
                  <span className="shrink-0 text-[18px] text-[#8ca0b3]">›</span>
                </Link>

                <Link href="/shop/wishlist" data-auth-allow className={HUB_ROW}>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#102a43]">위시리스트</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#61758a]">
                      {loading ? "위시리스트를 정리하는 중입니다." : `${wishlistIds.length}개 상품을 저장해두고 다시 볼 수 있습니다.`}
                    </div>
                  </div>
                  <span className="shrink-0 text-[18px] text-[#8ca0b3]">›</span>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ShopProfileSavedPage;
