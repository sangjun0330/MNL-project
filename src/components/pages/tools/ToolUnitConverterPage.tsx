"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import {
  type CalcHistory,
  convertMedicalUnit,
  UNIT_OPTIONS,
  sanitizeNumericInput,
  parseNumericInput,
  formatNumber,
  type UnitCategory,
} from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

const CATEGORY_LABELS: Record<UnitCategory, { label: string }> = {
  temperature: { label: "체온" },
  weight: { label: "체중" },
  length: { label: "길이" },
  mass: { label: "질량" },
  volume: { label: "용량" },
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as UnitCategory[];

function UnitCategoryIcon({ category }: { category: UnitCategory }) {
  const palette: Record<UnitCategory, { bg: string; stroke: string; fill?: string }> = {
    temperature: { bg: "#FCE7F3", stroke: "#DB2777", fill: "#F9A8D4" },
    weight: { bg: "#EFF6FF", stroke: "#2563EB", fill: "#93C5FD" },
    length: { bg: "#ECFDF5", stroke: "#059669", fill: "#86EFAC" },
    mass: { bg: "#FFF7ED", stroke: "#D97706", fill: "#FDBA74" },
    volume: { bg: "#EEF2FF", stroke: "#4F46E5", fill: "#A5B4FC" },
  };

  const colors = palette[category];

  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full"
      style={{ backgroundColor: colors.bg }}
      aria-hidden="true"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        {category === "temperature" ? (
          <>
            <path d="M6 2.2v4.2" stroke={colors.stroke} strokeWidth="1.3" strokeLinecap="round" />
            <path d="M4.8 6.1a1.9 1.9 0 103.8 0A1.9 1.9 0 004.8 6.1z" fill={colors.fill} stroke={colors.stroke} strokeWidth="1.1" />
          </>
        ) : null}
        {category === "weight" ? (
          <>
            <path d="M3 4.5h6L8.2 9H3.8L3 4.5z" fill={colors.fill} stroke={colors.stroke} strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M4.8 4.5a1.2 1.2 0 012.4 0" stroke={colors.stroke} strokeWidth="1.1" strokeLinecap="round" />
          </>
        ) : null}
        {category === "length" ? (
          <>
            <rect x="2" y="4" width="8" height="4" rx="1.2" fill={colors.fill} stroke={colors.stroke} strokeWidth="1.1" />
            <path d="M4 4.8v2.4M6 4.8v1.6M8 4.8v2.4" stroke={colors.stroke} strokeWidth="1.1" strokeLinecap="round" />
          </>
        ) : null}
        {category === "mass" ? (
          <>
            <path d="M4.2 4.2h3.6l1 4H3.2l1-4z" fill={colors.fill} stroke={colors.stroke} strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M5 3.2h2" stroke={colors.stroke} strokeWidth="1.1" strokeLinecap="round" />
          </>
        ) : null}
        {category === "volume" ? (
          <>
            <path d="M4 2.8h4v1.1l-1 1.3v3.1A1.7 1.7 0 015.3 10 1.7 1.7 0 014 8.3V5.2l-1-1.3V2.8z" fill={colors.fill} stroke={colors.stroke} strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M4.8 6.2h2.4" stroke={colors.stroke} strokeWidth="1.1" strokeLinecap="round" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

export function ToolUnitConverterPage({
  embedded = false,
  onHistoryRecord,
}: {
  embedded?: boolean;
  onHistoryRecord?: (record: CalcHistory) => void;
}) {
  const { t } = useI18n();
  const [category, setCategory] = useState<UnitCategory>("temperature");
  const [valueRaw, setValueRaw] = useState("");
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(1);
  const lastHistorySignatureRef = useRef<string | null>(null);

  const units = UNIT_OPTIONS[category];
  const fromUnit = units[fromIdx] ?? units[0];
  const toUnit = units[toIdx] ?? units[1] ?? units[0];

  const value = parseNumericInput(valueRaw);
  const result = useMemo(() => {
    if (!valueRaw.trim() || value == null) return null;
    return convertMedicalUnit(category, value, fromUnit, toUnit);
  }, [category, value, fromUnit, toUnit, valueRaw]);

  useEffect(() => {
    if (!result?.ok || !onHistoryRecord) {
      if (!result) lastHistorySignatureRef.current = null;
      return;
    }

    const signature = [category, value ?? "", fromUnit, toUnit, result.data.result].join("|");
    if (lastHistorySignatureRef.current === signature) return;
    lastHistorySignatureRef.current = signature;

    onHistoryRecord({
      timestamp: Date.now(),
      calcType: "unit_converter",
      inputs: {
        unitCategory: CATEGORY_LABELS[category].label,
        inputValue: value ?? null,
        fromUnit,
        toUnit,
      },
      outputs: {
        convertedValue: result.data.result,
      },
      flags: {
        warnings: result.warnings.map((warning) => warning.message),
      },
    });
  }, [category, fromUnit, onHistoryRecord, result, toUnit, value]);

  const handleSwap = () => {
    setFromIdx(toIdx);
    setToIdx(fromIdx);
  };

  const handleCategoryChange = (cat: UnitCategory) => {
    setCategory(cat);
    setFromIdx(0);
    setToIdx(Math.min(1, UNIT_OPTIONS[cat].length - 1));
    setValueRaw("");
    lastHistorySignatureRef.current = null;
  };

  return (
    <ToolPageShell title={t("단위 변환기")} subtitle={t("체온·체중·질량·용량 변환")} badge="NEW" embedded={embedded}>
      <div className="space-y-4">
        {/* Category selector */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                category === cat ? "bg-black text-white" : "bg-black/5 text-ios-text hover:bg-black/8"
              }`}
            >
              <UnitCategoryIcon category={cat} />
              <span>{t(CATEGORY_LABELS[cat].label)}</span>
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
