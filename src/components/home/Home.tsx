"use client";

import { useEffect, useMemo, useState } from "react";
import type { ISODate } from "@/lib/date";
import {
  endOfMonth,
  formatKoreanDate,
  startOfMonth,
  toISODate,
  fromISODate,
  todayISO,
  isISODate,
} from "@/lib/date";
import { useAppStoreSelector } from "@/lib/store";
import { computeVitalsRange, vitalMapByISO } from "@/lib/vitals";
import { menstrualContextForDate } from "@/lib/menstrual";
import { countHealthRecordedDays } from "@/lib/healthRecords";

import { MonthCalendar } from "@/components/home/MonthCalendar";
import { BatteryGauge } from "@/components/home/BatteryGauge";
import { Card } from "@/components/ui/Card";

function toneLabel(t: "green" | "orange" | "red") {
  return t === "green" ? "안정" : t === "orange" ? "주의" : "경고";
}

function toneChipClass(t?: "green" | "orange" | "red") {
  if (!t) return "border-black/10 bg-black/[0.04] text-black/65";
  if (t === "green") return "border-emerald-200/70 bg-emerald-50/60 text-emerald-700";
  if (t === "orange") return "border-amber-200/70 bg-amber-50/60 text-amber-700";
  return "border-rose-200/70 bg-rose-50/60 text-rose-700";
}

function shiftChipClass(shift?: string) {
  switch (shift) {
    case "D":
      return "border-blue-200/70 bg-blue-50/60 text-blue-700";
    case "E":
      return "border-fuchsia-200/70 bg-fuchsia-50/60 text-fuchsia-700";
    case "N":
      return "border-violet-200/70 bg-violet-50/60 text-violet-700";
    case "M":
      return "border-cyan-200/70 bg-cyan-50/60 text-cyan-700";
    case "OFF":
      return "border-emerald-200/70 bg-emerald-50/60 text-emerald-700";
    case "VAC":
      return "border-amber-200/70 bg-amber-50/60 text-amber-700";
    default:
      return "border-black/10 bg-black/[0.04] text-black/65";
  }
}

function phaseChipClass(phase?: string) {
  switch (phase) {
    case "period":
      return "border-rose-200/70 bg-rose-50/60 text-rose-700";
    case "pms":
      return "border-amber-200/70 bg-amber-50/60 text-amber-700";
    case "ovulation":
      return "border-sky-200/70 bg-sky-50/60 text-sky-700";
    case "follicular":
      return "border-blue-200/70 bg-blue-50/60 text-blue-700";
    case "luteal":
      return "border-indigo-200/70 bg-indigo-50/60 text-indigo-700";
    default:
      return "border-black/10 bg-black/[0.04] text-black/65";
  }
}

function formatDelta(n?: number | null) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.round((n as number) * 10) / 10;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}`;
}

function formatHours(n?: number | null) {
  if (!Number.isFinite(n)) return null;
  const v = Math.round((n as number) * 10) / 10;
  return Number.isInteger(v) ? String(v.toFixed(0)) : String(v.toFixed(1));
}

function formatPct(n?: number | null, digits = 0) {
  if (!Number.isFinite(n)) return null;
  const v = Number(n) * 100;
  return digits === 0 ? String(Math.round(v)) : v.toFixed(digits);
}

// ✅ 연도 범위까지 체크 (1970 같은 깨진 값 방지)
function isReasonableISODate(v: any): v is ISODate {
  if (!isISODate(v)) return false;
  const y = Number(String(v).slice(0, 4));
  // RNest 일정용: 너무 과거/미래면 저장 오류로 보고 리셋
  return Number.isFinite(y) && y >= 2000 && y <= 2100;
}

function sameMonthUTC(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

export default function Home() {
  const store = useAppStoreSelector(
    (s) => ({
      selected: s.selected,
      schedule: s.schedule,
      shiftNames: s.shiftNames,
      notes: s.notes,
      emotions: s.emotions,
      bio: s.bio,
      settings: s.settings,
      setSelected: s.setSelected,
    }),
    (a, b) =>
      a.selected === b.selected &&
      a.schedule === b.schedule &&
      a.shiftNames === b.shiftNames &&
      a.notes === b.notes &&
      a.emotions === b.emotions &&
      a.bio === b.bio &&
      a.settings === b.settings &&
      a.setSelected === b.setSelected
  );

  // ✅ 폰에 남아있는 1970 selected를 자동으로 오늘로 복구
  const selected: ISODate = useMemo(() => {
    const raw = (store.selected as any) ?? null;
    return isReasonableISODate(raw) ? raw : todayISO();
  }, [store.selected]);

  // ✅ month는 selected 기반으로 안전 초기화
  const [month, setMonth] = useState<Date>(() => startOfMonth(fromISODate(selected)));

  // ✅ selected가 바뀌면 month도 동기화 (엇갈림 방지)
  useEffect(() => {
    const next = startOfMonth(fromISODate(selected));
    setMonth((prev) => (sameMonthUTC(prev, next) ? prev : next));
  }, [selected]);

  // ✅ (옵션) 폰에서 selected가 1970으로 저장돼 있던 경우, 앱이 뜨자마자 store도 정상값으로 덮어쓰기
  useEffect(() => {
    const raw = (store.selected as any) ?? null;
    if (raw != null && !isReasonableISODate(raw)) {
      store.setSelected(todayISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const range = useMemo(() => {
    const start = toISODate(startOfMonth(month));
    const end = toISODate(endOfMonth(month));
    return { start, end };
  }, [month]);

  const vitals = useMemo(() => {
    return computeVitalsRange({ state: store, start: range.start, end: range.end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.schedule, store.notes, store.bio, store.emotions, store.settings, range.start, range.end]);

  const vmap = useMemo(() => vitalMapByISO(vitals), [vitals]);
  const recordedDays = useMemo(
    () => countHealthRecordedDays({ bio: store.bio, emotions: store.emotions }),
    [store.bio, store.emotions]
  );
  const canShowVitals = recordedDays >= 3;

  const riskColorByDate = useMemo(() => {
    if (!canShowVitals) return {} as Record<ISODate, "green" | "orange" | "red">;
    const m: Record<ISODate, "green" | "orange" | "red"> = {} as any;
    for (const v of vitals) m[v.dateISO] = v.mental.tone;
    return m;
  }, [vitals, canShowVitals]);

  const selVital = canShowVitals ? vmap.get(selected) : null;
  const selShift = store.schedule[selected];
  const selNote = store.notes[selected];
  const selEmotion = store.emotions[selected];
  const selBio = useMemo(() => (store.bio?.[selected] ?? null), [store.bio, selected]);
  const selShiftName = store.shiftNames?.[selected];

  const selDateLabel = useMemo(() => formatKoreanDate(selected), [selected]);

  const menstrual = store.settings.menstrual;
  const mctx = useMemo(() => menstrualContextForDate(selected, menstrual), [selected, menstrual]);

  const inputItems = useMemo(() => {
    const sleep = selBio?.sleepHours;
    const nap = (selBio as any)?.napHours ?? null;
    const stress = selBio?.stress;
    const activity = selBio?.activity;
    const caffeine = selBio?.caffeineMg;
    const symptom = (selBio as any)?.symptomSeverity ?? null;

    const stressLabel = stress == null ? null : ["낮음", "보통", "높음", "매우"][Number(stress)] ?? null;
    const activityLabel = activity == null ? null : ["가벼움", "보통", "많음", "빡셈"][Number(activity)] ?? null;
    const sleepLabel = sleep == null ? null : formatHours(sleep);
    const napLabel = nap && Number(nap) > 0 ? formatHours(Number(nap)) : null;

    return [
      {
        key: "sleep",
        label: "수면",
        value: sleepLabel ? `${sleepLabel}h` : null,
      },
      {
        key: "nap",
        label: "낮잠",
        value: napLabel ? `${napLabel}h` : null,
      },
      {
        key: "stress",
        label: "스트레스",
        value: stressLabel,
      },
      {
        key: "activity",
        label: "활동",
        value: activityLabel,
      },
      {
        key: "caffeine",
        label: "카페인",
        value: caffeine && Number(caffeine) > 0 ? `${Math.round(Number(caffeine))}mg` : null,
      },
      {
        key: "symptom",
        label: "증상",
        value: symptom && Number(symptom) > 0 ? `${Number(symptom)}/3` : null,
      },
    ];
  }, [selBio]);

  const visibleInputs = inputItems.filter((item) => item.value);

  return (
    <div className="space-y-3">
      <Card className="bg-white">
        <div className="p-5">
          <div>
            <div className="text-[20px] font-semibold tracking-[-0.02em]">{selDateLabel}</div>
            <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold shadow-apple-sm ${shiftChipClass(
                  selShift
                )}`}
              >
                {selShift
                  ? `근무 ${selShiftName?.trim() || (selShift === "VAC" ? "VA" : selShift)}`
                  : "근무 미설정"}
              </span>
              {menstrual.enabled && menstrual.lastPeriodStart ? (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold shadow-apple-sm ${phaseChipClass(
                    mctx.phase
                  )}`}
                >
                  {mctx.label}
                </span>
              ) : null}
              {selVital ? (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold shadow-apple-sm ${toneChipClass(
                    selVital.mental.tone
                  )}`}
                >
                  멘탈 {toneLabel(selVital.mental.tone)}
                </span>
              ) : null}
            </div>
          </div>

          {selVital ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-ios-sep bg-white p-3 shadow-apple-sm sm:p-4">
                <BatteryGauge value={selVital.body.value} label="Body" tone={selVital.body.tone} kind="body" />
                <div className="mt-3 flex items-center justify-between text-[12px] text-black/45">
                  <span>Body 변화</span>
                  <span className="font-semibold text-black/70">{formatDelta(selVital.body.change)}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-ios-sep bg-white p-3 shadow-apple-sm sm:p-4">
                <BatteryGauge value={selVital.mental.ema} label="Mental" tone={selVital.mental.tone} kind="mental" />
                <div className="mt-3 flex items-center justify-between text-[12px] text-black/45">
                  <span>Mental 변화</span>
                  <span className="font-semibold text-black/70">{formatDelta(selVital.mental.change)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-ios-sep bg-white p-4 text-[12.5px] text-ios-muted shadow-apple-sm">
              {canShowVitals ? (
                <>
                  기록이 아직 없어서 오늘 지표가 비어 있어.{" "}
                  <span className="font-semibold text-black">일정</span> 탭에서 날짜를 눌러 입력해줘.
                </>
              ) : (
                <>
                  건강 기록을 최소 3일 이상 입력해야 바디/멘탈 배터리가 보여요.{" "}
                  <span className="font-semibold text-black">현재 {recordedDays}일 기록됨</span>
                </>
              )}
            </div>
          )}

          {selVital?.engine ? (
            <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/85 px-3 py-1 text-[12px] font-semibold text-black/70 shadow-apple-sm">
                <span className="text-black/45">수면 부채</span>
                <span>{formatHours(selVital.engine.sleepDebtHours) ?? "0"}h</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/85 px-3 py-1 text-[12px] font-semibold text-black/70 shadow-apple-sm">
                <span className="text-black/45">리듬</span>
                <span>{formatPct(selVital.engine.CMF) ?? "0"}%</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/85 px-3 py-1 text-[12px] font-semibold text-black/70 shadow-apple-sm">
                <span className="text-black/45">카페인</span>
                <span>{formatPct(selVital.engine.CSD) ?? "0"}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        schedule={store.schedule}
        shiftNames={store.shiftNames}
        notes={store.notes}
        emotions={store.emotions}
        menstrual={store.settings.menstrual}
        scheduleAppliedFrom={(store.settings as any).schedulePatternAppliedFrom ?? null}
        riskColorByDate={riskColorByDate}
        selected={selected}
        onSelect={(iso) => {
          store.setSelected(iso);
          const d = fromISODate(iso);
          if (!sameMonthUTC(d, month)) setMonth(startOfMonth(d));
        }}
      />

      <details className="rounded-apple border border-ios-sep bg-white shadow-apple">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[14px] font-semibold">
          오늘 기록
          <span className="text-[12px] font-semibold text-black/40">열기</span>
        </summary>
        <div className="border-t border-ios-sep px-5 py-4">
          {visibleInputs.length ? (
            <div className="flex flex-wrap gap-2">
              {visibleInputs.map((item) => (
                <div
                  key={item.key}
                  className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/90 px-3 py-2 text-[12.5px] font-semibold text-black/70 shadow-apple-sm"
                >
                  <span className="text-black/50">{item.label}</span>
                  <span className="text-black">{item.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-ios-sep bg-white/90 p-4 text-[12.5px] text-ios-muted shadow-apple-sm">
              아직 기록이 없어요. <span className="font-semibold text-black">일정</span>에서 오늘 데이터를 입력해 주세요.
            </div>
          )}

          {selNote || selEmotion ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {selNote ? (
                <div className="rounded-2xl border border-ios-sep bg-white/90 p-4 shadow-apple-sm">
                  <div className="text-[12.5px] text-ios-muted">오늘 메모</div>
                  <div className="mt-2 text-[14px] font-semibold leading-relaxed">{selNote}</div>
                </div>
              ) : null}
              {selEmotion ? (
                <div className="rounded-2xl border border-ios-sep bg-white/90 p-4 shadow-apple-sm">
                  <div className="text-[12.5px] text-ios-muted">오늘 기분</div>
                  <div className="mt-2 text-[18px] font-semibold">
                    {selEmotion.mood}/5
                    <span className="ml-2 text-[14px] font-semibold text-black/60">
                      {(selEmotion.tags ?? []).slice(0, 3).join(" ")}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
