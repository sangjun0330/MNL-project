"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import {
  convertMedicalUnit,
  UNIT_OPTIONS,
  sanitizeNumericInput,
  parseNumericInput,
  formatNumber,
  type UnitCategory,
} from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

const CATEGORY_LABELS: Record<UnitCategory, { label: string; emoji: string }> = {
  temperature: { label: "체온", emoji: "🌡️" },
  weight: { label: "체중", emoji: "⚖️" },
  length: { label: "길이", emoji: "📏" },
  mass: { label: "질량", emoji: "💊" },
  volume: { label: "용량", emoji: "🧪" },
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as UnitCategory[];

export function ToolUnitConverterPage() {
  const { t } = useI18n();
  const [category, setCategory] = useState<UnitCategory>("temperature");
  const [valueRaw, setValueRaw] = useState("");
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(1);

  const units = UNIT_OPTIONS[category];
  const fromUnit = units[fromIdx] ?? units[0];
  const toUnit = units[toIdx] ?? units[1] ?? units[0];

  const value = parseNumericInput(valueRaw);
  const result = useMemo(() => {
    if (!valueRaw.trim() || value == null) return null;
    return convertMedicalUnit(category, value, fromUnit, toUnit);
  }, [category, value, fromUnit, toUnit, valueRaw]);

  const handleSwap = () => {
    setFromIdx(toIdx);
    setToIdx(fromIdx);
  };

  const handleCategoryChange = (cat: UnitCategory) => {
    setCategory(cat);
    setFromIdx(0);
    setToIdx(Math.min(1, UNIT_OPTIONS[cat].length - 1));
    setValueRaw("");
  };

  return (
    <ToolPageShell title={t("단위 변환기")} subtitle={t("체온·체중·질량·용량 변환")} badge="NEW">
      <div className="space-y-4">
        {/* Category selector */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                category === cat ? "bg-black text-white" : "bg-black/5 text-ios-text hover:bg-black/8"
              }`}
            >
              {CATEGORY_LABELS[cat].emoji} {t(CATEGORY_LABELS[cat].label)}
            </button>
          ))}
        </div>

        <Card className="p-5 space-y-4">
          {/* Input */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
              {fromUnit}
            </label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="0"
              value={valueRaw}
              onChange={(e) => setValueRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>

          {/* Swap button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              className="rounded-full bg-black/5 p-2.5 transition hover:bg-black/10 active:scale-95"
              aria-label={t("단위 교환")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 2v12m0 0l-3-3m3 3l3-3M12 14V2m0 0l-3 3m3-3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Result */}
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
              {toUnit}
            </label>
            <div className="w-full rounded-xl border border-ios-sep bg-gray-50 px-4 py-3 text-[15px] text-ios-text">
              {result?.ok ? formatNumber(result.data.result, 4) : "—"}
            </div>
          </div>

          {/* From/To unit selectors when more than 2 units */}
          {units.length > 2 && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[12px] text-ios-sub">{t("변환 전")}</label>
                <select
                  value={fromIdx}
                  onChange={(e) => setFromIdx(Number(e.target.value))}
                  className="w-full rounded-xl border border-ios-sep bg-white px-3 py-2.5 text-[13px] outline-none"
                >
                  {units.map((u, i) => (
                    <option key={u} value={i}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] text-ios-sub">{t("변환 후")}</label>
                <select
                  value={toIdx}
                  onChange={(e) => setToIdx(Number(e.target.value))}
                  className="w-full rounded-xl border border-ios-sep bg-white px-3 py-2.5 text-[13px] outline-none"
                >
                  {units.map((u, i) => (
                    <option key={u} value={i}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </Card>

        {result && !result.ok && (
          <Card className="p-5">
            <div className="text-center text-[13px] text-red-600">{result.errors.join(", ")}</div>
          </Card>
        )}

        <Button variant="secondary" className="w-full" onClick={() => setValueRaw("")}>
          {t("초기화")}
        </Button>
      </div>
    </ToolPageShell>
  );
}
