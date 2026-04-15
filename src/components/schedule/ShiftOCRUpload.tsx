"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
import { useCurrentAccountResources } from "@/lib/currentAccountResourceStore";
import type { ISODate } from "@/lib/date";
import type { CoreShift, CustomShiftDef } from "@/lib/model";
import { withReturnTo } from "@/lib/navigation";
import { MAX_SCHEDULE_IMPORT_IMAGE_BYTES, type ScheduleAIImportRequest, type ScheduleAIImportResponse } from "@/lib/scheduleAiImport";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { shiftColor } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const CLIENT_TIMEOUT_MS = 180_000;
const SHOW_DEBUG_DETAIL = process.env.NODE_ENV === "development";
const KNOWN_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

const SEMANTIC_OPTIONS: Array<{ value: CoreShift; label: string }> = [
  { value: "D", label: "주간 (D)" },
  { value: "E", label: "이브닝 (E)" },
  { value: "N", label: "나이트 (N)" },
  { value: "M", label: "미들 (M)" },
  { value: "OFF", label: "오프 (OFF)" },
  { value: "VAC", label: "휴가 (VAC)" },
];


type ReviewStepState = {
  id: "review";
  data: ScheduleAIImportResponse;
  resolvedMappings: Record<string, CoreShift>;
  saveAsCustom: boolean;
  applyMode: "overwrite" | "fill_empty";
};

type Step =
  | { id: "idle" }
  | { id: "processing"; title: string }
  | { id: "name_input"; data: ScheduleAIImportResponse }
  | ReviewStepState
  | { id: "done"; count: number; skipped: number; yearMonth: string | null }
  | { id: "error"; message: string; detail?: string; actionHref?: string; actionLabel?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeImportError(raw: string) {
  const value = String(raw ?? "").toLowerCase();
  if (!value) return "AI 일정 분석 중 오류가 발생했습니다.";
  if (value.includes("login_required")) return "로그인이 필요합니다.";
  if (value.includes("consent_required")) return "서비스 동의 후 사용할 수 있습니다.";
  if (value.includes("image_too_large_max_6mb")) return "이미지는 6MB 이하만 업로드할 수 있습니다.";
  if (value.includes("invalid_image_data_url")) return "지원되지 않는 이미지 형식입니다.";
  if (value.includes("selected_person_required")) return "이름을 먼저 선택해 주세요.";
  if (value.includes("person_not_found")) return "선택한 이름의 근무를 찾지 못했습니다.";
  if (value.includes("schedule_ai_timeout") || value.includes("client_timeout")) {
    return "응답 대기 시간이 길어져 요청을 종료했습니다. 다시 시도해 주세요.";
  }
  if (value.includes("openai_network")) return "네트워크 오류로 AI 요청에 실패했습니다.";
  if (value.includes("openai_responses_403")) return "AI Gateway 또는 모델 권한 설정을 확인해 주세요.";
  if (value.includes("openai_responses_400")) return "AI 요청 형식이 올바르지 않습니다. 서버 설정을 확인해 주세요.";
  return "AI 일정 분석 중 오류가 발생했습니다.";
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid_image_data_url"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("invalid_image_data_url"));
    reader.readAsDataURL(file);
  });
}

function isAcceptedImageFile(file: File) {
  const fileType = String(file.type ?? "").toLowerCase();
  if (fileType.startsWith("image/")) return true;
  const fileName = String(file.name ?? "").toLowerCase();
  return KNOWN_IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

async function fetchImportWithTimeout(body: ScheduleAIImportRequest, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("client_timeout"));
    }, timeoutMs);
  });

  try {
    const authHeaders = await getBrowserAuthHeaders();
    return (await Promise.race([
      fetch("/api/schedule/ai-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      }),
      timeoutPromise,
    ])) as Response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildUniqueCustomShiftTypes(existing: CustomShiftDef[], additions: Array<{ rawText: string; semanticType: CoreShift }>) {
  const seen = new Set(existing.map((item) => `${item.displayName.toLowerCase()}::${item.semanticType}`));
  const next = [...existing];

  for (const addition of additions) {
    const displayName = addition.rawText.trim().slice(0, 20);
    if (!displayName) continue;
    const key = `${displayName.toLowerCase()}::${addition.semanticType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      id: crypto.randomUUID(),
      displayName,
      semanticType: addition.semanticType,
      aliases: [],
    });
  }

  return next;
}

function AccentPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[-0.01em]",
        tone === "primary"
          ? "border-[#DBEAFE] bg-[#EFF6FF] text-[#2563EB]"
          : "border-black/5 bg-[#F7F7F8] text-[#4B5563]"
      )}
    >
      {children}
    </span>
  );
}

function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[28px] border border-black/5 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl", className)}>
      {children}
    </div>
  );
}

function formatYearMonthLabel(value: string) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})$/);
  if (!match) return "연월 선택";

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return "연월 선택";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function ProcessingView({ title, animated = false }: { title: string; animated?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6]">
        <svg className={cn("h-4 w-4 text-[#111827]", animated && "schedule-config-spinner")} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <div>
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]">{title}</div>
        <div className="mt-0.5 text-[12.5px] text-[#6B7280]">잠시만 기다려 주세요</div>
      </div>
    </div>
  );
}

function DropZone({
  onFile,
  yearMonthHint,
  onYearMonthChange,
}: {
  onFile: (file: File) => void;
  yearMonthHint: string;
  onYearMonthChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const yearMonthLabel = useMemo(() => formatYearMonthLabel(yearMonthHint), [yearMonthHint]);

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      onFile(file);
    },
    [onFile]
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className="space-y-4">
      <Surface
        className={cn(
          "cursor-pointer border border-dashed transition-colors",
          dragOver ? "border-[#111827]/15 bg-[#F3F4F6]" : "border-black/10 bg-[#FAFAFA] hover:bg-[#F6F7F8]"
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) onFile(file);
          }}
          className="w-full py-7"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[#111827]">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <div>
              <div className="text-[18px] font-semibold tracking-[-0.02em] text-[#111827]">근무표 이미지 선택</div>
              <div className="mt-1.5 space-y-1 text-[13px] text-[#6B7280]">
                <div>드래그, 탭, 또는 복사한 이미지를 붙여넣으세요.</div>
                <div>여러 명이 함께 있는 근무표도 올릴 수 있고, 다음 단계에서 이름을 고를 수 있어요.</div>
              </div>
            </div>
          </div>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = "";
          }}
        />
        <div className="border-t border-black/5 px-5 pb-4 pt-3">
          <div className="relative">
            <input
              type="month"
              value={yearMonthHint}
              onChange={(event) => onYearMonthChange(event.target.value)}
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              aria-label="근무표 연월 선택"
            />
            <div className="pointer-events-none flex min-h-[46px] w-full items-center justify-center rounded-2xl border border-black/6 bg-white px-4 text-center text-[14px] font-semibold tracking-[-0.01em] text-[#111827] peer-focus:border-black/12">
              <span className="block max-w-full truncate text-center">{yearMonthLabel}</span>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function AccessRequiredCard({
  title,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Surface className="space-y-4">
      <div>
        <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">{title}</div>
        <div className="mt-1.5 text-[13px] leading-6 text-[#6B7280]">{detail}</div>
      </div>
      <Button onClick={onAction} className="w-full justify-center rounded-2xl bg-black text-[13px] text-white">
        {actionLabel}
      </Button>
    </Surface>
  );
}

function NameSelectStep({
  data,
  onSelect,
  onBack,
}: {
  data: ScheduleAIImportResponse;
  onSelect: (name: string) => void;
  onBack: () => void;
}) {
  const [input, setInput] = useState("");

  return (
    <div className="space-y-4">
      <Surface className="space-y-2 bg-[#FAFAFA]">
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]">여러 명의 근무표가 감지됐습니다</div>
      </Surface>

      {data.people.length > 0 && (
        <Surface className="space-y-3">
          <div className="text-[12.5px] font-medium text-[#6B7280]">근무표에서 발견된 이름</div>
          <div className="flex flex-wrap gap-2">
            {data.people.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSelect(name)}
                className="rounded-full border border-black/8 bg-[#FAFAFA] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-[#111827] transition-colors hover:border-black/15 hover:bg-[#F3F4F6]"
              >
                {name}
              </button>
            ))}
          </div>
        </Surface>
      )}

      <Surface className="space-y-3">
        <div className="text-[12.5px] font-medium text-[#6B7280]">직접 입력</div>
        <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_62px]">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 24))}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !input.trim()) return;
              event.preventDefault();
              onSelect(input.trim());
            }}
            placeholder="이름 입력 (예: 김OO)"
            className="min-w-0 h-[42px] rounded-2xl border border-black/6 bg-[#F7F7F8] px-3.5 text-[13px] font-medium tracking-[-0.01em] text-[#111827] outline-none focus:border-black/12 sm:h-[44px] sm:px-4 sm:text-[14px]"
          />
          <Button
            onClick={() => input.trim() && onSelect(input.trim())}
            disabled={!input.trim()}
            className="h-[42px] min-w-0 rounded-[16px] bg-black px-0 text-[11.5px] text-white disabled:opacity-40 sm:h-[44px] sm:text-[12px]"
          >
            확인
          </Button>
        </div>
      </Surface>

      <Button variant="secondary" onClick={onBack} className="w-full justify-center rounded-2xl bg-[#F3F4F6] text-[13px] text-[#111827]">
        다시 선택
      </Button>
    </div>
  );
}

function ReviewStep({
  step,
  onBack,
  onConfirm,
  onMappingChange,
  onSaveAsCustomChange,
  onApplyModeChange,
}: {
  step: ReviewStepState;
  onBack: () => void;
  onConfirm: () => void;
  onMappingChange: (rawText: string, semanticType: CoreShift) => void;
  onSaveAsCustomChange: (next: boolean) => void;
  onApplyModeChange: (next: ReviewStepState["applyMode"]) => void;
}) {
  const entries = useMemo(() => Object.values(step.data.schedule).sort((a, b) => (a.isoDate < b.isoDate ? -1 : 1)), [step.data.schedule]);

  const groupedUnknowns = useMemo(() => {
    const map = new Map<string, { rawText: string; dates: ISODate[] }>();
    for (const item of step.data.unresolved) {
      const existing = map.get(item.rawText);
      if (existing) {
        existing.dates.push(item.isoDate);
      } else {
        map.set(item.rawText, { rawText: item.rawText, dates: [item.isoDate] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rawText.localeCompare(b.rawText, "ko"));
  }, [step.data.unresolved]);

  const unresolvedRemaining = groupedUnknowns.filter((item) => !step.resolvedMappings[item.rawText]).length;
  const stats = useMemo(() => {
    const out: Record<string, number> = {};
    for (const entry of entries) out[entry.displayName] = (out[entry.displayName] ?? 0) + 1;
    return out;
  }, [entries]);

  return (
    <div className="space-y-4">
      <Surface className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">
            {step.data.yearMonth ? `${step.data.yearMonth} 근무 검토` : "근무 검토"}
          </div>
          <AccentPill tone="primary">{entries.length}일 인식</AccentPill>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats).map(([name, count]) => (
            <span key={name} className="rounded-full border border-black/6 bg-[#FAFAFA] px-2.5 py-1 text-[12px] font-medium text-[#374151]">
              {name} {count}일
            </span>
          ))}
        </div>

        {step.data.selectedPerson && <div className="text-[12px] text-[#6B7280]">선택된 이름: {step.data.selectedPerson}</div>}
      </Surface>

      {step.data.warnings.length > 0 && (
        <Surface className="space-y-2 bg-[#FFF7ED]">
          <div className="text-[12.5px] font-semibold text-[#9A3412]">확인 필요</div>
          <div className="space-y-1 text-[12px] text-[#B45309]">
            {step.data.warnings.map((warning) => (
              <div key={warning}>• {warning}</div>
            ))}
          </div>
        </Surface>
      )}

      <Surface className="space-y-3">
        <div className="text-[12.5px] font-medium text-[#6B7280]">적용 방식</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onApplyModeChange("overwrite")}
            className={cn(
              "rounded-2xl border px-4 py-3 text-left transition-colors",
              step.applyMode === "overwrite" ? "border-black bg-black text-white" : "border-black/6 bg-[#F7F7F8] text-[#111827]"
            )}
          >
            <div className="text-[12.5px] font-semibold">덮어쓰기</div>
            <div className="mt-1 text-[11px] opacity-75">해당 날짜 기존 근무를 새 결과로 바꿉니다.</div>
          </button>
          <button
            type="button"
            onClick={() => onApplyModeChange("fill_empty")}
            className={cn(
              "rounded-2xl border px-4 py-3 text-left transition-colors",
              step.applyMode === "fill_empty" ? "border-black bg-black text-white" : "border-black/6 bg-[#F7F7F8] text-[#111827]"
            )}
          >
            <div className="text-[12.5px] font-semibold">빈칸만 적용</div>
            <div className="mt-1 text-[11px] opacity-75">이미 입력된 날짜는 건너뜁니다.</div>
          </button>
        </div>
      </Surface>

      <Surface className="space-y-3">
        <div className="text-[12.5px] font-medium text-[#6B7280]">인식된 근무</div>
        <div className="schedule-config-scroll grid max-h-56 min-h-0 grid-cols-2 gap-1.5 overflow-y-auto rounded-2xl bg-[#FAFAFA] p-3">
          {entries.map((entry) => {
            const [, , day] = entry.isoDate.split("-");
            return (
              <div key={entry.isoDate} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[12px] text-[#111827]">
                <span className="w-8 shrink-0 text-[#6B7280]">{parseInt(day, 10)}일</span>
                <span className={cn("rounded-xl border px-2 py-0.5 text-[11px] font-semibold", shiftColor(entry.semanticType))}>{entry.displayName}</span>
              </div>
            );
          })}
        </div>
      </Surface>

      {groupedUnknowns.length > 0 && (
        <Surface className="space-y-3 bg-[#FFF7ED]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-[#9A3412]">미확인 근무 표기</div>
            <AccentPill>{unresolvedRemaining > 0 ? `${unresolvedRemaining}개 남음` : "매핑 완료"}</AccentPill>
          </div>

          {groupedUnknowns.map((group) => (
            <div key={group.rawText} className="flex flex-col gap-2 rounded-2xl bg-white/70 p-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-black/6 bg-white px-2.5 py-1 text-[12px] font-semibold text-[#111827]">{group.rawText}</span>
                <span className="text-[11.5px] text-[#6B7280]">{group.dates.map((iso) => Number(iso.slice(-2))).join(", ")}일</span>
              </div>
              <select
                value={step.resolvedMappings[group.rawText] ?? ""}
                onChange={(event) => onMappingChange(group.rawText, event.target.value as CoreShift)}
                className={cn(
                  "md:ml-auto rounded-2xl border px-3 py-2 text-[12px] font-medium outline-none",
                  step.resolvedMappings[group.rawText] ? "border-emerald-200 bg-emerald-50 text-[#065F46]" : "border-black/6 bg-white text-[#111827]"
                )}
              >
                <option value="">근무 선택</option>
                {SEMANTIC_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {groupedUnknowns.some((group) => step.resolvedMappings[group.rawText]) && (
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-white/70 px-3 py-3">
              <input
                type="checkbox"
                checked={step.saveAsCustom}
                onChange={(event) => onSaveAsCustomChange(event.target.checked)}
                className="h-4 w-4 rounded border-black/10"
              />
              <span className="text-[12.5px] text-[#6B7280]">이 매핑을 커스텀 근무 이름으로 저장</span>
            </label>
          )}
        </Surface>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={onBack} className="flex-1 justify-center rounded-2xl bg-[#F3F4F6] text-[13px] text-[#111827]">
          다시 선택
        </Button>
        <Button onClick={onConfirm} disabled={unresolvedRemaining > 0} className="flex-1 justify-center rounded-2xl bg-black text-[13px] text-white disabled:opacity-40">
          {unresolvedRemaining > 0 ? `${unresolvedRemaining}개 지정 필요` : "일정에 적용하기"}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({ count, skipped, yearMonth, onReset }: { count: number; skipped: number; yearMonth: string | null; onReset: () => void }) {
  return (
    <Surface className="space-y-4 py-2 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F3F4F6]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-[#111827]">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">{yearMonth ? `${yearMonth} 일정 적용 완료` : "일정 적용 완료"}</div>
        <div className="mt-1.5 text-[13px] leading-6 text-[#6B7280]">{count}개 날짜에 근무가 등록됐습니다.</div>
        {skipped > 0 && <div className="mt-1 text-[12px] text-[#6B7280]">기존 값이 있어 {skipped}개 날짜는 건너뛰었습니다.</div>}
      </div>
      <Button variant="secondary" onClick={onReset} className="mx-auto justify-center rounded-2xl bg-[#F3F4F6] text-[13px] text-[#111827]">
        다른 근무표 등록
      </Button>
    </Surface>
  );
}

export function ShiftOCRUpload() {
  const router = useRouter();
  const store = useAppStore();
  const { status: authStatus } = useAuthState();
  const { bootstrap } = useCurrentAccountResources();
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const customShiftTypes = useMemo(() => store.settings.customShiftTypes ?? [], [store.settings.customShiftTypes]);
  const consentCompleted = bootstrap?.consentCompleted ?? null;

  const today = new Date();
  const defaultYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [yearMonthHint, setYearMonthHint] = useState(defaultYearMonth);
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState("");
  const [step, setStep] = useState<Step>({ id: "idle" });

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const beginRequest = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  const isStaleRequest = useCallback((requestId: number) => {
    return !mountedRef.current || requestId !== requestIdRef.current;
  }, []);

  const resetToIdle = useCallback(() => {
    requestIdRef.current += 1;
    setSourceImageDataUrl("");
    setStep({ id: "idle" });
  }, []);

  const runImport = useCallback(async (request: ScheduleAIImportRequest) => {
    const response = await fetchImportWithTimeout(request, CLIENT_TIMEOUT_MS);
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : "schedule_ai_import_failed";
      throw new Error(error);
    }
    return payload.data as ScheduleAIImportResponse;
  }, []);

  const handleResponse = useCallback((data: ScheduleAIImportResponse) => {
    if (data.status === "person_required") {
      setStep({ id: "name_input", data });
      return;
    }

    setStep({
      id: "review",
      data,
      resolvedMappings: {},
      saveAsCustom: false,
      applyMode: "overwrite",
    });
  }, []);

  const handleApiError = useCallback((error: unknown) => {
    const raw = String((error as Error)?.message ?? error ?? "");
    const message = describeImportError(raw);
    const actionHref =
      raw.includes("login_required") || raw.includes("consent_required")
        ? withReturnTo("/settings/account", "/schedule/pattern-settings")
        : undefined;
    setStep({
      id: "error",
      message,
      detail: SHOW_DEBUG_DETAIL && raw && !raw.includes("schedule_ai_import_failed") ? raw : undefined,
      actionHref,
      actionLabel: actionHref ? "계정 설정으로 이동" : undefined,
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const requestId = beginRequest();

      try {
        if (!isAcceptedImageFile(file)) {
          throw new Error("invalid_image_data_url");
        }

        if (file.size > MAX_SCHEDULE_IMPORT_IMAGE_BYTES) {
          throw new Error("image_too_large_max_6mb");
        }

        setStep({
          id: "processing",
          title: "근무표 이미지를 분석하고 있습니다",
        });

        const imageDataUrl = await readFileAsDataUrl(file);
        if (isStaleRequest(requestId)) return;

        setSourceImageDataUrl(imageDataUrl);
        const data = await runImport({
          mode: "detect",
          imageDataUrl,
          yearMonthHint,
          locale: "ko",
          customShiftTypes,
        });

        if (isStaleRequest(requestId)) return;
        handleResponse(data);
      } catch (error) {
        if (isStaleRequest(requestId)) return;
        handleApiError(error);
      }
    },
    [beginRequest, customShiftTypes, handleApiError, handleResponse, isStaleRequest, runImport, yearMonthHint]
  );

  const handleNameSelect = useCallback(
    async (name: string) => {
      const requestId = beginRequest();

      try {
        if (!sourceImageDataUrl) throw new Error("invalid_image_data_url");

        store.setSettings({ ocrLastUserName: name });
        setStep({
          id: "processing",
          title: `${name} 일정만 다시 정리하고 있습니다`,
        });

        const data = await runImport({
          mode: "resolve_person",
          imageDataUrl: sourceImageDataUrl,
          selectedPerson: name,
          yearMonthHint,
          locale: "ko",
          customShiftTypes,
        });

        if (isStaleRequest(requestId)) return;
        handleResponse(data);
      } catch (error) {
        if (isStaleRequest(requestId)) return;
        handleApiError(error);
      }
    },
    [beginRequest, customShiftTypes, handleApiError, handleResponse, isStaleRequest, runImport, sourceImageDataUrl, store, yearMonthHint]
  );

  const handleConfirm = useCallback(() => {
    if (step.id !== "review") return;

    const schedulePatch: Record<ISODate, import("@/lib/types").Shift> = {};
    const shiftNamePatch: Record<ISODate, string> = {};
    let skipped = 0;

    const applyEntry = (isoDate: ISODate, semanticType: import("@/lib/types").Shift, displayName: string) => {
      if (step.applyMode === "fill_empty" && store.schedule[isoDate]) {
        skipped += 1;
        return;
      }
      schedulePatch[isoDate] = semanticType;
      if (displayName) shiftNamePatch[isoDate] = displayName;
    };

    for (const entry of Object.values(step.data.schedule)) {
      applyEntry(entry.isoDate, entry.semanticType, entry.displayName);
    }

    const mappedCustomDefs: Array<{ rawText: string; semanticType: CoreShift }> = [];
    for (const unresolved of step.data.unresolved) {
      const mapped = step.resolvedMappings[unresolved.rawText];
      if (!mapped) continue;
      applyEntry(unresolved.isoDate, mapped, unresolved.rawText);
      mappedCustomDefs.push({ rawText: unresolved.rawText, semanticType: mapped });
    }

    store.batchSetSchedule(schedulePatch);
    store.batchSetShiftNames(shiftNamePatch);

    if (step.saveAsCustom) {
      store.setSettings({
        customShiftTypes: buildUniqueCustomShiftTypes(customShiftTypes, mappedCustomDefs),
      });
    }

    setStep({
      id: "done",
      count: Object.keys(schedulePatch).length,
      skipped,
      yearMonth: step.data.yearMonth,
    });
  }, [customShiftTypes, step, store]);

  return (
    <Card className="overflow-hidden border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(250,250,251,0.98)_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
      {authStatus === "loading" && <ProcessingView title="계정 상태를 확인하고 있습니다" />}

      {authStatus !== "loading" && authStatus !== "authenticated" && (
        <AccessRequiredCard
          title="로그인이 필요합니다"
          detail="AI 이미지 등록은 계정 단위 기능입니다. 로그인 후 일정에 바로 반영할 수 있습니다."
          actionLabel="로그인/계정 설정"
          onAction={() => router.push(withReturnTo("/settings/account", "/schedule/pattern-settings"))}
        />
      )}

      {authStatus === "authenticated" && consentCompleted === false && (
        <AccessRequiredCard
          title="서비스 동의가 필요합니다"
          detail="AI 이미지 등록을 사용하려면 계정 설정에서 서비스 동의를 먼저 완료해야 합니다."
          actionLabel="계정 설정으로 이동"
          onAction={() => router.push(withReturnTo("/settings/account", "/schedule/pattern-settings"))}
        />
      )}

      {authStatus === "authenticated" && consentCompleted !== false && step.id === "idle" && (
        <DropZone onFile={handleFile} yearMonthHint={yearMonthHint} onYearMonthChange={setYearMonthHint} />
      )}

      {authStatus === "authenticated" && consentCompleted !== false && step.id === "processing" && <ProcessingView title={step.title} animated />}

      {authStatus === "authenticated" && consentCompleted !== false && step.id === "name_input" && (
        <NameSelectStep data={step.data} onSelect={handleNameSelect} onBack={resetToIdle} />
      )}

      {authStatus === "authenticated" && consentCompleted !== false && step.id === "review" && (
        <ReviewStep
          step={step}
          onBack={resetToIdle}
          onConfirm={handleConfirm}
          onMappingChange={(rawText, semanticType) =>
            setStep((current) =>
              current.id !== "review"
                ? current
                : {
                    ...current,
                    resolvedMappings: {
                      ...current.resolvedMappings,
                      [rawText]: semanticType,
                    },
                  }
            )
          }
          onSaveAsCustomChange={(next) => setStep((current) => (current.id !== "review" ? current : { ...current, saveAsCustom: next }))}
          onApplyModeChange={(next) => setStep((current) => (current.id !== "review" ? current : { ...current, applyMode: next }))}
        />
      )}

      {authStatus === "authenticated" && consentCompleted !== false && step.id === "done" && (
        <DoneStep count={step.count} skipped={step.skipped} yearMonth={step.yearMonth} onReset={resetToIdle} />
      )}

      {authStatus === "authenticated" && consentCompleted !== false && step.id === "error" && (
        <Surface className="space-y-4 bg-[#FFF5F5]">
          <div>
            <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#B91C1C]">인식 실패</div>
            <div className="mt-1.5 text-[12.5px] leading-6 text-[#DC2626]">{step.message}</div>
            {step.detail && <div className="mt-2 break-all text-[11px] text-[#DC2626]/80">{step.detail}</div>}
          </div>
          {step.actionHref ? (
            <Button onClick={() => router.push(step.actionHref!)} className="w-full justify-center rounded-2xl bg-black text-[13px] text-white">
              {step.actionLabel ?? "이동"}
            </Button>
          ) : (
            <Button variant="secondary" onClick={resetToIdle} className="w-full justify-center rounded-2xl bg-white text-[13px] text-[#111827]">
              다시 시도
            </Button>
          )}
        </Surface>
      )}
    </Card>
  );
}
