"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ShopShippingAddress } from "@/lib/shopProfile";

type ShopCheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      variant="appstore"
      title="주문 확인"
      subtitle="토스 결제창으로 이동합니다."
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
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "결제창 여는 중..." : "토스로 결제"}
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
                      active ? "border-[#3b6fc9] bg-[#eef4fb]" : "border-[#d7dfeb] bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      {active ? (
                        <span className="rounded-full bg-[#3b6fc9] px-2 py-0.5 text-[10px] font-semibold text-white">선택</span>
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
            <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{shippingLabel}</div>
            <div className="my-3 h-px bg-ios-sep" />
          </>
        ) : null}
        <div className="text-[12.5px] leading-5 text-ios-sub">
          결제 완료 후 주문 내역에 즉시 반영됩니다. 환불 요청은 쇼핑 탭의 주문 내역에서 접수할 수 있습니다.
        </div>
      </div>
    </BottomSheet>
  );
}

export default ShopCheckoutSheet;
