"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ISODate } from "@/lib/date";
import { addDays, endOfMonth, formatKoreanDate, startOfMonth, toISODate, fromISODate, todayISO } from "@/lib/date";
import { useAppStore } from "@/lib/store";
import { computeVitalsRange } from "@/lib/vitals";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { cn } from "@/lib/cn";

import { Card } from "@/components/ui/Card";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { MonthCalendar } from "@/components/home/MonthCalendar";
import { ScheduleRecordSheet } from "@/components/schedule/ScheduleRecordSheet";
import { ShiftPatternQuickApplyCard } from "@/components/schedule/ShiftPatternQuickApplyCard";
import { MenstrualSettingsForm } from "@/components/settings/MenstrualSettingsForm";
import { useI18n } from "@/lib/useI18n";

// ── 아이콘 컴포넌트 ─────────────────────────────────────────
function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconCoffee() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconSmile() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

// ── 헬퍼 ──────────────────────────────────────────────────
function stressLabel(s: number) {
  return s === 0 ? "낮음" : s === 1 ? "보통" : s === 2 ? "높음" : "매우 높음";
}

function activityLabel(a: number) {
  return a === 0 ? "가벼움" : a === 1 ? "보통" : a === 2 ? "많음" : "빡셈";
}

function moodLabel(m: number) {
  return m === 1 ? "매우 나쁨" : m === 2 ? "나쁨" : m === 3 ? "보통" : m === 4 ? "좋음" : "매우 좋음";
}

const SCHEDULE_PILL_BUTTON_CLASS =
  "rnest-pill-photo inline-flex h-11 items-center justify-center whitespace-nowrap px-5 text-[14px]";

export function SchedulePage() {
  const store = useAppStore();
  const { t } = useI18n();
  const router = useRouter();

  const [selected, setSelected] = useState<ISODate>(() => todayISO());
  const [month, setMonth] = useState<Date>(() => startOfMonth(fromISODate(todayISO())));
  const [openLog, setOpenLog] = useState(false);
  const [sleepFirstMode, setSleepFirstMode] = useState(false);
  const autoOpenGuard = useRef<string | null>(null);

  const [openPattern, setOpenPattern] = useState(false);
  const [openMenstrual, setOpenMenstrual] = useState(false);

  // 소셜 — 받은 요청 배지
  const [socialPendingCount, setSocialPendingCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const fetchPending = () => {
      fetch("/api/social/connections")
        .then((r) => r.json())
        .then((res) => {
          if (!cancelled && res.ok) {
            setSocialPendingCount(res.data?.pendingIncoming?.length ?? 0);
          }
        })
        .catch(() => {});
    };
    fetchPending();
    const timer = setInterval(fetchPending, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 날짜 선택 시 월 동기화
  const handleSelect = (iso: ISODate) => {
    setSelected(iso);
    setSleepFirstMode(false);
    const d = fromISODate(iso);
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) {
      setMonth(startOfMonth(d));
    }
  };

  // 월 변경 시 선택일 동기화
  useEffect(() => {
    const next = startOfMonth(fromISODate(selected));
    setMonth((prev) =>
      prev.getMonth() === next.getMonth() && prev.getFullYear() === next.getFullYear() ? prev : next
    );
  }, [selected]);

  // URL 파라미터로 자동 기록 열기
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

  // 월간 범위
  const range = useMemo(() => ({
    start: toISODate(startOfMonth(month)),
    end: toISODate(endOfMonth(month)),
  }), [month]);

  // 바이탈 계산
  const vitals = useMemo(
    () => computeVitalsRange({ state: store, start: range.start, end: range.end }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.schedule, store.notes, store.bio, store.emotions, store.settings, range.start, range.end]
  );

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

  // ── 월간 통계 ──────────────────────────────────────────
  const monthlyStats = useMemo(() => {
    const shiftCounts: Partial<Record<string, number>> = {};
    let sleepSum = 0;
    let sleepCount = 0;
    let recordCount = 0;
    let totalDays = 0;

    const start = fromISODate(range.start);
    const end = fromISODate(range.end);
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const iso = toISODate(d);
      totalDays++;
      const shift = store.schedule[iso];
      if (shift) shiftCounts[shift] = (shiftCounts[shift] ?? 0) + 1;
      const bio = store.bio?.[iso];
      const emo = store.emotions?.[iso];
      if (hasHealthInput(bio as any, emo as any)) recordCount++;
      if (bio?.sleepHours != null) {
        sleepSum += bio.sleepHours;
        sleepCount++;
      }
    }
    return { shiftCounts, sleepAvg: sleepCount > 0 ? sleepSum / sleepCount : null, recordCount, totalDays };
  }, [range, store.schedule, store.bio, store.emotions]);

  // ── 선택된 날짜 데이터 ──────────────────────────────────
  const selShift = store.schedule[selected];
  const selShiftName = store.shiftNames?.[selected];
  const selBio = store.bio?.[selected];
  const selEmotion = store.emotions[selected];
  const selNote = store.notes[selected];

  const hasAnyRecord = !!(
    selShift || selBio?.sleepHours != null || selBio?.stress != null ||
    selBio?.mood != null || selEmotion || selNote
  );

  // ── 캘린더 헤더에 들어갈 패턴·생리주기 아이콘 ─────────
  const calendarHeaderActions = (
    <>
      <button
        type="button"
        onClick={() => setOpenPattern(true)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
        title={t("3교대 패턴 적용")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setOpenMenstrual(true)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
        title={t("생리주기 설정")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
    </>
  );

  return (
    <div className="space-y-3 pb-4">

      {/* ── 월간 통계 요약 ──────────────────────────────── */}
      <Card className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-ios-muted">
            {month.getMonth() + 1}{t("월 요약")}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {SHIFT_LABELS.filter((s) => (monthlyStats.shiftCounts[s.id] ?? 0) > 0).map((s) => (
              <span key={s.id} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", shiftColor(s.id))}>
                {s.id} {monthlyStats.shiftCounts[s.id]}일
              </span>
            ))}
            {monthlyStats.sleepAvg != null && (
              <span className="text-[11px] text-ios-muted">
                평균 수면 {monthlyStats.sleepAvg.toFixed(1)}h
              </span>
            )}
            <span className="text-[11px] text-ios-muted">
              기록 {monthlyStats.recordCount}/{monthlyStats.totalDays}일
            </span>
          </div>
          </div>
          {/* 소셜 진입 버튼 */}
          <button
            type="button"
            onClick={() => router.push("/social")}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
            title={t("친구 일정 보기")}
            aria-label="친구 일정 보기"
          >
            {/* 사람 2명 아이콘 */}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {socialPendingCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
                {socialPendingCount > 9 ? "9+" : socialPendingCount}
              </span>
            )}
          </button>
        </div>
      </Card>

      {/* ── 선택된 날 뷰 카드 ────────────────────────────── */}
      <Card className="p-4">
        {/* 날짜 헤더 */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[15px] font-semibold text-ios-text">
              {formatKoreanDate(selected)}
            </div>
            {selShift && (
              <span className={cn("mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-semibold", shiftColor(selShift))}>
                {selShiftName?.trim() || SHIFT_LABELS.find((s) => s.id === selShift)?.hint || selShift}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpenLog(true)}
            className={cn(SCHEDULE_PILL_BUTTON_CLASS, "shrink-0")}
          >
            {t("기록하기")}
          </button>
        </div>

        {/* 기록 데이터 요약 */}
        {hasAnyRecord ? (
          <div className="mt-3 space-y-2">
            {/* 수면 */}
            {(selBio?.sleepHours != null || selBio?.napHours != null) && (
              <div className="flex items-center gap-2 text-[13px] text-ios-text">
                <IconMoon />
                <span>
                  {selBio?.sleepHours != null ? `수면 ${selBio.sleepHours}h` : ""}
                  {selBio?.napHours != null && selBio.napHours > 0 ? ` + 낮잠 ${selBio.napHours}h` : ""}
                  {(selBio?.sleepHours != null && selBio?.napHours != null && selBio.napHours > 0)
                    ? ` = 총 ${(selBio.sleepHours + selBio.napHours).toFixed(1)}h` : ""}
                </span>
              </div>
            )}
            {/* 컨디션 — 항목별 아이콘 */}
            {(selBio?.stress != null || selBio?.caffeineMg != null || selBio?.activity != null) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ios-muted">
                {selBio?.stress != null && (
                  <span className="flex items-center gap-1.5">
                    <IconActivity />
                    스트레스 {stressLabel(selBio.stress)}
                  </span>
                )}
                {selBio?.caffeineMg != null && (
                  <span className="flex items-center gap-1.5">
                    <IconCoffee />
                    카페인 {selBio.caffeineMg}mg
                  </span>
                )}
                {selBio?.activity != null && (
                  <span className="flex items-center gap-1.5">
                    <IconZap />
                    활동 {activityLabel(selBio.activity)}
                  </span>
                )}
              </div>
            )}
            {/* 기분 */}
            {(selBio?.mood != null || selEmotion) && (
              <div className="flex items-center gap-2 text-[13px] text-ios-text">
                <IconSmile />
                <span>
                  기분 {moodLabel(selBio?.mood ?? selEmotion?.mood ?? 3)}
                  {selEmotion?.tags?.[0] && (
                    <span className="ml-1.5 text-ios-muted">{selEmotion.tags[0]}</span>
                  )}
                </span>
              </div>
            )}
            {/* 근무 이벤트 */}
            {(selBio?.workEventTags?.length || selBio?.workEventNote) && (
              <div className="flex items-center gap-2 text-[12.5px] text-ios-muted">
                <IconBriefcase />
                <span>
                  {selBio?.workEventTags?.slice(0, 2).join(" · ")}
                  {(selBio?.workEventTags?.length ?? 0) > 2 && ` +${(selBio?.workEventTags?.length ?? 0) - 2}`}
                </span>
              </div>
            )}
            {/* 메모 */}
            {selNote && (
              <div className="flex items-start gap-2 rounded-xl bg-ios-bg px-3 py-2 text-[12.5px] text-ios-muted">
                <IconFileText />
                <span className="line-clamp-2 leading-relaxed">{selNote.split("\n")[0]}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 text-[13px] text-ios-muted">
            {t("아직 기록이 없어요. 기록하기를 눌러 시작해보세요.")}
          </div>
        )}
      </Card>

      {/* ── 캘린더 (Card 없이 직접) ─────────────────────── */}
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
        onSelect={handleSelect}
        headerActions={calendarHeaderActions}
      />

      {/* ── 기록 시트 ─────────────────────────────────────── */}
      <ScheduleRecordSheet
        open={openLog}
        onClose={() => {
          setOpenLog(false);
          setSleepFirstMode(false);
        }}
        iso={selected}
        sleepFirstMode={sleepFirstMode}
      />

      {/* ── 3교대 패턴 팝업 ───────────────────────────────── */}
      <BottomSheet
        open={openPattern}
        onClose={() => setOpenPattern(false)}
        title={t("3교대 패턴")}
        subtitle={t("선택한 날짜부터 자동 채우기")}
        variant="appstore"
      >
        <div className="pb-4">
          <ShiftPatternQuickApplyCard selectedISO={selected} />
        </div>
      </BottomSheet>

      {/* ── 생리주기 설정 팝업 ──────────────────────────────── */}
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
