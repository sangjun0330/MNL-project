"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { RecoveryChecklistItemCard } from "@/components/insights/RecoveryPlannerFlowCards";
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
  recoveryPhaseEyebrow,
} from "@/lib/recoveryPhases";
import { useInsightsData, isInsightsLocked, INSIGHTS_MIN_DAYS, shiftKo } from "@/components/insights/useInsightsData";
import { useI18n } from "@/lib/useI18n";
import { withReturnTo } from "@/lib/navigation";

export function InsightsRecoveryOrdersDetail() {
  const { t } = useI18n();
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
  const [selectedOrderCount, setSelectedOrderCount] = useState(3);
  const completionTimersRef = useRef<number[]>([]);
  const afterWorkReadiness = getAfterWorkReadiness(state, end);
  const afterWorkMissingLabels = buildAfterWorkMissingLabels(afterWorkReadiness.recordedLabels);

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
  const startOrdersModule = startPlanner.data?.result.orders ?? fallback.orders;
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

  const startOrders = startOrdersModule.items;
  const afterOrders = afterOrdersModule?.items ?? [];
  const activeStartItems = startOrders.filter((item) => !doneMap[buildRecoveryOrderProgressId("start", item.id)]);
  const activeAfterItems = afterOrders.filter((item) => !doneMap[buildRecoveryOrderProgressId("after_work", item.id)]);
  const totalOrdersCount = startOrders.length + afterOrders.length;
  const completedCount = totalOrdersCount - activeStartItems.length - activeAfterItems.length;

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
      meta="오늘 시작 오더와 퇴근 후 오더를 같은 흐름으로 체크합니다."
      backHref="/insights/recovery"
      chips={
        <>
          <DetailChip color={DETAIL_ACCENTS.mint}>{planner.nextDutyLabel}</DetailChip>
          {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
          <DetailChip color={DETAIL_ACCENTS.navy}>{syncLabel}</DetailChip>
        </>
      }
    >
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
          style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
        >
          <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">RECOVERY ORDERS</div>
          <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">저장된 시작 오더와 퇴근 후 오더를 확인하고 있어요.</div>
          <p className="mt-3 break-keep text-[14px] leading-6 text-ios-sub">
            아침에 만든 오더와 퇴근 후 업데이트된 오더를 같은 날짜 흐름으로 불러옵니다.
          </p>
        </DetailCard>
      ) : null}

      {planner.aiAvailable && startPlanner.error ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">오늘 시작 오더를 불러오지 못했어요.</div>
          <p className="mt-2 text-[14px] leading-6 text-ios-sub">잠시 후 다시 시도하거나 AI 맞춤회복 상세에서 다시 확인해 주세요.</p>
          <button
            type="button"
            onClick={startPlanner.retry}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[#CFE0FF] bg-[#EDF4FF] px-4 text-[13px] font-semibold text-[#0F4FCB]"
          >
            다시 불러오기
          </button>
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
          <div className="mt-4">
            <div className="text-[12px] font-semibold text-ios-sub">생성할 오더 개수</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSelectedOrderCount(count)}
                  className={
                    count === selectedOrderCount
                      ? "inline-flex h-9 items-center justify-center rounded-full border border-[#A9C6FF] bg-[#EDF4FF] px-4 text-[13px] font-semibold text-[#0F4FCB]"
                      : "inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[13px] font-semibold text-ios-text"
                  }
                >
                  {count}개
                </button>
              ))}
            </div>
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
          <DetailCard
            className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
            style={{ background: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 82%)" }}
          >
            <div className="max-w-[680px]">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">RECOVERY ORDER THREAD</div>
              <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{t("오늘 시작 오더 -> 퇴근 후 오더")}</div>
              <p className="mt-3 break-keep text-[18px] font-bold leading-8 tracking-[-0.03em] text-ios-text">
                {afterPlanner.data?.result.orders.headline ?? startOrdersModule.headline}
              </p>
              <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">
                {t("아침에는 하루를 시작할 오더를, 퇴근 후에는 오늘 밤 회복을 위한 오더를 같은 체크리스트 흐름으로 이어서 봅니다.")}
              </p>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">남은 오더</div>
                <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{activeStartItems.length + activeAfterItems.length}개</div>
              </div>
              <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">완료</div>
                <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{completedCount}개</div>
              </div>
              <div className="rounded-[20px] bg-ios-bg px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">기준</div>
                <div className="mt-1 text-[14px] font-semibold leading-6 text-ios-text">{planner.focusFactor?.label ?? "오늘 회복"}</div>
              </div>
            </div>
          </DetailCard>

          <DetailCard className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">{recoveryPhaseEyebrow("start")}</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{startOrdersModule.title}</div>
            <p className="mt-2 text-[14px] leading-6 text-ios-sub">{startOrdersModule.summary}</p>
          </DetailCard>
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
            <DetailCard className="px-5 py-6 sm:px-6">
              <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘 시작 오더를 모두 완료했어요.</div>
              <p className="mt-2 text-[14px] leading-6 text-ios-sub">이제 오늘 기록을 조금 더 입력하면 퇴근 후 오더가 이어집니다.</p>
            </DetailCard>
          )}

          <DetailCard className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#1B2747]">{recoveryPhaseEyebrow("after_work")}</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{afterOrdersModule?.title ?? "퇴근 후 오더"}</div>
            <p className="mt-2 text-[14px] leading-6 text-ios-sub">
              {afterPlanner.data?.result.orders.summary ?? "오늘 실제 기록과 아침 오더 진행을 반영해, 퇴근 후 회복 오더가 이어집니다."}
            </p>
          </DetailCard>

          {!afterWorkReadiness.ready ? (
            <DetailCard className="px-5 py-6 sm:px-6">
              <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘 기록이 조금 더 필요해요.</div>
              <p className="mt-2 text-[14px] leading-6 text-ios-sub">스트레스·카페인·활동·기분·근무 메모 중 2개 이상이 입력되면 퇴근 후 오더가 열립니다.</p>
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
            <DetailCard className="px-5 py-6 sm:px-6">
              <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">퇴근 후 오더를 이어서 만들 수 있어요.</div>
              <p className="mt-2 text-[14px] leading-6 text-ios-sub">AI 맞춤회복에서 퇴근 후 회복 업데이트를 만들면, 아래에 퇴근 후 오더가 이어집니다.</p>
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
          ) : afterPlanner.data ? (
            <DetailCard className="px-5 py-6 sm:px-6">
              <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">퇴근 후 오더까지 모두 완료했어요.</div>
              <p className="mt-2 text-[14px] leading-6 text-ios-sub">오늘 회복 흐름을 끝까지 실행했습니다. 필요하면 AI 맞춤회복에서 전체 맥락을 다시 확인하세요.</p>
            </DetailCard>
          ) : null}
        </>
      ) : null}
    </InsightDetailShell>
  );
}
