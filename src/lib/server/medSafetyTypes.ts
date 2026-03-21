export const MED_SAFETY_RUNTIME_MODES = ["legacy", "hybrid_shadow", "hybrid_live"] as const;
export type MedSafetyRuntimeMode = (typeof MED_SAFETY_RUNTIME_MODES)[number];

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

export const MED_SAFETY_ROUTE_SOURCES = ["rules", "model"] as const;
export type MedSafetyRouteSource = (typeof MED_SAFETY_ROUTE_SOURCES)[number];

export const MED_SAFETY_QUALITY_VERDICTS = ["pass", "repair_required", "pass_but_verbose"] as const;
export type MedSafetyQualityVerdict = (typeof MED_SAFETY_QUALITY_VERDICTS)[number];

export const MED_SAFETY_REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type MedSafetyReasoningEffort = (typeof MED_SAFETY_REASONING_EFFORTS)[number];

export const MED_SAFETY_VERBOSITIES = ["low", "medium", "high"] as const;
export type MedSafetyVerbosity = (typeof MED_SAFETY_VERBOSITIES)[number];

export type MedSafetyQualityLevel = "balanced";

export const MED_SAFETY_SUBJECT_FOCI = [
  "medication",
  "device",
  "lab",
  "procedure",
  "patient_state",
  "general",
] as const;
export type MedSafetySubjectFocus = (typeof MED_SAFETY_SUBJECT_FOCI)[number];

export const MED_SAFETY_URGENCY_LEVELS = ["routine", "prompt", "urgent", "critical"] as const;
export type MedSafetyUrgencyLevel = (typeof MED_SAFETY_URGENCY_LEVELS)[number];

export const MED_SAFETY_WORKFLOW_STAGES = [
  "orientation",
  "interpretation",
  "decision",
  "pre_notification",
  "active_deterioration",
  "post_action_review",
] as const;
export type MedSafetyWorkflowStage = (typeof MED_SAFETY_WORKFLOW_STAGES)[number];

export const MED_SAFETY_NOTIFICATION_NEEDS = ["none", "prepare", "now", "immediate"] as const;
export type MedSafetyNotificationNeed = (typeof MED_SAFETY_NOTIFICATION_NEEDS)[number];

export const MED_SAFETY_CHECKLIST_DEPTHS = ["brief", "standard", "dense"] as const;
export type MedSafetyChecklistDepth = (typeof MED_SAFETY_CHECKLIST_DEPTHS)[number];

export const MED_SAFETY_MEASUREMENT_DEPENDENCIES = ["low", "medium", "high"] as const;
export type MedSafetyMeasurementDependency = (typeof MED_SAFETY_MEASUREMENT_DEPENDENCIES)[number];

export const MED_SAFETY_DANGER_BIASES = ["standard", "elevated", "maximal"] as const;
export type MedSafetyDangerBias = (typeof MED_SAFETY_DANGER_BIASES)[number];

export const MED_SAFETY_DETAIL_BIASES = ["standard", "high", "very_high"] as const;
export type MedSafetyDetailBias = (typeof MED_SAFETY_DETAIL_BIASES)[number];

export const MED_SAFETY_OPENING_MODES = ["direct", "action_first", "compare_first", "numeric_first"] as const;
export type MedSafetyOpeningMode = (typeof MED_SAFETY_OPENING_MODES)[number];

export const MED_SAFETY_ARTIFACT_IDS = [
  "direct_answer",
  "severity_frame",
  "immediate_action",
  "bedside_recheck",
  "reversible_cause_sweep",
  "false_worsening_sweep",
  "why_recommended_path",
  "why_this_before_that",
  "when_not_to_do_that",
  "exception_boundary",
  "counterfactual",
  "measurement_dependency",
  "paired_problem_handling",
  "notification_payload",
  "notification_script",
  "urgent_red_flags",
  "protocol_caveat",
  "memory_point",
  "mini_case",
] as const;
export type MedSafetyArtifactId = (typeof MED_SAFETY_ARTIFACT_IDS)[number];

export const MED_SAFETY_ARTIFACT_DEPTHS = ["brief", "standard", "dense"] as const;
export type MedSafetyArtifactDepth = (typeof MED_SAFETY_ARTIFACT_DEPTHS)[number];

export const MED_SAFETY_QUALITY_SCORE_AXES = [
  "directness",
  "bedside_actionability",
  "exception_quality",
  "reporting_utility",
  "checklist_density",
  "safety_guardrails",
  "paired_problem_coverage",
] as const;
export type MedSafetyQualityScoreAxis = (typeof MED_SAFETY_QUALITY_SCORE_AXES)[number];
export type MedSafetyQualityScores = Record<MedSafetyQualityScoreAxis, number>;

export const MED_SAFETY_QUALITY_ISSUE_CODES = [
  "missing_conclusion_first",
  "mixed_question_order",
  "missing_immediate_action",
  "missing_escalation_threshold",
  "missing_assumption_disclosure",
  "unsafe_specificity_for_ambiguous_entity",
  "missing_local_authority_caveat",
  "weak_section_structure",
  "missing_small_category_structure",
  "duplicate_lines",
  "filler_detected",
  "unsupported_specificity",
  "missing_fast_distinction",
  "missing_numeric_core",
  "missing_action_core",
  "overlong_answer",
  "forbidden_followup",
  "missing_reversible_cause_sweep",
  "missing_false_worsening_exclusion",
  "missing_notification_payload",
  "missing_notification_script",
  "missing_exception_boundary",
  "missing_counterfactual",
  "missing_measurement_dependency",
  "missing_paired_problem_handling",
  "missing_red_flags",
  "insufficient_checklist_domain_coverage",
  "generic_bedside_language",
  "overcompressed_high_risk_answer",
  "missing_protocol_caveat",
] as const;
export type MedSafetyQualityIssueCode = (typeof MED_SAFETY_QUALITY_ISSUE_CODES)[number];

export const MED_SAFETY_CRITICAL_QUALITY_ISSUE_CODES = [
  "missing_immediate_action",
  "missing_escalation_threshold",
  "unsafe_specificity_for_ambiguous_entity",
  "missing_reversible_cause_sweep",
  "missing_notification_payload",
  "missing_notification_script",
  "missing_exception_boundary",
  "missing_counterfactual",
  "missing_measurement_dependency",
  "missing_paired_problem_handling",
  "missing_red_flags",
  "overcompressed_high_risk_answer",
  "missing_protocol_caveat",
] as const;

export const MED_SAFETY_PROMPT_CONTRACT_IDS = [
  "core_role_goal_spine",
  "core_decision_priority_spine",
  "core_safety_certainty_spine",
  "core_rendering_discipline_spine",
  "intent_knowledge_spine",
  "intent_action_spine",
  "intent_compare_spine",
  "intent_numeric_spine",
  "intent_device_spine",
  "risk_high_spine",
  "risk_medium_spine",
  "artifact_planner_blueprint",
  "artifact_direct_answer",
  "artifact_severity_frame",
  "artifact_immediate_action",
  "artifact_bedside_recheck",
  "artifact_reversible_cause_sweep",
  "artifact_false_worsening_sweep",
  "artifact_why_recommended_path",
  "artifact_why_this_before_that",
  "artifact_when_not_to_do_that",
  "artifact_exception_boundary",
  "artifact_counterfactual",
  "artifact_measurement_dependency",
  "artifact_paired_problem",
  "artifact_notification_payload",
  "artifact_notification_script",
  "artifact_red_flags",
  "artifact_protocol_caveat",
  "artifact_memory_point",
  "artifact_mini_case",
  "domain_ventilator_abga",
  "domain_oxygenation",
  "domain_infusion_device",
  "domain_medication_safety",
  "domain_line_tube",
  "domain_escalation_reporting",
  "density_checklist_contract",
  "density_domain_coverage_contract",
  "density_exception_balance_contract",
  "output_heading_discipline",
  "output_lead_sentence_discipline",
  "output_no_filler_discipline",
  "anti_failure_specificity_guard",
  "anti_failure_budget_guard",
  "language_delta",
] as const;
export type MedSafetyPromptContractId = (typeof MED_SAFETY_PROMPT_CONTRACT_IDS)[number];

export type MedSafetyRouteDecision = {
  intent: MedSafetyIntent;
  secondaryIntents: MedSafetyIntent[];
  risk: MedSafetyRisk;
  entityClarity: MedSafetyEntityClarity;
  answerDepth: MedSafetyAnswerDepth;
  needsEscalation: boolean;
  needsSbar: boolean;
  format: MedSafetyFormat;
  source: MedSafetyRouteSource;
  confidence: "high" | "medium";
  urgencyLevel: MedSafetyUrgencyLevel;
  workflowStage: MedSafetyWorkflowStage;
  notificationNeed: MedSafetyNotificationNeed;
  reversibleCauseSweep: boolean;
  trendNeed: boolean;
  thresholdNeed: boolean;
  counterfactualNeed: boolean;
  exceptionNeed: boolean;
  pairedProblemNeed: boolean;
  scriptNeed: boolean;
  checklistDepth: MedSafetyChecklistDepth;
  measurementDependency: MedSafetyMeasurementDependency;
  mandatoryArtifacts: MedSafetyArtifactId[];
  sectionEmphasis: string[];
  dangerBias: MedSafetyDangerBias;
  detailBias: MedSafetyDetailBias;
  communicationArtifacts: MedSafetyArtifactId[];
  reason: string;
};

export type MedSafetyPromptProfile = {
  reasoningEfforts: MedSafetyReasoningEffort[];
  verbosity: MedSafetyVerbosity;
  outputTokenCandidates: number[];
  qualityLevel: MedSafetyQualityLevel;
};

export type MedSafetyQualityDecision = {
  verdict: MedSafetyQualityVerdict;
  repairInstructions: string;
  issues: MedSafetyQualityIssueCode[];
  criticalIssues: MedSafetyQualityIssueCode[];
  scores: MedSafetyQualityScores;
};

export type MedSafetyPromptBudgetClass = "legacy" | "shadow" | "standard" | "high_risk_or_image";

export type MedSafetyPromptBlueprint = {
  openingMode: MedSafetyOpeningMode;
  requiredArtifacts: MedSafetyArtifactId[];
  optionalArtifacts: MedSafetyArtifactId[];
  artifactOrder: MedSafetyArtifactId[];
  artifactQuota: Partial<Record<MedSafetyArtifactId, number>>;
  artifactDepth: Partial<Record<MedSafetyArtifactId, MedSafetyArtifactDepth>>;
  coreArtifactPack: MedSafetyArtifactId[];
  extendedArtifactPack: MedSafetyArtifactId[];
  mustNotAssert: string[];
  subjectFocus: MedSafetySubjectFocus;
  mixedIntent: boolean;
  followupPolicy: "forbid" | "limited";
  sectionEmphasis: string[];
  communicationArtifacts: MedSafetyArtifactId[];
  domainCoverageTargets: string[];
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
