"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ISODate } from "@/lib/date";
import {
  fromISODate,
  todayISO,
  toISODate,
  isISODate,
  endOfMonth,
  startOfMonth,
} from "@/lib/date";
import { useAppStoreSelector } from "@/lib/store";
import { computeVitalsRange, vitalMapByISO } from "@/lib/vitals";
import { countHealthRecordedDays } from "@/lib/healthRecords";
import { useI18n } from "@/lib/useI18n";

import { WeekStrip } from "@/components/home/WeekStrip";
import { BatteryGauge } from "@/components/home/BatteryGauge";

// ──────────────── 유틸 ────────────────

function isReasonableISODate(v: any): v is ISODate {
  if (!isISODate(v)) return false;
  const y = Number(String(v).slice(0, 4));
  return Number.isFinite(y) && y >= 2000 && y <= 2100;
}

function shiftBadgeClass(shift?: string) {
  switch (shift) {
    case "D":   return "bg-blue-50 text-blue-700 border-blue-200/70";
    case "E":   return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/70";
    case "N":   return "bg-violet-50 text-violet-700 border-violet-200/70";
    case "M":   return "bg-cyan-50 text-cyan-700 border-cyan-200/70";
    case "OFF": return "bg-emerald-50 text-emerald-700 border-emerald-200/70";
    case "VAC": return "bg-amber-50 text-amber-700 border-amber-200/70";
    default:    return "bg-black/[0.04] text-black/60 border-black/10";
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

// ──────────────── 아이콘 (인라인 SVG) ────────────────

function IconChart() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

// ──────────────── 메인 컴포넌트 ────────────────

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

  // 깨진 store.selected 복구
  useEffect(() => {
    const raw = (store.selected as any) ?? null;
    if (raw != null && !isReasonableISODate(raw)) {
      store.setSelected(todayISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // vitals 범위: 선택 날짜 기준 해당 월
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
  const selNote = store.notes[homeSelected];
  const selEmotion = store.emotions[homeSelected];

  const headerDate = useMemo(() => formatHeaderDate(homeSelected), [homeSelected]);
  const greetingText = useMemo(() => greeting(), []);

  const notePreview = firstLine(selNote);
  const hasTodayData = selShift || selEmotion || notePreview;

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-6">

      {/* ① 헤더 */}
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--rnest-text)]">
            {headerDate}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--rnest-sub)]">{greetingText}</p>
        </div>
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--rnest-sub)] transition-opacity active:opacity-50"
          aria-label="설정"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      {/* ② WeekStrip */}
      <div className="rounded-[20px] bg-[var(--rnest-card)] px-3 py-3 shadow-apple-sm">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--rnest-muted)]">
            {t("이번 주")}
          </span>
          <Link
            href="/schedule"
            className="text-[12px] font-medium text-[var(--rnest-accent)] active:opacity-60"
          >
            {t("일정 전체")} ›
          </Link>
        </div>
        <WeekStrip
          selected={homeSelected}
          onSelect={setHomeSelected}
          schedule={store.schedule}
          shiftNames={store.shiftNames}
        />
      </div>

      {/* ③ Today 카드 */}
      <div className="rounded-[20px] bg-[var(--rnest-card)] px-5 py-4 shadow-apple-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--rnest-muted)]">
            {t("오늘")}
          </span>
          <Link
            href="/insights/recovery"
            className="text-[12px] font-medium text-[var(--rnest-accent)] active:opacity-60"
          >
            {t("AI 회복분석")} ›
          </Link>
        </div>

        {hasTodayData ? (
          <div className="mt-3 flex items-center gap-3">
            {/* 근무 배지 */}
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${shiftBadgeClass(selShift)}`}
            >
              {selShift
                ? selShiftName?.trim() || (selShift === "VAC" ? "VAC" : selShift)
                : t("미설정")}
            </span>

            {/* 기분 이모지 */}
            {selEmotion && (
              <span className="text-[20px] leading-none">{moodEmoji(selEmotion.mood)}</span>
            )}

            {/* 메모 첫줄 */}
            {notePreview ? (
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--rnest-sub)]">
                {notePreview}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-[var(--rnest-muted)]">
            {t("일정")} {t("탭에서 오늘 기록을 시작해요.")}
          </p>
        )}
      </div>

      {/* ④ Battery 카드 */}
      <div className="rounded-[20px] bg-[var(--rnest-card)] px-5 py-4 shadow-apple-sm">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--rnest-muted)]">
          {t("컨디션")}
        </span>

        {selVital ? (
          <div className="mt-4 flex items-center justify-around">
            <div className="flex flex-col items-center gap-2">
              <BatteryGauge value={selVital.body.value} label="Body" tone={selVital.body.tone} kind="body" />
            </div>
            <div className="h-16 w-px bg-[var(--rnest-sep)]" />
            <div className="flex flex-col items-center gap-2">
              <BatteryGauge value={selVital.mental.ema} label="Mental" tone={selVital.mental.tone} kind="mental" />
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

      {/* ⑤ 퀵액션 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 인사이트 */}
        <Link
          href="/insights"
          className="rnest-pressable flex flex-col rounded-[20px] bg-[var(--rnest-card)] p-5 shadow-apple-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[var(--rnest-accent)]"><IconChart /></span>
            <span className="text-[16px] text-[var(--rnest-muted)]">›</span>
          </div>
          <p className="mt-4 text-[14px] font-semibold text-[var(--rnest-text)]">{t("인사이트")}</p>
          <p className="mt-0.5 text-[12px] text-[var(--rnest-muted)]">{t("트렌드 · 통계")}</p>
        </Link>

        {/* 간호 툴 */}
        <Link
          href="/tools"
          className="rnest-pressable flex flex-col rounded-[20px] bg-[var(--rnest-card)] p-5 shadow-apple-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[var(--rnest-accent)]"><IconWrench /></span>
            <span className="text-[16px] text-[var(--rnest-muted)]">›</span>
          </div>
          <p className="mt-4 text-[14px] font-semibold text-[var(--rnest-text)]">{t("간호 툴")}</p>
          <p className="mt-0.5 text-[12px] text-[var(--rnest-muted)]">{t("계산 · 안전정보")}</p>
        </Link>
      </div>

    </div>
  );
}
