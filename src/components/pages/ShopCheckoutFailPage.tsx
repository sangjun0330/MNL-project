"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/useI18n";

export function ShopCheckoutFailPage() {
  const { t } = useI18n();
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const message = params.get("message") ?? "";

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="rounded-[24px] border border-ios-sep bg-white p-6">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("주문 실패")}</div>
        <div className="mt-3 text-[14px] font-semibold text-red-600">{t("결제가 완료되지 않았습니다.")}</div>
        <div className="mt-2 text-[12.5px] text-ios-sub">{message || t("결제창에서 주문이 취소되었거나 승인에 실패했습니다.")}</div>
        {code ? <div className="mt-1 text-[12px] break-all text-ios-muted">code: {code}</div> : null}

        <div className="mt-6 flex gap-2">
          <Link href="/shop" className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-5 text-[13px] font-semibold text-white">
            {t("쇼핑으로 돌아가기")}
          </Link>
          <Link href="/settings/billing" className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-5 text-[13px] font-semibold text-[#11294b]">
            {t("결제 설정 보기")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ShopCheckoutFailPage;
