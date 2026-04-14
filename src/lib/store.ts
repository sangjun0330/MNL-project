// src/lib/store.ts
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import type { AppState, AppStore, AppSettings, BioInputs, EmotionEntry } from "@/lib/model";
import { defaultSettings, emptyState } from "@/lib/model";
import { syncEmotionMoodMirror } from "@/lib/mood";
import type { Shift } from "@/lib/types";
import { autoAdjustMenstrualSettings } from "@/lib/menstrual";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { purgeAllAppStateDrafts } from "@/lib/appStateDraft";
import {
  CLIENT_DATA_SCOPE_APP_STATE,
  CLIENT_DATA_SCOPE_HOME_PREVIEW,
  CLIENT_DATA_SCOPE_RECOVERY_PLANNER,
  CLIENT_DATA_SCOPE_RECOVERY_SESSION,
  emitClientDataInvalidation,
} from "@/lib/clientDataEvents";

const STORAGE_KEY_BASE = "rnest_app_state_v1";
const RESET_VERSION_KEY = "rnest_reset_version";
const RESET_VERSION = "2026-03-12-1";
const SSR_SELECTED = "1970-01-01" as ISODate;
let clientInitialized = false;

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
    memo: base.memo,
    records: base.records,
    settings: defaultSettings(),
  };
}

let state: AppState = ssrSafeInitialState();
let version = 0;
const listeners = new Set<() => void>();
let hydrationReady = false;
const hydrationListeners = new Set<() => void>();

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

function emitHydrationChange() {
  for (const l of hydrationListeners) l();
}

function setHydrationReady(next: boolean) {
  if (hydrationReady === next) return;
  hydrationReady = next;
  emitHydrationChange();
}

function invalidateDerivedClientData() {
  emitClientDataInvalidation([
    CLIENT_DATA_SCOPE_APP_STATE,
    CLIENT_DATA_SCOPE_HOME_PREVIEW,
    CLIENT_DATA_SCOPE_RECOVERY_PLANNER,
    CLIENT_DATA_SCOPE_RECOVERY_SESSION,
  ]);
}

/**
 * Store is the mutation source only.
 * Persistent local draft + remote save are owned by CloudStateSync.
 */
function save() {}

function normalizeSettings(raw: any): AppSettings {
  const base = defaultSettings();
  const loaded = raw ?? {};
  const { theme: _ignoredTheme, ...loadedWithoutTheme } = loaded;
  const schedulePatternAppliedFrom =
    typeof loaded?.schedulePatternAppliedFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(loaded.schedulePatternAppliedFrom)
      ? (loaded.schedulePatternAppliedFrom as ISODate)
      : base.schedulePatternAppliedFrom ?? null;
  const defaultSchedulePattern =
    typeof loaded?.defaultSchedulePattern === "string"
      ? loaded.defaultSchedulePattern.replace(/\s+/g, "").trim().slice(0, 80)
      : base.defaultSchedulePattern;

  // menstrual: 구버전(startISO) → 신버전(lastPeriodStart) 호환
  const menstrualLoaded = loaded?.menstrual ?? {};
  const last = (menstrualLoaded.lastPeriodStart ?? menstrualLoaded.startISO ?? null) as ISODate | null;

  return {
    ...base,
    ...loadedWithoutTheme,
    schedulePatternEnabled: Boolean(loaded?.schedulePatternEnabled ?? base.schedulePatternEnabled),
    defaultSchedulePattern,
    schedulePatternAppliedFrom,
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
    language: loaded?.language === "en" ? "en" : "ko",
  };
}

function applyLoadedState(loaded: AppState, options?: { preserveNotebook?: boolean }) {
  const sanitized = sanitizeStatePayload(loaded);
  const preserveNotebook = options?.preserveNotebook ?? true;
  const currentNotebook = state;
  state = {
    ...ssrSafeInitialState(),
    ...sanitized,
    selected: (sanitized as any)?.selected ?? SSR_SELECTED,
    schedule: (sanitized as any)?.schedule ?? {},
    shiftNames: (sanitized as any)?.shiftNames ?? {},
    notes: (sanitized as any)?.notes ?? {},
    emotions: (sanitized as any)?.emotions ?? {},
    bio: (sanitized as any)?.bio ?? {},
    memo: preserveNotebook ? currentNotebook.memo : (sanitized as any)?.memo ?? emptyState().memo,
    records: preserveNotebook ? currentNotebook.records : (sanitized as any)?.records ?? emptyState().records,
    settings: normalizeSettings((sanitized as any)?.settings),
  };

  if (state.selected === SSR_SELECTED) {
    state = { ...state, selected: todayISO() };
  }
}

function initializeStoreOnClient() {
  if (typeof window === "undefined" || clientInitialized) return;
  purgeAllLocalStateIfNeeded();
  clientInitialized = true;
  registerDebugBridge();
  if (state.selected !== SSR_SELECTED) return;
  state = { ...state, selected: todayISO() };
  emit();
}

export function hydrateState(loaded: AppState) {
  if (!loaded) return;
  applyLoadedState(loaded, { preserveNotebook: true });
  setHydrationReady(true);
  invalidateDerivedClientData();
  emit();
}

export function resetAppStoreForHydration() {
  applyLoadedState(emptyState(), { preserveNotebook: false });
  setHydrationReady(false);
  invalidateDerivedClientData();
  emit();
}

export function hydrateEmptyAppState() {
  applyLoadedState(emptyState(), { preserveNotebook: false });
  setHydrationReady(true);
  invalidateDerivedClientData();
  emit();
}

export function setStorageScope(userId?: string | null) {
  void userId;
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
  purgeAllAppStateDrafts();
  window.localStorage.setItem(RESET_VERSION_KEY, RESET_VERSION);
  applyLoadedState(emptyState(), { preserveNotebook: false });
  setHydrationReady(true);
  emit();
}

export function setLocalSaveEnabled(enabled: boolean) {
  void enabled;
}

export function getLocalStateSavedAt() {
  return null;
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
  invalidateDerivedClientData();
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
  invalidateDerivedClientData();
}

function batchSetSchedule(patch: Record<ISODate, Shift>) {
  setState({
    schedule: {
      ...(state.schedule ?? {}),
      ...patch,
    },
  });
  invalidateDerivedClientData();
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
  invalidateDerivedClientData();
}

function clearNoteForDate(iso: ISODate) {
  const next = { ...(state.notes ?? {}) };
  delete next[iso];
  setState({ notes: next });
  invalidateDerivedClientData();
}

function setEmotionForDate(iso: ISODate, emo: EmotionEntry) {
  const emptyBioRecord: BioInputs = {
    sleepHours: null,
    napHours: null,
    stress: null,
    activity: null,
    caffeineMg: null,
    mood: null,
    symptomSeverity: null,
    menstrualStatus: null,
    menstrualFlow: null,
    shiftOvertimeHours: null,
    workEventTags: null,
    workEventNote: null,
  };
  const prevBio = (state.bio ?? {})[iso] ?? emptyBioRecord;
  const nextBio = { ...emptyBioRecord, ...prevBio, mood: emo.mood };
  setState({
    emotions: {
      ...(state.emotions ?? {}),
      [iso]: emo,
    },
    bio: {
      ...(state.bio ?? {}),
      [iso]: nextBio,
    },
  });
  invalidateDerivedClientData();
}

function clearEmotionForDate(iso: ISODate) {
  const nextEmotions = { ...(state.emotions ?? {}) };
  delete nextEmotions[iso];
  const nextBioMap = { ...(state.bio ?? {}) };
  const currentBio = nextBioMap[iso];
  if (currentBio) {
    const nextBio = { ...currentBio, mood: null };
    if (hasMeaningfulBioEntry(nextBio)) nextBioMap[iso] = nextBio;
    else delete nextBioMap[iso];
  }
  setState({ emotions: nextEmotions, bio: nextBioMap });
  invalidateDerivedClientData();
}

function hasMeaningfulBioEntry(entry: BioInputs | null | undefined) {
  if (!entry) return false;
  if (entry.sleepHours != null) return true;
  if (entry.napHours != null) return true;
  if (entry.sleepQuality != null) return true;
  if (entry.sleepTiming != null) return true;
  if (entry.stress != null) return true;
  if (entry.activity != null) return true;
  if (entry.caffeineMg != null) return true;
  if (entry.caffeineLastAt != null) return true;
  if (entry.fatigueLevel != null) return true;
  if (entry.mood != null) return true;
  if (entry.symptomSeverity != null) return true;
  if (entry.menstrualStatus != null) return true;
  if (entry.menstrualFlow != null) return true;
  if (entry.shiftOvertimeHours != null) return true;
  if (Array.isArray(entry.workEventTags) && entry.workEventTags.length > 0) return true;
  if (typeof entry.workEventNote === "string" && entry.workEventNote.trim().length > 0) return true;
  return false;
}

function setBioForDate(iso: ISODate, patch: Partial<BioInputs>) {
  const emptyBioRecord: BioInputs = {
    sleepHours: null,
    napHours: null,
    stress: null,
    activity: null,
    caffeineMg: null,
    mood: null,
    symptomSeverity: null,
    menstrualStatus: null,
    menstrualFlow: null,
    shiftOvertimeHours: null,
    workEventTags: null,
    workEventNote: null,
  };
  const prev = (state.bio ?? {})[iso] ?? emptyBioRecord;
  const nextBio = { ...emptyBioRecord, ...prev, ...patch };

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
  const shouldSyncMood = patch.mood !== undefined;
  const nextEmotions = { ...(state.emotions ?? {}) };
  if (shouldSyncMood) {
    const mirroredEmotion = syncEmotionMoodMirror((state.emotions ?? {})[iso] ?? null, patch.mood ?? null);
    if (mirroredEmotion) nextEmotions[iso] = mirroredEmotion;
    else delete nextEmotions[iso];
  }
  const nextBioMap = { ...(state.bio ?? {}) };
  if (hasMeaningfulBioEntry(nextBio)) nextBioMap[iso] = nextBio;
  else delete nextBioMap[iso];

  setState({
    bio: nextBioMap,
    emotions: nextEmotions,
    settings: nextSettings,
  });
  invalidateDerivedClientData();
}

function clearBioForDate(iso: ISODate) {
  const next = { ...(state.bio ?? {}) };
  delete next[iso];
  setState({ bio: next });
  invalidateDerivedClientData();
}

function setMemoState(next: AppState["memo"]) {
  setState({ memo: next });
}

function setRecordState(next: AppState["records"]) {
  setState({ records: next });
}

function getState() {
  return state;
}

/** Hook 외부에서 현재 스토어 상태를 직접 읽어야 할 때 사용합니다 (구독 없음). */
export function getAppState(): AppState {
  return state;
}

function registerDebugBridge() {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;
  const win = window as Window &
    typeof globalThis & {
      __RNEST_DEBUG__?: Record<string, unknown>;
    };
  win.__RNEST_DEBUG__ = {
    ...(win.__RNEST_DEBUG__ ?? {}),
    store: {
      getState,
      hydrateState,
      reset: hydrateEmptyAppState,
      setSelected,
      setSettings,
      setShiftForDate,
      batchSetSchedule,
      setNoteForDate,
      setEmotionForDate,
      setBioForDate,
    },
  };
}

export function isAppStoreHydrated() {
  return hydrationReady;
}

function buildStoreSnapshot(s: AppState): AppStore {
  const store: AppStore = {
    selected: s.selected,
    schedule: s.schedule,
    shiftNames: s.shiftNames,
    notes: s.notes,
    emotions: s.emotions,
    bio: s.bio,
    memo: s.memo,
    records: s.records,
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

    setMemoState,
    setRecordState,
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
    initializeStoreOnClient();
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
    initializeStoreOnClient();
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

export function useAppStoreHydrated() {
  useEffect(() => {
    initializeStoreOnClient();
  }, []);

  return useSyncExternalStore(
    (cb) => {
      hydrationListeners.add(cb);
      return () => hydrationListeners.delete(cb);
    },
    () => hydrationReady,
    () => false
  );
}
