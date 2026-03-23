"use client";

import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AIRecoveryLoadingOverlay } from "@/components/insights/AIRecoveryLoadingOverlay";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useAIRecoverySession } from "@/components/insights/useAIRecoverySession";
import { INSIGHTS_MIN_DAYS, isInsightsLocked, useInsightsData } from "@/components/insights/useInsightsData";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";
import { Button } from "@/components/ui/Button";
import type { AIRecoveryBriefSection, AIRecoverySlot } from "@/lib/aiRecovery";
import { cn } from "@/lib/cn";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";

type SectionCategory = AIRecoveryBriefSection["category"];
type SectionSeverity = AIRecoveryBriefSection["severity"];

const CATEGORY_ORDER: SectionCategory[] = ["sleep", "shift", "caffeine", "menstrual", "stress", "activity"];

const CATEGORY_META: Record<
  SectionCategory,
  {
    label: string;
    tint: string;
    tintBg: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
  }
> = {
  sleep: {
    label: "수면",
    tint: "#4F7BFF",
    tintBg: "#EEF4FF",
    Icon: MoonIcon,
  },
  shift: {
    label: "교대근무",
    tint: "#425372",
    tintBg: "#F2F5FA",
    Icon: ShiftIcon,
  },
  caffeine: {
    label: "카페인",
    tint: "#9A6B2F",
    tintBg: "#FFF5E9",
    Icon: CupIcon,
  },
  menstrual: {
    label: "생리주기",
    tint: "#D9647A",
    tintBg: "#FFF1F4",
    Icon: DropIcon,
  },
  stress: {
    label: "스트레스&감정",
    tint: "#EC6C5E",
    tintBg: "#FFF2EF",
    Icon: HeartIcon,
  },
  activity: {
    label: "신체활동",
    tint: "#2E9B87",
    tintBg: "#ECFBF7",
    Icon: WalkIcon,
  },
};

const SEVERITY_META: Record<SectionSeverity, { label: string; className: string }> = {
  info: {
    label: "안정",
    className: "border-[#CDE7DF] bg-[#F4FBF8] text-[#2E7D67]",
  },
  caution: {
    label: "조절",
    className: "border-[#D6DCE8] bg-[#F5F7FB] text-[#4F5F7B]",
  },
  warning: {
    label: "주의",
    className: "border-[#F4CDD3] bg-[#FFF4F6] text-[#B24E62]",
  },
};

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M15.5 3.8a7.8 7.8 0 1 0 4.7 14.1A8.8 8.8 0 1 1 15.5 3.8Z" />
      <path d="M17.8 6.2h.01" />
    </svg>
  );
}

function ShiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M7 7h9" />
      <path d="m13 3 4 4-4 4" />
      <path d="M17 17H8" />
      <path d="m11 13-4 4 4 4" />
    </svg>
  );
}

function CupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M5 9h10v4.5A4.5 4.5 0 0 1 10.5 18h-1A4.5 4.5 0 0 1 5 13.5V9Z" />
      <path d="M15 10h1.2A2.8 2.8 0 0 1 19 12.8v0A2.8 2.8 0 0 1 16.2 15H15" />
      <path d="M7 20h9" />
      <path d="M8 4c0 1-.6 1.5-.6 2.5S8 8 8 9" />
      <path d="M11 4c0 1-.6 1.5-.6 2.5S11 8 11 9" />
    </svg>
  );
}

function DropIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 3.5c3.4 4 5.5 6.8 5.5 10a5.5 5.5 0 1 1-11 0c0-3.2 2.1-6 5.5-10Z" />
      <path d="M9.2 14.2c.3 1.3 1.2 2.1 2.8 2.3" />
    </svg>
  );
}

function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 20.5s-7-4.5-7-10.1A4.4 4.4 0 0 1 9.4 6c1.1 0 2.1.4 2.6 1.2.5-.8 1.5-1.2 2.6-1.2A4.4 4.4 0 0 1 19 10.4c0 5.6-7 10.1-7 10.1Z" />
    </svg>
  );
}

function WalkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="13.2" cy="5.5" r="1.8" />
      <path d="m11 11 2.5-2 2 1.6" />
      <path d="m8.5 20 2.2-4.3 2.2-1.7 1.6 6" />
      <path d="m12.2 11.3-2.6 3.4-3.1.9" />
    </svg>
  );
}

function Surface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[30px] border border-black/[0.06] bg-white/[0.94] px-5 py-6 shadow-[0_20px_55px_rgba(15,23,42,0.05)] backdrop-blur-sm sm:px-7",
        className
      )}
    >
      {children}
    </div>
  );
}

function SeverityPill({ severity }: { severity: SectionSeverity }) {
  const meta = SEVERITY_META[severity];
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold", meta.className)}>{meta.label}</span>;
}

function CategoryIcon({ category }: { category: SectionCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.Icon;
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/[0.05]"
      style={{ backgroundColor: meta.tintBg, color: meta.tint }}
    >
      <Icon className="h-[22px] w-[22px]" />
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-black/[0.06] bg-[#F7F8FA] px-3 py-1.5 text-[12px] font-medium text-[#4B5563]">
      <span className="text-[#8A93A3]">{label}</span>
      <span className="ml-2 font-semibold text-[#1F2937]">{value}</span>
    </div>
  );
}

function RecoverySectionRow({
  section,
  expanded,
  onToggle,
}: {
  section: AIRecoveryBriefSection;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = CATEGORY_META[section.category];
  return (
    <Surface className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <CategoryIcon category={section.category} />
        <div className="text-[20px] font-semibold tracking-[-0.03em] text-[#111827]">{meta.label}</div>
        <SeverityPill severity={section.severity} />
      </div>
      <p className="mt-5 break-keep text-[15px] leading-7 text-[#2D3440]">{section.description}</p>
      <button
        type="button"
        onClick={onToggle}
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#4F7BFF] transition hover:text-[#355FDC]"
      >
        {expanded ? "추천 행동 접기" : "추천 행동 더 보기"}
      </button>
      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-black/[0.06] pt-4">
          {section.tips.map((tip, index) => (
            <div key={`${section.category}:${index}`} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F3F5F8] text-[12px] font-semibold text-[#667085]">
                {index + 1}
              </span>
              <p className="break-keep text-[14px] leading-6 text-[#4B5563]">{tip}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Surface>
  );
}

function RecoveryActionPanel({
  hasSession,
  disabled,
  onCreate,
  canRegenerate,
}: {
  hasSession: boolean;
  disabled: boolean;
  onCreate: () => void;
  canRegenerate: boolean;
}) {
  return (
    <Surface className="py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[#8C95A6]">{hasSession ? "REGENERATE" : "CREATE"}</div>
          <div className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#111827]">{hasSession ? "오늘 회복 해설 다시 만들기" : "오늘 회복 해설 만들기"}</div>
          <p className="mt-2 break-keep text-[14px] leading-6 text-[#667085]">
            {hasSession ? "현재 해설이 있으면 그대로 두고, 정말 필요할 때만 새로 생성하세요." : "AI는 버튼을 누를 때만 호출됩니다. 저장된 해설이 없으면 여기서 시작하세요."}
          </p>
        </div>
        <Button variant={hasSession ? "secondary" : "primary"} className="h-11 px-5 text-[14px]" disabled={disabled} onClick={onCreate}>
          {hasSession ? "다시 만들기" : "만들기"}
        </Button>
      </div>
      {hasSession && !canRegenerate ? <p className="mt-3 text-[12px] text-[#8A93A3]">오늘 해설 다시 만들기는 끝났어요.</p> : null}
    </Surface>
  );
}

function PaywallNotice() {
  return (
    <Surface>
      <div className="text-[22px] font-semibold tracking-[-0.03em] text-[#111827]">AI 맞춤회복은 Plus 또는 Pro에서 사용할 수 있어요.</div>
      <p className="mt-3 text-[14px] leading-6 text-[#667085]">AI 해설과 오늘의 오더를 함께 볼 수 있어요.</p>
      <div className="mt-5 flex gap-2">
        <Link
          href="/settings/billing/upgrade"
          className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
        >
          플랜 보기
        </Link>
        <Link
          href="/insights/recovery"
          className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 text-[13px] font-semibold text-[#111827]"
        >
          회복으로 돌아가기
        </Link>
      </div>
    </Surface>
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
    autoGenerate: false,
    enabled: !isInsightsLocked(recordedDays) && billing.hasEntitlement("recoveryPlannerAI"),
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const activeData = session.data?.slot === slot && session.data?.dateISO === end ? session.data : null;
  const response = activeData;
  const currentSession = response?.session ?? null;
  const brief = currentSession?.brief ?? null;
  const ordersPayload = currentSession?.orders ?? null;
  const canRegenerateSession = response?.quota.canGenerateSession ?? !currentSession;
  const showGeneratingOverlay = Boolean(response?.gate.allowed && session.generating);
  const sectionList = useMemo(() => {
    const sections = Array.isArray(brief?.sections) ? brief.sections : [];
    const byCategory = new Map(sections.map((section) => [section.category, section] as const));
    return CATEGORY_ORDER.map((category) => byCategory.get(category)).filter((section): section is AIRecoveryBriefSection => Boolean(section));
  }, [brief?.sections]);

  useEffect(() => {
    setExpandedSections({});
  }, [currentSession?.generatedAt, end]);

  const actionPanel = response?.gate.allowed ? (
    <RecoveryActionPanel
      hasSession={Boolean(currentSession)}
      disabled={session.generating || billing.loading || (Boolean(currentSession) && !canRegenerateSession)}
      onCreate={() => void session.generate(true)}
      canRegenerate={canRegenerateSession}
    />
  ) : null;

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
      <AIRecoveryLoadingOverlay mode="recovery" open={showGeneratingOverlay} />

      {session.error ? (
        <Surface className="border-[#F3D0D6] bg-[#FFF7F8]">
          <div className="text-[15px] font-semibold text-[#A03C50]">불러오지 못했어요.</div>
          <div className="mt-2 text-[14px] leading-6 text-[#7A4C55]">{session.error}</div>
        </Surface>
      ) : null}

      {response && !response.gate.allowed ? (
        <Surface>
          <div className="text-[22px] font-semibold tracking-[-0.03em] text-[#111827]">지금은 만들 수 없어요.</div>
          <p className="mt-3 text-[14px] leading-6 text-[#667085]">{response.gate.message}</p>
          {response.gate.code === "wake_sleep_required" ? (
            <div className="mt-5">
              <Link
                href="/schedule?openHealthLog=today&focus=sleep"
                className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
              >
                오늘 수면 기록하기
              </Link>
            </div>
          ) : null}
        </Surface>
      ) : null}

      {!brief && !session.error && response?.gate.allowed ? actionPanel : null}

      {brief ? (
        <>
          <Surface>
            <div className="text-[11px] font-semibold tracking-[0.2em] text-[#8C95A6]">AI CUSTOMIZED RECOVERY</div>
            <div className="mt-3 break-keep text-[24px] font-semibold leading-[1.45] tracking-[-0.04em] text-[#111827] sm:text-[27px]">{brief.headline}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              {brief.weeklySummary?.avgBattery != null ? <SummaryMetric label="주간 배터리" value={`${Math.round(brief.weeklySummary.avgBattery)}점`} /> : null}
              {brief.weeklySummary?.prevAvgBattery != null ? <SummaryMetric label="이전 흐름" value={`${Math.round(brief.weeklySummary.prevAvgBattery)}점`} /> : null}
            </div>
            {brief.compoundAlert ? (
              <div className="mt-5 rounded-[24px] bg-[#FFF6F7] px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  {brief.compoundAlert.factors.slice(0, 3).map((factor) => (
                    <span key={factor} className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#B24E62] shadow-[0_6px_18px_rgba(178,78,98,0.08)]">
                      {factor}
                    </span>
                  ))}
                </div>
                <p className="mt-3 break-keep text-[14px] leading-6 text-[#7A4C55]">{brief.compoundAlert.message}</p>
              </div>
            ) : null}
            <div className="mt-6 grid gap-5 border-t border-black/[0.06] pt-5 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.16em] text-[#8C95A6]">개인 인사이트</div>
                <p className="mt-3 break-keep text-[14px] leading-6 text-[#4B5563]">{brief.weeklySummary?.personalInsight}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold tracking-[0.16em] text-[#8C95A6]">다음 흐름</div>
                <p className="mt-3 break-keep text-[14px] leading-6 text-[#4B5563]">{brief.weeklySummary?.nextWeekPreview}</p>
              </div>
            </div>
          </Surface>

          <div className="px-1">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-[#8C95A6]">TODAY EXPLANATION</div>
            <div className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-[#111827]">오늘 회복 해설</div>
            <p className="mt-3 break-keep text-[14px] leading-6 text-[#667085]">카테고리별 해설은 한 줄씩 먼저 보고, 추천 행동 2개는 더 보기로 펼쳐 확인하세요.</p>
            <div className="mt-5 grid gap-4">
              {sectionList.map((section) => (
                <RecoverySectionRow
                  key={section.category}
                  section={section}
                  expanded={Boolean(expandedSections[section.category])}
                  onToggle={() =>
                    setExpandedSections((current) => ({
                      ...current,
                      [section.category]: !current[section.category],
                    }))
                  }
                />
              ))}
            </div>
          </div>

          {ordersPayload ? (
            <Surface>
              <div className="text-[11px] font-semibold tracking-[0.18em] text-[#8C95A6]">TODAY ORDER</div>
              <div className="mt-2 text-[23px] font-semibold tracking-[-0.04em] text-[#111827]">{ordersPayload.title ?? "오늘의 오더"}</div>
              <div className="mt-4 break-keep text-[20px] font-semibold leading-8 tracking-[-0.04em] text-[#111827]">{ordersPayload.headline}</div>
              <p className="mt-3 break-keep text-[14px] leading-6 text-[#667085]">{ordersPayload.summary}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/insights/recovery/orders"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
                >
                  오더 보기
                </Link>
                <Link
                  href="/insights/recovery/orders"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-black/[0.08] bg-white px-5 text-[13px] font-semibold text-[#111827]"
                >
                  체크리스트 열기
                </Link>
              </div>
            </Surface>
          ) : null}

          {actionPanel}
        </>
      ) : !session.error && response?.gate.allowed && !session.loading ? (
        <Surface>
          <div className="text-[22px] font-semibold tracking-[-0.03em] text-[#111827]">아직 생성된 해설이 없어요.</div>
          <p className="mt-3 text-[14px] leading-6 text-[#667085]">위 만들기 버튼을 누를 때만 AI가 호출되고, 생성이 끝나면 해설과 오더가 아래에 정리됩니다.</p>
        </Surface>
      ) : null}
    </InsightDetailShell>
  );
}
