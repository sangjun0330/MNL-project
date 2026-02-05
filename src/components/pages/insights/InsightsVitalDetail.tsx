"use client";

import { useMemo, useState } from "react";
import {
  InsightDetailShell,
  DetailCard,
  DetailChip,
  DETAIL_ACCENTS,
  DETAIL_GRADIENTS,
} from "@/components/pages/insights/InsightDetailShell";
import { useInsightsData, shiftKo, isInsightsLocked, INSIGHTS_MIN_DAYS } from "@/components/insights/useInsightsData";
import { formatKoreanDate } from "@/lib/date";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FACTOR_LABEL_KO, type FactorKey } from "@/lib/insightsV2";
import { statusFromScore, statusLabel } from "@/lib/wnlInsight";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { useI18n } from "@/lib/useI18n";

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

function Gauge({ value, color, label }: { value: number; color: string; label: string }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className="relative h-32 w-32 rounded-full"
      style={{ background: `conic-gradient(${color} ${safe * 3.6}deg, rgba(0,0,0,0.08) 0)` }}
    >
      <div className="absolute inset-[11px] flex flex-col items-center justify-center rounded-full bg-white">
        <div className="text-[52px] font-extrabold leading-none tracking-[-0.03em] text-ios-text">{safe}</div>
        <div className="text-[14px] font-semibold text-ios-sub">{label}</div>
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
    syncLabel,
    accuracy,
    todayDisplay,
    top3,
    hasTodayShift,
    menstrual,
    avgBody,
    avgMental,
    recordedDays,
  } = useInsightsData();
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
  const status = useMemo(() => statusFromScore(todayDisplay), [todayDisplay]);
  const vitalColor = useMemo(() => statusAccent(status), [status]);

  const bodyDelta = useMemo(() => body - avgBody, [body, avgBody]);
  const mentalDelta = useMemo(() => mental - avgMental, [mental, avgMental]);

  if (isInsightsLocked(recordedDays)) {
    return (
      <InsightDetailShell
        title="WNL Vital"
        subtitle={formatKoreanDate(end)}
        meta={t("건강 기록 7일 이상부터 바이탈이 열립니다.")}
        tone="mint"
      >
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  return (
    <InsightDetailShell
      title="WNL Vital"
      subtitle={formatKoreanDate(end)}
      chips={(
        <>
          <DetailChip color={DETAIL_ACCENTS.navy}>{hasTodayShift ? shiftKo(todayShift) : t("근무 미설정")}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.mint}>{menstrual.enabled ? t(menstrual.label) : t("주기")}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.pink}>{t(statusLabel(status))}</DetailChip>
          <DetailChip color={DETAIL_ACCENTS.mint}>{syncLabel}</DetailChip>
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailCard className="p-5">
          <div className="flex items-start justify-between gap-4">
            <Gauge value={body} color={DETAIL_ACCENTS.mint} label="Body" />
            <div className="text-right">
              <div className="text-[13px] font-semibold text-ios-sub">{t("Body 변화")}</div>
              <div className="mt-2 text-[42px] font-extrabold tracking-[-0.03em] text-ios-text">{signed(bodyDelta)}</div>
            </div>
          </div>
        </DetailCard>

        <DetailCard className="p-5">
          <div className="flex items-start justify-between gap-4">
            <Gauge value={mental} color={DETAIL_ACCENTS.pink} label="Mental" />
            <div className="text-right">
              <div className="text-[13px] font-semibold text-ios-sub">{t("Mental 변화")}</div>
              <div className="mt-2 text-[42px] font-extrabold tracking-[-0.03em] text-ios-text">{signed(mentalDelta)}</div>
            </div>
          </div>
        </DetailCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <DetailChip color={DETAIL_ACCENTS.navy}>
          {t("수면부채")} {debt}h
        </DetailChip>
        <DetailChip color={DETAIL_ACCENTS.mint}>
          {t("리듬 부담")} {csi}%
        </DetailChip>
        <DetailChip color={DETAIL_ACCENTS.pink}>
          {t("카페인 영향")} {cif}%
        </DetailChip>
      </div>

      <DetailCard className="p-5" style={{ backgroundImage: DETAIL_GRADIENTS.mint }}>
        <div className="text-[12px] font-semibold text-ios-sub">Vital Snapshot</div>
        <div className="mt-1 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("오늘 상태 디테일")}</div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-ios-sep bg-white/92 p-3">
            <div className="text-[12px] font-semibold text-ios-sub">{t("바이탈(Vital)")}</div>
            <div className="mt-1 text-[22px] font-extrabold" style={{ color: vitalColor }}>
              {todayDisplay}
            </div>
          </div>
          <div className="rounded-2xl border border-ios-sep bg-white/92 p-3">
            <div className="text-[12px] font-semibold text-ios-sub">{t("연속 나이트")}</div>
            <div className="mt-1 text-[22px] font-extrabold">{night}</div>
          </div>
          <div className="rounded-2xl border border-ios-sep bg-white/92 p-3">
            <div className="text-[12px] font-semibold text-ios-sub">{t("스트레스 부하")}</div>
            <div className="mt-1 text-[22px] font-extrabold">{slf}%</div>
          </div>
          <div className="rounded-2xl border border-ios-sep bg-white/92 p-3">
            <div className="text-[12px] font-semibold text-ios-sub">{t("주기 영향")}</div>
            <div className="mt-1 text-[22px] font-extrabold">{mif}%</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-ios-sep bg-white/92 p-4">
            <div className="text-[12px] font-semibold text-ios-sub">{t("리듬/수면/카페인")}</div>
            <div className="mt-2 text-[15px] font-semibold text-ios-text">CSI {pct(csi)} · SRI {pct(sri)} · CIF {pct(cif)}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("CSI는 리듬 부담, SRI는 회복, CIF는 카페인 영향(낮을수록 방해↑) 지표입니다.")}</div>
          </div>
          <div className="rounded-2xl border border-ios-sep bg-white/92 p-4">
            <div className="text-[12px] font-semibold text-ios-sub">{t("연속 나이트")}</div>
            <div className="mt-2 text-[26px] font-extrabold">{night}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("연속 나이트가 쌓이면 회복 우선순위를 더 높입니다.")}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {top3?.map((item) => (
            <DetailChip key={item.key} color={DETAIL_ACCENTS.mint}>
              {t("드라이버 · {label}", { label: `${t(FACTOR_LABEL_KO[item.key as FactorKey])} ${pct(item.pct * 100)}` })}
            </DetailChip>
          ))}
        </div>
      </DetailCard>

      <DetailCard className="p-5">
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
      </DetailCard>

      <DetailCard className="p-5">
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
                        style={{ width: `${cov * 100}%`, backgroundColor: DETAIL_ACCENTS.mint, opacity: alpha }}
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
