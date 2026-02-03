"use client";

import type { ISODate } from "@/lib/date";
import type { BioInputs, StressLevel, ActivityLevel } from "@/lib/model";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";

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

export function BioSheet({
  open,
  onClose,
  iso,
  value,
  onSave,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  iso: ISODate;
  value?: BioInputs;
  onSave: (patch: Partial<BioInputs>) => void;
  onClear: () => void;
}) {
  const sleep = value?.sleepHours ?? "";
  const nap = (value as any)?.napHours ?? "";
  const sleepQuality = String((value as any)?.sleepQuality ?? 3);
  const sleepTiming = String((value as any)?.sleepTiming ?? "auto");
  const stress = value?.stress;
  const activity = value?.activity;
  const caffeine = value?.caffeineMg ?? "";
  const caffeineTime = (value as any)?.caffeineLastAt ?? "";
  const fatigue = (value as any)?.fatigueLevel ?? "";
  const symptom = String((value as any)?.symptomSeverity ?? 0);
  const menstrualStatus = String((value as any)?.menstrualStatus ?? "none");
  const menstrualFlow = String((value as any)?.menstrualFlow ?? 0);
  const overtime = (value as any)?.shiftOvertimeHours ?? "";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="생체 기록"
      subtitle={`${iso} · 수면/스트레스/활동/카페인`}
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-[13px] font-semibold">수면 시간 (h)</div>
          <Input
            inputMode="decimal"
            value={String(sleep)}
            onChange={(e) => {
              const v = e.target.value;
              const n = v.trim() === "" ? null : Number(v);
              if (n == null || Number.isNaN(n)) {
                onSave({ sleepHours: null });
              } else {
                onSave({ sleepHours: Math.max(0, Math.min(16, n)) });
              }
            }}
            placeholder="예: 6.5"
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">낮잠 (h)</div>
          <Input
            inputMode="decimal"
            value={String(nap)}
            onChange={(e) => {
              const v = e.target.value;
              const n = v.trim() === "" ? null : Number(v);
              if (n == null || Number.isNaN(n)) {
                onSave({ napHours: null });
              } else {
                onSave({ napHours: Math.max(0, Math.min(4, n)) });
              }
            }}
            placeholder="예: 1.0"
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">수면 품질</div>
          <Segmented
            value={sleepQuality as any}
            options={sleepQualityOptions as any}
            onChange={(v) => onSave({ sleepQuality: Number(v) as any })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">수면 타이밍</div>
          <Segmented
            value={sleepTiming as any}
            options={sleepTimingOptions as any}
            onChange={(v) => onSave({ sleepTiming: (v as any) })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">스트레스</div>
          <Segmented
            value={String(stress ?? 1) as any}
            options={stressOptions as any}
            onChange={(v) => onSave({ stress: Number(v) as StressLevel })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">활동량</div>
          <Segmented
            value={String(activity ?? 1) as any}
            options={activityOptions as any}
            onChange={(v) => onSave({ activity: Number(v) as ActivityLevel })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">카페인 (mg)</div>
          <Input
            inputMode="numeric"
            value={String(caffeine)}
            onChange={(e) => {
              const v = e.target.value;
              const n = v.trim() === "" ? null : Number(v);
              if (n == null || Number.isNaN(n)) {
                onSave({ caffeineMg: null });
              } else {
                onSave({ caffeineMg: Math.max(0, Math.min(1000, Math.round(n))) });
              }
            }}
            placeholder="예: 150"
          />
          <div className="mt-1 text-[12px] text-ios-muted">대략: 아메리카노 1잔 120mg 전후</div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">마지막 카페인 (시간)</div>
          <Input
            type="time"
            value={String(caffeineTime)}
            onChange={(e) => onSave({ caffeineLastAt: e.target.value || null })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">피로도 (0~10)</div>
          <Input
            inputMode="numeric"
            value={String(fatigue)}
            onChange={(e) => {
              const v = e.target.value;
              const n = v.trim() === "" ? null : Number(v);
              if (n == null || Number.isNaN(n)) {
                onSave({ fatigueLevel: null });
              } else {
                onSave({ fatigueLevel: Math.max(0, Math.min(10, n)) });
              }
            }}
            placeholder="예: 6"
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">증상 강도</div>
          <Segmented
            value={symptom as any}
            options={symptomOptions as any}
            onChange={(v) => onSave({ symptomSeverity: Number(v) as any })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">생리 상태</div>
          <Segmented
            value={menstrualStatus as any}
            options={menstrualStatusOptions as any}
            onChange={(v) => onSave({ menstrualStatus: (v as any) })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">출혈 강도</div>
          <Segmented
            value={menstrualFlow as any}
            options={menstrualFlowOptions as any}
            onChange={(v) => onSave({ menstrualFlow: Number(v) as any })}
          />
        </div>

        <div>
          <div className="mb-2 text-[13px] font-semibold">근무 연장 (h)</div>
          <Input
            inputMode="numeric"
            value={String(overtime)}
            onChange={(e) => {
              const v = e.target.value;
              const n = v.trim() === "" ? null : Number(v);
              if (n == null || Number.isNaN(n)) {
                onSave({ shiftOvertimeHours: null });
              } else {
                onSave({ shiftOvertimeHours: Math.max(0, Math.min(8, n)) });
              }
            }}
            placeholder="예: 2"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onClear}>
            기록 지우기
          </Button>
          <Button onClick={onClose}>완료</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
