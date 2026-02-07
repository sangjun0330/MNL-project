"use client";

import { useMemo, useState } from "react";
import {
  InsightDetailShell,
  DetailCard,
  DetailChip,
  DETAIL_ACCENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FACTOR_LABEL_KO, type FactorKey } from "@/lib/insightsV2";
import { statusFromScore, statusLabel } from "@/lib/wnlInsight";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";
import { BatteryGauge } from "@/components/home/BatteryGauge";

function clamp01(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function pct(n: number) {
  return `${Math.round(n)}%`;
}

function signed(v: number) {
  const rounded = Math.round(v * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function statusAccent(status: ReturnType<typeof statusFromScore>) {
  if (status === "stable") return DETAIL_ACCENTS.mint;
  if (status === "caution" || status === "observation") return DETAIL_ACCENTS.navy;
  return DETAIL_ACCENTS.pink;
}

function metricColor(value: number, thresholdGood: number, thresholdBad: number, invert = false) {
  if (invert) {
    if (value <= thresholdGood) return DETAIL_ACCENTS.mint;
    if (value >= thresholdBad) return DETAIL_ACCENTS.pink;
    return DETAIL_ACCENTS.navy;
  }
  if (value >= thresholdGood) return DETAIL_ACCENTS.mint;
  if (value <= thresholdBad) return DETAIL_ACCENTS.pink;
  return DETAIL_ACCENTS.navy;
}

function MetricRow({
  label,
  value,
  unit,
  barPct,
  barColor,
  empty = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  barPct: number;
  barColor: string;
  empty?: boolean;
}) {
  const safeBar = Math.max(0, Math.min(100, barPct));
  return (
    <div className="flex items-center gap-3">
      <div className="w-[100px] shrink-0 text-[13px] font-semibold text-ios-sub">{label}</div>
      <div className="flex-1">
        <div className="h-2 w-full rounded-full bg-ios-bg">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${safeBar}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
      <div className="w-[52px] shrink-0 text-right text-[14px] font-extrabold text-ios-text">
        {empty ? "—" : <>{value}{unit ?? ""}</>}
      </div>
    </div>
  );
}

export function InsightsVitalDetail() {
  const { t } = useI18n();
  const {
    end,
    todayShift,
    todayVital,
    todayHasInput,
    syncLabel,
    accuracy,
    todayDisplay,
    top3,
    hasTodayShift,
    avgBody,
    avgMental,
    recordedDays,
    hasInsightData,
  } = useInsightsData();
  const [openSync, setOpenSync] = useState(false);

  const body = useMemo(() => Math.round(todayVital?.body.value ?? 0), [todayVital]);
  const mental = useMemo(() => Math.round(todayVital?.mental.ema ?? 0), [todayVital]);
  const debt = useMemo(() => Math.round((todayVital?.engine?.sleepDebtHours ?? 0) * 10) / 10, [todayVital]);
  const sri = useMemo(() => Math.round(((todayVital?.engine?.SRI ?? todayVital?.engine?.SRS ?? 1) as number) * 100), [todayVital]);
  const csi = useMemo(() => Math.round(((todayVital?.engine?.CSI ?? todayVital?.engine?.CMF ?? 0) as number) * 100), [todayVital]);
  const caffeineImpact = useMemo(() => {
    const raw = (todayVital?.engine?.CSD ?? (1 - (todayVital?.engine?.CIF ?? 1))) as number;
    return Math.round(Math.max(0, Math.min(1, raw)) * 100);
  }, [todayVital]);
  const slf = useMemo(() => Math.round(((todayVital?.engine?.SLF ?? 0) as number) * 100), [todayVital]);
  const cycleImpact = useMemo(() => {
    const raw = 1 - ((todayVital?.engine?.MIF ?? 1) as number);
    return Math.round(Math.max(0, Math.min(1, raw)) * 100);
  }, [todayVital]);
  const status = useMemo(() => statusFromScore(todayDisplay ?? 0), [todayDisplay]);
  const hasSleepRecord = useMemo(
    () => Boolean(todayVital && (todayVital.inputs.sleepHours != null || todayVital.inputs.napHours != null)),
    [todayVital]
  );
  const hasSleepDebtSignal = useMemo(
    () => Boolean(todayVital && (hasSleepRecord || debt > 0 || (todayVital.engine?.debt_n ?? 0) > 0)),
    [todayVital, hasSleepRecord, debt]
  );
  const hasCaffeineRecord = useMemo(
    () => Boolean(todayVital && (todayVital.inputs.caffeineMg != null || todayVital.inputs.caffeineLastAt)),
    [todayVital]
  );
  const hasStressRecord = useMemo(() => Boolean(todayVital && todayVital.inputs.stress != null), [todayVital]);
  const hasMenstrualSignal = useMemo(
    () =>
      Boolean(
        todayVital &&
        todayVital.menstrual.enabled &&
        todayVital.menstrual.phase !== "none"
      ),
    [todayVital]
  );

  const bodyDelta = useMemo(() => body - avgBody, [body, avgBody]);
  const mentalDelta = useMemo(() => mental - avgMental, [mental, avgMental]);

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="RNest Vital"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 바이탈이 열립니다.")}
        tone="mint"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  if (!hasInsightData || !todayHasInput || !todayVital || todayDisplay == null) {
    return (
      <InsightDetailShell
        title="RNest Vital"
        subtitle={formatKoreanDate(end)}
        meta={t("오늘 바이탈 분석")}
        tone="mint"
      >
        <DetailCard className="p-5">
          <div className="text-[18px] font-bold tracking-[-0.01em] text-ios-text">{t("데이터가 없어요")}</div>
          <div className="mt-2 text-[14px] text-ios-sub">{t("기록 입력 시 자세한 정보 제공")}</div>
          <div className="mt-3 text-[13px] text-ios-muted">
            {t("오늘 기록을 입력하면 바이탈과 주요 지표를 정확하게 보여드려요.")}
          </div>
        </DetailCard>
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="RNest Vital"
      subtitle={formatKoreanDate(end)}
      chips={(
        <>
          <DetailChip color={DETAIL_ACCENTS.navy}>{hasTodayShift ? shiftKo(todayShift) : t("근무 미설정")}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.pink}>{t(statusLabel(status))}</DetailChip>
        </>
      )}
      meta={hasTodayShift ? `${shiftKo(todayShift)} · ${t("오늘 바이탈 분석")}` : t("오늘 바이탈 분석")}
      tone="mint"
      right={(
        <button
          type="button"
          onClick={() => setOpenSync(true)}
          className="rounded-full border border-ios-sep bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ios-sub shadow-apple-sm"
        >
          Sync
        </button>
      )}
    >
      {/* Body & Mental gauges */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard className="p-5">
          <div className="flex items-center justify-between gap-4">
            <BatteryGauge value={body} label="Body" kind="body" />
            <div className="text-right">
              <div className="text-[13px] font-semibold text-ios-sub">{t("Body 변화")}</div>
              <div className="mt-2 text-[42px] font-extrabold tracking-[-0.03em] text-ios-text">{signed(bodyDelta)}</div>
            </div>
          </div>
        </DetailCard>

        <DetailCard className="p-5">
          <div className="flex items-center justify-between gap-4">
            <BatteryGauge value={mental} label="Mental" kind="mental" />
            <div className="text-right">
              <div className="text-[13px] font-semibold text-ios-sub">{t("Mental 변화")}</div>
              <div className="mt-2 text-[42px] font-extrabold tracking-[-0.03em] text-ios-text">{signed(mentalDelta)}</div>
            </div>
          </div>
        </DetailCard>
      </div>

      {/* Key metrics - Apple Health style */}
      <DetailCard className="p-5">
        <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("오늘의 주요 지표")}</div>
        <div className="mt-1 text-[12.5px] text-ios-sub">
          {t("회복 지수")} {sri}%
        </div>
        <div className="mt-4 space-y-3">
          <MetricRow
            label={t("수면부채")}
            value={debt}
            unit="h"
            barPct={hasSleepDebtSignal ? Math.min((debt / 5) * 100, 100) : 0}
            barColor={hasSleepDebtSignal ? metricColor(debt, 1, 3, true) : "#D8D9DE"}
            empty={!hasSleepDebtSignal}
          />
          <MetricRow
            label={t("회복 지수")}
            value={sri}
            unit="%"
            barPct={hasSleepDebtSignal ? sri : 0}
            barColor={hasSleepDebtSignal ? metricColor(sri, 70, 40) : "#D8D9DE"}
            empty={!hasSleepDebtSignal}
          />
          <MetricRow
            label={t("리듬 부담")}
            value={csi}
            unit="%"
            barPct={hasTodayShift ? csi : 0}
            barColor={hasTodayShift ? metricColor(csi, 30, 60, true) : "#D8D9DE"}
            empty={!hasTodayShift}
          />
          <MetricRow
            label={t("카페인 영향")}
            value={caffeineImpact}
            unit="%"
            barPct={hasCaffeineRecord ? caffeineImpact : 0}
            barColor={hasCaffeineRecord ? metricColor(caffeineImpact, 30, 70, true) : "#D8D9DE"}
            empty={!hasCaffeineRecord}
          />
          <MetricRow
            label={t("스트레스 부하")}
            value={slf}
            unit="%"
            barPct={hasStressRecord ? slf : 0}
            barColor={hasStressRecord ? metricColor(slf, 30, 60, true) : "#D8D9DE"}
            empty={!hasStressRecord}
          />
          <MetricRow
            label={t("주기 영향")}
            value={cycleImpact}
            unit="%"
            barPct={hasMenstrualSignal ? cycleImpact : 0}
            barColor={hasMenstrualSignal ? metricColor(cycleImpact, 30, 70, true) : "#D8D9DE"}
            empty={!hasMenstrualSignal}
          />
        </div>
      </DetailCard>

      {/* Top drivers (simplified chips) */}
      {top3?.length ? (
        <div className="flex flex-wrap gap-2">
          {top3.map((item) => (
            <DetailChip key={item.key} color={DETAIL_ACCENTS.mint}>
              {t(FACTOR_LABEL_KO[item.key as FactorKey])} {pct(item.pct * 100)}
            </DetailChip>
          ))}
        </div>
      ) : null}

      {/* Sync BottomSheet */}
      <BottomSheet
        open={openSync}
        onClose={() => setOpenSync(false)}
        title={t("프리셉터 싱크(Sync)")}
        subtitle={t("입력률 × 영향도 기반으로 개인화 정확도를 계산합니다.")}
        maxHeightClassName="max-h-[76dvh]"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-ios-sep bg-ios-bg p-4">
            <div className="text-[13px] font-semibold">{t("예측 정확도")}</div>
            <div className="mt-2 flex items-end justify-between">
              <div
                className="text-[28px] font-extrabold"
                style={{
                  color:
                    accuracy.percent >= 70
                      ? DETAIL_ACCENTS.mint
                      : accuracy.percent >= 40
                      ? DETAIL_ACCENTS.navy
                      : DETAIL_ACCENTS.pink,
                }}
              >
                {accuracy.percent}%
              </div>
              <div className="text-[12.5px] text-ios-muted">{t("최근 7일 기준")}</div>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-white">
              <div
                className="h-2.5 rounded-full"
                style={{
                  width: `${clamp01(accuracy.percent / 100) * 100}%`,
                  backgroundColor:
                    accuracy.percent >= 70
                      ? DETAIL_ACCENTS.mint
                      : accuracy.percent >= 40
                      ? DETAIL_ACCENTS.navy
                      : DETAIL_ACCENTS.pink,
                }}
              />
            </div>
            {accuracy.missingTop?.length ? (
              <div className="mt-3 text-[12.5px] text-ios-sub">
                {t("우선 입력 추천: {items}", { items: accuracy.missingTop.map((m) => t(m.label)).join(" · ") })}
              </div>
            ) : (
              <div className="mt-3 text-[12.5px] text-ios-sub">
                {t("입력 패턴이 안정적이에요. 계속 유지하면 예측이 더 정교해집니다.")}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-ios-sep bg-white p-4">
            <div className="text-[13px] font-semibold">{t("요인별 입력률")}</div>
            <div className="mt-3 space-y-2">
              {(Object.keys(accuracy.coverage) as FactorKey[]).map((k) => {
                const cov = clamp01(accuracy.coverage[k]);
                const w = clamp01(accuracy.weights[k] ?? 0);
                const alpha = 0.18 + 0.42 * w;
                return (
                  <div key={k} className="rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-semibold">{t(FACTOR_LABEL_KO[k])}</div>
                      <div className="text-[12.5px] text-ios-muted">{Math.round(cov * 100)}%</div>
                    </div>
                    <div className="mt-2 h-2.5 w-full rounded-full bg-white">
                      <div
                        className="h-2.5 rounded-full"
                        style={{ width: `${cov * 100}%`, backgroundColor: DETAIL_ACCENTS.mint, opacity: alpha }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[12.5px] text-ios-muted">
            {t("* Sync는 \u201C최근 7일\u201D 기준입니다. 입력이 쌓이면 Recovery 처방의 근거(수치)가 더 단단해져요.")}
          </div>
        </div>
      </BottomSheet>
    </InsightDetailShell>
  );
}
