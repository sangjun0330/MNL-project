"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AIRecoveryLoadingOverlay } from "@/components/insights/AIRecoveryLoadingOverlay";
import { useAIRecoverySession } from "@/components/insights/useAIRecoverySession";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, shiftKo, useInsightsData } from "@/components/insights/useInsightsData";
import { getAIRecoverySlotLabel, type AIRecoveryCandidate, type AIRecoveryOrder, type AIRecoverySlot } from "@/lib/aiRecovery";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

function OrderCandidateToggle({
  candidate,
  selected,
  disabled,
  onToggle,
}: {
  candidate: AIRecoveryCandidate;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`rounded-full border px-3 py-2 text-[12px] font-semibold transition ${
        selected ? "border-[#315CA8] bg-[#F5F9FF] text-[#315CA8]" : "border-ios-sep bg-white text-ios-sub"
      } ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-[#FAFBFD]"}`}
    >
      {candidate.title}
    </button>
  );
}

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
            <DetailChip color={checked ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.navy}>{order.minutes}분</DetailChip>
            <DetailChip color={DETAIL_ACCENTS.navy}>{order.executionWindow}</DetailChip>
          </div>
          <div className="mt-3 break-keep text-[18px] font-bold leading-[1.55] tracking-[-0.03em] text-ios-text">{order.title}</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{order.whyNow}</p>
          <div className="mt-4 space-y-2">
            {order.steps.map((step, index) => (
              <div key={`${order.id}:${index}`} className="flex items-start gap-2 text-[13px] leading-6 text-ios-text">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EEF3FF] text-[11px] font-semibold text-[#315CA8]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 rounded-[18px] border border-ios-sep bg-white/70 p-3 text-[12px] leading-5 text-ios-sub">
            <div>
              <span className="font-semibold text-ios-text">완료 기준</span> {order.successCheck}
            </div>
            <div>
              <span className="font-semibold text-ios-text">피하기</span> {order.avoid}
            </div>
            <div>
              <span className="font-semibold text-ios-text">근무 힌트</span> {order.workHint}
            </div>
          </div>
        </div>
      </div>
    </DetailCard>
  );
}

function PaywallNotice() {
  return (
    <DetailCard className="p-6">
      <div className="text-[18px] font-bold text-ios-text">AI 오더는 Plus 또는 Pro에서 사용할 수 있어요.</div>
      <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 회복 후보를 바로 실행할 오더로 바꿔 줘요.</p>
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
  const [slot, setSlot] = useState<AIRecoverySlot>("wake");
  const session = useAIRecoverySession({
    dateISO: end,
    slot,
    autoGenerate: true,
    enabled: !isInsightsLocked(recordedDays) && billing.hasEntitlement("recoveryPlannerAI"),
  });
  const activeData = session.data?.slot === slot && session.data?.dateISO === end ? session.data : null;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const sessionSelectedIds = useMemo(() => activeData?.session?.selection?.selectedCandidateIds ?? [], [activeData?.session?.selection?.selectedCandidateIds]);
  const sessionDefaultIds = useMemo(() => activeData?.session?.brief?.defaultSelectionIds ?? [], [activeData?.session?.brief?.defaultSelectionIds]);
  const selectedSeed = sessionSelectedIds.join("|");
  const defaultSeed = sessionDefaultIds.join("|");

  useEffect(() => {
    const nextSelected = sessionSelectedIds.length ? sessionSelectedIds : sessionDefaultIds;
    setSelectedIds(nextSelected);
  }, [activeData?.session?.generatedAt, activeData?.session?.selection?.updatedAt, defaultSeed, selectedSeed, sessionDefaultIds, sessionSelectedIds, slot]);

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="오늘의 오더"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 볼 수 있어요.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  if (!billing.loading && !billing.hasEntitlement("recoveryPlannerAI")) {
    return (
      <InsightDetailShell
        title="오늘의 오더"
        subtitle={formatKoreanDate(end)}
        meta="AI 오더는 Plus 또는 Pro에서 사용할 수 있어요."
        backHref="/insights/recovery"
      >
        <PaywallNotice />
      </InsightDetailShell>
    );
  }

  const response = activeData;
  const currentSession = response?.session ?? null;
  const brief = currentSession?.brief ?? null;
  const orders = currentSession?.orders ?? [];
  const maxReached = selectedIds.length >= 5;
  const canRegenerateSession = response?.quota.canGenerateSession ?? !currentSession;
  const canRegenerateOrders = response?.quota.canRegenerateOrders ?? !currentSession;
  const showGeneratingOverlay = Boolean(
    response?.gate.allowed &&
      (session.generating || session.savingOrders || (!currentSession && session.loading))
  );

  const toggleCandidate = (candidateId: string) => {
    setSelectedIds((current) => {
      if (current.includes(candidateId)) {
        return current.length <= 1 ? current : current.filter((item) => item !== candidateId);
      }
      if (current.length >= 5) return current;
      return [...current, candidateId];
    });
  };

  return (
    <InsightDetailShell
      title="오늘의 오더"
      subtitle={formatKoreanDate(end)}
      meta={response?.slotDescription ?? "선택한 후보를 바로 할 수 있는 오더로 바꿔 줍니다."}
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      {showGeneratingOverlay ? (
        <AIRecoveryLoadingOverlay
          title={currentSession ? "AI 오더 정리중.." : "AI 맞춤회복 분석중.."}
          detail={currentSession ? "고른 후보를 오더로 바꾸는 중이에요." : "먼저 AI 해설을 만드는 중이에요."}
        />
      ) : null}

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
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">선택한 후보로 오더 만들기</div>
            <p className="mt-2 text-[13px] leading-6 text-ios-sub">고른 후보만 다시 오더로 만들 수 있어요.</p>
          </div>
          <Button
            variant="secondary"
            className="h-11 px-5"
            disabled={session.generating || billing.loading || (Boolean(currentSession) && !canRegenerateSession)}
            onClick={() => void session.generate(true)}
          >
            {session.generating ? "만드는 중…" : currentSession ? "다시 만들기" : "만들기"}
          </Button>
        </div>
        {currentSession && !canRegenerateSession ? <p className="text-[12px] text-ios-sub">오늘 해설 다시 만들기는 끝났어요.</p> : null}
        <div className="mt-4">
          <Segmented
            value={slot}
            onValueChange={(value) => setSlot(value)}
            options={[
              { value: "wake", label: getAIRecoverySlotLabel("wake", todayShift) },
              { value: "postShift", label: getAIRecoverySlotLabel("postShift", todayShift) },
            ]}
          />
        </div>
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

      {brief ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold text-ios-sub">후보</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오더 다시 고르기</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">1~5개를 골라 다시 만들 수 있어요.</p>
            </div>
            <DetailChip color={DETAIL_ACCENTS.mint}>{selectedIds.length}개 선택</DetailChip>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {brief.candidateActions.map((candidate) => (
              <OrderCandidateToggle
                key={candidate.id}
                candidate={candidate}
                selected={selectedIds.includes(candidate.id)}
                disabled={!selectedIds.includes(candidate.id) && maxReached}
                onToggle={() => toggleCandidate(candidate.id)}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="h-11 px-5"
              disabled={selectedIds.length < 1 || session.savingOrders || !canRegenerateOrders}
              onClick={() => void session.regenerateOrders(selectedIds)}
            >
              {session.savingOrders ? "오더 만드는 중…" : "선택으로 다시 만들기"}
            </Button>
            <Link
              href="/insights/recovery/ai"
              className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
            >
              AI 회복 보기
            </Link>
          </div>
          {!canRegenerateOrders ? <p className="mt-3 text-[12px] text-ios-sub">오늘 오더 다시 만들기는 끝났어요.</p> : null}
        </DetailCard>
      ) : null}

      {orders.length ? (
        <div className="grid gap-3">
          {orders.map((order) => {
            const checked = response?.completions.includes(order.id) ?? false;
            return (
              <OrderCard
                key={order.id}
                order={order}
                checked={checked}
                busy={session.togglingCompletion === order.id}
                onToggle={() => void session.toggleCompletion(order.id, !checked)}
              />
            );
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
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">먼저 AI 맞춤회복을 만들거나 다시 시도해 주세요.</p>
        </DetailCard>
      ) : null}
    </InsightDetailShell>
  );
}
