"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { CoreShift, CustomShiftDef } from "@/lib/model";
import { SHIFT_LABELS, shiftColor } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// 의미 타입 선택 옵션
const SEMANTIC_OPTIONS: { value: CoreShift; label: string; hint: string }[] = [
  { value: "D",   label: "주간 (D)",   hint: "낮번·오전·AM" },
  { value: "E",   label: "이브닝 (E)", hint: "저녁·PM" },
  { value: "N",   label: "나이트 (N)", hint: "야간·밤번" },
  { value: "M",   label: "미들 (M)",   hint: "중간번" },
  { value: "OFF", label: "오프 (OFF)", hint: "쉬는날·비번" },
  { value: "VAC", label: "휴가 (VAC)", hint: "연차·반차" },
];

// ────────────────────────────────────────────────────────────
// 개별 커스텀 근무 아이템 행
// ────────────────────────────────────────────────────────────

function ShiftDefRow({
  def,
  onDelete,
}: {
  def: CustomShiftDef;
  onDelete: (id: string) => void;
}) {
  const colorClass = shiftColor(def.semanticType);
  const semanticLabel = SHIFT_LABELS.find((l) => l.id === def.semanticType)?.hint ?? def.semanticType;

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* 근무 칩 */}
      <span className={cn("inline-flex shrink-0 items-center rounded-lg px-2.5 py-0.5 text-[12px] font-semibold border", colorClass)}>
        {def.displayName}
      </span>

      {/* 매핑 정보 */}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-snug">
          {def.displayName}
          <span className="ml-1.5 text-[11px] text-ios-muted">→ {semanticLabel}</span>
        </div>
        {def.aliases.length > 0 && (
          <div className="mt-0.5 text-[11px] text-ios-muted">
            인식 별칭: {def.aliases.join(", ")}
          </div>
        )}
      </div>

      {/* 삭제 버튼 */}
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

// ────────────────────────────────────────────────────────────
// 새 근무 추가 폼
// ────────────────────────────────────────────────────────────

function AddShiftForm({ onAdd }: { onAdd: (def: Omit<CustomShiftDef, "id">) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [semanticType, setSemanticType] = useState<CoreShift>("D");
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const addAlias = () => {
    const trimmed = aliasInput.trim().slice(0, 20);
    if (!trimmed || aliases.includes(trimmed) || aliases.length >= 15) return;
    setAliases((prev) => [...prev, trimmed]);
    setAliasInput("");
  };

  const removeAlias = (a: string) => setAliases((prev) => prev.filter((x) => x !== a));

  const handleSubmit = () => {
    const name = displayName.trim().slice(0, 20);
    if (!name) return;
    onAdd({ displayName: name, semanticType, aliases });
    setDisplayName("");
    setSemanticType("D");
    setAliases([]);
    setAliasInput("");
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
    <div className="rounded-2xl border border-ios-sep bg-ios-fill p-4 space-y-3">
      <div className="text-[13px] font-semibold">새 근무 이름 등록</div>

      {/* 근무 이름 */}
      <div>
        <label className="mb-1 block text-[11.5px] text-ios-muted">근무 이름 <span className="text-red-500">*</span></label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
          placeholder="예: 낮번, 야간특, PM"
          className="w-full rounded-xl border border-ios-sep bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      {/* 의미 타입 */}
      <div>
        <label className="mb-1 block text-[11.5px] text-ios-muted">어떤 종류 근무인가요? <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-3 gap-1.5">
          {SEMANTIC_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSemanticType(opt.value)}
              className={cn(
                "rounded-xl border px-2 py-2 text-[12px] font-medium transition-colors text-left",
                semanticType === opt.value
                  ? "border-black/20 bg-black text-white"
                  : "border-ios-sep bg-white text-ios-label hover:bg-ios-fill"
              )}
            >
              <div>{opt.label}</div>
              <div className="mt-0.5 text-[10px] opacity-60">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* OCR 별칭 */}
      <div>
        <label className="mb-1 block text-[11.5px] text-ios-muted">
          OCR 인식 별칭 <span className="text-[10px] opacity-60">(근무표 이미지에 쓰인 표현들)</span>
        </label>
        <div className="flex gap-2">
          <input
            value={aliasInput}
            onChange={(e) => setAliasInput(e.target.value.slice(0, 20))}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())}
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
            {aliases.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-full border border-ios-sep bg-white px-2.5 py-0.5 text-[12px]"
              >
                {a}
                <button
                  type="button"
                  onClick={() => removeAlias(a)}
                  className="text-ios-muted hover:text-red-500"
                  aria-label={`${a} 제거`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="secondary"
          onClick={() => setOpen(false)}
          className="flex-1 justify-center text-[13px]"
        >
          취소
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!displayName.trim()}
          className="flex-1 justify-center bg-black text-white text-[13px] disabled:opacity-40"
        >
          저장
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────

export function CustomShiftManager() {
  const store = useAppStore();
  const customDefs = store.settings.customShiftTypes ?? [];

  const handleAdd = (defWithoutId: Omit<CustomShiftDef, "id">) => {
    const newDef: CustomShiftDef = {
      ...defWithoutId,
      id: crypto.randomUUID(),
    };
    store.setSettings({ customShiftTypes: [...customDefs, newDef] });
  };

  const handleDelete = (id: string) => {
    store.setSettings({
      customShiftTypes: customDefs.filter((d) => d.id !== id),
    });
  };

  return (
    <Card className="p-5">
      {/* 헤더 */}
      <div className="mb-4">
        <div className="text-[14px] font-semibold">우리 병원 근무 이름</div>
        <div className="mt-1 text-[12.5px] text-ios-muted">
          병원마다 다른 근무 명칭을 등록하세요. OCR 스캔 및 표시에 자동 적용됩니다.
        </div>
      </div>

      {/* 기본 근무 타입 안내 */}
      <div className="mb-4 rounded-xl bg-ios-fill p-3">
        <div className="mb-2 text-[11.5px] font-medium text-ios-muted">기본 근무 (변경 불가)</div>
        <div className="flex flex-wrap gap-1.5">
          {SHIFT_LABELS.map((sl) => (
            <span
              key={sl.id}
              className={cn(
                "inline-flex items-center rounded-lg px-2.5 py-0.5 text-[12px] font-semibold border",
                shiftColor(sl.id)
              )}
            >
              {sl.hint}
            </span>
          ))}
        </div>
      </div>

      {/* 커스텀 근무 목록 */}
      {customDefs.length > 0 && (
        <div className="mb-3 divide-y divide-ios-sep rounded-xl border border-ios-sep bg-white px-4">
          {customDefs.map((def) => (
            <ShiftDefRow key={def.id} def={def} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* 추가 폼 */}
      <AddShiftForm onAdd={handleAdd} />

      {customDefs.length === 0 && (
        <p className="mt-3 text-[12px] text-ios-muted text-center">
          아직 등록된 커스텀 근무가 없습니다.
        </p>
      )}
    </Card>
  );
}
