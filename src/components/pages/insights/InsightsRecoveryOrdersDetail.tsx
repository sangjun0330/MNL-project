"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import {
  RecoveryChecklistItemCard,
  RecoveryHeroFact,
  RecoveryOrderCountSelector,
  RecoveryPhaseTabs,
  RecoveryStageHeroCard,
} from "@/components/insights/RecoveryPlannerFlowCards";
import { RecoveryPlannerUpgradeCard } from "@/components/insights/RecoveryPlannerUpgradeCard";
import { useAIRecoveryPlanner } from "@/components/insights/useAIRecoveryPlanner";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { buildFallbackModules } from "@/lib/aiRecoveryPlanner";
import { formatKoreanDate } from "@/lib/date";
import {
  clearStaleRecoveryOrderDone,
  markRecoveryOrderDone,
  readRemoteRecoveryOrderDone,
  readRecoveryOrderDone,
  writeRecoveryOrderDone,
  writeRemoteRecoveryOrderDone,
} from "@/lib/recoveryOrderChecklist";
import {
  buildAfterWorkMissingLabels,
  buildRecoveryOrderProgressId,
  getAfterWorkReadiness,
  normalizeRecoveryPhase,
  recoveryPhaseEyebrow,
} from "@/lib/recoveryPhases";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";
import { withReturnTo } from "@/lib/navigation";

function normalizeRequestedOrderCountParam(value: string | null) {
  if (value == null || String(value).trim() === "") return 3;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, parsed));
}

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { end, recordedDays, syncLabel, todayShift, hasTodayShift, state } = useInsightsData();
  const planner = useRecoveryPlanner();
  const startPlanner = useAIRecoveryPlanner({
    mode: "cache",
    enabled: planner.aiAvailable && !isInsightsLocked(recordedDays),
    phase: "start",
  });
  const afterPlanner = useAIRecoveryPlanner({
    mode: "cache",
    enabled: planner.aiAvailable && !isInsightsLocked(recordedDays),
    phase: "after_work",
  });
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [completingIds, setCompletingIds] = useState<Record<string, boolean>>({});
  const initialOrderCount = normalizeRequestedOrderCountParam(searchParams.get("orderCount"));
  const [selectedOrderCount, setSelectedOrderCount] = useState(initialOrderCount);
  const preferredPhase = normalizeRecoveryPhase(searchParams.get("phase"));
  const [activePhase, setActivePhase] = useState<"start" | "after_work">(preferredPhase);
  const completionTimersRef = useRef<number[]>([]);
  const afterWorkReadiness = getAfterWorkReadiness(state, end);
  const afterWorkMissingLabels = buildAfterWorkMissingLabels(afterWorkReadiness.recordedLabels);

  useEffect(() => {
    setActivePhase(preferredPhase);
  }, [preferredPhase]);

  useEffect(() => {
    setSelectedOrderCount(initialOrderCount);
  }, [initialOrderCount]);

  useEffect(() => {
    return () => {
      for (const timer of completionTimersRef.current) {
        window.clearTimeout(timer);
      }
      completionTimersRef.current = [];
    };
  }, []);

  const fallback = buildFallbackModules({
    language: "ko",
    plannerContext: {
      focusFactor: planner.focusFactor,
      primaryAction: planner.primaryAction,
      avoidAction: planner.avoidAction,
      nextDuty: planner.nextDuty,
      nextDutyDate: planner.nextDutyDate,
      plannerTone: planner.tone,
      ordersTop3: planner.ordersTop3,
    },
    nextDutyLabel: planner.nextDutyLabel,
    timelinePreview: planner.timelinePreview,
  });

  const plannerDateISO = startPlanner.data?.dateISO ?? afterPlanner.data?.dateISO ?? end;
  const startOrdersModule = startPlanner.data?.result.orders ?? null;
  const afterOrdersModule = afterPlanner.data?.result.orders ?? null;
  const progressIdsKey = [
    ...(startPlanner.data?.result.orders.items.map((item) => buildRecoveryOrderProgressId("start", item.id)) ?? []),
    ...(afterPlanner.data?.result.orders.items.map((item) => buildRecoveryOrderProgressId("after_work", item.id)) ?? []),
  ].join("|");

  useEffect(() => {
    let active = true;
    const activeIds = progressIdsKey ? progressIdsKey.split("|") : [];
    if (activeIds.length) {
      clearStaleRecoveryOrderDone(plannerDateISO, activeIds);
    }
    const localDone = readRecoveryOrderDone(plannerDateISO);
    setDoneMap(localDone);

    if (!activeIds.length) {
      return () => {
        active = false;
      };
    }

    void (async () => {
      const remoteDone = await readRemoteRecoveryOrderDone(plannerDateISO);
      if (!active) return;
      const keep = new Set(activeIds);
      const merged: Record<string, boolean> = {};
      for (const [id, done] of Object.entries({ ...remoteDone, ...localDone })) {
        if (done && keep.has(id)) merged[id] = true;
      }
      setDoneMap(merged);
      writeRecoveryOrderDone(plannerDateISO, merged);
      const mergedKeys = JSON.stringify(Object.keys(merged).sort());
      const remoteKeys = JSON.stringify(Object.keys(remoteDone).filter((id) => remoteDone[id]).sort());
      if (mergedKeys !== remoteKeys) {
        await writeRemoteRecoveryOrderDone(plannerDateISO, merged);
      }
    })();

    return () => {
      active = false;
    };
  }, [plannerDateISO, progressIdsKey]);

  const startOrders = startOrdersModule?.items ?? [];
  const afterOrders = afterOrdersModule?.items ?? [];
  const activeStartItems = startOrders.filter((item) => !doneMap[buildRecoveryOrderProgressId("start", item.id)]);
  const activeAfterItems = afterOrders.filter((item) => !doneMap[buildRecoveryOrderProgressId("after_work", item.id)]);
  const totalOrdersCount = startOrders.length + afterOrders.length;
  const completedCount = totalOrdersCount - activeStartItems.length - activeAfterItems.length;
  const activeItems = activePhase === "start" ? activeStartItems : activeAfterItems;
  const phaseHeadline =
    activePhase === "start"
      ? startOrdersModule?.items[0]?.title ?? startOrdersModule?.headline ?? "아침 회복에 맞춘 오더를 생성해요."
      : afterOrdersModule?.items[0]?.title ?? afterOrdersModule?.headline ?? "퇴근 후 회복에 맞춘 오더를 생성해요.";
  const phaseSummary =
    activePhase === "start"
      ? startOrdersModule?.items[0]?.body ?? startOrdersModule?.summary ?? "아침에는 바로 실행할 수 있는 스타터 오더만 간단히 정리합니다."
      : afterOrdersModule?.items[0]?.body ?? afterOrdersModule?.summary ?? "퇴근 후 회복에 맞춰 오더를 이어서 정리합니다.";

  const completeItem = (phase: "start" | "after_work", id: string) => {
    const progressId = buildRecoveryOrderProgressId(phase, id);
    if (doneMap[progressId] || completingIds[progressId]) return;
    setCompletingIds((current) => ({
      ...current,
      [progressId]: true,
    }));
    const timer = window.setTimeout(() => {
      markRecoveryOrderDone(plannerDateISO, progressId);
      setDoneMap((current) => {
        const next = {
          ...current,
          [progressId]: true,
        };
        void writeRemoteRecoveryOrderDone(plannerDateISO, next);
        return next;
      });
      setCompletingIds((current) => {
        const next = { ...current };
        delete next[progressId];
        return next;
      });
      completionTimersRef.current = completionTimersRef.current.filter((value) => value !== timer);
    }, 420);
    completionTimersRef.current.push(timer);
  };

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="오늘의 오더"
        subtitle={formatKoreanDate(plannerDateISO)}
        meta={t("건강 기록 3일 이상부터 오늘의 오더가 열립니다.")}
        backHref="/insights/recovery"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  const orderGenerationHref = `${withReturnTo("/insights/recovery/ai", "/insights/recovery/orders")}&orderCount=${selectedOrderCount}`;
  const afterWorkGenerationHref = `${withReturnTo("/insights/recovery/ai?phase=after_work", "/insights/recovery/orders")}&orderCount=${selectedOrderCount}`;

  return (
    <InsightDetailShell
      title="오늘의 오더"
      subtitle={formatKoreanDate(plannerDateISO)}
      meta={activePhase === "after_work" ? "퇴근 후 탭에서 밤 회복용 오더를 이어서 체크합니다." : "아침 탭에서 하루 시작용 오더를 먼저 체크합니다."}
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
      {planner.aiAvailable && !planner.billingLoading ? (
        <RecoveryStageHeroCard
          eyebrow="TODAY ORDERS"
          title={activePhase === "start" ? "아침 오더" : "퇴근 후 오더"}
          status="체크리스트"
          headline={phaseHeadline}
          summary={phaseSummary}
          chips={
            <>
              <DetailChip color="#1B2747">{activePhase === "start" ? "오늘 시작" : "퇴근 후"}</DetailChip>
              <DetailChip color="#5E6C84">{formatKoreanDate(plannerDateISO)}</DetailChip>
              <DetailChip color="#315CA8">선택 {selectedOrderCount}개</DetailChip>
            </>
          }
          facts={
            <>
              <RecoveryHeroFact label="남은 오더" value={`${activeItems.length}개`} />
              <RecoveryHeroFact label="완료" value={`${completedCount}개`} />
              <RecoveryHeroFact
                label="다음 흐름"
                value={activePhase === "start" ? "아침 완료 후 퇴근 후 오더로 이어짐" : "오늘 밤 회복까지 이어서 체크"}
              />
            </>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
            <RecoveryPhaseTabs
              value={activePhase}
              onChange={setActivePhase}
              items={[
                {
                  value: "start",
                  label: "아침",
                  hint: startPlanner.data ? `${activeStartItems.length}개 남음` : "생성 전",
                },
                {
                  value: "after_work",
                  label: "퇴근 후",
                  hint: afterPlanner.data ? `${activeAfterItems.length}개 남음` : afterWorkReadiness.ready ? "생성 가능" : "기록 대기",
                },
              ]}
            />
            <RecoveryOrderCountSelector
              value={selectedOrderCount}
              onChange={setSelectedOrderCount}
              helper="현재 선택 개수로 AI 생성 화면에 이어집니다."
            />
          </div>
        </RecoveryStageHeroCard>
      ) : null}

      {planner.billingLoading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-ios-sub">Access</div>
          <div className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘의 오더 접근 상태를 확인하고 있어요.</div>
        </DetailCard>
      ) : null}

      {!planner.aiAvailable && !planner.billingLoading ? (
        <>
          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
          >
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">TODAY ORDERS</div>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{fallback.orders.title}</div>
            <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">{fallback.orders.headline}</p>
            <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{fallback.orders.summary}</p>
          </DetailCard>
          <RecoveryPlannerUpgradeCard
            title="AI 오늘의 오더 전체는 Pro에서 열립니다."
            description="AI가 전체 건강기록을 보고 오늘 꼭 필요한 1~5개의 오더만 체크리스트로 정리합니다."
            returnTo="/insights/recovery/orders"
          />
        </>
      ) : null}

      {planner.aiAvailable && (startPlanner.loading || afterPlanner.loading) ? (
        <DetailCard
          className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
          style={{ background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)" }}
        >
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">RECOVERY ORDERS</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">오더를 불러오고 있어요.</div>
          <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub">아침과 퇴근 후 오더를 같은 날짜 흐름으로 정리합니다.</p>
        </DetailCard>
      ) : null}

      {planner.aiAvailable && startPlanner.error ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">오늘 시작 오더를 불러오지 못했어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">기존 fallback 오더를 대신 보여주지 않고, 다시 생성할 수 있게 유지하고 있어요.</p>
          <Link
            href={orderGenerationHref}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#CFE0FF] bg-[#EDF4FF] px-4 text-[13px] font-semibold text-[#0F4FCB]"
          >
            AI에서 다시 생성하기
          </Link>
        </DetailCard>
      ) : null}

      {planner.aiAvailable && !startPlanner.loading && !startPlanner.error && !startPlanner.data ? (
        <DetailCard
          className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
          style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
        >
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">{recoveryPhaseEyebrow("start")}</div>
          <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">오늘 시작 오더가 아직 생성되지 않았어요.</div>
          <p className="mt-3 break-keep text-[14px] leading-6 text-ios-sub">
            먼저 오늘 필요한 오더 개수를 1~5개 사이에서 고른 뒤, AI 맞춤회복 상세에서 오늘 시작 회복을 만들어 주세요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <DetailChip color="#315CA8">현재 선택 {selectedOrderCount}개</DetailChip>
          </div>
          <Link
            href={orderGenerationHref}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#CFE0FF] bg-[#EDF4FF] px-4 text-[13px] font-semibold text-[#0F4FCB]"
          >
            {selectedOrderCount}개 기준으로 오늘 시작 회복 생성하기
          </Link>
        </DetailCard>
      ) : null}

      {planner.aiAvailable && startPlanner.data ? (
        <>
          {activePhase === "start" ? (
            <>
              {activeStartItems.length ? (
                <div className="space-y-3">
                  {activeStartItems.map((item) => (
                    <RecoveryChecklistItemCard
                      key={`start-${item.id}`}
                      item={item}
                      completing={Boolean(completingIds[buildRecoveryOrderProgressId("start", item.id)])}
                      onComplete={(id) => completeItem("start", id)}
                    />
                  ))}
                </div>
              ) : (
              <DetailCard
                className="px-5 py-6 sm:px-6"
                style={{
                  background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 38px rgba(15,36,74,0.04)",
                  }}
                >
                  <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">아침 오더를 모두 완료했어요.</div>
                  <p className="mt-2 text-[13px] leading-6 text-ios-sub">오늘 기록이 더 쌓이면 퇴근 후 탭에서 다음 오더가 이어집니다.</p>
                </DetailCard>
              )}
            </>
          ) : (
            <>
              {!afterWorkReadiness.ready ? (
                <DetailCard
                  className="px-5 py-6 sm:px-6"
                  style={{
                    background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 38px rgba(15,36,74,0.04)",
                  }}
                >
                  <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘 기록이 조금 더 필요해요.</div>
                  <p className="mt-2 text-[13px] leading-6 text-ios-sub">스트레스·카페인·활동·기분·근무 메모 중 2개 이상이 입력되면 열립니다.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {afterWorkReadiness.recordedLabels.length ? (
                      afterWorkReadiness.recordedLabels.map((label) => (
                        <DetailChip key={label} color={DETAIL_ACCENTS.mint}>{label}</DetailChip>
                      ))
                    ) : (
                      <DetailChip color={DETAIL_ACCENTS.navy}>아직 없음</DetailChip>
                    )}
                    {afterWorkMissingLabels.slice(0, 3).map((label) => (
                      <DetailChip key={`missing-${label}`} color={DETAIL_ACCENTS.navy}>{label}</DetailChip>
                    ))}
                  </div>
                </DetailCard>
              ) : !afterPlanner.data ? (
                <DetailCard
                  className="px-5 py-6 sm:px-6"
                  style={{
                    background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 38px rgba(15,36,74,0.04)",
                  }}
                >
                  <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">퇴근 후 오더를 만들 수 있어요.</div>
                  <p className="mt-2 text-[13px] leading-6 text-ios-sub">퇴근 후 회복 업데이트를 만들면 이 탭에 오더가 이어집니다.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <DetailChip color="#315CA8">현재 선택 {selectedOrderCount}개</DetailChip>
                  </div>
                  {afterPlanner.error ? (
                    <p className="mt-3 text-[13px] leading-6 text-[#8F2943]">
                      {afterPlanner.error.includes("after_work_inputs_required")
                        ? "오늘 기록이 더 필요해요. 스트레스·카페인·활동·기분·근무 메모 중 2개 이상이 입력되면 열립니다."
                        : "퇴근 후 오더를 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요."}
                    </p>
                  ) : null}
                  <Link
                    href={afterWorkGenerationHref}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#CFE0FF] bg-[#EDF4FF] px-4 text-[13px] font-semibold text-[#0F4FCB]"
                  >
                    퇴근 후 회복과 오더 {selectedOrderCount}개 만들기
                  </Link>
                </DetailCard>
              ) : activeAfterItems.length ? (
                <div className="space-y-3">
                  {activeAfterItems.map((item) => (
                    <RecoveryChecklistItemCard
                      key={`after-${item.id}`}
                      item={item}
                      completing={Boolean(completingIds[buildRecoveryOrderProgressId("after_work", item.id)])}
                      onComplete={(id) => completeItem("after_work", id)}
                    />
                  ))}
                </div>
              ) : (
                <DetailCard
                  className="px-5 py-6 sm:px-6"
                  style={{
                    background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 38px rgba(15,36,74,0.04)",
                  }}
                >
                  <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">퇴근 후 오더까지 모두 완료했어요.</div>
                  <p className="mt-2 text-[13px] leading-6 text-ios-sub">오늘 회복 흐름을 끝까지 실행했습니다.</p>
                </DetailCard>
              )}
            </>
          )}
        </>
      ) : null}
    </InsightDetailShell>
  );
}
