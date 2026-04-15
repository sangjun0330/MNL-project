"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ISODate } from "@/lib/date";
import { endOfMonth, formatKoreanDate, fromISODate, isISODate, startOfMonth, toISODate, todayISO } from "@/lib/date";
import { useAppStoreSelector } from "@/lib/store";
import { countHealthRecordedDays } from "@/lib/healthRecords";
import { computeVitalsRange, vitalMapByISO } from "@/lib/vitals";
import { useI18n } from "@/lib/useI18n";
import { useRecoveryPlanner } from "@/components/insights/useRecoveryPlanner";
import { BatteryGauge } from "@/components/home/BatteryGauge";
import { WeekStrip } from "@/components/home/WeekStrip";
import { HomeSocialCard } from "@/components/home/HomeSocialCard";
import { useCurrentAccountResources } from "@/lib/currentAccountResourceStore";

function isReasonableISODate(v: any): v is ISODate {
  if (!isISODate(v)) return false;
  const y = Number(String(v).slice(0, 4));
  return Number.isFinite(y) && y >= 2000 && y <= 2100;
}

function greeting(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
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

function cleanText(v?: string | null) {
  if (!v) return null;
  const out = String(v).replace(/\r\n/g, "\n").trim();
  return out || null;
}

// ── Icons ────────────────────────────────────────────────────────

function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function Home() {
  const { t } = useI18n();
  const aiPreviewDateISO = todayISO();
  const currentAccountResources = useCurrentAccountResources();
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
  useEffect(() => {
    const raw = (store.selected as any) ?? null;
    if (raw != null && !isReasonableISODate(raw)) {
      store.setSelected(todayISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const selNote = cleanText(store.notes[homeSelected]);

  const headerDate = useMemo(() => formatHeaderDate(homeSelected), [homeSelected]);
  const greetingText = useMemo(() => greeting(), []);
  const [deferredReady, setDeferredReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
        cancelIdleCallback?: (handle: number) => void;
      };
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const markReady = () => {
      if (!cancelled) setDeferredReady(true);
    };

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(markReady, { timeout: 900 });
    } else {
      timeoutId = setTimeout(markReady, 220);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  const planner = useRecoveryPlanner();
  const recoverySummary = currentAccountResources.recoverySummary;
  const latestBriefHeadline =
    recoverySummary?.dateISO === aiPreviewDateISO ? recoverySummary.headline : null;
  const latestOrderTitle =
    recoverySummary?.dateISO === aiPreviewDateISO ? recoverySummary.pendingOrderTitle : null;
  const latestOrdersCompleted =
    recoverySummary?.dateISO === aiPreviewDateISO ? Boolean(recoverySummary.ordersCompleted) : false;
  const aiHeadline = useMemo(() => {
    if (planner.state === "needs_records") return t("기록이 쌓이면 맞춤회복 카드 구조가 여기에 표시됩니다.");
    if (planner.focusFactor?.label) return `오늘 맞춤회복 해설을 만들어 보세요!`;
    return t("오늘의 AI 해설을 만들어 보세요!");
  }, [planner.focusFactor?.label, planner.state, t]);
  const plannerPreviewTitle = latestOrderTitle ?? (latestOrdersCompleted ? t("오늘 오더를 모두 완료했어요.") : t("오늘의 오더를 만들어 보세요!"));
  const selectedDateLabel = useMemo(() => formatKoreanDate(homeSelected), [homeSelected]);

  return (
    <div className="flex flex-col gap-3.5 px-0 pb-4 pt-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between px-1">
        <div>
          <h1
            className="text-[22px] font-semibold tracking-[-0.02em]"
            style={{ color: "var(--rnest-text)" }}
          >
            {headerDate}
          </h1>
          <p
            className="mt-0.5 text-[13px]"
            style={{ color: "var(--rnest-sub)" }}
          >
            {greetingText}
          </p>
        </div>
        <Link
          href="/settings"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-opacity active:opacity-50"
          style={{ color: "var(--rnest-sub)" }}
          aria-label="설정"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>

      {/* ── Week Strip ── */}
      <div
        className="rounded-[22px] px-3 py-3.5 shadow-apple-sm"
        style={{ background: "var(--rnest-card)" }}
      >
        <div className="mb-2.5 flex items-center justify-between px-1">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--rnest-muted)" }}
          >
            {t("이번 주")}
          </span>
          <Link
            href="/schedule"
            className="text-[12px] font-medium active:opacity-60"
            style={{ color: "var(--rnest-accent)" }}
            data-auth-allow
          >
            {t("일정 전체")} ›
          </Link>
        </div>
        <WeekStrip
          selected={homeSelected}
          onSelect={setHomeSelected}
          schedule={store.schedule}
          shiftNames={store.shiftNames}
          bio={store.bio}
        />
        <div
          className="mt-3 rounded-[14px] border px-3 py-2.5"
          style={{
            borderColor: "var(--rnest-sep)",
            background: "var(--rnest-bg)",
          }}
        >
          <div
            className="text-[11px] font-semibold"
            style={{ color: "var(--rnest-muted)" }}
          >
            {selectedDateLabel} · {t("메모")}
          </div>
          <div
            className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed"
            style={{ color: "var(--rnest-text)" }}
          >
            {selNote || t("작성된 메모가 없어요.")}
          </div>
        </div>
      </div>

      {/* ── AI Recovery Card ── */}
      <div
        className="rounded-[22px] px-4 py-4 shadow-apple-sm"
        style={{ background: "var(--rnest-card)" }}
      >
        {/* Top row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span style={{ color: "var(--rnest-lavender)" }}>
              <IconSparkle />
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--rnest-muted)" }}
            >
              {t("AI 맞춤회복")}
            </span>
          </div>
          <Link
            href="/insights/recovery/ai"
            className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium active:opacity-60"
            style={{
              borderColor: "var(--rnest-accent-border)",
              color: "var(--rnest-accent)",
            }}
          >
            {t("맞춤 회복 가기")} ›
          </Link>
        </div>

        <p
          className="mt-3 text-[15px] font-semibold leading-snug tracking-[-0.01em]"
          style={{ color: "var(--rnest-text)" }}
        >
          {latestBriefHeadline ?? aiHeadline}
        </p>
      </div>

      {/* ── Recovery Planner Card ── */}
      <Link
        href="/insights/recovery/orders"
        className="block rounded-[22px] px-4 py-4 shadow-apple-sm active:opacity-95"
        style={{ background: "var(--rnest-card)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span style={{ color: "var(--rnest-accent)" }}>
              <IconSparkle />
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--rnest-muted)" }}
            >
              {t("회복 플래너")}
            </span>
          </div>
          <span
            className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium"
            style={{
              borderColor: "var(--rnest-accent-border)",
              color: "var(--rnest-accent)",
            }}
          >
            {t("오늘 오더 보기")} ›
          </span>
        </div>

        <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--rnest-muted)" }}>
          {t("오늘의 오더")}
        </div>
        <p
          className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.02em]"
          style={{ color: "var(--rnest-text)" }}
        >
          {plannerPreviewTitle}
        </p>
      </Link>

      {/* ── Condition (compact) ── */}
      <div
        className="rounded-[22px] px-4 py-4 shadow-apple-sm"
        style={{ background: "var(--rnest-card)" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--rnest-muted)" }}
          >
            {t("컨디션")}
          </span>
          {selVital ? (
            <span
              className="text-[12px]"
              style={{ color: "var(--rnest-sub)" }}
            >
              {selectedDateLabel}
            </span>
          ) : null}
        </div>

        {selVital ? (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            <BatteryGauge value={selVital.body.value} label="Body" tone={selVital.body.tone} kind="body" size="compact" />
            <BatteryGauge value={selVital.mental.ema} label="Mental" tone={selVital.mental.tone} kind="mental" size="compact" />
          </div>
        ) : (
          <p
            className="mt-2 text-[13px]"
            style={{ color: "var(--rnest-muted)" }}
          >
            {recordedDays < 3
              ? t("건강 기록을 최소 3일 이상 입력해야 컨디션 지표가 보여요.")
              : t("기록이 아직 없어서 오늘 지표가 비어 있어요.")}
            {recordedDays < 3 && (
              <span
                className="ml-1 font-semibold"
                style={{ color: "var(--rnest-text)" }}
              >
                {t("현재 {count}일 기록됨", { count: recordedDays })}
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Social Groups Card (deferred) ── */}
      <HomeSocialCard deferred={deferredReady} />

      {/* ── Quick Nav (3-column: Insights · Social · Tools) ── */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/insights"
          className="rnest-pressable flex flex-col rounded-[20px] p-4 shadow-apple-sm"
          style={{ background: "var(--rnest-card)" }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--rnest-lavender)" }}>
              <IconChart />
            </span>
            <span
              className="text-[14px]"
              style={{ color: "var(--rnest-muted)" }}
            >
              ›
            </span>
          </div>
          <p
            className="mt-3 text-[13px] font-semibold"
            style={{ color: "var(--rnest-text)" }}
          >
            {t("인사이트")}
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--rnest-muted)" }}
          >
            {t("트렌드 · 통계")}
          </p>
        </Link>

        <Link
          href="/social"
          className="rnest-pressable flex flex-col rounded-[20px] p-4 shadow-apple-sm"
          style={{ background: "var(--rnest-card)" }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--rnest-lavender)" }}>
              <IconPeople />
            </span>
            <span
              className="text-[14px]"
              style={{ color: "var(--rnest-muted)" }}
            >
              ›
            </span>
          </div>
          <p
            className="mt-3 text-[13px] font-semibold"
            style={{ color: "var(--rnest-text)" }}
          >
            {t("소셜")}
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--rnest-muted)" }}
          >
            {t("그룹 · 챌린지")}
          </p>
        </Link>

        <Link
          href="/tools"
          className="rnest-pressable flex flex-col rounded-[20px] p-4 shadow-apple-sm"
          style={{ background: "var(--rnest-card)" }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--rnest-lavender)" }}>
              <IconWrench />
            </span>
            <span
              className="text-[14px]"
              style={{ color: "var(--rnest-muted)" }}
            >
              ›
            </span>
          </div>
          <p
            className="mt-3 text-[13px] font-semibold"
            style={{ color: "var(--rnest-text)" }}
          >
            {t("간호 툴")}
          </p>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--rnest-muted)" }}
          >
            {t("계산 · 안전")}
          </p>
        </Link>
      </div>

    </div>
  );
}
