"use client";

import { startTransition, useMemo, useRef, useState } from "react";
import type { ISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  type OcrErrorResult,
  type OcrPendingResult,
  type OcrProgress,
  type OcrRecognizedShift,
  type OcrUnknownCode,
  resolveMultiPersonSchedule,
  scanScheduleImage,
} from "@/lib/scheduleOcr";

type Step =
  | { id: "idle" }
  | { id: "processing"; progress: OcrProgress }
  | {
      id: "review";
      yearMonth: string;
      schedule: Record<ISODate, OcrRecognizedShift>;
      unknownCodes: OcrUnknownCode[];
      resolvedMappings: Record<string, Shift>;
      saveAsCustom: boolean;
    }
  | { id: "name_input"; pending: OcrPendingResult }
  | { id: "done"; count: number; yearMonth: string }
  | { id: "error"; message: string };

const SHIFT_OPTIONS: Array<{ value: Shift; label: string }> = [
  { value: "D", label: "주간 (D)" },
  { value: "E", label: "이브닝 (E)" },
  { value: "N", label: "나이트 (N)" },
  { value: "M", label: "미들 (M)" },
  { value: "OFF", label: "오프 (OFF)" },
  { value: "VAC", label: "휴가 (VAC)" },
];

function monthHintFromISO(iso: ISODate) {
  return iso.slice(0, 7);
}

function sortIsoDates(a: string, b: string) {
  return a.localeCompare(b);
}

export function ShiftPatternOcrCard({ selectedISO }: { selectedISO: ISODate }) {
  const store = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>({ id: "idle" });
  const [yearMonth, setYearMonth] = useState(() => monthHintFromISO(selectedISO));
  const [manualName, setManualName] = useState("");

  const customShiftTypes = store.settings.customShiftTypes ?? [];

  const reset = () => {
    setStep({ id: "idle" });
    setManualName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyResult = (
    result:
      | OcrErrorResult
      | OcrPendingResult
      | {
          kind: "individual" | "multi_person_resolved";
          yearMonth: string;
          schedule: Record<ISODate, OcrRecognizedShift>;
          unknownCodes: OcrUnknownCode[];
        }
  ) => {
    if (result.kind === "error") {
      startTransition(() => setStep({ id: "error", message: result.message }));
      return;
    }

    if (result.kind === "multi_person_pending") {
      startTransition(() => {
        setManualName(store.settings.ocrLastUserName ?? "");
        setStep({ id: "name_input", pending: result });
      });
      return;
    }

    startTransition(() =>
      setStep({
        id: "review",
        yearMonth: result.yearMonth,
        schedule: result.schedule,
        unknownCodes: result.unknownCodes,
        resolvedMappings: {},
        saveAsCustom: false,
      })
    );
  };

  const handleFile = async (file: File) => {
    setStep({
      id: "processing",
      progress: { stage: "loading", pct: 5, message: "OCR 준비 중..." },
    });

    const result = await scanScheduleImage(
      file,
      customShiftTypes,
      yearMonth,
      store.settings.ocrLastUserName ?? "",
      (progress) => setStep({ id: "processing", progress })
    );

    applyResult(result as any);
  };

  const uniqueUnknownCodes = useMemo(() => {
    if (step.id !== "review") return [];
    return [...new Set(step.unknownCodes.map((code) => code.rawText.trim()).filter(Boolean))];
  }, [step]);

  const unresolvedCount = useMemo(() => {
    if (step.id !== "review") return 0;
    return uniqueUnknownCodes.filter((code) => !step.resolvedMappings[code]).length;
  }, [step, uniqueUnknownCodes]);

  const previewEntries = useMemo(() => {
    if (step.id !== "review") return [];
    return Object.entries(step.schedule)
      .sort(([left], [right]) => sortIsoDates(left, right))
      .slice(0, 10);
  }, [step]);

  const onApplyReview = () => {
    if (step.id !== "review" || unresolvedCount > 0) return;

    const schedulePatch: Record<ISODate, Shift> = {};
    const shiftNamePatch: Record<ISODate, string> = {};

    for (const [isoDate, recognizedShift] of Object.entries(step.schedule)) {
      schedulePatch[isoDate as ISODate] = recognizedShift.semanticType;
      if (recognizedShift.displayName) {
        shiftNamePatch[isoDate as ISODate] = recognizedShift.displayName;
      }
    }

    for (const unknownCode of step.unknownCodes) {
      const resolvedShift = step.resolvedMappings[unknownCode.rawText];
      if (!resolvedShift) continue;
      schedulePatch[unknownCode.isoDate] = resolvedShift;
      shiftNamePatch[unknownCode.isoDate] = unknownCode.rawText;
    }

    store.batchSetSchedule(schedulePatch);
    store.batchSetShiftNames(shiftNamePatch);

    if (step.saveAsCustom) {
      const existingNames = new Set(customShiftTypes.map((shiftType) => shiftType.displayName));
      const additions = uniqueUnknownCodes
        .filter((code) => step.resolvedMappings[code] && !existingNames.has(code))
        .map((code) => ({
          id: crypto.randomUUID(),
          displayName: code,
          semanticType: step.resolvedMappings[code],
          aliases: [],
        }));

      if (additions.length > 0) {
        store.setSettings({
          customShiftTypes: [...customShiftTypes, ...additions],
        });
      }
    }

    setStep({
      id: "done",
      count: Object.keys(schedulePatch).length,
      yearMonth: step.yearMonth,
    });
  };

  const renderIdle = () => (
    <div className="space-y-4">
      <div className="rounded-2xl bg-violet-50 px-4 py-3 text-[12.5px] leading-relaxed text-violet-700">
        사진 한 장으로 한 달 근무표를 읽고 일정에 채웁니다. OCR 실행은 브라우저 내부에서 처리되고, 외부
        CDN 대신 앱 자산만 사용합니다.
      </div>

      <Input
        type="month"
        label="적용 월"
        value={yearMonth}
        onChange={(event) => setYearMonth(event.target.value)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void handleFile(file);
        }}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          className="justify-center text-[13px]"
          onClick={() => fileInputRef.current?.click()}
        >
          이미지 선택
        </Button>
        <Button
          variant="ghost"
          className="justify-center text-[13px]"
          onClick={() => setYearMonth(monthHintFromISO(selectedISO))}
        >
          선택일 월로 맞춤
        </Button>
      </div>

      <div className="rounded-2xl border border-ios-sep bg-white p-4 text-[12.5px] text-ios-muted">
        <div className="font-semibold text-ios-text">스캔 팁</div>
        <ul className="mt-2 space-y-1 leading-relaxed">
          <li>표 전체가 잘리거나 기울지 않게 촬영하세요.</li>
          <li>날짜 열/행과 근무 코드가 함께 보이도록 맞추세요.</li>
          <li>여러 사람 표라면 이름 행 또는 이름 열이 포함되도록 찍어주세요.</li>
        </ul>
      </div>
    </div>
  );

  const renderProcessing = (progress: OcrProgress) => (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-[12.5px] font-semibold">
          <span>{progress.message}</span>
          <span>{progress.pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ios-fill">
          <div
            className="h-full rounded-full bg-[color:var(--rnest-accent)] transition-all"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
      <div className="text-[12.5px] text-ios-muted">
        첫 실행에서는 OCR 언어 데이터 로드 때문에 시간이 더 걸릴 수 있습니다.
      </div>
    </div>
  );

  const renderNameInput = (pending: OcrPendingResult) => (
    <div className="space-y-4">
      <div className="rounded-2xl bg-ios-fill px-4 py-3 text-[12.5px] leading-relaxed text-ios-muted">
        여러 사람 근무표로 인식됐습니다. 적용할 이름을 선택하거나 직접 입력하세요.
      </div>

      {pending.persons.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pending.persons.map((person) => (
            <button
              key={person}
              type="button"
              onClick={() => {
                setManualName(person);
                store.setSettings({ ocrLastUserName: person });
                applyResult(resolveMultiPersonSchedule(pending, person, customShiftTypes) as any);
              }}
              className="rounded-full border border-ios-sep bg-white px-3 py-1.5 text-[13px] font-semibold text-ios-text"
            >
              {person}
            </button>
          ))}
        </div>
      ) : null}

      <Input
        label="직접 이름 입력"
        placeholder="예: 김간호"
        value={manualName}
        onChange={(event) => setManualName(event.target.value)}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="justify-center text-[13px]" onClick={reset}>
          다시 선택
        </Button>
        <Button
          className="justify-center text-[13px]"
          disabled={manualName.trim().length < 2}
          onClick={() => {
            const normalizedName = manualName.replace(/\s+/g, " ").trim();
            if (normalizedName.length < 2) return;
            store.setSettings({ ocrLastUserName: normalizedName });
            applyResult(resolveMultiPersonSchedule(pending, normalizedName, customShiftTypes) as any);
          }}
        >
          이 이름으로 계속
        </Button>
      </div>
    </div>
  );

  const renderReview = () => {
    if (step.id !== "review") return null;

    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-[12.5px] leading-relaxed text-emerald-700">
          {step.yearMonth} 근무표에서 {Object.keys(step.schedule).length}일을 인식했습니다.
        </div>

        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold text-ios-text">미리보기</div>
          <div className="mt-3 space-y-2 text-[12.5px]">
            {previewEntries.map(([isoDate, recognizedShift]) => (
              <div key={isoDate} className="flex items-center justify-between gap-3">
                <span className="text-ios-muted">{isoDate}</span>
                <span className="font-semibold text-ios-text">{recognizedShift.displayName || recognizedShift.semanticType}</span>
              </div>
            ))}
            {Object.keys(step.schedule).length > previewEntries.length ? (
              <div className="text-ios-muted">
                외 {Object.keys(step.schedule).length - previewEntries.length}일
              </div>
            ) : null}
          </div>
        </div>

        {uniqueUnknownCodes.length > 0 ? (
          <div className="rounded-2xl border border-ios-sep bg-white p-4">
            <div className="text-[13px] font-semibold text-ios-text">확인 필요한 코드</div>
            <div className="mt-1 text-[12.5px] text-ios-muted">
              인식했지만 근무 코드 사전에 없는 값입니다. 의미를 지정하면 일정에 반영됩니다.
            </div>
            <div className="mt-4 space-y-4">
              {uniqueUnknownCodes.map((code) => (
                <div key={code} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-ios-fill px-2.5 py-1 text-[12px] font-semibold text-ios-text">
                      {code}
                    </span>
                    <span className="text-[11.5px] text-ios-muted">
                      {step.unknownCodes.filter((item) => item.rawText === code).length}회 감지
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {SHIFT_OPTIONS.map((option) => {
                      const active = step.resolvedMappings[code] === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setStep({
                              ...step,
                              resolvedMappings: {
                                ...step.resolvedMappings,
                                [code]: option.value,
                              },
                            })
                          }
                          className={
                            active
                              ? "rounded-xl border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-3 py-2 text-[12px] font-semibold text-[color:var(--rnest-accent)]"
                              : "rounded-xl border border-ios-sep bg-white px-3 py-2 text-[12px] font-semibold text-ios-muted"
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-center gap-2 text-[12.5px] text-ios-text">
              <input
                type="checkbox"
                checked={step.saveAsCustom}
                onChange={(event) => setStep({ ...step, saveAsCustom: event.target.checked })}
              />
              다음 스캔부터 같은 코드를 커스텀 근무 이름으로 저장
            </label>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="justify-center text-[13px]" onClick={reset}>
            다시 선택
          </Button>
          <Button
            className="justify-center text-[13px]"
            disabled={unresolvedCount > 0}
            onClick={onApplyReview}
          >
            {unresolvedCount > 0 ? `${unresolvedCount}건 지정 필요` : "일정에 적용하기"}
          </Button>
        </div>
      </div>
    );
  };

  const renderDone = (count: number, doneYearMonth: string) => {
    const [year, month] = doneYearMonth.split("-");
    return (
      <div className="space-y-4 py-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-600"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p className="text-[15px] font-semibold">
            {year}년 {Number.parseInt(month, 10)}월 근무 적용 완료
          </p>
          <p className="mt-1 text-[13px] text-ios-muted">{count}개 날짜에 근무가 등록됐습니다.</p>
        </div>
        <Button variant="secondary" className="mx-auto justify-center text-[13px]" onClick={reset}>
          다른 근무표 스캔
        </Button>
      </div>
    );
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">근무표 이미지 스캔</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">
            사진 한 장으로 한 달 근무를 자동 입력합니다
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
          브라우저 처리
        </span>
      </div>

      {step.id === "idle" ? renderIdle() : null}
      {step.id === "processing" ? renderProcessing(step.progress) : null}
      {step.id === "name_input" ? renderNameInput(step.pending) : null}
      {step.id === "review" ? renderReview() : null}
      {step.id === "done" ? renderDone(step.count, step.yearMonth) : null}
      {step.id === "error" ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-[13px] font-semibold text-red-700">인식 실패</p>
            <p className="mt-1 text-[12.5px] text-red-600">{step.message}</p>
          </div>
          <Button variant="secondary" className="w-full justify-center text-[13px]" onClick={reset}>
            다시 시도
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
