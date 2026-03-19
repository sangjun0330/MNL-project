"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { ISODate } from "@/lib/date";
import { todayISO, fromISODate, toISODate, addDays, addMonths, startOfMonth, formatMonthTitle, formatKoreanDate } from "@/lib/date";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/useI18n";

type MenstrualDraft = {
  enabled: boolean;
  lastPeriodStart: ISODate | null;
  cycleLength: number;
  periodLength: number;
};

function clampInt(n: number, min: number, max: number, fallback: number) {
  const v = Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(min, Math.min(max, v));
}

function parseIntOrNaN(s: string) {
  const t = s.trim();
  if (!t) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

export function MenstrualSettingsForm() {
  const store = useAppStore();
  const { t } = useI18n();
  const weekdays = useMemo(() => [t("일"), t("월"), t("화"), t("수"), t("목"), t("금"), t("토")], [t]);

  // =========================
  // ✅ 생리주기: "적용" 방식 (draft -> apply)
  // =========================
  const ms = store.settings.menstrual ?? {};

  const initialDraft: MenstrualDraft = useMemo(() => {
    return {
      enabled: Boolean(ms.enabled),
      lastPeriodStart: (ms.lastPeriodStart ?? null) as ISODate | null,
      cycleLength: clampInt(ms.cycleLength ?? 28, 20, 45, 28),
      periodLength: clampInt(ms.periodLength ?? 5, 2, 10, 5),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms.enabled, ms.lastPeriodStart, ms.cycleLength, ms.periodLength]);

  const [draft, setDraft] = useState<MenstrualDraft>(initialDraft);

  // ✅ 숫자 입력: 텍스트로 직접 입력
  const [cycleText, setCycleText] = useState<string>(() => String(initialDraft.cycleLength));
  const [periodText, setPeriodText] = useState<string>(() => String(initialDraft.periodLength));

  useEffect(() => {
    setDraft(initialDraft);
    setCycleText(String(initialDraft.cycleLength));
    setPeriodText(String(initialDraft.periodLength));
  }, [initialDraft]);

  const dirty = useMemo(() => {
    const storeCycle = clampInt(ms.cycleLength ?? 28, 20, 45, 28);
    const storePeriod = clampInt(ms.periodLength ?? 5, 2, 10, 5);

    const nextCycle = clampInt(parseIntOrNaN(cycleText), 20, 45, storeCycle);
    const nextPeriod = clampInt(parseIntOrNaN(periodText), 2, 10, storePeriod);

    return (
      draft.enabled !== Boolean(ms.enabled) ||
      (draft.lastPeriodStart ?? null) !== (ms.lastPeriodStart ?? null) ||
      nextCycle !== storeCycle ||
      nextPeriod !== storePeriod
    );
  }, [
    draft.enabled,
    draft.lastPeriodStart,
    cycleText,
    periodText,
    ms.enabled,
    ms.lastPeriodStart,
    ms.cycleLength,
    ms.periodLength,
  ]);

  const applyMenstrual = () => {
    const storeCycle = clampInt(ms.cycleLength ?? 28, 20, 45, 28);
    const storePeriod = clampInt(ms.periodLength ?? 5, 2, 10, 5);

    const nextCycle = clampInt(parseIntOrNaN(cycleText), 20, 45, storeCycle);
    const nextPeriod = clampInt(parseIntOrNaN(periodText), 2, 10, storePeriod);

    setCycleText(String(nextCycle));
    setPeriodText(String(nextPeriod));

    store.setSettings({
      menstrual: {
        enabled: draft.enabled,
        lastPeriodStart: draft.lastPeriodStart,
        cycleLength: nextCycle,
        periodLength: nextPeriod,
      },
    });
  };

  const resetMenstrual = () => {
    setDraft(initialDraft);
    setCycleText(String(initialDraft.cycleLength));
    setPeriodText(String(initialDraft.periodLength));
  };

  const setTodayAsStart = () => {
    const t = todayISO();
    setDraft((d) => ({ ...d, lastPeriodStart: t }));
  };

  const updateLastStart = (iso: ISODate | null) => {
    setDraft((d) => ({ ...d, lastPeriodStart: iso }));
  };

  // =========================
  // ✅ 날짜 선택: 모바일(iOS)=네이티브 date, PC=커스텀 캘린더 팝오버
  // =========================
  const [isCoarsePointer, setIsCoarsePointer] = useState(true);
  useEffect(() => {
    const m = window.matchMedia?.("(pointer: coarse)");
    setIsCoarsePointer(m?.matches ?? true);
    const handler = () => setIsCoarsePointer(m?.matches ?? true);
    m?.addEventListener?.("change", handler);
    return () => m?.removeEventListener?.("change", handler);
  }, []);

  const [dateOpen, setDateOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // 바깥 클릭 닫기(PC 팝오버용)
  useEffect(() => {
    if (!dateOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as any)) setDateOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dateOpen]);

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(fromISODate(todayISO())));
  useEffect(() => {
    // 선택된 날짜가 바뀌면 그 달로 이동
    const base = draft.lastPeriodStart ? fromISODate(draft.lastPeriodStart) : fromISODate(todayISO());
    setViewMonth(startOfMonth(base));
  }, [draft.lastPeriodStart]);

  const monthTitle = useMemo(() => formatMonthTitle(viewMonth), [viewMonth]);

  const calendarGrid = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const startWeekday = start.getUTCDay(); // 0=Sun
    const gridStart = addDays(start, -startWeekday);

    const days: { iso: ISODate; inMonth: boolean; day: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const iso = toISODate(d);
      const inMonth =
        d.getUTCMonth() === viewMonth.getUTCMonth() &&
        d.getUTCFullYear() === viewMonth.getUTCFullYear();
      days.push({ iso, inMonth, day: d.getUTCDate() });
    }
    return days;
  }, [viewMonth]);

  return (
    <>
      <div className="text-[16px] font-bold">{t("생리주기")}</div>
      <div className="mt-1 text-[12.5px] text-ios-muted">
        {t("시작일과 평균 주기/기간을 기준으로 캘린더에 자동 표시돼요.")}
      </div>

      <div className="mt-4 space-y-4 rounded-2xl border border-ios-sep bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-semibold">{t("사용")}</div>
          <Button
            variant="secondary"
            onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            className={draft.enabled ? "rnest-pill-photo is-active min-w-[72px]" : "rnest-pill-photo-muted min-w-[72px]"}
          >
            {draft.enabled ? "ON" : "OFF"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* ✅ 시작일: 모바일=네이티브 date, PC=커스텀 캘린더 */}
          <div className="min-w-0">
            <div className="mb-2 text-[13px] font-semibold">{t("마지막 생리 시작일")}</div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative" style={{ width: "fit-content", minWidth: 150 }}>
                {/* 보이는 칸 */}
                <button
                  type="button"
                  onClick={() => {
                    // PC에서는 커스텀 캘린더 열기
                    if (!isCoarsePointer) setDateOpen((v) => !v);
                  }}
                  className="rnest-pill-photo flex h-11 items-center px-4 text-[13px]"
                >
                  {draft.lastPeriodStart ? formatKoreanDate(draft.lastPeriodStart) : t("날짜 선택")}
                </button>

                {/* 모바일/터치: 네이티브 date picker */}
                {isCoarsePointer ? (
                  <input
                    type="date"
                    value={draft.lastPeriodStart ?? ""}
                    onChange={(e) => updateLastStart((e.target.value || null) as any)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t("마지막 생리 시작일 선택")}
                  />
                ) : null}

                {/* PC: 커스텀 캘린더 팝오버 */}
                {!isCoarsePointer && dateOpen ? (
                  <div
                    ref={popRef}
                    className="absolute left-0 top-[56px] z-50 w-[300px] rounded-2xl border border-ios-sep bg-white p-3 shadow-apple"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="rnest-pill-photo px-2.5 py-1 text-[11px]"
                        onClick={() => setViewMonth((m) => addMonths(m, -1))}
                      >
                        {t("이전")}
                      </button>

                      <div className="text-[13px] font-semibold">{monthTitle}</div>

                      <button
                        type="button"
                        className="rnest-pill-photo px-2.5 py-1 text-[11px]"
                        onClick={() => setViewMonth((m) => addMonths(m, 1))}
                      >
                        {t("다음")}
                      </button>
                    </div>

                    <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold text-black/40">
                      {weekdays.map((w) => (
                        <div key={w} className="py-1">
                          {w}
                        </div>
                      ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {calendarGrid.map((c) => {
                        const selected = c.iso === draft.lastPeriodStart;
                        return (
                          <button
                            key={c.iso}
                            type="button"
                            onClick={() => {
                              if (!c.inMonth) return;
                              updateLastStart(c.iso);
                              setDateOpen(false);
                            }}
                            className={[
                              "h-9 rounded-xl text-[13px] font-semibold",
                              c.inMonth ? "text-black hover:bg-black/[0.04]" : "text-black/20",
                              selected ? "bg-black text-white hover:bg-black" : "",
                            ].join(" ")}
                          >
                            {c.inMonth ? c.day : ""}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rnest-pill-photo-muted px-3 py-2 text-[12px]"
                        onClick={() => {
                          updateLastStart(null);
                          setDateOpen(false);
                        }}
                      >
                        {t("비우기")}
                      </button>
                      <button
                        type="button"
                        className="rnest-pill-photo is-active px-3 py-2 text-[12px]"
                        onClick={() => {
                          setTodayAsStart();
                          setDateOpen(false);
                        }}
                      >
                        {t("오늘")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* 모바일에서는 네이티브 date picker가 버튼 위에 오버레이되므로 별도 버튼 불필요 */}
              {!isCoarsePointer ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={setTodayAsStart} className="rnest-pill-photo">
                    {t("오늘로 설정")}
                  </Button>
                  <Button variant="secondary" onClick={() => updateLastStart(null)} className="rnest-pill-photo-muted">
                    {t("비우기")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {/* ✅ 주기/기간: 폭 반 정도 */}
          <div className="min-w-0">
            <div className="mb-2 text-[13px] font-semibold">{t("평균 주기(일)")}</div>
            <div className="flex items-center gap-2">
              <div className="w-[140px] max-w-[55vw]">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="\\d*"
                  value={cycleText}
                  onChange={(e) => setCycleText(e.target.value)}
                  placeholder={t("예: 28")}
                />
              </div>
              <div className="text-[12px] text-ios-muted">{t("20~45일")}</div>
            </div>

            <div className="mt-4 mb-2 text-[13px] font-semibold">{t("생리 기간(일)")}</div>
            <div className="flex items-center gap-2">
              <div className="w-[140px] max-w-[55vw]">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="\\d*"
                  value={periodText}
                  onChange={(e) => setPeriodText(e.target.value)}
                  placeholder={t("예: 5")}
                />
              </div>
              <div className="text-[12px] text-ios-muted">{t("2~10일")}</div>
            </div>
          </div>
        </div>

        {/* ✅ 적용/되돌리기 */}
        <div className="mt-2 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={resetMenstrual} disabled={!dirty} className="rnest-pill-photo-muted">
            {t("되돌리기")}
          </Button>
          <Button variant="secondary" onClick={applyMenstrual} disabled={!dirty} className="rnest-pill-photo is-active">
            {t("적용")}
          </Button>
        </div>

        {!draft.lastPeriodStart ? (
          <div className="text-[12.5px] text-ios-muted">
            {t("시작일을 입력하면 캘린더에")}{" "}
            <span className="font-semibold text-black">{t("생리 / 생리 직전 / 컨디션 안정 / 컨디션 변화")}</span>{" "}
            {t("가 표시돼요.")}
          </div>
        ) : null}
      </div>

      {/* 색상 및 확률 안내 박스 */}
      <div className="mt-4 rounded-2xl border border-ios-sep bg-white p-4">
        <div className="text-[14px] font-semibold">{t("캘린더 색상 안내")}</div>
        <div className="mt-1 text-[12.5px] text-ios-muted">
          {t("건강기록과 주기를 함께 분석해 날짜별 생리 가능성을 색상으로 표시해요.")}
        </div>

        <div className="mt-4 grid gap-3">
          {/* 생리 기간 */}
          <div className="flex items-center gap-3">
            <span className="h-[4px] w-10 rounded-full bg-rose-500" />
            <div className="text-[13px]">
              <span className="font-semibold">{t("생리 기간")}</span>{" "}
              <span className="text-black/60">{t("(피로도가 높을 수 있어요)")}</span>
            </div>
          </div>

          {/* 생리 직전 */}
          <div className="flex items-center gap-3">
            <span className="h-[4px] w-10 rounded-full bg-amber-500" />
            <div className="text-[13px]">
              <span className="font-semibold">{t("생리 직전 기간")}</span>{" "}
              <span className="text-black/60">{t("(예민함/피로감이 생기기 쉬워요)")}</span>
            </div>
          </div>

          {/* 컨디션 안정 */}
          <div className="flex items-center gap-3">
            <span className="h-[4px] w-10 rounded-full bg-sky-500" />
            <div className="text-[13px]">
              <span className="font-semibold">{t("컨디션 안정 기간")}</span>{" "}
              <span className="text-black/60">{t("(회복이 잘 되는 편이에요)")}</span>
            </div>
          </div>

          {/* 컨디션 변화 */}
          <div className="flex items-center gap-3">
            <span className="h-[4px] w-10 rounded-full bg-sky-600" />
            <div className="text-[13px]">
              <span className="font-semibold">{t("컨디션 변화가 큰 날")}</span>{" "}
              <span className="text-black/60">{t("(변동이 클 수 있어요)")}</span>
            </div>
          </div>

          {/* 구분선 */}
          <div className="my-1 border-t border-ios-sep" />

          {/* 투명도 범례 */}
          <div className="grid gap-2">
            <div className="text-[12px] font-semibold text-ios-muted">{t("막대 스타일 = 예측 확신도")}</div>
            <div className="flex items-center gap-3">
              <span className="h-[4px] w-10 rounded-full bg-rose-500" style={{ opacity: 1 }} />
              <div className="text-[12px] text-black/70">
                <span className="font-semibold">{t("진한 실선")}</span>{" "}
                <span className="text-black/50">{t("— 직접 기록 또는 높은 확신")}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-[4px] w-10 rounded-full bg-rose-500" style={{ opacity: 0.62 }} />
              <div className="text-[12px] text-black/70">
                <span className="font-semibold">{t("연한 실선")}</span>{" "}
                <span className="text-black/50">{t("— 가능성 높음 (추정)")}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 점선 시뮬레이션 */}
              <svg width="40" height="4" aria-hidden="true">
                <line x1="0" y1="2" x2="40" y2="2" stroke="#F43F5E" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
              </svg>
              <div className="text-[12px] text-black/70">
                <span className="font-semibold">{t("점선")}</span>{" "}
                <span className="text-black/50">{t("— 가능성 있음 (낮은 확신)")}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-black/[0.03] p-3">
          <div className="text-[13px] font-semibold">{t("어떻게 계산되나요?")}</div>
          <div className="mt-1 text-[12.5px] leading-5 text-black/65">
            {t("건강기록(증상, 출혈, 기분, 수면)과 과거 주기 데이터를 함께 분석해, 날짜별 생리 가능성을 확률로 계산해요.")}
            <br />
            <span className="font-semibold text-black/70">{t("✔ 직접 기록할수록")}</span>
            {t(" 예측이 더 정확해지고, 개인 리듬에 맞게 학습돼요.")}
            <br />
            {t("이 표시는 건강 상태를 진단하기 위한 것이 아니라")}{" "}
            <span className="font-semibold text-black/70">{t("일정/컨디션 관리 참고용")}</span>
            {t("이에요.")}
          </div>

          <div className="mt-2 text-[12px] text-black/45">{t("※ 의료적 판단을 대신하지 않아요.")}</div>
        </div>
      </div>
    </>
  );
}
