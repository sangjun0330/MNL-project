"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ISODate } from "@/lib/date";
import {
  endOfMonth,
  formatKoreanDate,
  fromISODate,
  isISODate,
  startOfMonth,
  toISODate,
  todayISO,
} from "@/lib/date";
import type { BioInputs } from "@/lib/model";
import { useAppStoreSelector } from "@/lib/store";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import { computeVitalsRange, vitalMapByISO } from "@/lib/vitals";
import { useI18n } from "@/lib/useI18n";

import { useAIRecoveryInsights } from "@/components/insights/useAIRecoveryInsights";
import { BatteryGauge } from "@/components/home/BatteryGauge";
import { MonthCalendar } from "@/components/home/MonthCalendar";
import { WeekStrip } from "@/components/home/WeekStrip";
import { BottomSheet } from "@/components/ui/BottomSheet";

function isReasonableISODate(v: any): v is ISODate {
  if (!isISODate(v)) return false;
  const y = Number(String(v).slice(0, 4));
  return Number.isFinite(y) && y >= 2000 && y <= 2100;
}

function sameMonthUTC(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

function shiftBadgeClass(shift?: string) {
  switch (shift) {
    case "D":
      return "bg-blue-50 text-blue-700 border-blue-200/70";
    case "E":
      return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/70";
    case "N":
      return "bg-violet-50 text-violet-700 border-violet-200/70";
    case "M":
      return "bg-cyan-50 text-cyan-700 border-cyan-200/70";
    case "OFF":
      return "bg-emerald-50 text-emerald-700 border-emerald-200/70";
    case "VAC":
      return "bg-amber-50 text-amber-700 border-amber-200/70";
    default:
      return "bg-black/[0.04] text-black/60 border-black/10";
  }
}

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "좋은 아침이에요";
  if (h >= 12 && h < 18) return "좋은 오후에요";
  if (h >= 18 && h < 22) return "좋은 저녁이에요";
  return "늦은 밤이에요";
}

function formatHeaderDate(iso: ISODate): string {
  const d = fromISODate(iso);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${month}월 ${day}일 ${dow}요일`;
}

function moodEmoji(m: number) {
  return m === 1 ? "☹️" : m === 2 ? "😕" : m === 3 ? "😐" : m === 4 ? "🙂" : "😄";
}

function firstLine(note?: string) {
  if (!note) return "";
  return note.replace(/\r\n/g, "\n").trim().split("\n")[0].trim();
}

function cleanText(v?: string | null) {
  if (!v) return null;
  const out = String(v).replace(/\r\n/g, "\n").trim();
  return out || null;
}

function formatHours(n?: number | null) {
  if (!Number.isFinite(n)) return null;
  const v = Math.round((n as number) * 10) / 10;
  return Number.isInteger(v) ? String(v.toFixed(0)) : String(v.toFixed(1));
}

function compactShiftLabel(shift?: string, name?: string) {
  const custom = name?.trim();
  if (custom) return custom;
  if (!shift) return "미설정";
  if (shift === "VAC") return "VAC";
  return shift;
}

function buildBioItems(bio: BioInputs | null | undefined, t: (key: string, vars?: Record<string, any>) => string) {
  if (!bio) return [];
  const sleep = bio.sleepHours;
  const nap = bio.napHours;
  const stress = bio.stress;
  const activity = bio.activity;
  const caffeine = bio.caffeineMg;
  const symptom = bio.symptomSeverity;
  const workEventTags = Array.isArray(bio.workEventTags)
    ? bio.workEventTags.map((v) => String(v).trim()).filter(Boolean).join(", ")
    : null;

  const stressLabel = stress == null ? null : [t("낮음"), t("보통"), t("높음"), t("매우")][Number(stress)] ?? null;
  const activityLabel =
    activity == null ? null : [t("가벼움"), t("보통"), t("많음"), t("빡셈")][Number(activity)] ?? null;
  const symptomLabel = symptom == null ? null : Number(symptom) === 0 ? t("없음") : `${Number(symptom)}/3`;

  return [
    { key: "sleep", label: t("수면"), value: sleep == null ? null : `${formatHours(sleep)}h` },
    { key: "nap", label: t("낮잠"), value: nap == null || Number(nap) <= 0 ? null : `${formatHours(nap)}h` },
    { key: "stress", label: t("스트레스"), value: stressLabel },
    { key: "activity", label: t("활동"), value: activityLabel },
    { key: "caffeine", label: t("카페인"), value: caffeine && Number(caffeine) > 0 ? `${Math.round(Number(caffeine))}mg` : null },
    { key: "symptom", label: t("증상"), value: symptomLabel },
    { key: "workEventTags", label: t("근무 이벤트"), value: workEventTags || null },
  ].filter((item) => item.value);
}

function aiSummaryFallback(
  t: (key: string, vars?: Record<string, any>) => string,
  opts: { loading: boolean; generating: boolean; error: string | null }
) {
  if (opts.loading || opts.generating) return t("저장된 맞춤회복을 확인하고 있어요...");
  if (opts.error?.includes("requires_today_sleep")) return t("오늘 수면 입력 후 바로 개인 맞춤 회복 가이드를 시작해요.");
  if (opts.error?.includes("plan") || opts.error?.includes("subscription")) return t("AI 회복은 Pro 플랜에서 사용할 수 있어요.");
  if (opts.error?.includes("auth")) return t("로그인 후 오늘의 맞춤회복을 확인할 수 있어요.");
  return t("AI 회복분석에서 오늘 맞춤회복 한줄요약을 확인해요.");
}

function IconChart() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export default function Home() {
  const { t } = useI18n();
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

  const [homeSelected, setHomeSelected] = useState<ISODate>(() => todayISO());
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);
  const [scheduleMonth, setScheduleMonth] = useState<Date>(() => startOfMonth(fromISODate(todayISO())));

  useEffect(() => {
    const raw = (store.selected as any) ?? null;
    if (raw != null && !isReasonableISODate(raw)) {
      store.setSelected(todayISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextMonth = startOfMonth(fromISODate(homeSelected));
    setScheduleMonth((prev) => (sameMonthUTC(prev, nextMonth) ? prev : nextMonth));
  }, [homeSelected]);

  const range = useMemo(() => {
    const d = fromISODate(homeSelected);
    return {
      start: toISODate(startOfMonth(d)),
      end: toISODate(endOfMonth(d)),
    };
  }, [homeSelected]);

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

  const selVital = canShowVitals ? vmap.get(homeSelected) : null;
  const selShift = store.schedule[homeSelected];
  const selShiftName = store.shiftNames?.[homeSelected];
  const selNote = cleanText(store.notes[homeSelected]);
  const selEmotion = store.emotions[homeSelected] ?? null;
  const selBio = (store.bio?.[homeSelected] ?? null) as BioInputs | null;

  const today = todayISO();
  const todayShift = store.schedule[today];
  const todayShiftName = store.shiftNames?.[today];
  const todayEmotion = store.emotions[today] ?? null;

  const headerDate = useMemo(() => formatHeaderDate(homeSelected), [homeSelected]);
  const greetingText = useMemo(() => greeting(), []);

  const aiRecovery = useAIRecoveryInsights({ mode: "cache", enabled: true });
  const aiHeadline = useMemo(() => {
    const raw = aiRecovery.data?.result?.headline;
    if (typeof raw === "string") {
      const line = raw.replace(/\s+/g, " ").trim();
      if (line) return line;
    }
    return aiSummaryFallback(t, {
      loading: aiRecovery.loading,
      generating: aiRecovery.generating,
      error: aiRecovery.error,
    });
  }, [aiRecovery.data?.result?.headline, aiRecovery.loading, aiRecovery.generating, aiRecovery.error, t]);

  const selectedDateLabel = useMemo(() => formatKoreanDate(homeSelected), [homeSelected]);
  const selectedMoodScore = selEmotion?.mood ?? (selBio?.mood ?? null);
  const selectedHealthItems = useMemo(() => buildBioItems(selBio, t), [selBio, t]);
  const selectedEmotionTags = useMemo(
    () => (Array.isArray(selEmotion?.tags) ? selEmotion.tags.map((v) => String(v).trim()).filter(Boolean) : []),
    [selEmotion]
  );
  const emotionNote = cleanText(selEmotion?.note);
  const workEventNote = cleanText((selBio as any)?.workEventNote);
  const selectedHasRecord =
    Boolean(selShift) ||
    Boolean(selNote) ||
    Boolean(selEmotion) ||
    hasHealthInput(selBio, selEmotion);

  const openScheduleSheet = () => {
    setScheduleMonth(startOfMonth(fromISODate(homeSelected)));
    setScheduleSheetOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-0 pb-4 pt-5">
        <div className="flex items-start justify-between px-1">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--rnest-text)]">{headerDate}</h1>
            <p className="mt-0.5 text-[13px] text-[var(--rnest-sub)]">{greetingText}</p>
          </div>
          <Link
            href="/settings"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--rnest-sub)] transition-opacity active:opacity-50"
            aria-label="설정"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>

        <div className="rounded-[22px] bg-[var(--rnest-card)] px-3 py-3.5 shadow-apple-sm">
          <div className="mb-2.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--rnest-muted)]">{t("이번 주")}</span>
            <button
              type="button"
              onClick={openScheduleSheet}
              className="text-[12px] font-medium text-[var(--rnest-accent)] active:opacity-60"
              data-auth-allow
            >
              {t("일정 전체")} ›
            </button>
          </div>
          <WeekStrip selected={homeSelected} onSelect={setHomeSelected} schedule={store.schedule} shiftNames={store.shiftNames} />
        </div>

        <div className="rounded-[22px] bg-[var(--rnest-card)] px-4 py-4 shadow-apple-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--rnest-muted)]">
                {t("오늘 맞춤회복")}
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${shiftBadgeClass(
                    todayShift
                  )}`}
                >
                  {compactShiftLabel(todayShift, todayShiftName)}
                </span>
                {todayEmotion?.mood ? <span className="text-[18px] leading-none">{moodEmoji(todayEmotion.mood)}</span> : null}
              </div>
            </div>
            <Link
              href="/insights/recovery"
              className="shrink-0 text-[12px] font-medium text-[var(--rnest-accent)] active:opacity-60"
            >
              {t("AI 회복분석")} ›
            </Link>
          </div>

          <p
            className={[
              "mt-3 truncate text-[13px] leading-relaxed",
              aiRecovery.data?.result?.headline ? "text-[var(--rnest-text)]" : "text-[var(--rnest-sub)]",
            ].join(" ")}
            title={aiHeadline}
          >
            {aiHeadline}
          </p>
        </div>

        <div className="rounded-[22px] bg-[var(--rnest-card)] px-4 py-4 shadow-apple-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--rnest-muted)]">{t("컨디션")}</span>
            {selVital ? (
              <span className="text-[12px] text-[var(--rnest-sub)]">{selectedDateLabel}</span>
            ) : null}
          </div>

          {selVital ? (
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
              <div className="flex justify-center">
                <BatteryGauge value={selVital.body.value} label="Body" tone={selVital.body.tone} kind="body" size="large" />
              </div>
              <div className="mx-1 h-[86px] w-px bg-[var(--rnest-sep)]" />
              <div className="flex justify-center">
                <BatteryGauge value={selVital.mental.ema} label="Mental" tone={selVital.mental.tone} kind="mental" size="large" />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-[var(--rnest-muted)]">
              {recordedDays < 3
                ? t("건강 기록을 최소 3일 이상 입력해야 바디/멘탈 배터리가 보여요.")
                : t("기록이 아직 없어서 오늘 지표가 비어 있어.")}
              {recordedDays < 3 && (
                <span className="ml-1 font-semibold text-[var(--rnest-text)]">
                  {t("현재 {count}일 기록됨", { count: recordedDays })}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/insights" className="rnest-pressable flex flex-col rounded-[20px] bg-[var(--rnest-card)] p-5 shadow-apple-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--rnest-accent)]">
                <IconChart />
              </span>
              <span className="text-[16px] text-[var(--rnest-muted)]">›</span>
            </div>
            <p className="mt-4 text-[14px] font-semibold text-[var(--rnest-text)]">{t("인사이트")}</p>
            <p className="mt-0.5 text-[12px] text-[var(--rnest-muted)]">{t("트렌드 · 통계")}</p>
          </Link>

          <Link href="/tools" className="rnest-pressable flex flex-col rounded-[20px] bg-[var(--rnest-card)] p-5 shadow-apple-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--rnest-accent)]">
                <IconWrench />
              </span>
              <span className="text-[16px] text-[var(--rnest-muted)]">›</span>
            </div>
            <p className="mt-4 text-[14px] font-semibold text-[var(--rnest-text)]">{t("간호 툴")}</p>
            <p className="mt-0.5 text-[12px] text-[var(--rnest-muted)]">{t("계산 · 안전정보")}</p>
          </Link>
        </div>
      </div>

      <BottomSheet
        open={scheduleSheetOpen}
        onClose={() => setScheduleSheetOpen(false)}
        title={t("전체 일정")}
        subtitle={t("날짜를 선택하면 아래에 감정 · 메모 · 건강기록 전체가 보여요.")}
        maxHeightClassName="max-h-[88dvh]"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="h-11 rounded-full border border-ios-sep bg-white text-[13px] font-semibold text-ios-text"
              onClick={() => setScheduleSheetOpen(false)}
              data-auth-allow
            >
              {t("닫기")}
            </button>
            <Link
              href="/schedule"
              className="inline-flex h-11 items-center justify-center rounded-full bg-black text-[13px] font-semibold text-white"
              onClick={() => setScheduleSheetOpen(false)}
              data-auth-allow
            >
              {t("일정 탭 열기")}
            </Link>
          </div>
        }
      >
        <MonthCalendar
          month={scheduleMonth}
          onMonthChange={setScheduleMonth}
          schedule={store.schedule}
          shiftNames={store.shiftNames}
          notes={store.notes}
          emotions={store.emotions}
          menstrual={store.settings.menstrual}
          scheduleAppliedFrom={(store.settings as any).schedulePatternAppliedFrom ?? null}
          selected={homeSelected}
          onSelect={(iso) => {
            setHomeSelected(iso);
            const d = fromISODate(iso);
            if (!sameMonthUTC(d, scheduleMonth)) setScheduleMonth(startOfMonth(d));
          }}
        />

        <div className="mt-4 rounded-[18px] border border-ios-sep bg-white p-4 shadow-apple-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ios-text">{selectedDateLabel}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${shiftBadgeClass(
                    selShift
                  )}`}
                >
                  {t("근무")} {compactShiftLabel(selShift, selShiftName)}
                </span>
                {selectedMoodScore ? <span className="text-[18px] leading-none">{moodEmoji(Number(selectedMoodScore))}</span> : null}
                {selectedEmotionTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-[11px] font-medium text-black/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScheduleMonth(startOfMonth(fromISODate(homeSelected)))}
              className="rounded-full border border-ios-sep bg-white px-3 py-1.5 text-[11px] font-semibold text-ios-sub"
              data-auth-allow
            >
              {t("선택월 기준")}
            </button>
          </div>

          {selectedHealthItems.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedHealthItems.map((item) => (
                <div
                  key={item.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[11.5px] font-semibold text-black/75"
                >
                  <span className="text-black/45">{item.label}</span>
                  <span className="text-black">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {(selNote || emotionNote || workEventNote) && (
            <div className="mt-3 space-y-2">
              {selNote ? (
                <div className="rounded-2xl border border-ios-sep bg-white p-3">
                  <div className="text-[11.5px] font-semibold text-ios-sub">{t("메모")}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-ios-text whitespace-pre-wrap">{selNote}</div>
                </div>
              ) : null}
              {emotionNote ? (
                <div className="rounded-2xl border border-ios-sep bg-white p-3">
                  <div className="text-[11.5px] font-semibold text-ios-sub">{t("감정 메모")}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-ios-text whitespace-pre-wrap">{emotionNote}</div>
                </div>
              ) : null}
              {workEventNote ? (
                <div className="rounded-2xl border border-ios-sep bg-white p-3">
                  <div className="text-[11.5px] font-semibold text-ios-sub">{t("근무 이벤트 메모")}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-ios-text whitespace-pre-wrap">{workEventNote}</div>
                </div>
              ) : null}
            </div>
          )}

          {!selectedHasRecord ? (
            <div className="mt-3 rounded-2xl border border-ios-sep bg-white p-3 text-[12.5px] text-ios-sub">
              {t("이 날짜에는 아직 감정/메모/건강 기록이 없어요.")}
            </div>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}
