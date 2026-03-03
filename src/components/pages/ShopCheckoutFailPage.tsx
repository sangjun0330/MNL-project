"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SHOP_BUTTON_PRIMARY, SHOP_BUTTON_SECONDARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";

function humanizeCheckoutFail(code: string, message: string, t: (key: string) => string) {
  const safeCode = String(code ?? "");
  if (safeCode.includes("PAY_PROCESS_CANCELED")) return t("결제창에서 주문이 취소되었습니다.");
  if (safeCode.includes("PAY_PROCESS_ABORTED")) return t("결제 승인 전에 주문이 중단되었습니다. 잠시 후 다시 시도해 주세요.");
  if (safeCode.includes("REJECT_CARD_COMPANY")) return t("카드사 승인에 실패했습니다. 결제 수단을 다시 확인해 주세요.");
  if (safeCode.includes("INVALID_CARD_EXPIRATION")) return t("카드 유효기간을 다시 확인해 주세요.");
  if (safeCode.includes("NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT")) {
    return t("해당 카드 또는 할부 조건이 지원되지 않습니다.");
  }
  if (message && message.length <= 80) return message;
  return t("결제창에서 주문이 취소되었거나 승인에 실패했습니다.");
}

export function ShopCheckoutFailPage() {
  const { t } = useI18n();
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const message = params.get("message") ?? "";
  const displayMessage = humanizeCheckoutFail(code, message, t);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="rounded-[24px] border border-ios-sep bg-white p-6">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("주문 실패")}</div>
        <div className="mt-3 text-[14px] font-semibold text-red-600">{t("결제가 완료되지 않았습니다.")}</div>
        <div className="mt-2 text-[12.5px] leading-6 text-ios-sub">{displayMessage}</div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/shop" className={`h-10 px-5 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
            {t("쇼핑으로 돌아가기")}
          </Link>
          <Link href="/shop/cart" className={`h-10 px-5 text-[13px] ${SHOP_BUTTON_SECONDARY}`}>
            {t("장바구니 보기")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ShopCheckoutFailPage;
