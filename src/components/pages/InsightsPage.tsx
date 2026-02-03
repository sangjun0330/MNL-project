"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatKoreanDate } from "@/lib/date";
import type { AppState } from "@/lib/model";
import { countHealthRecordedDays } from "@/lib/healthRecords";
import { statusColor, statusLabel } from "@/lib/wnlInsight";
import { useInsightsData, shiftKo } from "@/components/insights/useInsightsData";
import { HeroDashboard } from "@/components/insights/v2/HeroDashboard";

const GRADIENTS = {
  mint: "linear-gradient(135deg, rgba(108,218,195,0.35), rgba(255,255,255,0.95))",
  pink: "linear-gradient(135deg, rgba(255,158,170,0.35), rgba(255,255,255,0.95))",
  navy: "linear-gradient(135deg, rgba(27,39,71,0.20), rgba(255,255,255,0.96))",
} as const;

const ACCENTS = {
  mint: "#2FB8A3",
  pink: "#E87485",
  navy: "#1B2747",
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="mb-2 text-[15px] font-bold tracking-[-0.01em] text-ios-text">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SummaryCard({
  href,
  accent,
  label,
  title,
  metric,
  metricLabel,
  summary,
  detail,
  chips,
  valueColor,
}: {
  href: string;
  accent: keyof typeof GRADIENTS;
  label: string;
  title: string;
  metric: string | number;
  metricLabel: string;
  summary: React.ReactNode;
  detail?: string;
  chips?: React.ReactNode;
  valueColor?: string;
}) {
  const accentColor = ACCENTS[accent];
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-apple border border-ios-sep p-5",
        "transition-shadow duration-300 hover:shadow-apple"
      )}
      style={{ backgroundImage: GRADIENTS[accent] }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ios-sub">{label}</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{title}</div>
        </div>
        <div className="mt-0.5 text-[22px] text-ios-muted transition group-hover:text-ios-text">›</div>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div
          className="text-[34px] font-extrabold tracking-[-0.02em]"
          style={{ color: valueColor ?? accentColor }}
        >
          {metric}
        </div>
        <div className="pb-1 text-[14px] font-bold text-ios-text">{metricLabel}</div>
      </div>

      <div className="mt-2 text-[14px] text-ios-text">
        <span className="font-bold" style={{ color: accentColor }}>
          {summary}
        </span>
      </div>

      {detail ? <div className="mt-1 text-[13px] text-ios-sub">{detail}</div> : null}

      {chips ? <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div> : null}
    </Link>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-ios-sep bg-white/80 px-3 py-1 text-[12px] font-semibold text-ios-sub">
      {children}
    </span>
  );
}

function AccentPill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="rounded-full border border-ios-sep bg-white/80 px-3 py-1 text-[12px] font-semibold"
      style={{ color }}
    >
      {children}
    </span>
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  return <span className="font-bold">{children}</span>;
}

function formatPct(p: number) {
  return `${Math.round(p * 100)}%`;
}

function countRecordedDays(state: AppState) {
  return countHealthRecordedDays(state);
}

export function InsightsPage() {
  const {
    state,
    end,
    todayShift,
    hasTodayShift,
    menstrual,
    todayDisplay,
    status,
    syncLabel,
    todayVital,
    fastCharge,
    avgDisplay,
    avgBody,
    avgMental,
    top1,
  } = useInsightsData();
  const isRestDay = todayShift === "OFF" || todayShift === "VAC";
  const recordedDays = countRecordedDays(state);

  if (recordedDays < 7) {
    const remaining = Math.max(7 - recordedDays, 0);
    return (
      <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6 sm:px-6">
        <div className="mb-4">
          <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
          <div className="mt-1 text-[13px] text-ios-sub">맞춤 회복 중심 인사이트</div>
        </div>

        <div className="rounded-apple border border-ios-sep bg-white p-6 shadow-apple">
          <div className="text-[18px] font-bold text-ios-text">인사이트가 아직 잠겨 있어요</div>
          <div className="mt-2 text-[13px] text-ios-sub">
            건강 정보를 최소 7일 이상 기록해야 인사이트가 열립니다.
          </div>
          <div className="mt-4 rounded-2xl border border-ios-sep bg-black/[0.03] px-4 py-3 text-[14px] text-ios-text">
            현재 {recordedDays}일 기록됨 · {remaining}일 더 기록하면 열려요
          </div>
          <div className="mt-4 text-[12px] text-ios-muted">
            수면/스트레스/활동/카페인/기분 등 건강 기록이 입력된 날짜만 집계됩니다.
          </div>
        </div>
      </div>
    );
  }

  const recoverySummary = top1 ? (
    <>
      <Bold>회복 포커스</Bold> · {top1.label}
    </>
  ) : (
    <Bold>맞춤 회복 처방</Bold>
  );

  const recoveryDetail = top1
    ? `${top1.label} 비중 ${formatPct(top1.pct)} · 오늘의 오더를 함께 확인하세요.`
    : "오늘의 오더까지 함께 확인할 수 있어요.";

  const thievesSummary = top1 ? (
    <>
      <Bold>방전 1순위</Bold> · {top1.label}
    </>
  ) : (
    <Bold>에너지 도둑 분석</Bold>
  );

  const thievesDetail = top1
    ? `${top1.label} 비중 ${formatPct(top1.pct)} · 피로 요인을 줄여보세요.`
    : "방전 요인을 분석할 데이터가 부족해요.";

  const trendSummary = (
    <>
      <Bold>최근 7일 평균</Bold> · Vital {avgDisplay}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-4">
        <div className="text-[32px] font-extrabold tracking-[-0.03em]">Summary</div>
        <div className="mt-1 text-[13px] text-ios-sub">맞춤 회복 중심 인사이트</div>
      </div>

      <div className="mt-4">
        <Link href="/insights/vital" className="block transition-shadow duration-300 hover:shadow-apple">
          <HeroDashboard vital={todayVital} syncLabel={syncLabel} fastCharge={fastCharge} />
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ios-sub">
          <span>{formatKoreanDate(end)}</span>
          <span className="opacity-40">·</span>
          {hasTodayShift ? (
            <>
              <span>{shiftKo(todayShift)}</span>
              <span className="opacity-40">·</span>
            </>
          ) : null}
          <span>{menstrual.enabled ? menstrual.label : "주기"}</span>
          <span className="opacity-40">·</span>
          <span>Vital {todayDisplay}</span>
        </div>
      </div>

      <Section title="Pinned">
        <SummaryCard
          href="/insights/recovery"
          accent="mint"
          label="Personalized Recovery"
          title="맞춤 회복 처방"
          metric={top1 ? formatPct(top1.pct) : "—"}
          metricLabel={top1 ? top1.label : "핵심 요인"}
          summary={recoverySummary}
          detail={recoveryDetail}
          chips={(
            <>
              <AccentPill color={ACCENTS.mint}>오늘의 오더 포함</AccentPill>
              <AccentPill color={ACCENTS.mint}>맞춤 처방</AccentPill>
            </>
          )}
        />
      </Section>

      <Section title="Trends">
        <SummaryCard
          href="/insights/trends"
          accent="mint"
          label="Stats"
          title="최근 7일 통계"
          metric={avgDisplay}
          metricLabel="Avg Vital"
          summary={trendSummary}
          detail={`Body ${avgBody} · Mental ${avgMental}`}
          chips={(
            <>
              <AccentPill color={ACCENTS.mint}>Body {avgBody}</AccentPill>
              <AccentPill color={ACCENTS.mint}>Mental {avgMental}</AccentPill>
            </>
          )}
        />
        <SummaryCard
          href="/insights/thieves"
          accent="pink"
          label="Battery Thieves"
          title="에너지 도둑"
          metric={top1 ? formatPct(top1.pct) : "—"}
          metricLabel={top1 ? top1.label : "핵심 요인"}
          summary={thievesSummary}
          detail={thievesDetail}
          chips={<AccentPill color={ACCENTS.pink}>피로 요인 집중 분석</AccentPill>}
        />
      </Section>

      {hasTodayShift ? (
        <Section title="Plan">
          <SummaryCard
            href="/insights/timeline"
            accent="navy"
            label="Timeline Forecast"
            title="타임라인 예보"
            metric={shiftKo(todayShift)}
            metricLabel="Shift"
            summary={(
              <>
                <Bold>{isRestDay ? "휴식일 회복 추천" : "알고리즘 회복 추천"}</Bold> · {shiftKo(todayShift)} 기준
              </>
            )}
            detail={
              isRestDay
                ? "근무 없이 회복을 최적화하는 휴식 루틴을 안내합니다."
                : "출근 전 · 근무 중 · 퇴근 후 회복 루틴을 안내합니다."
            }
            chips={<AccentPill color={ACCENTS.navy}>{isRestDay ? "휴식 최적화" : "근무 단계별"}</AccentPill>}
          />
        </Section>
      ) : null}

      <Section title="Vitals">
        <SummaryCard
          href="/insights/vital"
          accent="mint"
          label="WNL Vital"
          title="오늘 바이탈 요약"
          metric={todayDisplay}
          metricLabel="/ 100"
          summary={<Bold>{statusLabel(status)}</Bold>}
          detail="상단 바이탈 카드에서 자세히 확인할 수 있어요."
          chips={<Chip>{syncLabel}</Chip>}
          valueColor={statusColor(status)}
        />
      </Section>
    </div>
  );
}
