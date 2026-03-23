"use client";

import Link from "next/link";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AIRecoveryLoadingOverlay } from "@/components/insights/AIRecoveryLoadingOverlay";
import { useAIRecoverySession } from "@/components/insights/useAIRecoverySession";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { Button } from "@/components/ui/Button";
import type { AIRecoverySlot } from "@/lib/aiRecovery";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

function PaywallNotice() {
  return (
    <DetailCard className="p-6">
      <div className="text-[18px] font-bold text-ios-text">AI 맞춤회복은 Plus 또는 Pro에서 사용할 수 있어요.</div>
      <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 해설과 오늘의 오더를 함께 볼 수 있어요.</p>
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

function SeverityChip({ severity }: { severity: "info" | "caution" | "warning" }) {
  if (severity === "warning") return <DetailChip color={DETAIL_ACCENTS.pink}>주의</DetailChip>;
  if (severity === "caution") return <DetailChip color={DETAIL_ACCENTS.navy}>조절</DetailChip>;
  return <DetailChip color={DETAIL_ACCENTS.mint}>안정</DetailChip>;
}

function CompoundAlertCard({ factors, message }: { factors: string[]; message: string }) {
  return (
    <DetailCard className="border-[#F2C4CC] bg-[#FFF7F8] p-4">
      <div className="flex flex-wrap gap-2">
        {factors.slice(0, 3).map((factor) => (
          <DetailChip key={factor} color={DETAIL_ACCENTS.pink}>
            {factor}
          </DetailChip>
        ))}
      </div>
      <p className="mt-3 text-[14px] leading-7 text-[#7A4C55]">{message}</p>
    </DetailCard>
  );
}

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const billing = useBillingAccess();
  const { end, recordedDays, syncLabel } = useInsightsData();
  const planner = useRecoveryPlanner();
  const slot: AIRecoverySlot = "wake";
  const session = useAIRecoverySession({
    dateISO: end,
    slot,
    autoGenerate: true,
    enabled: !isInsightsLocked(recordedDays) && billing.hasEntitlement("recoveryPlannerAI"),
  });
  const activeData = session.data?.slot === slot && session.data?.dateISO === end ? session.data : null;

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell title="AI 맞춤회복" subtitle={formatKoreanDate(end)} meta={t("건강 기록 3일 이상부터 볼 수 있어요.")} tone="navy" backHref="/insights/recovery">
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  if (!billing.loading && !billing.hasEntitlement("recoveryPlannerAI")) {
    return (
      <InsightDetailShell
        title="AI 맞춤회복"
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
  const brief = (currentSession?.brief as any) ?? null;
  const ordersPayload = currentSession?.orders ?? null;
  const canRegenerateSession = response?.quota.canGenerateSession ?? !currentSession;
  const showGeneratingOverlay = Boolean(response?.gate.allowed && (session.generating || (!currentSession && session.loading)));

  return (
    <InsightDetailShell
      title="AI 맞춤회복"
      subtitle={formatKoreanDate(end)}
      meta={response?.slotDescription ?? "오늘 기록과 최근 흐름으로 회복 포인트를 정리합니다."}
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
      {showGeneratingOverlay ? <AIRecoveryLoadingOverlay title="AI 맞춤회복 분석중.." detail="최근 기록을 읽고 해설과 오더를 만드는 중이에요." /> : null}

      <DetailCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[#1B2747]">AI CUSTOMIZED RECOVERY</div>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">오늘 회복 해설</div>
            <p className="mt-2 text-[13px] leading-6 text-ios-sub">해설을 먼저 보고 오늘의 오더로 이어갈 수 있어요.</p>
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
              <DetailChip color={DETAIL_ACCENTS.navy}>{brief.headline}</DetailChip>
              {brief.weeklySummary?.avgBattery != null ? (
                <DetailChip color={DETAIL_ACCENTS.mint}>주간 배터리 {Math.round(brief.weeklySummary.avgBattery)}점</DetailChip>
              ) : null}
              {brief.weeklySummary?.prevAvgBattery != null ? (
                <DetailChip color={DETAIL_ACCENTS.navy}>이전 {Math.round(brief.weeklySummary.prevAvgBattery)}점</DetailChip>
              ) : null}
            </div>
            <p className="mt-4 break-keep text-[15px] leading-7 text-ios-sub">
              {brief.weeklySummary?.personalInsight ?? brief.compoundAlert?.message ?? brief.headline}
            </p>
            {brief.compoundAlert ? (
              <div className="mt-4">
                <CompoundAlertCard factors={Array.isArray(brief.compoundAlert.factors) ? brief.compoundAlert.factors : []} message={brief.compoundAlert.message} />
              </div>
            ) : null}
            {Array.isArray(brief.weeklySummary?.topDrains) && brief.weeklySummary.topDrains.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {brief.weeklySummary.topDrains.slice(0, 3).map((drain: any) => (
                  <DetailChip key={drain.label} color={DETAIL_ACCENTS.pink}>
                    {drain.label} {Math.round(Number(drain.pct) <= 1 ? Number(drain.pct) * 100 : Number(drain.pct))}%
                  </DetailChip>
                ))}
              </div>
            ) : null}
            <div className="mt-4 rounded-[20px] border border-ios-sep bg-[#FAFBFD] p-4">
              <div className="text-[12px] font-semibold text-ios-sub">개인 인사이트</div>
              <div className="mt-2 break-keep text-[14px] leading-7 text-ios-text">{brief.weeklySummary?.personalInsight}</div>
              <div className="mt-4 text-[12px] font-semibold text-ios-sub">다음 주 미리보기</div>
              <div className="mt-2 break-keep text-[14px] leading-7 text-ios-text">{brief.weeklySummary?.nextWeekPreview}</div>
            </div>
          </DetailCard>

          <DetailCard className="p-5 sm:p-6">
            <div className="text-[12px] font-semibold text-ios-sub">해설</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">오늘 포인트</div>
            <div className="mt-4 grid gap-3">
              {Array.isArray(brief.sections)
                ? brief.sections.map((section: any) => (
                    <div key={`${section.category}:${section.title}`} className="rounded-[20px] border border-ios-sep bg-white p-4 shadow-apple-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityChip severity={section.severity ?? "info"} />
                        <div className="text-[12px] font-semibold text-ios-sub">{section.title}</div>
                      </div>
                      <div className="mt-2 break-keep text-[14px] leading-6 text-ios-text">{section.description}</div>
                      <div className="mt-4 grid gap-2">
                        {(Array.isArray(section.tips) ? section.tips.slice(0, 2) : []).map((tip: string, index: number) => (
                          <div key={`${section.category}:${index}`} className="rounded-[16px] bg-[#FAFBFD] px-3 py-2 text-[13px] leading-6 text-ios-text">
                            {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                : null}
            </div>
          </DetailCard>

          <DetailCard className="p-5 sm:p-6">
            <div className="text-[12px] font-semibold text-ios-sub">오더</div>
            <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{ordersPayload?.title ?? "오늘의 오더"}</div>
            <div className="mt-3 break-keep text-[16px] font-bold leading-7 tracking-[-0.03em] text-ios-text">{ordersPayload?.headline}</div>
            <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub">{ordersPayload?.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/insights/recovery/orders"
                className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
              >
                오더 보기
              </Link>
              <Link
                href="/insights/recovery/orders"
                className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
              >
                체크리스트 열기
              </Link>
            </div>
          </DetailCard>

        </>
      ) : !session.error && !showGeneratingOverlay && response?.gate.allowed ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">AI 결과를 기다리는 중이에요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">아직 결과가 없으면 다시 만들기를 눌러 주세요.</p>
        </DetailCard>
      ) : null}
    </InsightDetailShell>
  );
}
