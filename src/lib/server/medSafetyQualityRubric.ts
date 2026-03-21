import type {
  MedSafetyPromptBlueprint,
  MedSafetyQualityDecision,
  MedSafetyQualityIssueCode,
  MedSafetyQualityScores,
  MedSafetyRouteDecision,
} from "@/lib/server/medSafetyTypes";
import {
  MED_SAFETY_CRITICAL_QUALITY_ISSUE_CODES,
  MED_SAFETY_QUALITY_ISSUE_CODES,
  MED_SAFETY_QUALITY_SCORE_AXES,
} from "@/lib/server/medSafetyTypes";
import { FILLER_PATTERNS, normalizeText } from "@/lib/server/medSafetySignalLexicon";

const DUPLICATE_LINE_EXEMPT_PATTERNS = [
  /^핵심[:：]?$/i,
  /^지금\s*할\s*일[:：]?$/i,
  /^주의[:：]?$/i,
  /^보고\s*기준[:：]?$/i,
  /^즉시\s*보고\s*신호[:：]?$/i,
];

const UNSUPPORTED_SPECIFICITY_PATTERNS = [
  /제조사별\s*세팅/i,
  /모델별\s*세팅/i,
  /기관마다\s*다르지만\s*\d/i,
  /\b\d+\s*(?:mmhg|psi|l\/min|fr|gauge)\b/i,
];

const CHECKLIST_DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  patient: [/자발호흡/i, /보조근/i, /agitation/i, /sedation/i, /의식/i, /색/i, /활력징후/i, /hemodynamic/i, /spo2/i],
  ventilator_waveform: [/waveform/i, /비동기/i, /double triggering/i, /ineffective/i, /auto-?peep/i, /breath stacking/i, /flow/i, /i:e/i],
  tube_circuit: [/ett/i, /튜브\s*위치/i, /cuff/i, /회로/i, /circuit/i, /water trap/i, /leak/i, /kink/i],
  secretion_or_obstruction: [/분비물/i, /흡인/i, /suction/i, /obstruction/i, /tube\s*partial obstruction/i],
  measurement_error_or_sampling: [/채혈\s*오류/i, /sampling/i, /measurement/i, /동맥\s*채혈/i, /체위\s*변화/i, /직전\s*suction/i],
  oxygenation_strategy: [/fio2/i, /peep/i, /산소화/i, /p\/f/i, /pao2/i, /spo2/i, /prone/i, /recruit/i],
  notification_payload: [/mode/i, /setting/i, /abga/i, /vte/i, /노티/i, /보고/i, /주치의/i, /sbar/i],
};

function buildEmptyScores(): MedSafetyQualityScores {
  return {
    directness: 0,
    bedside_actionability: 0,
    exception_quality: 0,
    reporting_utility: 0,
    checklist_density: 0,
    safety_guardrails: 0,
    paired_problem_coverage: 0,
  };
}

function sanitizeIssueCode(value: unknown) {
  const text = String(value ?? "").trim();
  return (MED_SAFETY_QUALITY_ISSUE_CODES.find((item) => item === text) ?? null) as MedSafetyQualityIssueCode | null;
}

export function parseIssueCodes(raw: string) {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((item) => sanitizeIssueCode(item))
        .filter((item): item is MedSafetyQualityIssueCode => Boolean(item))
    )
  );
}

function extractLeadText(lines: string[]) {
  const normalized = lines.map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < normalized.length && index < 4; index += 1) {
    const line = normalized[index]!;
    if (/^[-*•·]\s+/.test(line)) return line.replace(/^[-*•·]\s+/, "").trim();
    if (/^리드\s*문장[:：]/i.test(line)) return line.replace(/^리드\s*문장[:：]\s*/i, "").trim();
    if (/[:：]$/.test(line) && normalized[index + 1]) return normalized[index + 1]!.trim();
    return line;
  }
  return "";
}

function hasConclusionNearTop(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .slice(0, 6);
  const lead = extractLeadText(lines);
  if (!lead) return false;
  if (/^(질문하신|상황에 따라|일반적으로|보통은|케이스마다|원하시면|추가로)/i.test(lead)) return false;
  return /(맞습니다|아닙니다|우선|지금은|가장|먼저|필요|권장|중요|일반적|보통)/i.test(lead) || lead.length >= 18;
}

function countBulletLines(text: string) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•·]\s+/.test(line)).length;
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

function hasSectionStructure(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim());
  let headings = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line || /^[-*•·]\s+/.test(line)) continue;
    const next = lines[index + 1]?.trim() ?? "";
    if (!next || /^[-*•·]\s+/.test(next)) continue;
    const normalized = line.replace(/\s+/g, "");
    const strongHeading =
      (/[:：]$/.test(line) && line.length <= 26) ||
      /^(핵심|핵심판단|질문에대한직접답|지금할일|지금확인할것|노티전지금확인할것|왜이순서로보는지|같이봐야할문제|주치의노티포인트|즉시보고신호|헷갈리기쉬운예외|기억포인트)$/.test(
        normalized
      );
    const softHeading = line.length <= 24 && !/[.。!?？！]$/.test(line) && !/니다$|습니다$|세요$/.test(line);
    if (strongHeading || softHeading) headings += 1;
  }
  return headings >= 2;
}

function hasImmediateActionNearTop(text: string) {
  const top = normalizeText(text)
    .split("\n")
    .slice(0, 8)
    .join("\n");
  return /(중단|멈추|바로|즉시|확인|보고|호출|clamp|산소|분리)/i.test(top);
}

function hasAssumptionDisclosureNearTop(text: string) {
  const top = normalizeText(text)
    .split("\n")
    .slice(0, 6)
    .join("\n");
  return /(의미하신 것으로|보고 설명|전제로|가정하면|추정|정확한 명칭|확인이 필요|확인 필요|assuming|if you mean)/i.test(top);
}

function includesEscalationSignals(text: string) {
  return /(중단|멈추|보고|호출|clamp|산소|분리|의사에게|상급자에게|즉시)/i.test(text);
}

function includesProtocolCaveat(text: string) {
  return /(기관 프로토콜|기관 기준|약제부|제조사|ifu|local protocol|pharmacy|manufacturer)/i.test(text);
}

function includesRiskySpecificity(text: string) {
  return /(\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|mL|ml|cc|units?|u|amp|vial|mEq|mmol|gtt\/min|drops?\/min|ml\/hr|cc\/hr|L\/min|l\/min|psi|mmhg|fr|gauge)\b)|(희석[^\n]{0,18}\d)|(속도[^\n]{0,18}\d)|(세팅[^\n]{0,18}\d)/i.test(
    text
  );
}

function detectChecklistDomains(text: string) {
  const normalized = normalizeText(text);
  return Object.entries(CHECKLIST_DOMAIN_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(normalized)))
    .map(([name]) => name);
}

function hasReversibleCauseSweep(text: string) {
  return /(분비물|회로|circuit|tube|ett|누출|leak|kink|tube obstruction|cuff|water trap|기흉|무기폐|position|체위)/i.test(text);
}

function hasFalseWorseningSweep(text: string) {
  return /(채혈\s*오류|sampling|measurement|직전 suction|체위\s*변화|artifact|가짜\s*악화|동맥\s*채혈)/i.test(text);
}

function hasNotificationPayload(text: string) {
  return /(mode|setting|abga|vte|spo2|fi?o2|peep|현재.*세팅|현재.*상태|노티할.*내용|보고할.*내용)/i.test(text);
}

function hasNotificationScript(text: string) {
  return /(노티.*예시|보고.*예시|이렇게.*말|\".*\"|“.*”|sbar)/i.test(text);
}

function hasExceptionBoundary(text: string) {
  return /(다만|반대로|하지만|예외|언제는|조건부로|한편)/i.test(text);
}

function hasCounterfactual(text: string) {
  return /(왜.*먼저|먼저.*보는 이유|반대로|rr.*위험|pi.*신중|언제.*고려)/i.test(text);
}

function hasMeasurementDependency(text: string) {
  return /(pbw|predicted body weight|plateau|driving pressure|실제 total rr|waveform|trend|repeat abga|정확한 명칭)/i.test(text);
}

function hasPairedProblemHandling(text: string) {
  return /(산소화|hypox|p\/f|pao2|fio2|peep).*(환기|co2|paco2|rr|minute ventilation)|(환기|co2|paco2|rr).*(산소화|pao2|fio2|peep)/i.test(
    text
  );
}

function hasRedFlags(text: string) {
  return /(즉시\s*보고|즉시\s*노티|호출|spo2.*미만|p[hH].*7\.2|혈압\s*저하|의식\s*저하|한쪽\s*호흡음|기흉)/i.test(text);
}

function hasGenericBedsideLanguage(text: string) {
  const normalized = normalizeText(text);
  const fillerHits = FILLER_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  const concreteHits = [
    /abga/i,
    /spo2/i,
    /peep/i,
    /fio2/i,
    /waveform/i,
    /tube/i,
    /분비물/i,
    /report/i,
    /노티/i,
    /pbw/i,
  ].filter((pattern) => pattern.test(normalized)).length;
  return fillerHits >= 2 || (concreteHits <= 1 && normalized.length > 260);
}

function isOvercompressedHighRiskAnswer(text: string, decision: MedSafetyRouteDecision) {
  if (decision.risk !== "high" && decision.urgencyLevel !== "critical") return false;
  const normalized = normalizeText(text);
  return normalized.length < 420 || countBulletLines(normalized) < 4;
}

function isOverlongAnswer(text: string, decision: MedSafetyRouteDecision) {
  const length = normalizeText(text).length;
  if (decision.answerDepth === "short") return length > 700;
  if (decision.answerDepth === "standard") return length > 1900;
  if (decision.risk === "high") return length > 3200;
  return length > 2600;
}

function hasForbiddenFollowup(text: string, decision: MedSafetyRouteDecision) {
  const allowFollowup = decision.entityClarity !== "high" || decision.risk === "high" || decision.intent === "device";
  if (allowFollowup) return false;
  const tail = normalizeText(text)
    .split("\n")
    .slice(-5)
    .join("\n");
  return /(원하시면|원하면|이어서 정리|더 정리해드릴|추가로 정리|바로 이어서|I can also|if you want)/i.test(tail);
}

function scoreFromBoolean(value: boolean, pass = 3, fail = 0) {
  return value ? pass : fail;
}

export function buildHeuristicQualityDecision(
  answer: string,
  decision: MedSafetyRouteDecision,
  blueprint?: MedSafetyPromptBlueprint | null
): MedSafetyQualityDecision {
  const issues: MedSafetyQualityIssueCode[] = [];
  const normalized = normalizeText(answer);
  const domains = detectChecklistDomains(normalized);

  if (!hasConclusionNearTop(normalized)) issues.push("missing_conclusion_first");
  if ((decision.risk === "high" || decision.intent === "action" || decision.intent === "device") && !hasImmediateActionNearTop(normalized)) {
    issues.push("mixed_question_order", "missing_immediate_action");
  }
  if (decision.needsEscalation && !includesEscalationSignals(normalized)) issues.push("missing_escalation_threshold");
  if (decision.entityClarity === "medium" && !hasAssumptionDisclosureNearTop(normalized)) issues.push("missing_assumption_disclosure");
  if (decision.entityClarity !== "high" && includesRiskySpecificity(normalized) && !/확인|추정|가능성|정확한 명칭/i.test(normalized)) {
    issues.push("unsafe_specificity_for_ambiguous_entity");
  }
  if ((decision.entityClarity !== "high" || decision.risk === "high") && includesRiskySpecificity(normalized) && !includesProtocolCaveat(normalized)) {
    issues.push("missing_local_authority_caveat", "missing_protocol_caveat");
  }
  if (decision.format === "sectioned" && !hasSectionStructure(normalized)) issues.push("weak_section_structure");
  if (decision.format === "sectioned" && countBulletLines(normalized) >= 6 && !/핵심 판단|지금 할 일|지금 확인할 것|노티 전 지금 확인할 것|즉시 보고 신호|주치의 노티 포인트/i.test(normalized)) {
    issues.push("missing_small_category_structure");
  }
  if (countDuplicateLines(normalized) >= 2) issues.push("duplicate_lines");
  if (FILLER_PATTERNS.some((pattern) => pattern.test(normalized))) issues.push("filler_detected");
  if (UNSUPPORTED_SPECIFICITY_PATTERNS.some((pattern) => pattern.test(normalized))) issues.push("unsupported_specificity");
  if (decision.intent === "compare" && !/(구분 포인트|가장 빨리|핵심 차이|먼저 보는)/i.test(normalized)) issues.push("missing_fast_distinction");
  if (decision.intent === "numeric" && !/(정상|기준|범위).*(의미|해석|시사).*(보고|호출|확인)|(보고|호출|확인).*(정상|기준|범위)/i.test(normalized)) {
    issues.push("missing_numeric_core");
  }
  if ((decision.intent === "action" || decision.intent === "device") && !/(확인|체크|관찰).*(조치|대응|중단|보고|호출)|(조치|대응|중단|보고|호출).*(확인|체크|관찰)/i.test(normalized)) {
    issues.push("missing_action_core");
  }
  if (decision.reversibleCauseSweep && !hasReversibleCauseSweep(normalized)) issues.push("missing_reversible_cause_sweep");
  if ((decision.reversibleCauseSweep || decision.measurementDependency !== "low") && !hasFalseWorseningSweep(normalized)) {
    issues.push("missing_false_worsening_exclusion");
  }
  if (decision.notificationNeed !== "none" && !hasNotificationPayload(normalized)) issues.push("missing_notification_payload");
  if (decision.scriptNeed && !hasNotificationScript(normalized)) issues.push("missing_notification_script");
  if (decision.exceptionNeed && !hasExceptionBoundary(normalized)) issues.push("missing_exception_boundary");
  if (decision.counterfactualNeed && !hasCounterfactual(normalized)) issues.push("missing_counterfactual");
  if (decision.measurementDependency !== "low" && !hasMeasurementDependency(normalized)) issues.push("missing_measurement_dependency");
  if (decision.pairedProblemNeed && !hasPairedProblemHandling(normalized)) issues.push("missing_paired_problem_handling");
  if ((decision.needsEscalation || decision.urgencyLevel !== "routine") && !hasRedFlags(normalized)) issues.push("missing_red_flags");
  if (blueprint?.requiredArtifacts.includes("bedside_recheck") && domains.length < 3) issues.push("insufficient_checklist_domain_coverage");
  if (hasGenericBedsideLanguage(normalized)) issues.push("generic_bedside_language");
  if (isOvercompressedHighRiskAnswer(normalized, decision)) issues.push("overcompressed_high_risk_answer");
  if (isOverlongAnswer(normalized, decision)) issues.push("overlong_answer");
  if (hasForbiddenFollowup(normalized, decision)) issues.push("forbidden_followup");

  const dedupedIssues = Array.from(new Set(issues));
  const criticalIssues = dedupedIssues.filter((issue) =>
    (MED_SAFETY_CRITICAL_QUALITY_ISSUE_CODES as readonly string[]).includes(issue)
  );

  const scores = buildEmptyScores();
  scores.directness = scoreFromBoolean(hasConclusionNearTop(normalized), 3, 1);
  scores.bedside_actionability = Math.max(
    scoreFromBoolean(hasImmediateActionNearTop(normalized), 2, 0),
    Math.min(3, (hasImmediateActionNearTop(normalized) ? 1 : 0) + Math.min(2, domains.length >= 3 ? 2 : domains.length >= 2 ? 1 : 0))
  );
  scores.exception_quality = decision.exceptionNeed || decision.counterfactualNeed ? (hasExceptionBoundary(normalized) && hasCounterfactual(normalized) ? 3 : hasExceptionBoundary(normalized) || hasCounterfactual(normalized) ? 1 : 0) : 3;
  scores.reporting_utility =
    decision.notificationNeed === "none"
      ? 3
      : hasNotificationPayload(normalized) && (!decision.scriptNeed || hasNotificationScript(normalized))
        ? 3
        : hasNotificationPayload(normalized)
          ? 1
          : 0;
  scores.checklist_density =
    blueprint?.requiredArtifacts.includes("bedside_recheck")
      ? domains.length >= 4
        ? 3
        : domains.length >= 3
          ? 2
          : domains.length >= 2
            ? 1
            : 0
      : 3;
  scores.safety_guardrails =
    !includesRiskySpecificity(normalized) || includesProtocolCaveat(normalized)
      ? includesEscalationSignals(normalized)
        ? 3
        : 2
      : 0;
  scores.paired_problem_coverage =
    decision.pairedProblemNeed ? (hasPairedProblemHandling(normalized) ? 3 : 0) : 3;

  if (!dedupedIssues.length) {
    return {
      verdict: "pass",
      repairInstructions: "",
      issues: [],
      criticalIssues: [],
      scores,
    };
  }

  const verboseOnly = dedupedIssues.every((issue) =>
    ["duplicate_lines", "filler_detected", "overlong_answer", "forbidden_followup"].includes(issue)
  );

  const issueLimit = decision.risk === "high" || decision.urgencyLevel === "critical" ? 8 : 5;
  return {
    verdict: verboseOnly ? "pass_but_verbose" : "repair_required",
    repairInstructions: dedupedIssues.slice(0, issueLimit).join(","),
    issues: dedupedIssues.slice(0, issueLimit),
    criticalIssues,
    scores,
  };
}

export function buildQualityGateDeveloperPrompt() {
  return [
    "You are a strict QA reviewer for nurse-facing clinical answers.",
    "Judge whether the answer is at least legacy-grade and whether it contains enough bedside deliverables.",
    "Do not rewrite the answer.",
    "Return JSON only.",
    "Allowed JSON shape:",
    '{"verdict":"pass|repair_required|pass_but_verbose","repairInstructions":"comma-separated issue codes","issues":["issue_code"],"criticalIssues":["issue_code"],"scores":{"directness":0,"bedside_actionability":0,"exception_quality":0,"reporting_utility":0,"checklist_density":0,"safety_guardrails":0,"paired_problem_coverage":0}}',
    "Use only the allowed issue codes below.",
    MED_SAFETY_QUALITY_ISSUE_CODES.map((code) => `- ${code}`).join("\n"),
    "Score each axis from 0 to 3.",
    "Scoring intent:",
    "- directness: practical conclusion appears immediately and unambiguously.",
    "- bedside_actionability: the answer tells the nurse what to check now and what to do now.",
    "- exception_quality: the answer includes limiting conditions, exceptions, or counterfactual boundaries when relevant.",
    "- reporting_utility: the answer gives usable notification payload and script elements when relevant.",
    "- checklist_density: the answer covers enough bedside domains rather than repeating one domain.",
    "- safety_guardrails: the answer stays conservative, avoids unsafe specificity, and preserves escalation criteria.",
    "- paired_problem_coverage: when two coupled problems exist, the answer handles both instead of collapsing to one.",
    "Return repair_required if any high-risk answer lacks immediate action, red flags, reversible-cause sweep, notification payload, notification script when needed, exception boundary, counterfactual, measurement dependency, or paired-problem handling when clearly relevant.",
    "Return repair_required if the answer is structurally weak, too generic, or unsafe in specificity.",
    "Return pass_but_verbose only when the answer is safe and useful but too long or repetitive.",
    "Critical issues should include only problems that would materially reduce bedside safety or reporting utility.",
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
          ? parsed.issues.map((item) => sanitizeIssueCode(item)).filter((item): item is MedSafetyQualityIssueCode => Boolean(item))
          : parseIssueCodes(String(parsed.repairInstructions ?? ""))
      )
    );
    const criticalIssues = Array.from(
      new Set(
        Array.isArray(parsed.criticalIssues)
          ? parsed.criticalIssues.map((item) => sanitizeIssueCode(item)).filter((item): item is MedSafetyQualityIssueCode => Boolean(item))
          : issues.filter((issue) => (MED_SAFETY_CRITICAL_QUALITY_ISSUE_CODES as readonly string[]).includes(issue))
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
    };
  } catch {
    return {
      verdict: "repair_required",
      repairInstructions: "missing_immediate_action,missing_escalation_threshold,missing_protocol_caveat",
      issues: ["missing_immediate_action", "missing_escalation_threshold", "missing_protocol_caveat"],
      criticalIssues: ["missing_immediate_action", "missing_escalation_threshold", "missing_protocol_caveat"],
      scores: buildEmptyScores(),
    };
  }
}
