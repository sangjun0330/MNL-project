"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { maskShopAddressLine, maskShopEmail } from "@/lib/shopPrivacy";
import { formatShopShippingSingleLine, resolveDefaultShopShippingAddress, type ShopShippingAddress } from "@/lib/shopProfile";
import { SHOP_BUTTON_PRIMARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";
import { ShopBackLink } from "@/components/shop/ShopBackLink";

type ShopProfileResponse = {
  addresses?: ShopShippingAddress[];
  defaultAddressId?: string | null;
};

const HUB_ROW =
  "flex items-center justify-between gap-4 rounded-[22px] border border-[#d9e2ec] bg-[#f8fbfd] px-4 py-4 transition hover:border-[#b8c8d9] hover:bg-white";

export function ShopProfileAccountPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [addresses, setAddresses] = useState<ShopShippingAddress[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setAddresses([]);
      setDefaultAddressId(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/profile", {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok) throw new Error();
        const data = (json?.data ?? {}) as ShopProfileResponse;
        setAddresses(Array.isArray(data.addresses) ? data.addresses : []);
        setDefaultAddressId(typeof data.defaultAddressId === "string" ? data.defaultAddressId : null);
      } catch {
        if (!active) return;
        setAddresses([]);
        setDefaultAddressId(null);
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

  return (
    <div className="-mx-4 min-h-[calc(100dvh-72px)] bg-[#f4f7fb] pb-24">
      <div className="border-b border-[#dbe4ef] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <ShopBackLink href="/shop/profile" label={t("쇼핑 프로필로 돌아가기")} />
          <div>
            <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#102a43]">{t("배송지 · 계정")}</h1>
            <p className="text-[12px] text-[#61758a]">{t("배송지와 주문 전 확인 정보를 한 페이지에서 관리합니다.")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        {status !== "authenticated" ? (
          <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-6">
            <div className="text-[16px] font-bold text-[#102a43]">{t("로그인 후 배송지 정보를 확인할 수 있습니다")}</div>
            <div className="mt-2 text-[13px] leading-6 text-[#61758a]">{t("기본 배송지와 개인정보 확인 흐름은 계정 기준으로 안전하게 관리됩니다.")}</div>
            <Link href="/settings/account" data-auth-allow className={`mt-5 h-11 px-5 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
              {t("로그인하러 가기")}
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-[28px] bg-[#102a43] px-5 py-5 text-white shadow-[0_18px_46px_rgba(16,42,67,0.12)]">
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">{t("계정")}</div>
              <div className="mt-2 text-[20px] font-bold tracking-[-0.03em]">{maskShopEmail(user?.email)}</div>
              <div className="mt-2 text-[12px] text-white/78">
                {loading
                  ? t("기본 배송지를 확인하는 중입니다.")
                  : defaultAddress
                    ? `${t("기본 배송지")} · ${maskShopAddressLine(formatShopShippingSingleLine(defaultAddress))}`
                    : t("아직 저장된 기본 배송지가 없습니다.")}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#dbe4ef] bg-white p-4">
              <div className="grid gap-3">
                <Link href="/settings/account/shipping" data-auth-allow className={HUB_ROW}>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#102a43]">{t("배송지 설정")}</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#61758a]">
                      {t("배송지, 수령인, 연락처를 수정하고 기본 배송지를 지정합니다.")}
                    </div>
                  </div>
                  <span className="shrink-0 text-[18px] text-[#8ca0b3]">›</span>
                </Link>

                <Link href="/shop/orders?filter=delivered" data-auth-allow className={HUB_ROW}>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#102a43]">{t("구매 확정 안내")}</div>
                    <div className="mt-1 text-[12px] leading-5 text-[#61758a]">
                      {t("배송 완료 후 구매 확정을 해야 리뷰 권한이 열리고, 결제 전에는 배송지 정보를 다시 확인합니다.")}
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

export default ShopProfileAccountPage;
