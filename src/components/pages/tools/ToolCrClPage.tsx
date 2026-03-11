"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import { calculateCrCl, sanitizeNumericInput, parseNumericInput, formatNumber, type CalcHistory } from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

const RENAL_LABELS: Record<string, { label: string; color: string }> = {
  normal: { label: "정상 (≥90)", color: "text-green-600" },
  mild: { label: "경도 저하 (60-89)", color: "text-yellow-600" },
  moderate: { label: "중등도 저하 (30-59)", color: "text-orange-600" },
  severe: { label: "중증 저하 (15-29)", color: "text-red-600" },
  failure: { label: "신부전 (<15)", color: "text-red-700" },
};

export function ToolCrClPage({
  embedded = false,
  onHistoryRecord,
}: {
  embedded?: boolean;
  onHistoryRecord?: (record: CalcHistory) => void;
}) {
  const { t } = useI18n();
  const [ageRaw, setAgeRaw] = useState("");
  const [weightRaw, setWeightRaw] = useState("");
  const [crRaw, setCrRaw] = useState("");
  const [isFemale, setIsFemale] = useState(false);
  const lastHistorySignatureRef = useRef<string | null>(null);

  const age = parseNumericInput(ageRaw);
  const weight = parseNumericInput(weightRaw);
  const cr = parseNumericInput(crRaw);
  const result = useMemo(() => {
    if (age == null || weight == null || cr == null || age <= 0 || weight <= 0 || cr <= 0) return null;
    return calculateCrCl(age, weight, cr, isFemale);
  }, [age, weight, cr, isFemale]);

  useEffect(() => {
    if (!result?.ok || !onHistoryRecord) {
      if (!result) lastHistorySignatureRef.current = null;
      return;
    }

    const signature = [age ?? "", weight ?? "", cr ?? "", isFemale, result.data.crclMlMin, result.data.renalStageKey].join("|");
    if (lastHistorySignatureRef.current === signature) return;
    lastHistorySignatureRef.current = signature;

    onHistoryRecord({
      timestamp: Date.now(),
      calcType: "crcl",
      inputs: {
        age: age ?? null,
        weightKg: weight ?? null,
        serumCr: cr ?? null,
        isFemale,
      },
      outputs: {
        crclMlMin: result.data.crclMlMin,
        renalStageLabel: RENAL_LABELS[result.data.renalStageKey]?.label ?? result.data.renalStageKey,
      },
      flags: {
        warnings: result.warnings.map((warning) => warning.message),
      },
    });
  }, [age, cr, isFemale, onHistoryRecord, result, weight]);

  return (
    <ToolPageShell title={t("CrCl 신기능")} subtitle={t("Cockcroft-Gault 청소율 계산")} badge="NEW" embedded={embedded}>
      <div className="space-y-4">
        <Card className="p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("나이 (세)")}</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="65"
              value={ageRaw}
              onChange={(e) => setAgeRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("체중 (kg)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="60"
              value={weightRaw}
              onChange={(e) => setWeightRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("혈청 크레아티닌 (mg/dL)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="1.0"
              value={crRaw}
              onChange={(e) => setCrRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsFemale(false)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                !isFemale ? "bg-black text-white" : "bg-black/5 text-ios-text"
              }`}
            >
              {t("남성")}
            </button>
            <button
              type="button"
              onClick={() => setIsFemale(true)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                isFemale ? "bg-black text-white" : "bg-black/5 text-ios-text"
              }`}
            >
              {t("여성")}
            </button>
          </div>
        </Card>

        {result?.ok && (
          <Card className="p-5">
            <div className="text-center">
              <div className="text-[13px] text-ios-sub">CrCl</div>
              <div className="mt-1 text-[40px] font-extrabold tracking-tight text-ios-text">
                {formatNumber(result.data.crclMlMin, 1)}
                <span className="ml-1 text-[18px] font-semibold text-ios-sub">mL/min</span>
              </div>
              <div className={`mt-1 text-[15px] font-semibold ${RENAL_LABELS[result.data.renalStageKey]?.color}`}>
                {RENAL_LABELS[result.data.renalStageKey]?.label}
              </div>
              <div className="mt-2 text-[12px] text-ios-muted">
                Cockcroft-Gault{isFemale ? " (×0.85)" : ""}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w) => (
                  <div
                    key={w.code}
                    className={`rounded-xl px-4 py-3 text-[12px] leading-relaxed ${
                      w.severity === "critical"
                        ? "bg-red-50 text-red-700"
                        : w.severity === "warning"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {w.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {result && !result.ok && (
          <Card className="p-5">
            <div className="text-center text-[13px] text-red-600">{result.errors.join(", ")}</div>
          </Card>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setAgeRaw("");
            setWeightRaw("");
            setCrRaw("");
          }}
        >
          {t("초기화")}
        </Button>
      </div>
    </ToolPageShell>
  );
}
