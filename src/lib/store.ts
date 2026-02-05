// src/lib/store.ts
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { safeParse } from "@/lib/safeParse";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import type { AppState, AppStore, AppSettings, BioInputs, EmotionEntry } from "@/lib/model";
import { defaultSettings, emptyState } from "@/lib/model";
import type { Shift } from "@/lib/types";
import { autoAdjustMenstrualSettings } from "@/lib/menstrual";

const STORAGE_KEY_BASE = "mnl_app_state_v1";
const RESET_VERSION_KEY = "mnl_reset_version";
const RESET_VERSION = "2026-02-03-2";
const SSR_SELECTED = "1970-01-01" as ISODate;
let currentStorageKey = STORAGE_KEY_BASE;
let localSaveEnabled = false;

/**
 * SSR hydration 안정:
 * - 서버 렌더 시점엔 localStorage가 없으니 항상 같은 초기값을 사용해야 함
 * - selected 같은 값이 서버/클라에서 달라지면 Hydration mismatch 발생
 */
function ssrSafeInitialState(): AppState {
  const base = emptyState();
  return {
    ...base,
    selected: SSR_SELECTED,
    schedule: {},
    shiftNames: {},
    notes: {},
    emotions: {},
    bio: {},
    settings: defaultSettings(),
  };
}

let state: AppState = ssrSafeInitialState();
let version = 0;
const listeners = new Set<() => void>();

// useSyncExternalStore는 getSnapshot 반환값을 Object.is로 비교합니다.
// 매 호출마다 "항상 새 객체"를 반환하면 React가 "값이 계속 바뀐다"고 판단해
// 강제 리렌더가 반복되며 (특히 개발 모드/StrictMode에서) 무한 루프가 날 수 있습니다.
// 따라서 version이 바뀔 때만 새 스냅샷을 만들고, 그 외에는 같은 참조를 재사용합니다.
let cachedStore: AppStore | null = null;
let cachedStoreVersion = -1;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function save() {
  if (typeof window === "undefined") return;
  if (!localSaveEnabled) return;
  try {
    window.localStorage.setItem(currentStorageKey, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function normalizeSettings(raw: any): AppSettings {
  const base = defaultSettings();
  const loaded = raw ?? {};

  // menstrual: 구버전(startISO) → 신버전(lastPeriodStart) 호환
  const menstrualLoaded = loaded?.menstrual ?? {};
  const last = (menstrualLoaded.lastPeriodStart ?? menstrualLoaded.startISO ?? null) as ISODate | null;

  return {
    ...base,
    ...loaded,
    menstrual: {
      ...base.menstrual,
      ...menstrualLoaded,
      lastPeriodStart: last,
    },
    profile: {
      ...base.profile,
      ...(loaded?.profile ?? {}),
      // 안전한 클램프 (0..1, 0.5..1.5)
      chronotype: Math.max(0, Math.min(1, Number((loaded?.profile ?? {}).chronotype ?? base.profile?.chronotype ?? 0.5))),
      caffeineSensitivity: Math.max(
        0.5,
        Math.min(1.5, Number((loaded?.profile ?? {}).caffeineSensitivity ?? base.profile?.caffeineSensitivity ?? 1.0))
      ),
    },
    theme: loaded?.theme === "dark" ? "dark" : "light",
    language: loaded?.language === "en" ? "en" : "ko",
  };
}

function applyLoadedState(loaded: AppState) {
  state = {
    ...ssrSafeInitialState(),
    ...loaded,
    selected: (loaded as any)?.selected ?? SSR_SELECTED,
    schedule: (loaded as any)?.schedule ?? {},
    shiftNames: (loaded as any)?.shiftNames ?? {},
    notes: (loaded as any)?.notes ?? {},
    emotions: (loaded as any)?.emotions ?? {},
    bio: (loaded as any)?.bio ?? {},
    settings: normalizeSettings((loaded as any)?.settings),
  };

  if (state.selected === SSR_SELECTED) {
    state = { ...state, selected: todayISO() };
  }
}

function loadFromStorage() {
  if (typeof window === "undefined") return;
  if (!localSaveEnabled) return;

  const raw = window.localStorage.getItem(currentStorageKey);
  const loaded = safeParse<AppState>(raw, ssrSafeInitialState());
  applyLoadedState(loaded);

  emit();
}

export function hydrateState(loaded: AppState) {
  if (!loaded) return;
  applyLoadedState(loaded);
  save();
  emit();
}

function buildStorageKey(userId?: string | null) {
  if (!userId) return STORAGE_KEY_BASE;
  return `${STORAGE_KEY_BASE}:${userId}`;
}

export function setStorageScope(userId?: string | null) {
  const nextKey = buildStorageKey(userId);
  if (nextKey === currentStorageKey) return;
  currentStorageKey = nextKey;
  loadFromStorage();
}

export function purgeAllLocalStateIfNeeded() {
  if (typeof window === "undefined") return;
  const current = window.localStorage.getItem(RESET_VERSION_KEY);
  if (current === RESET_VERSION) return;

  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_BASE)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);

  window.localStorage.setItem(RESET_VERSION_KEY, RESET_VERSION);
}

export function purgeAllLocalState() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_BASE)) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
  window.localStorage.setItem(RESET_VERSION_KEY, RESET_VERSION);
}

export function setLocalSaveEnabled(enabled: boolean) {
  localSaveEnabled = enabled;
}

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  save();
  emit();
}

// =========================
// Actions
// =========================

function setSettings(patch: Partial<AppSettings>) {
  const next = normalizeSettings({ ...state.settings, ...patch });
  setState({ settings: next });
}

function setSelected(iso: ISODate) {
  setState({ selected: iso });
}

function setShiftForDate(iso: ISODate, shift: Shift) {
  setState({
    schedule: {
      ...(state.schedule ?? {}),
      [iso]: shift,
    },
  });
}

function batchSetSchedule(patch: Record<ISODate, Shift>) {
  setState({
    schedule: {
      ...(state.schedule ?? {}),
      ...patch,
    },
  });
}

function setShiftNameForDate(iso: ISODate, name: string) {
  setState({
    shiftNames: {
      ...(state.shiftNames ?? {}),
      [iso]: name,
    },
  });
}

function clearShiftNameForDate(iso: ISODate) {
  const next = { ...(state.shiftNames ?? {}) };
  delete next[iso];
  setState({ shiftNames: next });
}

function setNoteForDate(iso: ISODate, note: string) {
  setState({
    notes: {
      ...(state.notes ?? {}),
      [iso]: note,
    },
  });
}

function clearNoteForDate(iso: ISODate) {
  const next = { ...(state.notes ?? {}) };
  delete next[iso];
  setState({ notes: next });
}

function setEmotionForDate(iso: ISODate, emo: EmotionEntry) {
  setState({
    emotions: {
      ...(state.emotions ?? {}),
      [iso]: emo,
    },
  });
}

function clearEmotionForDate(iso: ISODate) {
  const next = { ...(state.emotions ?? {}) };
  delete next[iso];
  setState({ emotions: next });
}

function setBioForDate(iso: ISODate, patch: Partial<BioInputs>) {
  const prev = (state.bio ?? {})[iso] ?? {};
  const nextBio = { ...prev, ...patch };

  const prevISO = toISODate(addDays(fromISODate(iso), -1));
  const prevBio = (state.bio ?? {})[prevISO] ?? null;
  const adjusted = autoAdjustMenstrualSettings({
    settings: state.settings.menstrual,
    iso,
    bio: nextBio,
    prevBio,
    bioMap: state.bio ?? {},
  });

  const nextSettings = adjusted ? { ...state.settings, menstrual: adjusted } : state.settings;

  setState({
    bio: {
      ...(state.bio ?? {}),
      [iso]: nextBio,
    },
    settings: nextSettings,
  });
}

function clearBioForDate(iso: ISODate) {
  const next = { ...(state.bio ?? {}) };
  delete next[iso];
  setState({ bio: next });
}

function getState() {
  return state;
}

function buildStoreSnapshot(s: AppState): AppStore {
  const store: AppStore = {
    selected: s.selected,
    schedule: s.schedule,
    shiftNames: s.shiftNames,
    notes: s.notes,
    emotions: s.emotions,
    bio: s.bio,
    settings: s.settings,

    getState,

    setSelected,
    setSettings,

    setShiftForDate,
    batchSetSchedule,
    setShiftNameForDate,
    clearShiftNameForDate,

    setNoteForDate,
    clearNoteForDate,

    setEmotionForDate,
    clearEmotionForDate,

    setBioForDate,
    clearBioForDate,
  };
  (store as any).__v = version;
  return store;
}

function getSnapshot(): AppStore {
  if (cachedStore && cachedStoreVersion === version) return cachedStore;
  cachedStore = buildStoreSnapshot(state);
  cachedStoreVersion = version;
  return cachedStore;
}

// =========================
// Hook
// =========================

export function useAppStore(): AppStore {
  useEffect(() => {
    loadFromStorage();
  }, []);

  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    // ✅ version이 바뀔 때만 새 스냅샷을 만들고 캐시를 재사용
    getSnapshot,
    // ✅ getServerSnapshot도 반드시 "캐시된 값"을 반환해야 함(React 경고/무한루프 방지)
    getSnapshot
  );

  return snap;
}

/**
 * Selector-based subscription to avoid unnecessary re-renders.
 * - Only updates when selected slice changes (by equality check)
 */
export function useAppStoreSelector<T>(
  selector: (store: AppStore) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const [selected, setSelected] = useState<T>(() => selector(getSnapshot()));
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    const checkForUpdates = () => {
      const next = selectorRef.current(getSnapshot());
      if (!isEqualRef.current(selectedRef.current, next)) {
        selectedRef.current = next;
        setSelected(next);
      }
    };

    listeners.add(checkForUpdates);
    return () => {
      listeners.delete(checkForUpdates);
    };
  }, []);

  return selected;
}
