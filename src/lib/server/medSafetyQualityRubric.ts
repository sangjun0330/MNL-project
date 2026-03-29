import type {
  MedSafetyAtomicQualityCheckId,
  MedSafetyInternalDecision,
  MedSafetyPromptBlueprint,
  MedSafetyPromptPackId,
  MedSafetyQualityDecision,
  MedSafetyQualityProfile,
  MedSafetyQualityScores,
  MedSafetyRepairIssueFamily,
} from "@/lib/server/medSafetyTypes";
import {
  MED_SAFETY_ATOMIC_QUALITY_CHECK_IDS,
  MED_SAFETY_CRITICAL_REPAIR_ISSUE_FAMILIES,
  MED_SAFETY_QUALITY_SCORE_AXES,
  MED_SAFETY_REPAIR_ISSUE_FAMILIES,
} from "@/lib/server/medSafetyTypes";
import { FILLER_PATTERNS, normalizeText } from "@/lib/server/medSafetySignalLexicon";

type AtomicCheckResult = {
  id: MedSafetyAtomicQualityCheckId;
  passed: boolean;
};

const DUPLICATE_LINE_EXEMPT_PATTERNS = [/^핵심 판단$/i, /^지금 할 일$/i, /^즉시 보고 신호$/i, /^주치의 노티 포인트$/i];
const UNSUPPORTED_SPECIFICITY_PATTERNS = [
  /제조사별\s*세팅/i,
  /모델별\s*세팅/i,
  /기관마다\s*다르지만\s*\d/i,
  /\b\d+\s*(?:mmhg|psi|l\/min|fr|gauge)\b/i,
];

function buildEmptyScores(): MedSafetyQualityScores {
  return {
    directness: 0,
    bedside_utility: 0,
    reporting_utility: 0,
    exception_quality: 0,
    safety_guardrails: 0,
  };
}

function sanitizeIssueFamily(value: unknown) {
  const text = String(value ?? "").trim();
  return (MED_SAFETY_REPAIR_ISSUE_FAMILIES.find((item) => item === text) ?? null) as MedSafetyRepairIssueFamily | null;
}

function parseIssueFamilies(raw: string) {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((item) => sanitizeIssueFamily(item))
        .filter((item): item is MedSafetyRepairIssueFamily => Boolean(item))
    )
  );
}

function hasPack(blueprint: MedSafetyPromptBlueprint | null | undefined, pack: MedSafetyPromptPackId) {
  if (!blueprint) return false;
  return blueprint.packPlan.visiblePacks.includes(pack);
}

function countDuplicateLines(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  let duplicates = 0;
  for (const line of lines) {
    if (DUPLICATE_LINE_EXEMPT_PATTERNS.some((pattern) => pattern.test(line))) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function extractTopWindow(text: string, size = 6) {
  return normalizeText(text)
    .split("\n")
    .slice(0, size)
    .join("\n");
}

function hasDirectAnswerNearTop(text: string) {
  const top = extractTopWindow(text, 5);
  return /(우선|먼저|지금은|가장|보통|맞습니다|아닙니다|권장|필요|중요)/i.test(top);
}

function hasImmediateActionNearTop(text: string) {
  const top = extractTopWindow(text, 8);
  return /(중단|멈추|즉시|바로|확인|보고|호출|clamp|산소|분리)/i.test(top);
}

function hasCardStructure(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let headings = 0;
  let bulletLines = 0;
  let narrativeLines = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    if (!line) continue;
    if (/^[-*•·]\s+/.test(line)) {
      bulletLines += 1;
      continue;
    }
    if (/[.。!?？！]$/.test(line)) narrativeLines += 1;
    if (!next || /^[-*•·]\s+/.test(line) || /^[-*•·]\s+/.test(next)) continue;
    if (line.length <= 24 && !/[.。!?？！]$/.test(line)) headings += 1;
  }
  // Narrative answers may use either one clear section heading or a conclusion
  // followed by compact lead+bullet structure without rigid card labels.
  return headings >= 1 || (narrativeLines >= 2 && bulletLines >= 2);
}

function includesProtocolCaveat(text: string) {
  return /(기관 프로토콜|기관 기준|약제부|제조사|ifu|pharmacy|manufacturer)/i.test(text);
}

function includesRiskySpecificity(text: string) {
  return /(\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|mL|ml|cc|units?|u|amp|vial|mEq|mmol|gtt\/min|drops?\/min|ml\/hr|cc\/hr|L\/min|l\/min|psi|mmhg|fr|gauge)\b)|(희석[^\n]{0,18}\d)|(속도[^\n]{0,18}\d)|(세팅[^\n]{0,18}\d)/i.test(
    text
  );
}

function hasBedsideDomainCoverage(text: string) {
  const normalized = normalizeText(text);
  const hits = [
    /(waveform|비동기|flow|auto-?peep|double triggering)/i.test(normalized),
    /(ett|튜브\s*위치|cuff|회로|circuit|leak|kink|water trap)/i.test(normalized),
    /(분비물|suction|obstruction|막힘)/i.test(normalized),
    /(sampling|채혈\s*오류|artifact|체위\s*변화|직전\s*suction)/i.test(normalized),
    /(spo2|산소화|pao2|fio2|peep|호흡음|patient-ventilator|혈압|의식)/i.test(normalized),
  ].filter(Boolean).length;
  return hits >= 2 && /(확인|재확인|점검|check)/i.test(normalized);
}

function hasReversibleCauseCoverage(text: string) {
  return /(분비물|회로|circuit|tube|ett|누출|leak|kink|obstruction|cuff|water trap|기흉|무기폐|position)/i.test(text);
}

function hasFalseWorseningExclusion(text: string) {
  return /(채혈\s*오류|sampling|measurement|직전 suction|체위\s*변화|artifact|가짜\s*악화|동맥\s*채혈)/i.test(text);
}

function hasNotifyPayload(text: string) {
  const normalized = normalizeText(text);
  const hits = [
    /(mode|setting|세팅|현재.*mode|현재.*setting)/i.test(normalized),
    /(abga|pco2|po2|fio2|peep|spo2|vte|pf ratio|p\/f)/i.test(normalized),
    /(환자 상태|자발호흡|비동기|혈압|의식|산소화|호흡성 산증)/i.test(normalized),
    /(확인.*분비물|회로|튜브|reversible|이미 확인)/i.test(normalized),
    /(추가 지시|확인 부탁|의사결정|검토 부탁|노티)/i.test(normalized),
  ].filter(Boolean).length;
  return hits >= 3;
}

function hasNotifyScript(text: string) {
  return /(“.*”|".*"|예시|다음처럼|보고하면|노티 문장|이렇게 말씀)/i.test(text);
}

function hasExceptionBoundary(text: string) {
  return /(다만|반대로|하지만|예외|언제는|조건부로)/i.test(text);
}

function hasMeasurementGuard(text: string) {
  return /(pbw|predicted body weight|plateau|driving pressure|actual rr|repeat abga|exact drug|exact device|정확한 명칭|추이|trend)/i.test(
    text
  );
}

function hasPairedProblemSeparation(text: string) {
  return /(산소화|hypox|pao2|fio2|peep).*(환기|co2|paco2|rr)|(환기|co2|paco2|rr).*(산소화|pao2|fio2|peep)/i.test(text);
}

function hasForbiddenFollowup(text: string, decision: MedSafetyInternalDecision) {
  if (decision.entityClarity !== "high" || decision.risk === "high" || decision.reportingNeed) return false;
  const tail = normalizeText(text)
    .split("\n")
    .slice(-4)
    .join("\n");
  return /(원하시면|원하면|추가로 정리|더 자세히|I can also|if you want)/i.test(tail);
}

function isOverlongAnswer(text: string, decision: MedSafetyInternalDecision) {
  const length = normalizeText(text).length;
  if (decision.answerDepth === "short") return length > 700;
  if (decision.risk === "high" || decision.answerDepth === "detailed") return length > 1800;
  return length > 1400;
}

function scoreFromBoolean(value: boolean, pass = 3, fail = 0) {
  return value ? pass : fail;
}

function buildAtomicChecks(
  answer: string,
  decision: MedSafetyInternalDecision,
  blueprint?: MedSafetyPromptBlueprint | null
): AtomicCheckResult[] {
  const normalized = normalizeText(answer);
  const checks: AtomicCheckResult[] = [
    { id: "direct_answer_top", passed: hasDirectAnswerNearTop(normalized) },
    {
      id: "immediate_action_top",
      passed: decision.priorityMode === "balanced" ? true : hasImmediateActionNearTop(normalized),
    },
    { id: "card_structure", passed: decision.format === "short" ? true : hasCardStructure(normalized) },
    {
      id: "bedside_domain_coverage",
      passed: hasPack(blueprint, "bedside_pack") ? hasBedsideDomainCoverage(normalized) : true,
    },
    {
      id: "reversible_cause_coverage",
      passed: decision.reversibleCauseNeed ? hasReversibleCauseCoverage(normalized) : true,
    },
    {
      id: "false_worsening_exclusion",
      passed: decision.falseWorseningNeed ? hasFalseWorseningExclusion(normalized) : true,
    },
    {
      id: "notify_payload_complete",
      passed: decision.reportingNeed ? hasNotifyPayload(normalized) : true,
    },
    {
      id: "notify_script_useful",
      passed: decision.communicationProfile === "script" ? hasNotifyScript(normalized) : true,
    },
    {
      id: "exception_boundary_quality",
      passed: decision.exceptionProfile !== "none" ? hasExceptionBoundary(normalized) : true,
    },
    {
      id: "measurement_guard_quality",
      passed: decision.measurementGuardNeed ? hasMeasurementGuard(normalized) : true,
    },
    {
      id: "paired_problem_separation",
      passed: decision.pairedProblemNeed ? hasPairedProblemSeparation(normalized) : true,
    },
    {
      id: "protocol_caveat_presence",
      passed: decision.protocolCaveatNeed ? includesProtocolCaveat(normalized) : true,
    },
    {
      id: "unsafe_specificity",
      passed: !includesRiskySpecificity(normalized) || includesProtocolCaveat(normalized),
    },
    {
      id: "repetition_density",
      passed: countDuplicateLines(normalized) < 2 && !FILLER_PATTERNS.some((pattern) => pattern.test(normalized)),
    },
    { id: "verbosity_overshoot", passed: !isOverlongAnswer(normalized, decision) },
    { id: "forbidden_followup", passed: !hasForbiddenFollowup(normalized, decision) },
  ];

  return checks.filter((check) => (MED_SAFETY_ATOMIC_QUALITY_CHECK_IDS as readonly string[]).includes(check.id));
}

function mapAtomicFailuresToFamilies(failed: MedSafetyAtomicQualityCheckId[], decision: MedSafetyInternalDecision): MedSafetyRepairIssueFamily[] {
  const families = new Set<MedSafetyRepairIssueFamily>();

  if (failed.includes("direct_answer_top") || failed.includes("immediate_action_top")) families.add("action_gap");
  if (
    failed.includes("bedside_domain_coverage") ||
    failed.includes("reversible_cause_coverage") ||
    failed.includes("false_worsening_exclusion")
  ) {
    families.add("bedside_gap");
  }
  if (failed.includes("notify_payload_complete") || failed.includes("notify_script_useful")) families.add("notify_gap");
  if (
    failed.includes("exception_boundary_quality") ||
    failed.includes("measurement_guard_quality") ||
    failed.includes("paired_problem_separation")
  ) {
    families.add("exception_gap");
  }
  if (failed.includes("unsafe_specificity") || failed.includes("protocol_caveat_presence")) families.add("safety_gap");
  if (failed.includes("card_structure")) families.add("structure_gap");
  if (failed.includes("repetition_density") || failed.includes("verbosity_overshoot") || failed.includes("forbidden_followup")) {
    families.add("verbosity_gap");
  }

  if ((decision.priorityMode !== "balanced" || decision.risk === "high") && !families.has("action_gap") && failed.includes("direct_answer_top")) {
    families.add("action_gap");
  }

  return Array.from(families);
}

function buildQualityProfile(
  answer: string,
  decision: MedSafetyInternalDecision,
  blueprint?: MedSafetyPromptBlueprint | null
): MedSafetyQualityProfile {
  const atomicChecks = buildAtomicChecks(answer, decision, blueprint);
  const atomicFailures = atomicChecks.filter((check) => !check.passed).map((check) => check.id);
  return {
    atomicFailures,
    issueFamilies: mapAtomicFailuresToFamilies(atomicFailures, decision),
  };
}

export function buildHeuristicQualityDecision(
  answer: string,
  decision: MedSafetyInternalDecision,
  blueprint?: MedSafetyPromptBlueprint | null
): MedSafetyQualityDecision {
  const profile = buildQualityProfile(answer, decision, blueprint);
  const normalized = normalizeText(answer);
  const scores = buildEmptyScores();

  scores.directness = scoreFromBoolean(!profile.atomicFailures.includes("direct_answer_top"), 3, 1);
  scores.bedside_utility =
    hasPack(blueprint, "bedside_pack")
      ? !(["bedside_domain_coverage", "reversible_cause_coverage", "false_worsening_exclusion"] as const).some((issue) =>
          profile.atomicFailures.includes(issue)
        )
        ? 3
        : hasImmediateActionNearTop(normalized)
          ? 1
          : 0
      : 3;
  scores.reporting_utility =
    decision.reportingNeed
      ? !(["notify_payload_complete", "notify_script_useful"] as const).some((issue) => profile.atomicFailures.includes(issue))
        ? 3
        : profile.atomicFailures.includes("notify_payload_complete")
          ? 0
          : 1
      : 3;
  scores.exception_quality =
    decision.exceptionProfile !== "none" || decision.pairedProblemNeed || decision.measurementGuardNeed
      ? !(["exception_boundary_quality", "measurement_guard_quality", "paired_problem_separation"] as const).some((issue) =>
          profile.atomicFailures.includes(issue)
        )
        ? 3
        : 0
      : 3;
  scores.safety_guardrails =
    !(["unsafe_specificity", "protocol_caveat_presence"] as const).some((issue) => profile.atomicFailures.includes(issue))
      ? 3
      : 0;

  if (!profile.issueFamilies.length) {
    return {
      verdict: "pass",
      repairInstructions: "",
      issues: [],
      criticalIssues: [],
      scores,
      profile,
    };
  }

  const verboseOnly = profile.issueFamilies.every((issue) => issue === "verbosity_gap");
  const criticalIssues = profile.issueFamilies.filter((issue) =>
    (MED_SAFETY_CRITICAL_REPAIR_ISSUE_FAMILIES as readonly string[]).includes(issue)
  );

  return {
    verdict: verboseOnly ? "pass_but_verbose" : "repair_required",
    repairInstructions: profile.issueFamilies.join(","),
    issues: profile.issueFamilies,
    criticalIssues,
    scores,
    profile,
  };
}

export function buildQualityGateDeveloperPrompt() {
  return [
    "You are a strict QA reviewer for nurse-facing clinical answers.",
    "Return JSON only.",
    'Allowed JSON: {"verdict":"pass|repair_required|pass_but_verbose","repairInstructions":"comma-separated issue families","issues":["issue_family"],"criticalIssues":["issue_family"],"scores":{"directness":0,"bedside_utility":0,"reporting_utility":0,"exception_quality":0,"safety_guardrails":0}}',
    "Allowed issue families:",
    MED_SAFETY_REPAIR_ISSUE_FAMILIES.map((code) => `- ${code}`).join("\n"),
    "Use repair_required when action, bedside utility, notify utility, exception quality, or safety materially fails.",
    "Use pass_but_verbose only when the answer is safe and useful but too long or repetitive.",
  ].join("\n");
}

export function parseQualityGateDecision(raw: string): MedSafetyQualityDecision {
  try {
    const parsed = JSON.parse(String(raw ?? "").trim()) as Partial<{
      verdict: string;
      repairInstructions: string;
      issues: unknown[];
      criticalIssues: unknown[];
      scores: Partial<Record<keyof MedSafetyQualityScores, unknown>>;
    }>;
    const issues = Array.from(
      new Set(
        Array.isArray(parsed.issues)
          ? parsed.issues.map((item) => sanitizeIssueFamily(item)).filter((item): item is MedSafetyRepairIssueFamily => Boolean(item))
          : parseIssueFamilies(String(parsed.repairInstructions ?? ""))
      )
    );
    const criticalIssues = Array.from(
      new Set(
        Array.isArray(parsed.criticalIssues)
          ? parsed.criticalIssues.map((item) => sanitizeIssueFamily(item)).filter((item): item is MedSafetyRepairIssueFamily => Boolean(item))
          : issues.filter((issue) => (MED_SAFETY_CRITICAL_REPAIR_ISSUE_FAMILIES as readonly string[]).includes(issue))
      )
    );
    const scores = buildEmptyScores();
    for (const axis of MED_SAFETY_QUALITY_SCORE_AXES) {
      const rawValue = parsed.scores?.[axis];
      const numeric = typeof rawValue === "number" && Number.isFinite(rawValue) ? Math.max(0, Math.min(3, Math.round(rawValue))) : 0;
      scores[axis] = numeric;
    }
    const verdict = ["pass", "repair_required", "pass_but_verbose"].includes(String(parsed.verdict ?? ""))
      ? (parsed.verdict as MedSafetyQualityDecision["verdict"])
      : issues.length
        ? "repair_required"
        : "pass";
    return {
      verdict,
      repairInstructions: issues.join(","),
      issues,
      criticalIssues,
      scores,
      profile: null,
    };
  } catch {
    return {
      verdict: "repair_required",
      repairInstructions: "action_gap,safety_gap",
      issues: ["action_gap", "safety_gap"],
      criticalIssues: ["safety_gap"],
      scores: buildEmptyScores(),
      profile: null,
    };
  }
}
