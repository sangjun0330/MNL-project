"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { CoreShift, CustomShiftDef } from "@/lib/model";
import { cn } from "@/lib/cn";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const SEMANTIC_OPTIONS: Array<{ value: CoreShift; label: string; hint: string }> = [
  { value: "D", label: "주간 (D)", hint: "낮번 · 오전 · AM" },
  { value: "E", label: "이브닝 (E)", hint: "저녁 · PM" },
  { value: "N", label: "나이트 (N)", hint: "야간 · 밤번" },
  { value: "M", label: "미들 (M)", hint: "중간번" },
  { value: "OFF", label: "오프 (OFF)", hint: "비번 · 쉬는날" },
  { value: "VAC", label: "휴가 (VAC)", hint: "연차 · 반차" },
];

function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[26px] border border-black/5 bg-white/90 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.04)] backdrop-blur-xl", className)}>
      {children}
    </div>
  );
}

function ShiftDefRow({ def, onDelete }: { def: CustomShiftDef; onDelete: (id: string) => void }) {
  const semanticLabel = SHIFT_LABELS.find((item) => item.id === def.semanticType)?.hint ?? def.semanticType;

  return (
    <div className="flex items-center gap-3 py-3">
      <span className={cn("inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[12px] font-semibold", shiftColor(def.semanticType))}>
        {def.displayName}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium tracking-[-0.01em] text-[#111827]">
          {def.displayName}
          <span className="ml-1.5 text-[11px] text-[#6B7280]">→ {semanticLabel}</span>
        </div>
        {def.aliases.length > 0 && <div className="mt-1 text-[11.5px] text-[#6B7280]">인식 별칭: {def.aliases.join(", ")}</div>}
      </div>

      <button
        type="button"
        onClick={() => onDelete(def.id)}
        className="shrink-0 rounded-full border border-black/6 bg-[#F7F7F8] p-2 text-[#6B7280] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
        aria-label={`${def.displayName} 삭제`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  );
}

function AddShiftForm({ onAdd }: { onAdd: (def: Omit<CustomShiftDef, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [semanticType, setSemanticType] = useState<CoreShift>("D");
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);

  const addAlias = () => {
    const trimmed = aliasInput.trim().slice(0, 20);
    if (!trimmed || aliases.includes(trimmed) || aliases.length >= 15) return;
    setAliases((prev) => [...prev, trimmed]);
    setAliasInput("");
  };

  const handleSubmit = () => {
    const name = displayName.trim().slice(0, 20);
    if (!name) return;
    onAdd({
      displayName: name,
      semanticType,
      aliases,
    });
    setDisplayName("");
    setSemanticType("D");
    setAliasInput("");
    setAliases([]);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-dashed border-black/10 bg-[#FAFAFA] px-4 py-4 text-[13px] font-medium text-[#4B5563] transition-colors hover:bg-[#F6F7F8]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        새 근무 추가
      </button>
    );
  }

  return (
    <Surface className="space-y-4 bg-[#FAFAFA]">
      <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]">새 근무 이름 등록</div>

      <div>
        <label className="mb-1.5 block text-[11.5px] font-medium text-[#6B7280]">
          근무 이름 <span className="text-red-500">*</span>
        </label>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value.slice(0, 20))}
          placeholder="예: 낮번, 야간특, PM"
          className="w-full rounded-2xl border border-black/6 bg-white px-4 py-3 text-[14px] font-medium text-[#111827] outline-none focus:border-black/12"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11.5px] font-medium text-[#6B7280]">
          근무 종류 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {SEMANTIC_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSemanticType(option.value)}
              className={cn(
                "rounded-2xl border px-3 py-2 text-left transition-colors",
                semanticType === option.value ? "border-black bg-black text-white" : "border-black/6 bg-white text-[#111827]"
              )}
            >
              <div className="text-[12.5px] font-semibold">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11.5px] font-medium text-[#6B7280]">
          별칭
        </label>
        <div className="flex gap-2">
          <input
            value={aliasInput}
            onChange={(event) => setAliasInput(event.target.value.slice(0, 20))}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addAlias();
            }}
            placeholder="예: 낮, D번, day"
            className="flex-1 rounded-2xl border border-black/6 bg-white px-4 py-3 text-[13px] font-medium text-[#111827] outline-none focus:border-black/12"
          />
          <button
            type="button"
            onClick={addAlias}
            className="rounded-2xl border border-black/6 bg-white px-4 py-3 text-[12px] font-semibold text-[#111827] transition-colors hover:bg-[#F7F7F8]"
          >
            추가
          </button>
        </div>

        {aliases.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {aliases.map((alias) => (
              <span key={alias} className="inline-flex items-center gap-1 rounded-full border border-black/6 bg-white px-2.5 py-1 text-[12px] text-[#374151]">
                {alias}
                <button type="button" onClick={() => setAliases((prev) => prev.filter((item) => item !== alias))} className="text-[#6B7280] hover:text-red-500" aria-label={`${alias} 제거`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1 justify-center rounded-2xl bg-white text-[13px] text-[#111827]">
          취소
        </Button>
        <Button onClick={handleSubmit} disabled={!displayName.trim()} className="flex-1 justify-center rounded-2xl bg-black text-[13px] text-white disabled:opacity-40">
          저장
        </Button>
      </div>
    </Surface>
  );
}

export function CustomShiftManager() {
  const store = useAppStore();
  const customShiftTypes = useMemo(() => store.settings.customShiftTypes ?? [], [store.settings.customShiftTypes]);

  const handleAdd = (defWithoutId: Omit<CustomShiftDef, "id">) => {
    store.setSettings({
      customShiftTypes: [
        ...customShiftTypes,
        {
          ...defWithoutId,
          id: crypto.randomUUID(),
        },
      ],
    });
  };

  const handleDelete = (id: string) => {
    store.setSettings({
      customShiftTypes: customShiftTypes.filter((item) => item.id !== id),
    });
  };

  return (
    <Card className="overflow-hidden border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(250,250,251,0.98)_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-5">
        <div className="text-[18px] font-semibold tracking-[-0.02em] text-[#111827]">병원별 근무 이름</div>
      </div>

      <Surface className="mb-4 space-y-3 bg-[#FAFAFA]">
        <div className="text-[12.5px] font-medium text-[#6B7280]">기본 근무</div>
        <div className="flex flex-wrap gap-2">
          {SHIFT_LABELS.map((label) => (
            <span key={label.id} className={cn("inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold", shiftColor(label.id))}>
              {label.hint}
            </span>
          ))}
        </div>
      </Surface>

      <div className="space-y-4">
        {customShiftTypes.length > 0 ? (
          <Surface className="divide-y divide-black/5">
            {customShiftTypes.map((item) => (
              <ShiftDefRow key={item.id} def={item} onDelete={handleDelete} />
            ))}
          </Surface>
        ) : (
          <Surface className="bg-[#FAFAFA] text-center">
            <div className="text-[13px] text-[#6B7280]">커스텀 근무 없음</div>
          </Surface>
        )}

        <AddShiftForm onAdd={handleAdd} />
      </div>
    </Card>
  );
}
