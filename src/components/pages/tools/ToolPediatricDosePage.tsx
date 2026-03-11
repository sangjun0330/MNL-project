"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import { calculatePediatricDose, sanitizeNumericInput, parseNumericInput, formatNumber } from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

export function ToolPediatricDosePage() {
  const { t } = useI18n();
  const [weightRaw, setWeightRaw] = useState("");
  const [dosePerKgRaw, setDosePerKgRaw] = useState("");
  const [frequencyRaw, setFrequencyRaw] = useState("3");
  const [maxSingleRaw, setMaxSingleRaw] = useState("");
  const [maxDailyRaw, setMaxDailyRaw] = useState("");

  const weight = parseNumericInput(weightRaw);
  const dosePerKg = parseNumericInput(dosePerKgRaw);
  const frequency = parseNumericInput(frequencyRaw);
  const maxSingle = maxSingleRaw.trim() ? parseNumericInput(maxSingleRaw) : null;
  const maxDaily = maxDailyRaw.trim() ? parseNumericInput(maxDailyRaw) : null;

  const result = useMemo(() => {
    if (weight == null || dosePerKg == null || frequency == null || weight <= 0 || dosePerKg <= 0 || frequency <= 0) {
      return null;
    }
    return calculatePediatricDose(weight, dosePerKg, frequency, maxSingle, maxDaily);
  }, [weight, dosePerKg, frequency, maxSingle, maxDaily]);

  const handleReset = () => {
    setWeightRaw("");
    setDosePerKgRaw("");
    setFrequencyRaw("3");
    setMaxSingleRaw("");
    setMaxDailyRaw("");
  };

  return (
    <ToolPageShell title={t("소아 용량 계산")} subtitle={t("체중 기반 mg/kg 용량 산출")} badge="NEW">
      <div className="space-y-4">
        <Card className="p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("체중 (kg)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="15"
              value={weightRaw}
              onChange={(e) => setWeightRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("용량 (mg/kg)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="10"
              value={dosePerKgRaw}
              onChange={(e) => setDosePerKgRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("투여 횟수 (회/일)")}</label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="3"
              value={frequencyRaw}
              onChange={(e) => setFrequencyRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="text-[13px] font-semibold text-ios-sub">{t("선택: 최대 용량 상한")}</div>
          <div>
            <label className="mb-1.5 block text-[12px] text-ios-sub">{t("1회 최대 (mg)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder={t("미입력 시 상한 없음")}
              value={maxSingleRaw}
              onChange={(e) => setMaxSingleRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] text-ios-sub">{t("일일 최대 (mg)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder={t("미입력 시 상한 없음")}
              value={maxDailyRaw}
              onChange={(e) => setMaxDailyRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
        </Card>

        {result?.ok && (
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-[11px] text-ios-sub">{t("1회 용량")}</div>
                <div className="mt-1 text-[24px] font-bold text-ios-text">
                  {formatNumber(result.data.appliedSingleDose, 2)}
                  <span className="ml-0.5 text-[13px] font-semibold text-ios-sub">mg</span>
                </div>
                {result.data.singleCapped && (
                  <div className="mt-0.5 text-[11px] text-orange-600">
                    {t("상한 적용")} ({formatNumber(result.data.singleDose, 2)} → {formatNumber(result.data.appliedSingleDose, 2)})
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] text-ios-sub">{t("일일 총 용량")}</div>
                <div className="mt-1 text-[24px] font-bold text-ios-text">
                  {formatNumber(result.data.appliedDailyDose, 2)}
                  <span className="ml-0.5 text-[13px] font-semibold text-ios-sub">mg</span>
                </div>
                {result.data.dailyCapped && (
                  <div className="mt-0.5 text-[11px] text-orange-600">
                    {t("상한 적용")} ({formatNumber(result.data.dailyDose, 2)} → {formatNumber(result.data.appliedDailyDose, 2)})
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 text-center text-[12px] text-ios-muted">
              {formatNumber(dosePerKg ?? 0, 2)} mg/kg × {formatNumber(weight ?? 0, 1)} kg × {formatNumber(frequency ?? 0, 0)}
              {t("회")}
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

        <Button variant="secondary" className="w-full" onClick={handleReset}>
          {t("초기화")}
        </Button>
      </div>
    </ToolPageShell>
  );
}
