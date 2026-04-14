"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { CoreShift, CustomShiftDef } from "@/lib/model";
import { cn } from "@/lib/cn";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const SEMANTIC_OPTIONS: { value: CoreShift; label: string; hint: string }[] = [
  { value: "D", label: "주간 (D)", hint: "낮번·오전·AM" },
  { value: "E", label: "이브닝 (E)", hint: "저녁·PM" },
  { value: "N", label: "나이트 (N)", hint: "야간·밤번" },
  { value: "M", label: "미들 (M)", hint: "중간번" },
  { value: "OFF", label: "오프 (OFF)", hint: "쉬는날·비번" },
  { value: "VAC", label: "휴가 (VAC)", hint: "연차·반차" },
];

function ShiftDefRow({ def, onDelete }: { def: CustomShiftDef; onDelete: (id: string) => void }) {
  const semanticLabel = SHIFT_LABELS.find((item) => item.id === def.semanticType)?.hint ?? def.semanticType;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={cn("inline-flex shrink-0 items-center rounded-lg border px-2.5 py-0.5 text-[12px] font-semibold", shiftColor(def.semanticType))}>
        {def.displayName}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-snug">
          {def.displayName}
          <span className="ml-1.5 text-[11px] text-ios-muted">→ {semanticLabel}</span>
        </div>
        {def.aliases.length > 0 && (
          <div className="mt-0.5 text-[11px] text-ios-muted">인식 별칭: {def.aliases.join(", ")}</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDelete(def.id)}
        className="shrink-0 rounded-lg p-1.5 text-ios-muted hover:bg-red-50 hover:text-red-500 active:opacity-70"
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
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-ios-sep px-4 py-3 text-[13px] text-ios-muted hover:bg-ios-fill active:opacity-70"
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
    <div className="space-y-3 rounded-2xl border border-ios-sep bg-ios-fill p-4">
      <div className="text-[13px] font-semibold">새 근무 이름 등록</div>

      <div>
        <label className="mb-1 block text-[11.5px] text-ios-muted">
          근무 이름 <span className="text-red-500">*</span>
        </label>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value.slice(0, 20))}
          placeholder="예: 낮번, 야간특, PM"
          className="w-full rounded-xl border border-ios-sep bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11.5px] text-ios-muted">
          어떤 종류 근무인가요? <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {SEMANTIC_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSemanticType(option.value)}
              className={cn(
                "rounded-xl border px-2 py-2 text-left text-[12px] font-medium transition-colors",
                semanticType === option.value
                  ? "border-black/20 bg-black text-white"
                  : "border-ios-sep bg-white text-ios-label hover:bg-ios-fill"
              )}
            >
              <div>{option.label}</div>
              <div className="mt-0.5 text-[10px] opacity-60">{option.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11.5px] text-ios-muted">
          AI 인식 별칭 <span className="text-[10px] opacity-60">(근무표에 적힌 다른 표현)</span>
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
            className="flex-1 rounded-xl border border-ios-sep bg-white px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-black/10"
          />
          <button
            type="button"
            onClick={addAlias}
            className="rounded-xl border border-ios-sep bg-white px-3 py-2 text-[12px] font-medium hover:bg-ios-fill active:opacity-70"
          >
            추가
          </button>
        </div>

        {aliases.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {aliases.map((alias) => (
              <span key={alias} className="inline-flex items-center gap-1 rounded-full border border-ios-sep bg-white px-2.5 py-0.5 text-[12px]">
                {alias}
                <button
                  type="button"
                  onClick={() => setAliases((prev) => prev.filter((item) => item !== alias))}
                  className="text-ios-muted hover:text-red-500"
                  aria-label={`${alias} 제거`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1 justify-center text-[13px]">
          취소
        </Button>
        <Button onClick={handleSubmit} disabled={!displayName.trim()} className="flex-1 justify-center bg-black text-[13px] text-white disabled:opacity-40">
          저장
        </Button>
      </div>
    </div>
  );
}

export function CustomShiftManager() {
  const store = useAppStore();
  const customShiftTypes = store.settings.customShiftTypes ?? [];

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
    <Card className="p-5">
      <div className="mb-4">
        <div className="text-[14px] font-semibold">우리 병원 근무 이름</div>
        <div className="mt-1 text-[12.5px] text-ios-muted">
          병원마다 다른 근무 명칭을 등록하세요. AI 이미지 스캔과 달력 표시에 자동 적용됩니다.
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-ios-fill p-3">
        <div className="mb-2 text-[11.5px] font-medium text-ios-muted">기본 근무 (변경 불가)</div>
        <div className="flex flex-wrap gap-1.5">
          {SHIFT_LABELS.map((label) => (
            <span
              key={label.id}
              className={cn("inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[12px] font-semibold", shiftColor(label.id))}
            >
              {label.hint}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {customShiftTypes.length > 0 ? (
          <div className="divide-y divide-ios-sep">
            {customShiftTypes.map((item) => (
              <ShiftDefRow key={item.id} def={item} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-ios-sep px-4 py-6 text-center text-[12.5px] text-ios-muted">
            아직 등록된 커스텀 근무 이름이 없습니다.
          </div>
        )}
      </div>

      <div className="mt-4">
        <AddShiftForm onAdd={handleAdd} />
      </div>
    </Card>
  );
}
