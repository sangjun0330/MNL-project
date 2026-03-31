import { buildMedSafetyPromptBlueprint } from "@/lib/server/medSafetyArtifactPlanner";
import {
  buildHeuristicQualityDecision,
  buildQualityGateDeveloperPrompt,
  parseQualityGateDecision,
} from "@/lib/server/medSafetyQualityRubric";
import {
  buildQuestionSignals,
  normalizeQuery,
  normalizeText,
  pickTopIntent,
  type MedSafetyQuestionSignals,
} from "@/lib/server/medSafetySignalLexicon";
import {
  MED_SAFETY_COMMUNICATION_PROFILES,
  MED_SAFETY_EXCEPTION_PROFILES,
  MED_SAFETY_INTENTS,
  MED_SAFETY_REPAIR_ISSUE_FAMILIES,
  MED_SAFETY_RISKS,
  MED_SAFETY_RUNTIME_MODES,
  MED_SAFETY_URGENCY_LEVELS,
  MED_SAFETY_DETAIL_PROFILES,
  type MedSafetyCommunicationProfile,
  type MedSafetyDetailProfile,
  type MedSafetyEntityClarity,
  type MedSafetyExceptionProfile,
  type MedSafetyInternalDecision,
  type MedSafetyIntent,
  type MedSafetyPromptAssembly,
  type MedSafetyPromptBlueprint,
  type MedSafetyPromptContractId,
  type MedSafetyPromptLineDescriptor,
  type MedSafetyPromptLineSection,
  type MedSafetyPromptProfile,
  type MedSafetyRepairIssueFamily,
  type MedSafetyRisk,
  type MedSafetyRouteDecision,
  type MedSafetyRouterRefinement,
  type MedSafetyRuntimeMode,
  type MedSafetySemanticCoverageTag,
  type MedSafetyUrgencyLevel,
} from "@/lib/server/medSafetyTypes";

export type {
  MedSafetyPromptAssembly,
  MedSafetyPromptProfile,
  MedSafetyQualityDecision,
  MedSafetyReasoningEffort,
  MedSafetyRouteDecision,
  MedSafetyRuntimeMode,
} from "@/lib/server/medSafetyTypes";

type RouteInput = {
  query: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
};

type PromptAssemblyOptions = {
  runtimeMode: MedSafetyRuntimeMode;
  hasImage?: boolean;
  query: string;
};

type PromptBudgetFit = {
  selectedContractIds: MedSafetyPromptContractId[];
  droppedContractIds: MedSafetyPromptContractId[];
  activeDirectiveKeys: MedSafetyPromptBlueprint["projection"]["activeDirectiveKeys"];
  droppedDirectiveKeys: MedSafetyPromptBlueprint["projection"]["droppedDirectiveKeys"];
  lines: string[];
};

type PromptVisualSection = {
  id: MedSafetyPromptLineSection;
  title: string;
  lines: string[];
};

const BASE_CONTRACT_IDS: MedSafetyPromptContractId[] = [
  "base_role_goal",
  "base_decision_priority",
  "base_safety_certainty",
  "base_render_discipline",
];

const PROMPT_COMPRESSION_DROP_ORDER = [
  "coverageDirective",
  "exceptionDirective",
  "communicationDirective",
  "compressionDirective",
  "priorityDirective",
] as const;

const CONTRACT_DROP_ORDER: MedSafetyPromptContractId[] = [
  "output_no_meta_guard",
  "domain_reporting",
  "domain_med_device",
  "domain_vent_abga",
  "ambiguity_modifier",
  "communication_modifier",
  "exception_modifier",
  "risk_mixed_modifier",
  "risk_high_modifier",
  "intent_numeric",
  "intent_compare",
  "intent_action",
  "intent_knowledge",
  "output_safety_guard",
];

function uniqueStrings<T extends string>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean))) as T[];
}

function normalizePromptLineForDedupe(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/["'`.,:;!?()[\]{}_\-]/g, "");
}

function clampReason(text: string, max = 120) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function buildSecondaryIntentCluster(signals: MedSafetyQuestionSignals, primaryIntent: MedSafetyIntent) {
  return (Object.entries(signals.intentScores) as Array<[MedSafetyIntent, number]>)
    .filter(([intent, score]) => intent !== primaryIntent && score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([intent]) => intent)
    .slice(0, 2);
}

function pickInterpretiveIntent(signals: MedSafetyQuestionSignals): MedSafetyIntent {
  if (
    signals.asksSelection &&
    signals.intentScores.compare >= Math.max(signals.intentScores.numeric, signals.intentScores.device, signals.intentScores.knowledge)
  ) {
    return "compare";
  }
  if (
    signals.intentScores.device > 0 &&
    signals.intentScores.device >= Math.max(signals.intentScores.numeric, signals.intentScores.compare) &&
    !signals.explicitActionRequest
  ) {
    return "device";
  }
  if (signals.asksInterpretation && signals.intentScores.numeric >= Math.max(signals.intentScores.device, signals.intentScores.compare)) {
    return "numeric";
  }
  return "knowledge";
}

function deriveIntent(signals: MedSafetyQuestionSignals) {
  const top = pickTopIntent(signals.intentScores);
  let intent: MedSafetyIntent = top.topScore > 0 ? top.top : "knowledge";
  const interpretiveBias = signals.asksConceptExplanation || signals.asksQuestionSolving || signals.asksImageInterpretation;

  if (signals.preNotification || signals.wantsScript || signals.explicitActionRequest) intent = "action";
  else if (signals.mixedNumericAction) intent = "action";
  else if (interpretiveBias) intent = pickInterpretiveIntent(signals);
  else if (signals.asksSelection && signals.intentScores.compare >= signals.intentScores.numeric) intent = "compare";
  else if (signals.mentionsAlarm && signals.intentScores.device >= signals.intentScores.numeric) intent = "device";

  return {
    intent,
    top,
  };
}

function deriveRisk(signals: MedSafetyQuestionSignals, hasImage: boolean) {
  let score = 0;
  if (signals.hasHighRiskMarker) score += 3;
  if (signals.preNotification) score += 2;
  if (signals.hasSuddenMarker) score += 1;
  if (signals.mentionsAlarm) score += 2;
  if (signals.pairedProblem) score += 2;
  if (signals.mentionsCompatibility) score += 2;
  if (signals.mentionsSetting && signals.needsEntityDisambiguation) score += 1;
  if (signals.mentionsLineOrTube && signals.mentionsPatientState && signals.asksImmediateAction) score += 2;
  if (signals.subjectFocus === "device" && (signals.mentionsSetting || signals.mentionsPatientState)) score += 1;
  if (hasImage && (signals.asksImmediateAction || signals.mentionsAlarm || signals.mentionsSetting || signals.mentionsPatientState)) {
    score += 1;
  }
  if (score >= 5) return "high" satisfies MedSafetyRisk;
  if (score >= 2) return "medium" satisfies MedSafetyRisk;
  return "low" satisfies MedSafetyRisk;
}

function deriveEntityClarity(signals: MedSafetyQuestionSignals) {
  if (
    signals.needsEntityDisambiguation &&
    (signals.mentionsMedication || signals.mentionsLineOrTube || signals.mentionsSetting || signals.mentionsCompatibility)
  ) {
    return "low" satisfies MedSafetyEntityClarity;
  }
  if (signals.needsEntityDisambiguation || signals.mixedIntent) return "medium" satisfies MedSafetyEntityClarity;
  return "high" satisfies MedSafetyEntityClarity;
}

function deriveAnswerDepth(signals: MedSafetyQuestionSignals, risk: MedSafetyRisk, hasImage: boolean) {
  if (!hasImage && risk === "low" && !signals.mixedIntent && !signals.preNotification && !signals.pairedProblem) return "short" as const;
  if (risk === "high" || signals.pairedProblem || signals.preNotification || (hasImage && !signals.asksQuestionSolving)) {
    return "detailed" as const;
  }
  return "standard" as const;
}

function deriveUrgencyLevel(signals: MedSafetyQuestionSignals, risk: MedSafetyRisk) {
  if (risk === "high" && (signals.hasSuddenMarker || signals.preNotification || signals.mentionsAlarm || signals.pairedProblem)) {
    return "critical" satisfies MedSafetyUrgencyLevel;
  }
  if (risk === "high" || signals.preNotification || signals.hasSuddenMarker || signals.mentionsAlarm) {
    return "urgent" satisfies MedSafetyUrgencyLevel;
  }
  return "routine" satisfies MedSafetyUrgencyLevel;
}

function deriveWorkflowStage(signals: MedSafetyQuestionSignals, risk: MedSafetyRisk) {
  if (signals.preNotification || signals.wantsScript) return "pre_notification" as const;
  if (signals.hasSuddenMarker || signals.mentionsAlarm || (risk === "high" && signals.asksImmediateAction)) return "active_deterioration" as const;
  if (signals.asksImmediateAction || signals.asksSelection || signals.asksThreshold) return "decision" as const;
  return "interpretation" as const;
}

function derivePriorityMode(
  signals: MedSafetyQuestionSignals,
  risk: MedSafetyRisk,
  workflowStage: MedSafetyInternalDecision["workflowStage"]
) {
  if (signals.preNotification || signals.wantsScript) return "notify_first" as const;
  if (risk === "high" && (signals.mentionsMedication || signals.mentionsCompatibility || signals.mentionsSetting || signals.mentionsAlarm)) {
    return "safety_first" as const;
  }
  if (signals.asksImmediateAction || workflowStage === "decision" || workflowStage === "active_deterioration") {
    return "action_first" as const;
  }
  return "balanced" as const;
}

function deriveDetailProfile(
  signals: MedSafetyQuestionSignals,
  answerDepth: MedSafetyInternalDecision["answerDepth"],
  risk: MedSafetyRisk
) {
  if (signals.pairedProblem) return "paired" as const;
  if (signals.bedsideSweep || signals.preNotification || signals.mentionsAlarm || signals.mentionsLineOrTube || signals.mentionsPatientState) {
    return "bedside" as const;
  }
  if (answerDepth === "detailed" || risk === "high") return "deep" as const;
  return "lean" as const;
}

function deriveCommunicationProfile(
  signals: MedSafetyQuestionSignals,
  urgencyLevel: MedSafetyUrgencyLevel
) {
  if (signals.wantsScript) return "script" satisfies MedSafetyCommunicationProfile;
  if (signals.preNotification || (urgencyLevel !== "routine" && signals.asksThreshold)) {
    return "payload" satisfies MedSafetyCommunicationProfile;
  }
  return "none" satisfies MedSafetyCommunicationProfile;
}

function deriveExceptionProfile(signals: MedSafetyQuestionSignals, risk: MedSafetyRisk) {
  if (signals.asksThreshold || signals.asksSelection || signals.mixedNumericAction || signals.pairedProblem) {
    return "full" satisfies MedSafetyExceptionProfile;
  }
  if (risk === "high" || signals.mentionsSetting || signals.mentionsCompatibility) {
    return "light" satisfies MedSafetyExceptionProfile;
  }
  return "none" satisfies MedSafetyExceptionProfile;
}

function deriveSpecificityRisk(
  signals: MedSafetyQuestionSignals,
  entityClarity: MedSafetyEntityClarity,
  risk: MedSafetyRisk
) {
  if (entityClarity === "low" || signals.mentionsCompatibility || (signals.mentionsSetting && risk !== "low")) return "high" as const;
  if (entityClarity === "medium" || signals.mentionsMedication || signals.mentionsLineOrTube || signals.mentionsABGA) return "guarded" as const;
  return "low" as const;
}

function deriveCompressionTarget(
  answerDepth: MedSafetyInternalDecision["answerDepth"],
  signals: MedSafetyQuestionSignals,
  hasImage: boolean,
  risk: MedSafetyRisk
) {
  if (answerDepth === "short" || (risk === "low" && !signals.preNotification && !signals.pairedProblem)) return "tight" as const;
  if (answerDepth === "detailed" || signals.preNotification || signals.pairedProblem || hasImage) return "compressed_detailed" as const;
  return "balanced" as const;
}

function deriveConfidence(
  entityClarity: MedSafetyEntityClarity,
  signals: MedSafetyQuestionSignals,
  hasImage: boolean,
  risk: MedSafetyRisk
) {
  if (entityClarity === "low") return "low" as const;
  if (
    signals.mixedIntent ||
    signals.preNotification ||
    signals.pairedProblem ||
    risk === "high" ||
    (hasImage && (signals.explicitActionRequest || signals.mentionsAlarm || signals.mentionsSetting || signals.needsEntityDisambiguation))
  ) {
    return "medium" as const;
  }
  return "high" as const;
}

function buildReason(decision: MedSafetyInternalDecision, signals: MedSafetyQuestionSignals) {
  const parts: string[] = [decision.intent, decision.risk, decision.workflowStage, decision.detailProfile];
  if (signals.preNotification) parts.push("pre_notify");
  if (signals.pairedProblem) parts.push("paired");
  if (signals.falseWorseningRisk) parts.push("false_worsening");
  if (decision.entityClarity !== "high") parts.push(`clarity_${decision.entityClarity}`);
  if (decision.communicationProfile !== "none") parts.push(`comm_${decision.communicationProfile}`);
  return clampReason(parts.join(", "));
}

function reconcileDecision(base: MedSafetyInternalDecision, signals: MedSafetyQuestionSignals) {
  const next = { ...base };

  if (next.urgencyLevel === "critical") next.risk = "high";
  if (next.workflowStage === "pre_notification" && next.communicationProfile === "none") next.communicationProfile = "payload";
  if (next.communicationProfile !== "none") {
    next.reportingNeed = true;
    next.needsSbar = true;
  }
  if (next.priorityMode === "notify_first") {
    next.reportingNeed = true;
    if (next.communicationProfile === "none") next.communicationProfile = "payload";
  }
  if (next.detailProfile === "paired") next.pairedProblemNeed = true;
  if (next.pairedProblemNeed && next.detailProfile === "lean") next.detailProfile = "paired";
  if (next.exceptionProfile === "full") next.measurementGuardNeed = true;
  if (next.specificityRisk !== "low") next.protocolCaveatNeed = true;
  if (next.entityClarity === "low") {
    next.specificityRisk = "high";
    next.protocolCaveatNeed = true;
  }
  if (next.risk === "high" && next.answerDepth === "short") next.answerDepth = "standard";
  if (next.reportingNeed || next.risk === "high" || next.urgencyLevel !== "routine") next.needsEscalation = true;
  if (next.communicationProfile === "script") next.workflowStage = "pre_notification";
  if (signals.pairedProblem && next.exceptionProfile === "none") next.exceptionProfile = "light";
  next.format = next.answerDepth === "short" && next.communicationProfile === "none" && next.detailProfile === "lean" ? "short" : "sectioned";
  return next;
}

function synthesizeInternalDecision(input: RouteInput, refinement?: Partial<MedSafetyRouterRefinement>, source: "rules" | "model" = "rules") {
  const normalizedQuery = normalizeQuery(input.query);
  const signals = buildQuestionSignals(normalizedQuery, { hasImage: Boolean(input.imageDataUrl) });
  const { intent } = deriveIntent(signals);
  const risk = deriveRisk(signals, Boolean(input.imageDataUrl));
  const entityClarity = deriveEntityClarity(signals);
  const answerDepth = deriveAnswerDepth(signals, risk, Boolean(input.imageDataUrl));
  const urgencyLevel = deriveUrgencyLevel(signals, risk);
  const workflowStage = deriveWorkflowStage(signals, risk);
  const priorityMode = derivePriorityMode(signals, risk, workflowStage);
  const detailProfile = deriveDetailProfile(signals, answerDepth, risk);
  const communicationProfile = deriveCommunicationProfile(signals, urgencyLevel);
  const exceptionProfile = deriveExceptionProfile(signals, risk);
  const specificityRisk = deriveSpecificityRisk(signals, entityClarity, risk);
  const compressionTarget = deriveCompressionTarget(answerDepth, signals, Boolean(input.imageDataUrl), risk);
  const confidence = deriveConfidence(entityClarity, signals, Boolean(input.imageDataUrl), risk);

  let decision: MedSafetyInternalDecision = {
    intent,
    secondaryIntentCluster: buildSecondaryIntentCluster(signals, intent),
    risk,
    entityClarity,
    answerDepth,
    urgencyLevel,
    workflowStage,
    priorityMode,
    detailProfile,
    communicationProfile,
    exceptionProfile,
    pairedProblemNeed: signals.pairedProblem,
    measurementGuardNeed:
      signals.asksThreshold || signals.mentionsABGA || signals.mentionsCompatibility || entityClarity !== "high" || signals.mentionsSetting,
    reversibleCauseNeed:
      signals.bedsideSweep || signals.mentionsAlarm || signals.mentionsLineOrTube || signals.mentionsVentilation || signals.preNotification,
    falseWorseningNeed: signals.falseWorseningRisk || (signals.hasSuddenMarker && (signals.mentionsABGA || signals.mentionsAlarm)),
    reportingNeed: communicationProfile !== "none" || signals.preNotification || (risk === "high" && (signals.mentionsAlarm || signals.mentionsPatientState)),
    specificityRisk,
    protocolCaveatNeed:
      specificityRisk !== "low" || signals.mentionsCompatibility || signals.mentionsSetting || signals.mentionsMedication || signals.mentionsLineOrTube,
    compressionTarget,
    needsEscalation: urgencyLevel !== "routine" || communicationProfile !== "none",
    needsSbar: communicationProfile !== "none",
    format: answerDepth === "short" && communicationProfile === "none" && detailProfile === "lean" ? "short" : "sectioned",
    confidence,
    source,
    reason: "",
  };

  if (refinement) {
    if (refinement.intentOverride) decision.intent = refinement.intentOverride;
    if (refinement.riskOverride) decision.risk = refinement.riskOverride;
    if (refinement.entityClarityOverride) decision.entityClarity = refinement.entityClarityOverride;
    if (refinement.urgencyOverride) decision.urgencyLevel = refinement.urgencyOverride;
    if (refinement.detailProfileOverride) decision.detailProfile = refinement.detailProfileOverride;
    if (refinement.communicationProfileOverride) decision.communicationProfile = refinement.communicationProfileOverride;
    if (refinement.exceptionProfileOverride) decision.exceptionProfile = refinement.exceptionProfileOverride;
    if (typeof refinement.pairedProblemOverride === "boolean") decision.pairedProblemNeed = refinement.pairedProblemOverride;
  }

  decision = reconcileDecision(decision, signals);
  decision.reason = buildReason(decision, signals);
  return { decision, signals };
}

function sanitizeOneOf<T extends string>(value: unknown, allowed: readonly T[]) {
  const text = String(value ?? "").trim();
  return (allowed.find((item) => item === text) ?? null) as T | null;
}

function parseRouterRefinement(raw: string): MedSafetyRouterRefinement | null {
  try {
    const parsed = JSON.parse(String(raw ?? "").trim()) as Record<string, unknown>;
    const refinement: MedSafetyRouterRefinement = {
      intentOverride: sanitizeOneOf(parsed.intentOverride, MED_SAFETY_INTENTS) ?? undefined,
      riskOverride: sanitizeOneOf(parsed.riskOverride, MED_SAFETY_RISKS) ?? undefined,
      entityClarityOverride: sanitizeOneOf(parsed.entityClarityOverride, ["high", "medium", "low"] as const) ?? undefined,
      urgencyOverride: sanitizeOneOf(parsed.urgencyOverride, MED_SAFETY_URGENCY_LEVELS) ?? undefined,
      detailProfileOverride: sanitizeOneOf(parsed.detailProfileOverride, MED_SAFETY_DETAIL_PROFILES) ?? undefined,
      communicationProfileOverride: sanitizeOneOf(parsed.communicationProfileOverride, MED_SAFETY_COMMUNICATION_PROFILES) ?? undefined,
      exceptionProfileOverride: sanitizeOneOf(parsed.exceptionProfileOverride, MED_SAFETY_EXCEPTION_PROFILES) ?? undefined,
      pairedProblemOverride:
        typeof parsed.pairedProblemOverride === "boolean"
          ? parsed.pairedProblemOverride
          : typeof parsed.pairedProblemOverride === "string"
            ? parsed.pairedProblemOverride === "true"
            : undefined,
      reason: clampReason(String(parsed.reason ?? "")),
    };

    if (
      !refinement.intentOverride &&
      !refinement.riskOverride &&
      !refinement.entityClarityOverride &&
      !refinement.urgencyOverride &&
      !refinement.detailProfileOverride &&
      !refinement.communicationProfileOverride &&
      !refinement.exceptionProfileOverride &&
      typeof refinement.pairedProblemOverride !== "boolean"
    ) {
      return null;
    }
    return refinement;
  } catch {
    return null;
  }
}

function buildCompactRouteSummary(decision: MedSafetyInternalDecision) {
  return [
    `intent=${decision.intent}`,
    `risk=${decision.risk}`,
    `clarity=${decision.entityClarity}`,
    `depth=${decision.answerDepth}`,
    `urgency=${decision.urgencyLevel}`,
    `workflow=${decision.workflowStage}`,
    `detail=${decision.detailProfile}`,
    `comm=${decision.communicationProfile}`,
    `exception=${decision.exceptionProfile}`,
  ].join(" ");
}

function buildPromptLineDescriptor(args: MedSafetyPromptLineDescriptor): MedSafetyPromptLineDescriptor {
  return {
    ...args,
    text: normalizeText(args.text),
    coverageTags: uniqueStrings(args.coverageTags),
  };
}

function buildDefaultClauseDescriptors(locale: "ko" | "en"): MedSafetyPromptLineDescriptor[] {
  if (locale === "en") {
    return [
      buildPromptLineDescriptor({
        text: "You are a clinical AI for nurses. The top priority of every answer is to tell the nurse, quickly and clearly, what this situation means and what to do next.",
        source: "default",
        section: "principles",
        coverageTags: ["role_goal"],
        isQuestionSpecific: false,
        defaultClauseId: "default_role_and_goal",
      }),
      buildPromptLineDescriptor({
        text: "Favor information that can be used immediately in clinical practice over textbook explanation. Write so the key distinction and decision point are easy to remember, combining practical guidance with learning value.",
        source: "default",
        section: "principles",
        coverageTags: ["practical_over_textbook", "practical_plus_learning"],
        isQuestionSpecific: false,
        defaultClauseId: "default_practical_plus_learning",
      }),
      buildPromptLineDescriptor({
        text: "In risky situations, put action and escalation before explanation. If the question is mixed, put action and safety first and background explanation after.",
        source: "default",
        section: "principles",
        coverageTags: ["risk_action_first", "mixed_action_safety_first"],
        isQuestionSpecific: false,
        defaultClauseId: "default_risk_first",
      }),
      buildPromptLineDescriptor({
        text: "For action or response questions, organize the answer around the key judgment, what to do now, what to check, common cause candidates, and when to stop or report.",
        source: "default",
        section: "principles",
        coverageTags: ["action_question_order"],
        isQuestionSpecific: false,
        defaultClauseId: "default_action_order",
      }),
      buildPromptLineDescriptor({
        text: "For equipment or device questions, prioritize troubleshooting and immediate corrective action over mechanism.",
        source: "default",
        section: "principles",
        coverageTags: ["device_troubleshooting_first"],
        isQuestionSpecific: false,
        defaultClauseId: "default_device_troubleshooting",
      }),
      buildPromptLineDescriptor({
        text: "Do not guess when details are uncertain. The final authority is local protocol, clinician orders, pharmacy guidance, and the manufacturer IFU.",
        source: "default",
        section: "principles",
        coverageTags: ["uncertainty_guard", "protocol_caveat"],
        isQuestionSpecific: false,
        defaultClauseId: "default_uncertainty_protocol",
      }),
      buildPromptLineDescriptor({
        text: "Give the core answer within the first 1-2 sentences, and keep the wording short, readable, and non-repetitive without trimming essential clinical judgment, safety warnings, stop-report thresholds, or required exceptions.",
        source: "default",
        section: "principles",
        coverageTags: ["direct_answer_early", "brevity_and_readability"],
        isQuestionSpecific: false,
        defaultClauseId: "default_opening_direct_answer",
      }),
      buildPromptLineDescriptor({
        text: "For comparison questions, weave in the fastest practical distinction criterion naturally instead of forcing a rigid mini-block.",
        source: "default",
        section: "principles",
        coverageTags: ["fast_distinction_point"],
        isQuestionSpecific: false,
        defaultClauseId: "default_fast_distinction_point",
      }),
      buildPromptLineDescriptor({
        text: "For action or response questions, include the bedside check sequence naturally in the flow when it materially changes the next step.",
        source: "default",
        section: "principles",
        coverageTags: ["quick_check_sequence"],
        isQuestionSpecific: false,
        defaultClauseId: "default_quick_check_sequence",
      }),
      buildPromptLineDescriptor({
        text: "Add those two elements only when they are needed, do not let them make the answer longer, and do not force a low-priority explanatory point into a standalone section if it fits better inside a nearby core section.",
        source: "default",
        section: "principles",
        coverageTags: ["quick_elements_length_guard", "brevity_and_readability"],
        isQuestionSpecific: false,
        defaultClauseId: "default_quick_elements_length_guard",
      }),
    ];
  }

  return [
    buildPromptLineDescriptor({
      text: "너는 간호사 전용 임상 AI다. 답변의 최우선 목표는 간호사가 지금 이 상황에서 무엇을 이해해야 하고 무엇을 해야 하는지 빠르고 명확하게 알려주는 것이다.",
      source: "default",
      section: "principles",
      coverageTags: ["role_goal"],
      isQuestionSpecific: false,
      defaultClauseId: "default_role_and_goal",
    }),
    buildPromptLineDescriptor({
      text: "답변은 교과서식 설명보다 임상 실무에서 바로 쓸 수 있는 정보 중심으로 작성한다. 동시에 핵심 차이와 판단 포인트가 기억되도록, 실무형이면서 학습형으로 쓴다.",
      source: "default",
      section: "principles",
      coverageTags: ["practical_over_textbook", "practical_plus_learning"],
      isQuestionSpecific: false,
      defaultClauseId: "default_practical_plus_learning",
    }),
    buildPromptLineDescriptor({
      text: "위험 상황에서는 설명보다 행동과 escalation을 먼저 제시한다. 질문이 혼합형이면 행동과 안전을 먼저, 배경 설명은 그 다음에 둔다.",
      source: "default",
      section: "principles",
      coverageTags: ["risk_action_first", "mixed_action_safety_first"],
      isQuestionSpecific: false,
      defaultClauseId: "default_risk_first",
    }),
    buildPromptLineDescriptor({
      text: "행동/대응 질문은 가능하면 핵심 판단, 지금 할 일, 확인 포인트, 흔한 원인 후보, 중단/보고 기준 순으로 정리한다.",
      source: "default",
      section: "principles",
      coverageTags: ["action_question_order"],
      isQuestionSpecific: false,
      defaultClauseId: "default_action_order",
    }),
    buildPromptLineDescriptor({
      text: "장비/기구 질문은 원리보다 트러블슈팅과 바로 할 조치를 우선한다.",
      source: "default",
      section: "principles",
      coverageTags: ["device_troubleshooting_first"],
      isQuestionSpecific: false,
      defaultClauseId: "default_device_troubleshooting",
    }),
    buildPromptLineDescriptor({
      text: "불확실한 내용은 추정하지 않는다. 최종 기준은 기관 프로토콜, 의사 지시, 약제부, 제조사 IFU다.",
      source: "default",
      section: "principles",
      coverageTags: ["uncertainty_guard", "protocol_caveat"],
      isQuestionSpecific: false,
      defaultClauseId: "default_uncertainty_protocol",
    }),
    buildPromptLineDescriptor({
      text: "첫 1~2문장 안에 핵심 답을 주고, 반복 없이 짧고 읽기 쉽게 쓰되 중요한 임상 판단, 안전 경고, 중단/보고 기준, 필수 예외는 줄이지 않는다.",
      source: "default",
      section: "principles",
      coverageTags: ["direct_answer_early", "brevity_and_readability"],
      isQuestionSpecific: false,
      defaultClauseId: "default_opening_direct_answer",
    }),
    buildPromptLineDescriptor({
      text: "비교/구분 질문에서는 실무에서 가장 빨리 구분되는 기준을 문맥에 맞게 자연스럽게 포함한다.",
      source: "default",
      section: "principles",
      coverageTags: ["fast_distinction_point"],
      isQuestionSpecific: false,
      defaultClauseId: "default_fast_distinction_point",
    }),
    buildPromptLineDescriptor({
      text: "행동/대응 질문에서는 bedside에서 확인할 순서를 흐름에 맞게 자연스럽게 포함한다.",
      source: "default",
      section: "principles",
      coverageTags: ["quick_check_sequence"],
      isQuestionSpecific: false,
      defaultClauseId: "default_quick_check_sequence",
    }),
    buildPromptLineDescriptor({
      text: "두 요소는 필요할 때만 추가하고, 답변 길이를 늘리지 않는다. 우선순위가 낮은 설명성 포인트는 주변 핵심 섹션에 자연스럽게 흡수할 수 있으면 굳이 독립 섹션으로 만들지 않는다.",
      source: "default",
      section: "principles",
      coverageTags: ["quick_elements_length_guard", "brevity_and_readability"],
      isQuestionSpecific: false,
      defaultClauseId: "default_quick_elements_length_guard",
    }),
  ];
}

function buildBaseSpineDescriptors(locale: "ko" | "en"): MedSafetyPromptLineDescriptor[] {
  if (locale === "en") {
    return [
      buildPromptLineDescriptor({
        text: "You must return a non-empty final answer to the user's actual question. Never stop at planning only.",
        source: "base",
        section: "output",
        coverageTags: ["non_empty_answer"],
        isQuestionSpecific: false,
      }),
      buildPromptLineDescriptor({
        text: "Do not expose route, pack, artifact, or any internal planning language.",
        source: "base",
        section: "output",
        coverageTags: ["no_internal_terms"],
        isQuestionSpecific: false,
      }),
      buildPromptLineDescriptor({
        text: "Use natural bedside clinical English.",
        source: "base",
        section: "output",
        coverageTags: ["locale_natural_language"],
        isQuestionSpecific: false,
      }),
      buildPromptLineDescriptor({
        text: "Default to one plain summary sentence followed by at most 2 bullets per section; allow a 3rd bullet only when risk, reporting, or exception boundaries would otherwise be underspecified.",
        source: "base",
        section: "output",
        coverageTags: ["brevity_and_readability", "render_card_shape"],
        isQuestionSpecific: false,
      }),
      buildPromptLineDescriptor({
        text: "Keep each bullet to one sentence by default, stretching to 2 sentences only when that prevents clinically important loss.",
        source: "base",
        section: "output",
        coverageTags: ["brevity_and_readability"],
        isQuestionSpecific: false,
      }),
    ];
  }

  return [
    buildPromptLineDescriptor({
      text: "반드시 사용자의 실제 질문에 대한 비어 있지 않은 최종 답변을 작성한다. 계획만 세우고 멈추지 않는다.",
      source: "base",
      section: "output",
      coverageTags: ["non_empty_answer"],
      isQuestionSpecific: false,
    }),
    buildPromptLineDescriptor({
      text: "route, pack, artifact 같은 내부 설계 용어는 출력하지 않는다.",
      source: "base",
      section: "output",
      coverageTags: ["no_internal_terms"],
      isQuestionSpecific: false,
    }),
    buildPromptLineDescriptor({
      text: "최종 답변은 자연스러운 한국어 존댓말로 쓴다.",
      source: "base",
      section: "output",
      coverageTags: ["locale_natural_language"],
      isQuestionSpecific: false,
    }),
    buildPromptLineDescriptor({
      text: "각 섹션은 핵심 요약 1문장 뒤에 기본 2개 이내 bullet로 정리하고, 위험도·보고 필요·예외 경계 때문에 부족해질 때만 3번째 bullet을 허용한다.",
      source: "base",
      section: "output",
      coverageTags: ["brevity_and_readability", "render_card_shape"],
      isQuestionSpecific: false,
    }),
    buildPromptLineDescriptor({
      text: "각 bullet은 기본 1문장으로 쓰고, 임상적으로 중요한 내용이 빠질 때만 2문장까지 늘린다.",
      source: "base",
      section: "output",
      coverageTags: ["brevity_and_readability"],
      isQuestionSpecific: false,
    }),
  ];
}

function buildBaseSpineLines(locale: "ko" | "en") {
  return buildBaseSpineDescriptors(locale).map((descriptor) => descriptor.text);
}

function buildDefaultPrincipleLines(locale: "ko" | "en") {
  return buildDefaultClauseDescriptors(locale).map((descriptor) => descriptor.text);
}

function buildSectionTitle(id: MedSafetyPromptLineSection, locale: "ko" | "en") {
  const ko: Record<MedSafetyPromptLineSection, string> = {
    principles: "[기본 원칙]",
    question_fit: "[질문 맞춤 초점]",
    priority: "[우선순위]",
    coverage: "[확인 범위]",
    boundary: "[예외·보고·안전]",
    output: "[출력 형식]",
  };
  const en: Record<MedSafetyPromptLineSection, string> = {
    principles: "[CORE PRINCIPLES]",
    question_fit: "[QUESTION FIT]",
    priority: "[PRIORITY]",
    coverage: "[COVERAGE]",
    boundary: "[BOUNDARY AND SAFETY]",
    output: "[OUTPUT SHAPE]",
  };
  return locale === "en" ? en[id] : ko[id];
}

function buildContractDescriptor(id: MedSafetyPromptContractId, locale: "ko" | "en"): MedSafetyPromptLineDescriptor | null {
  const ko: Partial<Record<MedSafetyPromptContractId, MedSafetyPromptLineDescriptor>> = {
    intent_knowledge: buildPromptLineDescriptor({
      text: "이번 질문에서는 정의 나열보다 임상 의미와 간호 판단 포인트를 먼저 남긴다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["practical_over_textbook", "knowledge_meaning_focus"],
      isQuestionSpecific: true,
    }),
    intent_action: buildPromptLineDescriptor({
      text: "이번 질문에서 실제 행동 순서를 바꾸는 확인만 남기고, 배경 설명은 그 순서를 바꾸는 범위만 둔다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["action_question_order", "mixed_priority_delta"],
      isQuestionSpecific: true,
    }),
    intent_compare: buildPromptLineDescriptor({
      text: "이번 비교에서는 후보 설명을 길게 나열하지 말고 실제 선택을 바꾸는 기준만 남긴다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["mixed_priority_delta"],
      isQuestionSpecific: true,
    }),
    intent_numeric: buildPromptLineDescriptor({
      text: "숫자 자체 설명보다 숫자가 지금 의미하는 판단과 다음 행동 연결만 남긴다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["numeric_action_link"],
      isQuestionSpecific: true,
    }),
    risk_high_modifier: buildPromptLineDescriptor({
      text: "이번 질문에서는 즉시 중단·보고 기준과 escalation 신호를 흐리지 않는다.",
      source: "contract",
      section: "priority",
      coverageTags: ["high_risk_stop_report"],
      isQuestionSpecific: true,
    }),
    risk_mixed_modifier: buildPromptLineDescriptor({
      text: "행동과 설명이 섞인 질문이므로 배경은 선택을 바꾸는 포인트만 남긴다.",
      source: "contract",
      section: "priority",
      coverageTags: ["mixed_action_safety_first", "mixed_priority_delta"],
      isQuestionSpecific: true,
    }),
    communication_modifier: buildPromptLineDescriptor({
      text: "보고가 필요하면 mode·setting, 환자 상태, 핵심 수치, 이미 확인한 항목을 한 묶음으로 정리한다.",
      source: "contract",
      section: "boundary",
      coverageTags: ["reporting_bundle", "notify_payload"],
      isQuestionSpecific: true,
    }),
    exception_modifier: buildPromptLineDescriptor({
      text: "주 추천이 언제 깨지는지와 대안을 열게 만드는 조건을 짧게 분리한다.",
      source: "contract",
      section: "boundary",
      coverageTags: ["exception_boundary"],
      isQuestionSpecific: true,
    }),
    ambiguity_modifier: buildPromptLineDescriptor({
      text: "대상이 완전히 특정되지 않으면 세팅, 용량, 호환성, 기구 고유값을 단정하지 않는다.",
      source: "contract",
      section: "boundary",
      coverageTags: ["uncertainty_guard", "ambiguity_specificity_guard"],
      isQuestionSpecific: true,
    }),
    domain_vent_abga: buildPromptLineDescriptor({
      text: "이번 질문에서는 환기 문제와 산소화 문제를 섞지 말고 분리해 각 레버를 설명한다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["vent_oxygenation_split", "paired_problem_split"],
      isQuestionSpecific: true,
    }),
    domain_med_device: buildPromptLineDescriptor({
      text: "이번 질문에서는 원리 설명을 늘리기보다 line tracing, stop rule, patient response, alarm context처럼 바로 조치를 바꾸는 신호를 먼저 둔다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["device_troubleshooting_first", "device_tracing_stop_rule"],
      isQuestionSpecific: true,
    }),
    domain_reporting: buildPromptLineDescriptor({
      text: "이번 질문에서는 왜 보고가 필요한지보다, 다음 의사결정에 필요한 최소 데이터 묶음을 먼저 보여준다.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["reporting_bundle"],
      isQuestionSpecific: true,
    }),
    output_safety_guard: buildPromptLineDescriptor({
      text: "기관·제조사 고유 기준은 안전을 지키는 데 필요할 때만 짧게 남긴다.",
      source: "contract",
      section: "boundary",
      coverageTags: ["protocol_caveat"],
      isQuestionSpecific: false,
    }),
    output_no_meta_guard: buildPromptLineDescriptor({
      text: "route, pack, artifact 같은 내부 설계 용어는 절대 출력하지 않는다.",
      source: "contract",
      section: "output",
      coverageTags: ["no_internal_terms"],
      isQuestionSpecific: false,
    }),
  };

  const en: Partial<Record<MedSafetyPromptContractId, MedSafetyPromptLineDescriptor>> = {
    intent_knowledge: buildPromptLineDescriptor({
      text: "For this question, keep the clinical meaning and nursing decision point ahead of definition-style explanation.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["practical_over_textbook", "knowledge_meaning_focus"],
      isQuestionSpecific: true,
    }),
    intent_action: buildPromptLineDescriptor({
      text: "For this question, keep only the checks that would change the action order, and keep background explanation only where it changes that order.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["action_question_order", "mixed_priority_delta"],
      isQuestionSpecific: true,
    }),
    intent_compare: buildPromptLineDescriptor({
      text: "For this comparison, start with the practical split that changes the choice fastest.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["compare_priority"],
      isQuestionSpecific: true,
    }),
    intent_numeric: buildPromptLineDescriptor({
      text: "Keep the link between the number, its meaning, and the next action rather than expanding numeric teaching.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["numeric_action_link"],
      isQuestionSpecific: true,
    }),
    risk_high_modifier: buildPromptLineDescriptor({
      text: "Keep immediate stop-report boundaries and escalation triggers explicit for this question.",
      source: "contract",
      section: "priority",
      coverageTags: ["high_risk_stop_report"],
      isQuestionSpecific: true,
    }),
    risk_mixed_modifier: buildPromptLineDescriptor({
      text: "Because this question mixes action and explanation, keep background only where it changes the next choice.",
      source: "contract",
      section: "priority",
      coverageTags: ["mixed_action_safety_first", "mixed_priority_delta"],
      isQuestionSpecific: true,
    }),
    communication_modifier: buildPromptLineDescriptor({
      text: "If reporting is needed, group mode or setting, patient status, key numbers, and what is already checked into one bundle.",
      source: "contract",
      section: "boundary",
      coverageTags: ["reporting_bundle", "notify_payload"],
      isQuestionSpecific: true,
    }),
    exception_modifier: buildPromptLineDescriptor({
      text: "Separate briefly when the main recommendation stops being safe and what opens the alternative path.",
      source: "contract",
      section: "boundary",
      coverageTags: ["exception_boundary"],
      isQuestionSpecific: true,
    }),
    ambiguity_modifier: buildPromptLineDescriptor({
      text: "If the target is not fully identified, do not lock in settings, doses, compatibility, or device-specific values.",
      source: "contract",
      section: "boundary",
      coverageTags: ["uncertainty_guard", "ambiguity_specificity_guard"],
      isQuestionSpecific: true,
    }),
    domain_vent_abga: buildPromptLineDescriptor({
      text: "For this question, separate ventilation from oxygenation so each lever stays tied to its own purpose.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["vent_oxygenation_split", "paired_problem_split"],
      isQuestionSpecific: true,
    }),
    domain_med_device: buildPromptLineDescriptor({
      text: "For this question, prioritize line tracing, stop rules, patient response, and alarm context over mechanism explanation.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["device_troubleshooting_first", "device_tracing_stop_rule"],
      isQuestionSpecific: true,
    }),
    domain_reporting: buildPromptLineDescriptor({
      text: "For this question, show the minimum data bundle that helps the next clinical decision rather than explaining why reporting matters.",
      source: "contract",
      section: "question_fit",
      coverageTags: ["reporting_bundle"],
      isQuestionSpecific: true,
    }),
    output_safety_guard: buildPromptLineDescriptor({
      text: "Mention site-specific or manufacturer-specific thresholds only when they materially protect safety.",
      source: "contract",
      section: "boundary",
      coverageTags: ["protocol_caveat"],
      isQuestionSpecific: false,
    }),
    output_no_meta_guard: buildPromptLineDescriptor({
      text: "Do not expose route, pack, artifact, or any internal planning language.",
      source: "contract",
      section: "output",
      coverageTags: ["no_internal_terms"],
      isQuestionSpecific: false,
    }),
  };

  const table = locale === "en" ? en : ko;
  return table[id] ?? null;
}

function buildMacroContractDescriptors(contractIds: MedSafetyPromptContractId[], locale: "ko" | "en") {
  const selected = new Set(contractIds);
  const descriptors: MedSafetyPromptLineDescriptor[] = [];

  const pushFirst = (ids: MedSafetyPromptContractId[]) => {
    for (const id of ids) {
      if (!selected.has(id)) continue;
      const descriptor = buildContractDescriptor(id, locale);
      if (descriptor) descriptors.push(descriptor);
      return;
    }
  };

  pushFirst(["intent_action", "intent_compare", "intent_numeric", "intent_knowledge"]);
  pushFirst(["risk_high_modifier", "risk_mixed_modifier"]);
  pushFirst(["domain_vent_abga", "domain_med_device", "domain_reporting"]);
  pushFirst(["communication_modifier", "exception_modifier", "ambiguity_modifier", "output_safety_guard", "output_no_meta_guard"]);

  const deduped: MedSafetyPromptLineDescriptor[] = [];
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    const key = normalizePromptLineForDedupe(descriptor.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(descriptor);
  }
  return deduped.slice(0, 4);
}

function buildProjectionDescriptors(
  projection: MedSafetyPromptBlueprint["projection"],
  keys: MedSafetyPromptBlueprint["projection"]["activeDirectiveKeys"]
) {
  const descriptors: MedSafetyPromptLineDescriptor[] = [];
  for (const key of keys) {
    const value = projection[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const text = value.trim();
    if (key === "openingDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "priority",
          coverageTags: ["direct_answer_early", "brevity_and_readability"],
          isQuestionSpecific: false,
        })
      );
      continue;
    }
    if (key === "priorityDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "priority",
          coverageTags: ["risk_action_first", "mixed_action_safety_first"],
          isQuestionSpecific: false,
        })
      );
      continue;
    }
    if (key === "coverageDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "coverage",
          coverageTags:
            /환기 문제와 산소화 문제|ventilation from oxygenation|linked problems|얽혀 있는 두 문제/i.test(text)
              ? ["bedside_checks", "vent_oxygenation_split", "paired_problem_split"]
              : ["bedside_checks"],
          isQuestionSpecific: true,
        })
      );
      continue;
    }
    if (key === "exceptionDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "boundary",
          coverageTags: ["exception_boundary", "measurement_guard"],
          isQuestionSpecific: true,
        })
      );
      continue;
    }
    if (key === "communicationDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "boundary",
          coverageTags: /2-3 sentence|2~3문장/i.test(text) ? ["notify_payload", "notify_script"] : ["notify_payload"],
          isQuestionSpecific: true,
        })
      );
      continue;
    }
    if (key === "safetyDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "boundary",
          coverageTags: ["uncertainty_guard", "protocol_caveat"],
          isQuestionSpecific: false,
        })
      );
      continue;
    }
    if (key === "compressionDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "output",
          coverageTags: ["brevity_and_readability"],
          isQuestionSpecific: false,
        })
      );
      continue;
    }
    if (key === "renderDirective") {
      descriptors.push(
        buildPromptLineDescriptor({
          text,
          source: "projection",
          section: "output",
          coverageTags: ["render_card_shape", "no_internal_terms"],
          isQuestionSpecific: false,
        })
      );
    }
  }

  if (projection.needsFastDistinctionPoint) {
    descriptors.push(
      buildPromptLineDescriptor({
        text:
          "이번 답변에는 “빠른 구분 포인트”를 한 줄만 추가하고, 설명 문장은 붙이지 않는다.",
        source: "projection",
        section: "question_fit",
        coverageTags: ["fast_distinction_point"],
        isQuestionSpecific: true,
      })
    );
  }

  if (projection.needsQuickCheckSequence) {
    descriptors.push(
      buildPromptLineDescriptor({
        text:
          "이번 답변에는 “빠른 확인 순서”를 3~5단계 화살표 한 줄로만 추가한다.",
        source: "projection",
        section: "coverage",
        coverageTags: ["quick_check_sequence"],
        isQuestionSpecific: true,
      })
    );
  }

  return descriptors;
}

function applySemanticOverlapSuppression(
  defaultDescriptors: MedSafetyPromptLineDescriptor[],
  dynamicDescriptors: MedSafetyPromptLineDescriptor[]
) {
  const kept: MedSafetyPromptLineDescriptor[] = [];
  const defaultNormalizeds = defaultDescriptors.map((descriptor) => normalizePromptLineForDedupe(descriptor.text)).filter(Boolean);
  const defaultTagSet = new Set<MedSafetySemanticCoverageTag>(defaultDescriptors.flatMap((descriptor) => descriptor.coverageTags));
  const seenNormalized = new Set(defaultNormalizeds);

  for (const descriptor of dynamicDescriptors) {
    const normalized = normalizePromptLineForDedupe(descriptor.text);
    if (!normalized) continue;

    const uniqueTags = descriptor.coverageTags.filter((tag) => !defaultTagSet.has(tag));
    const overlapsDefaultTag = descriptor.coverageTags.some((tag) => defaultTagSet.has(tag));
    const nearDefault = defaultNormalizeds.some((base) => base.includes(normalized) || normalized.includes(base));

    if (seenNormalized.has(normalized)) continue;
    if (overlapsDefaultTag && uniqueTags.length === 0 && !descriptor.isQuestionSpecific) continue;
    if (overlapsDefaultTag && uniqueTags.length === 0 && descriptor.isQuestionSpecific && nearDefault) continue;
    if (!descriptor.isQuestionSpecific && nearDefault) continue;

    const existingIndex = kept.findIndex((item) => normalizePromptLineForDedupe(item.text) === normalized);
    if (existingIndex >= 0) {
      if (!kept[existingIndex]!.isQuestionSpecific && descriptor.isQuestionSpecific) kept[existingIndex] = descriptor;
      continue;
    }

    kept.push(descriptor);
    seenNormalized.add(normalized);
  }

  return kept;
}

function buildPromptLineDescriptors(args: {
  locale: "ko" | "en";
  contractIds: MedSafetyPromptContractId[];
  blueprint: MedSafetyPromptBlueprint;
  directiveKeys: MedSafetyPromptBlueprint["projection"]["activeDirectiveKeys"];
}) {
  const defaultDescriptors = buildDefaultClauseDescriptors(args.locale);
  const dynamicDescriptors = [
    ...buildMacroContractDescriptors(args.contractIds, args.locale),
    ...buildProjectionDescriptors(args.blueprint.projection, args.directiveKeys),
    ...buildBaseSpineDescriptors(args.locale),
  ];
  return [...defaultDescriptors, ...applySemanticOverlapSuppression(defaultDescriptors, dynamicDescriptors)];
}

function buildPromptSections(args: {
  locale: "ko" | "en";
  contractIds: MedSafetyPromptContractId[];
  blueprint: MedSafetyPromptBlueprint;
  directiveKeys: MedSafetyPromptBlueprint["projection"]["activeDirectiveKeys"];
}) {
  const descriptors = buildPromptLineDescriptors(args);
  const orderedSections: MedSafetyPromptLineSection[] = ["principles", "question_fit", "priority", "coverage", "boundary", "output"];

  return orderedSections
    .map((sectionId) => {
      const sectionLines = descriptors
        .filter((descriptor) => descriptor.section === sectionId)
        .map((descriptor) => descriptor.text.trim());
      return {
        id: sectionId,
        title: buildSectionTitle(sectionId, args.locale),
        lines: sectionLines,
      } satisfies PromptVisualSection;
    })
    .filter((section) => section.lines.length);
}

function buildFixedBasePrompt(locale: "ko" | "en") {
  return formatPromptSections(
    ["principles", "output"].map((sectionId) => ({
      id: sectionId as MedSafetyPromptLineSection,
      title: buildSectionTitle(sectionId as MedSafetyPromptLineSection, locale),
      lines:
        sectionId === "principles"
          ? buildDefaultPrincipleLines(locale)
          : buildBaseSpineLines(locale),
    }))
  ).join("\n");
}

function formatPromptSections(sections: PromptVisualSection[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const uniqueLines: string[] = [];
    for (const line of section.lines) {
      const normalized = normalizePromptLineForDedupe(line);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      uniqueLines.push(line.trim());
    }
    if (!uniqueLines.length) continue;
    if (out.length) out.push("");
    out.push(section.title);
    for (const line of uniqueLines) out.push(`- ${line}`);
  }

  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function scoreOptionalContracts(decision: MedSafetyInternalDecision, query: string) {
  const normalizedQuery = normalizeQuery(query);
  const scores = new Map<MedSafetyPromptContractId, number>();
  const setScore = (id: MedSafetyPromptContractId, score: number) => {
    if (score > 0) scores.set(id, score);
  };

  setScore(`intent_${decision.intent}` as MedSafetyPromptContractId, 100);
  if (decision.risk === "high") setScore("risk_high_modifier", 88);
  if (decision.secondaryIntentCluster.length || decision.intent === "action") setScore("risk_mixed_modifier", 72);
  if (decision.reportingNeed || decision.communicationProfile !== "none") setScore("communication_modifier", 82);
  if (decision.exceptionProfile !== "none" || decision.measurementGuardNeed || decision.pairedProblemNeed) setScore("exception_modifier", 79);
  if (decision.entityClarity !== "high") setScore("ambiguity_modifier", 76);
  if (decision.specificityRisk !== "low") setScore("output_safety_guard", 74);
  setScore("output_no_meta_guard", 66);

  if (/(abga|pao2|paco2|fio2|peep|rr|vt|vte|vent|ards|환기|산소화|호흡성\s*산증)/i.test(normalizedQuery)) {
    setScore("domain_vent_abga", 84);
  }
  if (/(약물|주입|line|라인|pump|펌프|카테터|튜브|compat|호환성|infusion|extravasation|device|alarm|iabp)/i.test(normalizedQuery)) {
    setScore("domain_med_device", 84);
  }
  if (decision.reportingNeed && !scores.has("domain_vent_abga") && !scores.has("domain_med_device")) {
    setScore("domain_reporting", 73);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id, index, arr) => arr.indexOf(id) === index);
}

function resolveBudgetClass(runtimeMode: MedSafetyRuntimeMode, decision: MedSafetyInternalDecision, hasImage: boolean) {
  if (runtimeMode === "legacy") return { budgetClass: "legacy" as const, budgetChars: 2600 };
  if (runtimeMode === "hybrid_shadow") {
    return {
      budgetClass: "shadow" as const,
      budgetChars: hasImage ? 4200 : decision.risk === "high" ? 3400 : 2600,
    };
  }
  return {
    budgetClass: hasImage || decision.risk === "high" ? ("high_risk_or_image" as const) : ("standard" as const),
    budgetChars: hasImage ? 4200 : decision.risk === "high" ? 3400 : 2600,
  };
}

function buildPromptBudgetFit(args: {
  locale: "ko" | "en";
  decision: MedSafetyInternalDecision;
  blueprint: MedSafetyPromptBlueprint;
  budgetChars: number;
  candidateOptionalIds: MedSafetyPromptContractId[];
}) {
  const selectedOptionalIds = args.candidateOptionalIds.slice(0, 4);
  let selectedContractIds = [...BASE_CONTRACT_IDS, ...selectedOptionalIds];
  let droppedContractIds = args.candidateOptionalIds.slice(4);
  const activeDirectiveKeys = [...args.blueprint.projection.activeDirectiveKeys];
  const droppedDirectiveKeys = [...args.blueprint.projection.droppedDirectiveKeys];

  const buildLines = (contractIds: MedSafetyPromptContractId[], directiveKeys: MedSafetyPromptBlueprint["projection"]["activeDirectiveKeys"]) => {
    return formatPromptSections(
      buildPromptSections({
        locale: args.locale,
        contractIds,
        blueprint: args.blueprint,
        directiveKeys,
      })
    );
  };

  let lines = buildLines(selectedContractIds, activeDirectiveKeys);
  let prompt = lines.join("\n");

  const dropDirective = () => {
    for (const key of PROMPT_COMPRESSION_DROP_ORDER) {
      const index = activeDirectiveKeys.indexOf(key);
      if (index >= 0) {
        activeDirectiveKeys.splice(index, 1);
        if (!droppedDirectiveKeys.includes(key)) droppedDirectiveKeys.push(key);
        return true;
      }
    }
    return false;
  };

  const dropContract = () => {
    for (const contractId of CONTRACT_DROP_ORDER) {
      if (BASE_CONTRACT_IDS.includes(contractId)) continue;
      const index = selectedContractIds.indexOf(contractId);
      if (index >= 0) {
        selectedContractIds.splice(index, 1);
        if (!droppedContractIds.includes(contractId)) droppedContractIds.push(contractId);
        return true;
      }
    }
    return false;
  };

  while (prompt.length > args.budgetChars) {
    if (dropDirective()) {
      lines = buildLines(selectedContractIds, activeDirectiveKeys);
      prompt = lines.join("\n");
      continue;
    }
    if (dropContract()) {
      lines = buildLines(selectedContractIds, activeDirectiveKeys);
      prompt = lines.join("\n");
      continue;
    }
    break;
  }

  return {
    selectedContractIds: uniqueStrings(selectedContractIds),
    droppedContractIds: uniqueStrings(droppedContractIds),
    activeDirectiveKeys: uniqueStrings(activeDirectiveKeys),
    droppedDirectiveKeys: uniqueStrings(droppedDirectiveKeys),
    lines,
  } satisfies PromptBudgetFit;
}

// ---------------------------------------------------------------------------
// Narrative prompt system (Phase 2+3 reform)
// ---------------------------------------------------------------------------

function describeIntentKo(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, hasImage: boolean) {
  if (decision.intent === "knowledge") {
    if (signals.asksQuestionSolving) return hasImage ? "이미지 기반 문제 풀이/해설 질문" : "문제 풀이/해설 질문";
    if (signals.asksImageInterpretation) return "이미지 기반 설명/판독 질문";
    if (signals.asksConceptExplanation) return "임상 지식/설명 질문";
  }
  if (decision.intent === "numeric" && signals.asksImageInterpretation) return "이미지 포함 수치/해석 질문";
  if (decision.intent === "device" && signals.asksImageInterpretation && !signals.explicitActionRequest) {
    return "이미지 포함 장비/기구 판독 질문";
  }
  const intentMap: Record<MedSafetyRouteDecision["intent"], string> = {
    knowledge: "임상 지식/정의 질문",
    action: "즉시 행동/대응 질문",
    compare: "비교/선택 질문",
    numeric: "수치/해석 질문",
    device: "장비/기구/알람 질문",
  };
  return intentMap[decision.intent];
}

function describeIntentEn(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, hasImage: boolean) {
  if (decision.intent === "knowledge") {
    if (signals.asksQuestionSolving) return hasImage ? "an image-based question-solving/explanation request" : "a question-solving/explanation request";
    if (signals.asksImageInterpretation) return "an image-based explanation/reading request";
    if (signals.asksConceptExplanation) return "a clinical explanation/definition question";
  }
  if (decision.intent === "numeric" && signals.asksImageInterpretation) return "an image-supported numeric interpretation question";
  if (decision.intent === "device" && signals.asksImageInterpretation && !signals.explicitActionRequest) {
    return "an image-supported equipment/device reading question";
  }
  const intentMap: Record<MedSafetyRouteDecision["intent"], string> = {
    knowledge: "a clinical knowledge question",
    action: "an immediate action/response question",
    compare: "a comparison/selection question",
    numeric: "a numeric interpretation question",
    device: "an equipment/device/alarm question",
  };
  return intentMap[decision.intent];
}

function buildRouteNarrativeKo(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, hasImage: boolean): string {
  const parts: string[] = [];

  // 질문 유형 서술
  const intentLabel = describeIntentKo(decision, signals, hasImage);

  // 도메인 서술
  const domainParts: string[] = [];
  if (signals.mentionsMedication) domainParts.push("약물");
  if (signals.mentionsLineOrTube) domainParts.push("라인/튜브");
  if (signals.mentionsVentilation || signals.mentionsABGA) domainParts.push("환기/ABGA");
  if (signals.mentionsAlarm) domainParts.push("알람");
  if (signals.mentionsCompatibility) domainParts.push("호환성");
  if (signals.mentionsSetting) domainParts.push("세팅");
  const domainLabel = domainParts.length ? domainParts.join(", ") + " 관련 " : "";

  parts.push(`이 질문은 ${domainLabel}${intentLabel}이다.`);

  // 위험도 + 명확성
  if (decision.risk === "high") {
    parts.push("위험도가 높으므로 즉시 중단/보고 기준과 escalation 신호를 먼저 제시한다.");
  } else if (decision.risk === "medium") {
    parts.push("주의가 필요한 상황이므로 안전 확인 포인트를 빠뜨리지 않는다.");
  }

  if (decision.entityClarity === "low") {
    parts.push("대상이 완전히 특정되지 않았으므로 용량, 속도, 세팅값, 호환성을 단정하지 않고, 후보를 짧게 제시한 뒤 확인을 권고한다.");
  } else if (decision.entityClarity === "medium") {
    parts.push("대상이 한 후보로 기울지만 단정하기 어려우므로 전제를 짧게 밝힌 뒤 일반적이고 안전한 범위에서 답한다.");
  }

  // 보고/SBAR 필요
  if (decision.communicationProfile === "script") {
    parts.push("보고/노티 스크립트가 필요하므로 SBAR 형식의 실제 보고 예시 문장을 포함한다.");
  } else if (decision.communicationProfile === "payload") {
    parts.push("보고가 필요한 상황이므로 보고 시 전달할 데이터 묶음(mode/setting, 환자 상태, 핵심 수치, 확인 항목)을 정리한다.");
  }

  // 복합 문제
  if (decision.pairedProblemNeed) {
    parts.push("얽혀 있는 두 문제(예: 산소화 vs 환기)를 분리하여 각각의 원인과 대응을 구분한다.");
  }

  // 예외 조건
  if (decision.exceptionProfile === "full") {
    parts.push("대상이 한 후보로 기울지만 단정하기 어려우므로 전제를 짧게 밝힌 뒤 일반적이고 안전한 범위에서 답한다. 주 추천이 깨지는 조건과 대안 경로를 짧게 분리해 제시한다.");
  }

  // 이미지
  if (hasImage) {
    if (signals.asksImageInterpretation && !signals.explicitActionRequest) {
      parts.push("이미지 첨부는 관찰 근거를 연결하는 용도이며, 이미지 존재만으로 즉시 대응 질문으로 올리지 않는다.");
    }
    parts.push("이미지가 포함되어 있으므로 이미지에서 관찰되는 내용을 답변에 연결한다.");
  }

  return parts.join(" ");
}

function buildRouteNarrativeEn(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, hasImage: boolean): string {
  const parts: string[] = [];

  const intentLabel = describeIntentEn(decision, signals, hasImage);

  const domainParts: string[] = [];
  if (signals.mentionsMedication) domainParts.push("medication");
  if (signals.mentionsLineOrTube) domainParts.push("lines/tubes");
  if (signals.mentionsVentilation || signals.mentionsABGA) domainParts.push("ventilation/ABGA");
  if (signals.mentionsAlarm) domainParts.push("alarms");
  if (signals.mentionsCompatibility) domainParts.push("compatibility");
  if (signals.mentionsSetting) domainParts.push("settings");
  const domainLabel = domainParts.length ? `about ${domainParts.join(", ")} — ` : "";

  parts.push(`This is ${intentLabel} ${domainLabel}.`);

  if (decision.risk === "high") {
    parts.push("Risk is high: present stop/report criteria and escalation triggers first.");
  }
  if (decision.entityClarity === "low") {
    parts.push("The target entity is not fully identified — do not assert doses, rates, settings, or compatibility; offer candidates and recommend verification.");
  } else if (decision.entityClarity === "medium") {
    parts.push("The target entity is likely but not certain — state the assumption briefly, then answer within safe general bounds.");
  }
  if (decision.communicationProfile === "script") {
    parts.push("Include an SBAR-style reporting script example.");
  } else if (decision.communicationProfile === "payload") {
    parts.push("Include the data bundle needed for clinician reporting.");
  }
  if (decision.pairedProblemNeed) {
    parts.push("Separate the two linked problems (e.g. oxygenation vs ventilation) so each gets its own cause–response path.");
  }
  if (decision.exceptionProfile === "full") {
    parts.push("Briefly separate when the main recommendation fails and what opens the alternative path.");
  }
  if (hasImage) {
    if (signals.asksImageInterpretation && !signals.explicitActionRequest) {
      parts.push("Treat the image as observational evidence only, not as a reason by itself to upgrade the route to action.");
    }
    parts.push("An image is attached — connect observations from the image to the answer.");
  }

  return parts.join(" ");
}

function buildRouteNarrative(decision: MedSafetyRouteDecision, locale: "ko" | "en", signals: MedSafetyQuestionSignals, hasImage: boolean): string {
  return locale === "en"
    ? buildRouteNarrativeEn(decision, signals, hasImage)
    : buildRouteNarrativeKo(decision, signals, hasImage);
}

export function buildMustIncludeHints(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals, locale: "ko" | "en"): string[] {
  const hints: string[] = [];

  if (locale === "ko") {
    if (decision.risk === "high") hints.push("즉시 중단/보고 기준");
    if (decision.pairedProblemNeed) hints.push("두 문제의 분리 판단 (예: 산소화 vs 환기)");
    if (decision.reversibleCauseNeed) hints.push("가역적 원인 확인 순서");
    if (decision.reportingNeed && decision.communicationProfile !== "none") hints.push("보고 시 필요한 데이터 묶음");
    if (decision.communicationProfile === "script") hints.push("실제 보고/노티 예시 문장");
    if (decision.measurementGuardNeed && decision.entityClarity !== "high") hints.push("수치/세팅의 기관별 차이 주의");
    if (decision.exceptionProfile !== "none") hints.push("주 추천이 적용되지 않는 예외 조건");
    if (decision.falseWorseningNeed) hints.push("가짜 악화/측정 오류 배제법");
    if (signals.asksImmediateAction || decision.intent === "action") hints.push("bedside에서 지금 확인/실행할 순서");
    if (decision.intent === "compare") hints.push("실무에서 가장 빨리 구분하는 기준");
  } else {
    if (decision.risk === "high") hints.push("Immediate stop/report criteria");
    if (decision.pairedProblemNeed) hints.push("Separate judgment for the two linked problems");
    if (decision.reversibleCauseNeed) hints.push("Reversible cause check sequence");
    if (decision.reportingNeed && decision.communicationProfile !== "none") hints.push("Data bundle for clinician reporting");
    if (decision.communicationProfile === "script") hints.push("SBAR reporting script example");
    if (decision.measurementGuardNeed && decision.entityClarity !== "high") hints.push("Site-specific measurement/setting caveats");
    if (decision.exceptionProfile !== "none") hints.push("Exception conditions where main recommendation fails");
    if (decision.falseWorseningNeed) hints.push("How to exclude artifact / measurement error");
    if (signals.asksImmediateAction || decision.intent === "action") hints.push("Bedside check/action sequence");
    if (decision.intent === "compare") hints.push("Fastest practical distinction criterion");
  }

  return hints.slice(0, 4);
}

function buildNarrativeDeveloperPromptKo(
  decision: MedSafetyRouteDecision,
  signals: MedSafetyQuestionSignals,
  hasImage: boolean
): string {
  const routeNarrative = buildRouteNarrativeKo(decision, signals, hasImage);

  const identityBlock = [
    "너는 간호사 전용 임상 AI 어시스턴트다.",
    "모든 답변의 최우선 목표는 간호사가 지금 이 상황에서 무엇을 이해해야 하고 무엇을 해야 하는지 빠르고 명확하게 전달하는 것이다.",
    "교과서식 나열보다 임상 실무에서 바로 쓸 수 있는 정보를 우선하되, 핵심 차이와 판단 포인트가 기억되도록 실무형이면서 학습형으로 쓴다.",
    "위험 상황에서는 설명보다 행동과 escalation을 먼저 제시한다.",
    "약물 용량·수치·가이드라인 출처·시간 기준은 확실한 근거가 있을 때만 명시하고, 추정하거나 만들어 넣지 말며, 불확실하거나 기관·환자별로 달라질 수 있는 내용은 단정하지 말고 '기관 프로토콜 확인 필요' 또는 '의사·약사와 확인하세요'를 구체적으로 명시하라.",
    "근거가 약하거나 상충하는 경우 하나를 사실처럼 확정하지 말고 현재 더 널리 받아들여지는 해석과 예외 가능성을 함께 제시하며, 정보가 부족하거나 범위를 벗어난 질문에는 모른다고 솔직히 밝힌 뒤 추가 확인이 필요한 항목을 구체적으로 나열하라.",
    "간호사가 독자적으로 실행할 수 있는 행동과 반드시 의사 지시가 필요한 행동을 항상 명확히 구분하여 서술하고, 처방 권한이 필요한 행위를 간호사에게 직접 지시하지 마라.",
    "최종 기준은 기관 프로토콜, 의사 지시, 약제부 지침, 제조사 IFU다."
  ].join(" ");

  const focusBlock = routeNarrative;

  const outputLines: string[] = [
    "답변은 제목 없는 결론 문단(1~3문장)으로 시작하고, 필요시 짧은 소제목으로 구분된 섹션을 이어간다.",
    "각 소제목 아래 첫 줄은 해당 내용의 핵심을 한 문장으로 요약한 뒤, 기본 2개 이내 bullet로 세부 내용을 둔다. 위험도·보고 필요·예외 경계 때문에 부족해질 때만 3번째 bullet을 허용한다.",
    "각 bullet은 기본 1문장으로 쓰고, 임상적으로 중요한 내용이 빠질 때만 2문장까지 늘린다.",
  ];

  if (decision.answerDepth === "short" && decision.risk === "low") {
    outputLines.push("이 질문은 단순하므로 결론 문단과 소제목 1~2개 이내로 짧게 끝낸다.");
  } else if (decision.answerDepth === "detailed" || decision.risk === "high") {
    outputLines.push("이 질문은 충분한 깊이가 필요하므로 임상적으로 중요한 내용은 잘리지 않도록 끝까지 쓰되, 같은 의미를 반복하지 않고 각 섹션을 약간 압축한다.");
  } else {
    outputLines.push("질문에 비해 과하지도 빈약하지도 않게, 필요한 범위에서만 구조화한다.");
  }

  outputLines.push(
    decision.risk === "high"
      ? "고위험 답변에서는 섹션 수를 줄이기보다 안전 보존을 우선하고, 즉시 행동, 안전 경고, 보고 기준, 필수 예외를 분명히 남긴다."
      : "저위험/중등도 답변에서는 교육성 배경 설명, 부가 비교 설명, 반복되는 확인 포인트를 인접한 핵심 섹션에 짧게 흡수할 수 있다. 다만 결론, 즉시 행동, 안전 경고, 보고 기준, 고위험 예외 성격의 내용은 독립성을 유지한다.",
    "같은 경고, 주의 문구, 근거를 여러 섹션에 반복하지 말고 가장 적절한 섹션 1곳에만 둔다.",
    "배경 설명은 실제 행동을 바꾸는 범위까지만 짧게 두고, 중요한 임상 판단, 안전 경고, 중단/보고 기준, 필수 예외는 줄이지 않는다.",
    "전체가 하나의 글로 자연스럽게 이어져야 한다.",
    "마크다운 강조(**, ##, 백틱, 표, 코드블록)는 쓰지 않는다. 일반 텍스트와 bullet(-)만 사용한다.",
    "한국어 존댓말로 쓴다.",
    "내부 설계 용어(route, pack, artifact, contract)는 절대 출력하지 않는다.",
  );

  const sections = [
    "[역할과 원칙]",
    identityBlock,
    "",
    "[이 질문의 초점]",
    focusBlock,
    "",
    "[출력 형태]",
    ...outputLines,
  ];

  return sections.join("\n");
}

function buildNarrativeDeveloperPromptEn(
  decision: MedSafetyRouteDecision,
  signals: MedSafetyQuestionSignals,
  hasImage: boolean
): string {
  const routeNarrative = buildRouteNarrativeEn(decision, signals, hasImage);

  const identityBlock = [
    "You are a clinical AI assistant for nurses.",
    "The top priority of every answer is to tell the nurse, quickly and clearly, what this situation means and what to do next.",
    "Favor information that can be used immediately in clinical practice over textbook explanation, while making the key distinction and decision point easy to remember — combining practical guidance with learning value.",
    "Do not guess when details are uncertain; in risky situations, put action and escalation before explanation.",
    "The final authority is local protocol, clinician orders, pharmacy guidance, and the manufacturer IFU.",
  ].join(" ");

  const focusBlock = routeNarrative;

  const outputLines: string[] = [
    "Begin with a titleless conclusion paragraph (1-3 sentences), then continue with short titled sections as needed.",
    "The first line under each title summarizes the section's core point in one sentence, followed by up to 2 bullets by default; allow a 3rd bullet only when risk, reporting, or exception boundaries would otherwise be underspecified.",
    "Keep each bullet to one sentence by default, stretching to 2 sentences only when that prevents clinically important loss.",
  ];

  if (decision.answerDepth === "short" && decision.risk === "low") {
    outputLines.push("This is a simple question — keep it to the conclusion paragraph plus 1-2 short sections.");
  } else if (decision.answerDepth === "detailed" || decision.risk === "high") {
    outputLines.push("This question needs depth — write clinically important content to completion, but keep each section slightly compressed and avoid repeating the same point.");
  } else {
    outputLines.push("Keep the answer neither excessive nor sparse — structure only what the question warrants.");
  }

  outputLines.push(
    decision.risk === "high"
      ? "In high-risk answers, preserve safety before reducing section count, and keep immediate actions, safety warnings, reporting boundaries, and required exceptions explicit."
      : "In low or medium-risk answers, a lower-priority teaching, comparison, or repeated check point may be absorbed into a nearby core section instead of becoming a standalone section. Do not merge away the conclusion, immediate actions, safety warnings, reporting content, or high-risk exception boundaries.",
    "Do not repeat the same warning, caveat, or rationale across multiple sections; keep it in the single section where it fits best.",
    "Keep background explanation brief and only as far as it changes the next action, while leaving essential clinical judgment, safety warnings, stop-report thresholds, and required exceptions intact.",
    "The whole answer must flow as one continuous piece of writing.",
    "Do not use markdown emphasis (**, ##, backticks, tables, code blocks). Use plain text and bullet dashes (-) only.",
    "Write in natural bedside clinical English.",
    "Do not expose internal planning language (route, pack, artifact, contract).",
  );

  const sections = [
    "[ROLE AND PRINCIPLES]",
    identityBlock,
    "",
    "[FOCUS FOR THIS QUESTION]",
    focusBlock,
    "",
    "[OUTPUT SHAPE]",
    ...outputLines,
  ];

  return sections.join("\n");
}

function buildNarrativeDeveloperPrompt(
  decision: MedSafetyRouteDecision,
  locale: "ko" | "en",
  signals: MedSafetyQuestionSignals,
  hasImage: boolean
): string {
  return locale === "en"
    ? buildNarrativeDeveloperPromptEn(decision, signals, hasImage)
    : buildNarrativeDeveloperPromptKo(decision, signals, hasImage);
}

// ---------------------------------------------------------------------------

export function resolveMedSafetyRuntimeMode(): MedSafetyRuntimeMode {
  const raw = String(process.env.OPENAI_MED_SAFETY_RUNTIME_MODE ?? "hybrid_live").trim();
  return sanitizeOneOf(raw, MED_SAFETY_RUNTIME_MODES) ?? "hybrid_live";
}

export function buildDeterministicRouteDecision(input: RouteInput): MedSafetyRouteDecision {
  return synthesizeInternalDecision(input).decision;
}

export function shouldUseTinyRouter(input: RouteInput, deterministic: MedSafetyRouteDecision) {
  const hasImage = Boolean(input.imageDataUrl);
  const signals = buildQuestionSignals(normalizeQuery(input.query), { hasImage });
  return Boolean(
    signals.mixedIntent ||
      (deterministic.risk === "high" && deterministic.entityClarity !== "high") ||
      (signals.mixedNumericAction && (signals.mentionsSetting || signals.mentionsPatientState || signals.mentionsAlarm || signals.mentionsLineOrTube)) ||
      signals.pairedProblem ||
      signals.preNotification ||
      (!hasImage && deterministic.confidence !== "high") ||
      (hasImage &&
        (signals.explicitActionRequest ||
          signals.mixedNumericAction ||
          signals.mentionsAlarm ||
          signals.mentionsSetting ||
          signals.mentionsPatientState ||
          signals.pairedProblem ||
          signals.needsEntityDisambiguation))
  );
}

export function buildTinyRouterDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You refine only uncertain routing fields for a nurse-facing clinical answer system.",
      "Return JSON only.",
      'Allowed keys: intentOverride, riskOverride, entityClarityOverride, urgencyOverride, detailProfileOverride, communicationProfileOverride, exceptionProfileOverride, pairedProblemOverride, reason.',
      "Use overrides only when the safer or more useful route clearly differs from the initial route.",
      "Do not upgrade to action just because an image is attached.",
      "Question-solving, explanation, definition, interpretation, and image-reading requests stay non-action unless the user explicitly asks what to do now or there is clear stop/report/escalation context.",
      "You do not see image pixels here, only the signal summary. Do not infer acute deterioration from image existence alone.",
      "If the route is plausibly correct, keep it.",
      "Do not rewrite the answer. Do not add extra keys.",
    ].join("\n");
  }
  return [
    "너는 간호사 임상 답변 시스템의 불확실한 라우팅 축만 보정한다.",
    "반드시 JSON만 반환한다.",
    "허용 키: intentOverride, riskOverride, entityClarityOverride, urgencyOverride, detailProfileOverride, communicationProfileOverride, exceptionProfileOverride, pairedProblemOverride, reason",
    "초기 라우트보다 더 안전하거나 더 적합한 방향이 분명할 때만 override를 넣는다.",
    "이미지가 첨부되었다는 이유만으로 intent를 action으로 올리지 않는다.",
    "풀이, 해설, 설명, 정의, 해석, 판독, 이미지 관찰형 질문은 사용자가 지금 무엇을 할지 명시적으로 묻거나 stop/report/escalation 맥락이 분명할 때만 action으로 바꾼다.",
    "여기서는 실제 이미지 픽셀을 보지 못하고 신호 요약만 본다. 이미지 존재만으로 급성 대응 상황을 추정하지 않는다.",
    "초기 라우트가 충분히 타당하면 유지한다.",
    "답변을 쓰지 말고 추가 키도 넣지 않는다.",
  ].join("\n");
}

function buildTinyRouterSignalSummary(signals: MedSafetyQuestionSignals) {
  return [
    `scores=knowledge:${signals.intentScores.knowledge},action:${signals.intentScores.action},compare:${signals.intentScores.compare},numeric:${signals.intentScores.numeric},device:${signals.intentScores.device}`,
    `explicitAction=${signals.explicitActionRequest ? "yes" : "no"}`,
    `strongAction=${signals.hasStrongActionCue ? "yes" : "no"}`,
    `weakAction=${signals.hasWeakActionCue ? "yes" : "no"}`,
    `questionSolving=${signals.asksQuestionSolving ? "yes" : "no"}`,
    `conceptExplanation=${signals.asksConceptExplanation ? "yes" : "no"}`,
    `imageInterpretation=${signals.asksImageInterpretation ? "yes" : "no"}`,
    `interpretation=${signals.asksInterpretation ? "yes" : "no"}`,
    `preNotification=${signals.preNotification ? "yes" : "no"}`,
    `alarm=${signals.mentionsAlarm ? "yes" : "no"}`,
    `sudden=${signals.hasSuddenMarker ? "yes" : "no"}`,
    `highRisk=${signals.hasHighRiskMarker ? "yes" : "no"}`,
    `pairedProblem=${signals.pairedProblem ? "yes" : "no"}`,
  ].join(" ");
}

export function buildTinyRouterUserPrompt(args: RouteInput & { deterministic?: MedSafetyRouteDecision | null }) {
  const signals = buildQuestionSignals(normalizeQuery(args.query), { hasImage: Boolean(args.imageDataUrl) });
  const routeLine = args.deterministic ? buildCompactRouteSummary(args.deterministic) : "intent=unknown";
  const top = pickTopIntent(signals.intentScores);
  return [
    `Question: ${normalizeText(args.query)}`,
    `Initial route: ${routeLine}`,
    `Image attached: ${args.imageDataUrl ? "yes" : "no"}`,
    `Router sees image pixels here: no`,
    `Top intents: primary=${top.top} secondary=${top.second} ambiguous=${top.isAmbiguous ? "yes" : "no"}`,
    `Signal summary: ${buildTinyRouterSignalSummary(signals)}`,
    "Override guard: switch to action only for explicit next-step asks or clear acute stop/report/escalation context.",
  ].join("\n");
}

export function parseTinyRouterDecision(raw: string, fallback: MedSafetyRouteDecision, input?: RouteInput): MedSafetyRouteDecision {
  const refinement = parseRouterRefinement(raw);
  if (!refinement) return fallback;
  if (input) {
    const { decision } = synthesizeInternalDecision(input, refinement, "model");
    return {
      ...decision,
      reason: clampReason([decision.reason, refinement.reason].filter(Boolean).join(", ")),
    };
  }
  const merged = reconcileDecision(
    {
      ...fallback,
      intent: refinement.intentOverride ?? fallback.intent,
      risk: refinement.riskOverride ?? fallback.risk,
      entityClarity: refinement.entityClarityOverride ?? fallback.entityClarity,
      urgencyLevel: refinement.urgencyOverride ?? fallback.urgencyLevel,
      detailProfile: refinement.detailProfileOverride ?? fallback.detailProfile,
      communicationProfile: refinement.communicationProfileOverride ?? fallback.communicationProfile,
      exceptionProfile: refinement.exceptionProfileOverride ?? fallback.exceptionProfile,
      pairedProblemNeed:
        typeof refinement.pairedProblemOverride === "boolean" ? refinement.pairedProblemOverride : fallback.pairedProblemNeed,
      source: "model",
      reason: clampReason([fallback.reason, refinement.reason].filter(Boolean).join(", ")),
    },
    buildQuestionSignals(normalizeQuery(""), { hasImage: false })
  );
  return merged;
}

export function buildPromptProfile(args: {
  decision: MedSafetyRouteDecision;
  model: string;
  isPremiumSearch: boolean;
  hasImage: boolean;
}): MedSafetyPromptProfile {
  const shortSimple =
    args.decision.answerDepth === "short" &&
    args.decision.risk === "low" &&
    args.decision.communicationProfile === "none" &&
    !args.hasImage;

  const highRiskDetailed =
    args.decision.risk === "high" ||
    args.hasImage ||
    args.decision.answerDepth === "detailed" ||
    (args.decision.intent === "device" && args.decision.detailProfile !== "lean") ||
    args.decision.reportingNeed;

  const ultraComplex =
    args.hasImage ||
    args.decision.communicationProfile === "script" ||
    args.decision.pairedProblemNeed ||
    args.decision.entityClarity !== "high";

  return {
    reasoningEfforts: shortSimple
      ? ["low", "medium"]
      : ultraComplex
        ? ["medium", "high", "low"]
        : highRiskDetailed
          ? ["medium", "low", "high"]
          : ["medium", "low"],
    verbosity: "medium",
    outputTokenCandidates: args.isPremiumSearch
      ? shortSimple
        ? [5000, 4000, 3200]
        : highRiskDetailed
          ? [10000, 8000, 6400]
          : [8000, 6400, 5000]
      : shortSimple
        ? [3600, 3000, 2400]
        : highRiskDetailed
          ? [7000, 6200, 5400]
          : [5400, 4800, 4200],
    qualityLevel: "balanced",
  };
}

export function assembleMedSafetyDeveloperPrompt(
  decision: MedSafetyRouteDecision,
  locale: "ko" | "en",
  options: PromptAssemblyOptions
): MedSafetyPromptAssembly {
  const signals = buildQuestionSignals(normalizeQuery(options.query), { hasImage: Boolean(options.hasImage) });
  const blueprint = buildMedSafetyPromptBlueprint(decision, {
    hasImage: options.hasImage,
    query: options.query,
    locale,
    signals,
  });
  const { budgetClass, budgetChars } = resolveBudgetClass(options.runtimeMode, decision, Boolean(options.hasImage));
  const candidateOptionalIds = scoreOptionalContracts(decision, options.query);
  const contractSet = {
    contractIds: [...BASE_CONTRACT_IDS, ...candidateOptionalIds],
    optionalContractIds: candidateOptionalIds,
  };
  const basePrompt = buildFixedBasePrompt(locale);

  // hybrid_live: use narrative prompt (Phase 2+3 reform)
  // legacy / hybrid_shadow: keep old budget-fit sectioned prompt
  if (options.runtimeMode === "hybrid_live") {
    const narrativePrompt = buildNarrativeDeveloperPrompt(decision, locale, signals, Boolean(options.hasImage));
    return {
      developerPrompt: narrativePrompt,
      basePrompt,
      blueprint,
      contractSet,
      selectedContractIds: [...BASE_CONTRACT_IDS],
      droppedContractIds: candidateOptionalIds,
      basePromptChars: basePrompt.length,
      finalPromptChars: narrativePrompt.length,
      budgetClass,
      budgetChars,
    };
  }

  const fit = buildPromptBudgetFit({
    locale,
    decision,
    blueprint,
    budgetChars,
    candidateOptionalIds,
  });

  const adjustedBlueprint: MedSafetyPromptBlueprint = {
    ...blueprint,
    projection: {
      ...blueprint.projection,
      activeDirectiveKeys: fit.activeDirectiveKeys,
      droppedDirectiveKeys: fit.droppedDirectiveKeys,
    },
  };

  const developerPrompt = fit.lines.join("\n");
  return {
    developerPrompt,
    basePrompt,
    blueprint: adjustedBlueprint,
    contractSet,
    selectedContractIds: fit.selectedContractIds,
    droppedContractIds: fit.droppedContractIds,
    basePromptChars: basePrompt.length,
    finalPromptChars: developerPrompt.length,
    budgetClass,
    budgetChars,
  };
}

export function buildQualityGateUserPrompt(args: {
  query: string;
  answer: string;
  locale: "ko" | "en";
  decision: MedSafetyRouteDecision;
  promptAssembly?: MedSafetyPromptAssembly | null;
}) {
  return [
    `Route: ${buildCompactRouteSummary(args.decision)}`,
    `Question: ${normalizeText(args.query)}`,
    "Judge only the visible answer. Do not infer hidden intent from internal planning.",
    "",
    "Answer:",
    normalizeText(args.answer),
  ].join("\n");
}

export function shouldRunQualityGate(args: {
  decision: MedSafetyRouteDecision;
  isPremiumSearch: boolean;
  hasImage: boolean;
  answer: string;
}) {
  if (args.hasImage) return true;
  if (args.decision.format === "sectioned") return true;
  if (args.decision.risk === "high") return true;
  if (args.decision.reportingNeed || args.decision.communicationProfile !== "none") return true;
  if (args.decision.entityClarity !== "high") return true;
  if (args.decision.exceptionProfile !== "none" || args.decision.pairedProblemNeed) return true;
  return normalizeText(args.answer).length > 1300;
}

export function buildRepairDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You revise nurse-facing clinical answers.",
      "Return plain text only.",
      "Keep the original conclusion unless it is unsafe.",
      "Fix only the listed gap families, keep the answer compressed, and preserve bedside usability.",
      "Do not expose internal planning language.",
    ].join("\n");
  }
  return [
    "너는 간호사 대상 임상 답변을 수정한다.",
    "반드시 평문만 반환한다.",
    "기존 결론이 안전하면 유지하고, 지정된 gap family만 보완한다.",
    "길이는 압축하되 bedside에서 바로 쓸 수 있게 유지한다.",
    "내부 기획 용어는 노출하지 않는다.",
  ].join("\n");
}

export function buildRepairUserPrompt(args: {
  query: string;
  answer: string;
  locale: "ko" | "en";
  decision: MedSafetyRouteDecision;
  repairInstructions: string;
  promptAssembly?: MedSafetyPromptAssembly | null;
}) {
  const issueFamilies = String(args.repairInstructions ?? "")
    .split(",")
    .map((item) => sanitizeOneOf(item.trim(), MED_SAFETY_REPAIR_ISSUE_FAMILIES))
    .filter((item): item is MedSafetyRepairIssueFamily => Boolean(item))
    .slice(0, 3);
  return [
    `Gap families: ${issueFamilies.join(",") || "action_gap"}`,
    `Route: ${buildCompactRouteSummary(args.decision)}`,
    `Question: ${normalizeText(args.query)}`,
    "Revise surgically: add only what is missing, remove repetition, and keep the answer short.",
    "",
    "Current answer:",
    normalizeText(args.answer),
  ].join("\n");
}

export function shouldAcceptIssueFamily(value: unknown) {
  return sanitizeOneOf(value, MED_SAFETY_REPAIR_ISSUE_FAMILIES);
}

export function buildHybridBehavioralBasePrompt(locale: "ko" | "en") {
  return buildFixedBasePrompt(locale);
}

export function shouldGenerateKoEnglishVariant() {
  const raw = String(process.env.OPENAI_MED_SAFETY_GENERATE_EN_VARIANT ?? "false")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export { buildHeuristicQualityDecision, buildQualityGateDeveloperPrompt, parseQualityGateDecision };
