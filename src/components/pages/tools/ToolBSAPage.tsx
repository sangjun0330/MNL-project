"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import { calculateBSA, sanitizeNumericInput, parseNumericInput, formatNumber, type BSAFormula } from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

export function ToolBSAPage() {
  const { t } = useI18n();
  const [weightRaw, setWeightRaw] = useState("");
  const [heightRaw, setHeightRaw] = useState("");
  const [formula, setFormula] = useState<BSAFormula>("mosteller");

  const weight = parseNumericInput(weightRaw);
  const height = parseNumericInput(heightRaw);
  const result = useMemo(() => {
    if (weight == null || height == null || weight <= 0 || height <= 0) return null;
    return calculateBSA(weight, height, formula);
  }, [weight, height, formula]);

  return (
    <ToolPageShell title={t("BSA 체표면적")} subtitle={t("DuBois / Mosteller 공식")} badge="NEW">
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
              onClick={() => setFormula("mosteller")}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                formula === "mosteller" ? "bg-black text-white" : "bg-black/5 text-ios-text"
              }`}
            >
              Mosteller
            </button>
            <button
              type="button"
              onClick={() => setFormula("dubois")}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                formula === "dubois" ? "bg-black text-white" : "bg-black/5 text-ios-text"
              }`}
            >
              DuBois
            </button>
          </div>
        </Card>

        {result?.ok && (
          <Card className="p-5">
            <div className="text-center">
              <div className="text-[13px] text-ios-sub">{t("체표면적")}</div>
              <div className="mt-1 text-[40px] font-extrabold tracking-tight text-ios-text">
                {formatNumber(result.data.bsaM2, 2)}
                <span className="ml-1 text-[18px] font-semibold text-ios-sub">m²</span>
              </div>
              <div className="mt-2 text-[12px] text-ios-muted">
                {formula === "mosteller" ? "Mosteller: √(H×W/3600)" : "DuBois: 0.007184 × H⁰·⁷²⁵ × W⁰·⁴²⁵"}
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
