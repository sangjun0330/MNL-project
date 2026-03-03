"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { calculateShopPricing, formatShopCurrency, type ShopPricingBreakdown } from "@/lib/shop";
import { SHOP_BUTTON_ACTIVE, SHOP_BUTTON_PRIMARY, SHOP_BUTTON_SECONDARY } from "@/lib/shopUi";
import type { ShopShippingAddress } from "@/lib/shopProfile";
import { useI18n } from "@/lib/useI18n";

type ShopCheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (verification: {
    shippingConfirmed: boolean;
    contactConfirmed: boolean;
  }) => void;
  loading?: boolean;
  productTitle: string;
  productSubtitle?: string;
  priceKrw: number;
  quantity: number;
  pricingOverride?: Pick<ShopPricingBreakdown, "subtotalKrw" | "shippingFeeKrw" | "totalKrw"> | null;
  addresses?: ShopShippingAddress[];
  selectedAddressId?: string | null;
  onSelectAddress?: (addressId: string) => void;
  shippingLabel?: string | null;
};

export function ShopCheckoutSheet({
  open,
  onClose,
  onConfirm,
  loading = false,
  productTitle,
  productSubtitle,
  priceKrw,
  quantity,
  pricingOverride = null,
  addresses = [],
  selectedAddressId = null,
  onSelectAddress,
  shippingLabel,
}: ShopCheckoutSheetProps) {
  const { t } = useI18n();
  const computedPricing = calculateShopPricing({ priceKrw, quantity });
  const pricing = pricingOverride
    ? {
        ...computedPricing,
        subtotalKrw: Math.max(0, Math.round(Number(pricingOverride.subtotalKrw) || 0)),
        shippingFeeKrw: Math.max(0, Math.round(Number(pricingOverride.shippingFeeKrw) || 0)),
        totalKrw: Math.max(0, Math.round(Number(pricingOverride.totalKrw) || 0)),
      }
    : computedPricing;
  const [shippingConfirmed, setShippingConfirmed] = useState(false);
  const [contactConfirmed, setContactConfirmed] = useState(false);
  const verificationReady = shippingConfirmed && contactConfirmed;

  useEffect(() => {
    if (!open) return;
    setShippingConfirmed(false);
    setContactConfirmed(false);
  }, [open, selectedAddressId, productTitle, quantity]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      variant="appstore"
      title={t("주문 확인")}
      subtitle={t("결제 전 배송지와 개인정보를 다시 확인합니다.")}
      maxHeightClassName="max-h-[82dvh]"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`${SHOP_BUTTON_SECONDARY} h-11 text-[14px]`}
          >
            {t("취소")}
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                shippingConfirmed,
                contactConfirmed,
              })
            }
            disabled={loading || !verificationReady}
            className={`${verificationReady ? SHOP_BUTTON_ACTIVE : SHOP_BUTTON_PRIMARY} h-11 text-[14px]`}
          >
            {loading ? t("결제창 여는 중...") : verificationReady ? t("검증 후 결제") : t("정보 확인 필요")}
          </button>
        </div>
      }
    >
      <div className="rounded-[22px] border border-ios-sep bg-white p-4">
        <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">{productTitle}</div>
        {productSubtitle ? <div className="mt-1 text-[13px] text-ios-sub">{productSubtitle}</div> : null}
        <div className="my-3 h-px bg-ios-sep" />
        <div className="text-[13px] text-ios-sub">{t("수량")}: {quantity}</div>
        <div className="mt-1 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{formatShopCurrency(pricing.totalKrw)}</div>
        <div className="mt-3 space-y-1 rounded-[20px] border border-[#d6e0ea] bg-[#f7fafc] px-3 py-3 text-[12px] text-[#5b7087]">
          <div className="flex items-center justify-between gap-3">
            <span>{t("상품 금액")}</span>
            <span className="font-semibold text-[#425a76]">{formatShopCurrency(pricing.subtotalKrw)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>{t("배송비")}</span>
            <span className="font-semibold text-[#425a76]">
              {pricing.shippingFeeKrw > 0 ? formatShopCurrency(pricing.shippingFeeKrw) : t("무료")}
            </span>
          </div>
        </div>
        <div className="my-3 h-px bg-ios-sep" />
        {addresses.length > 1 ? (
          <>
            <div className="text-[13px] font-semibold text-ios-text">{t("배송지 선택")}</div>
            <div className="mt-2 grid gap-2">
              {addresses.map((address) => {
                const active = address.id === selectedAddressId;
                return (
                  <button
                    key={address.id}
                    type="button"
                    data-auth-allow
                    onClick={() => onSelectAddress?.(address.id)}
                    className={[
                      "rounded-[24px] border-2 px-4 py-4 text-left transition",
                      active ? "border-[#17324d] bg-[#dfe8f1]" : "border-[#bfd0e1] bg-[#eef4fb]",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      {active ? (
                        <span className="rounded-full bg-[#17324d] px-2 py-0.5 text-[10px] font-semibold text-white">{t("선택")}</span>
                      ) : null}
                      <span className="text-[12px] font-semibold text-[#11294b]">{address.label}</span>
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-ios-text">{address.recipientName} · {address.phone}</div>
                    <div className="mt-1 text-[11.5px] leading-5 text-ios-sub">
                      ({address.postalCode}) {address.addressLine1} {address.addressLine2}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="my-3 h-px bg-ios-sep" />
          </>
        ) : null}
        {shippingLabel ? (
          <>
            <div className="text-[13px] font-semibold text-ios-text">{t("배송지")}</div>
            <div className="mt-1 rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-3 text-[12.5px] leading-5 text-[#44556d]">
              {shippingLabel}
            </div>
            <div className="my-3 h-px bg-ios-sep" />
          </>
        ) : null}

        <div className="text-[13px] font-semibold text-ios-text">{t("최종 확인")}</div>
        <div className="mt-2 grid gap-2">
          {([
            {
              key: "shipping",
              checked: shippingConfirmed,
              label: t("선택한 배송지가 현재 주문 정보와 정확히 일치합니다."),
              onToggle: () => setShippingConfirmed((current) => !current),
            },
            {
              key: "contact",
              checked: contactConfirmed,
              label: t("수령인과 연락처를 다시 확인했고 오배송 위험이 없습니다."),
              onToggle: () => setContactConfirmed((current) => !current),
            },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              data-auth-allow
              onClick={item.onToggle}
              className={[
                "flex items-start gap-3 rounded-[24px] border-2 px-4 py-4 text-left transition",
                item.checked ? "border-[#17324d] bg-[#dfe8f1]" : "border-[#bfd0e1] bg-[#eef4fb]",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                  item.checked ? "border-[#17324d] bg-[#17324d] text-white" : "border-[#aebfd1] bg-[#eef4fb] text-[#8da0b3]",
                ].join(" ")}
              >
                {item.checked ? "✓" : ""}
              </span>
              <span className="text-[12.5px] leading-5 text-[#44556d]">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 text-[12.5px] leading-5 text-ios-sub">
          {t("결제 완료 후 주문 내역에 즉시 반영됩니다. 환불 요청은 주문 상세에서 진행할 수 있고, 리뷰는 구매 확정 이후에만 작성됩니다.")}
        </div>
      </div>
    </BottomSheet>
  );
}

export default ShopCheckoutSheet;
