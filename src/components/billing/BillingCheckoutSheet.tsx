"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatKrw } from "@/lib/billing/plans";

type BillingCheckoutSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  productTitle: string;
  productSubtitle?: string;
  priceKrw: number;
  periodLabel?: string;
  accountEmail?: string | null;
  confirmLabel?: string;
};

export function BillingCheckoutSheet({
  open,
  onClose,
  onConfirm,
  loading = false,
  productTitle,
  productSubtitle,
  priceKrw,
  periodLabel,
  accountEmail,
  confirmLabel,
}: BillingCheckoutSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      variant="appstore"
      title="결제 확인"
      subtitle="아래로 스와이프해 닫을 수 있습니다."
      maxHeightClassName="max-h-[82dvh]"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-[#F4F4F6] px-4 text-[14px] font-semibold text-ios-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent)] px-4 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "결제창 여는 중..." : confirmLabel ?? "결제 계속"}
          </button>
        </div>
      }
    >
      <div className="rounded-[22px] border border-black/10 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-[#DDE5F3] bg-[color:var(--wnl-accent-soft)]">
            <span className="text-[11px] font-bold text-[color:var(--wnl-accent)]">RNest</span>
          </div>
          <div className="min-w-0">
            <div className="text-[19px] font-bold tracking-[-0.02em] text-ios-text">{productTitle}</div>
            {productSubtitle ? <div className="mt-0.5 text-[13px] text-ios-sub">{productSubtitle}</div> : null}
          </div>
        </div>
        <div className="my-3 h-px bg-black/10" />
        <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{formatKrw(priceKrw).replace(" KRW", "원")}</div>
        {periodLabel ? <div className="mt-0.5 text-[12.5px] text-ios-sub">{periodLabel}</div> : null}
        <div className="my-3 h-px bg-black/10" />
        <div className="text-[12.5px] leading-5 text-ios-sub">
          결제 승인 후 즉시 적용됩니다. 구독은 다음 갱신일 1일 전까지 해지하지 않으면 자동 연장됩니다.
        </div>
        {accountEmail ? (
          <>
            <div className="my-3 h-px bg-black/10" />
            <div className="text-[12.5px] text-ios-muted">계정: {accountEmail}</div>
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export default BillingCheckoutSheet;
