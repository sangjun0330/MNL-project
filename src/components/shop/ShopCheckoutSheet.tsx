"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";

type ShopCheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  productTitle: string;
  productSubtitle?: string;
  priceKrw: number;
  quantity: number;
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
            className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-[#F4F4F6] px-4 text-[14px] font-semibold text-ios-text disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 text-[14px] font-semibold text-[color:var(--rnest-accent)] disabled:opacity-50"
          >
            {loading ? "결제창 여는 중..." : "토스로 결제"}
          </button>
        </div>
      }
    >
      <div className="rounded-[22px] border border-black/10 bg-white p-4">
        <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">{productTitle}</div>
        {productSubtitle ? <div className="mt-1 text-[13px] text-ios-sub">{productSubtitle}</div> : null}
        <div className="my-3 h-px bg-black/10" />
        <div className="text-[13px] text-ios-sub">수량: {quantity}</div>
        <div className="mt-1 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{total.toLocaleString("ko-KR")}원</div>
        <div className="my-3 h-px bg-black/10" />
        <div className="text-[12.5px] leading-5 text-ios-sub">
          결제 완료 후 주문 내역에 즉시 반영됩니다. 환불 요청은 쇼핑 탭의 주문 내역에서 접수할 수 있습니다.
        </div>
      </div>
    </BottomSheet>
  );
}

export default ShopCheckoutSheet;
