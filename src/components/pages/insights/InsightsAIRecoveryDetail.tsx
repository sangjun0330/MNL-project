"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DetailCard,
  DetailChip,
  DETAIL_ACCENTS,
  InsightDetailShell,
} from "@/components/pages/insights/InsightDetailShell";
import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { TodaySleepRequiredSheet } from "@/components/insights/TodaySleepRequiredSheet";
import { shiftKo } from "@/components/insights/useInsightsData";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type RecoveryCategory,
  type RecoverySeverity,
} from "@/lib/aiRecovery";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";
import { Button } from "@/components/ui/Button";

function severityColor(severity: RecoverySeverity) {
  if (severity === "warning") return DETAIL_ACCENTS.pink;
  if (severity === "caution") return DETAIL_ACCENTS.navy;
  return DETAIL_ACCENTS.mint;
}

function severityLabel(severity: RecoverySeverity, t: (key: string) => string) {
  if (severity === "warning") return t("경고");
  if (severity === "caution") return t("주의");
  return t("안정");
}

function categoryLabel(category: RecoveryCategory, t: (key: string) => string) {
  switch (category) {
    case "sleep":
      return t("수면");
    case "shift":
      return t("교대근무");
    case "caffeine":
      return t("카페인");
    case "menstrual":
      return t("생리주기");
    case "stress":
      return t("스트레스 & 감정");
    case "activity":
      return t("신체 활동");
  }
}

export function InsightsAIRecoveryDetail() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, loading, fromSupabase, error, requiresTodaySleep } = useAIRecoveryInsights();
  const [openSleepGuide, setOpenSleepGuide] = useState(false);

  useEffect(() => {
    if (requiresTodaySleep) setOpenSleepGuide(true);
  }, [requiresTodaySleep]);

  const moveToTodaySleepLog = () => {
    setOpenSleepGuide(false);
    router.push("/schedule?openHealthLog=today&focus=sleep");
  };
  const { result } = data;
  const weeklyDelta = result.weeklySummary
    ? result.weeklySummary.avgBattery - result.weeklySummary.prevAvgBattery
    : 0;
  const weeklyDeltaText = weeklyDelta > 0 ? `+${weeklyDelta}` : `${weeklyDelta}`;

  if (requiresTodaySleep) {
    return (
      <>
        <InsightDetailShell
          title={t("AI 맞춤회복")}
          subtitle={formatKoreanDate(data.dateISO)}
          chips={
            <>
              <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(data.todayShift)}</DetailChip>
              <DetailChip color={DETAIL_ACCENTS.pink}>{t("오늘 수면 입력 필요")}</DetailChip>
            </>
          }
          meta={t("오늘 수면 기록 입력 후 맞춤 회복 분석이 시작됩니다.")}
          tone="navy"
          backHref="/insights"
        >
          <DetailCard className="p-5" style={{ backgroundImage: "linear-gradient(135deg, rgba(27,39,71,0.12), rgba(255,255,255,0.98))" }}>
            <div className="text-[12.5px] font-semibold text-ios-sub">{t("분석 대기")}</div>
            <div className="mt-2 text-[20px] font-bold tracking-[-0.02em] text-ios-text">
              {t("오늘 수면 기록을 먼저 입력해 주세요.")}
            </div>
            <div className="mt-2 text-[14px] leading-relaxed text-ios-sub">
              {t("확인을 누르면 일정 페이지로 이동해 오늘 기록 팝업에서 수면을 바로 입력할 수 있어요.")}
            </div>
            <div className="mt-4">
              <Button onClick={() => setOpenSleepGuide(true)}>{t("수면 기록하러 가기")}</Button>
            </div>
          </DetailCard>
        </InsightDetailShell>

        <TodaySleepRequiredSheet
          open={openSleepGuide}
          onClose={() => setOpenSleepGuide(false)}
          onConfirm={moveToTodaySleepLog}
        />
      </>
    );
  }

  return (
    <>
      <InsightDetailShell
        title={t("AI 맞춤회복")}
        subtitle={formatKoreanDate(data.dateISO)}
        chips={
          <>
            <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(data.todayShift)}</DetailChip>
            {data.nextShift ? (
              <DetailChip color={DETAIL_ACCENTS.navy}>
                {t("내일")} · {shiftKo(data.nextShift)}
              </DetailChip>
            ) : null}
            <DetailChip color={fromSupabase ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.pink}>
              {fromSupabase ? t("Supabase 실시간 분석") : t("기기 내 임시 분석")}
            </DetailChip>
            <DetailChip color={data.engine === "openai" ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.navy}>
              {data.engine === "openai" ? t("OpenAI 생성 분석") : t("규칙 기반 분석")}
            </DetailChip>
            {data.model ? <DetailChip color={DETAIL_ACCENTS.navy}>{data.model}</DetailChip> : null}
          </>
        }
        meta={t("AI가 수면/교대근무/카페인/주기/스트레스/활동을 통합해 오늘의 회복 처방을 제안합니다.")}
        tone="navy"
        backHref="/insights"
      >
        <DetailCard className="p-5" style={{ backgroundImage: "linear-gradient(135deg, rgba(27,39,71,0.12), rgba(255,255,255,0.98))" }}>
          <div className="text-[12.5px] font-semibold text-ios-sub">A · {t("한줄 요약")}</div>
          <div className="mt-2 text-[20px] font-bold tracking-[-0.02em] text-ios-text">
            {loading ? t("분석 중...") : result.headline}
          </div>
        </DetailCard>

        {result.compoundAlert ? (
          <DetailCard className="p-5">
            <div className="text-[12.5px] font-semibold text-ios-sub">B · {t("긴급 알림")}</div>
            <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: "#E8748533", backgroundColor: "#E8748512" }}>
              <div className="text-[18px] font-bold tracking-[-0.01em]" style={{ color: DETAIL_ACCENTS.pink }}>
                {t("주의")}
              </div>
              <div className="mt-2 text-[15px] leading-relaxed text-ios-text">{result.compoundAlert.message}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.compoundAlert.factors.map((factor) => (
                  <DetailChip key={factor} color={DETAIL_ACCENTS.pink}>
                    {factor}
                  </DetailChip>
                ))}
              </div>
            </div>
          </DetailCard>
        ) : null}

        <DetailCard className="p-5">
          <div className="text-[12.5px] font-semibold text-ios-sub">C · {t("오늘의 회복 처방")}</div>
          {result.sections.length ? (
            <div className="mt-4 space-y-3">
              {result.sections.map((section) => {
                const color = CATEGORY_COLORS[section.category];
                return (
                  <div
                    key={`${section.category}-${section.title}`}
                    className="rounded-2xl border border-ios-sep p-4"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${color}12, rgba(255,255,255,0.98))`,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[18px]" aria-hidden="true">
                        {CATEGORY_ICONS[section.category]}
                      </span>
                      <div className="text-[17px] font-bold tracking-[-0.01em]" style={{ color }}>
                        {categoryLabel(section.category, t)}
                      </div>
                      <DetailChip color={severityColor(section.severity)}>
                        {severityLabel(section.severity, t)}
                      </DetailChip>
                    </div>

                    <div className="mt-2 text-[15px] leading-relaxed text-ios-text">{section.description}</div>

                    <ul className="mt-3 space-y-1.5 text-[14px] leading-relaxed text-ios-sub">
                      {section.tips.map((tip) => (
                        <li key={tip}>· {tip}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 text-[14px] text-ios-sub">{t("처방 섹션이 아직 없어요. 기록이 쌓이면 자동으로 생성돼요.")}</div>
          )}
        </DetailCard>

        {result.weeklySummary ? (
          <DetailCard
            className="p-5"
            style={{ backgroundImage: "linear-gradient(135deg, rgba(10,10,10,0.03), rgba(255,255,255,0.98))" }}
          >
            <div className="text-[12.5px] font-semibold text-ios-sub">D · {t("이번 주 AI 한마디")}</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-ios-sep bg-white p-4">
                <div className="text-[12px] font-semibold text-ios-sub">{t("이번 주 평균 배터리")}</div>
                <div className="mt-1 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">
                  {result.weeklySummary.avgBattery}
                </div>
                <div className="text-[12px] text-ios-sub">
                  {t("지난주 대비")} {weeklyDeltaText}
                </div>
              </div>
              <div className="rounded-2xl border border-ios-sep bg-white p-4 sm:col-span-2">
                <div className="text-[12px] font-semibold text-ios-sub">{t("개인 패턴")}</div>
                <div className="mt-1 text-[14px] leading-relaxed text-ios-text">{result.weeklySummary.personalInsight}</div>
                <div className="mt-3 text-[12px] font-semibold text-ios-sub">{t("다음 주 예측")}</div>
                <div className="mt-1 text-[14px] leading-relaxed text-ios-text">{result.weeklySummary.nextWeekPreview}</div>
              </div>
            </div>
            {result.weeklySummary.topDrains.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {result.weeklySummary.topDrains.map((drain) => (
                  <DetailChip key={`${drain.label}-${drain.pct}`} color={DETAIL_ACCENTS.navy}>
                    {drain.label} {drain.pct}%
                  </DetailChip>
                ))}
              </div>
            ) : null}
          </DetailCard>
        ) : null}

        {!fromSupabase && error ? (
          <div className="text-[12px] text-ios-muted">
            {error}
          </div>
        ) : null}
        {data.engine !== "openai" && data.debug ? (
          <div className="text-[12px] text-ios-muted">
            {t("AI 연결 디버그")}: {data.debug}
          </div>
        ) : null}
      </InsightDetailShell>

      <TodaySleepRequiredSheet
        open={openSleepGuide}
        onClose={() => setOpenSleepGuide(false)}
        onConfirm={moveToTodaySleepLog}
      />
    </>
  );
}
