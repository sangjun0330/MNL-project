export type AmountUnit = "mcg" | "mg" | "g" | "units" | "IU" | "mEq";
export type TimeUnit = "min" | "hr";
export type WeightUnit = "kg" | "lb";

export type WarningSeverity = "info" | "warning" | "critical";

export type CalcWarning = {
  code: string;
  severity: WarningSeverity;
  message: string;
};

export type CalcResult<T> =
  | { ok: true; data: T; warnings: CalcWarning[] }
  | { ok: false; errors: string[]; warnings: CalcWarning[] };

type UnitFamily = "mass" | "activity" | "electrolyte";

const UNIT_META: Record<AmountUnit, { family: UnitFamily; toBase: number }> = {
  mcg: { family: "mass", toBase: 1 },
  mg: { family: "mass", toBase: 1_000 },
  g: { family: "mass", toBase: 1_000_000 },
  units: { family: "activity", toBase: 1 },
  IU: { family: "activity", toBase: 1 },
  mEq: { family: "electrolyte", toBase: 1 },
};

const KNOWN_DRIP_FACTORS = new Set<number>([10, 15, 20, 60]);

type ConvertResult =
  | { ok: true; value: number; warnings: CalcWarning[] }
  | { ok: false; error: string; warnings: CalcWarning[] };

export type CalculatorPreset = {
  id: string;
  name: string;
  drug?: string;
  concentration: {
    amount: number;
    amountUnit: AmountUnit;
    volumeMl: number;
  };
  tags: string[];
};

export type CalcHistory = {
  timestamp: number;
  calcType:
    | "pump_forward"
    | "pump_reverse"
    | "ivpb"
    | "drip_forward"
    | "drip_reverse"
    | "dilution"
    | "dose_check";
  inputs: Record<string, string | number | boolean | null>;
  outputs: Record<string, string | number>;
  flags: {
    warnings: string[];
  };
};

export const DEFAULT_NURSE_PRESETS: CalculatorPreset[] = [
  {
    id: "preset-ne",
    name: "NE 표준농도",
    drug: "Norepinephrine",
    concentration: { amount: 4, amountUnit: "mg", volumeMl: 250 },
    tags: ["ICU", "ER"],
  },
  {
    id: "preset-insulin",
    name: "인슐린 표준",
    drug: "Regular insulin",
    concentration: { amount: 100, amountUnit: "units", volumeMl: 100 },
    tags: ["ICU", "Ward"],
  },
  {
    id: "preset-heparin",
    name: "헤파린 표준",
    drug: "Heparin",
    concentration: { amount: 25_000, amountUnit: "units", volumeMl: 500 },
    tags: ["ICU", "Ward"],
  },
  {
    id: "preset-dobutamine",
    name: "Dobutamine 표준",
    drug: "Dobutamine",
    concentration: { amount: 250, amountUnit: "mg", volumeMl: 250 },
    tags: ["ICU", "ER"],
  },
  {
    id: "preset-propofol",
    name: "Propofol 1%",
    drug: "Propofol",
    concentration: { amount: 1_000, amountUnit: "mg", volumeMl: 100 },
    tags: ["ICU", "OR"],
  },
];

function round(value: number, digits = 8) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

function parseAndValidatePositive(label: string, value: number, errors: string[]) {
  if (!Number.isFinite(value)) {
    errors.push(`${label} 값이 숫자가 아닙니다.`);
    return;
  }
  if (value <= 0) {
    errors.push(`${label} 값은 0보다 커야 합니다.`);
  }
}

function convertAmount(value: number, from: AmountUnit, to: AmountUnit): ConvertResult {
  const warnings: CalcWarning[] = [];
  const fromMeta = UNIT_META[from];
  const toMeta = UNIT_META[to];
  if (!fromMeta || !toMeta) {
    return {
      ok: false,
      error: `지원하지 않는 단위입니다. (${from} -> ${to})`,
      warnings,
    };
  }
  if (fromMeta.family !== toMeta.family) {
    return {
      ok: false,
      error: `단위 계열이 다릅니다. (${from} -> ${to})`,
      warnings,
    };
  }

  if ((from === "units" && to === "IU") || (from === "IU" && to === "units")) {
    warnings.push({
      code: "units_iu_equivalence",
      severity: "warning",
      message: "units와 IU는 약물별 정의가 다를 수 있어 기관 프로토콜을 확인하세요.",
    });
  }

  const base = value * fromMeta.toBase;
  const converted = base / toMeta.toBase;
  return {
    ok: true,
    value: converted,
    warnings,
  };
}

function ratioWarnings(current: number, previous: number | null | undefined, label: string): CalcWarning[] {
  if (!isPositiveFinite(current) || !isPositiveFinite(previous ?? NaN)) return [];
  const prev = Number(previous);
  const ratio = Math.max(current / prev, prev / current);
  if (ratio >= 100) {
    return [
      {
        code: `${label}_100x`,
        severity: "critical",
        message: `이전 값 대비 약 ${formatNumber(ratio, 0)}배 차이입니다. 100배 오류 가능성을 먼저 확인하세요.`,
      },
    ];
  }
  if (ratio >= 10) {
    return [
      {
        code: `${label}_10x`,
        severity: "warning",
        message: `이전 값 대비 약 ${formatNumber(ratio, 1)}배 차이입니다. 단위/농도를 다시 확인하세요.`,
      },
    ];
  }
  return [];
}

function rateBandWarnings(rateMlHr: number): CalcWarning[] {
  if (!isPositiveFinite(rateMlHr)) return [];
  if (rateMlHr > 300) {
    return [
      {
        code: "rate_extreme_high",
        severity: "critical",
        message: "계산된 속도가 300 mL/hr를 초과합니다. 단위/농도/채널을 즉시 재확인하세요.",
      },
    ];
  }
  if (rateMlHr > 120) {
    return [
      {
        code: "rate_high",
        severity: "warning",
        message: "계산된 속도가 높습니다(120 mL/hr 초과). 처방과 펌프 채널을 다시 확인하세요.",
      },
    ];
  }
  if (rateMlHr < 0.1) {
    return [
      {
        code: "rate_low",
        severity: "warning",
        message: "계산된 속도가 매우 낮습니다(0.1 mL/hr 미만). 소수점 자리와 단위를 확인하세요.",
      },
    ];
  }
  return [];
}

function mgMgcFactorWarning(from: AmountUnit, to: AmountUnit): CalcWarning[] {
  const fromMeta = UNIT_META[from];
  const toMeta = UNIT_META[to];
  if (fromMeta.family !== "mass" || toMeta.family !== "mass") return [];
  const factor = fromMeta.toBase / toMeta.toBase;
  if (factor >= 1_000 || factor <= 0.001) {
    return [
      {
        code: "mass_1000x",
        severity: "critical",
        message: "mg/mcg 또는 g/mg 변환이 포함됩니다. 10배/1000배 오류가 없는지 재확인하세요.",
      },
    ];
  }
  return [];
}

export function normalizeWeight(value: number, unit: WeightUnit) {
  if (!Number.isFinite(value)) return NaN;
  return unit === "lb" ? value * 0.45359237 : value;
}

export function formatNumber(value: number, maxFractionDigits = 3) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function sanitizeNumericInput(raw: string) {
  const cleaned = String(raw ?? "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const hasDot = cleaned.includes(".");
  const [headRaw, ...tail] = cleaned.split(".");
  const head = (headRaw || "0").replace(/^0+(?=\d)/, "");
  if (!hasDot) return head;

  const fraction = tail.join("").slice(0, 3);
  if (fraction.length === 0) return `${head}.`;
  return `${head}.${fraction}`;
}

export function parseNumericInput(raw: string) {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/,/g, ".");
  if (!normalized || normalized === ".") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function buildDoseUnitLabel(unit: AmountUnit, perKg: boolean, timeUnit: TimeUnit) {
  return `${unit}${perKg ? "/kg" : ""}/${timeUnit}`;
}

export type PumpForwardInput = {
  weightKg: number;
  targetDose: number;
  targetUnit: AmountUnit;
  targetTimeUnit: TimeUnit;
  targetPerKg: boolean;
  concentrationAmount: number;
  concentrationUnit: AmountUnit;
  concentrationVolumeMl: number;
  previousRateMlHr?: number | null;
};

export type PumpForwardOutput = {
  rateMlHr: number;
  verifyDose: number;
  concentrationPerMl: number;
  dosePerHour: number;
};

export function calculatePumpForward(input: PumpForwardInput): CalcResult<PumpForwardOutput> {
  const errors: string[] = [];
  const warnings: CalcWarning[] = [];

  parseAndValidatePositive("목표 용량", input.targetDose, errors);
  parseAndValidatePositive("농도 총 약량", input.concentrationAmount, errors);
  parseAndValidatePositive("농도 총 부피", input.concentrationVolumeMl, errors);
  if (input.targetPerKg) {
    parseAndValidatePositive("체중(kg)", input.weightKg, errors);
  }

  if (errors.length) return { ok: false, errors, warnings };

  const converted = convertAmount(input.concentrationAmount, input.concentrationUnit, input.targetUnit);
  warnings.push(...mgMgcFactorWarning(input.concentrationUnit, input.targetUnit));
  warnings.push(...converted.warnings);
  if (!converted.ok) {
    return {
      ok: false,
      errors: [converted.error],
      warnings,
    };
  }

  const concentrationPerMl = converted.value / input.concentrationVolumeMl;
  if (!isPositiveFinite(concentrationPerMl)) {
    return {
      ok: false,
      errors: ["농도 계산 결과가 비정상입니다. 총 약량/총 mL를 확인하세요."],
      warnings,
    };
  }

  const timeFactor = input.targetTimeUnit === "min" ? 60 : 1;
  const weightFactor = input.targetPerKg ? input.weightKg : 1;
  const dosePerHour = input.targetDose * weightFactor * timeFactor;
  const rateMlHr = dosePerHour / concentrationPerMl;
  const verifyDose = (rateMlHr * concentrationPerMl) / (weightFactor * timeFactor);

  warnings.push(...rateBandWarnings(rateMlHr));
  warnings.push(...ratioWarnings(rateMlHr, input.previousRateMlHr ?? null, "rate"));

  return {
    ok: true,
    data: {
      rateMlHr: round(rateMlHr),
      verifyDose: round(verifyDose),
      concentrationPerMl: round(concentrationPerMl),
      dosePerHour: round(dosePerHour),
    },
    warnings,
  };
}

export type PumpReverseInput = {
  weightKg: number;
  rateMlHr: number;
  outputUnit: AmountUnit;
  outputTimeUnit: TimeUnit;
  outputPerKg: boolean;
  concentrationAmount: number;
  concentrationUnit: AmountUnit;
  concentrationVolumeMl: number;
  previousDose?: number | null;
};

export type PumpReverseOutput = {
  dose: number;
  concentrationPerMl: number;
  totalDosePerHour: number;
};

export function calculatePumpReverse(input: PumpReverseInput): CalcResult<PumpReverseOutput> {
  const errors: string[] = [];
  const warnings: CalcWarning[] = [];

  parseAndValidatePositive("현재 속도(mL/hr)", input.rateMlHr, errors);
  parseAndValidatePositive("농도 총 약량", input.concentrationAmount, errors);
  parseAndValidatePositive("농도 총 부피", input.concentrationVolumeMl, errors);
  if (input.outputPerKg) {
    parseAndValidatePositive("체중(kg)", input.weightKg, errors);
  }
  if (errors.length) return { ok: false, errors, warnings };

  const converted = convertAmount(input.concentrationAmount, input.concentrationUnit, input.outputUnit);
  warnings.push(...mgMgcFactorWarning(input.concentrationUnit, input.outputUnit));
  warnings.push(...converted.warnings);
  if (!converted.ok) {
    return {
      ok: false,
      errors: [converted.error],
      warnings,
    };
  }

  const concentrationPerMl = converted.value / input.concentrationVolumeMl;
  if (!isPositiveFinite(concentrationPerMl)) {
    return {
      ok: false,
      errors: ["농도 계산 결과가 비정상입니다. 총 약량/총 mL를 확인하세요."],
      warnings,
    };
  }

  const totalDosePerHour = input.rateMlHr * concentrationPerMl;
  const timeFactor = input.outputTimeUnit === "min" ? 60 : 1;
  const weightFactor = input.outputPerKg ? input.weightKg : 1;
  const dose = totalDosePerHour / (timeFactor * weightFactor);

  warnings.push(...rateBandWarnings(input.rateMlHr));
  warnings.push(...ratioWarnings(dose, input.previousDose ?? null, "dose"));
  if (dose < 0.001) {
    warnings.push({
      code: "dose_very_low",
      severity: "warning",
      message: "역산 용량이 매우 작습니다. 소수점 위치를 다시 확인하세요.",
    });
  }
  if (dose > 100) {
    warnings.push({
      code: "dose_very_high",
      severity: "warning",
      message: "역산 용량이 매우 큽니다. 단위/농도/속도를 다시 확인하세요.",
    });
  }

  return {
    ok: true,
    data: {
      dose: round(dose),
      concentrationPerMl: round(concentrationPerMl),
      totalDosePerHour: round(totalDosePerHour),
    },
    warnings,
  };
}

export type IvpbInput = {
  totalVolumeMl: number;
  duration: number;
  durationUnit: TimeUnit;
  previousRateMlHr?: number | null;
};

export type IvpbOutput = {
  rateMlHr: number;
  vtbiMl: number;
  durationMinutes: number;
};

export function calculateIvpb(input: IvpbInput): CalcResult<IvpbOutput> {
  const errors: string[] = [];
  const warnings: CalcWarning[] = [];

  parseAndValidatePositive("총 부피(mL)", input.totalVolumeMl, errors);
  parseAndValidatePositive("주입 시간", input.duration, errors);
  if (errors.length) return { ok: false, errors, warnings };

  const durationMinutes = input.durationUnit === "min" ? input.duration : input.duration * 60;
  const durationHours = durationMinutes / 60;
  const rateMlHr = input.totalVolumeMl / durationHours;

  warnings.push(...ratioWarnings(rateMlHr, input.previousRateMlHr ?? null, "ivpb_rate"));
  warnings.push(...rateBandWarnings(rateMlHr));

  if (durationMinutes < 15) {
    warnings.push({
      code: "ivpb_short_duration",
      severity: "warning",
      message: "주입 시간이 짧습니다(15분 미만). 처방 시간 범위를 다시 확인하세요.",
    });
  }
  if (durationMinutes > 240) {
    warnings.push({
      code: "ivpb_long_duration",
      severity: "warning",
      message: "주입 시간이 깁니다(4시간 초과). 처방 의도를 다시 확인하세요.",
    });
  }

  return {
    ok: true,
    data: {
      rateMlHr: round(rateMlHr),
      vtbiMl: round(input.totalVolumeMl),
      durationMinutes: round(durationMinutes),
    },
    warnings,
  };
}

export type DripForwardInput = {
  mlHr: number;
  dripFactor: number;
  previousGttPerMin?: number | null;
};

export type DripForwardOutput = {
  gttPerMin: number;
  roundedGttPerMin: number;
};

export function calculateDripForward(input: DripForwardInput): CalcResult<DripForwardOutput> {
  const errors: string[] = [];
  const warnings: CalcWarning[] = [];

  parseAndValidatePositive("목표 속도(mL/hr)", input.mlHr, errors);
  parseAndValidatePositive("드립 팩터(gtt/mL)", input.dripFactor, errors);
  if (errors.length) return { ok: false, errors, warnings };

  if (!KNOWN_DRIP_FACTORS.has(input.dripFactor)) {
    warnings.push({
      code: "unknown_drip_factor",
      severity: "warning",
      message: "일반적인 드립 팩터(10/15/20/60)가 아닙니다. 세트 라벨을 재확인하세요.",
    });
  }

  const gttPerMin = (input.mlHr * input.dripFactor) / 60;
  warnings.push(...ratioWarnings(gttPerMin, input.previousGttPerMin ?? null, "drip_gtt"));
  if (gttPerMin > 250) {
    warnings.push({
      code: "drip_fast",
      severity: "warning",
      message: "방울 속도가 매우 빠릅니다. 펌프 사용 가능 여부를 검토하세요.",
    });
  }

  return {
    ok: true,
    data: {
      gttPerMin: round(gttPerMin),
      roundedGttPerMin: Math.max(1, Math.round(gttPerMin)),
    },
    warnings,
  };
}

export type DripReverseInput = {
  gttPerMin: number;
  dripFactor: number;
  previousMlHr?: number | null;
};

export type DripReverseOutput = {
  mlHr: number;
};

export function calculateDripReverse(input: DripReverseInput): CalcResult<DripReverseOutput> {
  const errors: string[] = [];
  const warnings: CalcWarning[] = [];

  parseAndValidatePositive("현재 방울수(gtt/min)", input.gttPerMin, errors);
  parseAndValidatePositive("드립 팩터(gtt/mL)", input.dripFactor, errors);
  if (errors.length) return { ok: false, errors, warnings };

  if (!KNOWN_DRIP_FACTORS.has(input.dripFactor)) {
    warnings.push({
      code: "unknown_drip_factor",
      severity: "warning",
      message: "일반적인 드립 팩터(10/15/20/60)가 아닙니다. 세트 라벨을 재확인하세요.",
    });
  }

  const mlHr = (input.gttPerMin * 60) / input.dripFactor;
  warnings.push(...ratioWarnings(mlHr, input.previousMlHr ?? null, "drip_rate"));
  warnings.push(...rateBandWarnings(mlHr));

  return {
    ok: true,
    data: { mlHr: round(mlHr) },
    warnings,
  };
}

export type ConcentrationInput = {
  totalAmount: number;
  amountUnit: AmountUnit;
  totalVolumeMl: number;
  outputUnit: AmountUnit;
  previousConcentration?: number | null;
};

export type ConcentrationOutput = {
  concentrationPerMl: number;
};

export function calculateConcentration(input: ConcentrationInput): CalcResult<ConcentrationOutput> {
  const errors: string[] = [];
  const warnings: CalcWarning[] = [];

  parseAndValidatePositive("총 약량", input.totalAmount, errors);
  parseAndValidatePositive("총 부피(mL)", input.totalVolumeMl, errors);
  if (errors.length) return { ok: false, errors, warnings };

  const converted = convertAmount(input.totalAmount, input.amountUnit, input.outputUnit);
  warnings.push(...mgMgcFactorWarning(input.amountUnit, input.outputUnit));
  warnings.push(...converted.warnings);
  if (!converted.ok) {
    return { ok: false, errors: [converted.error], warnings };
  }

  const concentrationPerMl = converted.value / input.totalVolumeMl;
  warnings.push(...ratioWarnings(concentrationPerMl, input.previousConcentration ?? null, "concentration"));
  if (concentrationPerMl > 1_000) {
    warnings.push({
      code: "concentration_high",
      severity: "critical",
      message: "농도가 매우 높습니다. 총 약량/총 mL를 반드시 재확인하세요.",
    });
  }

  return {
    ok: true,
    data: {
      concentrationPerMl: round(concentrationPerMl),
    },
    warnings,
  };
}

export type DoseCheckInput = {
  weightKg: number;
  useWeight: boolean;
  pumpRateMlHr: number;
  concentrationAmount: number;
  concentrationUnit: AmountUnit;
  concentrationVolumeMl: number;
  outputUnit: AmountUnit;
  outputTimeUnit: TimeUnit;
  prescribedTargetDose?: number | null;
  previousActualDose?: number | null;
};

export type DoseCheckOutput = {
  actualDose: number;
  totalDosePerHour: number;
  differencePercent: number | null;
};

export function calculateDoseCheck(input: DoseCheckInput): CalcResult<DoseCheckOutput> {
  const reverse = calculatePumpReverse({
    weightKg: input.weightKg,
    rateMlHr: input.pumpRateMlHr,
    outputUnit: input.outputUnit,
    outputTimeUnit: input.outputTimeUnit,
    outputPerKg: input.useWeight,
    concentrationAmount: input.concentrationAmount,
    concentrationUnit: input.concentrationUnit,
    concentrationVolumeMl: input.concentrationVolumeMl,
    previousDose: input.previousActualDose,
  });

  if (!reverse.ok) return reverse;

  const warnings = [...reverse.warnings];
  let differencePercent: number | null = null;
  const prescribed = input.prescribedTargetDose;
  if (isPositiveFinite(prescribed ?? NaN)) {
    differencePercent = ((reverse.data.dose - Number(prescribed)) / Number(prescribed)) * 100;
    const absDiff = Math.abs(differencePercent);
    if (absDiff >= 50) {
      warnings.push({
        code: "dose_diff_critical",
        severity: "critical",
        message: "처방 대비 차이가 50% 이상입니다. 단위/농도/채널/라인을 즉시 재확인하세요.",
      });
    } else if (absDiff >= 20) {
      warnings.push({
        code: "dose_diff_warning",
        severity: "warning",
        message: "처방 대비 차이가 20% 이상입니다. 인계 전 더블체크를 권장합니다.",
      });
    }
  }

  return {
    ok: true,
    data: {
      actualDose: reverse.data.dose,
      totalDosePerHour: reverse.data.totalDosePerHour,
      differencePercent: differencePercent == null ? null : round(differencePercent, 4),
    },
    warnings,
  };
}
