"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatKrw, getPlanDefinition } from "@/lib/billing/plans";
import {
  fetchSubscriptionSnapshot,
  formatDateLabel,
  statusLabel,
  subscriptionStatusLabel,
  type SubscriptionResponse,
  authHeaders,
} from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";

type CancelMode = "period_end" | "resume" | "now_refund";

function orderStatusTone(status: string) {
  if (status === "DONE") return "text-[#0B7A3E]";
  if (status === "FAILED") return "text-[#B3261E]";
  if (status === "CANCELED") return "text-[#6B7280]";
  return "text-ios-sub";
}

export function SettingsBillingPage() {
  const { status, user } = useAuthState();
  const [loading, setLoading] = useState(true);
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<CancelMode | null>(null);

  const loadSubscription = useCallback(async () => {
    if (!user?.userId) {
      setSubData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSubscriptionSnapshot();
      setSubData(data);
    } catch (e: any) {
      setError(String(e?.message ?? "구독 정보를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [user?.userId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const subscription = subData?.subscription ?? null;
  const activeTier = subscription?.tier ?? "free";
  const hasPaidAccess = Boolean(subscription?.hasPaidAccess);
  const latestRefundableOrder = useMemo(
    () => (subData?.orders ?? []).find((o) => o.status === "DONE" && !!o.paymentKey) ?? null,
    [subData?.orders]
  );

  const submitCancel = useCallback(
    async (mode: CancelMode) => {
      if (!user?.userId || actionLoading) return;

      let reason = "사용자 요청";
      if (mode === "period_end") {
        const confirmed = window.confirm("현재 기간이 끝나면 Free 플랜으로 전환할까요?");
        if (!confirmed) return;
      }
      if (mode === "resume") {
        const confirmed = window.confirm("예약된 해지를 취소하고 현재 플랜을 유지할까요?");
        if (!confirmed) return;
      }
      if (mode === "now_refund") {
        const confirmed = window.confirm(
          "즉시 해지 및 환불을 진행할까요?\n환불 성공 시 지금 바로 Free 플랜으로 전환됩니다."
        );
        if (!confirmed) return;
        const entered = window.prompt("환불 사유를 입력해 주세요.", "사용자 요청");
        if (entered === null) return;
        reason = entered.trim() || "사용자 요청";
      }

      setActionLoading(mode);
      setActionError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/billing/cancel", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: JSON.stringify({
            mode,
            reason,
            orderId: mode === "now_refund" ? latestRefundableOrder?.orderId ?? undefined : undefined,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        await loadSubscription();
      } catch (e: any) {
        setActionError(String(e?.message ?? "구독 처리에 실패했습니다."));
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, latestRefundableOrder?.orderId, loadSubscription, user?.userId]
  );

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">구독</div>
      </div>

      {status !== "authenticated" ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요해요</div>
          <p className="mt-2 text-[13px] text-ios-sub">구독 결제와 플랜 적용은 로그인 후 사용할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="mt-4 rounded-full bg-black px-4 py-2 text-[13px] font-semibold text-white"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          <section className="rounded-[28px] border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[13px] font-semibold text-ios-sub">현재 플랜</div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-[42px] font-extrabold tracking-[-0.03em] text-ios-text">
                {getPlanDefinition(activeTier).title}
              </div>
              {hasPaidAccess ? (
                <div className="rounded-full border border-[#007AFF30] bg-[#007AFF10] px-3 py-1 text-[12px] font-semibold text-[#007AFF]">
                  유료 이용 중
                </div>
              ) : (
                <div className="rounded-full border border-ios-sep bg-ios-bg px-3 py-1 text-[12px] font-semibold text-ios-sub">
                  무료 플랜
                </div>
              )}
            </div>
            <div className="mt-2 text-[13px] text-ios-sub">
              상태: {subscriptionStatusLabel(subscription?.status ?? "inactive")}
              {" · "}
              만료일: {formatDateLabel(subscription?.currentPeriodEnd ?? null)}
            </div>

            {subscription?.cancelAtPeriodEnd ? (
              <div className="mt-3 rounded-2xl border border-[#EAB30855] bg-[#FEF9C3] px-3 py-2 text-[12.5px] text-[#7C5E10]">
                기간 종료 해지 예약됨 · {formatDateLabel(subscription.cancelScheduledAt)}
              </div>
            ) : null}

            <div className="mt-4 border-t border-ios-sep pt-4">
              <div className="text-[13px] font-semibold text-ios-sub">결제 정보</div>
              <div className="mt-2 rounded-2xl border border-ios-sep bg-ios-bg px-3 py-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ios-sub">현재 요금</span>
                  <span className="font-semibold text-ios-text">
                    {activeTier === "free" ? "무료" : `${formatKrw(getPlanDefinition(activeTier).priceKrw)} / 30일`}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span className="text-ios-sub">결제 수단</span>
                  <span className="font-semibold text-ios-text">TossPayments 카드</span>
                </div>
              </div>
            </div>

            {hasPaidAccess ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() => void submitCancel(subscription?.cancelAtPeriodEnd ? "resume" : "period_end")}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[13px] font-semibold text-ios-text transition hover:bg-ios-bg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {subscription?.cancelAtPeriodEnd ? "해지 예약 취소" : "기간 종료 시 해지 (권장)"}
                </button>
                <button
                  type="button"
                  disabled={actionLoading !== null || !latestRefundableOrder}
                  onClick={() => void submitCancel("now_refund")}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-black px-4 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-black/40"
                >
                  즉시 해지 및 환불
                </button>
              </div>
            ) : null}

            {hasPaidAccess ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-ios-muted">
                기간 종료 해지는 서비스는 만료일까지 유지되고 자동으로 Free 전환됩니다. 즉시 해지는 환불 성공 즉시 Free로 바뀝니다.
              </p>
            ) : null}

            <div className="mt-4 text-center">
              <Link
                href="/settings/billing/upgrade"
                className="text-[13px] font-semibold text-ios-sub underline-offset-4 transition hover:underline hover:text-ios-text"
              >
                플랜 업그레이드하기
              </Link>
            </div>

            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
            {actionError ? <div className="mt-2 text-[12px] text-red-600">{actionError}</div> : null}
          </section>

          <section className="mt-4 rounded-[28px] border border-ios-sep bg-white p-5 shadow-apple">
            <div className="text-[15px] font-bold text-ios-text">최근 결제 이력</div>
            {loading ? (
              <div className="mt-3 text-[12.5px] text-ios-muted">불러오는 중...</div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {(subData?.orders ?? []).length === 0 ? (
                  <div className="text-[12.5px] text-ios-muted">결제 이력이 아직 없습니다.</div>
                ) : (
                  (subData?.orders ?? []).map((order) => (
                    <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[14px] font-semibold text-ios-text">{order.orderName}</div>
                        <div className={`text-[11.5px] font-semibold ${orderStatusTone(order.status)}`}>
                          {statusLabel(order.status)}
                        </div>
                      </div>
                      <div className="mt-1 text-[12px] text-ios-sub">
                        {formatDateLabel(order.createdAt)} · {formatKrw(order.amount)}
                      </div>
                      <div className="mt-0.5 break-all text-[11.5px] text-ios-muted">{order.orderId}</div>
                      {order.failMessage ? <div className="mt-1 text-[11.5px] text-red-600">{order.failMessage}</div> : null}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SettingsBillingPage;
