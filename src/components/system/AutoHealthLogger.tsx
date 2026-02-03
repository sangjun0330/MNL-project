"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import { useAppStore } from "@/lib/store";
import { buildDailyHealthSnapshot, getOrCreateDeviceId } from "@/lib/healthLog";
import { enqueueDailyLog, flushOutbox } from "@/lib/logSync";

// 서로 다른 타입의 map들을 섞어도 날짜 키만 모을 수 있도록 unknown 기반으로 처리
function unionKeys(...maps: Array<Record<string, unknown> | undefined>): Set<string> {
  const s = new Set<string>();
  for (const m of maps) {
    if (!m) continue;
    for (const k of Object.keys(m)) s.add(k);
  }
  return s;
}

function diffMap(prev: Record<string, any> | undefined, next: Record<string, any> | undefined, out: Set<string>) {
  const p = prev ?? {};
  const n = next ?? {};
  const keys = unionKeys(p, n);
  for (const k of keys) {
    if (p[k] !== n[k]) out.add(k);
  }
}

// ✅ 최근 N일만 자동 스냅샷/동기화(과도한 업로드 방지)
// - schedule(근무표) 때문에 날짜 키가 수백개가 될 수 있어 120일은 과함
// - 운영 기준 7~14일이면 충분, 기본 14로 설정
const MAX_LOOKBACK_DAYS = 14;

export function AutoHealthLogger({ userId }: { userId?: string | null }) {
  const store = useAppStore(); // AppStore snapshot (store.getState 포함)
  const deviceId = useMemo(() => userId ?? getOrCreateDeviceId(), [userId]);

  const prevStateRef = useRef<ReturnType<typeof store.getState> | null>(null);
  const dirtyRef = useRef<Set<ISODate>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endOfDayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenDayRef = useRef<ISODate | null>(null);

  // ✅ dev/fast refresh/route 전환 등에서 초기 effect가 중복 실행되며 폭주하는 걸 방지
  const didInitRef = useRef(false);

  const scheduleEndOfDayFlush = useCallback(() => {
    if (typeof window === "undefined") return;
    const now = new Date();
    const flushAt = new Date(now);
    // 하루 끝나기 5분 전에 1회 업로드
    flushAt.setHours(23, 55, 0, 0);
    if (flushAt <= now) {
      // 이미 시간이 지나면 다음날 기준으로 예약
      flushAt.setDate(flushAt.getDate() + 1);
    }
    const delay = flushAt.getTime() - now.getTime();
    if (endOfDayTimer.current) clearTimeout(endOfDayTimer.current);
    endOfDayTimer.current = setTimeout(() => void flushOutbox(), delay);
  }, []);

  const markDirtyAndScheduleFlush = useCallback((dates: Iterable<ISODate>) => {
    const today = todayISO();
    const earliest = toISODate(addDays(fromISODate(today), -MAX_LOOKBACK_DAYS));

    for (const d of dates) {
      // ISODate yyyy-mm-dd => 문자열 비교 가능
      if (d >= earliest && d <= today) dirtyRef.current.add(d);
    }

    if (flushTimer.current) clearTimeout(flushTimer.current);

    // ✅ 변경 감지 디바운스: 입력 중에는 모아서 1번만 전송
    flushTimer.current = setTimeout(async () => {
      const batch = Array.from(dirtyRef.current);
      dirtyRef.current.clear();
      if (!batch.length) return;

      const state = store.getState();
      for (const iso of batch) {
        const payload = buildDailyHealthSnapshot({ state, deviceId, dateISO: iso });
        enqueueDailyLog(iso, payload, deviceId);
      }

      // ✅ 하루 끝나기 전에 한 번에 업로드하도록 예약
      scheduleEndOfDayFlush();
    }, 2_000);
  }, [deviceId, scheduleEndOfDayFlush, store]);

  // ✅ 최초 1회: 최근 기록이 있는 날짜만 스냅샷으로 enqueue
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const state = store.getState();

    // ✅ schedule(근무표)는 키가 너무 많아 폭주 원인 → 초기 스냅샷에서는 제외
    // 건강 로그 목적: bio/emotions/notes 중심
    const dates = unionKeys(state.bio, state.emotions, state.notes);

    const selected = state.selected;
    const today = todayISO();

    if (selected) dates.add(selected);
    dates.add(today);

    markDirtyAndScheduleFlush(Array.from(dates) as ISODate[]);

    // ✅ 하루 끝나기 전에 1회 업로드 + 날짜 변경 시 전날 데이터 업로드
    lastSeenDayRef.current = today;
    scheduleEndOfDayFlush();

    const maybeFlushOnRollover = () => {
      const nowDay = todayISO();
      if (lastSeenDayRef.current && nowDay !== lastSeenDayRef.current) {
        lastSeenDayRef.current = nowDay;
        // 날짜가 바뀌었으면 전날 기록을 서버로 전송
        void flushOutbox();
      }
    };

    const onOnline = () => {
      // 온라인 복귀 시, 날짜가 바뀌었으면 전날 기록 전송
      maybeFlushOnRollover();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        maybeFlushOnRollover();
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (endOfDayTimer.current) clearTimeout(endOfDayTimer.current);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [markDirtyAndScheduleFlush, scheduleEndOfDayFlush, store]);

  // ✅ store 업데이트 감지: 변경된 날짜만 dirty로 수집
  useEffect(() => {
    const next = store.getState();
    const prev = prevStateRef.current;

    const changed = new Set<string>();

    if (prev) {
      // ✅ schedule(근무표) 변화는 업로드 폭주 트리거가 될 수 있어 제외(필요하면 나중에 옵션화)
      // diffMap(prev.schedule as any, next.schedule as any, changed);

      diffMap(prev.bio as any, next.bio as any, changed);
      diffMap(prev.emotions as any, next.emotions as any, changed);
      diffMap(prev.notes as any, next.notes as any, changed);

      if (prev.selected !== next.selected && next.selected) changed.add(next.selected);
    }

    prevStateRef.current = next;

    if (changed.size) {
      markDirtyAndScheduleFlush(changed as any);
    }
  }, [store, markDirtyAndScheduleFlush]);

  return null;
}
