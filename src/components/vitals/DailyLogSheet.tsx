"use client";

import { useEffect, useMemo, useState } from "react";
import type { ISODate } from "@/lib/date";
import { formatKoreanDate } from "@/lib/date";
import type { Shift } from "@/lib/types";
import { shiftColor, SHIFT_LABELS } from "@/lib/types";
import type { ActivityLevel, BioInputs, EmotionEntry, MoodScore, StressLevel } from "@/lib/model";
import { defaultBio } from "@/lib/model";
import { useAppStore } from "@/lib/store";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";

const stressOptions = [
  { value: "0", label: "낮음" },
  { value: "1", label: "보통" },
  { value: "2", label: "높음" },
  { value: "3", label: "매우" },
] as const;

const activityOptions = [
  { value: "0", label: "가벼움" },
  { value: "1", label: "보통" },
  { value: "2", label: "많음" },
  { value: "3", label: "빡셈" },
] as const;

const sleepQualityOptions = [
  { value: "1", label: "매우 나쁨" },
  { value: "2", label: "나쁨" },
  { value: "3", label: "보통" },
  { value: "4", label: "좋음" },
  { value: "5", label: "매우 좋음" },
] as const;

const sleepTimingOptions = [
  { value: "auto", label: "자동" },
  { value: "night", label: "밤잠" },
  { value: "day", label: "낮잠" },
  { value: "mixed", label: "혼합" },
] as const;

const symptomOptions = [
  { value: "0", label: "없음" },
  { value: "1", label: "약" },
  { value: "2", label: "중" },
  { value: "3", label: "강" },
] as const;

const menstrualStatusOptions = [
  { value: "none", label: "없음" },
  { value: "pms", label: "PMS" },
  { value: "period", label: "생리" },
] as const;

const menstrualFlowOptions = [
  { value: "0", label: "없음" },
  { value: "1", label: "약" },
  { value: "2", label: "보통" },
  { value: "3", label: "많음" },
] as const;

function moodEmoji(m: MoodScore) {
  return m === 1 ? "☹️" : m === 2 ? "😕" : m === 3 ? "😐" : m === 4 ? "🙂" : "😄";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function DailyLogSheet({
  open,
  onClose,
  iso,
}: {
  open: boolean;
  onClose: () => void;
  iso: ISODate;
}) {
  const store = useAppStore();
  const { t } = useI18n();

  const presets = useMemo(() => {
    const pos = store.settings.emotionTagsPositive ?? [];
    const neg = store.settings.emotionTagsNegative ?? [];
    return { pos, neg };
  }, [store.settings.emotionTagsPositive, store.settings.emotionTagsNegative]);

  const stressOptionsT = useMemo(() => stressOptions.map((o) => ({ ...o, label: t(o.label) })), [t]);
  const activityOptionsT = useMemo(() => activityOptions.map((o) => ({ ...o, label: t(o.label) })), [t]);
  const sleepQualityOptionsT = useMemo(() => sleepQualityOptions.map((o) => ({ ...o, label: t(o.label) })), [t]);
  const sleepTimingOptionsT = useMemo(() => sleepTimingOptions.map((o) => ({ ...o, label: t(o.label) })), [t]);
  const symptomOptionsT = useMemo(() => symptomOptions.map((o) => ({ ...o, label: t(o.label) })), [t]);
  const menstrualStatusOptionsT = useMemo(
    () => menstrualStatusOptions.map((o) => ({ ...o, label: o.label === "PMS" ? "PMS" : t(o.label) })),
    [t]
  );
  const menstrualFlowOptionsT = useMemo(() => menstrualFlowOptions.map((o) => ({ ...o, label: t(o.label) })), [t]);

  const curShift: Shift = store.schedule[iso] ?? "OFF";
  const curNote = store.notes[iso] ?? "";
  const curBio: BioInputs = store.bio[iso] ?? defaultBio();
  const curEmotion: EmotionEntry | undefined = store.emotions[iso];

  const [shift, setShift] = useState<Shift>("OFF");
  const [note, setNote] = useState("");
  const [sleep, setSleep] = useState<string>("");
  const [nap, setNap] = useState<string>("");
  const [sleepQuality, setSleepQuality] = useState<string>("3");
  const [sleepTiming, setSleepTiming] = useState<string>("auto");
  const [stress, setStress] = useState<StressLevel>(1);
  const [activity, setActivity] = useState<ActivityLevel>(1);
  const [caffeine, setCaffeine] = useState<string>("");
  const [caffeineTime, setCaffeineTime] = useState<string>("");
  const [fatigue, setFatigue] = useState<string>("");
  const [symptom, setSymptom] = useState<string>("0");
  const [menstrualStatus, setMenstrualStatus] = useState<string>("none");
  const [menstrualFlow, setMenstrualFlow] = useState<string>("0");
  const [overtime, setOvertime] = useState<string>("");
  const [enableEmotion, setEnableEmotion] = useState(false);
  const [mood, setMood] = useState<MoodScore>(3);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [emotionNote, setEmotionNote] = useState("");

  useEffect(() => {
    if (!open) return;

    setShift(curShift);
    setNote(curNote);

    setSleep(curBio.sleepHours == null ? "" : String(curBio.sleepHours));
    setNap((curBio as any).napHours == null ? "" : String((curBio as any).napHours));
    setSleepQuality(String((curBio as any).sleepQuality ?? 3));
    setSleepTiming(String((curBio as any).sleepTiming ?? "auto"));
    setStress((curBio.stress ?? 1) as StressLevel);
    setActivity((curBio.activity ?? 1) as ActivityLevel);
    setCaffeine(curBio.caffeineMg == null ? "" : String(curBio.caffeineMg));
    setCaffeineTime((curBio as any).caffeineLastAt ?? "");
    setFatigue((curBio as any).fatigueLevel == null ? "" : String((curBio as any).fatigueLevel));
    setSymptom(String((curBio as any).symptomSeverity ?? 0));
    setMenstrualStatus(String((curBio as any).menstrualStatus ?? "none"));
    setMenstrualFlow(String((curBio as any).menstrualFlow ?? 0));
    setOvertime((curBio as any).shiftOvertimeHours == null ? "" : String((curBio as any).shiftOvertimeHours));

    const hasEmotion = !!curEmotion;
    setEnableEmotion(hasEmotion);
    setMood((curEmotion?.mood ?? 3) as MoodScore);
    setTags(curEmotion?.tags ?? []);
    setEmotionNote(curEmotion?.note ?? "");
    setCustomTag("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, iso]);

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const addCustom = () => {
    const raw = customTag.trim();
    if (!raw) return;
    const t = raw.startsWith("#") ? raw : `#${raw}`;
    setCustomTag("");
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  };

  const dateLabel = useMemo(() => formatKoreanDate(iso), [iso]);

  const saveAll = () => {
    // Shift
    store.setShiftForDate(iso, shift);

    // Note
    const cleaned = note.replace(/\s+/g, " ").trim();
    if (cleaned) store.setNoteForDate(iso, note);
    else store.clearNoteForDate(iso);

    // Bio
    const sleepN = sleep.trim() === "" ? null : Number(sleep);
    const napN = nap.trim() === "" ? null : Number(nap);
    const caffeineN = caffeine.trim() === "" ? null : Number(caffeine);
    const sleepQualityN = sleepQuality.trim() === "" ? null : Number(sleepQuality);
    const sleepTimingN = sleepTiming === "auto" ? null : sleepTiming;
    const caffeineLastAtN = caffeineTime.trim() === "" ? null : caffeineTime;
    const fatigueN = fatigue.trim() === "" ? null : Number(fatigue);
    const symptomN = symptom.trim() === "" ? null : Number(symptom);
    const menstrualStatusN = menstrualStatus === "none" ? null : menstrualStatus;
    const menstrualFlowN = menstrualFlow.trim() === "" ? null : Number(menstrualFlow);
    const overtimeN = overtime.trim() === "" ? null : Number(overtime);

    const bioPatch: Partial<BioInputs> = {
      sleepHours: sleepN == null || Number.isNaN(sleepN) ? null : clamp(sleepN, 0, 16),
      napHours: napN == null || Number.isNaN(napN) ? null : clamp(napN, 0, 4),
      sleepQuality: sleepQualityN == null || Number.isNaN(sleepQualityN) ? null : (clamp(sleepQualityN, 1, 5) as any),
      sleepTiming: (sleepTimingN ?? null) as any,
      stress,
      activity,
      caffeineMg: caffeineN == null || Number.isNaN(caffeineN) ? null : clamp(Math.round(caffeineN), 0, 1000),
      caffeineLastAt: caffeineLastAtN,
      fatigueLevel: fatigueN == null || Number.isNaN(fatigueN) ? null : clamp(fatigueN, 0, 10),
      symptomSeverity: symptomN == null || Number.isNaN(symptomN) ? null : (clamp(Math.round(symptomN), 0, 3) as any),
      menstrualStatus: (menstrualStatusN ?? null) as any,
      menstrualFlow: menstrualFlowN == null || Number.isNaN(menstrualFlowN) ? null : (clamp(Math.round(menstrualFlowN), 0, 3) as any),
      shiftOvertimeHours: overtimeN == null || Number.isNaN(overtimeN) ? null : clamp(overtimeN, 0, 8),
    };

    const hasAnyBio =
      bioPatch.sleepHours != null ||
      bioPatch.napHours != null ||
      bioPatch.sleepQuality != null ||
      (bioPatch.sleepTiming != null && bioPatch.sleepTiming !== "auto") ||
      bioPatch.stress != null ||
      bioPatch.activity != null ||
      bioPatch.caffeineMg != null ||
      bioPatch.caffeineLastAt != null ||
      bioPatch.fatigueLevel != null ||
      bioPatch.symptomSeverity != null ||
      bioPatch.menstrualStatus != null ||
      bioPatch.menstrualFlow != null ||
      bioPatch.shiftOvertimeHours != null;

    if (hasAnyBio) store.setBioForDate(iso, bioPatch);
    else store.clearBioForDate(iso);

    // Emotion (optional)
    if (enableEmotion) {
      const eNote = emotionNote.replace(/\s+/g, " ").trim();
      store.setEmotionForDate(iso, { mood, tags, note: eNote ? eNote : undefined });
    } else {
      store.clearEmotionForDate(iso);
    }

    onClose();
  };

  const clearAll = () => {
    // A안: 위험한 삭제는 최소화. 기록만 초기화
    store.clearNoteForDate(iso);
    store.clearBioForDate(iso);
    store.clearEmotionForDate(iso);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("오늘 기록")}
      subtitle={`${dateLabel}`}
      footer={(
        <div className="flex gap-2">
          <Button onClick={saveAll} className="flex-1">
            {t("저장")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("닫기")}
          </Button>
          <Button variant="danger" onClick={clearAll}>
            {t("초기화")}
          </Button>
        </div>
      )}
    >
      <div className="relative">
        <div className="space-y-5 pb-6">
        {/* Shift */}
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">{t("근무")}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SHIFT_LABELS.map((s) => {
              const active = shift === s.id;
              const shortLabel = s.short ?? s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setShift(s.id)}
                  className={cn(
                    "rounded-2xl border px-3 py-2 text-left",
                    active ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                  )}
                >
                  <div className="text-[13px] font-semibold">{shortLabel}</div>
                  <div className={cn("mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[11px]", active ? "border-white/25" : shiftColor(s.id))}>
                    {t(s.hint)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Memo */}
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">{t("메모")}</div>
          <div className="mt-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("예: 컨퍼런스 / OT / 무슨 일이 있었는지")} rows={3} />
          </div>
          <div className="mt-2 text-[12px] text-ios-muted">{t("캘린더에는 첫 줄만 깔끔하게 표시돼.")}</div>
        </div>

        {/* Bio */}
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">생체</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[12px] font-semibold text-ios-muted">수면 시간 (h)</div>
              <Input inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="예: 6.5" />
            </div>
            <div>
              <div className="mb-2 text-[12px] font-semibold text-ios-muted">낮잠 (h)</div>
              <Input inputMode="decimal" value={nap} onChange={(e) => setNap(e.target.value)} placeholder="예: 1.0" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[12px] font-semibold text-ios-muted">카페인 (mg)</div>
              <Input inputMode="numeric" value={caffeine} onChange={(e) => setCaffeine(e.target.value)} placeholder="예: 150" />
            </div>
            <div>
              <div className="mb-2 text-[12px] font-semibold text-ios-muted">마지막 카페인 (시간)</div>
              <Input type="time" value={caffeineTime} onChange={(e) => setCaffeineTime(e.target.value)} />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">수면 품질</div>
            <Segmented value={sleepQuality as any} options={sleepQualityOptions as any} onChange={(v) => setSleepQuality(String(v))} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">수면 타이밍</div>
            <Segmented value={sleepTiming as any} options={sleepTimingOptions as any} onChange={(v) => setSleepTiming(String(v))} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">피로도 (0~10)</div>
            <Input inputMode="numeric" value={fatigue} onChange={(e) => setFatigue(e.target.value)} placeholder="예: 6" />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">스트레스</div>
            <Segmented
              value={String(stress) as any}
              options={stressOptions as any}
              onChange={(v) => setStress(Number(v) as StressLevel)}
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">활동량</div>
            <Segmented
              value={String(activity) as any}
              options={activityOptions as any}
              onChange={(v) => setActivity(Number(v) as ActivityLevel)}
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">증상 강도</div>
            <Segmented value={symptom as any} options={symptomOptions as any} onChange={(v) => setSymptom(String(v))} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">생리 상태</div>
            <Segmented
              value={menstrualStatus as any}
              options={menstrualStatusOptions as any}
              onChange={(v) => setMenstrualStatus(String(v))}
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">출혈 강도</div>
            <Segmented value={menstrualFlow as any} options={menstrualFlowOptions as any} onChange={(v) => setMenstrualFlow(String(v))} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[12px] font-semibold text-ios-muted">근무 연장 (h)</div>
            <Input inputMode="numeric" value={overtime} onChange={(e) => setOvertime(e.target.value)} placeholder="예: 2" />
          </div>
        </div>

        {/* Emotion */}
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold">감정 차팅</div>
              <div className="mt-1 text-[12.5px] text-ios-muted">저장하면 캘린더에 이모지로 표시돼</div>
            </div>
            <Button variant={enableEmotion ? "primary" : "secondary"} onClick={() => setEnableEmotion((v) => !v)}>
              {enableEmotion ? "ON" : "OFF"}
            </Button>
          </div>

          {enableEmotion ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-ios-sep bg-ios-bg p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold">기분</div>
                  <div className="text-[20px]">{moodEmoji(mood)}</div>
                </div>
                <div className="mt-1 text-[12.5px] text-ios-muted">
                  {mood}/5 · {moodEmoji(mood)}
                </div>
                <input
                  className="mt-3 w-full"
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={mood}
                  onChange={(e) => setMood(Number(e.target.value) as MoodScore)}
                />
              </div>

              <div>
                <div className="mb-2 text-[12px] font-semibold text-ios-muted">빠른 태그</div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-[12px] font-semibold text-ios-muted">좋았던 이유</div>
                    <div className="flex flex-wrap gap-2">
                      {presets.pos.length === 0 ? (
                        <div className="text-[12.5px] text-ios-muted">(설정에서 프리셋을 추가해줘)</div>
                      ) : (
                        presets.pos.map((t) => (
                          <button
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-[12px] font-semibold",
                              tags.includes(t) ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                            )}
                          >
                            {t}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[12px] font-semibold text-ios-muted">힘들었던 이유</div>
                    <div className="flex flex-wrap gap-2">
                      {presets.neg.length === 0 ? (
                        <div className="text-[12.5px] text-ios-muted">(설정에서 프리셋을 추가해줘)</div>
                      ) : (
                        presets.neg.map((t) => (
                          <button
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-[12px] font-semibold",
                              tags.includes(t) ? "border-black bg-black text-white" : "border-ios-sep bg-white"
                            )}
                          >
                            {t}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Input value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="#태그 직접 추가" />
                    <Button variant="secondary" onClick={addCustom}>
                      추가
                    </Button>
                  </div>

                  <div>
                    <div className="mb-2 text-[12px] font-semibold text-ios-muted">짧은 메모(선택)</div>
                    <Textarea value={emotionNote} onChange={(e) => setEmotionNote(e.target.value)} placeholder="예: 오늘 왜 그랬는지" rows={2} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </BottomSheet>
  );
}
