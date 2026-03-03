"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { getShopImageSrc, SHOP_PRODUCTS, formatShopPrice, type ShopProduct } from "@/lib/shop";
import { getWishlist, removeFromWishlist } from "@/lib/shopClient";
import { SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";

export function ShopWishlistPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ShopProduct[]>(SHOP_PRODUCTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 최신 카탈로그 로드
    const run = async () => {
      try {
        const res = await fetch("/api/shop/catalog", { method: "GET", cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok && Array.isArray(json?.data?.products)) {
          setCatalog(json.data.products as ShopProduct[]);
        }
      } catch {
        // 기본 카탈로그 사용
      }
    };
    void run();
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setWishlistIds([]);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const ids = await getWishlist(headers);
        if (!active) return;
        setWishlistIds(ids);
      } catch {
        if (!active) return;
        setWishlistIds([]);
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

  const wishlistProducts = wishlistIds
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is ShopProduct => Boolean(p));

  const handleRemove = async (productId: string) => {
    if (status !== "authenticated" || !user?.userId) return;
    try {
      const headers = await authHeaders();
      const ids = await removeFromWishlist(productId, headers);
      setWishlistIds(ids);
    } catch {
      // keep current state
    }
  };

  function productToneClass(product: ShopProduct) {
    if (product.checkoutEnabled && product.priceKrw) return "border border-[#11294b] bg-[#11294b] text-white";
    if (product.externalUrl) return "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
    return "border border-[#e1e7f0] bg-[#f7f9fc] text-[#11294b]";
  }

  return (
    <div className="-mx-4 pb-24">
      <div className="border-b border-[#edf1f6] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop" label={t("쇼핑으로 돌아가기")} />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">{t("찜한 상품")}</h1>
            {wishlistProducts.length > 0 && (
              <p className="text-[12px] text-[#65748b]">{wishlistProducts.length} {t("개")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5">
        {status !== "authenticated" ? (
          <div className="rounded-3xl border border-[#dbe4ef] bg-white p-6 text-center">
            <div className="text-[16px] font-bold text-[#102a43]">{t("로그인 후 위시리스트를 확인할 수 있습니다")}</div>
            <div className="mt-2 text-[13px] leading-6 text-[#5a6b80]">{t("찜한 상품은 기기가 아니라 계정에 안전하게 저장됩니다.")}</div>
            <Link href="/settings/account" data-auth-allow className={`mt-5 h-11 px-6 text-[14px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("로그인하러 가기")}
            </Link>
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-[#dbe4ef] bg-white p-5 text-[13px] text-[#5a6b80]">
            {t("위시리스트를 불러오는 중입니다...")}
          </div>
        ) : wishlistProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[48px]">🤍</div>
            <div className="mt-4 text-[16px] font-bold text-[#111827]">{t("아직 찜한 상품이 없어요")}</div>
            <div className="mt-2 text-[13px] text-[#65748b]">{t("마음에 드는 상품의 하트를 눌러 저장해 보세요")}</div>
            <Link href="/shop" data-auth-allow className={`mt-6 h-11 px-6 text-[14px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("쇼핑하러 가기")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7">
            {wishlistProducts.map((product) => (
              <div key={product.id} className="relative block">
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => void handleRemove(product.id)}
                  className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur-sm"
                  aria-label="찜 해제"
                >
                  <svg viewBox="0 0 24 24" fill="#e63946" stroke="#e63946" strokeWidth="1.5" className="h-4 w-4">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
                <Link href={`/shop/${encodeURIComponent(product.id)}`} data-auth-allow className="block">
                  <div className="relative overflow-hidden rounded-[2px] bg-[#f3f5f7]">
                    {product.imageUrls[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={getShopImageSrc(product.imageUrls[0])} alt={product.name} className="aspect-square w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className={["flex aspect-square items-center justify-center p-4", productToneClass(product)].join(" ")}>
                        <div className="text-center">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-75">{product.partnerLabel}</div>
                          <div className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{product.visualLabel}</div>
                        </div>
                      </div>
                    )}
                    {product.outOfStock ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-[#111827]">품절</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 text-[15px] font-semibold leading-6 tracking-[-0.02em] text-[#111827]">{product.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    {product.originalPriceKrw && product.priceKrw && product.originalPriceKrw > product.priceKrw ? (
                      <>
                        <span className="text-[12px] text-[#8d99ab] line-through">
                          {product.originalPriceKrw.toLocaleString("ko-KR")}원
                        </span>
                        <span className="text-[13px] font-bold text-[#111827]">{formatShopPrice(product)}</span>
                        <span className="text-[11px] font-semibold text-[#e63946]">
                          -{Math.round((1 - product.priceKrw / product.originalPriceKrw) * 100)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-[13px] font-bold text-[#111827]">{formatShopPrice(product)}</span>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
