"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import {
  type AmountUnit,
  type CalcHistory,
  type CalcWarning,
  type CalculatorPreset,
  type TimeUnit,
  type WeightUnit,
  DEFAULT_NURSE_PRESETS,
  buildDoseUnitLabel,
  calculateConcentration,
  calculateDoseCheck,
  calculateDripForward,
  calculateDripReverse,
  calculateIvpb,
  calculatePumpForward,
  calculatePumpReverse,
  formatNumber,
  normalizeWeight,
  parseNumericInput,
  sanitizeNumericInput,
} from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

const FLAT_CARD_CLASS = "border-[color:var(--wnl-accent-border)] bg-white shadow-none";
const PRIMARY_FLAT_BTN =
  "h-11 rounded-xl border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] px-4 text-[14px] font-semibold text-[color:var(--wnl-accent)] shadow-none hover:bg-[color:var(--wnl-accent-soft)]";
const SECONDARY_FLAT_BTN =
  "h-11 rounded-xl border border-ios-sep bg-white px-4 text-[14px] font-semibold text-ios-text shadow-none hover:bg-ios-bg";

const RECENT_KEY = "nurse_calc_recent_v1";
const CUSTOM_PRESETS_KEY = "nurse_calc_custom_presets_v1";
const HISTORY_KEY = "nurse_calc_history_v1";

type ToolModule = "pump" | "ivpb" | "drip" | "dilution" | "check";
type PumpMode = "forward" | "reverse";
type DripMode = "forward" | "reverse";

type SafetyChecks = {
  unitConfirmed: boolean;
  concentrationConfirmed: boolean;
};

type PumpFormState = {
  weight: string;
  weightUnit: WeightUnit;
  targetDose: string;
  targetUnit: AmountUnit;
  targetTimeUnit: TimeUnit;
  targetPerKg: boolean;
  rateMlHr: string;
  concentrationAmount: string;
  concentrationUnit: AmountUnit;
  concentrationVolumeMl: string;
  lineType: "peripheral" | "central";
  dilutionMode: "standard" | "custom";
  pumpType: "syringe" | "infusion";
  doubleCheck: boolean;
  doubleCheckRate: string;
};

type IvpbFormState = {
  totalVolumeMl: string;
  duration: string;
  durationUnit: TimeUnit;
  rangeStartMin: string;
  rangeEndMin: string;
};

type DripFormState = {
  mlHr: string;
  gttPerMin: string;
  dripFactor: "10" | "15" | "20" | "60";
};

type DilutionFormState = {
  totalAmount: string;
  amountUnit: AmountUnit;
  totalVolumeMl: string;
  outputUnit: AmountUnit;
};

type CheckFormState = {
  weight: string;
  weightUnit: WeightUnit;
  useWeight: boolean;
  pumpRateMlHr: string;
  concentrationAmount: string;
  concentrationUnit: AmountUnit;
  concentrationVolumeMl: string;
  outputUnit: AmountUnit;
  outputTimeUnit: TimeUnit;
  prescribedTargetDose: string;
};

type PersistedSnapshot = {
  activeModule: ToolModule;
  pumpMode: PumpMode;
  dripMode: DripMode;
  pump: PumpFormState;
  ivpb: IvpbFormState;
  drip: DripFormState;
  dilution: DilutionFormState;
  check: CheckFormState;
};

type PumpResultState =
  | {
      mode: "forward";
      rateMlHr: number;
      verifyDose: number;
      doseLabel: string;
      warnings: CalcWarning[];
      summaryLine: string;
    }
  | {
      mode: "reverse";
      dose: number;
      doseLabel: string;
      totalDosePerHour: number;
      warnings: CalcWarning[];
      summaryLine: string;
    };

type IvpbResultState = {
  rateMlHr: number;
  vtbiMl: number;
  durationMinutes: number;
  warnings: CalcWarning[];
  summaryLine: string;
};

type DripResultState =
  | {
      mode: "forward";
      gttPerMin: number;
      roundedGttPerMin: number;
      warnings: CalcWarning[];
      summaryLine: string;
    }
  | {
      mode: "reverse";
      mlHr: number;
      warnings: CalcWarning[];
      summaryLine: string;
    };

type DilutionResultState = {
  concentrationPerMl: number;
  outputUnit: AmountUnit;
  warnings: CalcWarning[];
  summaryLine: string;
};

type CheckResultState = {
  actualDose: number;
  totalDosePerHour: number;
  differencePercent: number | null;
  doseLabel: string;
  warnings: CalcWarning[];
  summaryLine: string;
};

const AMOUNT_UNIT_OPTIONS: AmountUnit[] = ["mcg", "mg", "g", "units", "IU", "mEq"];
const TIME_OPTIONS: TimeUnit[] = ["min", "hr"];
const DRIP_FACTORS: Array<DripFormState["dripFactor"]> = ["10", "15", "20", "60"];
const CALC_TYPE_LABEL: Record<CalcHistory["calcType"], string> = {
  pump_forward: "펌프 계산",
  pump_reverse: "펌프 검산",
  ivpb: "IVPB",
  drip_forward: "드립 환산",
  drip_reverse: "드립 역산",
  dilution: "희석/농도",
  dose_check: "검산(역산)",
};

const UNIT_FAMILY: Record<AmountUnit, "mass" | "activity" | "electrolyte"> = {
  mcg: "mass",
  mg: "mass",
  g: "mass",
  units: "activity",
  IU: "activity",
  mEq: "electrolyte",
};

const DEFAULT_PUMP_FORM: PumpFormState = {
  weight: "62",
  weightUnit: "kg",
  targetDose: "0.1",
  targetUnit: "mcg",
  targetTimeUnit: "min",
  targetPerKg: true,
  rateMlHr: "23.3",
  concentrationAmount: "4",
  concentrationUnit: "mg",
  concentrationVolumeMl: "250",
  lineType: "central",
  dilutionMode: "standard",
  pumpType: "infusion",
  doubleCheck: false,
  doubleCheckRate: "",
};

const DEFAULT_IVPB_FORM: IvpbFormState = {
  totalVolumeMl: "100",
  duration: "60",
  durationUnit: "min",
  rangeStartMin: "30",
  rangeEndMin: "60",
};

const DEFAULT_DRIP_FORM: DripFormState = {
  mlHr: "100",
  gttPerMin: "33",
  dripFactor: "20",
};

const DEFAULT_DILUTION_FORM: DilutionFormState = {
  totalAmount: "4",
  amountUnit: "mg",
  totalVolumeMl: "250",
  outputUnit: "mg",
};

const DEFAULT_CHECK_FORM: CheckFormState = {
  weight: "62",
  weightUnit: "kg",
  useWeight: true,
  pumpRateMlHr: "23.3",
  concentrationAmount: "4",
  concentrationUnit: "mg",
  concentrationVolumeMl: "250",
  outputUnit: "mcg",
  outputTimeUnit: "min",
  prescribedTargetDose: "0.1",
};

function buildPumpSignature(mode: PumpMode, form: PumpFormState) {
  if (mode === "forward") {
    return [
      mode,
      form.weight,
      form.weightUnit,
      form.targetDose,
      form.targetUnit,
      form.targetTimeUnit,
      String(form.targetPerKg),
      form.concentrationAmount,
      form.concentrationUnit,
      form.concentrationVolumeMl,
      String(form.doubleCheck),
      form.doubleCheckRate,
    ].join("|");
  }
  return [
    mode,
    form.weight,
    form.weightUnit,
    form.rateMlHr,
    form.targetUnit,
    form.targetTimeUnit,
    String(form.targetPerKg),
    form.concentrationAmount,
    form.concentrationUnit,
    form.concentrationVolumeMl,
  ].join("|");
}

function buildIvpbSignature(form: IvpbFormState) {
  return [form.totalVolumeMl, form.duration, form.durationUnit, form.rangeStartMin, form.rangeEndMin].join("|");
}

function buildDripSignature(mode: DripMode, form: DripFormState) {
  if (mode === "forward") return [mode, form.mlHr, form.dripFactor].join("|");
  return [mode, form.gttPerMin, form.dripFactor].join("|");
}

function buildDilutionSignature(form: DilutionFormState) {
  return [form.totalAmount, form.amountUnit, form.totalVolumeMl, form.outputUnit].join("|");
}

function buildCheckSignature(form: CheckFormState) {
  return [
    form.weight,
    form.weightUnit,
    String(form.useWeight),
    form.pumpRateMlHr,
    form.concentrationAmount,
    form.concentrationUnit,
    form.concentrationVolumeMl,
    form.outputUnit,
    form.outputTimeUnit,
    form.prescribedTargetDose,
  ].join("|");
}

function parseInputToNumber(value: string) {
  return parseNumericInput(value) ?? NaN;
}

function buildPositiveFieldIssue(raw: string, label: string, required = true) {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return required ? `${label} 입력이 필요합니다.` : null;
  const parsed = parseNumericInput(normalized);
  if (parsed == null) return `${label} 숫자 형식을 확인하세요.`;
  if (parsed <= 0) return `${label}는 0보다 커야 합니다.`;
  return null;
}

function warningToneClass(level: CalcWarning["severity"]) {
  if (level === "critical") return "border-red-300 bg-red-50 text-red-700";
  if (level === "warning") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function runCopy(text: string, setMessage: (value: string) => void) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    setMessage("클립보드를 사용할 수 없습니다.");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => setMessage("결과 한 줄을 복사했습니다."))
    .catch(() => setMessage("복사에 실패했습니다."));
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[12px] font-semibold text-ios-sub">{children}</div>;
}

function SafetyChecklist({
  value,
  onChange,
}: {
  value: SafetyChecks;
  onChange: (next: SafetyChecks) => void;
}) {
  return (
    <div className="rounded-2xl border border-ios-sep bg-white p-3">
      <div className="text-[12px] font-semibold text-ios-sub">단위 체크(필수)</div>
      <label className="mt-2 flex items-center gap-2 text-[13px] text-ios-text">
        <input
          type="checkbox"
          checked={value.unitConfirmed}
          onChange={(event) => onChange({ ...value, unitConfirmed: event.target.checked })}
        />
        mg ↔ mcg 맞나요?
      </label>
      <label className="mt-1 flex items-center gap-2 text-[13px] text-ios-text">
        <input
          type="checkbox"
          checked={value.concentrationConfirmed}
          onChange={(event) => onChange({ ...value, concentrationConfirmed: event.target.checked })}
        />
        농도(총 약량 / 총 mL) 맞나요?
      </label>
      {!value.unitConfirmed || !value.concentrationConfirmed ? (
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
          두 체크가 모두 완료되어야 더블체크가 끝납니다.
        </div>
      ) : null}
    </div>
  );
}

function WarningList({ warnings }: { warnings: CalcWarning[] }) {
  if (!warnings.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
        큰 이상 경고 없음. 그래도 단위와 농도는 마지막으로 한 번 더 확인하세요.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <div
          key={`${warning.code}-${warning.message}`}
          className={`rounded-2xl border px-3 py-2 text-[12px] font-semibold ${warningToneClass(warning.severity)}`}
        >
          {warning.message}
        </div>
      ))}
    </div>
  );
}

export function ToolNurseCalculatorsPage() {
  const { t } = useI18n();
  const [activeModule, setActiveModule] = useState<ToolModule>("pump");
  const [pumpMode, setPumpMode] = useState<PumpMode>("forward");
  const [dripMode, setDripMode] = useState<DripMode>("forward");

  const [pumpForm, setPumpForm] = useState<PumpFormState>(DEFAULT_PUMP_FORM);
  const [ivpbForm, setIvpbForm] = useState<IvpbFormState>(DEFAULT_IVPB_FORM);
  const [dripForm, setDripForm] = useState<DripFormState>(DEFAULT_DRIP_FORM);
  const [dilutionForm, setDilutionForm] = useState<DilutionFormState>(DEFAULT_DILUTION_FORM);
  const [checkForm, setCheckForm] = useState<CheckFormState>(DEFAULT_CHECK_FORM);

  const [pumpSafety, setPumpSafety] = useState<SafetyChecks>({ unitConfirmed: false, concentrationConfirmed: false });
  const [ivpbSafety, setIvpbSafety] = useState<SafetyChecks>({ unitConfirmed: false, concentrationConfirmed: false });
  const [dripSafety, setDripSafety] = useState<SafetyChecks>({ unitConfirmed: false, concentrationConfirmed: false });
  const [dilutionSafety, setDilutionSafety] = useState<SafetyChecks>({ unitConfirmed: false, concentrationConfirmed: false });
  const [checkSafety, setCheckSafety] = useState<SafetyChecks>({ unitConfirmed: false, concentrationConfirmed: false });

  const [pumpResult, setPumpResult] = useState<PumpResultState | null>(null);
  const [pumpErrors, setPumpErrors] = useState<string[]>([]);
  const [ivpbResult, setIvpbResult] = useState<IvpbResultState | null>(null);
  const [ivpbErrors, setIvpbErrors] = useState<string[]>([]);
  const [dripResult, setDripResult] = useState<DripResultState | null>(null);
  const [dripErrors, setDripErrors] = useState<string[]>([]);
  const [dilutionResult, setDilutionResult] = useState<DilutionResultState | null>(null);
  const [dilutionErrors, setDilutionErrors] = useState<string[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResultState | null>(null);
  const [checkErrors, setCheckErrors] = useState<string[]>([]);
  const [pumpLastSignature, setPumpLastSignature] = useState<string | null>(null);
  const [ivpbLastSignature, setIvpbLastSignature] = useState<string | null>(null);
  const [dripLastSignature, setDripLastSignature] = useState<string | null>(null);
  const [dilutionLastSignature, setDilutionLastSignature] = useState<string | null>(null);
  const [checkLastSignature, setCheckLastSignature] = useState<string | null>(null);

  const [customPresets, setCustomPresets] = useState<CalculatorPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [customPresetName, setCustomPresetName] = useState<string>("");
  const [customPresetDrug, setCustomPresetDrug] = useState<string>("");
  const [history, setHistory] = useState<CalcHistory[]>([]);
  const [copyMessage, setCopyMessage] = useState<string>("");

  const allPresets = useMemo(() => [...DEFAULT_NURSE_PRESETS, ...customPresets], [customPresets]);
  const pumpTargetUnitOptions = useMemo(
    () => AMOUNT_UNIT_OPTIONS.filter((unit) => UNIT_FAMILY[unit] === UNIT_FAMILY[pumpForm.concentrationUnit]),
    [pumpForm.concentrationUnit]
  );
  const checkOutputUnitOptions = useMemo(
    () => AMOUNT_UNIT_OPTIONS.filter((unit) => UNIT_FAMILY[unit] === UNIT_FAMILY[checkForm.concentrationUnit]),
    [checkForm.concentrationUnit]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;
        if (parsed.activeModule) setActiveModule(parsed.activeModule);
        if (parsed.pumpMode) setPumpMode(parsed.pumpMode);
        if (parsed.dripMode) setDripMode(parsed.dripMode);
        if (parsed.pump) setPumpForm((prev) => ({ ...prev, ...parsed.pump }));
        if (parsed.ivpb) setIvpbForm((prev) => ({ ...prev, ...parsed.ivpb }));
        if (parsed.drip) setDripForm((prev) => ({ ...prev, ...parsed.drip }));
        if (parsed.dilution) setDilutionForm((prev) => ({ ...prev, ...parsed.dilution }));
        if (parsed.check) setCheckForm((prev) => ({ ...prev, ...parsed.check }));
      }
    } catch {
      // ignore local parse errors
    }

    try {
      const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CalculatorPreset[];
        if (Array.isArray(parsed)) setCustomPresets(parsed);
      }
    } catch {
      // ignore local parse errors
    }

    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CalcHistory[];
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      // ignore local parse errors
    }
  }, []);

  useEffect(() => {
    if (pumpTargetUnitOptions.includes(pumpForm.targetUnit)) return;
    setPumpForm((prev) => ({ ...prev, targetUnit: pumpTargetUnitOptions[0] ?? "mcg" }));
  }, [pumpForm.targetUnit, pumpTargetUnitOptions]);

  useEffect(() => {
    if (checkOutputUnitOptions.includes(checkForm.outputUnit)) return;
    setCheckForm((prev) => ({ ...prev, outputUnit: checkOutputUnitOptions[0] ?? "mcg" }));
  }, [checkForm.outputUnit, checkOutputUnitOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot: PersistedSnapshot = {
      activeModule,
      pumpMode,
      dripMode,
      pump: pumpForm,
      ivpb: ivpbForm,
      drip: dripForm,
      dilution: dilutionForm,
      check: checkForm,
    };
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore local save failures
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activeModule, checkForm, dilutionForm, dripForm, dripMode, ivpbForm, pumpForm, pumpMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
    } catch {
      // ignore local save failures
    }
  }, [customPresets]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60)));
    } catch {
      // ignore local save failures
    }
  }, [history]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const appendHistory = useCallback(
    (
      calcType: CalcHistory["calcType"],
      inputs: CalcHistory["inputs"],
      outputs: CalcHistory["outputs"],
      warnings: CalcWarning[]
    ) => {
      const next: CalcHistory = {
        timestamp: Date.now(),
        calcType,
        inputs,
        outputs,
        flags: {
          warnings: warnings.map((item) => item.message),
        },
      };
      setHistory((prev) => [next, ...prev].slice(0, 60));
    },
    []
  );

  const getLastOutput = useCallback(
    (calcType: CalcHistory["calcType"], key: string): number | null => {
      const hit = history.find((item) => item.calcType === calcType && typeof item.outputs[key] === "number");
      if (!hit) return null;
      const value = hit.outputs[key];
      return typeof value === "number" ? value : null;
    },
    [history]
  );

  const pumpDoseLabel = buildDoseUnitLabel(pumpForm.targetUnit, pumpForm.targetPerKg, pumpForm.targetTimeUnit);
  const checkDoseLabel = buildDoseUnitLabel(checkForm.outputUnit, checkForm.useWeight, checkForm.outputTimeUnit);

  const runPump = useCallback(() => {
    setPumpErrors([]);
    const weightRaw = parseInputToNumber(pumpForm.weight);
    const weightKg = normalizeWeight(weightRaw, pumpForm.weightUnit);
    const concentrationAmount = parseInputToNumber(pumpForm.concentrationAmount);
    const concentrationVolumeMl = parseInputToNumber(pumpForm.concentrationVolumeMl);

    if (pumpMode === "forward") {
      const targetDose = parseInputToNumber(pumpForm.targetDose);
      const result = calculatePumpForward({
        weightKg,
        targetDose,
        targetUnit: pumpForm.targetUnit,
        targetTimeUnit: pumpForm.targetTimeUnit,
        targetPerKg: pumpForm.targetPerKg,
        concentrationAmount,
        concentrationUnit: pumpForm.concentrationUnit,
        concentrationVolumeMl,
        previousRateMlHr: getLastOutput("pump_forward", "rateMlHr"),
      });

      if (!result.ok) {
        setPumpResult(null);
        setPumpErrors(result.errors);
        return;
      }

      const warnings = [...result.warnings];
      const doubleValue = parseNumericInput(pumpForm.doubleCheckRate);
      if (pumpForm.doubleCheck && Number.isFinite(doubleValue)) {
        const typed = Number(doubleValue);
        const diff = Math.abs(typed - result.data.rateMlHr);
        const diffPct = result.data.rateMlHr > 0 ? (diff / result.data.rateMlHr) * 100 : 0;
        if (diffPct > 2) {
          warnings.push({
            code: "double_check_mismatch",
            severity: "warning",
            message: "더블체크 입력값이 계산값과 2% 이상 다릅니다. 재입력 후 확인하세요.",
          });
        }
      }

      const weightSummary = pumpForm.targetPerKg ? `체중 ${formatNumber(weightKg, 1)}kg, ` : "";
      const summaryLine = `${weightSummary}농도 ${pumpForm.concentrationAmount}${pumpForm.concentrationUnit}/${pumpForm.concentrationVolumeMl}mL, 목표 ${pumpForm.targetDose}${pumpDoseLabel} → ${formatNumber(result.data.rateMlHr)}mL/hr`;
      setPumpResult({
        mode: "forward",
        rateMlHr: result.data.rateMlHr,
        verifyDose: result.data.verifyDose,
        doseLabel: pumpDoseLabel,
        warnings,
        summaryLine,
      });
      setPumpLastSignature(buildPumpSignature("forward", pumpForm));
      setPumpForm((prev) => ({ ...prev, rateMlHr: String(formatNumber(result.data.rateMlHr, 3)).replace(/,/g, "") }));
      appendHistory(
        "pump_forward",
        {
          weightKg: roundInput(weightKg),
          targetDose: roundInput(targetDose),
          targetUnit: pumpForm.targetUnit,
          targetTimeUnit: pumpForm.targetTimeUnit,
          targetPerKg: pumpForm.targetPerKg,
          concentrationAmount: roundInput(concentrationAmount),
          concentrationUnit: pumpForm.concentrationUnit,
          concentrationVolumeMl: roundInput(concentrationVolumeMl),
        },
        {
          rateMlHr: result.data.rateMlHr,
          verifyDose: result.data.verifyDose,
        },
        warnings
      );
      return;
    }

    const rateMlHr = parseInputToNumber(pumpForm.rateMlHr);
    const result = calculatePumpReverse({
      weightKg,
      rateMlHr,
      outputUnit: pumpForm.targetUnit,
      outputTimeUnit: pumpForm.targetTimeUnit,
      outputPerKg: pumpForm.targetPerKg,
      concentrationAmount,
      concentrationUnit: pumpForm.concentrationUnit,
      concentrationVolumeMl,
      previousDose: getLastOutput("pump_reverse", "dose"),
    });

    if (!result.ok) {
      setPumpResult(null);
      setPumpErrors(result.errors);
      return;
    }

    const weightSummary = pumpForm.targetPerKg ? `체중 ${formatNumber(weightKg, 1)}kg, ` : "";
    const summaryLine = `${weightSummary}농도 ${pumpForm.concentrationAmount}${pumpForm.concentrationUnit}/${pumpForm.concentrationVolumeMl}mL, 현재 ${pumpForm.rateMlHr}mL/hr → ${formatNumber(result.data.dose)}${pumpDoseLabel}`;
    setPumpResult({
      mode: "reverse",
      dose: result.data.dose,
      doseLabel: pumpDoseLabel,
      totalDosePerHour: result.data.totalDosePerHour,
      warnings: result.warnings,
      summaryLine,
    });
    setPumpLastSignature(buildPumpSignature("reverse", pumpForm));
    appendHistory(
      "pump_reverse",
      {
        weightKg: roundInput(weightKg),
        rateMlHr: roundInput(rateMlHr),
        outputUnit: pumpForm.targetUnit,
        outputTimeUnit: pumpForm.targetTimeUnit,
        outputPerKg: pumpForm.targetPerKg,
        concentrationAmount: roundInput(concentrationAmount),
        concentrationUnit: pumpForm.concentrationUnit,
        concentrationVolumeMl: roundInput(concentrationVolumeMl),
      },
      {
        dose: result.data.dose,
        totalDosePerHour: result.data.totalDosePerHour,
      },
      result.warnings
    );
  }, [appendHistory, getLastOutput, pumpDoseLabel, pumpForm, pumpMode]);

  const runIvpb = useCallback(() => {
    setIvpbErrors([]);
    const totalVolumeMl = parseInputToNumber(ivpbForm.totalVolumeMl);
    const duration = parseInputToNumber(ivpbForm.duration);
    const result = calculateIvpb({
      totalVolumeMl,
      duration,
      durationUnit: ivpbForm.durationUnit,
      previousRateMlHr: getLastOutput("ivpb", "rateMlHr"),
    });

    if (!result.ok) {
      setIvpbResult(null);
      setIvpbErrors(result.errors);
      return;
    }

    const summaryLine = `${ivpbForm.totalVolumeMl}mL를 ${ivpbForm.duration}${ivpbForm.durationUnit} 주입 → ${formatNumber(result.data.rateMlHr)}mL/hr, VTBI ${formatNumber(result.data.vtbiMl)}mL`;
    setIvpbResult({
      rateMlHr: result.data.rateMlHr,
      vtbiMl: result.data.vtbiMl,
      durationMinutes: result.data.durationMinutes,
      warnings: result.warnings,
      summaryLine,
    });
    setIvpbLastSignature(buildIvpbSignature(ivpbForm));
    appendHistory(
      "ivpb",
      {
        totalVolumeMl: roundInput(totalVolumeMl),
        duration: roundInput(duration),
        durationUnit: ivpbForm.durationUnit,
      },
      {
        rateMlHr: result.data.rateMlHr,
        vtbiMl: result.data.vtbiMl,
      },
      result.warnings
    );
  }, [appendHistory, getLastOutput, ivpbForm]);

  const runDrip = useCallback(() => {
    setDripErrors([]);
    const dripFactor = Number(dripForm.dripFactor);

    if (dripMode === "forward") {
      const mlHr = parseInputToNumber(dripForm.mlHr);
      const result = calculateDripForward({
        mlHr,
        dripFactor,
        previousGttPerMin: getLastOutput("drip_forward", "gttPerMin"),
      });
      if (!result.ok) {
        setDripResult(null);
        setDripErrors(result.errors);
        return;
      }
      const summaryLine = `${dripForm.mlHr}mL/hr + ${dripFactor}gtt/mL → ${formatNumber(result.data.gttPerMin)}gtt/min`;
      setDripResult({
        mode: "forward",
        gttPerMin: result.data.gttPerMin,
        roundedGttPerMin: result.data.roundedGttPerMin,
        warnings: result.warnings,
        summaryLine,
      });
      setDripLastSignature(buildDripSignature("forward", dripForm));
      appendHistory(
        "drip_forward",
        { mlHr: roundInput(mlHr), dripFactor },
        {
          gttPerMin: result.data.gttPerMin,
          roundedGttPerMin: result.data.roundedGttPerMin,
        },
        result.warnings
      );
      return;
    }

    const gttPerMin = parseInputToNumber(dripForm.gttPerMin);
    const result = calculateDripReverse({
      gttPerMin,
      dripFactor,
      previousMlHr: getLastOutput("drip_reverse", "mlHr"),
    });
    if (!result.ok) {
      setDripResult(null);
      setDripErrors(result.errors);
      return;
    }
    const summaryLine = `${dripForm.gttPerMin}gtt/min + ${dripFactor}gtt/mL → ${formatNumber(result.data.mlHr)}mL/hr`;
    setDripResult({
      mode: "reverse",
      mlHr: result.data.mlHr,
      warnings: result.warnings,
      summaryLine,
    });
    setDripLastSignature(buildDripSignature("reverse", dripForm));
    appendHistory(
      "drip_reverse",
      { gttPerMin: roundInput(gttPerMin), dripFactor },
      { mlHr: result.data.mlHr },
      result.warnings
    );
  }, [appendHistory, dripForm, dripMode, getLastOutput]);

  const runDilution = useCallback(() => {
    setDilutionErrors([]);
    const totalAmount = parseInputToNumber(dilutionForm.totalAmount);
    const totalVolumeMl = parseInputToNumber(dilutionForm.totalVolumeMl);
    const result = calculateConcentration({
      totalAmount,
      amountUnit: dilutionForm.amountUnit,
      totalVolumeMl,
      outputUnit: dilutionForm.outputUnit,
      previousConcentration: getLastOutput("dilution", "concentrationPerMl"),
    });

    if (!result.ok) {
      setDilutionResult(null);
      setDilutionErrors(result.errors);
      return;
    }

    const summaryLine = `총 ${dilutionForm.totalAmount}${dilutionForm.amountUnit} / ${dilutionForm.totalVolumeMl}mL → ${formatNumber(result.data.concentrationPerMl)}${dilutionForm.outputUnit}/mL`;
    setDilutionResult({
      concentrationPerMl: result.data.concentrationPerMl,
      outputUnit: dilutionForm.outputUnit,
      warnings: result.warnings,
      summaryLine,
    });
    setDilutionLastSignature(buildDilutionSignature(dilutionForm));
    appendHistory(
      "dilution",
      {
        totalAmount: roundInput(totalAmount),
        amountUnit: dilutionForm.amountUnit,
        totalVolumeMl: roundInput(totalVolumeMl),
        outputUnit: dilutionForm.outputUnit,
      },
      { concentrationPerMl: result.data.concentrationPerMl },
      result.warnings
    );
  }, [appendHistory, dilutionForm, getLastOutput]);

  const runCheck = useCallback(() => {
    setCheckErrors([]);
    const weightRaw = parseInputToNumber(checkForm.weight);
    const weightKg = normalizeWeight(weightRaw, checkForm.weightUnit);
    const prescribed = parseNumericInput(checkForm.prescribedTargetDose);
    const result = calculateDoseCheck({
      weightKg,
      useWeight: checkForm.useWeight,
      pumpRateMlHr: parseInputToNumber(checkForm.pumpRateMlHr),
      concentrationAmount: parseInputToNumber(checkForm.concentrationAmount),
      concentrationUnit: checkForm.concentrationUnit,
      concentrationVolumeMl: parseInputToNumber(checkForm.concentrationVolumeMl),
      outputUnit: checkForm.outputUnit,
      outputTimeUnit: checkForm.outputTimeUnit,
      prescribedTargetDose: prescribed,
      previousActualDose: getLastOutput("dose_check", "actualDose"),
    });

    if (!result.ok) {
      setCheckResult(null);
      setCheckErrors(result.errors);
      return;
    }

    const weightSummary = checkForm.useWeight ? `체중 ${formatNumber(weightKg, 1)}kg, ` : "";
    const summaryLine = `${weightSummary}속도 ${checkForm.pumpRateMlHr}mL/hr, 농도 ${checkForm.concentrationAmount}${checkForm.concentrationUnit}/${checkForm.concentrationVolumeMl}mL → 실제 ${formatNumber(result.data.actualDose)}${checkDoseLabel}`;
    setCheckResult({
      actualDose: result.data.actualDose,
      totalDosePerHour: result.data.totalDosePerHour,
      differencePercent: result.data.differencePercent,
      doseLabel: checkDoseLabel,
      warnings: result.warnings,
      summaryLine,
    });
    setCheckLastSignature(buildCheckSignature(checkForm));
    appendHistory(
      "dose_check",
      {
        weightKg: roundInput(weightKg),
        useWeight: checkForm.useWeight,
        pumpRateMlHr: roundInput(parseInputToNumber(checkForm.pumpRateMlHr)),
        concentrationAmount: roundInput(parseInputToNumber(checkForm.concentrationAmount)),
        concentrationUnit: checkForm.concentrationUnit,
        concentrationVolumeMl: roundInput(parseInputToNumber(checkForm.concentrationVolumeMl)),
        outputUnit: checkForm.outputUnit,
        outputTimeUnit: checkForm.outputTimeUnit,
        prescribedTargetDose: prescribed ?? null,
      },
      {
        actualDose: result.data.actualDose,
        totalDosePerHour: result.data.totalDosePerHour,
        differencePercent: result.data.differencePercent ?? "N/A",
      },
      result.warnings
    );
  }, [appendHistory, checkDoseLabel, checkForm, getLastOutput]);

  const applyPreset = useCallback(() => {
    const target = allPresets.find((preset) => preset.id === selectedPresetId);
    if (!target) {
      setCopyMessage("적용할 프리셋을 먼저 선택해 주세요.");
      return;
    }
    setPumpForm((prev) => ({
      ...prev,
      concentrationAmount: String(target.concentration.amount),
      concentrationUnit: target.concentration.amountUnit,
      concentrationVolumeMl: String(target.concentration.volumeMl),
    }));
    setCheckForm((prev) => ({
      ...prev,
      concentrationAmount: String(target.concentration.amount),
      concentrationUnit: target.concentration.amountUnit,
      concentrationVolumeMl: String(target.concentration.volumeMl),
    }));
    setCopyMessage(`프리셋 "${target.name}" 적용 완료`);
  }, [allPresets, selectedPresetId]);

  const addCustomPreset = useCallback(() => {
    const concentrationAmount = parseNumericInput(pumpForm.concentrationAmount);
    const concentrationVolumeMl = parseNumericInput(pumpForm.concentrationVolumeMl);
    if (!customPresetName.trim()) {
      setCopyMessage("프리셋 이름을 입력해 주세요.");
      return;
    }
    if (!concentrationAmount || !concentrationVolumeMl) {
      setCopyMessage("현재 농도 값이 올바르지 않아 저장할 수 없습니다.");
      return;
    }
    const preset: CalculatorPreset = {
      id: `custom-${Date.now()}`,
      name: customPresetName.trim(),
      drug: customPresetDrug.trim() || undefined,
      concentration: {
        amount: concentrationAmount,
        amountUnit: pumpForm.concentrationUnit,
        volumeMl: concentrationVolumeMl,
      },
      tags: ["Custom"],
    };
    setCustomPresets((prev) => [preset, ...prev].slice(0, 40));
    setCustomPresetName("");
    setCustomPresetDrug("");
    setCopyMessage(`프리셋 "${preset.name}" 저장 완료`);
  }, [customPresetDrug, customPresetName, pumpForm.concentrationAmount, pumpForm.concentrationUnit, pumpForm.concentrationVolumeMl]);

  const dilutionOutputOptions = useMemo(() => {
    const family = UNIT_FAMILY[dilutionForm.amountUnit];
    return AMOUNT_UNIT_OPTIONS.filter((unit) => UNIT_FAMILY[unit] === family);
  }, [dilutionForm.amountUnit]);
  const pumpSignature = useMemo(() => buildPumpSignature(pumpMode, pumpForm), [pumpForm, pumpMode]);
  const ivpbSignature = useMemo(() => buildIvpbSignature(ivpbForm), [ivpbForm]);
  const dripSignature = useMemo(() => buildDripSignature(dripMode, dripForm), [dripForm, dripMode]);
  const dilutionSignature = useMemo(() => buildDilutionSignature(dilutionForm), [dilutionForm]);
  const checkSignature = useMemo(() => buildCheckSignature(checkForm), [checkForm]);
  const pumpResultStale = Boolean(pumpResult && pumpLastSignature !== pumpSignature);
  const ivpbResultStale = Boolean(ivpbResult && ivpbLastSignature !== ivpbSignature);
  const dripResultStale = Boolean(dripResult && dripLastSignature !== dripSignature);
  const dilutionResultStale = Boolean(dilutionResult && dilutionLastSignature !== dilutionSignature);
  const checkResultStale = Boolean(checkResult && checkLastSignature !== checkSignature);

  const pumpLiveIssues = useMemo(() => {
    const issues: string[] = [];
    const checks: Array<{ raw: string; label: string; required?: boolean }> = [
      { raw: pumpForm.targetDose, label: "목표 용량" },
      { raw: pumpForm.concentrationAmount, label: "농도 총 약량" },
      { raw: pumpForm.concentrationVolumeMl, label: "농도 총 부피(mL)" },
    ];
    if (pumpForm.targetPerKg) checks.push({ raw: pumpForm.weight, label: "체중" });
    if (pumpMode === "reverse") checks.push({ raw: pumpForm.rateMlHr, label: "현재 펌프 속도(mL/hr)" });
    checks.forEach((item) => {
      const issue = buildPositiveFieldIssue(item.raw, item.label, item.required ?? true);
      if (issue) issues.push(issue);
    });
    if (pumpForm.doubleCheck) {
      const issue = buildPositiveFieldIssue(pumpForm.doubleCheckRate, "더블체크 입력값");
      if (issue) issues.push(issue);
    }
    return issues;
  }, [pumpForm, pumpMode]);

  const ivpbLiveIssues = useMemo(() => {
    const issues: string[] = [];
    [buildPositiveFieldIssue(ivpbForm.totalVolumeMl, "총 부피(mL)"), buildPositiveFieldIssue(ivpbForm.duration, "주입 시간")]
      .filter(Boolean)
      .forEach((item) => issues.push(item as string));
    return issues;
  }, [ivpbForm.duration, ivpbForm.totalVolumeMl]);

  const dripLiveIssues = useMemo(() => {
    const issues: string[] = [];
    if (dripMode === "forward") {
      const issue = buildPositiveFieldIssue(dripForm.mlHr, "목표 속도(mL/hr)");
      if (issue) issues.push(issue);
    } else {
      const issue = buildPositiveFieldIssue(dripForm.gttPerMin, "현재 방울수(gtt/min)");
      if (issue) issues.push(issue);
    }
    return issues;
  }, [dripForm.gttPerMin, dripForm.mlHr, dripMode]);

  const dilutionLiveIssues = useMemo(() => {
    const issues: string[] = [];
    [buildPositiveFieldIssue(dilutionForm.totalAmount, "총 약량"), buildPositiveFieldIssue(dilutionForm.totalVolumeMl, "총 부피(mL)")]
      .filter(Boolean)
      .forEach((item) => issues.push(item as string));
    return issues;
  }, [dilutionForm.totalAmount, dilutionForm.totalVolumeMl]);

  const checkLiveIssues = useMemo(() => {
    const issues: string[] = [];
    const checks: Array<{ raw: string; label: string }> = [
      { raw: checkForm.pumpRateMlHr, label: "현재 펌프 속도(mL/hr)" },
      { raw: checkForm.concentrationAmount, label: "농도 총 약량" },
      { raw: checkForm.concentrationVolumeMl, label: "농도 총 부피(mL)" },
    ];
    if (checkForm.useWeight) checks.push({ raw: checkForm.weight, label: "체중" });
    checks.forEach((item) => {
      const issue = buildPositiveFieldIssue(item.raw, item.label);
      if (issue) issues.push(issue);
    });
    const targetIssue = buildPositiveFieldIssue(checkForm.prescribedTargetDose, "처방 목표", false);
    if (targetIssue && checkForm.prescribedTargetDose.trim()) issues.push(targetIssue);
    return issues;
  }, [
    checkForm.concentrationAmount,
    checkForm.concentrationVolumeMl,
    checkForm.pumpRateMlHr,
    checkForm.prescribedTargetDose,
    checkForm.useWeight,
    checkForm.weight,
  ]);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("간호사 계산기 TOP5")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">
            100% 로컬 계산으로 처방 단위와 기기 입력 단위를 3초 안에 변환/검산합니다.
          </div>
        </div>
        <Link href="/tools" className="wnl-chip-muted px-3 py-1 text-[11px]">
          툴 목록
        </Link>
      </div>

      <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
        <Segmented<ToolModule>
          value={activeModule}
          onValueChange={setActiveModule}
          options={[
            { value: "pump", label: "1. 펌프 변환" },
            { value: "ivpb", label: "2. IVPB" },
            { value: "drip", label: "3. 드립" },
            { value: "dilution", label: "4. 희석" },
            { value: "check", label: "5. 검산" },
          ]}
          className="overflow-x-auto"
        />
      </Card>

      {activeModule === "pump" ? (
        <Card className={`space-y-4 p-4 ${FLAT_CARD_CLASS}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ios-text">펌프 변환 계산기</div>
              <div className="text-[12px] text-ios-sub">Dose-rate ↔ mL/hr</div>
            </div>
            <Segmented<PumpMode>
              value={pumpMode}
              onValueChange={setPumpMode}
              options={[
                { value: "forward", label: "계산" },
                { value: "reverse", label: "검산" },
              ]}
              className="max-w-[220px]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SmallLabel>체중</SmallLabel>
              <div className="flex gap-2">
                <Input
                  value={pumpForm.weight}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, weight: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 62"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-3 text-[14px] text-ios-text"
                  value={pumpForm.weightUnit}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, weightUnit: event.target.value as WeightUnit }))
                  }
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
            </div>
            <div>
              <SmallLabel>목표 용량</SmallLabel>
              <div className="grid grid-cols-[1fr,auto,auto,auto] gap-2">
                <Input
                  value={pumpForm.targetDose}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, targetDose: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 0.1"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[13px] text-ios-text"
                  value={pumpForm.targetUnit}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, targetUnit: event.target.value as AmountUnit }))
                  }
                >
                  {pumpTargetUnitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`h-11 rounded-2xl border px-3 text-[13px] font-semibold ${
                    pumpForm.targetPerKg
                      ? "border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                      : "border-ios-sep bg-white text-ios-sub"
                  }`}
                  onClick={() => setPumpForm((prev) => ({ ...prev, targetPerKg: !prev.targetPerKg }))}
                >
                  /kg
                </button>
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[13px] text-ios-text"
                  value={pumpForm.targetTimeUnit}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, targetTimeUnit: event.target.value as TimeUnit }))
                  }
                >
                  {TIME_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      /{unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <SmallLabel>농도 (총 약량 / 총 부피 mL)</SmallLabel>
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2">
                <Input
                  value={pumpForm.concentrationAmount}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, concentrationAmount: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 4"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[13px] text-ios-text"
                  value={pumpForm.concentrationUnit}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, concentrationUnit: event.target.value as AmountUnit }))
                  }
                >
                  {AMOUNT_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <Input
                  value={pumpForm.concentrationVolumeMl}
                  onChange={(event) =>
                    setPumpForm((prev) => ({ ...prev, concentrationVolumeMl: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 250mL"
                />
              </div>
            </div>
            {pumpMode === "reverse" ? (
              <div className="sm:col-span-2">
                <SmallLabel>현재 펌프 속도</SmallLabel>
                <div className="grid grid-cols-[1fr,auto] gap-2">
                  <Input
                    value={pumpForm.rateMlHr}
                    onChange={(event) =>
                      setPumpForm((prev) => ({ ...prev, rateMlHr: sanitizeNumericInput(event.target.value) }))
                    }
                    inputMode="decimal"
                    placeholder="예: 23.3"
                  />
                  <div className="flex h-11 items-center rounded-2xl border border-ios-sep px-3 text-[13px] font-semibold text-ios-sub">
                    mL/hr
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <details className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ios-sub">Advanced 옵션</summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <SmallLabel>프리셋 선택</SmallLabel>
                  <div className="flex gap-2">
                    <select
                      className="h-11 flex-1 rounded-2xl border border-ios-sep bg-white px-3 text-[13px] text-ios-text"
                      value={selectedPresetId}
                      onChange={(event) => setSelectedPresetId(event.target.value)}
                    >
                      <option value="">표준 농도 선택</option>
                      {allPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    <Button className={SECONDARY_FLAT_BTN} onClick={applyPreset}>
                      적용
                    </Button>
                  </div>
                </div>
                <div>
                  <SmallLabel>라인/펌프 안내</SmallLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[12px] text-ios-text"
                      value={pumpForm.lineType}
                      onChange={(event) =>
                        setPumpForm((prev) => ({ ...prev, lineType: event.target.value as PumpFormState["lineType"] }))
                      }
                    >
                      <option value="peripheral">말초</option>
                      <option value="central">중심</option>
                    </select>
                    <select
                      className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[12px] text-ios-text"
                      value={pumpForm.dilutionMode}
                      onChange={(event) =>
                        setPumpForm((prev) => ({
                          ...prev,
                          dilutionMode: event.target.value as PumpFormState["dilutionMode"],
                        }))
                      }
                    >
                      <option value="standard">표준 희석</option>
                      <option value="custom">커스텀 희석</option>
                    </select>
                    <select
                      className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[12px] text-ios-text"
                      value={pumpForm.pumpType}
                      onChange={(event) =>
                        setPumpForm((prev) => ({ ...prev, pumpType: event.target.value as PumpFormState["pumpType"] }))
                      }
                    >
                      <option value="infusion">인퓨전</option>
                      <option value="syringe">시린지</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={customPresetName}
                  onChange={(event) => setCustomPresetName(event.target.value.slice(0, 36))}
                  placeholder="새 프리셋 이름 (예: ICU NE 4mg/250)"
                />
                <Input
                  value={customPresetDrug}
                  onChange={(event) => setCustomPresetDrug(event.target.value.slice(0, 36))}
                  placeholder="약물명 (선택)"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className={SECONDARY_FLAT_BTN} onClick={addCustomPreset}>
                  현재 농도 프리셋 저장
                </Button>
                <label className="inline-flex items-center gap-2 text-[12px] text-ios-sub">
                  <input
                    type="checkbox"
                    checked={pumpForm.doubleCheck}
                    onChange={(event) => setPumpForm((prev) => ({ ...prev, doubleCheck: event.target.checked }))}
                  />
                  더블체크 모드
                </label>
                {pumpForm.doubleCheck ? (
                  <div className="min-w-[220px] flex-1">
                    <Input
                      value={pumpForm.doubleCheckRate}
                      onChange={(event) =>
                        setPumpForm((prev) => ({ ...prev, doubleCheckRate: sanitizeNumericInput(event.target.value) }))
                      }
                      inputMode="decimal"
                      placeholder="동료 계산값 입력 (mL/hr)"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button className={PRIMARY_FLAT_BTN} onClick={runPump} disabled={pumpLiveIssues.length > 0}>
              {pumpMode === "forward" ? "펌프 값 계산" : "현재 세팅 검산"}
            </Button>
            {pumpResult && !pumpResultStale ? (
              <Button className={SECONDARY_FLAT_BTN} onClick={() => runCopy(pumpResult.summaryLine, setCopyMessage)}>
                한 줄 복사
              </Button>
            ) : null}
          </div>

          {pumpResultStale ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              입력이 변경되었습니다. 최신 값으로 다시 계산해 주세요.
            </div>
          ) : null}

          {pumpLiveIssues.length ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              {pumpLiveIssues[0]}
            </div>
          ) : null}

          {pumpErrors.length ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              {pumpErrors.join(" / ")}
            </div>
          ) : null}

          {pumpResult ? (
            <div className="space-y-3">
              <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
                <div className="text-[12px] font-semibold text-ios-sub">펌프 입력값</div>
                {pumpResult.mode === "forward" ? (
                  <div className="mt-1 text-[36px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                    {formatNumber(pumpResult.rateMlHr)} <span className="text-[18px]">mL/hr</span>
                  </div>
                ) : (
                  <div className="mt-1 text-[28px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                    {formatNumber(pumpResult.dose)} <span className="text-[16px]">{pumpResult.doseLabel}</span>
                  </div>
                )}
                <div className="mt-2 text-[12px] text-ios-sub">
                  {pumpResult.mode === "forward"
                    ? `검산: ${formatNumber(pumpResult.verifyDose)} ${pumpResult.doseLabel}`
                    : `시간당 총 투여량: ${formatNumber(pumpResult.totalDosePerHour)} ${pumpForm.targetUnit}/hr`}
                </div>
              </Card>
              <SafetyChecklist value={pumpSafety} onChange={setPumpSafety} />
              <WarningList warnings={pumpResult.warnings} />
              <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-2 text-[12px] text-ios-sub">
                Soft/Hard limit은 기관 프로토콜 기준으로 최종 확인하세요.
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {activeModule === "ivpb" ? (
        <Card className={`space-y-4 p-4 ${FLAT_CARD_CLASS}`}>
          <div>
            <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ios-text">IVPB / Secondary 계산기</div>
            <div className="text-[12px] text-ios-sub">mL + 분/시간 → mL/hr + VTBI</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SmallLabel>총 부피 (mL)</SmallLabel>
              <Input
                value={ivpbForm.totalVolumeMl}
                onChange={(event) =>
                  setIvpbForm((prev) => ({ ...prev, totalVolumeMl: sanitizeNumericInput(event.target.value) }))
                }
                inputMode="decimal"
                placeholder="예: 100"
              />
            </div>
            <div>
              <SmallLabel>주입 시간</SmallLabel>
              <div className="grid grid-cols-[1fr,auto] gap-2">
                <Input
                  value={ivpbForm.duration}
                  onChange={(event) =>
                    setIvpbForm((prev) => ({ ...prev, duration: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 30"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-3 text-[14px] text-ios-text"
                  value={ivpbForm.durationUnit}
                  onChange={(event) => setIvpbForm((prev) => ({ ...prev, durationUnit: event.target.value as TimeUnit }))}
                >
                  <option value="min">min</option>
                  <option value="hr">hr</option>
                </select>
              </div>
            </div>
          </div>

          <details className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ios-sub">Advanced 옵션</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                value={ivpbForm.rangeStartMin}
                onChange={(event) =>
                  setIvpbForm((prev) => ({ ...prev, rangeStartMin: sanitizeNumericInput(event.target.value) }))
                }
                inputMode="decimal"
                placeholder="처방 범위 시작(분)"
              />
              <Input
                value={ivpbForm.rangeEndMin}
                onChange={(event) =>
                  setIvpbForm((prev) => ({ ...prev, rangeEndMin: sanitizeNumericInput(event.target.value) }))
                }
                inputMode="decimal"
                placeholder="처방 범위 끝(분)"
              />
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                {[
                  { total: "50", duration: "30" },
                  { total: "100", duration: "60" },
                  { total: "250", duration: "120" },
                ].map((preset) => (
                  <Button
                    key={`${preset.total}-${preset.duration}`}
                    className={SECONDARY_FLAT_BTN}
                    onClick={() =>
                      setIvpbForm((prev) => ({
                        ...prev,
                        totalVolumeMl: preset.total,
                        duration: preset.duration,
                        durationUnit: "min",
                      }))
                    }
                  >
                    {preset.total}mL/{preset.duration}분
                  </Button>
                ))}
              </div>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button className={PRIMARY_FLAT_BTN} onClick={runIvpb} disabled={ivpbLiveIssues.length > 0}>
              속도 계산
            </Button>
            {ivpbResult && !ivpbResultStale ? (
              <Button className={SECONDARY_FLAT_BTN} onClick={() => runCopy(ivpbResult.summaryLine, setCopyMessage)}>
                한 줄 복사
              </Button>
            ) : null}
          </div>

          {ivpbResultStale ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              입력이 변경되었습니다. 최신 값으로 다시 계산해 주세요.
            </div>
          ) : null}

          {ivpbLiveIssues.length ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              {ivpbLiveIssues[0]}
            </div>
          ) : null}

          {ivpbErrors.length ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              {ivpbErrors.join(" / ")}
            </div>
          ) : null}

          {ivpbResult ? (
            <div className="space-y-3">
              <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
                <div className="text-[12px] font-semibold text-ios-sub">펌프 입력값</div>
                <div className="mt-1 text-[36px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                  {formatNumber(ivpbResult.rateMlHr)} <span className="text-[18px]">mL/hr</span>
                </div>
                <div className="mt-1 text-[13px] text-ios-sub">
                  VTBI {formatNumber(ivpbResult.vtbiMl)}mL · 총 시간 {formatNumber(ivpbResult.durationMinutes)}분
                </div>
                <div className="mt-2 rounded-xl border border-ios-sep bg-white px-3 py-2 text-[12px] text-ios-sub">
                  처음 5~15분은 환자 상태와 라인 상태를 집중 모니터링하세요.
                </div>
              </Card>
              <SafetyChecklist value={ivpbSafety} onChange={setIvpbSafety} />
              <WarningList warnings={ivpbResult.warnings} />
              <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-2 text-[12px] text-ios-sub">
                Secondary 흔한 실수: clamp 열림, head-height, primary/secondary 연결, wrong channel
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {activeModule === "drip" ? (
        <Card className={`space-y-4 p-4 ${FLAT_CARD_CLASS}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ios-text">중력 드립 계산기</div>
              <div className="text-[12px] text-ios-sub">mL/hr ↔ gtt/min</div>
            </div>
            <Segmented<DripMode>
              value={dripMode}
              onValueChange={setDripMode}
              options={[
                { value: "forward", label: "mL/hr → gtt/min" },
                { value: "reverse", label: "gtt/min → mL/hr" },
              ]}
              className="max-w-[280px]"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SmallLabel>Drip factor</SmallLabel>
              <select
                className="h-11 w-full rounded-2xl border border-ios-sep bg-white px-3 text-[14px] text-ios-text"
                value={dripForm.dripFactor}
                onChange={(event) =>
                  setDripForm((prev) => ({ ...prev, dripFactor: event.target.value as DripFormState["dripFactor"] }))
                }
              >
                {DRIP_FACTORS.map((factor) => (
                  <option key={factor} value={factor}>
                    {factor} gtt/mL
                  </option>
                ))}
              </select>
            </div>
            {dripMode === "forward" ? (
              <div>
                <SmallLabel>목표 속도 (mL/hr)</SmallLabel>
                <Input
                  value={dripForm.mlHr}
                  onChange={(event) =>
                    setDripForm((prev) => ({ ...prev, mlHr: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 100"
                />
              </div>
            ) : (
              <div>
                <SmallLabel>현재 방울수 (gtt/min)</SmallLabel>
                <Input
                  value={dripForm.gttPerMin}
                  onChange={(event) =>
                    setDripForm((prev) => ({ ...prev, gttPerMin: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 33"
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className={PRIMARY_FLAT_BTN} onClick={runDrip} disabled={dripLiveIssues.length > 0}>
              환산 계산
            </Button>
            {dripResult && !dripResultStale ? (
              <Button className={SECONDARY_FLAT_BTN} onClick={() => runCopy(dripResult.summaryLine, setCopyMessage)}>
                한 줄 복사
              </Button>
            ) : null}
          </div>

          {dripResultStale ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              입력이 변경되었습니다. 최신 값으로 다시 계산해 주세요.
            </div>
          ) : null}

          {dripLiveIssues.length ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              {dripLiveIssues[0]}
            </div>
          ) : null}

          {dripErrors.length ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              {dripErrors.join(" / ")}
            </div>
          ) : null}

          {dripResult ? (
            <div className="space-y-3">
              <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
                <div className="text-[12px] font-semibold text-ios-sub">결과</div>
                {dripResult.mode === "forward" ? (
                  <>
                    <div className="mt-1 text-[36px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                      {formatNumber(dripResult.gttPerMin)} <span className="text-[18px]">gtt/min</span>
                    </div>
                    <div className="mt-1 text-[12px] text-ios-sub">현장 카운트 권장: {dripResult.roundedGttPerMin} gtt/min</div>
                  </>
                ) : (
                  <div className="mt-1 text-[36px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                    {formatNumber(dripResult.mlHr)} <span className="text-[18px]">mL/hr</span>
                  </div>
                )}
                <div className="mt-2 rounded-xl border border-ios-sep bg-white px-3 py-2 text-[12px] text-ios-sub">
                  방울수 측정 팁: 15초 카운트 × 4 = gtt/min
                </div>
              </Card>
              <SafetyChecklist value={dripSafety} onChange={setDripSafety} />
              <WarningList warnings={dripResult.warnings} />
              <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-2 text-[12px] text-ios-sub">
                환자 상태 변동/체위 변경/라인 변경 시 즉시 재평가하세요.
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {activeModule === "dilution" ? (
        <Card className={`space-y-4 p-4 ${FLAT_CARD_CLASS}`}>
          <div>
            <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ios-text">희석 / 농도 계산기</div>
            <div className="text-[12px] text-ios-sub">mg/mL, mcg/mL, units/mL, IU/mL, mEq/mL</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SmallLabel>총 약량</SmallLabel>
              <div className="grid grid-cols-[1fr,auto] gap-2">
                <Input
                  value={dilutionForm.totalAmount}
                  onChange={(event) =>
                    setDilutionForm((prev) => ({ ...prev, totalAmount: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 4"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-3 text-[13px] text-ios-text"
                  value={dilutionForm.amountUnit}
                  onChange={(event) =>
                    setDilutionForm((prev) => {
                      const nextUnit = event.target.value as AmountUnit;
                      const nextOptions = AMOUNT_UNIT_OPTIONS.filter((unit) => UNIT_FAMILY[unit] === UNIT_FAMILY[nextUnit]);
                      return {
                        ...prev,
                        amountUnit: nextUnit,
                        outputUnit: nextOptions.includes(prev.outputUnit) ? prev.outputUnit : nextOptions[0],
                      };
                    })
                  }
                >
                  {AMOUNT_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <SmallLabel>총 부피 (mL)</SmallLabel>
              <Input
                value={dilutionForm.totalVolumeMl}
                onChange={(event) =>
                  setDilutionForm((prev) => ({ ...prev, totalVolumeMl: sanitizeNumericInput(event.target.value) }))
                }
                inputMode="decimal"
                placeholder="예: 250"
              />
            </div>
            <div className="sm:col-span-2">
              <SmallLabel>출력 단위</SmallLabel>
              <select
                className="h-11 w-full rounded-2xl border border-ios-sep bg-white px-3 text-[14px] text-ios-text"
                value={dilutionForm.outputUnit}
                onChange={(event) =>
                  setDilutionForm((prev) => ({ ...prev, outputUnit: event.target.value as AmountUnit }))
                }
              >
                {dilutionOutputOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}/mL
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className={PRIMARY_FLAT_BTN} onClick={runDilution} disabled={dilutionLiveIssues.length > 0}>
              농도 계산
            </Button>
            {dilutionResult && !dilutionResultStale ? (
              <Button className={SECONDARY_FLAT_BTN} onClick={() => runCopy(dilutionResult.summaryLine, setCopyMessage)}>
                한 줄 복사
              </Button>
            ) : null}
          </div>

          {dilutionResultStale ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              입력이 변경되었습니다. 최신 값으로 다시 계산해 주세요.
            </div>
          ) : null}

          {dilutionLiveIssues.length ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              {dilutionLiveIssues[0]}
            </div>
          ) : null}

          {dilutionErrors.length ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              {dilutionErrors.join(" / ")}
            </div>
          ) : null}

          {dilutionResult ? (
            <div className="space-y-3">
              <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
                <div className="text-[12px] font-semibold text-ios-sub">농도 결과</div>
                <div className="mt-1 text-[36px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                  {formatNumber(dilutionResult.concentrationPerMl)}{" "}
                  <span className="text-[18px]">{dilutionResult.outputUnit}/mL</span>
                </div>
                <div className="mt-2 rounded-xl border border-ios-sep bg-white px-3 py-2 text-[12px] text-ios-sub">
                  펌프 커스텀 농도 입력값: {formatNumber(dilutionResult.concentrationPerMl)} {dilutionResult.outputUnit}/mL
                </div>
              </Card>
              <SafetyChecklist value={dilutionSafety} onChange={setDilutionSafety} />
              <WarningList warnings={dilutionResult.warnings} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {activeModule === "check" ? (
        <Card className={`space-y-4 p-4 ${FLAT_CARD_CLASS}`}>
          <div>
            <div className="text-[18px] font-extrabold tracking-[-0.02em] text-ios-text">검산(역산) 계산기</div>
            <div className="text-[12px] text-ios-sub">현재 mL/hr가 실제 처방 용량과 맞는지 즉시 확인</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <SmallLabel>체중</SmallLabel>
              <div className="grid grid-cols-[1fr,auto,auto] gap-2">
                <Input
                  value={checkForm.weight}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, weight: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 62"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[13px] text-ios-text"
                  value={checkForm.weightUnit}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, weightUnit: event.target.value as WeightUnit }))
                  }
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
                <button
                  type="button"
                  className={`h-11 rounded-2xl border px-3 text-[13px] font-semibold ${
                    checkForm.useWeight
                      ? "border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                      : "border-ios-sep bg-white text-ios-sub"
                  }`}
                  onClick={() => setCheckForm((prev) => ({ ...prev, useWeight: !prev.useWeight }))}
                >
                  /kg
                </button>
              </div>
            </div>
            <div>
              <SmallLabel>현재 펌프 속도</SmallLabel>
              <div className="grid grid-cols-[1fr,auto] gap-2">
                <Input
                  value={checkForm.pumpRateMlHr}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, pumpRateMlHr: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 23.3"
                />
                <div className="flex h-11 items-center rounded-2xl border border-ios-sep px-3 text-[13px] font-semibold text-ios-sub">
                  mL/hr
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <SmallLabel>농도 (총 약량 / 총 부피 mL)</SmallLabel>
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2">
                <Input
                  value={checkForm.concentrationAmount}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, concentrationAmount: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 4"
                />
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-2 text-[13px] text-ios-text"
                  value={checkForm.concentrationUnit}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, concentrationUnit: event.target.value as AmountUnit }))
                  }
                >
                  {AMOUNT_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <Input
                  value={checkForm.concentrationVolumeMl}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, concentrationVolumeMl: sanitizeNumericInput(event.target.value) }))
                  }
                  inputMode="decimal"
                  placeholder="예: 250"
                />
              </div>
            </div>
            <div>
              <SmallLabel>출력 단위</SmallLabel>
              <div className="grid grid-cols-[1fr,auto] gap-2">
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-3 text-[14px] text-ios-text"
                  value={checkForm.outputUnit}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, outputUnit: event.target.value as AmountUnit }))
                  }
                >
                  {checkOutputUnitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <select
                  className="h-11 rounded-2xl border border-ios-sep bg-white px-3 text-[14px] text-ios-text"
                  value={checkForm.outputTimeUnit}
                  onChange={(event) =>
                    setCheckForm((prev) => ({ ...prev, outputTimeUnit: event.target.value as TimeUnit }))
                  }
                >
                  <option value="min">/min</option>
                  <option value="hr">/hr</option>
                </select>
              </div>
            </div>
            <div>
              <SmallLabel>처방 목표(선택)</SmallLabel>
              <Input
                value={checkForm.prescribedTargetDose}
                onChange={(event) =>
                  setCheckForm((prev) => ({ ...prev, prescribedTargetDose: sanitizeNumericInput(event.target.value) }))
                }
                inputMode="decimal"
                placeholder={`예: ${checkForm.outputUnit === "units" ? "3" : "0.1"} (${checkDoseLabel})`}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className={PRIMARY_FLAT_BTN} onClick={runCheck} disabled={checkLiveIssues.length > 0}>
              검산 실행
            </Button>
            {checkResult && !checkResultStale ? (
              <Button className={SECONDARY_FLAT_BTN} onClick={() => runCopy(checkResult.summaryLine, setCopyMessage)}>
                인계용 한 줄 복사
              </Button>
            ) : null}
          </div>

          {checkResultStale ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              입력이 변경되었습니다. 최신 값으로 다시 계산해 주세요.
            </div>
          ) : null}

          {checkLiveIssues.length ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
              {checkLiveIssues[0]}
            </div>
          ) : null}

          {checkErrors.length ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              {checkErrors.join(" / ")}
            </div>
          ) : null}

          {checkResult ? (
            <div className="space-y-3">
              <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
                <div className="text-[12px] font-semibold text-ios-sub">실제 용량</div>
                <div className="mt-1 text-[34px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
                  {formatNumber(checkResult.actualDose)} <span className="text-[17px]">{checkResult.doseLabel}</span>
                </div>
                <div className="mt-1 text-[12px] text-ios-sub">
                  시간당 총 투여량: {formatNumber(checkResult.totalDosePerHour)} {checkForm.outputUnit}/hr
                </div>
                {checkResult.differencePercent != null ? (
                  <div
                    className={`mt-2 rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                      Math.abs(checkResult.differencePercent) >= 50
                        ? "border-red-300 bg-red-50 text-red-700"
                        : Math.abs(checkResult.differencePercent) >= 20
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    처방 대비 차이: {formatNumber(checkResult.differencePercent, 1)}%
                  </div>
                ) : null}
              </Card>
              <SafetyChecklist value={checkSafety} onChange={setCheckSafety} />
              <WarningList warnings={checkResult.warnings} />
              {checkResult.differencePercent != null && Math.abs(checkResult.differencePercent) >= 20 ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  자동 체크리스트: 단위 확인 → 농도 확인 → 채널 확인 → 라인(Primary/Secondary) 확인
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className={`space-y-3 p-4 ${FLAT_CARD_CLASS}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[14px] font-semibold text-ios-text">최근 계산 기록</div>
          <div className="text-[11px] text-ios-sub">로컬 저장</div>
        </div>
        {history.length ? (
          <div className="space-y-2">
            {history.slice(0, 6).map((item) => (
              <div key={`${item.timestamp}-${item.calcType}`} className="rounded-2xl border border-ios-sep bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-ios-text">{CALC_TYPE_LABEL[item.calcType]}</div>
                  <div className="text-[11px] text-ios-sub">{new Date(item.timestamp).toLocaleTimeString("ko-KR")}</div>
                </div>
                <div className="mt-1 text-[11px] text-ios-sub">
                  {Object.entries(item.outputs)
                    .slice(0, 2)
                    .map(([key, value]) => `${key}: ${typeof value === "number" ? formatNumber(value) : value}`)
                    .join(" · ")}
                </div>
                {item.flags.warnings.length ? (
                  <div className="mt-1 text-[11px] text-amber-700">{item.flags.warnings[0]}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
            아직 계산 기록이 없습니다.
          </div>
        )}
      </Card>

      {copyMessage ? (
        <div className="fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 mx-auto w-full max-w-[720px] px-6">
          <div className="rounded-2xl border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] px-4 py-2 text-center text-[12px] font-semibold text-[color:var(--wnl-accent)]">
            {copyMessage}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roundInput(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1_000) / 1_000;
}
