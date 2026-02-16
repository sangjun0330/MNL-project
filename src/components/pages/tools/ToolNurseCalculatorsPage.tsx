"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
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
type UiMode = "basic" | "pro";

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
  uiMode: UiMode;
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
const IVPB_QUICK_PRESETS: Array<{ total: string; duration: string }> = [
  { total: "50", duration: "30" },
  { total: "100", duration: "60" },
  { total: "250", duration: "120" },
];
const CALC_TYPE_LABEL: Record<CalcHistory["calcType"], string> = {
  pump_forward: "펌프 계산",
  pump_reverse: "펌프 검산",
  ivpb: "IVPB",
  drip_forward: "드립 환산",
  drip_reverse: "드립 역산",
  dilution: "희석/농도",
  dose_check: "검산(역산)",
};

const HISTORY_FIELD_LABEL: Record<string, string> = {
  weightKg: "체중(kg)",
  targetDose: "목표 용량",
  targetUnit: "목표 단위",
  targetTimeUnit: "목표 시간 단위",
  targetPerKg: "/kg 적용",
  concentrationAmount: "농도 총 약량",
  concentrationUnit: "농도 단위",
  concentrationVolumeMl: "농도 총 부피(mL)",
  rateMlHr: "현재 속도(mL/hr)",
  outputUnit: "출력 단위",
  outputTimeUnit: "출력 시간 단위",
  outputPerKg: "출력 /kg 적용",
  totalVolumeMl: "총 부피(mL)",
  duration: "주입 시간",
  durationUnit: "주입 시간 단위",
  mlHr: "속도(mL/hr)",
  dripFactor: "Drip factor",
  gttPerMin: "방울수(gtt/min)",
  roundedGttPerMin: "현장 카운트(gtt/min)",
  verifyDose: "검산 용량",
  dose: "역산 용량",
  totalDosePerHour: "시간당 총 투여량",
  vtbiMl: "VTBI(mL)",
  durationMinutes: "주입 시간(분)",
  totalAmount: "총 약량",
  amountUnit: "약량 단위",
  concentrationPerMl: "농도(/mL)",
  useWeight: "체중 반영",
  pumpRateMlHr: "현재 펌프 속도(mL/hr)",
  prescribedTargetDose: "처방 목표 용량",
  actualDose: "실제 용량",
  differencePercent: "처방 대비 차이(%)",
};

const MODULE_ORDER: ToolModule[] = ["pump", "ivpb", "drip", "dilution", "check"];

const MODULE_GUIDE: Record<
  ToolModule,
  {
    title: string;
    subtitle: string;
    quickSteps: [string, string, string];
    details: Array<{ title: string; body: string }>;
  }
> = {
  pump: {
    title: "1. 펌프 변환",
    subtitle: "Dose-rate ↔ mL/hr",
    quickSteps: [
      "체중, 목표 용량, 농도(총 약량/총 mL)를 입력",
      "계산/검산 모드를 선택하고 계산 실행",
      "결과와 경고를 확인한 뒤 펌프에 입력",
    ],
    details: [
      { title: "언제 사용", body: "승압제/진정제 등 지속주입에서 처방 단위를 펌프 단위로 바꿀 때 사용." },
      { title: "필수 입력", body: "체중(필요 시), 목표 용량, 농도(총 약량 + 총 부피 mL)." },
      { title: "최종 확인", body: "큰 글씨 결과값과 단위/농도 체크를 완료한 뒤 적용." },
    ],
  },
  ivpb: {
    title: "2. IVPB",
    subtitle: "mL + 시간 → mL/hr + VTBI",
    quickSteps: ["총 부피(mL)와 주입 시간을 입력", "속도 계산 버튼 실행", "mL/hr, VTBI, 라인 체크포인트 확인"],
    details: [
      { title: "언제 사용", body: "항생제 등 secondary 투여 rate/VTBI 설정." },
      { title: "필수 입력", body: "총 부피(mL), 주입 시간(분/시간)." },
      { title: "최종 확인", body: "clamp/head-height/channel 연결 상태 점검." },
    ],
  },
  drip: {
    title: "3. 드립",
    subtitle: "mL/hr ↔ gtt/min",
    quickSteps: ["drip factor를 선택", "변환 방향과 값을 입력", "환산 결과와 현장 카운트 팁 확인"],
    details: [
      { title: "언제 사용", body: "펌프 없이 중력 주입할 때." },
      { title: "필수 입력", body: "drip factor(10/15/20/60)와 변환할 값." },
      { title: "최종 확인", body: "15초 카운트 x4로 현장 재확인." },
    ],
  },
  dilution: {
    title: "4. 희석",
    subtitle: "총 약량/총 mL → 농도",
    quickSteps: ["총 약량과 총 부피(mL) 입력", "출력 단위를 선택", "농도 결과를 펌프 커스텀 농도에 반영"],
    details: [
      { title: "언제 사용", body: "재구성/커스텀 희석 후 농도 확인." },
      { title: "필수 입력", body: "총 약량(숫자+단위), 총 부피(mL), 출력 단위." },
      { title: "최종 확인", body: "mg↔mcg 등 단위 착오 없이 적용." },
    ],
  },
  check: {
    title: "5. 검산",
    subtitle: "현재 세팅 역산",
    quickSteps: ["현재 속도, 농도, 필요 시 체중 입력", "검산 실행", "실제 용량과 처방 대비 차이(%) 확인"],
    details: [
      { title: "언제 사용", body: "인계/교대/알람 대응 시 현재 세팅 검증." },
      { title: "필수 입력", body: "현재 mL/hr, 농도(총 약량/총 mL), 필요 시 체중." },
      { title: "최종 확인", body: "차이가 크면 단위/농도/채널/라인 재점검." },
    ],
  },
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

function parseHistoryNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseHistoryAmountUnit(value: unknown): AmountUnit | null {
  if (typeof value !== "string") return null;
  if (AMOUNT_UNIT_OPTIONS.includes(value as AmountUnit)) return value as AmountUnit;
  return null;
}

function parseHistoryTimeUnit(value: unknown): TimeUnit | null {
  if (value === "min" || value === "hr") return value;
  return null;
}

function parseHistoryBoolean(value: unknown): boolean {
  return value === true;
}

function formatHistoryValue(value: string | number | boolean | null | undefined) {
  if (value == null) return "-";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value) : "-";
  if (!value.trim()) return "-";
  return value;
}

function getHistoryLabel(key: string) {
  return HISTORY_FIELD_LABEL[key] ?? key;
}

function buildHistoryHeadline(item: CalcHistory) {
  const { inputs, outputs } = item;
  switch (item.calcType) {
    case "pump_forward": {
      const rate = parseHistoryNumber(outputs.rateMlHr);
      const verifyDose = parseHistoryNumber(outputs.verifyDose);
      const unit = parseHistoryAmountUnit(inputs.targetUnit) ?? "mcg";
      const time = parseHistoryTimeUnit(inputs.targetTimeUnit) ?? "min";
      const perKg = parseHistoryBoolean(inputs.targetPerKg);
      const doseLabel = buildDoseUnitLabel(unit, perKg, time);
      if (rate == null) return "목표 용량을 펌프 속도로 변환한 기록입니다.";
      if (verifyDose == null) return `목표 용량을 펌프 속도로 변환했습니다: ${formatNumber(rate)} mL/hr`;
      return `목표 용량을 펌프 속도로 변환했습니다: ${formatNumber(rate)} mL/hr (검산 ${formatNumber(verifyDose)} ${doseLabel})`;
    }
    case "pump_reverse": {
      const dose = parseHistoryNumber(outputs.dose);
      const unit = parseHistoryAmountUnit(inputs.outputUnit) ?? parseHistoryAmountUnit(inputs.targetUnit) ?? "mcg";
      const time = parseHistoryTimeUnit(inputs.outputTimeUnit) ?? parseHistoryTimeUnit(inputs.targetTimeUnit) ?? "min";
      const perKg = parseHistoryBoolean(inputs.outputPerKg) || parseHistoryBoolean(inputs.targetPerKg);
      const doseLabel = buildDoseUnitLabel(unit, perKg, time);
      if (dose == null) return "현재 펌프 속도를 용량으로 역산한 기록입니다.";
      return `현재 펌프 속도를 역산했습니다: ${formatNumber(dose)} ${doseLabel}`;
    }
    case "ivpb": {
      const rate = parseHistoryNumber(outputs.rateMlHr);
      const vtbi = parseHistoryNumber(outputs.vtbiMl);
      if (rate == null) return "IVPB 속도 계산 기록입니다.";
      if (vtbi == null) return `IVPB 속도를 계산했습니다: ${formatNumber(rate)} mL/hr`;
      return `IVPB 속도를 계산했습니다: ${formatNumber(rate)} mL/hr, VTBI ${formatNumber(vtbi)} mL`;
    }
    case "drip_forward": {
      const gtt = parseHistoryNumber(outputs.gttPerMin);
      if (gtt == null) return "mL/hr를 gtt/min으로 환산한 기록입니다.";
      return `mL/hr를 gtt/min으로 환산했습니다: ${formatNumber(gtt)} gtt/min`;
    }
    case "drip_reverse": {
      const mlHr = parseHistoryNumber(outputs.mlHr);
      if (mlHr == null) return "gtt/min을 mL/hr로 역산한 기록입니다.";
      return `gtt/min을 mL/hr로 환산했습니다: ${formatNumber(mlHr)} mL/hr`;
    }
    case "dilution": {
      const concentration = parseHistoryNumber(outputs.concentrationPerMl);
      const outputUnit = parseHistoryAmountUnit(inputs.outputUnit) ?? "mg";
      if (concentration == null) return "희석/농도 계산 기록입니다.";
      return `희석 농도 계산 결과: ${formatNumber(concentration)} ${outputUnit}/mL`;
    }
    case "dose_check": {
      const actualDose = parseHistoryNumber(outputs.actualDose);
      const diff = parseHistoryNumber(outputs.differencePercent);
      const unit = parseHistoryAmountUnit(inputs.outputUnit) ?? "mcg";
      const time = parseHistoryTimeUnit(inputs.outputTimeUnit) ?? "min";
      const perKg = parseHistoryBoolean(inputs.useWeight);
      const doseLabel = buildDoseUnitLabel(unit, perKg, time);
      if (actualDose == null) return "현재 세팅을 역산 검산한 기록입니다.";
      if (diff == null) return `현재 세팅 역산 결과: ${formatNumber(actualDose)} ${doseLabel}`;
      return `현재 세팅 역산 결과: ${formatNumber(actualDose)} ${doseLabel} (처방 대비 ${formatNumber(diff, 1)}%)`;
    }
    default:
      return "계산 기록입니다.";
  }
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[12px] font-semibold text-ios-sub">{children}</div>;
}

function StepHeader({ step, title, desc }: { step: "1" | "2" | "3"; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--wnl-accent-soft)] text-[11px] font-bold text-[color:var(--wnl-accent)]">
          {step}
        </div>
        <div className="text-[12px] font-bold text-ios-text">{title}</div>
      </div>
      <div className="mt-1 text-[11px] text-ios-sub">{desc}</div>
    </div>
  );
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
  const [uiMode, setUiMode] = useState<UiMode>("basic");
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
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [selectedHistory, setSelectedHistory] = useState<CalcHistory | null>(null);

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
        if (parsed.uiMode === "basic" || parsed.uiMode === "pro") setUiMode(parsed.uiMode);
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
      uiMode,
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
  }, [activeModule, checkForm, dilutionForm, dripForm, dripMode, ivpbForm, pumpForm, pumpMode, uiMode]);

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
      if (uiMode === "pro" && pumpForm.doubleCheck && Number.isFinite(doubleValue)) {
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
  }, [appendHistory, getLastOutput, pumpDoseLabel, pumpForm, pumpMode, uiMode]);

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
    const prescribed = uiMode === "pro" ? parseNumericInput(checkForm.prescribedTargetDose) : null;
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
  }, [appendHistory, checkDoseLabel, checkForm, getLastOutput, uiMode]);

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
  const pumpSignature = useMemo(() => `${uiMode}|${buildPumpSignature(pumpMode, pumpForm)}`, [pumpForm, pumpMode, uiMode]);
  const ivpbSignature = useMemo(() => buildIvpbSignature(ivpbForm), [ivpbForm]);
  const dripSignature = useMemo(() => buildDripSignature(dripMode, dripForm), [dripForm, dripMode]);
  const dilutionSignature = useMemo(() => buildDilutionSignature(dilutionForm), [dilutionForm]);
  const checkSignature = useMemo(() => `${uiMode}|${buildCheckSignature(checkForm)}`, [checkForm, uiMode]);
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
    if (uiMode === "pro" && pumpForm.doubleCheck) {
      const issue = buildPositiveFieldIssue(pumpForm.doubleCheckRate, "더블체크 입력값");
      if (issue) issues.push(issue);
    }
    return issues;
  }, [pumpForm, pumpMode, uiMode]);

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
    if (uiMode === "pro") {
      const targetIssue = buildPositiveFieldIssue(checkForm.prescribedTargetDose, "처방 목표", false);
      if (targetIssue && checkForm.prescribedTargetDose.trim()) issues.push(targetIssue);
    }
    return issues;
  }, [
    checkForm.concentrationAmount,
    checkForm.concentrationVolumeMl,
    checkForm.pumpRateMlHr,
    checkForm.prescribedTargetDose,
    checkForm.useWeight,
    checkForm.weight,
    uiMode,
  ]);

  const activeGuide = MODULE_GUIDE[activeModule];
  const isBasicMode = uiMode === "basic";
  const activeResultSummary = useMemo(() => {
    if (activeModule === "pump") {
      if (!pumpResult) return null;
      if (pumpResult.mode === "forward") {
        return {
          title: "최신 결과 · 펌프 입력값",
          main: `${formatNumber(pumpResult.rateMlHr)} mL/hr`,
          sub: `검산 ${formatNumber(pumpResult.verifyDose)} ${pumpResult.doseLabel}`,
          stale: pumpResultStale,
          warnings: pumpResult.warnings.length,
        };
      }
      return {
        title: "최신 결과 · 역산 용량",
        main: `${formatNumber(pumpResult.dose)} ${pumpResult.doseLabel}`,
        sub: `시간당 총 투여량 ${formatNumber(pumpResult.totalDosePerHour)} ${pumpForm.targetUnit}/hr`,
        stale: pumpResultStale,
        warnings: pumpResult.warnings.length,
      };
    }
    if (activeModule === "ivpb") {
      if (!ivpbResult) return null;
      return {
        title: "최신 결과 · IVPB 속도",
        main: `${formatNumber(ivpbResult.rateMlHr)} mL/hr`,
        sub: `VTBI ${formatNumber(ivpbResult.vtbiMl)} mL · 총 ${formatNumber(ivpbResult.durationMinutes)}분`,
        stale: ivpbResultStale,
        warnings: ivpbResult.warnings.length,
      };
    }
    if (activeModule === "drip") {
      if (!dripResult) return null;
      if (dripResult.mode === "forward") {
        return {
          title: "최신 결과 · 중력 드립",
          main: `${formatNumber(dripResult.gttPerMin)} gtt/min`,
          sub: `현장 카운트 권장 ${dripResult.roundedGttPerMin} gtt/min`,
          stale: dripResultStale,
          warnings: dripResult.warnings.length,
        };
      }
      return {
        title: "최신 결과 · 중력 드립",
        main: `${formatNumber(dripResult.mlHr)} mL/hr`,
        sub: "입력한 gtt/min 기준 역산 결과",
        stale: dripResultStale,
        warnings: dripResult.warnings.length,
      };
    }
    if (activeModule === "dilution") {
      if (!dilutionResult) return null;
      return {
        title: "최신 결과 · 희석 농도",
        main: `${formatNumber(dilutionResult.concentrationPerMl)} ${dilutionResult.outputUnit}/mL`,
        sub: "펌프 커스텀 농도에 그대로 입력 가능",
        stale: dilutionResultStale,
        warnings: dilutionResult.warnings.length,
      };
    }
    if (!checkResult) return null;
    return {
      title: "최신 결과 · 검산(역산)",
      main: `${formatNumber(checkResult.actualDose)} ${checkResult.doseLabel}`,
      sub:
        checkResult.differencePercent == null
          ? `시간당 총 투여량 ${formatNumber(checkResult.totalDosePerHour)} ${checkForm.outputUnit}/hr`
          : `처방 대비 차이 ${formatNumber(checkResult.differencePercent, 1)}%`,
      stale: checkResultStale,
      warnings: checkResult.warnings.length,
    };
  }, [
    activeModule,
    checkForm.outputUnit,
    checkResult,
    checkResultStale,
    dilutionResult,
    dilutionResultStale,
    dripResult,
    dripResultStale,
    ivpbResult,
    ivpbResultStale,
    pumpForm.targetUnit,
    pumpResult,
    pumpResultStale,
  ]);
  const historyDetail = useMemo(() => {
    if (!selectedHistory) return null;
    return {
      title: CALC_TYPE_LABEL[selectedHistory.calcType],
      headline: buildHistoryHeadline(selectedHistory),
      inputs: Object.entries(selectedHistory.inputs).map(([key, value]) => ({
        key,
        label: getHistoryLabel(key),
        value: formatHistoryValue(value),
      })),
      outputs: Object.entries(selectedHistory.outputs).map(([key, value]) => ({
        key,
        label: getHistoryLabel(key),
        value: formatHistoryValue(value),
      })),
      warnings: selectedHistory.flags.warnings,
    };
  }, [selectedHistory]);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("간호사 계산기")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">입력 3단계로 바로 계산하고, 결과는 큰 숫자로 확인합니다.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button className={SECONDARY_FLAT_BTN} onClick={() => setGuideOpen(true)}>
            사용 설명서
          </Button>
          <Link href="/tools" className="wnl-chip-muted px-3 py-1 text-[11px]">
            툴 목록
          </Link>
        </div>
      </div>

      <Card className={`space-y-3 p-4 ${FLAT_CARD_CLASS}`}>
        <div className="grid gap-2 sm:grid-cols-[160px,1fr] sm:items-center">
          <div className="text-[12px] font-semibold text-ios-sub">화면 모드</div>
          <Segmented<UiMode>
            value={uiMode}
            onValueChange={setUiMode}
            options={[
              { value: "basic", label: "기본 모드" },
              { value: "pro", label: "전문 모드" },
            ]}
            className="max-w-[260px]"
          />
        </div>
        <div className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-2 text-[11.5px] text-ios-sub">
          {isBasicMode
            ? "기본 모드: 필수 입력만 중심으로 보여주며, 고급 옵션은 숨깁니다."
            : "전문 모드: 프리셋 저장, 더블체크, 처방 목표 비교 등 고급 기능을 모두 사용합니다."}
        </div>
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
        <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[14px] font-bold text-ios-text">{activeGuide.title}</div>
              <div className="text-[12px] text-ios-sub">{activeGuide.subtitle}</div>
            </div>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] px-2 py-1 text-[11px] font-semibold text-[color:var(--wnl-accent)]"
              onClick={() => setGuideOpen(true)}
            >
              설명 보기
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {activeGuide.quickSteps.map((step, index) => (
              <div key={`${activeModule}-quick-${index}`} className="rounded-xl border border-ios-sep bg-white px-3 py-2">
                <div className="text-[11px] font-bold text-[color:var(--wnl-accent)]">STEP {index + 1}</div>
                <div className="mt-1 text-[11.5px] leading-5 text-ios-text">{step}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-semibold text-ios-sub">지금 계산 결과</div>
          {activeResultSummary ? (
            <div
              className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                activeResultSummary.stale
                  ? "border border-amber-300 bg-amber-50 text-amber-700"
                  : activeResultSummary.warnings
                    ? "border border-amber-300 bg-amber-50 text-amber-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {activeResultSummary.stale
                ? "입력 변경됨"
                : activeResultSummary.warnings
                  ? `경고 ${activeResultSummary.warnings}건`
                  : "정상 범위"}
            </div>
          ) : (
            <div className="text-[11px] text-ios-sub">대기 중</div>
          )}
        </div>
        {activeResultSummary ? (
          <div
            className={`mt-2 rounded-2xl border px-4 py-3 ${
              activeResultSummary.stale
                ? "border-amber-300 bg-amber-50"
                : "border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)]"
            }`}
          >
            <div className="text-[12px] font-semibold text-ios-sub">{activeResultSummary.title}</div>
            <div className="mt-1 text-[34px] font-extrabold tracking-[-0.03em] text-[color:var(--wnl-accent)]">
              {activeResultSummary.main}
            </div>
            <div className="text-[12px] text-ios-sub">{activeResultSummary.sub}</div>
            {activeResultSummary.stale ? (
              <div className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">
                입력이 변경되어 결과가 오래되었습니다. 다시 계산해 주세요.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl border border-dashed border-ios-sep px-3 py-4 text-center text-[12px] text-ios-sub">
            아직 계산 결과가 없습니다. 각 계산기에서 값을 입력하고 계산 버튼을 눌러주세요.
          </div>
        )}
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

          <StepHeader
            step="1"
            title="필수값 입력"
            desc="체중(필요 시), 목표 용량, 농도를 입력합니다. 모드가 검산이면 현재 mL/hr도 입력하세요."
          />
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

          {isBasicMode ? (
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12.5px] font-semibold text-ios-sub">빠른 농도 프리셋</div>
              <div className="mt-2 flex gap-2">
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
              <div className="mt-2 text-[11px] text-ios-sub">프리셋을 선택하면 농도 값이 자동으로 채워집니다.</div>
            </div>
          ) : (
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
          )}

          <StepHeader step="2" title="계산 실행" desc="계산 버튼을 누르면 최신 입력 기준으로 결과를 다시 계산합니다." />
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

          <StepHeader
            step="3"
            title="결과 확인"
            desc="큰 숫자를 펌프에 입력하고, 검산값/경고/체크리스트를 반드시 확인하세요."
          />
          {!pumpResult ? (
            <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
              아직 계산 결과가 없습니다. 위 입력 후 계산을 실행하세요.
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
          <StepHeader step="1" title="필수값 입력" desc="총 부피(mL)와 주입 시간을 입력합니다." />
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

          {isBasicMode ? (
            <div className="rounded-2xl border border-ios-sep bg-ios-bg p-3">
              <div className="text-[12.5px] font-semibold text-ios-sub">자주 쓰는 시간 프리셋</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {IVPB_QUICK_PRESETS.map((preset) => (
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
          ) : (
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
                  {IVPB_QUICK_PRESETS.map((preset) => (
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
          )}

          <StepHeader step="2" title="계산 실행" desc="속도 계산 버튼을 눌러 mL/hr와 VTBI를 계산합니다." />
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

          <StepHeader step="3" title="결과 확인" desc="mL/hr와 VTBI를 확인한 뒤 라인 연결 상태를 점검하세요." />
          {!ivpbResult ? (
            <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
              아직 계산 결과가 없습니다. 위 입력 후 계산을 실행하세요.
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
          <StepHeader
            step="1"
            title="필수값 입력"
            desc="drip factor를 선택하고 변환 방향에 맞는 값을 하나 입력합니다."
          />
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
          <StepHeader step="2" title="계산 실행" desc="환산 계산 버튼을 눌러 즉시 변환합니다." />
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

          <StepHeader step="3" title="결과 확인" desc="환산 결과를 확인하고 15초 카운트로 현장 재확인하세요." />
          {!dripResult ? (
            <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
              아직 계산 결과가 없습니다. 위 입력 후 계산을 실행하세요.
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
          <StepHeader step="1" title="필수값 입력" desc="총 약량, 총 부피(mL), 출력 단위를 선택합니다." />
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
          <StepHeader step="2" title="계산 실행" desc="농도 계산 버튼으로 즉시 결과를 확인합니다." />
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

          <StepHeader
            step="3"
            title="결과 확인"
            desc="농도 값을 펌프 커스텀 농도 입력값으로 그대로 반영하기 전에 단위를 확인하세요."
          />
          {!dilutionResult ? (
            <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
              아직 계산 결과가 없습니다. 위 입력 후 계산을 실행하세요.
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
          <StepHeader
            step="1"
            title="필수값 입력"
            desc="현재 펌프 속도, 농도, 필요 시 체중과 출력 단위를 설정합니다."
          />
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
            {isBasicMode ? (
              <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-2 text-[11.5px] text-ios-sub">
                처방 목표와의 차이(%) 비교는 전문 모드에서 설정할 수 있습니다.
              </div>
            ) : (
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
            )}
          </div>
          <StepHeader step="2" title="검산 실행" desc="검산 실행 버튼으로 현재 세팅을 역산합니다." />
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

          <StepHeader
            step="3"
            title="결과 확인"
            desc="실제 용량과 처방 대비 차이(%)를 확인하고 차이가 크면 체크리스트를 따라 재점검하세요."
          />
          {!checkResult ? (
            <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
              아직 검산 결과가 없습니다. 위 입력 후 검산을 실행하세요.
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

      <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
        <details>
          <summary className="cursor-pointer text-[14px] font-semibold text-ios-text">
            최근 계산 기록 보기 <span className="text-[11px] font-medium text-ios-sub">(로컬 저장)</span>
          </summary>
          <div className="mt-3 space-y-2">
            {history.length ? (
              history.slice(0, 6).map((item) => (
                <button
                  key={`${item.timestamp}-${item.calcType}`}
                  type="button"
                  className="w-full rounded-2xl border border-ios-sep bg-white px-3 py-2 text-left hover:bg-ios-bg"
                  onClick={() => setSelectedHistory(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-ios-text">{CALC_TYPE_LABEL[item.calcType]}</div>
                    <div className="text-[11px] text-ios-sub">{new Date(item.timestamp).toLocaleTimeString("ko-KR")}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-ios-sub">
                    {Object.entries(item.outputs)
                      .slice(0, 2)
                      .map(([key, value]) => `${getHistoryLabel(key)}: ${formatHistoryValue(value)}`)
                      .join(" · ")}
                  </div>
                  {item.flags.warnings.length ? (
                    <div className="mt-1 text-[11px] text-amber-700">{item.flags.warnings[0]}</div>
                  ) : null}
                  <div className="mt-1 text-[10px] font-semibold text-[color:var(--wnl-accent)]">눌러서 계산 상세 보기</div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-ios-sep px-3 py-5 text-center text-[12px] text-ios-sub">
                아직 계산 기록이 없습니다.
              </div>
            )}
          </div>
        </details>
      </Card>

      <BottomSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="간호사 계산기 사용 설명서"
        subtitle="한눈에 입력 순서와 확인 포인트를 볼 수 있습니다."
      >
        <div className="space-y-3 pb-2">
          <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3">
            <div className="text-[12px] font-semibold text-ios-text">모드 안내</div>
            <div className="mt-1 text-[11.5px] leading-5 text-ios-sub">
              기본 모드는 필수 입력 중심, 전문 모드는 프리셋 저장/더블체크/처방 목표 비교 같은 고급 기능까지 모두 제공합니다.
            </div>
          </div>
          <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-3">
            <div className="text-[12px] font-semibold text-ios-text">공통 사용 순서</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-ios-sep bg-white px-3 py-2 text-[11.5px] text-ios-text">
                <span className="font-semibold text-[color:var(--wnl-accent)]">STEP 1</span> 필수 입력값만 먼저 입력
              </div>
              <div className="rounded-xl border border-ios-sep bg-white px-3 py-2 text-[11.5px] text-ios-text">
                <span className="font-semibold text-[color:var(--wnl-accent)]">STEP 2</span> 계산 버튼 실행
              </div>
              <div className="rounded-xl border border-ios-sep bg-white px-3 py-2 text-[11.5px] text-ios-text">
                <span className="font-semibold text-[color:var(--wnl-accent)]">STEP 3</span> 결과 + 경고 + 단위 체크
              </div>
            </div>
          </div>
          {MODULE_ORDER.map((module) => {
            const guide = MODULE_GUIDE[module];
            const active = module === activeModule;
            return (
              <div
                key={module}
                className={`rounded-2xl border px-3 py-3 ${
                  active
                    ? "border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)]"
                    : "border-ios-sep bg-white"
                }`}
              >
                <div className="text-[13px] font-bold text-ios-text">{guide.title}</div>
                <div className="text-[11.5px] text-ios-sub">{guide.subtitle}</div>
                <div className="mt-2 space-y-1.5">
                  {guide.details.map((item) => (
                    <div key={`${module}-${item.title}`} className="text-[12px] leading-5 text-ios-text">
                      <span className="font-semibold">{item.title}:</span> {item.body}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-ios-sep bg-white px-2.5 py-1 text-[11px] font-semibold text-ios-text"
                  onClick={() => {
                    setActiveModule(module);
                    setGuideOpen(false);
                  }}
                >
                  이 계산기로 이동
                </button>
              </div>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedHistory && historyDetail)}
        onClose={() => setSelectedHistory(null)}
        title={historyDetail ? `${historyDetail.title} 상세` : "계산 상세"}
        subtitle={
          selectedHistory
            ? new Date(selectedHistory.timestamp).toLocaleString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : undefined
        }
      >
        {historyDetail ? (
          <div className="space-y-3 pb-2">
            <div className="rounded-2xl border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-sub">어떤 계산을 했나요?</div>
              <div className="mt-1 text-[13px] leading-5 text-ios-text">{historyDetail.headline}</div>
            </div>

            <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-sub">입력값</div>
              <div className="mt-2 space-y-1.5">
                {historyDetail.inputs.length ? (
                  historyDetail.inputs.slice(0, 10).map((entry) => (
                    <div key={`in-${entry.key}`} className="flex items-start justify-between gap-3 text-[12px]">
                      <div className="text-ios-sub">{entry.label}</div>
                      <div className="font-semibold text-ios-text">{entry.value}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] text-ios-sub">기록된 입력값이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-sub">결과값</div>
              <div className="mt-2 space-y-1.5">
                {historyDetail.outputs.length ? (
                  historyDetail.outputs.slice(0, 10).map((entry) => (
                    <div key={`out-${entry.key}`} className="flex items-start justify-between gap-3 text-[12px]">
                      <div className="text-ios-sub">{entry.label}</div>
                      <div className="font-semibold text-ios-text">{entry.value}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-[12px] text-ios-sub">기록된 결과값이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-sub">경고/안내</div>
              {historyDetail.warnings.length ? (
                <div className="mt-2 space-y-1.5">
                  {historyDetail.warnings.slice(0, 6).map((warning) => (
                    <div key={warning} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-700">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] text-emerald-700">
                  당시 저장된 주요 경고가 없었습니다.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </BottomSheet>

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
