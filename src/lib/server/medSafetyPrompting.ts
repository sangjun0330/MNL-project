export type {
  MedSafetyAnswerDepth,
  MedSafetyArtifactId,
  MedSafetyDangerBias,
  MedSafetyDetailBias,
  MedSafetyEntityClarity,
  MedSafetyFormat,
  MedSafetyIntent,
  MedSafetyNotificationNeed,
  MedSafetyOpeningMode,
  MedSafetyPromptAssembly,
  MedSafetyPromptBlueprint,
  MedSafetyPromptBudgetClass,
  MedSafetyPromptContractId,
  MedSafetyPromptContractSet,
  MedSafetyPromptProfile,
  MedSafetyQualityDecision,
  MedSafetyQualityScoreAxis,
  MedSafetyQualityScores,
  MedSafetyQualityVerdict,
  MedSafetyReasoningEffort,
  MedSafetyRisk,
  MedSafetyRouteDecision,
  MedSafetyRuntimeMode,
  MedSafetyVerbosity,
} from "@/lib/server/medSafetyTypes";

import { buildMedSafetyPromptBlueprint as buildArtifactPlannerBlueprint } from "@/lib/server/medSafetyArtifactPlanner";
import {
  buildHeuristicQualityDecision,
  buildQualityGateDeveloperPrompt,
  parseQualityGateDecision,
} from "@/lib/server/medSafetyQualityRubric";
import {
  buildQuestionSignals,
  countHighRiskHits,
  countPatternHits,
  hasEscalationLanguage,
  includesGenericEntity,
  includesGenericHeadNoun,
  isAmbiguousShortEntity,
  normalizeQuery,
  normalizeText,
  pickTopIntent,
  type IntentScoreMap,
  type MedSafetyQuestionSignals,
} from "@/lib/server/medSafetySignalLexicon";
import {
  MED_SAFETY_ARTIFACT_IDS,
  MED_SAFETY_CHECKLIST_DEPTHS,
  MED_SAFETY_DANGER_BIASES,
  MED_SAFETY_DETAIL_BIASES,
  MED_SAFETY_ENTITY_CLARITIES,
  MED_SAFETY_FORMATS,
  MED_SAFETY_INTENTS,
  MED_SAFETY_MEASUREMENT_DEPENDENCIES,
  MED_SAFETY_NOTIFICATION_NEEDS,
  MED_SAFETY_RISKS,
  MED_SAFETY_URGENCY_LEVELS,
  MED_SAFETY_WORKFLOW_STAGES,
  type MedSafetyAnswerDepth,
  type MedSafetyArtifactId,
  type MedSafetyDetailBias,
  type MedSafetyEntityClarity,
  type MedSafetyFormat,
  type MedSafetyIntent,
  type MedSafetyPromptAssembly,
  type MedSafetyPromptBlueprint,
  type MedSafetyPromptBudgetClass,
  type MedSafetyPromptContractId,
  type MedSafetyPromptProfile,
  type MedSafetyReasoningEffort,
  type MedSafetyRisk,
  type MedSafetyRouteDecision,
  type MedSafetyRuntimeMode,
} from "@/lib/server/medSafetyTypes";

type RouteInput = {
  query: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
};

type PromptAssemblyContext = Pick<
  MedSafetyPromptAssembly,
  "blueprint" | "contractSet" | "selectedContractIds" | "droppedContractIds" | "finalPromptChars"
>;

type PromptContractSpec = {
  id: MedSafetyPromptContractId;
  text: string;
  optional: boolean;
  dropPriority: number;
};

const COMPARE_PATTERNS = [/차이/i, /구분/i, /\bvs\b/i, /헷갈/i];
const NUMERIC_PATTERNS = [/정상\s*범위/i, /수치/i, /해석/i, /\bp\/f\b/i, /\babga\b/i];
const ACTION_PATTERNS = [/어떻게/i, /대응/i, /조치/i, /먼저/i, /우선/i, /보고/i];
const THRESHOLD_PATTERNS = [/언제/i, /기준/i, /threshold/i, /보고\s*기준/i, /호출\s*기준/i, /노티/i];
const VENT_SETTING_PATTERNS = [/\brr\b/i, /\bpi\b/i, /\bvt\b/i, /\bvte\b/i, /\bpeep\b/i, /\bfio2\b/i];
const PBW_PATTERNS = [/\bpbw\b/i, /predicted body weight/i, /예상\s*체중/i];

const CORE_ROLE_GOAL_SPINE = [
  "[CORE_ROLE_GOAL_SPINE]",
  "- 너는 간호사 전용 임상검색 AI다.",
  "- 목표는 정답 설명문이 아니라, 선임 ICU 간호사가 후배에게 현장에서 바로 쓰라고 건네는 카드 묶음을 만드는 것이다.",
  "- 답변은 실무 판단, 지금 확인할 것, 예외, 보고 포인트를 동시에 담아야 한다.",
  "- 교과서식 일반론, 중복 설명, 안전성 없는 과장된 자신감은 제거한다.",
].join("\n");

const CORE_DECISION_PRIORITY_SPINE = [
  "[CORE_DECISION_PRIORITY_SPINE]",
  "- 내부 우선순서는 항상 1) 즉시 위험 2) 행동 순서 3) reversible cause sweep 4) 예외/반대조건 5) 보고 구조다.",
  "- 혼합 질문이면 배경 설명보다 bedside 행동과 안전 경계를 먼저 둔다.",
  "- 숫자 해석 질문이라도 행동과 보고가 연결되면 해석만 하지 말고 행동 임계점까지 이어서 쓴다.",
].join("\n");

const CORE_SAFETY_CERTAINTY_SPINE = [
  "[CORE_SAFETY_CERTAINTY_SPINE]",
  "- 식별 확신도는 HIGH, MEDIUM, LOW로 내부 판단한다.",
  "- MEDIUM이면 시작부 근처에 working assumption을 짧게 밝히고, 일반적이고 안전한 범위에서만 답한다.",
  "- LOW이면 후보 1~3개와 공통 안전 원칙만 제시하고, 용량/속도/희석/경로/호환성/세팅값은 단정하지 않는다.",
  "- 기관별 프로토콜, 약제부 확인, 의사 지시, 제조사 IFU가 필요한 내용은 일반 원칙과 분리해 명시한다.",
].join("\n");

const CORE_RENDERING_DISCIPLINE_SPINE = [
  "[CORE_RENDERING_DISCIPLINE_SPINE]",
  "- 최종 답변은 후처리 없이 그대로 페이지 카드로 렌더링될 수 있는 원문 형식이어야 한다.",
  "- 첫 블록은 제목 없는 결론 카드다. 1~3문장으로 직접 답과 위험 프레이밍을 먼저 쓴다.",
  "- 그 다음 카드들은 짧고 구체적인 제목 한 줄 -> bullet이 아닌 리드 문장 한 줄 -> 본문 순서를 지킨다.",
  "- '리드 문장:' 접두어는 쓰지 않는다. 리드 문장은 일반 문장 그대로 쓴다.",
  "- '요약', '상세', '자세한 설명' 같은 모호한 제목은 금지한다.",
  "- 제목은 상황에 맞는 구체적 명사구로 쓰고, 본문은 바로 행동 가능한 임상 문장으로 채운다.",
].join("\n");

const OUTPUT_HEADING_DISCIPLINE = [
  "[OUTPUT_HEADING_DISCIPLINE]",
  "- 제목은 '핵심 판단', '지금 할 일', '노티 전 지금 확인할 것', '왜 이 순서로 보는지', '헷갈리기 쉬운 예외', '주치의 노티 포인트', '즉시 보고 신호'처럼 역할이 드러나게 쓴다.",
  "- artifact가 같아도 질문 맥락에 따라 제목을 미세 조정한다.",
].join("\n");

const OUTPUT_LEAD_SENTENCE_DISCIPLINE = [
  "[OUTPUT_LEAD_SENTENCE_DISCIPLINE]",
  "- 각 카드의 첫 줄은 bullet이 아닌 리드 문장이다.",
  "- 리드 문장은 그 카드에서 독자가 가장 먼저 붙잡아야 할 실무 결론을 한 문장으로 압축한다.",
].join("\n");

const OUTPUT_NO_FILLER_DISCIPLINE = [
  "[OUTPUT_NO_FILLER_DISCIPLINE]",
  "- '상황에 따라 다릅니다', '일반적으로는', '필요시 고려합니다' 같은 빈 문장으로 분량을 채우지 않는다.",
  "- 같은 뜻의 경고를 반복하지 말고, 새로운 행동 포인트나 예외를 넣는다.",
].join("\n");

const RISK_HIGH_SPINE = [
  "[RISK_HIGH_SPINE]",
  "- high-risk 질문에서는 첫 2문장 안에 가장 위험한 문제와 즉시 행동을 모두 드러낸다.",
  "- reversible cause, measurement error, 보고 기준이 빠지면 답변이 불완전한 것으로 간주한다.",
].join("\n");

const RISK_MEDIUM_SPINE = [
  "[RISK_MEDIUM_SPINE]",
  "- medium-risk 질문은 과도한 서론 없이 실무 판단과 확인 포인트를 먼저 준다.",
  "- 숫자/장비/상태가 섞이면 배경 설명만 하지 말고 what to check now를 포함한다.",
].join("\n");

const INTENT_KNOWLEDGE_SPINE = [
  "[INTENT_KNOWLEDGE_SPINE]",
  "- knowledge 질문도 bedside relevance가 있으면 관찰 포인트와 보고 기준을 붙인다.",
  "- 정의를 늘어놓기보다 현장에서 헷갈리는 경계와 예외를 먼저 정리한다.",
].join("\n");

const INTENT_ACTION_SPINE = [
  "[INTENT_ACTION_SPINE]",
  "- action 질문은 recommendation + why + exception + pre-action check + reporting flow를 반드시 연결한다.",
  "- '무엇을 할지'만 쓰지 말고 '왜 그 순서인지'와 '언제 그 선택이 위험한지'를 함께 쓴다.",
].join("\n");

const INTENT_COMPARE_SPINE = [
  "[INTENT_COMPARE_SPINE]",
  "- compare 질문은 첫 카드에서 결론을 먼저 말하고, 다음 카드에서 가장 빨리 보는 구분점과 예외를 정리한다.",
  "- 차이점만 나열하지 말고 실제 선택 기준과 실패하기 쉬운 함정을 함께 쓴다.",
].join("\n");

const INTENT_NUMERIC_SPINE = [
  "[INTENT_NUMERIC_SPINE]",
  "- numeric 질문은 기준/현재 의미/바로 확인할 것/보고 임계점을 분리한다.",
  "- 수치 해석이 행동으로 이어지는지 분명히 보여줘야 한다.",
].join("\n");

const INTENT_DEVICE_SPINE = [
  "[INTENT_DEVICE_SPINE]",
  "- device 질문은 장비 조작 팁이 아니라 환자 안전 기준에서 답한다.",
  "- 원인 후보, bedside 재확인, 즉시 조치, 언제 보고할지를 한 흐름으로 연결한다.",
].join("\n");

const DOMAIN_VENTILATOR_ABGA = [
  "[DOMAIN_VENTILATOR_ABGA]",
  "- ventilator/ABGA 질문에서는 minute ventilation, lung-protective ventilation, waveform, PBW, plateau/driving pressure, sampling artifact를 필요에 따라 연결한다.",
  "- CO2 문제와 산소화 문제를 섞어 말하지 말고 각각의 목적과 접근을 분리한다.",
].join("\n");

const DOMAIN_OXYGENATION = [
  "[DOMAIN_OXYGENATION]",
  "- 산소화 문제는 RR로 해결되지 않을 수 있다는 점을 분명히 하고, FiO2/PEEP, recruitability, prone, 분비물, 동기화 문제를 함께 본다.",
].join("\n");

const DOMAIN_INFUSION_DEVICE = [
  "[DOMAIN_INFUSION_DEVICE]",
  "- pump/line/device 질문은 device manipulation 자체보다 line tracing, patient response, alarm context, stop-report criteria를 우선한다.",
].join("\n");

const DOMAIN_MEDICATION_SAFETY = [
  "[DOMAIN_MEDICATION_SAFETY]",
  "- 약물 질문은 정확한 약명/농도/경로 식별 전 unsafe specificity를 피하고, 약제부/IFU/기관 프로토콜 확인 경로를 분명히 한다.",
].join("\n");

const DOMAIN_LINE_TUBE = [
  "[DOMAIN_LINE_TUBE]",
  "- line/tube 질문은 위치, 연결, 누출, 막힘, 한쪽 변화, 최근 조작 여부를 bedside sweep에 포함한다.",
].join("\n");

const DOMAIN_ESCALATION_REPORTING = [
  "[DOMAIN_ESCALATION_REPORTING]",
  "- escalation이 필요하면 mode/setting, 환자 상태, 핵심 수치, 이미 확인한 reversible cause, 원하는 의사결정 포인트를 묶어 보고하게 한다.",
].join("\n");

const DENSITY_CHECKLIST_CONTRACT = [
  "[DENSITY_CHECKLIST_CONTRACT]",
  "- bedside_recheck artifact가 있으면 단일 항목 반복이 아니라 최소 5개 전후의 체크 포인트로 채운다.",
  "- patient / waveform / tube-circuit / secretion-obstruction / measurement-sampling / oxygenation 중 최소 3개 이상 도메인을 건드린다.",
].join("\n");

const DENSITY_DOMAIN_COVERAGE_CONTRACT = [
  "[DENSITY_DOMAIN_COVERAGE_CONTRACT]",
  "- checklist는 한 영역에 몰리지 않게 배치한다.",
  "- 보고/노티 카드가 있으면 데이터 포인트 최소 4개 이상을 묶는다.",
].join("\n");

const DENSITY_EXCEPTION_BALANCE_CONTRACT = [
  "[DENSITY_EXCEPTION_BALANCE_CONTRACT]",
  "- recommendation만 말하지 말고 counterfactual과 exception boundary를 같이 준다.",
  "- 예외는 단순 경고가 아니라 '언제 RR만 올리면 위험한지', '언제 Pi를 제한적으로 고려하는지'처럼 실제 선택을 바꾸는 조건이어야 한다.",
].join("\n");

const ANTI_FAILURE_SPECIFICITY_GUARD = [
  "[ANTI_FAILURE_SPECIFICITY_GUARD]",
  "- 확인되지 않은 대상에 대해 용량, 속도, 희석, 경로, 호환성, 세팅값을 만들어내지 않는다.",
  "- 불확실하면 삭제하거나 '확인 전 단정 금지'로 바꾼다.",
].join("\n");

const ANTI_FAILURE_BUDGET_GUARD = [
  "[ANTI_FAILURE_BUDGET_GUARD]",
  "- 길이를 줄여야 할 때도 direct_answer, immediate_action, exception_boundary, urgent_red_flags, protocol_caveat는 절대 삭제하지 않는다.",
  "- memory_point, mini_case, 일부 확장 설명만 예산에 따라 줄일 수 있다.",
].join("\n");

const LANGUAGE_DELTA = [
  "[LANGUAGE_DELTA]",
  "- 위 규칙을 유지하되 최종 답변만 자연스러운 bedside clinical English로 작성한다.",
].join("\n");

function sanitizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = String(value ?? "").trim();
  return (allowed.find((item) => item === text) ?? fallback) as T;
}

function sanitizeEnumArray<T extends string>(value: unknown, allowed: readonly T[], fallback: T[] = []) {
  if (!Array.isArray(value)) return fallback;
  const next = value
    .map((item) => String(item ?? "").trim())
    .filter((item): item is T => allowed.includes(item as T));
  return Array.from(new Set(next));
}

function resolveMedSafetyFormat(answerDepth: MedSafetyAnswerDepth, risk: MedSafetyRisk, intent: MedSafetyIntent): MedSafetyFormat {
  if (answerDepth === "short" && risk === "low" && (intent === "knowledge" || intent === "numeric")) {
    return "short";
  }
  return "sectioned";
}

function inferRisk(query: string, signals: MedSafetyQuestionSignals): MedSafetyRisk {
  if (countHighRiskHits(query) > 0) return "high";
  if (signals.mentionsPreNotification || signals.mentionsReportNeed) return "high";
  if (
    signals.mentionsPairedVentOxyProblem ||
    signals.mentionsCompatibility ||
    signals.mentionsSetting ||
    (signals.mentionsAlarm && signals.mentionsPatientState) ||
    (signals.mentionsLineOrTube && signals.mentionsMedication)
  ) {
    return "high";
  }
  if (signals.asksImmediateAction || signals.asksThreshold || signals.mixedIntent || signals.mentionsProcedure) return "medium";
  return "low";
}

function inferEntityClarity(query: string, hasImage: boolean, risk: MedSafetyRisk, signals: MedSafetyQuestionSignals): MedSafetyEntityClarity {
  const shortText = query.replace(/\s+/g, "");
  if (!query) return "low";
  if (signals.subjectFocus === "lab" || signals.subjectFocus === "patient_state") return hasImage ? "medium" : "high";
  if (includesGenericEntity(query) && !hasImage) return "low";
  if (includesGenericEntity(query) && hasImage) return "medium";
  if (isAmbiguousShortEntity(query) && risk !== "low") return shortText.length <= 4 ? "low" : "medium";
  if (shortText.length <= 3) return "low";
  if (risk === "high" && shortText.length <= 8 && includesGenericHeadNoun(query)) return "medium";
  if (/[a-z]{3,}/i.test(query) || /[가-힣]{3,}/.test(query)) {
    if (/\d+\s*(mg|mcg|meq|iu|ml|g|%)\b/i.test(query) || /\//.test(query) || shortText.length >= 8) return "high";
    return "medium";
  }
  return hasImage ? "medium" : "low";
}

function inferAnswerDepth(input: {
  query: string;
  risk: MedSafetyRisk;
  intent: MedSafetyIntent;
  hasImage: boolean;
  entityClarity: MedSafetyEntityClarity;
  ambiguousIntent: boolean;
  signals: MedSafetyQuestionSignals;
}): MedSafetyAnswerDepth {
  const compact = input.query.replace(/\s+/g, "");
  if (
    input.risk === "high" ||
    input.hasImage ||
    input.entityClarity !== "high" ||
    input.ambiguousIntent ||
    compact.length > 130 ||
    input.intent === "compare" ||
    input.signals.asksThreshold ||
    input.signals.mixedIntent ||
    input.signals.mentionsPairedVentOxyProblem ||
    input.signals.mentionsPreNotification
  ) {
    return "detailed";
  }
  if ((input.intent === "knowledge" || input.intent === "numeric") && input.risk === "low" && compact.length <= 28) {
    return "short";
  }
  return "standard";
}

function inferNeedsEscalation(input: { query: string; risk: MedSafetyRisk; intent: MedSafetyIntent; signals: MedSafetyQuestionSignals }) {
  if (input.risk === "high") return true;
  if (input.signals.mentionsPreNotification || input.signals.asksReportScript) return true;
  if ((input.intent === "action" || input.intent === "device") && hasEscalationLanguage(input.query)) return true;
  if (input.signals.asksThreshold && (input.intent === "numeric" || input.signals.mentionsPatientState)) return true;
  return false;
}

function inferUrgencyLevel(signals: MedSafetyQuestionSignals, risk: MedSafetyRisk, needsEscalation: boolean) {
  if (signals.mentionsSuddenDeterioration || signals.mentionsPairedVentOxyProblem) return "critical" as const;
  if (risk === "high" || needsEscalation || signals.mentionsPreNotification) return "urgent" as const;
  if (risk === "medium" || signals.asksThreshold || signals.asksImmediateAction) return "prompt" as const;
  return "routine" as const;
}

function inferWorkflowStage(signals: MedSafetyQuestionSignals): MedSafetyRouteDecision["workflowStage"] {
  if (signals.mentionsPreNotification || signals.asksReportScript) return "pre_notification";
  if (signals.mentionsSuddenDeterioration) return "active_deterioration";
  if (signals.asksImmediateAction) return "decision";
  if (signals.asksInterpretation || signals.mentionsLabOrNumeric) return "interpretation";
  return "orientation";
}

function inferNotificationNeed(signals: MedSafetyQuestionSignals, needsEscalation: boolean): MedSafetyRouteDecision["notificationNeed"] {
  if (signals.asksReportScript || (signals.mentionsPreNotification && needsEscalation)) return "immediate";
  if (signals.mentionsPreNotification || needsEscalation || signals.mentionsReportNeed) return "now";
  if (signals.asksThreshold || signals.asksTrendReview) return "prepare";
  return "none";
}

function inferChecklistDepth(signals: MedSafetyQuestionSignals, risk: MedSafetyRisk, answerDepth: MedSafetyAnswerDepth) {
  if (risk === "high" || signals.mentionsPairedVentOxyProblem || signals.mentionsPreNotification || answerDepth === "detailed") {
    return "dense" as const;
  }
  if (risk === "medium" || signals.asksBedsideRecheck) return "standard" as const;
  return "brief" as const;
}

function inferMeasurementDependency(signals: MedSafetyQuestionSignals, query: string): MedSafetyRouteDecision["measurementDependency"] {
  if (signals.mentionsABGA || signals.mentionsLabOrNumeric || signals.mentionsSetting || countPatternHits(query, PBW_PATTERNS) > 0) {
    return "high";
  }
  if (signals.asksTrendReview || signals.mentionsMeasurementError || signals.mentionsPatientState) return "medium";
  return "low";
}

function inferDangerBias(risk: MedSafetyRisk, signals: MedSafetyQuestionSignals) {
  if (risk === "high" && (signals.mentionsSuddenDeterioration || signals.mentionsPairedVentOxyProblem)) return "maximal" as const;
  if (risk === "high" || signals.mentionsPreNotification) return "elevated" as const;
  return "standard" as const;
}

function inferDetailBias(answerDepth: MedSafetyAnswerDepth, signals: MedSafetyQuestionSignals, risk: MedSafetyRisk): MedSafetyDetailBias {
  if (risk === "high" && (signals.mentionsPreNotification || signals.mentionsPairedVentOxyProblem)) return "very_high";
  if (answerDepth === "detailed" || signals.mixedIntent || signals.asksReportScript) return "high";
  return "standard";
}

function deriveSecondaryIntents(scores: IntentScoreMap, primary: MedSafetyIntent) {
  return (Object.keys(scores) as MedSafetyIntent[])
    .filter((intent) => intent !== primary && scores[intent] > 0)
    .sort((a, b) => scores[b] - scores[a]);
}

function deriveMandatoryArtifacts(base: Pick<
  MedSafetyRouteDecision,
  | "intent"
  | "risk"
  | "urgencyLevel"
  | "workflowStage"
  | "notificationNeed"
  | "reversibleCauseSweep"
  | "counterfactualNeed"
  | "exceptionNeed"
  | "pairedProblemNeed"
  | "scriptNeed"
  | "measurementDependency"
  | "entityClarity"
>, signals: MedSafetyQuestionSignals): MedSafetyArtifactId[] {
  const artifacts: MedSafetyArtifactId[] = ["direct_answer"];
  if (base.risk !== "low" || base.pairedProblemNeed || base.intent === "numeric") artifacts.push("severity_frame");
  if (base.urgencyLevel !== "routine" || base.intent === "action" || base.intent === "device") artifacts.push("immediate_action");
  if (base.reversibleCauseSweep || base.notificationNeed !== "none" || signals.asksBedsideRecheck) artifacts.push("bedside_recheck");
  if (base.reversibleCauseSweep) artifacts.push("reversible_cause_sweep");
  if (base.reversibleCauseSweep || signals.asksFalseWorseningSweep || signals.mentionsMeasurementError || signals.mentionsSuddenDeterioration) {
    artifacts.push("false_worsening_sweep");
  }
  if (base.intent === "compare" || signals.mixedIntent || signals.mentionsNumericActionMix) artifacts.push("why_this_before_that");
  if (base.intent !== "knowledge" || base.pairedProblemNeed) artifacts.push("why_recommended_path");
  if (base.counterfactualNeed) artifacts.push("counterfactual");
  if (base.exceptionNeed) artifacts.push("when_not_to_do_that", "exception_boundary");
  if (base.measurementDependency !== "low") artifacts.push("measurement_dependency");
  if (base.pairedProblemNeed) artifacts.push("paired_problem_handling");
  if (base.notificationNeed !== "none") artifacts.push("notification_payload");
  if (base.scriptNeed) artifacts.push("notification_script");
  if (base.urgencyLevel !== "routine" || base.notificationNeed !== "none") artifacts.push("urgent_red_flags");
  if (base.risk === "high" || base.entityClarity !== "high") artifacts.push("protocol_caveat");
  return Array.from(new Set(artifacts));
}

function deriveSectionEmphasis(decision: Pick<MedSafetyRouteDecision, "workflowStage" | "notificationNeed" | "mandatoryArtifacts" | "pairedProblemNeed">) {
  const next: string[] = ["핵심 판단"];
  if (decision.mandatoryArtifacts.includes("immediate_action")) next.push("지금 할 일");
  if (decision.mandatoryArtifacts.includes("bedside_recheck")) {
    next.push(decision.workflowStage === "pre_notification" ? "노티 전 지금 확인할 것" : "지금 확인할 것");
  }
  if (decision.mandatoryArtifacts.includes("why_recommended_path") || decision.mandatoryArtifacts.includes("why_this_before_that")) {
    next.push("왜 이 순서로 보는지");
  }
  if (decision.mandatoryArtifacts.includes("counterfactual") || decision.mandatoryArtifacts.includes("exception_boundary")) {
    next.push("헷갈리기 쉬운 예외");
  }
  if (decision.pairedProblemNeed) next.push("같이 봐야 할 문제");
  if (decision.notificationNeed !== "none") next.push("주치의 노티 포인트");
  if (decision.mandatoryArtifacts.includes("urgent_red_flags")) next.push("즉시 보고 신호");
  return Array.from(new Set(next));
}

function normalizeRouteDecision(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals) {
  const next = { ...decision };
  if (next.risk === "high") next.needsEscalation = true;
  if (next.entityClarity === "low" && next.answerDepth === "short") next.answerDepth = "standard";
  if (next.intent === "compare" && next.answerDepth === "short") next.answerDepth = "standard";
  next.needsSbar = next.needsEscalation && (next.intent === "action" || next.intent === "device" || next.notificationNeed !== "none");
  next.format = resolveMedSafetyFormat(next.answerDepth, next.risk, next.intent);
  next.mandatoryArtifacts = Array.from(new Set([...deriveMandatoryArtifacts(next, signals), ...next.mandatoryArtifacts]));
  if (!next.sectionEmphasis.length) {
    next.sectionEmphasis = deriveSectionEmphasis(next);
  }
  const defaultCommunicationArtifacts =
    next.notificationNeed === "none"
      ? []
      : next.scriptNeed
        ? (["notification_payload", "notification_script"] as const)
        : (["notification_payload"] as const);
  next.communicationArtifacts = Array.from(new Set([...defaultCommunicationArtifacts, ...next.communicationArtifacts]));
  return next;
}

export function resolveMedSafetyRuntimeMode(): MedSafetyRuntimeMode {
  const raw = String(process.env.OPENAI_MED_SAFETY_RUNTIME_MODE ?? "hybrid_live").trim().toLowerCase();
  if (raw === "hybrid_shadow") return "hybrid_shadow";
  if (raw === "hybrid_live") return "hybrid_live";
  return "legacy";
}

export function shouldGenerateKoEnglishVariant() {
  const override = String(process.env.OPENAI_MED_SAFETY_EAGER_EN_TRANSLATE ?? "").trim().toLowerCase();
  if (override) {
    if (["0", "false", "off", "no"].includes(override)) return false;
    if (["1", "true", "on", "yes"].includes(override)) return true;
  }
  return false;
}

export function buildDeterministicRouteDecision(input: RouteInput): MedSafetyRouteDecision {
  const normalizedQuery = normalizeQuery(input.query);
  const signals = buildQuestionSignals(normalizedQuery);
  const topIntent = pickTopIntent(signals.intentScores);
  const intent = topIntent.topScore > 0 ? topIntent.top : "knowledge";
  const secondaryIntents = deriveSecondaryIntents(signals.intentScores, intent);
  const risk = inferRisk(normalizedQuery, signals);
  const entityClarity = inferEntityClarity(normalizedQuery, Boolean(input.imageDataUrl), risk, signals);
  const answerDepth = inferAnswerDepth({
    query: normalizedQuery,
    risk,
    intent,
    hasImage: Boolean(input.imageDataUrl),
    entityClarity,
    ambiguousIntent: topIntent.isAmbiguous,
    signals,
  });
  const needsEscalation = inferNeedsEscalation({ query: normalizedQuery, risk, intent, signals });
  const workflowStage = inferWorkflowStage(signals);
  const notificationNeed = inferNotificationNeed(signals, needsEscalation);
  const urgencyLevel = inferUrgencyLevel(signals, risk, needsEscalation);
  const counterfactualNeed = intent === "compare" || signals.mixedIntent || signals.asksSelection || signals.mentionsNumericActionMix;
  const exceptionNeed = counterfactualNeed || signals.asksExceptionBoundary || risk === "high";
  const pairedProblemNeed = signals.mentionsPairedVentOxyProblem;
  const measurementDependency = inferMeasurementDependency(signals, normalizedQuery);
  const base: MedSafetyRouteDecision = {
    intent,
    secondaryIntents,
    risk,
    entityClarity,
    answerDepth,
    needsEscalation,
    needsSbar: false,
    format: resolveMedSafetyFormat(answerDepth, risk, intent),
    source: "rules",
    confidence: topIntent.isAmbiguous || entityClarity !== "high" ? "medium" : "high",
    urgencyLevel,
    workflowStage,
    notificationNeed,
    reversibleCauseSweep:
      risk === "high" ||
      signals.mentionsVentilation ||
      signals.mentionsAlarm ||
      signals.mentionsSuddenDeterioration ||
      signals.mentionsPreNotification,
    trendNeed: signals.asksTrendReview || signals.mentionsSuddenDeterioration || signals.mentionsLabOrNumeric,
    thresholdNeed: signals.asksThreshold || needsEscalation,
    counterfactualNeed,
    exceptionNeed,
    pairedProblemNeed,
    scriptNeed: notificationNeed !== "none" && (signals.asksReportScript || signals.mentionsPreNotification || risk === "high"),
    checklistDepth: inferChecklistDepth(signals, risk, answerDepth),
    measurementDependency,
    mandatoryArtifacts: [],
    sectionEmphasis: [],
    dangerBias: inferDangerBias(risk, signals),
    detailBias: inferDetailBias(answerDepth, signals, risk),
    communicationArtifacts: [],
    reason: [
      topIntent.topScore > 0 ? `intent=${intent}` : "intent=knowledge(default)",
      secondaryIntents.length ? `secondary=${secondaryIntents.join("+")}` : "secondary=none",
      `risk=${risk}`,
      `entity=${entityClarity}`,
      `subject=${signals.subjectFocus}`,
      signals.mixedIntent ? "mixed_intent" : "single_intent",
      signals.mentionsPreNotification ? "pre_notification" : "",
      signals.mentionsPairedVentOxyProblem ? "paired_vent_oxy" : "",
      signals.mentionsNumericActionMix ? "numeric_action_mix" : "",
      workflowStage,
    ]
      .filter(Boolean)
      .join(", "),
  };
  return normalizeRouteDecision(base, signals);
}

export function shouldUseTinyRouter(input: RouteInput, decision: MedSafetyRouteDecision) {
  const normalizedQuery = normalizeQuery(input.query);
  const signals = buildQuestionSignals(normalizedQuery);
  const topIntent = pickTopIntent(signals.intentScores);
  const shortAmbiguousEntity =
    decision.entityClarity !== "high" &&
    decision.risk !== "low" &&
    normalizedQuery.replace(/\s+/g, "").length <= 14 &&
    includesGenericHeadNoun(normalizedQuery);

  return (
    Boolean(input.imageDataUrl) ||
    topIntent.isAmbiguous ||
    signals.mixedIntent ||
    decision.secondaryIntents.length >= 1 ||
    signals.mentionsNumericActionMix ||
    signals.mentionsPairedVentOxyProblem ||
    signals.mentionsPreNotification ||
    (decision.risk === "high" && decision.entityClarity !== "high") ||
    decision.counterfactualNeed ||
    decision.exceptionNeed ||
    shortAmbiguousEntity ||
    (signals.mentionsVentilation && signals.mentionsPatientState && signals.mentionsLabOrNumeric) ||
    normalizedQuery.length >= 220
  );
}

export function buildTinyRouterDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You are a meta router for nurse-facing clinical search.",
      "Do not answer the clinical question.",
      "Return JSON only.",
      "Your job is not just intent classification. You must also decide which bedside deliverables are mandatory in the final answer.",
      "Allowed JSON shape:",
      '{"primaryIntent":"knowledge|action|compare|numeric|device","secondaryIntents":["knowledge|action|compare|numeric|device"],"risk":"low|medium|high","entityClarity":"high|medium|low","answerDepth":"short|standard|detailed","needsEscalation":true,"needsSbar":false,"format":"short|sectioned","urgencyLevel":"routine|prompt|urgent|critical","workflowStage":"orientation|interpretation|decision|pre_notification|active_deterioration|post_action_review","notificationNeed":"none|prepare|now|immediate","reversibleCauseSweep":true,"trendNeed":true,"thresholdNeed":true,"counterfactualNeed":true,"exceptionNeed":true,"pairedProblemNeed":true,"scriptNeed":true,"checklistDepth":"brief|standard|dense","measurementDependency":"low|medium|high","mandatoryArtifacts":["direct_answer|severity_frame|immediate_action|bedside_recheck|reversible_cause_sweep|false_worsening_sweep|why_recommended_path|why_this_before_that|when_not_to_do_that|exception_boundary|counterfactual|measurement_dependency|paired_problem_handling|notification_payload|notification_script|urgent_red_flags|protocol_caveat|memory_point|mini_case"],"sectionEmphasis":["short heading"],"dangerBias":"standard|elevated|maximal","detailBias":"standard|high|very_high","communicationArtifacts":["notification_payload|notification_script"],"reason":"one sentence"}',
      "Classify conservatively.",
      "If the question mixes numbers + device + patient state, force action-before-background and include bedside, notification, and exception artifacts.",
      "If the user asks before notification, include notification payload and usually notification script.",
      "If ventilation and oxygenation are coupled, pairedProblemNeed should be true.",
      "If the answer could become unsafe by over-specificity, raise risk and add protocol_caveat rather than guessing.",
    ].join("\n");
  }
  return [
    "너는 간호사용 임상검색 메타 라우터다.",
    "임상 답변을 생성하지 않는다.",
    "JSON만 반환한다.",
    "너의 역할은 intent 분류만이 아니라, 최종 답변에 반드시 들어가야 할 bedside deliverable을 고르는 것이다.",
    "허용된 JSON shape:",
    '{"primaryIntent":"knowledge|action|compare|numeric|device","secondaryIntents":["knowledge|action|compare|numeric|device"],"risk":"low|medium|high","entityClarity":"high|medium|low","answerDepth":"short|standard|detailed","needsEscalation":true,"needsSbar":false,"format":"short|sectioned","urgencyLevel":"routine|prompt|urgent|critical","workflowStage":"orientation|interpretation|decision|pre_notification|active_deterioration|post_action_review","notificationNeed":"none|prepare|now|immediate","reversibleCauseSweep":true,"trendNeed":true,"thresholdNeed":true,"counterfactualNeed":true,"exceptionNeed":true,"pairedProblemNeed":true,"scriptNeed":true,"checklistDepth":"brief|standard|dense","measurementDependency":"low|medium|high","mandatoryArtifacts":["direct_answer|severity_frame|immediate_action|bedside_recheck|reversible_cause_sweep|false_worsening_sweep|why_recommended_path|why_this_before_that|when_not_to_do_that|exception_boundary|counterfactual|measurement_dependency|paired_problem_handling|notification_payload|notification_script|urgent_red_flags|protocol_caveat|memory_point|mini_case"],"sectionEmphasis":["짧은 제목"],"dangerBias":"standard|elevated|maximal","detailBias":"standard|high|very_high","communicationArtifacts":["notification_payload|notification_script"],"reason":"한 문장"}',
    "애매하면 보수적으로 분류한다.",
    "숫자 + 장비 + 환자 상태가 섞이면 action-before-background로 보고 bedside, notification, exception artifact를 적극적으로 포함한다.",
    "노티 전 질문이면 notification_payload를 기본으로, 실제 보고 문장이 필요해 보이면 notification_script도 포함한다.",
    "환기와 산소화가 같이 얽혀 있으면 pairedProblemNeed를 true로 둔다.",
    "확인되지 않은 구체성을 만들어낼 위험이 있으면 guess하지 말고 risk를 높이고 protocol_caveat를 붙인다.",
  ].join("\n");
}

export function buildTinyRouterUserPrompt(input: RouteInput) {
  const normalizedQuery = normalizeText(input.query);
  const imageLine =
    input.imageDataUrl
      ? input.locale === "en"
        ? "Image included: yes"
        : "이미지 포함: 예"
      : input.locale === "en"
        ? "Image included: no"
        : "이미지 포함: 아니오";
  return input.locale === "en"
    ? [`User question: ${normalizedQuery}`, imageLine, "Return classification JSON only."].join("\n")
    : [`사용자 질문: ${normalizedQuery}`, imageLine, "분류 JSON만 반환하라."].join("\n");
}

export function parseTinyRouterDecision(raw: string, fallback: MedSafetyRouteDecision): MedSafetyRouteDecision {
  try {
    const parsed = JSON.parse(String(raw ?? "").trim()) as Partial<{
      primaryIntent: string;
      secondaryIntents: unknown[];
      risk: string;
      entityClarity: string;
      answerDepth: string;
      needsEscalation: boolean;
      needsSbar: boolean;
      format: string;
      urgencyLevel: string;
      workflowStage: string;
      notificationNeed: string;
      reversibleCauseSweep: boolean;
      trendNeed: boolean;
      thresholdNeed: boolean;
      counterfactualNeed: boolean;
      exceptionNeed: boolean;
      pairedProblemNeed: boolean;
      scriptNeed: boolean;
      checklistDepth: string;
      measurementDependency: string;
      mandatoryArtifacts: unknown[];
      sectionEmphasis: unknown[];
      dangerBias: string;
      detailBias: string;
      communicationArtifacts: unknown[];
      reason: unknown;
    }>;
    const syntheticSignals = buildQuestionSignals(normalizeQuery(fallback.reason));
    return normalizeRouteDecision(
      {
        intent: sanitizeEnum(parsed.primaryIntent, MED_SAFETY_INTENTS, fallback.intent),
        secondaryIntents: sanitizeEnumArray(parsed.secondaryIntents, MED_SAFETY_INTENTS, fallback.secondaryIntents),
        risk: sanitizeEnum(parsed.risk, MED_SAFETY_RISKS, fallback.risk),
        entityClarity: sanitizeEnum(parsed.entityClarity, MED_SAFETY_ENTITY_CLARITIES, fallback.entityClarity),
        answerDepth: sanitizeEnum(parsed.answerDepth, ["short", "standard", "detailed"] as const, fallback.answerDepth),
        needsEscalation: typeof parsed.needsEscalation === "boolean" ? parsed.needsEscalation : fallback.needsEscalation,
        needsSbar: typeof parsed.needsSbar === "boolean" ? parsed.needsSbar : fallback.needsSbar,
        format: sanitizeEnum(parsed.format, MED_SAFETY_FORMATS, fallback.format),
        source: "model",
        confidence: "medium",
        urgencyLevel: sanitizeEnum(parsed.urgencyLevel, MED_SAFETY_URGENCY_LEVELS, fallback.urgencyLevel),
        workflowStage: sanitizeEnum(parsed.workflowStage, MED_SAFETY_WORKFLOW_STAGES, fallback.workflowStage),
        notificationNeed: sanitizeEnum(parsed.notificationNeed, MED_SAFETY_NOTIFICATION_NEEDS, fallback.notificationNeed),
        reversibleCauseSweep:
          typeof parsed.reversibleCauseSweep === "boolean" ? parsed.reversibleCauseSweep : fallback.reversibleCauseSweep,
        trendNeed: typeof parsed.trendNeed === "boolean" ? parsed.trendNeed : fallback.trendNeed,
        thresholdNeed: typeof parsed.thresholdNeed === "boolean" ? parsed.thresholdNeed : fallback.thresholdNeed,
        counterfactualNeed: typeof parsed.counterfactualNeed === "boolean" ? parsed.counterfactualNeed : fallback.counterfactualNeed,
        exceptionNeed: typeof parsed.exceptionNeed === "boolean" ? parsed.exceptionNeed : fallback.exceptionNeed,
        pairedProblemNeed: typeof parsed.pairedProblemNeed === "boolean" ? parsed.pairedProblemNeed : fallback.pairedProblemNeed,
        scriptNeed: typeof parsed.scriptNeed === "boolean" ? parsed.scriptNeed : fallback.scriptNeed,
        checklistDepth: sanitizeEnum(parsed.checklistDepth, MED_SAFETY_CHECKLIST_DEPTHS, fallback.checklistDepth),
        measurementDependency: sanitizeEnum(parsed.measurementDependency, MED_SAFETY_MEASUREMENT_DEPENDENCIES, fallback.measurementDependency),
        mandatoryArtifacts: sanitizeEnumArray(parsed.mandatoryArtifacts, MED_SAFETY_ARTIFACT_IDS, fallback.mandatoryArtifacts),
        sectionEmphasis: Array.isArray(parsed.sectionEmphasis)
          ? Array.from(new Set(parsed.sectionEmphasis.map((item) => normalizeText(item)).filter(Boolean))).slice(0, 8)
          : fallback.sectionEmphasis,
        dangerBias: sanitizeEnum(parsed.dangerBias, MED_SAFETY_DANGER_BIASES, fallback.dangerBias),
        detailBias: sanitizeEnum(parsed.detailBias, MED_SAFETY_DETAIL_BIASES, fallback.detailBias),
        communicationArtifacts: sanitizeEnumArray(parsed.communicationArtifacts, MED_SAFETY_ARTIFACT_IDS, fallback.communicationArtifacts),
        reason: normalizeText(parsed.reason) || "model_router",
      },
      syntheticSignals
    );
  } catch {
    return fallback;
  }
}

export function buildMedSafetyPromptBlueprint(
  decision: MedSafetyRouteDecision,
  options?: {
    hasImage?: boolean;
    query?: string;
  }
): MedSafetyPromptBlueprint {
  const normalizedQuery = normalizeQuery(options?.query ?? "");
  const signals = buildQuestionSignals(normalizedQuery);
  return buildArtifactPlannerBlueprint(decision, {
    hasImage: Boolean(options?.hasImage),
    query: normalizedQuery,
    signals,
  });
}

function buildPlannerBlueprintContract(decision: MedSafetyRouteDecision, blueprint: MedSafetyPromptBlueprint) {
  return [
    "[ARTIFACT_PLANNER_BLUEPRINT]",
    `- opening_mode=${blueprint.openingMode}`,
    `- primary_intent=${decision.intent}`,
    `- secondary_intents=${decision.secondaryIntents.join(" | ") || "none"}`,
    `- required_artifacts=${blueprint.requiredArtifacts.join(" | ") || "none"}`,
    `- optional_artifacts=${blueprint.optionalArtifacts.join(" | ") || "none"}`,
    `- artifact_order=${blueprint.artifactOrder.join(" -> ") || "none"}`,
    `- artifact_quota=${Object.entries(blueprint.artifactQuota)
      .map(([key, value]) => `${key}:${value}`)
      .join(" | ") || "none"}`,
    `- artifact_depth=${Object.entries(blueprint.artifactDepth)
      .map(([key, value]) => `${key}:${value}`)
      .join(" | ") || "none"}`,
    `- section_emphasis=${blueprint.sectionEmphasis.join(" | ") || "none"}`,
    `- communication_artifacts=${blueprint.communicationArtifacts.join(" | ") || "none"}`,
    `- domain_coverage_targets=${blueprint.domainCoverageTargets.join(" | ") || "none"}`,
    `- must_not_assert=${blueprint.mustNotAssert.join(" | ") || "none"}`,
    `- followup_policy=${blueprint.followupPolicy}`,
    "- 답변은 위 artifact를 누락 없이 채우되, 섹션 제목은 질문 맥락에 맞게 자연스럽게 조립한다.",
  ].join("\n");
}

function buildArtifactContractText(artifact: MedSafetyArtifactId, decision: MedSafetyRouteDecision, blueprint: MedSafetyPromptBlueprint) {
  const quota = blueprint.artifactQuota[artifact] ?? 1;
  const depth = blueprint.artifactDepth[artifact] ?? "standard";
  const headingHint = blueprint.sectionEmphasis.join(" | ");
  switch (artifact) {
    case "direct_answer":
      return [
        "[ARTIFACT_DIRECT_ANSWER]",
        `- 첫 결론 카드에서 질문에 대한 직접 답을 1~2문장으로 단정적으로 제시한다. quota=${quota}, depth=${depth}`,
        "- '보통', '일반적으로'로만 시작하지 말고 실제 추천 선택을 먼저 말한다.",
      ].join("\n");
    case "severity_frame":
      return [
        "[ARTIFACT_SEVERITY_FRAME]",
        `- 왜 이 상황이 단순 지식문제가 아니라 위험 프레임인지 바로 설명한다. quota=${quota}, depth=${depth}`,
        "- 수치/상태/장비 문제 중 무엇이 더 위험한지 우선순위를 붙여라.",
      ].join("\n");
    case "immediate_action":
      return [
        "[ARTIFACT_IMMEDIATE_ACTION]",
        `- 지금 바로 할 행동을 리드와 bullet에 분명히 쓴다. quota=${quota}, depth=${depth}`,
        "- 멈출 것, 확인할 것, 호출할 것을 흐리지 말고 분리한다.",
      ].join("\n");
    case "bedside_recheck":
      return [
        "[ARTIFACT_BEDSIDE_RECHECK]",
        `- bedside에서 재확인할 항목을 최소 ${quota}개 전후로 제시한다. depth=${depth}`,
        "- patient / waveform / tube-circuit / secretion-obstruction / measurement-sampling / oxygenation 중 최소 3개 도메인을 커버한다.",
      ].join("\n");
    case "reversible_cause_sweep":
      return [
        "[ARTIFACT_REVERSIBLE_CAUSE_SWEEP]",
        `- 지금 바로 교정 가능한 원인을 먼저 훑는다. quota=${quota}, depth=${depth}`,
        "- 회로, 튜브, 누출, 분비물, 체위, 측정 오류, 비동기 같은 reversible cause를 우선한다.",
      ].join("\n");
    case "false_worsening_sweep":
      return [
        "[ARTIFACT_FALSE_WORSENING_SWEEP]",
        `- 실제 악화 전에 sampling artifact나 measurement error를 배제하는 흐름을 넣는다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "why_recommended_path":
      return [
        "[ARTIFACT_WHY_RECOMMENDED_PATH]",
        `- 추천 선택을 왜 우선하는지 병태생리와 실무 목적을 연결해 설명한다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "why_this_before_that":
      return [
        "[ARTIFACT_WHY_THIS_BEFORE_THAT]",
        `- 왜 A보다 B를 먼저 보는지, 즉 의사결정 순서를 설명한다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "when_not_to_do_that":
      return [
        "[ARTIFACT_WHEN_NOT_TO_DO_THAT]",
        `- 추천 행동이 그대로 적용되지 않는 조건을 따로 적는다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "exception_boundary":
      return [
        "[ARTIFACT_EXCEPTION_BOUNDARY]",
        `- 예외, 반대조건, 보수적으로 멈춰야 할 경계를 분명히 적는다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "counterfactual":
      return [
        "[ARTIFACT_COUNTERFACTUAL]",
        `- counterfactual은 반드시 세 가지를 다룬다: 왜 현재 추천이 먼저인지, 언제 그 추천만 밀면 위험한지, 언제 다른 카드가 제한적으로 열리는지. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "measurement_dependency":
      return [
        "[ARTIFACT_MEASUREMENT_DEPENDENCY]",
        `- 이 판단이 무엇을 실제로 알아야 완성되는지 분명히 적는다. quota=${quota}, depth=${depth}`,
        "- 예: PBW, plateau/driving pressure, actual total RR, waveform, trend, repeat ABGA, exact drug/device identification.",
      ].join("\n");
    case "paired_problem_handling":
      return [
        "[ARTIFACT_PAIRED_PROBLEM_HANDLING]",
        `- 두 문제가 같이 존재하면 한쪽만 보지 말고 목적별 접근을 분리한다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "notification_payload":
      return [
        "[ARTIFACT_NOTIFICATION_PAYLOAD]",
        `- 노티 카드에는 최소 ${Math.max(4, quota)}개 이상의 데이터 요소를 묶는다. depth=${depth}`,
        "- mode/setting, 핵심 수치, 환자 상태, 이미 확인한 reversible cause, 원하는 의사결정 포인트를 포함한다.",
      ].join("\n");
    case "notification_script":
      return [
        "[ARTIFACT_NOTIFICATION_SCRIPT]",
        `- 실제 보고 문장을 최소 3문장 이상 제시한다. quota=${quota}, depth=${depth}`,
        "- 문장은 현장에서 그대로 읽어도 자연스러운 수준으로 쓴다.",
      ].join("\n");
    case "urgent_red_flags":
      return [
        "[ARTIFACT_URGENT_RED_FLAGS]",
        `- 즉시 보고/호출 신호를 별도 카드 또는 별도 묶음으로 분명히 적는다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "protocol_caveat":
      return [
        "[ARTIFACT_PROTOCOL_CAVEAT]",
        `- 기관 프로토콜, 약제부, 의사 지시, 제조사 IFU가 최종 기준인 지점을 짧고 분명하게 남긴다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "memory_point":
      return [
        "[ARTIFACT_MEMORY_POINT]",
        `- 혼동을 줄이는 짧은 기억 포인트를 덧붙인다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    case "mini_case":
      return [
        "[ARTIFACT_MINI_CASE]",
        `- 3~4줄 수준의 매우 짧은 mini-case를 통해 선택 기준을 고정한다. quota=${quota}, depth=${depth}`,
      ].join("\n");
    default:
      return `[ARTIFACT_FALLBACK]\n- section_emphasis_hint=${headingHint}`;
  }
}

function buildIntentContract(intent: MedSafetyIntent) {
  switch (intent) {
    case "action":
      return { id: "intent_action_spine" as const, text: INTENT_ACTION_SPINE, optional: false, dropPriority: 999 };
    case "compare":
      return { id: "intent_compare_spine" as const, text: INTENT_COMPARE_SPINE, optional: false, dropPriority: 999 };
    case "numeric":
      return { id: "intent_numeric_spine" as const, text: INTENT_NUMERIC_SPINE, optional: false, dropPriority: 999 };
    case "device":
      return { id: "intent_device_spine" as const, text: INTENT_DEVICE_SPINE, optional: false, dropPriority: 999 };
    default:
      return { id: "intent_knowledge_spine" as const, text: INTENT_KNOWLEDGE_SPINE, optional: false, dropPriority: 999 };
  }
}

function buildSelectedContractSpecs(args: {
  decision: MedSafetyRouteDecision;
  locale: "ko" | "en";
  blueprint: MedSafetyPromptBlueprint;
  signals: MedSafetyQuestionSignals;
}) {
  const { decision, locale, blueprint, signals } = args;
  const specs: PromptContractSpec[] = [
    { id: "core_role_goal_spine", text: CORE_ROLE_GOAL_SPINE, optional: false, dropPriority: 999 },
    { id: "core_decision_priority_spine", text: CORE_DECISION_PRIORITY_SPINE, optional: false, dropPriority: 999 },
    { id: "core_safety_certainty_spine", text: CORE_SAFETY_CERTAINTY_SPINE, optional: false, dropPriority: 999 },
    { id: "core_rendering_discipline_spine", text: CORE_RENDERING_DISCIPLINE_SPINE, optional: false, dropPriority: 999 },
    { id: "output_heading_discipline", text: OUTPUT_HEADING_DISCIPLINE, optional: false, dropPriority: 999 },
    { id: "output_lead_sentence_discipline", text: OUTPUT_LEAD_SENTENCE_DISCIPLINE, optional: false, dropPriority: 999 },
    { id: "output_no_filler_discipline", text: OUTPUT_NO_FILLER_DISCIPLINE, optional: false, dropPriority: 999 },
    { id: "artifact_planner_blueprint", text: buildPlannerBlueprintContract(decision, blueprint), optional: false, dropPriority: 999 },
    buildIntentContract(decision.intent),
    { id: "anti_failure_specificity_guard", text: ANTI_FAILURE_SPECIFICITY_GUARD, optional: false, dropPriority: 999 },
    { id: "anti_failure_budget_guard", text: ANTI_FAILURE_BUDGET_GUARD, optional: false, dropPriority: 999 },
  ];
  if (decision.risk === "high") specs.push({ id: "risk_high_spine", text: RISK_HIGH_SPINE, optional: false, dropPriority: 999 });
  else if (decision.risk === "medium") specs.push({ id: "risk_medium_spine", text: RISK_MEDIUM_SPINE, optional: false, dropPriority: 999 });

  for (const intent of decision.secondaryIntents.slice(0, 2)) {
    const contract = buildIntentContract(intent);
    specs.push({ ...contract, optional: true, dropPriority: 4 });
  }

  for (const artifact of blueprint.requiredArtifacts) {
    const actualId =
      artifact === "why_this_before_that"
        ? ("artifact_why_this_before_that" as const)
        : artifact === "when_not_to_do_that"
          ? ("artifact_when_not_to_do_that" as const)
          : (`artifact_${artifact}` as MedSafetyPromptContractId);
    specs.push({
      id: actualId,
      text: buildArtifactContractText(artifact, decision, blueprint),
      optional: false,
      dropPriority: 999,
    });
  }
  for (const artifact of blueprint.optionalArtifacts) {
    const actualId = artifact === "mini_case" ? "artifact_mini_case" : "artifact_memory_point";
    specs.push({
      id: actualId,
      text: buildArtifactContractText(artifact, decision, blueprint),
      optional: true,
      dropPriority: artifact === "mini_case" ? 1 : 2,
    });
  }

  if (signals.mentionsVentilation || signals.mentionsABGA) {
    specs.push({ id: "domain_ventilator_abga", text: DOMAIN_VENTILATOR_ABGA, optional: false, dropPriority: 999 });
  }
  if (signals.mentionsOxygenation || decision.pairedProblemNeed) {
    specs.push({ id: "domain_oxygenation", text: DOMAIN_OXYGENATION, optional: false, dropPriority: 999 });
  }
  if (signals.mentionsSetting || signals.mentionsAlarm) {
    specs.push({ id: "domain_infusion_device", text: DOMAIN_INFUSION_DEVICE, optional: false, dropPriority: 999 });
  }
  if (signals.mentionsMedication || signals.mentionsCompatibility) {
    specs.push({ id: "domain_medication_safety", text: DOMAIN_MEDICATION_SAFETY, optional: false, dropPriority: 999 });
  }
  if (signals.mentionsLineOrTube) {
    specs.push({ id: "domain_line_tube", text: DOMAIN_LINE_TUBE, optional: false, dropPriority: 999 });
  }
  if (decision.notificationNeed !== "none" || decision.needsEscalation) {
    specs.push({ id: "domain_escalation_reporting", text: DOMAIN_ESCALATION_REPORTING, optional: false, dropPriority: 999 });
  }
  if (blueprint.requiredArtifacts.includes("bedside_recheck")) {
    specs.push({ id: "density_checklist_contract", text: DENSITY_CHECKLIST_CONTRACT, optional: false, dropPriority: 999 });
    specs.push({ id: "density_domain_coverage_contract", text: DENSITY_DOMAIN_COVERAGE_CONTRACT, optional: false, dropPriority: 999 });
  }
  if (blueprint.requiredArtifacts.includes("counterfactual") || blueprint.requiredArtifacts.includes("exception_boundary")) {
    specs.push({ id: "density_exception_balance_contract", text: DENSITY_EXCEPTION_BALANCE_CONTRACT, optional: false, dropPriority: 999 });
  }
  if (locale === "en") {
    specs.push({ id: "language_delta", text: LANGUAGE_DELTA, optional: false, dropPriority: 999 });
  }
  return specs.filter((spec, index, all) => all.findIndex((candidate) => candidate.id === spec.id) === index);
}

function resolvePromptBudget(args: {
  decision: MedSafetyRouteDecision;
  runtimeMode?: MedSafetyRuntimeMode;
  hasImage?: boolean;
}) {
  if (args.runtimeMode === "legacy") return { budgetClass: "legacy" as const, budgetChars: 18_000 };
  if (args.runtimeMode === "hybrid_shadow") return { budgetClass: "shadow" as const, budgetChars: 13_500 };
  if (args.hasImage || args.decision.risk === "high") return { budgetClass: "high_risk_or_image" as const, budgetChars: 18_500 };
  return { budgetClass: "standard" as const, budgetChars: 14_000 };
}

function joinPromptContracts(specs: PromptContractSpec[]) {
  return specs.map((spec) => spec.text.trim()).filter(Boolean).join("\n\n").trim();
}

export function buildHybridBehavioralBasePrompt(locale: "ko" | "en", decision: MedSafetyRouteDecision, blueprint: MedSafetyPromptBlueprint) {
  const parts = [
    CORE_ROLE_GOAL_SPINE,
    CORE_DECISION_PRIORITY_SPINE,
    CORE_SAFETY_CERTAINTY_SPINE,
    CORE_RENDERING_DISCIPLINE_SPINE,
    buildPlannerBlueprintContract(decision, blueprint),
    OUTPUT_HEADING_DISCIPLINE,
    OUTPUT_LEAD_SENTENCE_DISCIPLINE,
    OUTPUT_NO_FILLER_DISCIPLINE,
  ];
  if (locale === "en") parts.push(LANGUAGE_DELTA);
  return parts.join("\n\n");
}

export function assembleMedSafetyDeveloperPrompt(
  decision: MedSafetyRouteDecision,
  locale: "ko" | "en",
  options?: {
    runtimeMode?: MedSafetyRuntimeMode;
    hasImage?: boolean;
    query?: string;
  }
): MedSafetyPromptAssembly {
  const normalizedQuery = normalizeQuery(options?.query ?? "");
  const signals = buildQuestionSignals(normalizedQuery);
  const blueprint = buildArtifactPlannerBlueprint(decision, {
    hasImage: Boolean(options?.hasImage),
    query: normalizedQuery,
    signals,
  });
  const selectedSpecs = buildSelectedContractSpecs({ decision, locale, blueprint, signals });
  const { budgetClass, budgetChars } = resolvePromptBudget({
    decision,
    runtimeMode: options?.runtimeMode,
    hasImage: options?.hasImage,
  });
  const keptSpecs = [...selectedSpecs];
  const droppedContractIds: MedSafetyPromptContractId[] = [];
  while (joinPromptContracts(keptSpecs).length > budgetChars) {
    const optionalSpecs = keptSpecs
      .map((spec, index) => ({ spec, index }))
      .filter((entry) => entry.spec.optional)
      .sort((a, b) => a.spec.dropPriority - b.spec.dropPriority || a.index - b.index);
    if (!optionalSpecs.length) break;
    const target = optionalSpecs[0]!;
    droppedContractIds.push(target.spec.id);
    keptSpecs.splice(target.index, 1);
  }
  const basePrompt = buildHybridBehavioralBasePrompt(locale, decision, blueprint);
  const developerPrompt = joinPromptContracts(keptSpecs);
  return {
    developerPrompt,
    basePrompt,
    blueprint,
    contractSet: {
      contractIds: keptSpecs.map((spec) => spec.id),
      optionalContractIds: keptSpecs.filter((spec) => spec.optional).map((spec) => spec.id),
    },
    selectedContractIds: keptSpecs.map((spec) => spec.id),
    droppedContractIds,
    basePromptChars: basePrompt.length,
    finalPromptChars: developerPrompt.length,
    budgetClass,
    budgetChars,
  };
}

export function buildPromptProfile(args: {
  decision: MedSafetyRouteDecision;
  model: string;
  isPremiumSearch: boolean;
  hasImage?: boolean;
}): MedSafetyPromptProfile {
  const { decision, model, isPremiumSearch, hasImage } = args;
  const normalizedModel = String(model ?? "").toLowerCase();
  const supportsHighReasoning = isPremiumSearch || normalizedModel.includes("5.4") || normalizedModel.includes("5.2");
  const isVerySimple = decision.answerDepth === "short" && decision.risk === "low" && decision.entityClarity === "high";
  const isComplex =
    Boolean(hasImage) ||
    decision.answerDepth === "detailed" ||
    decision.entityClarity !== "high" ||
    decision.risk === "high" ||
    decision.notificationNeed !== "none" ||
    decision.checklistDepth === "dense";

  if (isVerySimple) {
    return {
      reasoningEfforts: ["high", "medium"],
      verbosity: "medium",
      outputTokenCandidates: isPremiumSearch ? [10_000, 8_000, 6_500] : [8_500, 6_500, 5_000],
      qualityLevel: "balanced",
    };
  }

  if (isComplex) {
    const allowHighReasoning = supportsHighReasoning;
    return {
      reasoningEfforts: allowHighReasoning ? ["high", "medium"] : ["medium"],
      verbosity: "medium",
      outputTokenCandidates:
        decision.risk === "high" || decision.notificationNeed !== "none" || Boolean(hasImage)
          ? [18_000, 14_000, 11_000]
          : [14_000, 11_000, 9_000],
      qualityLevel: "balanced",
    };
  }

  return {
    reasoningEfforts: supportsHighReasoning ? ["high", "medium"] : ["medium"],
    verbosity: "medium",
    outputTokenCandidates: isPremiumSearch ? [12_000, 9_000, 7_500] : [10_000, 8_000, 6_500],
    qualityLevel: "balanced",
  };
}

export function shouldRunQualityGate(args: {
  decision: MedSafetyRouteDecision;
  isPremiumSearch: boolean;
  hasImage: boolean;
  answer?: string;
}) {
  if (args.isPremiumSearch) return true;
  if (args.decision.risk === "high") return true;
  if (args.decision.entityClarity !== "high") return true;
  if (args.decision.notificationNeed !== "none") return true;
  if (args.decision.checklistDepth === "dense") return true;
  if (args.hasImage) return true;
  if (args.decision.answerDepth === "detailed") return true;
  if (normalizeText(args.answer ?? "").length >= 1_200) return true;
  return false;
}

export function buildQualityGateUserPrompt(args: {
  query: string;
  answer: string;
  locale: "ko" | "en";
  decision: MedSafetyRouteDecision;
  promptAssembly?: PromptAssemblyContext | null;
}) {
  const blueprint = args.promptAssembly?.blueprint;
  return [
    args.locale === "en" ? `User question: ${normalizeText(args.query)}` : `사용자 질문: ${normalizeText(args.query)}`,
    `intent=${args.decision.intent}`,
    `secondaryIntents=${args.decision.secondaryIntents.join("|") || "none"}`,
    `risk=${args.decision.risk}`,
    `entityClarity=${args.decision.entityClarity}`,
    `answerDepth=${args.decision.answerDepth}`,
    `needsEscalation=${String(args.decision.needsEscalation)}`,
    `needsSbar=${String(args.decision.needsSbar)}`,
    `format=${args.decision.format}`,
    `confidence=${args.decision.confidence}`,
    `urgencyLevel=${args.decision.urgencyLevel}`,
    `workflowStage=${args.decision.workflowStage}`,
    `notificationNeed=${args.decision.notificationNeed}`,
    `reversibleCauseSweep=${String(args.decision.reversibleCauseSweep)}`,
    `trendNeed=${String(args.decision.trendNeed)}`,
    `thresholdNeed=${String(args.decision.thresholdNeed)}`,
    `counterfactualNeed=${String(args.decision.counterfactualNeed)}`,
    `exceptionNeed=${String(args.decision.exceptionNeed)}`,
    `pairedProblemNeed=${String(args.decision.pairedProblemNeed)}`,
    `scriptNeed=${String(args.decision.scriptNeed)}`,
    `checklistDepth=${args.decision.checklistDepth}`,
    `measurementDependency=${args.decision.measurementDependency}`,
    blueprint ? `requiredArtifacts=${blueprint.requiredArtifacts.join("|") || "none"}` : "",
    blueprint ? `optionalArtifacts=${blueprint.optionalArtifacts.join("|") || "none"}` : "",
    blueprint ? `artifactOrder=${blueprint.artifactOrder.join("->") || "none"}` : "",
    blueprint ? `artifactQuota=${Object.entries(blueprint.artifactQuota).map(([key, value]) => `${key}:${value}`).join("|") || "none"}` : "",
    blueprint ? `sectionEmphasis=${blueprint.sectionEmphasis.join("|") || "none"}` : "",
    blueprint ? `domainCoverageTargets=${blueprint.domainCoverageTargets.join("|") || "none"}` : "",
    blueprint ? `mustNotAssert=${blueprint.mustNotAssert.join("|") || "none"}` : "",
    args.promptAssembly ? `selectedContracts=${args.promptAssembly.selectedContractIds.join("|")}` : "",
    args.promptAssembly ? `droppedContracts=${args.promptAssembly.droppedContractIds.join("|") || "none"}` : "",
    "",
    args.locale === "en" ? "Answer to review:" : "검토할 답변:",
    normalizeText(args.answer),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRepairDeveloperPrompt(locale: "ko" | "en") {
  return locale === "en"
    ? [
        "You are revising a nurse-facing clinical answer.",
        "Keep the clinical intent, preserve correct lines, and patch only the listed issue codes.",
        "This is not a rewrite-from-scratch task. Prefer surgical insertion, reordering, or deletion.",
        "Do not flatten a good answer into a shallow summary.",
        "For high-risk answers, preserve direct answer, immediate action, exception boundary, red flags, and protocol caveat.",
        "When the issue requests more depth, add the missing artifact rather than adding generic explanation.",
        "Repair guide:",
        "- missing_reversible_cause_sweep: add a reversible-cause sweep before speculative interpretation.",
        "- missing_false_worsening_exclusion: add measurement/sampling/artifact checks before concluding true worsening.",
        "- missing_notification_payload: add a compact report payload with mode/setting, patient status, key data, and what has already been checked.",
        "- missing_notification_script: add at least three natural report sentences.",
        "- missing_exception_boundary or missing_counterfactual: add when the recommendation should not be pushed further and when another option opens.",
        "- missing_measurement_dependency: state exactly which measurement or missing identifier the decision depends on.",
        "- missing_paired_problem_handling: separate the coupled problems and show which lever addresses which problem.",
        "- missing_red_flags: add explicit immediate-report or urgent-call signals.",
        "- overcompressed_high_risk_answer: expand only the missing bedside artifact density; do not add fluff.",
        "- unsafe_specificity_for_ambiguous_entity or missing_protocol_caveat: delete unsafe specifics or add verification/protocol caveat.",
        "Return final plain text answer only.",
      ].join("\n")
    : [
        "너는 간호사 대상 임상답변을 수정하는 QA 편집기다.",
        "기존 답변의 임상적 의도와 맞는 문장은 유지하고, issue code에 해당하는 부분만 surgical patch 방식으로 보강하라.",
        "처음부터 다시 쓰지 말고, 필요한 artifact만 추가하거나 순서를 재배치하거나 unsafe specificity를 삭제한다.",
        "깊이를 올릴 때도 generic 설명을 늘리지 말고 빠진 bedside deliverable을 넣어라.",
        "high-risk 답변에서는 direct answer, immediate action, exception boundary, urgent red flags, protocol caveat를 지우지 마라.",
        "Repair guide:",
        "- missing_reversible_cause_sweep: 추정 설명보다 먼저 reversible cause sweep을 추가한다.",
        "- missing_false_worsening_exclusion: 실제 악화 결론 전에 measurement/sampling/artifact 배제를 넣는다.",
        "- missing_notification_payload: mode/setting, 환자 상태, 핵심 데이터, 이미 확인한 항목, 원하는 의사결정 포인트를 묶어 넣는다.",
        "- missing_notification_script: 실제로 읽어도 자연스러운 보고 문장을 최소 3문장 넣는다.",
        "- missing_exception_boundary 또는 missing_counterfactual: 언제 현재 추천을 더 밀면 위험한지, 언제 다른 카드가 제한적으로 열리는지를 추가한다.",
        "- missing_measurement_dependency: 판단이 무엇을 알아야 완성되는지 분명히 밝힌다.",
        "- missing_paired_problem_handling: 묶여 있는 두 문제를 분리해 각각 어떤 레버로 접근하는지 보여준다.",
        "- missing_red_flags: 즉시 보고/호출 신호를 명시한다.",
        "- overcompressed_high_risk_answer: 군더더기 대신 bedside artifact 밀도를 올린다.",
        "- unsafe_specificity_for_ambiguous_entity 또는 missing_protocol_caveat: unsafe specificity를 지우거나 검증/프로토콜 caveat를 넣는다.",
        "최종 답변 평문만 반환하라.",
      ].join("\n");
}

export function buildRepairUserPrompt(args: {
  query: string;
  answer: string;
  locale: "ko" | "en";
  decision: MedSafetyRouteDecision;
  repairInstructions: string;
  promptAssembly?: PromptAssemblyContext | null;
}) {
  const blueprint = args.promptAssembly?.blueprint;
  return [
    args.locale === "en" ? `User question: ${normalizeText(args.query)}` : `사용자 질문: ${normalizeText(args.query)}`,
    `intent=${args.decision.intent}`,
    `secondaryIntents=${args.decision.secondaryIntents.join("|") || "none"}`,
    `risk=${args.decision.risk}`,
    `entityClarity=${args.decision.entityClarity}`,
    `urgencyLevel=${args.decision.urgencyLevel}`,
    `workflowStage=${args.decision.workflowStage}`,
    `notificationNeed=${args.decision.notificationNeed}`,
    `reversibleCauseSweep=${String(args.decision.reversibleCauseSweep)}`,
    `counterfactualNeed=${String(args.decision.counterfactualNeed)}`,
    `exceptionNeed=${String(args.decision.exceptionNeed)}`,
    `pairedProblemNeed=${String(args.decision.pairedProblemNeed)}`,
    `scriptNeed=${String(args.decision.scriptNeed)}`,
    `checklistDepth=${args.decision.checklistDepth}`,
    `measurementDependency=${args.decision.measurementDependency}`,
    blueprint ? `requiredArtifacts=${blueprint.requiredArtifacts.join("|") || "none"}` : "",
    blueprint ? `sectionEmphasis=${blueprint.sectionEmphasis.join("|") || "none"}` : "",
    blueprint ? `domainCoverageTargets=${blueprint.domainCoverageTargets.join("|") || "none"}` : "",
    blueprint ? `mustNotAssert=${blueprint.mustNotAssert.join("|") || "none"}` : "",
    args.promptAssembly ? `selectedContracts=${args.promptAssembly.selectedContractIds.join("|")}` : "",
    `Issue codes: ${normalizeText(args.repairInstructions)}`,
    "",
    args.locale === "en" ? "Current answer:" : "현재 답변:",
    normalizeText(args.answer),
  ]
    .filter(Boolean)
    .join("\n");
}

export { buildHeuristicQualityDecision, buildQualityGateDeveloperPrompt, parseQualityGateDecision };
