export const MED_SAFETY_INTENTS = ["knowledge", "action", "compare", "numeric", "device"] as const;
export type MedSafetyIntent = (typeof MED_SAFETY_INTENTS)[number];

export const MED_SAFETY_RISKS = ["low", "medium", "high"] as const;
export type MedSafetyRisk = (typeof MED_SAFETY_RISKS)[number];

export const MED_SAFETY_ENTITY_CLARITIES = ["high", "medium", "low"] as const;
export type MedSafetyEntityClarity = (typeof MED_SAFETY_ENTITY_CLARITIES)[number];

export const MED_SAFETY_ANSWER_DEPTHS = ["short", "standard", "detailed"] as const;
export type MedSafetyAnswerDepth = (typeof MED_SAFETY_ANSWER_DEPTHS)[number];

export const MED_SAFETY_FORMATS = ["short", "sectioned"] as const;
export type MedSafetyFormat = (typeof MED_SAFETY_FORMATS)[number];

export const MED_SAFETY_URGENCY_LEVELS = ["routine", "urgent", "critical"] as const;
export type MedSafetyUrgencyLevel = (typeof MED_SAFETY_URGENCY_LEVELS)[number];

export const MED_SAFETY_WORKFLOW_STAGES = [
  "interpretation",
  "decision",
  "pre_notification",
  "active_deterioration",
] as const;
export type MedSafetyWorkflowStage = (typeof MED_SAFETY_WORKFLOW_STAGES)[number];

export const MED_SAFETY_PRIORITY_MODES = ["balanced", "action_first", "notify_first", "safety_first"] as const;
export type MedSafetyPriorityMode = (typeof MED_SAFETY_PRIORITY_MODES)[number];

export const MED_SAFETY_DETAIL_PROFILES = ["lean", "bedside", "paired", "deep"] as const;
export type MedSafetyDetailProfile = (typeof MED_SAFETY_DETAIL_PROFILES)[number];

export const MED_SAFETY_COMMUNICATION_PROFILES = ["none", "payload", "script"] as const;
export type MedSafetyCommunicationProfile = (typeof MED_SAFETY_COMMUNICATION_PROFILES)[number];

export const MED_SAFETY_EXCEPTION_PROFILES = ["none", "light", "full"] as const;
export type MedSafetyExceptionProfile = (typeof MED_SAFETY_EXCEPTION_PROFILES)[number];

export const MED_SAFETY_SPECIFICITY_RISKS = ["low", "guarded", "high"] as const;
export type MedSafetySpecificityRisk = (typeof MED_SAFETY_SPECIFICITY_RISKS)[number];

export const MED_SAFETY_COMPRESSION_TARGETS = ["tight", "balanced", "compressed_detailed"] as const;
export type MedSafetyCompressionTarget = (typeof MED_SAFETY_COMPRESSION_TARGETS)[number];

export const MED_SAFETY_OPENING_MODES = ["direct", "action_first", "compare_first", "numeric_first"] as const;
export type MedSafetyOpeningMode = (typeof MED_SAFETY_OPENING_MODES)[number];

export const MED_SAFETY_PROMPT_PACK_IDS = [
  "direct_core_pack",
  "bedside_pack",
  "exception_pack",
  "notify_pack",
  "paired_problem_pack",
] as const;
export type MedSafetyPromptPackId = (typeof MED_SAFETY_PROMPT_PACK_IDS)[number];

export const MED_SAFETY_MICRO_PACK_IDS = [
  "direct_core",
  "severity_frame",
  "bedside_check",
  "reversible_cause",
  "false_worsening",
  "exception_boundary",
  "measurement_guard",
  "notify_payload",
  "notify_script",
  "paired_problem_split",
] as const;
export type MedSafetyMicroPackId = (typeof MED_SAFETY_MICRO_PACK_IDS)[number];

export const MED_SAFETY_PROJECTION_DIRECTIVE_KEYS = [
  "openingDirective",
  "priorityDirective",
  "coverageDirective",
  "exceptionDirective",
  "communicationDirective",
  "safetyDirective",
  "compressionDirective",
  "renderDirective",
] as const;
export type MedSafetyProjectionDirectiveKey = (typeof MED_SAFETY_PROJECTION_DIRECTIVE_KEYS)[number];

export const MED_SAFETY_DEFAULT_CLAUSE_IDS = [
  "default_role_and_goal",
  "default_practical_plus_learning",
  "default_risk_first",
  "default_action_order",
  "default_compare_priority",
  "default_device_troubleshooting",
  "default_uncertainty_protocol",
  "default_opening_direct_answer",
  "default_fast_distinction_point",
  "default_quick_check_sequence",
  "default_quick_elements_length_guard",
] as const;
export type MedSafetyDefaultClauseId = (typeof MED_SAFETY_DEFAULT_CLAUSE_IDS)[number];

export const MED_SAFETY_SEMANTIC_COVERAGE_TAGS = [
  "role_goal",
  "practical_over_textbook",
  "practical_plus_learning",
  "knowledge_meaning_focus",
  "numeric_action_link",
  "risk_action_first",
  "mixed_action_safety_first",
  "mixed_priority_delta",
  "action_question_order",
  "compare_priority",
  "high_risk_stop_report",
  "device_troubleshooting_first",
  "device_tracing_stop_rule",
  "uncertainty_guard",
  "ambiguity_specificity_guard",
  "protocol_caveat",
  "direct_answer_early",
  "brevity_and_readability",
  "non_empty_answer",
  "no_internal_terms",
  "locale_natural_language",
  "vent_oxygenation_split",
  "paired_problem_split",
  "bedside_checks",
  "exception_boundary",
  "measurement_guard",
  "reporting_bundle",
  "notify_payload",
  "notify_script",
  "render_card_shape",
  "fast_distinction_point",
  "quick_check_sequence",
  "quick_elements_length_guard",
] as const;
export type MedSafetySemanticCoverageTag = (typeof MED_SAFETY_SEMANTIC_COVERAGE_TAGS)[number];

export const MED_SAFETY_PROMPT_LINE_SECTIONS = [
  "principles",
  "question_fit",
  "priority",
  "coverage",
  "boundary",
  "output",
] as const;
export type MedSafetyPromptLineSection = (typeof MED_SAFETY_PROMPT_LINE_SECTIONS)[number];

export const MED_SAFETY_PROMPT_LINE_SOURCES = ["default", "base", "contract", "projection"] as const;
export type MedSafetyPromptLineSource = (typeof MED_SAFETY_PROMPT_LINE_SOURCES)[number];

export const MED_SAFETY_LENGTH_PLANS = ["tight", "standard", "expanded"] as const;
export type MedSafetyLengthPlan = (typeof MED_SAFETY_LENGTH_PLANS)[number];

export const MED_SAFETY_RUNTIME_MODES = ["legacy", "hybrid_live", "hybrid_shadow"] as const;
export type MedSafetyRuntimeMode = (typeof MED_SAFETY_RUNTIME_MODES)[number];

export const MED_SAFETY_REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type MedSafetyReasoningEffort = (typeof MED_SAFETY_REASONING_EFFORTS)[number];

export const MED_SAFETY_VERBOSITIES = ["low", "medium", "high"] as const;
export type MedSafetyVerbosity = (typeof MED_SAFETY_VERBOSITIES)[number];

export const MED_SAFETY_PROMPT_BUDGET_CLASSES = ["legacy", "shadow", "standard", "high_risk_or_image"] as const;
export type MedSafetyPromptBudgetClass = (typeof MED_SAFETY_PROMPT_BUDGET_CLASSES)[number];

export const MED_SAFETY_CONFIDENCES = ["low", "medium", "high"] as const;
export type MedSafetyConfidence = (typeof MED_SAFETY_CONFIDENCES)[number];

export const MED_SAFETY_ROUTE_SOURCES = ["rules", "model"] as const;
export type MedSafetyRouteSource = (typeof MED_SAFETY_ROUTE_SOURCES)[number];

export const MED_SAFETY_PROMPT_CONTRACT_IDS = [
  "base_role_goal",
  "base_decision_priority",
  "base_safety_certainty",
  "base_render_discipline",
  "intent_knowledge",
  "intent_action",
  "intent_compare",
  "intent_numeric",
  "risk_high_modifier",
  "risk_mixed_modifier",
  "communication_modifier",
  "exception_modifier",
  "ambiguity_modifier",
  "domain_vent_abga",
  "domain_med_device",
  "domain_reporting",
  "output_safety_guard",
  "output_no_meta_guard",
] as const;
export type MedSafetyPromptContractId = (typeof MED_SAFETY_PROMPT_CONTRACT_IDS)[number];

export const MED_SAFETY_REPAIR_ISSUE_FAMILIES = [
  "action_gap",
  "bedside_gap",
  "notify_gap",
  "exception_gap",
  "safety_gap",
  "structure_gap",
  "verbosity_gap",
] as const;
export type MedSafetyRepairIssueFamily = (typeof MED_SAFETY_REPAIR_ISSUE_FAMILIES)[number];

export const MED_SAFETY_CRITICAL_REPAIR_ISSUE_FAMILIES = [
  "notify_gap",
  "exception_gap",
  "safety_gap",
] as const satisfies readonly MedSafetyRepairIssueFamily[];

export const MED_SAFETY_QUALITY_VERDICTS = ["pass", "repair_required", "pass_but_verbose"] as const;
export type MedSafetyQualityVerdict = (typeof MED_SAFETY_QUALITY_VERDICTS)[number];

export const MED_SAFETY_QUALITY_SCORE_AXES = [
  "directness",
  "bedside_utility",
  "reporting_utility",
  "exception_quality",
  "safety_guardrails",
] as const;
export type MedSafetyQualityScoreAxis = (typeof MED_SAFETY_QUALITY_SCORE_AXES)[number];

export const MED_SAFETY_ATOMIC_QUALITY_CHECK_IDS = [
  "direct_answer_top",
  "immediate_action_top",
  "card_structure",
  "fast_distinction_point_present",
  "quick_check_sequence_present",
  "bedside_domain_coverage",
  "reversible_cause_coverage",
  "false_worsening_exclusion",
  "notify_payload_complete",
  "notify_script_useful",
  "exception_boundary_quality",
  "measurement_guard_quality",
  "paired_problem_separation",
  "protocol_caveat_presence",
  "unsafe_specificity",
  "repetition_density",
  "verbosity_overshoot",
  "forbidden_followup",
] as const;
export type MedSafetyAtomicQualityCheckId = (typeof MED_SAFETY_ATOMIC_QUALITY_CHECK_IDS)[number];

export type MedSafetySubjectFocus = "general" | "medication" | "device" | "lab" | "patient_state";

export type MedSafetyEvidenceSignals = {
  intentScores: Record<MedSafetyIntent, number>;
  intentFamiliesMatched: number;
  mixedIntent: boolean;
  asksSelection: boolean;
  asksInterpretation: boolean;
  asksThreshold: boolean;
  asksImmediateAction: boolean;
  asksTrendReview: boolean;
  needsEntityDisambiguation: boolean;
  preNotification: boolean;
  bedsideSweep: boolean;
  falseWorseningRisk: boolean;
  pairedProblem: boolean;
  mixedNumericAction: boolean;
  mentionsVentilation: boolean;
  mentionsABGA: boolean;
  mentionsOxygenation: boolean;
  mentionsMedication: boolean;
  mentionsLineOrTube: boolean;
  mentionsCompatibility: boolean;
  mentionsSetting: boolean;
  mentionsPatientState: boolean;
  mentionsAlarm: boolean;
  hasSuddenMarker: boolean;
  hasHighRiskMarker: boolean;
  wantsScript: boolean;
  subjectFocus: MedSafetySubjectFocus;
};

export type MedSafetyRouterRefinement = {
  intentOverride?: MedSafetyIntent;
  riskOverride?: MedSafetyRisk;
  entityClarityOverride?: MedSafetyEntityClarity;
  urgencyOverride?: MedSafetyUrgencyLevel;
  detailProfileOverride?: MedSafetyDetailProfile;
  communicationProfileOverride?: MedSafetyCommunicationProfile;
  exceptionProfileOverride?: MedSafetyExceptionProfile;
  pairedProblemOverride?: boolean;
  reason: string;
};

export type MedSafetyInternalDecision = {
  intent: MedSafetyIntent;
  secondaryIntentCluster: MedSafetyIntent[];
  risk: MedSafetyRisk;
  entityClarity: MedSafetyEntityClarity;
  answerDepth: MedSafetyAnswerDepth;
  urgencyLevel: MedSafetyUrgencyLevel;
  workflowStage: MedSafetyWorkflowStage;
  priorityMode: MedSafetyPriorityMode;
  detailProfile: MedSafetyDetailProfile;
  communicationProfile: MedSafetyCommunicationProfile;
  exceptionProfile: MedSafetyExceptionProfile;
  pairedProblemNeed: boolean;
  measurementGuardNeed: boolean;
  reversibleCauseNeed: boolean;
  falseWorseningNeed: boolean;
  reportingNeed: boolean;
  specificityRisk: MedSafetySpecificityRisk;
  protocolCaveatNeed: boolean;
  compressionTarget: MedSafetyCompressionTarget;
  needsEscalation: boolean;
  needsSbar: boolean;
  format: MedSafetyFormat;
  confidence: MedSafetyConfidence;
  source: MedSafetyRouteSource;
  reason: string;
};

export type MedSafetyMicroPackScoreMap = Partial<Record<MedSafetyMicroPackId, number>>;

export type MedSafetyPackPlan = {
  visiblePacks: MedSafetyPromptPackId[];
  selectedMicroPacks: MedSafetyMicroPackId[];
  deferredMicroPacks: MedSafetyMicroPackId[];
  droppedMicroPacks: MedSafetyMicroPackId[];
  microPackScores: MedSafetyMicroPackScoreMap;
};

export type MedSafetyPromptProjection = {
  openingDirective: string;
  priorityDirective: string;
  coverageDirective: string | null;
  exceptionDirective: string | null;
  communicationDirective: string | null;
  safetyDirective: string;
  compressionDirective: string;
  renderDirective: string;
  needsFastDistinctionPoint: boolean;
  needsQuickCheckSequence: boolean;
  activeDirectiveKeys: MedSafetyProjectionDirectiveKey[];
  droppedDirectiveKeys: MedSafetyProjectionDirectiveKey[];
};

export type MedSafetyPromptBlueprint = {
  openingMode: MedSafetyOpeningMode;
  sectionHints: string[];
  mustNotAssert: string[];
  lengthPlan: MedSafetyLengthPlan;
  packPlan: MedSafetyPackPlan;
  projection: MedSafetyPromptProjection;
};

export type MedSafetyPromptLineDescriptor = {
  text: string;
  source: MedSafetyPromptLineSource;
  section: MedSafetyPromptLineSection;
  coverageTags: MedSafetySemanticCoverageTag[];
  isQuestionSpecific: boolean;
  defaultClauseId?: MedSafetyDefaultClauseId;
};

export type MedSafetyPromptContractSet = {
  contractIds: MedSafetyPromptContractId[];
  optionalContractIds: MedSafetyPromptContractId[];
};

export type MedSafetyPromptAssembly = {
  developerPrompt: string;
  basePrompt: string;
  blueprint: MedSafetyPromptBlueprint;
  contractSet: MedSafetyPromptContractSet;
  selectedContractIds: MedSafetyPromptContractId[];
  droppedContractIds: MedSafetyPromptContractId[];
  basePromptChars: number;
  finalPromptChars: number;
  budgetClass: MedSafetyPromptBudgetClass;
  budgetChars: number;
};

export type MedSafetyPromptProfile = {
  reasoningEfforts: MedSafetyReasoningEffort[];
  verbosity: MedSafetyVerbosity;
  outputTokenCandidates: number[];
  qualityLevel: "balanced";
};

export type MedSafetyQualityScores = Record<MedSafetyQualityScoreAxis, number>;

export type MedSafetyQualityProfile = {
  atomicFailures: MedSafetyAtomicQualityCheckId[];
  issueFamilies: MedSafetyRepairIssueFamily[];
};

export type MedSafetyQualityDecision = {
  verdict: MedSafetyQualityVerdict;
  repairInstructions: string;
  issues: MedSafetyRepairIssueFamily[];
  criticalIssues: MedSafetyRepairIssueFamily[];
  scores: MedSafetyQualityScores;
  profile?: MedSafetyQualityProfile | null;
};

export type MedSafetyRouteDecision = MedSafetyInternalDecision;
