"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ISODate } from "@/lib/date";
import { diffDays, formatKoreanDate, todayISO } from "@/lib/date";
import type { ActivityLevel, MoodScore, StressLevel, BioInputs, EmotionEntry } from "@/lib/model";
import type { Shift } from "@/lib/types";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";


function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function moodEmoji(m: MoodScore) {
  return m === 1 ? "☹️" : m === 2 ? "😕" : m === 3 ? "😐" : m === 4 ? "🙂" : "😄";
}

type SaveState = "idle" | "saving" | "saved";

/**
 * 일정(캘린더) 전용 "빠른 기록" 시트
 * - 필수: 수면/스트레스/카페인/기분(항상 위)
 * - 추가: 활동량 + (생리 기능 ON일 때) 생리 증상 강도(1~5)
 * - 기본: 자동 저장 + "저장" 버튼(저장됨 ✓ 표시 후 닫힘)
 */
export function ScheduleRecordSheet({
  open,
  onClose,
  iso,
}: {
  open: boolean;
  onClose: () => void;
  iso: ISODate;
}) {
  const { t } = useI18n();
  const store = useAppStore();
  const storeRef = useRef(store);
  const menstrualEnabled = Boolean(store.settings.menstrual?.enabled);

  const [shift, setShift] = useState<Shift>("OFF");
  const [shiftNameText, setShiftNameText] = useState<string>("");
  const [customShiftMode, setCustomShiftMode] = useState(false);
  const shiftNameDebounce = useRef<any>(null);
  const skipShiftNameSync = useRef(true);

  // ✅ 필수 4개
  const [sleepText, setSleepText] = useState<string>("");
  const [stress, setStress] = useState<StressLevel>(1);
  const [caffeineText, setCaffeineText] = useState<string>("");
  const [mood, setMood] = useState<MoodScore>(3);

  // ✅ 추가 기록
  const [showMore, setShowMore] = useState(false);
  const [napText, setNapText] = useState<string>("");
  const [activity, setActivity] = useState<ActivityLevel>(1);
  const [symptomSeverity, setSymptomSeverity] = useState<0 | 1 | 2 | 3>(0);

  // ✅ 메모
  const [note, setNote] = useState<string>("");

  // ✅ 저장 상태
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<any>(null);
  const noteDebounce = useRef<any>(null);
  const skipNoteSync = useRef(true);
  const sleepDebounce = useRef<any>(null);
  const skipSleepSync = useRef(true);
  const caffeineDebounce = useRef<any>(null);
  const skipCaffeineSync = useRef(true);
  const napDebounce = useRef<any>(null);
  const skipNapSync = useRef(true);

  const stressOptions = useMemo(
    () => [
      { value: "0", label: t("낮음") },
      { value: "1", label: t("보통") },
      { value: "2", label: t("높음") },
      { value: "3", label: t("매우") },
    ],
    [t]
  );

  const activityOptions = useMemo(
    () => [
      { value: "0", label: t("가벼움") },
      { value: "1", label: t("보통") },
      { value: "2", label: t("많음") },
      { value: "3", label: t("빡셈") },
    ],
    [t]
  );

  const dateLabel = useMemo(() => formatKoreanDate(iso), [iso]);
  const canEditHealth = useMemo(() => {
    const delta = diffDays(todayISO(), iso);
    return delta >= 0 && delta <= 1;
  }, [iso]);

  const markSaved = () => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState("saved");
      saveTimer.current = setTimeout(() => setSaveState("idle"), 1200);
    }, 120);
  };

  const saveNoteNow = (next: string) => {
    const cleaned = next.replace(/\s+/g, " ").trim();
    if (cleaned) store.setNoteForDate(iso, next);
    else store.clearNoteForDate(iso);
    markSaved();
  };

  const saveSleepNow = (raw: string) => {
    const n = raw.trim() === "" ? null : Number(raw);
    const v = n == null || Number.isNaN(n) ? null : clamp(Math.round(n * 2) / 2, 0, 16);
    store.setBioForDate(iso, { sleepHours: v });
    markSaved();
  };

  const saveCaffeineNow = (raw: string) => {
    const n = raw.trim() === "" ? null : Number(raw);
    const v = n == null || Number.isNaN(n) ? null : clamp(Math.round(n), 0, 1000);
    store.setBioForDate(iso, { caffeineMg: v });
    markSaved();
  };

  const saveNapNow = (raw: string) => {
    const n = raw.trim() === "" ? null : Number(raw);
    const v = n == null || Number.isNaN(n) ? null : clamp(Math.round(n * 2) / 2, 0, 4);
    store.setBioForDate(iso, { napHours: v });
    markSaved();
  };

  const saveShiftNameNow = (raw: string) => {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    if (cleaned) store.setShiftNameForDate(iso, cleaned);
    else store.clearShiftNameForDate(iso);
    markSaved();
  };

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    if (!open) return;

    const st = storeRef.current;
    const curShift: Shift = st.schedule?.[iso] ?? "OFF";
    const curShiftName = st.shiftNames?.[iso] ?? "";
    const curNote = st.notes?.[iso] ?? "";
    const curBio = st.bio?.[iso] ?? null;
    const curEmotion: EmotionEntry | undefined = st.emotions?.[iso];

    setShift(curShift);
    setShiftNameText(curShiftName ?? "");
    setCustomShiftMode(Boolean(curShiftName?.trim()));
    skipShiftNameSync.current = true;

    // 필수 4개
    const bio = curBio ?? {};
    setSleepText(bio.sleepHours == null ? "" : String(bio.sleepHours));
    setStress((bio.stress ?? 1) as StressLevel);
    setCaffeineText(bio.caffeineMg == null ? "" : String(bio.caffeineMg));
    setMood((curEmotion?.mood ?? 3) as MoodScore);
    skipSleepSync.current = true;
    skipCaffeineSync.current = true;

    // 추가 기록
    setNapText((bio as any).napHours == null ? "" : String((bio as any).napHours));
    setActivity((bio.activity ?? 1) as ActivityLevel);
    setSymptomSeverity((Number((bio as any).symptomSeverity ?? 0) as any) as 0 | 1 | 2 | 3);
    skipNapSync.current = true;

    // 메모
    setNote(curNote);
    skipNoteSync.current = true;

    setSaveState("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (noteDebounce.current) clearTimeout(noteDebounce.current);
    if (shiftNameDebounce.current) clearTimeout(shiftNameDebounce.current);
    if (sleepDebounce.current) clearTimeout(sleepDebounce.current);
    if (caffeineDebounce.current) clearTimeout(caffeineDebounce.current);
    if (napDebounce.current) clearTimeout(napDebounce.current);
    setShowMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, iso]);

  // ✅ 메모 디바운스
  useEffect(() => {
    if (!open) return;
    if (skipNoteSync.current) {
      skipNoteSync.current = false;
      return;
    }
    if (noteDebounce.current) clearTimeout(noteDebounce.current);
    noteDebounce.current = setTimeout(() => saveNoteNow(note), 450);
    return () => {
      if (noteDebounce.current) clearTimeout(noteDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  useEffect(() => {
    if (!open || !canEditHealth) return;
    if (skipSleepSync.current) {
      skipSleepSync.current = false;
      return;
    }
    if (sleepDebounce.current) clearTimeout(sleepDebounce.current);
    sleepDebounce.current = setTimeout(() => saveSleepNow(sleepText), 450);
    return () => {
      if (sleepDebounce.current) clearTimeout(sleepDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepText, canEditHealth, open]);

  useEffect(() => {
    if (!open || !canEditHealth) return;
    if (skipCaffeineSync.current) {
      skipCaffeineSync.current = false;
      return;
    }
    if (caffeineDebounce.current) clearTimeout(caffeineDebounce.current);
    caffeineDebounce.current = setTimeout(() => saveCaffeineNow(caffeineText), 450);
    return () => {
      if (caffeineDebounce.current) clearTimeout(caffeineDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caffeineText, canEditHealth, open]);

  useEffect(() => {
    if (!open || !canEditHealth) return;
    if (skipNapSync.current) {
      skipNapSync.current = false;
      return;
    }
    if (napDebounce.current) clearTimeout(napDebounce.current);
    napDebounce.current = setTimeout(() => saveNapNow(napText), 450);
    return () => {
      if (napDebounce.current) clearTimeout(napDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [napText, canEditHealth, open]);

  useEffect(() => {
    if (!open) return;
    if (skipShiftNameSync.current) {
      skipShiftNameSync.current = false;
      return;
    }
    if (shiftNameDebounce.current) clearTimeout(shiftNameDebounce.current);
    shiftNameDebounce.current = setTimeout(() => saveShiftNameNow(shiftNameText), 450);
    return () => {
      if (shiftNameDebounce.current) clearTimeout(shiftNameDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftNameText]);

  const quickCaffeine = (cups: number) => {
    const mgPerCup = 120;
    const mg = clamp(cups * mgPerCup, 0, 1000);
    setCaffeineText(String(mg));
    store.setBioForDate(iso, { caffeineMg: mg });
    markSaved();
  };

  const adjustSleep = (delta: number) => {
    const base = sleepText.trim() === "" ? 7 : Number(sleepText);
    const cur = Number.isFinite(base) ? base : 7;
    const next = clamp(Math.round((cur + delta) * 2) / 2, 0, 16);
    setSleepText(String(next));
    store.setBioForDate(iso, { sleepHours: next });
    markSaved();
  };

  const setSleepChip = (hours: number) => {
    const next = clamp(Math.round(hours * 2) / 2, 0, 16);
    setSleepText(String(next));
    store.setBioForDate(iso, { sleepHours: next });
    markSaved();
  };

  const setMoodQuick = (m: MoodScore) => {
    setMood(m);
    const prev = store.emotions?.[iso];
    store.setEmotionForDate(iso, {
      ...(prev ?? {}),
      mood: m,
      createdAt: Date.now(),
    });
    markSaved();
  };

  const setStressQuick = (v: string) => {
    const s = Number(v) as StressLevel;
    setStress(s);
    store.setBioForDate(iso, { stress: s });
    markSaved();
  };

  const setActivityQuick = (v: string) => {
    const a = Number(v) as ActivityLevel;
    setActivity(a);
    store.setBioForDate(iso, { activity: a });
    markSaved();
  };

  const setSymptomQuick = (v: 0 | 1 | 2 | 3) => {
    setSymptomSeverity(v);
    store.setBioForDate(iso, { symptomSeverity: v });
    markSaved();
  };

  const setShiftQuick = (s: Shift) => {
    setShift(s);
    setCustomShiftMode(false);
    store.setShiftForDate(iso, s);
    markSaved();
  };

  const setNapQuick = (hours: number) => {
    const next = clamp(Math.round(hours * 2) / 2, 0, 4);
    setNapText(String(next));
    store.setBioForDate(iso, { napHours: next });
    markSaved();
  };

  const savedLabel =
    saveState === "saving" ? t("저장 중…") : saveState === "saved" ? t("저장됨 ✓") : "";

  const handleClose = () => {
    if (noteDebounce.current) {
      clearTimeout(noteDebounce.current);
      noteDebounce.current = null;
      saveNoteNow(note);
    }
    if (shiftNameDebounce.current) {
      clearTimeout(shiftNameDebounce.current);
      shiftNameDebounce.current = null;
      saveShiftNameNow(shiftNameText);
    }
    if (canEditHealth) {
      saveSleepNow(sleepText);
      saveCaffeineNow(caffeineText);
      saveNapNow(napText);
    }
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={t("기록")}
      subtitle={dateLabel}
      variant="appstore"
      maxHeightClassName="max-h-[82dvh]"
    >
      <div className="space-y-4">
        {/* 상단 안내 + 저장 상태 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[12.5px] text-ios-muted break-words">
            {canEditHealth
              ? t("입력할수록 내 패턴에 맞게 더 정확해져요.")
              : t("건강 기록은 오늘과 전날만 입력할 수 있어요.")}
          </div>
          {savedLabel ? (
            <div className="shrink-0 rounded-full border border-ios-sep bg-white px-2 py-1 text-[11px] font-semibold text-ios-muted">
              {savedLabel}
            </div>
          ) : null}
        </div>

        {/* 근무 */}
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0 text-[13px] font-semibold">{t("근무")}</div>
            <div className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", shiftColor(shift))}>
              {shift === "VAC" ? "VA" : shift}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SHIFT_LABELS.map((s) => {
              const active = !customShiftMode && shift === s.id;
              const shortLabel = s.short ?? s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShiftQuick(s.id)}
                  className={cn(
                    "rounded-2xl border px-2 py-2 text-center",
                    active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                  )}
                >
                  <div className="text-[12px] font-semibold">{shortLabel}</div>
                  <div className={cn("mt-0.5 text-[10.5px] font-semibold", active ? "text-white/80" : "text-ios-muted")}>
                    {t(s.hint)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">{t("근무 이름 (직접 입력)")}</div>
            <Input
              value={shiftNameText}
              onChange={(e) => {
                setCustomShiftMode(true);
                setShiftNameText(e.target.value);
              }}
              onFocus={() => setCustomShiftMode(true)}
              onBlur={(e) => {
                if (!e.target.value.trim()) setCustomShiftMode(false);
              }}
              placeholder={t("예: 특근, 교육, 회의")}
              className="w-full"
            />
          </div>
        </div>

        {/* ✅ 필수 기록 4개 */}
        {canEditHealth ? (
          <div className="rounded-2xl border border-ios-sep bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-[13px] font-semibold">{t("필수 기록")}</div>
              <div className="shrink-0 text-[11px] font-semibold text-ios-muted">
                {t("수면 · 스트레스 · 카페인 · 기분")}
              </div>
            </div>

            {/* 수면 */}
            <div className="mt-4 rounded-2xl border border-ios-sep bg-ios-bg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-ios-muted">{t("수면 시간")}</div>
                  <div className="mt-1 text-[16px] font-semibold">{sleepText.trim() === "" ? "—" : `${sleepText}h`}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => adjustSleep(-0.5)}>
                    -
                  </Button>
                  <Button variant="secondary" onClick={() => adjustSleep(0.5)}>
                    +
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[4, 6, 7, 8, 9].map((h) => {
                  const active = Number(sleepText) === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setSleepChip(h)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] font-semibold",
                        active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                      )}
                    >
                      {h}h
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <Input
                  inputMode="decimal"
                  value={sleepText}
                  onChange={(e) => setSleepText(e.target.value)}
                  onBlur={() => saveSleepNow(sleepText)}
                  placeholder={t("예: 6.5")}
                />
              </div>
            </div>

            {/* 스트레스 */}
            <div className="mt-4">
              <div className="mb-2 text-[12px] font-semibold text-ios-muted">{t("스트레스")}</div>
              <Segmented value={String(stress) as any} options={stressOptions as any} onChange={setStressQuick} />
            </div>

            {/* 카페인 */}
            <div className="mt-4 rounded-2xl border border-ios-sep bg-ios-bg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-ios-muted">{t("카페인")}</div>
                  <div className="mt-1 text-[16px] font-semibold">{caffeineText.trim() === "" ? "—" : `${caffeineText}mg`}</div>
                </div>
                <div className="shrink-0 text-[11px] font-semibold text-ios-muted">{t("대략 1잔 ≈ 120mg")}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4].map((cups) => {
                  const mg = cups * 120;
                  const active = Number(caffeineText) === mg;
                  return (
                    <button
                      key={cups}
                      type="button"
                      onClick={() => quickCaffeine(cups)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] font-semibold",
                        active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                      )}
                    >
                      {cups === 0 ? "0" : t("{count}잔", { count: cups })}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <Input
                  inputMode="numeric"
                  value={caffeineText}
                  onChange={(e) => setCaffeineText(e.target.value)}
                  onBlur={() => saveCaffeineNow(caffeineText)}
                  placeholder={t("mg 직접 입력(예: 150)")}
                />
              </div>
            </div>

            {/* 기분 */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0 text-[12px] font-semibold text-ios-muted">{t("기분")}</div>
                <div className="shrink-0 text-[12px] font-semibold">
                  {moodEmoji(mood)} {mood}/5
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 5] as MoodScore[]).map((m) => {
                  const active = mood === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMoodQuick(m)}
                      className={cn(
                        "rounded-2xl border px-2 py-2 text-center",
                        active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                      )}
                    >
                      <div className="text-[18px] leading-none">{moodEmoji(m)}</div>
                      <div className={cn("mt-1 text-[10.5px] font-semibold", active ? "text-white/80" : "text-ios-muted")}>{m}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-ios-sep bg-white p-4 text-[12.5px] text-ios-muted">
            {t("건강 기록은 오늘/전날만 입력할 수 있어요. 다른 날짜는 근무/메모만 가능합니다.")}
          </div>
        )}

        {/* 메모 */}
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">{t("메모(선택)")}</div>
          <div className="mt-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("예: 컨퍼런스 / OT / 오늘 있었던 일")}
              rows={2}
            />
          </div>
        </div>

        {/* 추가 기록 */}
        {canEditHealth ? (
          <div className="rounded-2xl border border-ios-sep bg-white p-4">
            <button type="button" onClick={() => setShowMore((v) => !v)} className="flex w-full items-center justify-between">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{t("추가 기록")}</div>
                <div className="mt-0.5 text-[12.5px] text-ios-muted">
                  {t("낮잠 · 활동량")}
                  {menstrualEnabled ? ` · ${t("생리 증상")}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-[14px] font-semibold">{showMore ? "▲" : "▼"}</div>
            </button>

            {showMore ? (
              <div className="mt-4 space-y-4">
                {/* 활동량 */}
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-ios-muted">{t("낮잠 시간")}</div>
                  <div className="flex flex-wrap gap-2">
                    {[0, 0.5, 1, 1.5, 2, 3, 4].map((h) => {
                      const active = Number(napText) === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setNapQuick(h)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12px] font-semibold",
                            active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                          )}
                        >
                          {h === 0 ? "0" : `${h}h`}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <Input
                      inputMode="decimal"
                      value={napText}
                      onChange={(e) => setNapText(e.target.value)}
                      onBlur={() => saveNapNow(napText)}
                      placeholder={t("낮잠 시간 입력(예: 0.5)")}
                    />
                  </div>
                </div>

                {/* 활동량 */}
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-ios-muted">{t("활동량")}</div>
                  <Segmented value={String(activity) as any} options={activityOptions as any} onChange={setActivityQuick} />
                </div>

                {/* 생리 증상 강도 */}
                {menstrualEnabled ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[12px] font-semibold text-ios-muted">{t("생리 증상 강도")}</div>
                      <div className="text-[11px] font-semibold text-ios-muted">{t("불규칙해도 매일 기록 가능")}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {([0, 1, 2, 3] as const).map((v) => {
                        const active = symptomSeverity === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setSymptomQuick(v)}
                            className={cn(
                              "rounded-2xl border px-2 py-2 text-center",
                              active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                            )}
                          >
                            <div className="text-[12px] font-semibold">{v === 0 ? t("없음") : v}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
