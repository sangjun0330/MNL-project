"use client";

import { useState, useMemo, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import {
  calculateFluidBalance,
  sanitizeNumericInput,
  parseNumericInput,
  formatNumber,
  type CalcHistory,
  type FluidEntry,
} from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

type RawEntry = { label: string; amountRaw: string };

const INTAKE_PRESETS = ["IV 수액", "경구 수분", "수혈", "기타 주입"];
const OUTPUT_PRESETS = ["소변", "배액관", "구토", "기타 배출"];

function FlowSectionIcon({ kind }: { kind: "intake" | "output" }) {
  const stroke = kind === "intake" ? "#2563EB" : "#DC2626";
  const fill = kind === "intake" ? "#DBEAFE" : "#FEE2E2";

  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full"
      style={{ backgroundColor: fill }}
      aria-hidden="true"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d={kind === "intake" ? "M7 11V3m0 0L4.5 5.5M7 3l2.5 2.5" : "M7 3v8m0 0L4.5 8.5M7 11l2.5-2.5"}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function EntryList({
  title,
  icon,
  presets,
  entries,
  setEntries,
  t,
}: {
  title: string;
  icon: React.ReactNode;
  presets: string[];
  entries: RawEntry[];
  setEntries: Dispatch<SetStateAction<RawEntry[]>>;
  t: (k: string) => string;
}) {
  const addEntry = () => setEntries((prev) => [...prev, { label: "", amountRaw: "" }]);
  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));
  const updateEntry = (idx: number, field: "label" | "amountRaw", val: string) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)));

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div className="text-[14px] font-bold text-ios-text">{title}</div>
      </div>

      {entries.length === 0 && (
        <div className="py-4 text-center text-[13px] text-ios-muted">{t("항목을 추가하세요")}</div>
      )}

      <div className="space-y-3">
        {entries.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={entry.label}
              onChange={(e) => updateEntry(idx, "label", e.target.value)}
              className="flex-1 rounded-xl border border-ios-sep bg-white px-3 py-2.5 text-[13px] outline-none"
            >
              <option value="">{t("항목 선택")}</option>
              {presets.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              className="w-24 rounded-xl border border-ios-sep bg-white px-3 py-2.5 text-right text-[13px] outline-none focus:border-black"
              placeholder="mL"
              value={entry.amountRaw}
              onChange={(e) => updateEntry(idx, "amountRaw", sanitizeNumericInput(e.target.value))}
            />
            <button
              type="button"
              onClick={() => removeEntry(idx)}
              className="shrink-0 rounded-full p-1.5 text-ios-muted transition hover:bg-red-50 hover:text-red-500"
              aria-label={t("삭제")}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addEntry}
        className="mt-3 w-full rounded-xl border border-dashed border-ios-sep py-2.5 text-[13px] font-semibold text-ios-tint transition hover:bg-black/3"
      >
        + {t("항목 추가")}
      </button>
    </Card>
  );
}

export function ToolFluidBalancePage({
  embedded = false,
  onHistoryRecord,
}: {
  embedded?: boolean;
  onHistoryRecord?: (record: CalcHistory) => void;
}) {
  const { t } = useI18n();
  const [intakeEntries, setIntakeEntries] = useState<RawEntry[]>([{ label: "IV 수액", amountRaw: "" }]);
  const [outputEntries, setOutputEntries] = useState<RawEntry[]>([{ label: "소변", amountRaw: "" }]);
  const [insensibleRaw, setInsensibleRaw] = useState("500");
  const lastHistorySignatureRef = useRef<string | null>(null);

  const toFluidEntries = useCallback(
    (raw: RawEntry[]): FluidEntry[] =>
      raw.map((e) => ({
        label: e.label,
        amountMl: parseNumericInput(e.amountRaw) ?? 0,
      })),
    [],
  );

  const hasAnyInput =
    intakeEntries.some((e) => e.amountRaw.trim()) || outputEntries.some((e) => e.amountRaw.trim());

  const result = useMemo(
    () =>
      hasAnyInput
        ? calculateFluidBalance(
            toFluidEntries(intakeEntries),
            toFluidEntries(outputEntries),
            parseNumericInput(insensibleRaw) ?? 0,
          )
        : null,
    [hasAnyInput, intakeEntries, outputEntries, insensibleRaw, toFluidEntries],
  );

  useEffect(() => {
    if (!result?.ok || !onHistoryRecord) {
      if (!result) lastHistorySignatureRef.current = null;
      return;
    }

    const intakeSummary = intakeEntries
      .filter((entry) => entry.amountRaw.trim())
      .map((entry) => `${entry.label || "항목"} ${entry.amountRaw}mL`)
      .join(", ");
    const outputSummary = outputEntries
      .filter((entry) => entry.amountRaw.trim())
      .map((entry) => `${entry.label || "항목"} ${entry.amountRaw}mL`)
      .join(", ");
    const insensibleLossMl = parseNumericInput(insensibleRaw) ?? 0;
    const signature = [
      intakeSummary,
      outputSummary,
      insensibleLossMl,
      result.data.totalIntakeMl,
      result.data.totalOutputMl,
      result.data.netBalanceMl,
    ].join("|");
    if (lastHistorySignatureRef.current === signature) return;
    lastHistorySignatureRef.current = signature;

    onHistoryRecord({
      timestamp: Date.now(),
      calcType: "fluid_balance",
      inputs: {
        intakeItems: intakeSummary || "-",
        outputItems: outputSummary || "-",
        insensibleLossMl,
      },
      outputs: {
        totalIntakeMl: result.data.totalIntakeMl,
        totalOutputMl: result.data.totalOutputMl,
        netBalanceMl: result.data.netBalanceMl,
      },
      flags: {
        warnings: result.warnings.map((warning) => warning.message),
      },
    });
  }, [insensibleRaw, intakeEntries, onHistoryRecord, outputEntries, result]);

  const handleReset = () => {
    setIntakeEntries([{ label: "IV 수액", amountRaw: "" }]);
    setOutputEntries([{ label: "소변", amountRaw: "" }]);
    setInsensibleRaw("500");
    lastHistorySignatureRef.current = null;
  };

  return (
    <ToolPageShell title={t("수액 밸런스")} subtitle={t("섭취/배출 I/O 계산")} badge="NEW" embedded={embedded}>
      <div className="space-y-4">
        <EntryList
          title={t("섭취 (Intake)")}
          icon={<FlowSectionIcon kind="intake" />}
          presets={INTAKE_PRESETS}
          entries={intakeEntries}
          setEntries={setIntakeEntries}
          t={t}
        />

        <EntryList
          title={t("배출 (Output)")}
          icon={<FlowSectionIcon kind="output" />}
          presets={OUTPUT_PRESETS}
          entries={outputEntries}
          setEntries={setOutputEntries}
          t={t}
        />

        <Card className="p-5">
          <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("불감 손실 (mL)")}</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
            placeholder="500"
            value={insensibleRaw}
            onChange={(e) => setInsensibleRaw(sanitizeNumericInput(e.target.value))}
          />
          <p className="mt-1.5 text-[11px] text-ios-muted">{t("일반 성인 기준 약 500~800 mL/일")}</p>
        </Card>

        {result?.ok && (
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[11px] text-ios-sub">{t("총 섭취")}</div>
                <div className="mt-1 text-[20px] font-bold text-ios-text">{formatNumber(result.data.totalIntakeMl, 0)}</div>
                <div className="text-[11px] text-ios-muted">mL</div>
              </div>
              <div>
                <div className="text-[11px] text-ios-sub">{t("총 배출")}</div>
                <div className="mt-1 text-[20px] font-bold text-ios-text">{formatNumber(result.data.totalOutputMl, 0)}</div>
                <div className="text-[11px] text-ios-muted">mL</div>
              </div>
              <div>
                <div className="text-[11px] text-ios-sub">{t("순 밸런스")}</div>
                <div
                  className={`mt-1 text-[20px] font-bold ${
                    result.data.netBalanceMl > 0 ? "text-blue-600" : result.data.netBalanceMl < 0 ? "text-red-600" : "text-ios-text"
                  }`}
                >
                  {result.data.netBalanceMl > 0 ? "+" : ""}
                  {formatNumber(result.data.netBalanceMl, 0)}
                </div>
                <div className="text-[11px] text-ios-muted">mL</div>
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w) => (
                  <div
                    key={w.code}
                    className={`rounded-xl px-4 py-3 text-[12px] leading-relaxed ${
                      w.severity === "critical" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"
                    }`}
                  >
                    {w.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Button variant="secondary" className="w-full" onClick={handleReset}>
          {t("초기화")}
        </Button>
      </div>
    </ToolPageShell>
  );
}
