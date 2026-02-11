"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient, useAuthState } from "@/lib/auth";
import { formatKrw, getPlanDefinition, type PlanTier } from "@/lib/billing/plans";

type ConfirmResult = {
  order: {
    orderId: string;
    planTier: PlanTier;
    amount: number;
    status: "READY" | "DONE" | "FAILED" | "CANCELED";
    approvedAt: string | null;
  } | null;
  subscription: {
    tier: PlanTier;
    status: "inactive" | "active" | "expired";
    currentPeriodEnd: string | null;
  } | null;
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
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function SettingsBillingSuccessPage() {
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
        const res = await fetch("/api/billing/confirm", {
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
      } catch (e: any) {
        setError(String(e?.message ?? "결제 승인에 실패했습니다."));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status, paymentKey, orderId, parsedAmount]);

  const planTier = result?.subscription?.tier ?? result?.order?.planTier ?? "free";

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="rounded-apple border border-ios-sep bg-white p-6 shadow-apple">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">결제 결과</div>

        {loading ? <div className="mt-3 text-[13px] text-ios-sub">결제 승인 처리 중입니다...</div> : null}

        {!loading && error ? (
          <>
            <div className="mt-3 text-[14px] font-semibold text-red-600">승인 실패</div>
            <div className="mt-1 text-[12.5px] text-ios-sub break-all">{error}</div>
            <div className="mt-3 text-[12px] text-ios-muted">orderId: {orderId}</div>
          </>
        ) : null}

        {!loading && !error && result ? (
          <>
            <div className="mt-3 inline-flex rounded-full border border-[#007AFF44] bg-[#007AFF10] px-3 py-1 text-[12px] font-semibold text-[#007AFF]">
              결제 완료
            </div>

            <div className="mt-4 rounded-2xl border border-ios-sep bg-ios-bg p-4">
              <div className="text-[13px] text-ios-sub">적용 플랜</div>
              <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{getPlanDefinition(planTier).title}</div>
              <div className="mt-2 text-[12.5px] text-ios-sub">
                결제 금액: {formatKrw(result.order?.amount ?? parsedAmount ?? 0)}
              </div>
              <div className="mt-1 text-[12.5px] text-ios-sub">
                만료일: {formatDateLabel(result.subscription?.currentPeriodEnd ?? null)}
              </div>
              <div className="mt-1 text-[11.5px] text-ios-muted break-all">orderId: {result.order?.orderId ?? orderId}</div>
            </div>
          </>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Link
            href="/settings/billing"
            className="inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
          >
            구독으로 돌아가기
          </Link>
          <Link
            href="/insights"
            className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
          >
            인사이트 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SettingsBillingSuccessPage;
