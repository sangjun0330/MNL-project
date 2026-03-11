"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import { calculateBMI, sanitizeNumericInput, parseNumericInput, formatNumber } from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

const BMI_LABELS: Record<string, { label: string; color: string }> = {
  underweight: { label: "저체중", color: "text-blue-600" },
  normal: { label: "정상", color: "text-green-600" },
  overweight: { label: "과체중", color: "text-yellow-600" },
  obese: { label: "비만 (1단계)", color: "text-orange-600" },
  obese2: { label: "비만 (2단계)", color: "text-red-500" },
  obese3: { label: "고도비만 (3단계)", color: "text-red-700" },
};

export function ToolBMIPage() {
  const { t } = useI18n();
  const [weightRaw, setWeightRaw] = useState("");
  const [heightRaw, setHeightRaw] = useState("");
  const [asianCutoffs, setAsianCutoffs] = useState(true);

  const weight = parseNumericInput(weightRaw);
  const height = parseNumericInput(heightRaw);
  const result = useMemo(() => {
    if (weight == null || height == null || weight <= 0 || height <= 0) return null;
    return calculateBMI(weight, height, asianCutoffs);
  }, [weight, height, asianCutoffs]);

  return (
    <ToolPageShell title={t("BMI 계산")} subtitle={t("체질량지수 (아시아 기준 포함)")} badge="NEW">
      <div className="space-y-4">
        <Card className="p-5 space-y-4">
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
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">{t("신장 (cm)")}</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-xl border border-ios-sep bg-white px-4 py-3 text-[15px] outline-none focus:border-black"
              placeholder="170"
              value={heightRaw}
              onChange={(e) => setHeightRaw(sanitizeNumericInput(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAsianCutoffs(true)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                asianCutoffs ? "bg-black text-white" : "bg-black/5 text-ios-text"
              }`}
            >
              {t("아시아 기준")}
            </button>
            <button
              type="button"
              onClick={() => setAsianCutoffs(false)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                !asianCutoffs ? "bg-black text-white" : "bg-black/5 text-ios-text"
              }`}
            >
              {t("WHO 기준")}
            </button>
          </div>
        </Card>

        {result?.ok && (
          <Card className="p-5">
            <div className="text-center">
              <div className="text-[13px] text-ios-sub">BMI</div>
              <div className="mt-1 text-[40px] font-extrabold tracking-tight text-ios-text">
                {formatNumber(result.data.bmi, 1)}
              </div>
              <div className={`mt-1 text-[15px] font-semibold ${BMI_LABELS[result.data.categoryKey]?.color}`}>
                {BMI_LABELS[result.data.categoryKey]?.label}
              </div>
              <div className="mt-2 text-[12px] text-ios-muted">
                {asianCutoffs ? t("아시아 기준") : t("WHO 기준")}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w) => (
                  <div key={w.code} className="rounded-xl bg-blue-50 px-4 py-3 text-[12px] text-blue-700">
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
            setWeightRaw("");
            setHeightRaw("");
          }}
        >
          {t("초기화")}
        </Button>
      </div>
    </ToolPageShell>
  );
}
