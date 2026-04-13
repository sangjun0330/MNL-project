"use client";

import { useCallback, useRef, useState } from "react";
import type { ISODate } from "@/lib/date";
import { useAppStore } from "@/lib/store";
import type { CoreShift } from "@/lib/model";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  parseScheduleImage,
  resolvePersonFromGrid,
  type OcrProgress,
  type OcrResult,
  type OcrResultMultiPersonPending,
  type OcrScheduleEntry,
  type OcrUnknownCode,
} from "@/lib/ocrSchedule";
import type { CustomShiftDef } from "@/lib/model";

// ────────────────────────────────────────────────────────────
// 의미 타입 선택 옵션 (미지 근무 매핑용)
// ────────────────────────────────────────────────────────────
const SEMANTIC_OPTIONS: { value: CoreShift; label: string }[] = [
  { value: "D",   label: "주간 (D)" },
  { value: "E",   label: "이브닝 (E)" },
  { value: "N",   label: "나이트 (N)" },
  { value: "M",   label: "미들 (M)" },
  { value: "OFF", label: "오프 (OFF)" },
  { value: "VAC", label: "휴가 (VAC)" },
];

// ────────────────────────────────────────────────────────────
// 단계별 상태 타입
// ────────────────────────────────────────────────────────────

type Step =
  | { id: "idle" }
  | { id: "processing"; progress: OcrProgress }
  | { id: "name_input"; pending: OcrResultMultiPersonPending }
  | {
      id: "review";
      yearMonth: string;
      schedule: Record<ISODate, OcrScheduleEntry>;
      unknownCodes: OcrUnknownCode[];
      resolvedMappings: Record<string, CoreShift>; // raw → semantic
      saveAsCustom: boolean;
    }
  | { id: "done"; count: number; yearMonth: string }
  | { id: "error"; message: string };

// ────────────────────────────────────────────────────────────
// 진행 바
// ────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: OcrProgress }) {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-[13px] font-medium">{progress.message}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ios-sep">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-300"
          style={{ width: `${progress.pct}%` }}
        />
      </div>
      <p className="text-[11.5px] text-ios-muted">
        {progress.stage === "loading" && "한국어 OCR 모델을 처음 로드할 때 ~12MB가 다운로드됩니다 (이후 캐시됨)"}
        {progress.stage === "recognizing" && "이미지에서 텍스트를 인식하고 있습니다..."}
        {progress.stage === "parsing" && "근무표 구조를 분석하고 있습니다..."}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 드래그&드롭 업로드 영역
// ────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  yearMonthHint,
  onYearMonthChange,
}: {
  onFile: (file: File) => void;
  yearMonthHint: string;
  onYearMonthChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors",
          dragOver ? "border-violet-400 bg-violet-50" : "border-ios-sep bg-ios-fill hover:bg-violet-50/40"
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-violet-500">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold">근무표 이미지 선택</p>
          <p className="mt-1 text-[12px] text-ios-muted">드래그하거나 탭해서 파일 선택</p>
          <p className="mt-0.5 text-[11px] text-ios-muted">JPG · PNG · HEIC · WebP (최대 20MB)</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>

      {/* 연월 힌트 입력 */}
      <div className="rounded-xl border border-ios-sep bg-white p-3.5">
        <label className="mb-1.5 block text-[12px] font-medium text-ios-muted">
          근무표 연월 <span className="text-[11px] opacity-60">(없으면 이미지에서 자동 추론)</span>
        </label>
        <input
          type="month"
          value={yearMonthHint}
          onChange={(e) => onYearMonthChange(e.target.value)}
          className="w-full appearance-none bg-transparent text-[14px] font-semibold outline-none"
        />
      </div>

      <div className="rounded-xl bg-violet-50 p-3">
        <p className="text-[12px] text-violet-700 font-medium">팁</p>
        <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11.5px] text-violet-600">
          <li>표 전체가 잘 보이도록 정면에서 촬영해 주세요</li>
          <li>흔들림 없이 찍은 선명한 사진일수록 정확도가 높아요</li>
          <li>다인 근무표는 내 이름을 입력해 내 근무만 가져옵니다</li>
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 다인 근무표 — 이름 선택 화면
// ────────────────────────────────────────────────────────────

function NameSelectStep({
  pending,
  onSelect,
  onBack,
}: {
  pending: OcrResultMultiPersonPending;
  onSelect: (name: string) => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 p-3.5">
        <p className="text-[13px] font-semibold text-amber-800">여러 명의 근무표가 감지됐습니다</p>
        <p className="mt-1 text-[12px] text-amber-700">내 이름을 선택하거나 직접 입력하면 내 근무만 가져옵니다.</p>
      </div>

      {/* 감지된 이름 버튼 */}
      {pending.persons.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-medium text-ios-muted">근무표에서 발견된 이름</p>
          <div className="flex flex-wrap gap-2">
            {pending.persons.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSelect(name)}
                className="rounded-full border border-ios-sep bg-white px-3.5 py-1.5 text-[13px] font-medium hover:bg-violet-50 hover:border-violet-300 active:opacity-70 transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 직접 입력 */}
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-ios-muted">이름이 없으면 직접 입력</p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 10))}
            onKeyDown={(e) => e.key === "Enter" && input.trim() && onSelect(input.trim())}
            placeholder="이름 입력 (예: 김OO)"
            className="flex-1 rounded-xl border border-ios-sep bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-violet-300"
          />
          <Button
            onClick={() => input.trim() && onSelect(input.trim())}
            disabled={!input.trim()}
            className="bg-black text-white disabled:opacity-40 px-4"
          >
            확인
          </Button>
        </div>
      </div>

      <Button variant="secondary" onClick={onBack} className="w-full justify-center text-[13px]">
        ← 다시 선택
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 결과 리뷰 화면
// ────────────────────────────────────────────────────────────

function ReviewStep({
  step,
  onConfirm,
  onBack,
  onMappingChange,
  onSaveAsCustomChange,
}: {
  step: Extract<Step, { id: "review" }>;
  onConfirm: () => void;
  onBack: () => void;
  onMappingChange: (raw: string, semantic: CoreShift) => void;
  onSaveAsCustomChange: (v: boolean) => void;
}) {
  const entries = Object.entries(step.schedule) as [ISODate, OcrScheduleEntry][];
  entries.sort(([a], [b]) => (a < b ? -1 : 1));

  const [ym, m] = step.yearMonth.split("-");
  const displayMonth = `${ym}년 ${parseInt(m, 10)}월`;

  // 근무별 통계
  const stats: Record<string, number> = {};
  for (const [, e] of entries) {
    stats[e.displayName] = (stats[e.displayName] ?? 0) + 1;
  }
  const unknownResolved = step.unknownCodes.filter((u) => step.resolvedMappings[u.rawText]);
  const unknownPending = step.unknownCodes.filter((u) => !step.resolvedMappings[u.rawText]);

  return (
    <div className="space-y-4">
      {/* 요약 헤더 */}
      <div className="rounded-xl bg-emerald-50 p-3.5">
        <p className="text-[13px] font-semibold text-emerald-800">
          ✓ {displayMonth} 근무 인식 완료
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(stats).map(([name, cnt]) => (
            <span key={name} className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-medium border border-emerald-200">
              {name} {cnt}일
            </span>
          ))}
        </div>
      </div>

      {/* 인식 결과 미리보기 (최대 14일) */}
      <div>
        <p className="mb-2 text-[12px] font-medium text-ios-muted">
          인식된 근무 ({entries.length}일)
        </p>
        <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto rounded-xl border border-ios-sep bg-white p-3">
          {entries.slice(0, 62).map(([iso, entry]) => {
            const [, , dd] = iso.split("-");
            return (
              <div key={iso} className="flex items-center gap-1.5 text-[12px]">
                <span className="w-8 shrink-0 text-ios-muted">{parseInt(dd, 10)}일</span>
                <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold border", shiftColor(entry.semanticType))}>
                  {entry.displayName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 미지 근무 매핑 */}
      {step.unknownCodes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 space-y-3">
          <p className="text-[13px] font-semibold text-amber-800">
            ⚠ 인식 불가 근무 — 직접 지정해 주세요 ({unknownPending.length}건 남음)
          </p>
          {step.unknownCodes.map((u) => {
            const [, , dd] = u.isoDate.split("-");
            const mapped = step.resolvedMappings[u.rawText];
            return (
              <div key={u.isoDate} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[12px] text-ios-muted">{parseInt(dd, 10)}일</span>
                <span className="rounded bg-white px-2 py-0.5 text-[12px] font-semibold border">
                  &quot;{u.rawText}&quot;
                </span>
                <span className="text-[11px] text-ios-muted">→</span>
                <select
                  value={mapped ?? ""}
                  onChange={(e) => onMappingChange(u.rawText, e.target.value as CoreShift)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1 text-[12px] outline-none",
                    mapped ? "border-emerald-300 bg-emerald-50" : "border-ios-sep bg-white"
                  )}
                >
                  <option value="">선택...</option>
                  {SEMANTIC_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          })}

          {/* 커스텀으로 저장 체크박스 */}
          {unknownResolved.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={step.saveAsCustom}
                onChange={(e) => onSaveAsCustomChange(e.target.checked)}
                className="h-4 w-4 rounded border-ios-sep"
              />
              <span className="text-[12px] text-ios-muted">
                이 매핑을 커스텀 근무로 저장 (다음 스캔에 자동 인식)
              </span>
            </label>
          )}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onBack} className="flex-1 justify-center text-[13px]">
          다시 선택
        </Button>
        <Button
          onClick={onConfirm}
          disabled={unknownPending.length > 0}
          className="flex-1 justify-center bg-black text-white text-[13px] disabled:opacity-40"
        >
          {unknownPending.length > 0
            ? `${unknownPending.length}건 지정 필요`
            : "일정에 적용하기"}
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 완료 화면
// ────────────────────────────────────────────────────────────

function DoneStep({
  count,
  yearMonth,
  onReset,
}: {
  count: number;
  yearMonth: string;
  onReset: () => void;
}) {
  const [ym, m] = yearMonth.split("-");
  return (
    <div className="space-y-4 py-2 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-semibold">
          {ym}년 {parseInt(m, 10)}월 근무 적용 완료!
        </p>
        <p className="mt-1 text-[13px] text-ios-muted">{count}개 날짜에 근무가 등록됐습니다.</p>
      </div>
      <Button variant="secondary" onClick={onReset} className="mx-auto justify-center text-[13px]">
        다른 근무표 스캔
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────

export function ShiftOCRUpload() {
  const store = useAppStore();
  const customDefs = store.settings.customShiftTypes ?? [];

  const today = new Date();
  const defaultYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [yearMonthHint, setYearMonthHint] = useState(defaultYM);
  const [step, setStep] = useState<Step>({ id: "idle" });

  const resetToIdle = () => setStep({ id: "idle" });

  // ── 파일 선택 후 OCR 실행 ──
  const handleFile = async (file: File) => {
    const lastUserName = store.settings.ocrLastUserName ?? "";

    setStep({ id: "processing", progress: { stage: "loading", pct: 5, message: "OCR 준비 중..." } });

    const result = await parseScheduleImage(
      file,
      customDefs,
      yearMonthHint,
      lastUserName,
      (p) => setStep({ id: "processing", progress: p })
    );

    handleOcrResult(result);
  };

  // ── OCR 결과 처리 ──
  const handleOcrResult = (result: OcrResult) => {
    if (result.kind === "error") {
      setStep({ id: "error", message: result.message });
      return;
    }
    if (result.kind === "multi_person_pending") {
      setStep({ id: "name_input", pending: result });
      return;
    }
    if (result.kind === "individual" || result.kind === "multi_person_resolved") {
      setStep({
        id: "review",
        yearMonth: result.yearMonth,
        schedule: result.schedule,
        unknownCodes: result.unknownCodes,
        resolvedMappings: {},
        saveAsCustom: false,
      });
    }
  };

  // ── 이름 선택 후 다인 근무표 재파싱 ──
  const handleNameSelect = (name: string) => {
    if (step.id !== "name_input") return;
    store.setSettings({ ocrLastUserName: name });

    const resolved = resolvePersonFromGrid(step.pending, name, customDefs);
    handleOcrResult(resolved);
  };

  // ── 미지 근무 매핑 변경 ──
  const handleMappingChange = (raw: string, semantic: CoreShift) => {
    if (step.id !== "review") return;
    setStep({
      ...step,
      resolvedMappings: { ...step.resolvedMappings, [raw]: semantic },
    });
  };

  // ── 일정에 적용 ──
  const handleConfirm = () => {
    if (step.id !== "review") return;

    const schedulePatch: Record<ISODate, import("@/lib/types").Shift> = {};
    const namePatch: Record<ISODate, string> = {};

    // 정상 인식된 근무
    for (const [iso, entry] of Object.entries(step.schedule) as [ISODate, OcrScheduleEntry][]) {
      schedulePatch[iso] = entry.semanticType as import("@/lib/types").Shift;
      if (entry.displayName) namePatch[iso] = entry.displayName;
    }

    // 미지 근무 — 사용자 매핑 적용
    for (const u of step.unknownCodes) {
      const mapped = step.resolvedMappings[u.rawText];
      if (!mapped) continue;
      schedulePatch[u.isoDate] = mapped as import("@/lib/types").Shift;
      namePatch[u.isoDate] = u.rawText; // 원래 텍스트를 표시명으로 유지
    }

    store.batchSetSchedule(schedulePatch);
    store.batchSetShiftNames(namePatch);

    // 커스텀으로 저장 선택 시
    if (step.saveAsCustom) {
      const uniqueRaws = [...new Set(step.unknownCodes.map((u) => u.rawText))];
      const newDefs: CustomShiftDef[] = uniqueRaws
        .filter((raw) => step.resolvedMappings[raw])
        .map((raw) => ({
          id: crypto.randomUUID(),
          displayName: raw,
          semanticType: step.resolvedMappings[raw],
          aliases: [],
        }));
      if (newDefs.length > 0) {
        store.setSettings({ customShiftTypes: [...customDefs, ...newDefs] });
      }
    }

    setStep({
      id: "done",
      count: Object.keys(schedulePatch).length,
      yearMonth: step.yearMonth,
    });
  };

  // ────────────────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────────────────

  return (
    <Card className="p-5">
      {/* 헤더 */}
      <div className="mb-4 flex items-start justify-between">
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

      {/* 단계별 렌더 */}
      {step.id === "idle" && (
        <DropZone
          onFile={handleFile}
          yearMonthHint={yearMonthHint}
          onYearMonthChange={setYearMonthHint}
        />
      )}

      {step.id === "processing" && (
        <ProgressBar progress={step.progress} />
      )}

      {step.id === "name_input" && (
        <NameSelectStep
          pending={step.pending}
          onSelect={handleNameSelect}
          onBack={resetToIdle}
        />
      )}

      {step.id === "review" && (
        <ReviewStep
          step={step}
          onConfirm={handleConfirm}
          onBack={resetToIdle}
          onMappingChange={handleMappingChange}
          onSaveAsCustomChange={(v) => step.id === "review" && setStep({ ...step, saveAsCustom: v })}
        />
      )}

      {step.id === "done" && (
        <DoneStep count={step.count} yearMonth={step.yearMonth} onReset={resetToIdle} />
      )}

      {step.id === "error" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-red-50 p-4">
            <p className="text-[13px] font-semibold text-red-700">인식 실패</p>
            <p className="mt-1 text-[12.5px] text-red-600">{step.message}</p>
          </div>
          <Button variant="secondary" onClick={resetToIdle} className="w-full justify-center text-[13px]">
            다시 시도
          </Button>
        </div>
      )}
    </Card>
  );
}
