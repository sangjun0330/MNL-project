"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient, useAuthState } from "@/lib/auth";
import { SHOP_BUTTON_PRIMARY, SHOP_BUTTON_SECONDARY } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";

type ConfirmedOrderSummary = {
  orderId: string;
  amount: number;
  subtotalKrw: number;
  shippingFeeKrw: number;
  productSnapshot: {
    name: string;
    quantity: number;
  };
  approvedAt: string | null;
};

type ConfirmResult =
  | {
      mode: "single";
      order: ConfirmedOrderSummary;
    }
  | {
      mode: "bundle";
      bundle: {
        bundleId: string;
        amount: number;
        subtotalKrw: number;
        shippingFeeKrw: number;
        itemCount: number;
        totalQuantity: number;
        displayName: string;
        approvedAt: string | null;
      };
      orders?: ConfirmedOrderSummary[];
    };

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function humanizeConfirmError(code: string) {
  if (code.includes("login_required")) return "로그인 확인 후 다시 주문 상태를 불러와 주세요.";
  if (code.includes("amount_mismatch")) return "결제 금액이 주문 정보와 달라 승인할 수 없습니다. 장바구니에서 다시 결제해 주세요.";
  if (code.includes("shop_order_not_found")) return "결제할 주문 정보를 찾지 못했습니다. 장바구니에서 다시 시도해 주세요.";
  if (code.includes("shop_order_not_confirmable")) return "이미 처리되었거나 확인할 수 없는 주문입니다.";
  if (code.includes("toss_confirm_network_error")) return "결제 승인 서버와 연결되지 않았습니다. 잠시 후 주문 내역에서 상태를 확인해 주세요.";
  if (code.includes("failed_to_finalize_shop_order")) return "결제 승인 후 주문 반영이 지연되고 있습니다. 잠시 후 주문 내역을 다시 확인해 주세요.";
  if (code.includes("missing_toss_secret_key")) return "결제 승인 설정이 아직 완료되지 않았습니다. 관리자에게 확인해 주세요.";
  if (code.includes("confirm_response_mismatch") || code.includes("confirm_amount_mismatch")) {
    return "결제 승인 응답이 주문 정보와 일치하지 않았습니다. 자동 검증 후 다시 시도해 주세요.";
  }
  if (code.startsWith("toss_http_") || code.startsWith("invalid_status_")) {
    return "결제사 승인 단계에서 주문이 완료되지 않았습니다. 카드사 승인 내역과 주문 내역을 함께 확인해 주세요.";
  }
  return "결제 승인에 실패했습니다. 잠시 후 주문 내역에서 상태를 다시 확인해 주세요.";
}

export function ShopCheckoutSuccessPage() {
  const { t } = useI18n();
  const params = useSearchParams();
  const { status } = useAuthState();
  const paymentKey = params.get("paymentKey") ?? "";
  const orderId = params.get("orderId") ?? "";
  const amount = params.get("amount") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const requestedRef = useRef(false);

  const parsedAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? Math.round(n) : null;
  }, [amount]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      setLoading(false);
      setError("로그인이 필요합니다.");
      return;
    }
    if (!paymentKey || !orderId || parsedAmount == null) {
      setLoading(false);
      setError("결제 승인 파라미터가 올바르지 않습니다.");
      return;
    }
    if (requestedRef.current) return;
    requestedRef.current = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/orders/confirm", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: parsedAmount,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok || !json?.data) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setResult(json.data as ConfirmResult);
      } catch (caught: any) {
        setError(humanizeConfirmError(String(caught?.message ?? "failed_to_confirm_shop_order")));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status, paymentKey, orderId, parsedAmount]);

  const bundleOrders = result && result.mode === "bundle" && Array.isArray(result.orders) ? result.orders : [];

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="rounded-[24px] border border-ios-sep bg-white p-6">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("주문 결과")}</div>

        {loading ? <div className="mt-3 text-[13px] text-ios-sub">{t("결제 승인 처리 중입니다...")}</div> : null}
        {!loading && error ? (
          <>
            <div className="mt-3 text-[14px] font-semibold text-red-600">{t("승인 실패")}</div>
            <div className="mt-1 text-[12.5px] leading-6 text-ios-sub">{error}</div>
          </>
        ) : null}

        {!loading && !error && result?.mode === "single" ? (
          <>
            <div className="rnest-chip-accent mt-3 inline-flex px-3 py-1 text-[12px]">{t("주문 완료")}</div>
            <div className="mt-4 rounded-[18px] border border-ios-sep bg-[#F7F7FA] p-4">
              <div className="text-[13px] text-ios-sub">{t("주문 상품")}</div>
              <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{result.order.productSnapshot.name}</div>
              <div className="mt-2 text-[12.5px] text-ios-sub">{t("수량")}: {result.order.productSnapshot.quantity}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("상품 금액")}: {Math.round(result.order.subtotalKrw).toLocaleString("ko-KR")}원</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">
                {t("배송비")}: {result.order.shippingFeeKrw > 0 ? `${Math.round(result.order.shippingFeeKrw).toLocaleString("ko-KR")}원` : t("무료")}
              </div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("결제 금액")}: {Math.round(result.order.amount).toLocaleString("ko-KR")}원</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("승인 시각")}: {formatDateLabel(result.order.approvedAt)}</div>
            </div>
          </>
        ) : null}

        {!loading && !error && result?.mode === "bundle" ? (
          <>
            <div className="rnest-chip-accent mt-3 inline-flex px-3 py-1 text-[12px]">{t("묶음 주문 완료")}</div>
            <div className="mt-4 rounded-[18px] border border-ios-sep bg-[#F7F7FA] p-4">
              <div className="text-[13px] text-ios-sub">{t("결제 묶음")}</div>
              <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{result.bundle.displayName}</div>
              <div className="mt-2 text-[12.5px] text-ios-sub">
                {t("상품 종류")}: {result.bundle.itemCount}종 · {t("총 수량")}: {result.bundle.totalQuantity}개
              </div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("상품 금액")}: {Math.round(result.bundle.subtotalKrw).toLocaleString("ko-KR")}원</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">
                {t("배송비")}: {result.bundle.shippingFeeKrw > 0 ? `${Math.round(result.bundle.shippingFeeKrw).toLocaleString("ko-KR")}원` : t("무료")}
              </div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("결제 금액")}: {Math.round(result.bundle.amount).toLocaleString("ko-KR")}원</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("승인 시각")}: {formatDateLabel(result.bundle.approvedAt)}</div>
            </div>
            {bundleOrders.length > 0 ? (
              <div className="mt-3 rounded-[18px] border border-ios-sep bg-white p-4">
                <div className="text-[13px] font-semibold text-ios-text">{t("생성된 주문")}</div>
                <div className="mt-2 space-y-2">
                  {bundleOrders.slice(0, 4).map((order) => (
                    <div key={order.orderId} className="rounded-2xl border border-[#dbe4ef] bg-[#f7fafc] px-3 py-3 text-[12px] text-[#44556d]">
                      <div className="font-semibold text-[#11294b]">{order.productSnapshot.name}</div>
                      <div className="mt-1">
                        수량 {order.productSnapshot.quantity} · {Math.round(order.amount).toLocaleString("ko-KR")}원
                      </div>
                    </div>
                  ))}
                  {bundleOrders.length > 4 ? (
                    <div className="text-[11.5px] text-ios-sub">{t("나머지 주문은 주문 내역에서 바로 확인할 수 있습니다.")}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/shop/orders" className={`h-10 px-5 text-[13px] ${SHOP_BUTTON_PRIMARY}`}>
            {t("주문 내역 보기")}
          </Link>
          <Link href="/shop" className={`h-10 px-5 text-[13px] ${SHOP_BUTTON_SECONDARY}`}>
            {t("쇼핑으로 돌아가기")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ShopCheckoutSuccessPage;
