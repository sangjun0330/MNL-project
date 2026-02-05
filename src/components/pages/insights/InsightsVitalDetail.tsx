"use client";

import { useMemo, useState } from "react";
import {
  InsightDetailShell,
  DetailSummaryCard,
  DetailCard,
  DetailChip,
  DETAIL_ACCENTS,
  DETAIL_GRADIENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { HeroDashboard } from "@/components/insights/v2/HeroDashboard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FACTOR_LABEL_KO, type FactorKey } from "@/lib/insightsV2";
import { WNL_COLORS, statusColor, statusFromScore } from "@/lib/wnlInsight";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

function clamp01(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function pct(n: number) {
  return `${Math.round(n)}%`;
}

export function InsightsVitalDetail() {
  const { t } = useI18n();
  const { end, todayShift, todayVital, syncLabel, fastCharge, accuracy, todayDisplay, top3, hasTodayShift, recordedDays } = useInsightsData();
  const [openSync, setOpenSync] = useState(false);

  const body = useMemo(() => Math.round(todayVital?.body.value ?? 0), [todayVital]);
  const mental = useMemo(() => Math.round(todayVital?.mental.ema ?? 0), [todayVital]);
  const debt = useMemo(() => Math.round((todayVital?.engine?.sleepDebtHours ?? 0) * 10) / 10, [todayVital]);
  const sri = useMemo(() => Math.round(((todayVital?.engine?.SRI ?? todayVital?.engine?.SRS ?? 1) as number) * 100), [todayVital]);
  const csi = useMemo(() => Math.round(((todayVital?.engine?.CSI ?? todayVital?.engine?.CMF ?? 0) as number) * 100), [todayVital]);
  const cif = useMemo(() => {
    const raw = (todayVital?.engine?.CIF ?? (1 - (todayVital?.engine?.CSD ?? 0))) as number;
    return Math.round(raw * 100);
  }, [todayVital]);
  const slf = useMemo(() => Math.round(((todayVital?.engine?.SLF ?? 0) as number) * 100), [todayVital]);
  const mif = useMemo(() => Math.round(((todayVital?.engine?.MIF ?? 1) as number) * 100), [todayVital]);
  const night = useMemo(() => todayVital?.engine?.nightStreak ?? 0, [todayVital]);

  const vitalColor = useMemo(() => statusColor(statusFromScore(todayDisplay)), [todayDisplay]);

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="WNL Vital"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 바이탈이 열립니다.")}
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="WNL Vital"
      subtitle={formatKoreanDate(end)}
      meta={hasTodayShift ? `${shiftKo(todayShift)} · ${t("오늘 바이탈 분석")}` : t("오늘 바이탈 분석")}
      right={(
        <button
          type="button"
          onClick={() => setOpenSync(true)}
          className="rounded-full border border-ios-sep bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ios-sub"
        >
          Sync
        </button>
      )}
    >
      <HeroDashboard vital={todayVital} syncLabel={syncLabel} fastCharge={fastCharge} />

      <DetailSummaryCard
        accent="mint"
        label="Vital Snapshot"
        title={t("오늘 상태")}
        metric={todayDisplay}
        metricLabel="/ 100"
        summary={(
          <>
            <span className="font-bold">Body {body}</span> · Mental {mental}
          </>
        )}
        detail={`Sleep Debt ${debt}h · SRI ${sri}% · CSI ${csi}%`}
        chips={(
          <>
            <DetailChip color={DETAIL_ACCENTS.mint}>{syncLabel}</DetailChip>
            {hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.mint}>{shiftKo(todayShift)}</DetailChip> : null}
          </>
        )}
      />

      <DetailCard className="mt-4 overflow-hidden" style={{ backgroundImage: DETAIL_GRADIENTS.mint }}>
        <div className="px-5 pt-5">
          <div className="text-[12px] font-semibold text-ios-sub">Vital Snapshot</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ios-text">{t("오늘 상태 디테일")}</div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("바이탈(Vital)")}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <div className="text-[28px] font-extrabold" style={{ color: vitalColor }}>{todayDisplay}</div>
                <div className="text-[12px] text-ios-muted">(Body+Mental)/2</div>
              </div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-ios-bg">
                <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, todayDisplay))}%`, backgroundColor: vitalColor }} />
              </div>
            </div>

            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("수면부채")}</div>
              <div className="mt-2 text-[26px] font-extrabold">
                {debt}
                <span className="ml-1 text-[14px] font-semibold text-ios-muted">h</span>
              </div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("부채가 높을수록 듀티 피로/실수 리스크가 증가합니다.")}</div>
            </div>

            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("바디 배터리")}</div>
              <div className="mt-2 text-[26px] font-extrabold">{body}</div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-ios-bg">
                <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, body))}%`, backgroundColor: WNL_COLORS.mint }} />
              </div>
            </div>

            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("멘탈 배터리")}</div>
              <div className="mt-2 text-[26px] font-extrabold">{mental}</div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-ios-bg">
                <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, mental))}%`, backgroundColor: WNL_COLORS.pink }} />
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("리듬/수면/카페인")}</div>
              <div className="mt-2 text-[15px] font-semibold text-ios-text">CSI {pct(csi)} · SRI {pct(sri)} · CIF {pct(cif)}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("CSI는 리듬 부담, SRI는 회복, CIF는 카페인 영향(낮을수록 방해↑) 지표입니다.")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("연속 나이트")}</div>
              <div className="mt-2 text-[26px] font-extrabold">{night}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{t("연속 나이트가 쌓이면 회복 우선순위를 더 높입니다.")}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {top3?.map((item) => (
              <DetailChip key={item.key} color={DETAIL_ACCENTS.mint}>
                {t("드라이버 · {label}", { label: `${t(FACTOR_LABEL_KO[item.key as FactorKey])} ${pct(item.pct * 100)}` })}
              </DetailChip>
            ))}
          </div>
        </div>
      </DetailCard>

      <DetailCard className="mt-4">
        <div className="px-5 pb-5 pt-4">
          <div className="text-[13px] font-semibold text-ios-sub">{t("오늘 상태")}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">Body</div>
              <div className="mt-1 text-[22px] font-extrabold">{body}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">Mental</div>
              <div className="mt-1 text-[22px] font-extrabold">{mental}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">Sleep Debt</div>
              <div className="mt-1 text-[22px] font-extrabold">{debt}h</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">SRI / CSI</div>
              <div className="mt-1 text-[18px] font-extrabold">
                {sri}% · {csi}%
              </div>
            </div>
          </div>
        </div>
      </DetailCard>

      <DetailCard className="mt-4">
        <div className="px-5 pb-5 pt-4">
          <div className="text-[13px] font-semibold text-ios-sub">{t("부가 지표")}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">SLF</div>
              <div className="mt-1 text-[22px] font-extrabold">{slf}%</div>
              <div className="mt-1 text-[11.5px] text-ios-muted">{t("스트레스 부하")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">MIF</div>
              <div className="mt-1 text-[22px] font-extrabold">{mif}%</div>
              <div className="mt-1 text-[11.5px] text-ios-muted">{t("주기 영향")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">CIF</div>
              <div className="mt-1 text-[22px] font-extrabold">{cif}%</div>
              <div className="mt-1 text-[11.5px] text-ios-muted">{t("카페인 영향")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12px] font-semibold text-ios-sub">CSI</div>
              <div className="mt-1 text-[22px] font-extrabold">{csi}%</div>
              <div className="mt-1 text-[11.5px] text-ios-muted">{t("리듬 부담")}</div>
            </div>
          </div>
        </div>
      </DetailCard>

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
                      ? WNL_COLORS.mint
                      : accuracy.percent >= 40
                      ? WNL_COLORS.yellow
                      : WNL_COLORS.pink,
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
                      ? WNL_COLORS.mint
                      : accuracy.percent >= 40
                      ? WNL_COLORS.yellow
                      : WNL_COLORS.pink,
                }}
              />
            </div>
            {accuracy.missingTop?.length ? (
              <div className="mt-3 text-[12.5px] text-ios-sub">
                {t("우선 입력 추천: {items}", { items: accuracy.missingTop.map((m) => m.label).join(" · ") })}
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
                        style={{ width: `${cov * 100}%`, backgroundColor: WNL_COLORS.mint, opacity: alpha }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-[12.5px] text-ios-muted">
            {t("* Sync는 “최근 7일” 기준입니다. 입력이 쌓이면 Recovery 처방의 근거(수치)가 더 단단해져요.")}
          </div>
        </div>
      </BottomSheet>
    </InsightDetailShell>
  );
}
