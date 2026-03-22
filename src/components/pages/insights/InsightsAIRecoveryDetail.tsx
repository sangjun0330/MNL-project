"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AIRecoveryLoadingOverlay } from "@/components/insights/AIRecoveryLoadingOverlay";
import { useAIRecoverySession } from "@/components/insights/useAIRecoverySession";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { getAIRecoverySlotLabel, type AIRecoveryCandidate, type AIRecoverySlot } from "@/lib/aiRecovery";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

function PaywallNotice() {
  return (
    <DetailCard className="p-6">
      <div className="text-[18px] font-bold text-ios-text">AI 맞춤회복은 Plus 또는 Pro에서 사용할 수 있어요.</div>
      <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 해설과 AI 오더는 유료 플랜에서 만들 수 있어요.</p>
      <div className="mt-5 flex gap-2">
        <Link
          href="/settings/billing/upgrade"
          className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
        >
          플랜 보기
        </Link>
        <Link
          href="/insights/recovery"
          className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
        >
          회복으로 돌아가기
        </Link>
      </div>
    </DetailCard>
  );
}

function ToneChip({ tone }: { tone: "stable" | "noti" | "warning" }) {
  if (tone === "warning") return <DetailChip color={DETAIL_ACCENTS.pink}>주의</DetailChip>;
  if (tone === "noti") return <DetailChip color={DETAIL_ACCENTS.navy}>조절</DetailChip>;
  return <DetailChip color={DETAIL_ACCENTS.mint}>안정</DetailChip>;
}

function CandidateCard({
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
      className={`w-full rounded-[20px] border p-4 text-left transition ${
        selected ? "border-[#315CA8] bg-[#F5F9FF] shadow-apple-sm" : "border-ios-sep bg-white hover:bg-[#FAFBFD]"
      } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold tracking-[-0.02em] text-ios-text">{candidate.title}</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{candidate.why}</p>
        </div>
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold ${
            selected ? "border-[#315CA8] bg-[#315CA8] text-white" : "border-ios-sep bg-white text-ios-sub"
          }`}
        >
          {selected ? "✓" : "+"}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <DetailChip color={selected ? DETAIL_ACCENTS.navy : undefined}>{candidate.minutes}분</DetailChip>
        <DetailChip color={selected ? DETAIL_ACCENTS.navy : undefined}>{candidate.expectedBenefit}</DetailChip>
      </div>
    </button>
  );
}

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const billing = useBillingAccess();
  const { end, recordedDays, syncLabel, todayShift } = useInsightsData();
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
        title={t("AI 맞춤회복")}
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 3일 이상부터 볼 수 있어요.")}
        tone="navy"
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  if (!billing.loading && !billing.hasEntitlement("recoveryPlannerAI")) {
    return (
      <InsightDetailShell
        title={t("AI 맞춤회복")}
        subtitle={formatKoreanDate(end)}
        meta="AI 해설과 AI 오더는 Plus 또는 Pro에서 사용할 수 있어요."
        tone="navy"
        backHref="/insights/recovery"
      >
        <PaywallNotice />
      </InsightDetailShell>
    );
  }

  const response = activeData;
  const currentSession = response?.session ?? null;
  const brief = currentSession?.brief ?? null;
  const maxReached = selectedIds.length >= 5;
  const canRegenerateSession = response?.quota.canGenerateSession ?? !currentSession;
  const canRegenerateOrders = response?.quota.canRegenerateOrders ?? !currentSession;
  const showGeneratingOverlay = Boolean(response?.gate.allowed && (session.generating || (!currentSession && session.loading)));

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
      title={t("AI 맞춤회복")}
      subtitle={formatKoreanDate(end)}
      meta={response?.slotDescription ?? "오늘 기록과 최근 14일 흐름으로 회복 포인트를 정리합니다."}
      tone="navy"
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
          {response?.stale ? <DetailChip color={DETAIL_ACCENTS.pink}>업데이트 필요</DetailChip> : null}
        </>
      }
    >
      {showGeneratingOverlay ? <AIRecoveryLoadingOverlay title="AI 맞춤회복 분석중.." detail="최근 기록을 읽고 회복 해설을 만드는 중이에요." /> : null}

      <DetailCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[#1B2747]">AI CUSTOMIZED RECOVERY</div>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">오늘 회복</div>
            <p className="mt-2 text-[13px] leading-6 text-ios-sub">해설을 보고 오더 후보를 고를 수 있어요.</p>
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
          {response.gate.code === "wake_sleep_required" ? (
            <div className="mt-4">
              <Link
                href="/schedule?openHealthLog=today&focus=sleep"
                className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
              >
                오늘 수면 기록하기
              </Link>
            </div>
          ) : null}
        </DetailCard>
      ) : null}

      {session.loading && !currentSession ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold text-ios-text">준비 중이에요.</div>
          <p className="mt-2 text-[13px] text-ios-sub">저장된 결과를 먼저 확인하고 필요하면 다시 만들어요.</p>
        </DetailCard>
      ) : null}

      {brief ? (
        <>
          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{
              background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <ToneChip tone={brief.tone} />
              {brief.topDrivers.map((item) => (
                <DetailChip key={item} color={DETAIL_ACCENTS.navy}>
                  {item}
                </DetailChip>
              ))}
            </div>
            <div className="mt-4 text-[24px] font-bold tracking-[-0.03em] text-ios-text">{brief.headline}</div>
            <p className="mt-3 break-keep text-[15px] leading-7 text-ios-sub">{brief.summary}</p>
            <div className="mt-4 rounded-[20px] border border-ios-sep bg-[#FAFBFD] p-4">
              <div className="text-[12px] font-semibold text-ios-sub">한 줄 메모</div>
              <div className="mt-2 text-[14px] leading-6 text-ios-text">{brief.weeklyNote}</div>
            </div>
          </DetailCard>

          <DetailCard className="p-5 sm:p-6">
            <div className="text-[12px] font-semibold text-ios-sub">해설</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오늘 포인트</div>
            <div className="mt-4 grid gap-3">
              {brief.sections.map((section) => (
                <div key={section.key} className="rounded-[20px] border border-ios-sep bg-white p-4 shadow-apple-sm">
                  <div className="text-[12px] font-semibold text-ios-sub">{section.title}</div>
                  <div className="mt-2 break-keep text-[14px] leading-6 text-ios-text">{section.body}</div>
                </div>
              ))}
            </div>
          </DetailCard>

          <DetailCard className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ios-sub">후보</div>
                <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오더 후보 고르기</div>
                <p className="mt-2 text-[13px] leading-6 text-ios-sub">1~5개를 고르면 같은 수의 오더를 만들어요.</p>
              </div>
              <DetailChip color={DETAIL_ACCENTS.mint}>{selectedIds.length}개 선택</DetailChip>
            </div>
            <div className="mt-4 grid gap-3">
              {brief.candidateActions.map((candidate) => {
                const selected = selectedIds.includes(candidate.id);
                return (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    selected={selected}
                    disabled={!selected && maxReached}
                    onToggle={() => toggleCandidate(candidate.id)}
                  />
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                className="h-11 px-5"
                disabled={selectedIds.length < 1 || session.savingOrders || session.generating || !canRegenerateOrders}
                onClick={() => void session.regenerateOrders(selectedIds)}
              >
                {session.savingOrders ? "오더 만드는 중…" : "선택으로 오더 만들기"}
              </Button>
              <Link
                href="/insights/recovery/orders"
                className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
              >
                오더 보기
              </Link>
            </div>
            {!canRegenerateOrders ? <p className="mt-3 text-[12px] text-ios-sub">오늘 오더 다시 만들기는 끝났어요.</p> : null}
            {brief.dataGaps.length ? (
              <div className="mt-4 rounded-[18px] border border-ios-sep bg-[#FBFBFD] p-4">
                <div className="text-[12px] font-semibold text-ios-sub">없는 데이터</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {brief.dataGaps.slice(0, 6).map((item) => (
                    <DetailChip key={item}>{item}</DetailChip>
                  ))}
                </div>
              </div>
            ) : null}
          </DetailCard>
        </>
      ) : null}

      {!brief && !session.error && !showGeneratingOverlay && response?.gate.allowed ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">AI 결과를 기다리는 중이에요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">아직 결과가 없으면 다시 만들기를 눌러 주세요.</p>
        </DetailCard>
      ) : null}
    </InsightDetailShell>
  );
}
