"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getShopImageSrc, SHOP_PRODUCTS, formatShopPrice, type ShopProduct } from "@/lib/shop";
import { getWishlist, removeFromWishlist } from "@/lib/shopClient";

export function ShopWishlistPage() {
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<ShopProduct[]>(SHOP_PRODUCTS);

  useEffect(() => {
    setWishlistIds(getWishlist());
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

  const wishlistProducts = wishlistIds
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is ShopProduct => Boolean(p));

  const handleRemove = (productId: string) => {
    removeFromWishlist(productId);
    setWishlistIds((current) => current.filter((id) => id !== productId));
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
          <Link href="/shop" data-auth-allow className="inline-flex h-10 w-10 items-center justify-center text-[#111827]" aria-label="쇼핑으로 돌아가기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5" /><path d="M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#111827]">찜한 상품</h1>
            {wishlistProducts.length > 0 && (
              <p className="text-[12px] text-[#65748b]">{wishlistProducts.length}개</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5">
        {wishlistProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[48px]">🤍</div>
            <div className="mt-4 text-[16px] font-bold text-[#111827]">아직 찜한 상품이 없어요</div>
            <div className="mt-2 text-[13px] text-[#65748b]">마음에 드는 상품의 하트를 눌러 저장해 보세요</div>
            <Link href="/shop" data-auth-allow className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-6 text-[14px] font-semibold text-white">
              쇼핑하러 가기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7">
            {wishlistProducts.map((product) => (
              <div key={product.id} className="relative block">
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => handleRemove(product.id)}
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
