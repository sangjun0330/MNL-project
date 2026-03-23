"use client";

import Link from "next/link";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AIRecoveryLoadingOverlay } from "@/components/insights/AIRecoveryLoadingOverlay";
import { useAIRecoverySession } from "@/components/insights/useAIRecoverySession";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { Button } from "@/components/ui/Button";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, shiftKo, useInsightsData } from "@/components/insights/useInsightsData";
import type { AIRecoveryOrder, AIRecoverySlot } from "@/lib/aiRecovery";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

function OrderCard({
  order,
  checked,
  busy,
  onToggle,
}: {
  order: AIRecoveryOrder;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const chips = Array.isArray((order as any).chips) ? ((order as any).chips as string[]) : [];

  return (
    <DetailCard
      className="overflow-hidden px-5 py-5 sm:px-6"
      style={{
        background:
          "radial-gradient(circle at top right, rgba(173,196,255,0.14), transparent 30%), linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 36px rgba(15,36,74,0.05)",
      }}
    >
      <div className="flex items-start gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold ${
            checked ? "border-[#1B2747] bg-[#1B2747] text-white" : "border-[#1B2747] bg-white text-[#1B2747]"
          } ${busy ? "opacity-50" : ""}`}
        >
          {checked ? "✓" : ""}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DetailChip color={DETAIL_ACCENTS.navy}>{(order as any).when ?? "지금"}</DetailChip>
            {chips.slice(0, 3).map((chip) => (
              <DetailChip key={chip} color={checked ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.navy}>
                {chip}
              </DetailChip>
            ))}
          </div>
          <div className="mt-3 break-keep text-[18px] font-bold leading-[1.55] tracking-[-0.03em] text-ios-text">{order.title}</div>
          <p className="mt-2 break-keep text-[14px] leading-7 text-ios-text">{(order as any).body}</p>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{(order as any).reason}</p>
        </div>
      </div>
    </DetailCard>
  );
}

function PaywallNotice() {
  return (
    <DetailCard className="p-6">
      <div className="text-[18px] font-bold text-ios-text">AI 오더는 Plus 또는 Pro에서 사용할 수 있어요.</div>
      <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 회복 결과를 바로 실행 가능한 체크리스트로 보여줘요.</p>
      <div className="mt-5 flex gap-2">
        <Link
          href="/settings/billing/upgrade"
          className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
        >
          플랜 보기
        </Link>
        <Link
          href="/insights/recovery/ai"
          className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
        >
          AI 회복 보기
        </Link>
      </div>
    </DetailCard>
  );
}

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const billing = useBillingAccess();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift } = useInsightsData();
  const planner = useRecoveryPlanner();
  const slot: AIRecoverySlot = "wake";
  const session = useAIRecoverySession({
    dateISO: end,
    slot,
    autoGenerate: false,
    enabled: !isInsightsLocked(recordedDays) && billing.hasEntitlement("recoveryPlannerAI"),
  });
  const activeData = session.data?.slot === slot && session.data?.dateISO === end ? session.data : null;

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell title="오늘의 오더" subtitle={formatKoreanDate(end)} meta={t("건강 기록 3일 이상부터 볼 수 있어요.")} backHref="/insights/recovery">
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  if (!billing.loading && !billing.hasEntitlement("recoveryPlannerAI")) {
    return (
      <InsightDetailShell title="오늘의 오더" subtitle={formatKoreanDate(end)} meta="AI 오더는 Plus 또는 Pro에서 사용할 수 있어요." backHref="/insights/recovery">
        <PaywallNotice />
      </InsightDetailShell>
    );
  }

  const response = activeData;
  const currentSession = response?.session ?? null;
  const ordersPayload = currentSession?.orders ?? null;
  const orders = ordersPayload?.items ?? [];
  const canRegenerateOrders = response?.quota.canRegenerateOrders ?? !currentSession;
  const showGeneratingOverlay = Boolean(response?.gate.allowed && session.savingOrders);

  return (
    <InsightDetailShell
      title="오늘의 오더"
      subtitle={formatKoreanDate(end)}
      meta={response?.slotDescription ?? "바로 실행할 체크리스트를 보여줍니다."}
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      <AIRecoveryLoadingOverlay mode="orders" open={showGeneratingOverlay} />

      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">TODAY ORDERS</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">오늘의 오더 체크리스트</div>
            <p className="mt-2 text-[13px] leading-6 text-ios-sub">
              {currentSession ? "타이밍과 이유가 붙은 실행 문장으로 바로 확인할 수 있어요." : "AI 호출은 해설 페이지의 만들기 버튼에서만 시작됩니다."}
            </p>
          </div>
          {currentSession ? (
            <Button variant="secondary" className="h-11 px-5" disabled={session.savingOrders || billing.loading || !canRegenerateOrders} onClick={() => void session.regenerateOrders()}>
              {session.savingOrders ? "만드는 중…" : "오더 다시 만들기"}
            </Button>
          ) : (
            <Link
              href="/insights/recovery/ai"
              className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
            >
              해설 만들러 가기
            </Link>
          )}
        </div>
        {currentSession && !canRegenerateOrders ? <p className="text-[12px] text-ios-sub">오늘 오더 다시 만들기는 끝났어요.</p> : null}
      </DetailCard>

      {session.error ? (
        <DetailCard className="border-[#F2C4CC] bg-[#FFF7F8] p-5">
          <div className="text-[14px] font-semibold text-[#9B2C3F]">불러오지 못했어요.</div>
          <div className="mt-1 text-[13px] text-[#7A4C55]">{session.error}</div>
        </DetailCard>
      ) : null}

      {response && !response.gate.allowed ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">지금은 만들 수 없어요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{response.gate.message}</p>
        </DetailCard>
      ) : null}

      {ordersPayload ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[12px] font-semibold text-ios-sub">{ordersPayload.title ?? "오늘의 오더"}</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{ordersPayload.headline}</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{ordersPayload.summary}</p>
        </DetailCard>
      ) : null}

      {orders.length ? (
        <div className="grid gap-3">
          {orders.map((order) => {
            const checked = response?.completions?.includes(order.id) ?? false;
            return <OrderCard key={order.id} order={order} checked={checked} busy={session.togglingCompletion === order.id} onToggle={() => void session.toggleCompletion(order.id, !checked)} />;
          })}
        </div>
      ) : session.loading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold text-ios-text">준비 중이에요.</div>
          <p className="mt-2 text-[13px] text-ios-sub">저장된 결과를 먼저 확인하고 필요하면 다시 만들어요.</p>
        </DetailCard>
      ) : !session.error && response?.gate.allowed ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">아직 AI 오더가 없어요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 맞춤회복 페이지에서 만들기를 눌러 해설을 먼저 생성해 주세요.</p>
        </DetailCard>
      ) : null}
    </InsightDetailShell>
  );
}
