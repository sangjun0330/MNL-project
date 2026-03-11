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

// ────────────────────────────────────────────────────
// GCS (Glasgow Coma Scale)
// ────────────────────────────────────────────────────

export type GCSInput = { eye: number; verbal: number; motor: number };
export type GCSSeverity = "mild" | "moderate" | "severe";
export type GCSOutput = { total: number; severity: GCSSeverity };

export function calculateGCS(input: GCSInput): CalcResult<GCSOutput> {
  const { eye, verbal, motor } = input;
  const warnings: CalcWarning[] = [];
  if (eye < 1 || eye > 4) return { ok: false, errors: ["눈 반응(E)은 1~4 사이여야 합니다."], warnings };
  if (verbal < 1 || verbal > 5) return { ok: false, errors: ["언어 반응(V)은 1~5 사이여야 합니다."], warnings };
  if (motor < 1 || motor > 6) return { ok: false, errors: ["운동 반응(M)은 1~6 사이여야 합니다."], warnings };
  const total = eye + verbal + motor;
  const severity: GCSSeverity = total >= 13 ? "mild" : total >= 9 ? "moderate" : "severe";
  if (total <= 8) warnings.push({ code: "gcs_severe", severity: "critical", message: "GCS ≤ 8: 기도 확보 및 즉시 의사 보고가 필요합니다." });
  else if (total <= 12) warnings.push({ code: "gcs_moderate", severity: "warning", message: "GCS 9-12: 의식 저하 상태로 집중 모니터링이 필요합니다." });
  return { ok: true, data: { total, severity }, warnings };
}

// ────────────────────────────────────────────────────
// BMI (Body Mass Index)
// ────────────────────────────────────────────────────

export type BMICategoryKey = "underweight" | "normal" | "overweight" | "obese" | "obese2" | "obese3";
export type BMIOutput = { bmi: number; categoryKey: BMICategoryKey };

export function calculateBMI(weightKg: number, heightCm: number, asianCutoffs = true): CalcResult<BMIOutput> {
  const warnings: CalcWarning[] = [];
  if (weightKg <= 0 || heightCm <= 0) return { ok: false, errors: ["체중과 신장을 올바르게 입력해주세요."], warnings };
  if (heightCm < 50 || heightCm > 250) warnings.push({ code: "bmi_height_range", severity: "info", message: "신장 입력값을 확인해주세요." });
  const heightM = heightCm / 100;
  const bmi = round(weightKg / (heightM * heightM), 1);
  let categoryKey: BMICategoryKey;
  if (asianCutoffs) {
    if (bmi < 18.5) categoryKey = "underweight";
    else if (bmi < 23) categoryKey = "normal";
    else if (bmi < 25) categoryKey = "overweight";
    else if (bmi < 30) categoryKey = "obese";
    else if (bmi < 35) categoryKey = "obese2";
    else categoryKey = "obese3";
  } else {
    if (bmi < 18.5) categoryKey = "underweight";
    else if (bmi < 25) categoryKey = "normal";
    else if (bmi < 30) categoryKey = "overweight";
    else if (bmi < 35) categoryKey = "obese";
    else if (bmi < 40) categoryKey = "obese2";
    else categoryKey = "obese3";
  }
  return { ok: true, data: { bmi, categoryKey }, warnings };
}

// ────────────────────────────────────────────────────
// BSA (Body Surface Area)
// ────────────────────────────────────────────────────

export type BSAFormula = "dubois" | "mosteller";
export type BSAOutput = { bsaM2: number; formulaUsed: BSAFormula };

export function calculateBSA(weightKg: number, heightCm: number, formula: BSAFormula = "mosteller"): CalcResult<BSAOutput> {
  const warnings: CalcWarning[] = [];
  if (weightKg <= 0 || heightCm <= 0) return { ok: false, errors: ["체중과 신장을 올바르게 입력해주세요."], warnings };
  let bsa: number;
  if (formula === "dubois") {
    bsa = 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
  } else {
    bsa = Math.sqrt((heightCm * weightKg) / 3600);
  }
  bsa = round(bsa, 2);
  if (bsa > 2.5) warnings.push({ code: "bsa_high", severity: "info", message: "BSA가 2.5 m²를 초과합니다. 입력값을 확인해주세요." });
  if (bsa < 0.5) warnings.push({ code: "bsa_low", severity: "info", message: "BSA가 0.5 m² 미만입니다. 입력값을 확인해주세요." });
  return { ok: true, data: { bsaM2: bsa, formulaUsed: formula }, warnings };
}

// ────────────────────────────────────────────────────
// CrCl (Creatinine Clearance — Cockcroft-Gault)
// ────────────────────────────────────────────────────

export type RenalStageKey = "normal" | "mild" | "moderate" | "severe" | "failure";
export type CrClOutput = { crclMlMin: number; renalStageKey: RenalStageKey };

export function calculateCrCl(age: number, weightKg: number, serumCr: number, isFemale: boolean): CalcResult<CrClOutput> {
  const warnings: CalcWarning[] = [];
  if (age <= 0 || age > 130) return { ok: false, errors: ["나이를 올바르게 입력해주세요."], warnings };
  if (weightKg <= 0) return { ok: false, errors: ["체중을 올바르게 입력해주세요."], warnings };
  if (serumCr <= 0) return { ok: false, errors: ["혈청 크레아티닌을 올바르게 입력해주세요."], warnings };
  let crcl = ((140 - age) * weightKg) / (72 * serumCr);
  if (isFemale) crcl *= 0.85;
  crcl = round(crcl, 1);
  let renalStageKey: RenalStageKey;
  if (crcl >= 90) renalStageKey = "normal";
  else if (crcl >= 60) renalStageKey = "mild";
  else if (crcl >= 30) renalStageKey = "moderate";
  else if (crcl >= 15) renalStageKey = "severe";
  else renalStageKey = "failure";
  if (renalStageKey === "severe" || renalStageKey === "failure")
    warnings.push({ code: "crcl_low", severity: "critical", message: "신기능 저하: 용량 조절이 필요할 수 있습니다. 처방의에게 확인하세요." });
  else if (renalStageKey === "moderate")
    warnings.push({ code: "crcl_moderate", severity: "warning", message: "중등도 신기능 저하: 일부 약물의 용량 조절이 필요할 수 있습니다." });
  return { ok: true, data: { crclMlMin: crcl, renalStageKey }, warnings };
}

// ────────────────────────────────────────────────────
// Unit Converter (Temperature, Weight, Length, Mass, Volume)
// ────────────────────────────────────────────────────

export type UnitCategory = "temperature" | "weight" | "length" | "mass" | "volume";

const UNIT_CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  "temperature:°C:°F": { convert: (v) => v * 9 / 5 + 32 },
  "temperature:°F:°C": { convert: (v) => (v - 32) * 5 / 9 },
  "weight:kg:lb": { convert: (v) => v * 2.20462 },
  "weight:lb:kg": { convert: (v) => v * 0.453592 },
  "length:cm:in": { convert: (v) => v / 2.54 },
  "length:in:cm": { convert: (v) => v * 2.54 },
  "mass:g:mg": { convert: (v) => v * 1000 },
  "mass:mg:g": { convert: (v) => v / 1000 },
  "mass:mg:mcg": { convert: (v) => v * 1000 },
  "mass:mcg:mg": { convert: (v) => v / 1000 },
  "mass:g:mcg": { convert: (v) => v * 1_000_000 },
  "mass:mcg:g": { convert: (v) => v / 1_000_000 },
  "volume:L:mL": { convert: (v) => v * 1000 },
  "volume:mL:L": { convert: (v) => v / 1000 },
};

export type UnitConversionOutput = { result: number; fromUnit: string; toUnit: string };

export function convertMedicalUnit(category: UnitCategory, value: number, fromUnit: string, toUnit: string): CalcResult<UnitConversionOutput> {
  const warnings: CalcWarning[] = [];
  if (fromUnit === toUnit) return { ok: true, data: { result: value, fromUnit, toUnit }, warnings };
  const key = `${category}:${fromUnit}:${toUnit}`;
  const entry = UNIT_CONVERSIONS[key];
  if (!entry) return { ok: false, errors: [`${fromUnit} → ${toUnit} 변환을 지원하지 않습니다.`], warnings };
  const result = round(entry.convert(value), 4);
  return { ok: true, data: { result, fromUnit, toUnit }, warnings };
}

export const UNIT_OPTIONS: Record<UnitCategory, string[]> = {
  temperature: ["°C", "°F"],
  weight: ["kg", "lb"],
  length: ["cm", "in"],
  mass: ["g", "mg", "mcg"],
  volume: ["L", "mL"],
};

// ────────────────────────────────────────────────────
// Fluid Balance (I/O)
// ────────────────────────────────────────────────────

export type FluidEntry = { label: string; amountMl: number };
export type FluidBalanceOutput = { totalIntakeMl: number; totalOutputMl: number; netBalanceMl: number };

export function calculateFluidBalance(intake: FluidEntry[], output: FluidEntry[], insensibleLossMl = 500): CalcResult<FluidBalanceOutput> {
  const warnings: CalcWarning[] = [];
  const totalIntakeMl = round(intake.reduce((s, e) => s + Math.max(0, e.amountMl), 0), 0);
  const totalOutputMl = round(output.reduce((s, e) => s + Math.max(0, e.amountMl), 0) + Math.max(0, insensibleLossMl), 0);
  const netBalanceMl = totalIntakeMl - totalOutputMl;
  if (netBalanceMl > 1000) warnings.push({ code: "fluid_positive", severity: "warning", message: "수분 균형이 +1,000 mL 이상입니다. 과수분 위험을 확인하세요." });
  if (netBalanceMl < -500) warnings.push({ code: "fluid_negative", severity: "warning", message: "수분 균형이 -500 mL 이하입니다. 탈수 위험을 확인하세요." });
  return { ok: true, data: { totalIntakeMl, totalOutputMl, netBalanceMl }, warnings };
}

// ────────────────────────────────────────────────────
// Pediatric Dose Calculator
// ────────────────────────────────────────────────────

export type PediatricDoseOutput = {
  singleDose: number;
  dailyDose: number;
  appliedSingleDose: number;
  appliedDailyDose: number;
  singleCapped: boolean;
  dailyCapped: boolean;
};

export function calculatePediatricDose(
  weightKg: number,
  dosePerKg: number,
  frequency: number,
  maxSingleDose?: number | null,
  maxDailyDose?: number | null,
): CalcResult<PediatricDoseOutput> {
  const warnings: CalcWarning[] = [];
  if (weightKg <= 0) return { ok: false, errors: ["체중을 올바르게 입력해주세요."], warnings };
  if (dosePerKg <= 0) return { ok: false, errors: ["체중당 용량을 올바르게 입력해주세요."], warnings };
  if (frequency <= 0) return { ok: false, errors: ["투여 횟수를 올바르게 입력해주세요."], warnings };
  if (weightKg > 150) warnings.push({ code: "peds_weight_high", severity: "info", message: "체중이 150 kg을 초과합니다. 소아 계산이 적절한지 확인하세요." });
  const singleDose = round(dosePerKg * weightKg, 2);
  const dailyDose = round(singleDose * frequency, 2);
  let appliedSingleDose = singleDose;
  let appliedDailyDose = dailyDose;
  let singleCapped = false;
  let dailyCapped = false;
  if (maxSingleDose != null && maxSingleDose > 0 && singleDose > maxSingleDose) {
    appliedSingleDose = maxSingleDose;
    singleCapped = true;
    warnings.push({ code: "peds_single_cap", severity: "warning", message: `1회 최대 용량(${maxSingleDose})을 초과하여 상한 적용됩니다.` });
    appliedDailyDose = round(appliedSingleDose * frequency, 2);
  }
  if (maxDailyDose != null && maxDailyDose > 0 && appliedDailyDose > maxDailyDose) {
    appliedDailyDose = maxDailyDose;
    dailyCapped = true;
    warnings.push({ code: "peds_daily_cap", severity: "warning", message: `일일 최대 용량(${maxDailyDose})을 초과하여 상한 적용됩니다.` });
  }
  return { ok: true, data: { singleDose, dailyDose, appliedSingleDose, appliedDailyDose, singleCapped, dailyCapped }, warnings };
}
