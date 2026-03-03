"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ShopShippingAddress } from "@/lib/shopProfile";

type ShopCheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (verification: {
    shippingConfirmed: boolean;
    contactConfirmed: boolean;
    policyConfirmed: boolean;
  }) => void;
  loading?: boolean;
  productTitle: string;
  productSubtitle?: string;
  priceKrw: number;
  quantity: number;
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
  addresses = [],
  selectedAddressId = null,
  onSelectAddress,
  shippingLabel,
}: ShopCheckoutSheetProps) {
  const total = Math.max(0, Math.round(priceKrw) * Math.max(1, quantity));
  const [shippingConfirmed, setShippingConfirmed] = useState(false);
  const [contactConfirmed, setContactConfirmed] = useState(false);
  const [policyConfirmed, setPolicyConfirmed] = useState(false);
  const verificationReady = shippingConfirmed && contactConfirmed && policyConfirmed;

  useEffect(() => {
    if (!open) return;
    setShippingConfirmed(false);
    setContactConfirmed(false);
    setPolicyConfirmed(false);
  }, [open, selectedAddressId, productTitle, quantity]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      variant="appstore"
      title="주문 확인"
      subtitle="결제 전 배송지와 개인정보를 다시 확인합니다."
      maxHeightClassName="max-h-[82dvh]"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 text-[14px] font-semibold text-[#11294b] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({
                shippingConfirmed,
                contactConfirmed,
                policyConfirmed,
              })
            }
            disabled={loading || !verificationReady}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#102a43] bg-[#102a43] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "결제창 여는 중..." : verificationReady ? "검증 후 결제" : "정보 확인 필요"}
          </button>
        </div>
      }
    >
      <div className="rounded-[22px] border border-ios-sep bg-white p-4">
        <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">{productTitle}</div>
        {productSubtitle ? <div className="mt-1 text-[13px] text-ios-sub">{productSubtitle}</div> : null}
        <div className="my-3 h-px bg-ios-sep" />
        <div className="text-[13px] text-ios-sub">수량: {quantity}</div>
        <div className="mt-1 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{total.toLocaleString("ko-KR")}원</div>
        <div className="my-3 h-px bg-ios-sep" />
        {addresses.length > 1 ? (
          <>
            <div className="text-[13px] font-semibold text-ios-text">배송지 선택</div>
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
                      "rounded-2xl border px-3 py-3 text-left transition",
                      active ? "border-[#102a43] bg-[#eef4fb]" : "border-[#d7dfeb] bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      {active ? (
                        <span className="rounded-full bg-[#102a43] px-2 py-0.5 text-[10px] font-semibold text-white">선택</span>
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
            <div className="text-[13px] font-semibold text-ios-text">배송지</div>
            <div className="mt-1 rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-3 text-[12.5px] leading-5 text-[#44556d]">
              {shippingLabel}
            </div>
            <div className="my-3 h-px bg-ios-sep" />
          </>
        ) : null}

        <div className="text-[13px] font-semibold text-ios-text">최종 확인</div>
        <div className="mt-2 grid gap-2">
          {([
            {
              key: "shipping",
              checked: shippingConfirmed,
              label: "선택한 배송지가 현재 주문 정보와 정확히 일치합니다.",
              onToggle: () => setShippingConfirmed((current) => !current),
            },
            {
              key: "contact",
              checked: contactConfirmed,
              label: "수령인과 연락처를 다시 확인했고 오배송 위험이 없습니다.",
              onToggle: () => setContactConfirmed((current) => !current),
            },
            {
              key: "policy",
              checked: policyConfirmed,
              label: "배송 완료 후 구매 확정을 해야 리뷰 권한이 열리는 정책을 확인했습니다.",
              onToggle: () => setPolicyConfirmed((current) => !current),
            },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              data-auth-allow
              onClick={item.onToggle}
              className={[
                "flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
                item.checked ? "border-[#102a43] bg-[#eef4fb]" : "border-[#d7dfeb] bg-white",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                  item.checked ? "border-[#102a43] bg-[#102a43] text-white" : "border-[#c9d3df] bg-white text-[#8da0b3]",
                ].join(" ")}
              >
                {item.checked ? "✓" : ""}
              </span>
              <span className="text-[12.5px] leading-5 text-[#44556d]">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 text-[12.5px] leading-5 text-ios-sub">
          결제 완료 후 주문 내역에 즉시 반영됩니다. 환불 요청은 주문 상세에서 진행할 수 있고, 리뷰는 구매 확정 이후에만 작성됩니다.
        </div>
      </div>
    </BottomSheet>
  );
}

export default ShopCheckoutSheet;
