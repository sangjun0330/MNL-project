"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ISODate } from "@/lib/date";
import { addDays, endOfMonth, startOfMonth, toISODate, fromISODate, todayISO } from "@/lib/date";
import { useAppStore } from "@/lib/store";
import { computeVitalsRange } from "@/lib/vitals";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MonthCalendar } from "@/components/home/MonthCalendar";
import { ScheduleRecordSheet } from "@/components/schedule/ScheduleRecordSheet";
import { ShiftPatternQuickApplyCard } from "@/components/schedule/ShiftPatternQuickApplyCard";
import { MenstrualSettingsForm } from "@/components/settings/MenstrualSettingsForm";
import { useI18n } from "@/lib/useI18n";

export function SchedulePage() {
  const store = useAppStore();
  const { t } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<ISODate>(() => todayISO());

  const [month, setMonth] = useState<Date>(() => startOfMonth(fromISODate(selected)));
  const [openLog, setOpenLog] = useState(false);
  const [sleepFirstMode, setSleepFirstMode] = useState(false);
  const autoOpenGuard = useRef<string | null>(null);

  // ✅ 3교대 패턴 팝업
  const [openPattern, setOpenPattern] = useState(false);
  const [openMenstrual, setOpenMenstrual] = useState(false);

  useEffect(() => {
    const next = startOfMonth(fromISODate(selected));
    setMonth((prev) => (prev.getMonth() === next.getMonth() && prev.getFullYear() === next.getFullYear() ? prev : next));
  }, [selected]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const openHealthLog = params.get("openHealthLog");
    if (!openHealthLog) return;

    const focus = params.get("focus");
    const guardKey = `${openHealthLog}:${focus ?? ""}`;
    if (autoOpenGuard.current === guardKey) return;
    autoOpenGuard.current = guardKey;

    const today = todayISO();
    const yesterday = toISODate(addDays(fromISODate(today), -1));
    const iso =
      openHealthLog === "today"
        ? today
        : openHealthLog === "yesterday"
          ? yesterday
          : /^\d{4}-\d{2}-\d{2}$/.test(openHealthLog)
            ? (openHealthLog as ISODate)
            : null;

    if (!iso) return;
    setSelected(iso);
    setSleepFirstMode(iso === today && focus === "sleep");
    setOpenLog(true);
    router.replace("/schedule", { scroll: false });
  }, [router]);

  const range = useMemo(() => {
    const start = toISODate(startOfMonth(month));
    const end = toISODate(endOfMonth(month));
    return { start, end };
  }, [month]);

  const vitals = useMemo(() => {
    return computeVitalsRange({ state: store, start: range.start, end: range.end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.schedule, store.notes, store.bio, store.emotions, store.settings, range.start, range.end]);

  const recordedDays = useMemo(
    () => countHealthRecordedDays({ bio: store.bio, emotions: store.emotions }),
    [store.bio, store.emotions]
  );
  const canShowVitals = recordedDays >= 3;

  const riskColorByDate = useMemo(() => {
    if (!canShowVitals) return {} as Record<ISODate, "green" | "orange" | "red">;
    const m: Record<ISODate, "green" | "orange" | "red"> = {} as any;
    for (const v of vitals) {
      const bio = store.bio?.[v.dateISO] ?? null;
      const emo = store.emotions?.[v.dateISO] ?? null;
      if (hasHealthInput(bio as any, emo as any)) m[v.dateISO] = v.mental.tone;
    }
    return m;
  }, [vitals, store.bio, store.emotions, canShowVitals]);

  const selShift = store.schedule[selected];
  const selShiftName = store.shiftNames?.[selected];
  const selEmotion = store.emotions[selected];

  return (
    <div className="space-y-4">
      {/* 상단 안내 카드 */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[16px] font-semibold">{t("일정")}</div>
            <div className="mt-1 text-[12.5px] text-ios-muted">{t("날짜를 누르면 바로 기록이 열려요")}</div>
          </div>
        </div>

        <div className="mt-3 text-[12.5px] text-ios-muted">
          {selected} · {selShift ? `${t("근무")} ${selShiftName?.trim() || (selShift === "VAC" ? "VA" : selShift)}` : t("근무 미설정")}
          {selEmotion ? ` · ${selEmotion.mood}/5` : ""}
        </div>
      </Card>

      {/* 캘린더 */}
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        schedule={store.schedule}
        shiftNames={store.shiftNames}
        notes={store.notes}
        bio={store.bio}
        emotions={store.emotions}
        menstrual={store.settings.menstrual}
        scheduleAppliedFrom={(store.settings as any).schedulePatternAppliedFrom ?? null}
        riskColorByDate={riskColorByDate}
        selected={selected}
        onSelect={(iso) => {
          setSelected(iso);
          setSleepFirstMode(false);
          setOpenLog(true);

          const d = fromISODate(iso);
          if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) {
            setMonth(startOfMonth(d));
          }
        }}
      />

      {/* ✅ 3교대 패턴: 화면에서는 “간단 헤더 + 설정 버튼”만 */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold">{t("3교대 패턴 적용")}</div>
            <div className="mt-1 text-[12.5px] text-ios-muted">{t("선택한 날짜부터 자동 채우기")}</div>
          </div>

          <Button variant="secondary" onClick={() => setOpenPattern(true)}>
            {t("설정")}
          </Button>
        </div>
      </Card>

      {/* ✅ 생리주기 설정 */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold">{t("생리주기 설정")}</div>
            <div className="mt-1 text-[12.5px] text-ios-muted">{t("캘린더에 주기 표시를 설정합니다.")}</div>
          </div>

          <Button variant="secondary" onClick={() => setOpenMenstrual(true)}>
            {t("설정")}
          </Button>
        </div>
      </Card>

      {/* 기록 시트 */}
      <ScheduleRecordSheet
        open={openLog}
        onClose={() => {
          setOpenLog(false);
          setSleepFirstMode(false);
        }}
        iso={selected}
        sleepFirstMode={sleepFirstMode}
      />

      {/* ✅ 3교대 패턴 팝업(시트) */}
      <BottomSheet
        open={openPattern}
        onClose={() => setOpenPattern(false)}
        title={t("3교대 패턴")}
        subtitle={t("선택한 날짜부터 자동 채우기")}
        variant="appstore"
      >
        <div className="pb-4">
          {/* 기존 UI 그대로 재사용 */}
          <ShiftPatternQuickApplyCard selectedISO={selected} />
        </div>
      </BottomSheet>

      {/* ✅ 생리주기 설정 팝업 */}
      <BottomSheet
        open={openMenstrual}
        onClose={() => setOpenMenstrual(false)}
        title={t("생리주기 설정")}
        subtitle={t("시작일과 평균 주기/기간 입력")}
        variant="appstore"
        maxHeightClassName="max-h-[80dvh]"
      >
        <div className="pb-4">
          <Card className="p-5">
            <MenstrualSettingsForm />
          </Card>
        </div>
      </BottomSheet>
    </div>
  );
}
