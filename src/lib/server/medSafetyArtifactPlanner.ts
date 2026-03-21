import type {
  MedSafetyArtifactDepth,
  MedSafetyArtifactId,
  MedSafetyPromptBlueprint,
  MedSafetyRouteDecision,
} from "@/lib/server/medSafetyTypes";
import type { MedSafetyQuestionSignals } from "@/lib/server/medSafetySignalLexicon";
import { countPatternHits } from "@/lib/server/medSafetySignalLexicon";

const PBW_PATTERNS = [/\bpbw\b/i, /predicted body weight/i, /예상\s*체중/i];

function uniqueArtifacts(items: MedSafetyArtifactId[]) {
  return Array.from(new Set(items));
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function inferOpeningMode(decision: MedSafetyRouteDecision) {
  if (decision.urgencyLevel === "critical" || decision.intent === "action" || decision.intent === "device") {
    return "action_first" as const;
  }
  if (decision.intent === "compare") return "compare_first" as const;
  if (decision.intent === "numeric") return "numeric_first" as const;
  return "direct" as const;
}

function buildDefaultSectionEmphasis(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals) {
  const emphasis: string[] = ["핵심 판단"];
  if (decision.mandatoryArtifacts.includes("immediate_action")) emphasis.push("지금 할 일");
  if (decision.mandatoryArtifacts.includes("bedside_recheck")) {
    emphasis.push(decision.workflowStage === "pre_notification" ? "노티 전 지금 확인할 것" : "지금 확인할 것");
  }
  if (decision.mandatoryArtifacts.includes("why_this_before_that") || decision.mandatoryArtifacts.includes("why_recommended_path")) {
    emphasis.push("왜 이 순서로 보는지");
  }
  if (decision.mandatoryArtifacts.includes("counterfactual") || decision.mandatoryArtifacts.includes("exception_boundary")) {
    emphasis.push("헷갈리기 쉬운 예외");
  }
  if (decision.pairedProblemNeed || signals.mentionsPairedVentOxyProblem) {
    emphasis.push("같이 봐야 할 문제");
  }
  if (decision.notificationNeed !== "none") emphasis.push("주치의 노티 포인트");
  if (decision.mandatoryArtifacts.includes("urgent_red_flags")) emphasis.push("즉시 보고 신호");
  return uniqueStrings(emphasis);
}

function buildDomainCoverageTargets(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals) {
  const domains: string[] = [];
  if (signals.mentionsPatientState || decision.urgencyLevel !== "routine") domains.push("patient");
  if (signals.mentionsVentilation || signals.mentionsAlarm || signals.mentionsSetting) domains.push("ventilator_waveform");
  if (signals.mentionsLineOrTube || signals.mentionsAlarm) domains.push("tube_circuit");
  if (signals.mentionsProcedure || decision.reversibleCauseSweep) domains.push("secretion_or_obstruction");
  if (signals.mentionsMeasurementError || decision.measurementDependency !== "low") domains.push("measurement_error_or_sampling");
  if (signals.mentionsOxygenation || signals.mentionsABGA || decision.pairedProblemNeed) domains.push("oxygenation_strategy");
  if (decision.notificationNeed !== "none") domains.push("notification_payload");
  return uniqueStrings(domains);
}

function buildMustNotAssert(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, query: string) {
  const items: string[] = [];
  if (decision.entityClarity !== "high") {
    items.push("검증되지 않은 용량", "검증되지 않은 속도", "검증되지 않은 희석", "검증되지 않은 경로", "검증되지 않은 세팅값");
  }
  if (decision.risk === "high") {
    items.push("기관별 또는 제조사별 세부 수치", "확인되지 않은 compatibility 결론");
  }
  if (signals.mentionsCompatibility) {
    items.push("검증되지 않은 Y-site 혼합 가능 결론");
  }
  if (signals.mentionsSetting) {
    items.push("모델 미확인 상태의 구체 세팅 지시");
  }
  if ((signals.mentionsABGA || signals.mentionsVentilation) && countPatternHits(query, PBW_PATTERNS) === 0) {
    items.push("PBW 확인 없는 Vt 적정성 단정");
  }
  return uniqueStrings(items);
}

function buildCoreArtifacts(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals) {
  const artifacts: MedSafetyArtifactId[] = ["direct_answer"];
  if (decision.risk !== "low" || decision.intent === "numeric" || decision.pairedProblemNeed) artifacts.push("severity_frame");
  if (decision.urgencyLevel !== "routine" || decision.intent === "action" || decision.intent === "device") artifacts.push("immediate_action");
  if (decision.checklistDepth !== "brief" || signals.mentionsVentilation || signals.mentionsPreNotification) artifacts.push("bedside_recheck");
  if (decision.reversibleCauseSweep) artifacts.push("reversible_cause_sweep");
  if (signals.asksFalseWorseningSweep || decision.reversibleCauseSweep || signals.mentionsMeasurementError || signals.mentionsSuddenDeterioration) {
    artifacts.push("false_worsening_sweep");
  }
  if (decision.intent === "compare" || decision.secondaryIntents.length > 0 || signals.mentionsNumericActionMix) {
    artifacts.push("why_this_before_that");
  }
  if (decision.intent !== "knowledge" || decision.pairedProblemNeed) artifacts.push("why_recommended_path");
  if (decision.exceptionNeed) artifacts.push("when_not_to_do_that", "exception_boundary");
  if (decision.counterfactualNeed) artifacts.push("counterfactual");
  if (decision.measurementDependency !== "low") artifacts.push("measurement_dependency");
  if (decision.pairedProblemNeed) artifacts.push("paired_problem_handling");
  if (decision.notificationNeed !== "none") artifacts.push("notification_payload");
  if (decision.scriptNeed) artifacts.push("notification_script");
  if (decision.needsEscalation || decision.urgencyLevel !== "routine") artifacts.push("urgent_red_flags");
  if (decision.risk === "high" || decision.entityClarity !== "high" || decision.notificationNeed !== "none") artifacts.push("protocol_caveat");
  return uniqueArtifacts(artifacts);
}

function buildOptionalArtifacts(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, hasImage: boolean) {
  const artifacts: MedSafetyArtifactId[] = [];
  if (decision.answerDepth === "detailed" && (decision.intent === "compare" || signals.asksSelection)) {
    artifacts.push("memory_point");
  }
  if (!hasImage && decision.answerDepth === "detailed" && decision.entityClarity === "high" && decision.risk !== "high") {
    artifacts.push("mini_case");
  }
  return uniqueArtifacts(artifacts.filter((artifact) => !decision.mandatoryArtifacts.includes(artifact)));
}

function buildArtifactOrder(requiredArtifacts: MedSafetyArtifactId[], optionalArtifacts: MedSafetyArtifactId[]) {
  const preferred: MedSafetyArtifactId[] = [
    "direct_answer",
    "severity_frame",
    "immediate_action",
    "bedside_recheck",
    "reversible_cause_sweep",
    "false_worsening_sweep",
    "why_this_before_that",
    "why_recommended_path",
    "counterfactual",
    "when_not_to_do_that",
    "exception_boundary",
    "measurement_dependency",
    "paired_problem_handling",
    "notification_payload",
    "notification_script",
    "urgent_red_flags",
    "protocol_caveat",
    "memory_point",
    "mini_case",
  ];
  const requested = new Set<MedSafetyArtifactId>([...requiredArtifacts, ...optionalArtifacts]);
  return preferred.filter((artifact) => requested.has(artifact));
}

function buildArtifactQuota(decision: MedSafetyRouteDecision) {
  const quota: Partial<Record<MedSafetyArtifactId, number>> = {
    direct_answer: 1,
    severity_frame: decision.risk === "high" ? 3 : 2,
    immediate_action: decision.urgencyLevel === "critical" ? 4 : 3,
    bedside_recheck: decision.checklistDepth === "dense" ? 5 : decision.checklistDepth === "standard" ? 4 : 3,
    reversible_cause_sweep: decision.reversibleCauseSweep ? (decision.checklistDepth === "dense" ? 5 : 3) : 0,
    false_worsening_sweep: decision.reversibleCauseSweep ? 2 : 1,
    why_this_before_that: 2,
    why_recommended_path: 2,
    counterfactual: 3,
    when_not_to_do_that: 2,
    exception_boundary: 2,
    measurement_dependency: decision.measurementDependency === "high" ? 3 : 2,
    paired_problem_handling: 3,
    notification_payload: decision.notificationNeed === "immediate" ? 5 : 4,
    notification_script: 3,
    urgent_red_flags: decision.urgencyLevel === "critical" ? 4 : 3,
    protocol_caveat: 1,
    memory_point: 2,
    mini_case: 1,
  };
  return quota;
}

function buildArtifactDepth(decision: MedSafetyRouteDecision, artifacts: MedSafetyArtifactId[]) {
  const depth: Partial<Record<MedSafetyArtifactId, MedSafetyArtifactDepth>> = {};
  for (const artifact of artifacts) {
    depth[artifact] =
      artifact === "bedside_recheck" || artifact === "reversible_cause_sweep"
        ? decision.checklistDepth === "dense"
          ? "dense"
          : "standard"
        : artifact === "notification_payload" || artifact === "notification_script"
          ? decision.notificationNeed === "immediate"
            ? "dense"
            : "standard"
          : artifact === "counterfactual" || artifact === "exception_boundary"
            ? decision.detailBias === "very_high"
              ? "dense"
              : "standard"
            : decision.answerDepth === "short"
              ? "brief"
              : "standard";
  }
  return depth;
}

export function buildMedSafetyPromptBlueprint(
  decision: MedSafetyRouteDecision,
  options: {
    hasImage?: boolean;
    query?: string;
    signals: MedSafetyQuestionSignals;
  }
): MedSafetyPromptBlueprint {
  const requiredArtifacts = uniqueArtifacts(
    decision.mandatoryArtifacts.length ? decision.mandatoryArtifacts : buildCoreArtifacts(decision, options.signals)
  );
  const optionalArtifacts = buildOptionalArtifacts(decision, options.signals, Boolean(options.hasImage));
  const artifactOrder = buildArtifactOrder(requiredArtifacts, optionalArtifacts);
  const domainCoverageTargets = buildDomainCoverageTargets(decision, options.signals);
  const sectionEmphasis =
    decision.sectionEmphasis.length > 0 ? decision.sectionEmphasis : buildDefaultSectionEmphasis(decision, options.signals);

  return {
    openingMode: inferOpeningMode(decision),
    requiredArtifacts,
    optionalArtifacts,
    artifactOrder,
    artifactQuota: buildArtifactQuota(decision),
    artifactDepth: buildArtifactDepth(decision, artifactOrder),
    coreArtifactPack: requiredArtifacts.filter((artifact) =>
      ["direct_answer", "immediate_action", "exception_boundary", "urgent_red_flags", "protocol_caveat"].includes(artifact)
    ),
    extendedArtifactPack: optionalArtifacts,
    mustNotAssert: buildMustNotAssert(decision, options.signals, String(options.query ?? "")),
    subjectFocus: options.signals.subjectFocus,
    mixedIntent: options.signals.mixedIntent,
    followupPolicy:
      decision.entityClarity !== "high" || decision.risk === "high" || Boolean(options.hasImage) ? "limited" : "forbid",
    sectionEmphasis,
    communicationArtifacts: decision.communicationArtifacts,
    domainCoverageTargets,
  };
}
