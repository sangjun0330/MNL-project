"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient, useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";

type ConfirmResult = {
  order: {
    orderId: string;
    status: string;
    amount: number;
    productSnapshot: {
      name: string;
      quantity: number;
    };
    approvedAt: string | null;
  };
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
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setResult(json.data as ConfirmResult);
      } catch (error: any) {
        setError(String(error?.message ?? "결제 승인에 실패했습니다."));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status, paymentKey, orderId, parsedAmount]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="rounded-[24px] border border-ios-sep bg-white p-6">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("주문 결과")}</div>

        {loading ? <div className="mt-3 text-[13px] text-ios-sub">{t("결제 승인 처리 중입니다...")}</div> : null}
        {!loading && error ? (
          <>
            <div className="mt-3 text-[14px] font-semibold text-red-600">{t("승인 실패")}</div>
            <div className="mt-1 text-[12.5px] break-all text-ios-sub">{error}</div>
          </>
        ) : null}

        {!loading && !error && result ? (
          <>
            <div className="rnest-chip-accent mt-3 inline-flex px-3 py-1 text-[12px]">{t("주문 완료")}</div>
            <div className="mt-4 rounded-[18px] border border-ios-sep bg-[#F7F7FA] p-4">
              <div className="text-[13px] text-ios-sub">{t("주문 상품")}</div>
              <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{result.order.productSnapshot.name}</div>
              <div className="mt-2 text-[12.5px] text-ios-sub">{t("수량")}: {result.order.productSnapshot.quantity}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("결제 금액")}: {Math.round(result.order.amount).toLocaleString("ko-KR")}원</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("승인 시각")}: {formatDateLabel(result.order.approvedAt)}</div>
            </div>
          </>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Link href="/shop" className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-5 text-[13px] font-semibold text-white">
            {t("쇼핑으로 돌아가기")}
          </Link>
          <Link href="/insights/recovery" className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-5 text-[13px] font-semibold text-[#11294b]">
            {t("AI 회복 보기")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ShopCheckoutSuccessPage;
