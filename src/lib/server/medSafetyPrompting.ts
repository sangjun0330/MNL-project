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
  type MedSafetyPromptProfile,
  type MedSafetyRepairIssueFamily,
  type MedSafetyRisk,
  type MedSafetyRouteDecision,
  type MedSafetyRouterRefinement,
  type MedSafetyRuntimeMode,
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

function deriveIntent(signals: MedSafetyQuestionSignals) {
  const top = pickTopIntent(signals.intentScores);
  let intent: MedSafetyIntent = top.topScore > 0 ? top.top : "knowledge";

  if (signals.preNotification || signals.asksImmediateAction) intent = "action";
  else if (signals.mixedNumericAction) intent = "action";
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
  if (hasImage) score += 1;
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
  if (risk === "high" || signals.pairedProblem || signals.preNotification || hasImage) return "detailed" as const;
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
  if (signals.mixedIntent || hasImage || signals.preNotification || signals.pairedProblem || risk === "high") return "medium" as const;
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
  const signals = buildQuestionSignals(normalizedQuery);
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

function buildBaseSpineLines(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You write nurse-facing clinical answer cards that are safe, compressed, and directly usable at the bedside.",
      "Give the direct answer first, then include only the details that would change the next action, reporting decision, or safety boundary.",
      "If a detail is uncertain, do not invent settings, doses, compatibility, or device-specific numbers.",
      "Write the final answer in natural bedside clinical English.",
    ];
  }
  return [
    "너는 간호사가 bedside에서 바로 쓰는 임상 판단 카드를 작성한다.",
    "직접 답을 먼저 주고, 다음 행동이나 보고 판단을 바꾸는 정보만 남긴다.",
    "확실하지 않으면 세팅값, 용량, 호환성, 기구 고유 수치를 지어내지 않는다.",
    "최종 답변은 자연스러운 한국어 존댓말로 쓴다.",
  ];
}

function buildContractText(id: MedSafetyPromptContractId, locale: "ko" | "en") {
  const ko: Record<MedSafetyPromptContractId, string> = {
    base_role_goal: "실무 판단과 행동에 바로 쓰이는 답을 만든다.",
    base_decision_priority: "배경 설명보다 결론과 다음 행동을 앞에 둔다.",
    base_safety_certainty: "안전에 영향을 주는 세부값은 확인된 범위에서만 말한다.",
    base_render_discipline: "제목 없는 결론 뒤에 짧은 카드들을 두고, 각 카드는 리드 1문장과 2~4개 bullet만 쓴다.",
    intent_knowledge: "정의 나열보다 임상 의미와 간호 판단 포인트만 남긴다.",
    intent_action: "행동 질문이므로 지금 할 조치와 확인 순서를 배경 설명보다 먼저 둔다.",
    intent_compare: "선택 기준과 차이를 먼저 보여주고, 실무에서 먼저 보는 구분축만 남긴다.",
    intent_numeric: "수치는 해석과 다음 행동을 연결하고, 숫자 자체의 장황한 풀이를 줄인다.",
    risk_high_modifier: "고위험 질문이므로 stop-report 기준과 즉시 escalation 신호를 흐리지 않는다.",
    risk_mixed_modifier: "설명과 행동이 섞인 질문이므로 행동과 안전을 먼저, 배경은 선택을 바꾸는 범위만 둔다.",
    communication_modifier: "보고가 필요하면 mode·setting, 환자 상태, 핵심 수치, 이미 확인한 항목을 묶어서 정리한다.",
    exception_modifier: "주 추천이 언제 깨지는지와 대안을 열게 만드는 조건을 짧게 분리한다.",
    ambiguity_modifier: "대상이 완전히 특정되지 않으면 구체 조작값, 용량, 호환성, 세팅은 단정하지 않는다.",
    domain_vent_abga: "환기 문제와 산소화 문제는 섞지 말고 분리해 각 레버를 설명한다.",
    domain_med_device: "약물·라인·기구 질문은 기전보다 tracing, stop rule, patient response, alarm context를 우선한다.",
    domain_reporting: "보고가 핵심이면 왜 중요한지보다 어떤 데이터 묶음이 의사결정을 돕는지 먼저 보여준다.",
    output_safety_guard: "근거 없는 숫자와 기관·제조사 고유 기준을 임의로 만들지 않는다.",
    output_no_meta_guard: "route, pack, artifact 같은 내부 설계 용어는 절대 출력하지 않는다.",
  };

  const en: Record<MedSafetyPromptContractId, string> = {
    base_role_goal: "Produce nurse-facing clinical cards that can be used immediately at the bedside.",
    base_decision_priority: "Place the direct answer and next action before background explanation.",
    base_safety_certainty: "Use only confirmed specifics when a detail changes safety.",
    base_render_discipline: "Use a titleless conclusion first, then short cards with one lead sentence and 2-4 bullets each.",
    intent_knowledge: "Keep only the clinical meaning and nursing decision points, not textbook definition lists.",
    intent_action: "Because this is an action question, put what to do and what to check before background explanation.",
    intent_compare: "Show the selection criteria and practical distinction first.",
    intent_numeric: "Link numbers to meaning and next action instead of expanding into long numeric teaching.",
    risk_high_modifier: "For high-risk questions, keep stop-report boundaries and escalation signals explicit.",
    risk_mixed_modifier: "When explanation and action are mixed, keep action and safety ahead of background teaching.",
    communication_modifier: "If reporting is needed, group mode or setting, patient status, key numbers, and already checked items into one useful handoff.",
    exception_modifier: "State briefly when the main recommendation stops being safe and what opens the alternative path.",
    ambiguity_modifier: "If the target is not fully identified, do not lock in settings, doses, compatibility, or device-specific specifics.",
    domain_vent_abga: "Separate ventilation from oxygenation and keep each lever tied to its purpose.",
    domain_med_device: "For medication, line, and device questions, prioritize tracing, stop rules, patient response, and alarm context over mechanism teaching.",
    domain_reporting: "If reporting is central, show the minimum data bundle that helps the clinician decide next.",
    output_safety_guard: "Do not invent unsupported numbers or site-specific protocols.",
    output_no_meta_guard: "Do not expose route, pack, artifact, or any internal planning language.",
  };
  return locale === "en" ? en[id] : ko[id];
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
    const lines = [...buildBaseSpineLines(args.locale)];
    for (const contractId of contractIds) {
      if (BASE_CONTRACT_IDS.includes(contractId)) continue;
      lines.push(buildContractText(contractId, args.locale));
    }

    const projection = args.blueprint.projection;
    for (const key of directiveKeys) {
      const value = projection[key];
      if (typeof value === "string" && value.trim()) lines.push(value.trim());
    }
    return lines;
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

export function resolveMedSafetyRuntimeMode(): MedSafetyRuntimeMode {
  const raw = String(process.env.OPENAI_MED_SAFETY_RUNTIME_MODE ?? "hybrid_live").trim();
  return sanitizeOneOf(raw, MED_SAFETY_RUNTIME_MODES) ?? "hybrid_live";
}

export function buildDeterministicRouteDecision(input: RouteInput): MedSafetyRouteDecision {
  return synthesizeInternalDecision(input).decision;
}

export function shouldUseTinyRouter(input: RouteInput, deterministic: MedSafetyRouteDecision) {
  const signals = buildQuestionSignals(normalizeQuery(input.query));
  return Boolean(
    input.imageDataUrl ||
      signals.mixedIntent ||
      (deterministic.risk === "high" && deterministic.entityClarity !== "high") ||
      (signals.mixedNumericAction && (signals.mentionsSetting || signals.mentionsPatientState || signals.mentionsAlarm || signals.mentionsLineOrTube)) ||
      signals.pairedProblem ||
      signals.preNotification ||
      deterministic.confidence !== "high"
  );
}

export function buildTinyRouterDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You refine only uncertain routing fields for a nurse-facing clinical answer system.",
      "Return JSON only.",
      'Allowed keys: intentOverride, riskOverride, entityClarityOverride, urgencyOverride, detailProfileOverride, communicationProfileOverride, exceptionProfileOverride, pairedProblemOverride, reason.',
      "Use overrides only when the safer or more useful route clearly differs from the initial route.",
      "Do not rewrite the answer. Do not add extra keys.",
    ].join("\n");
  }
  return [
    "너는 간호사 임상 답변 시스템의 불확실한 라우팅 축만 보정한다.",
    "반드시 JSON만 반환한다.",
    "허용 키: intentOverride, riskOverride, entityClarityOverride, urgencyOverride, detailProfileOverride, communicationProfileOverride, exceptionProfileOverride, pairedProblemOverride, reason",
    "초기 라우트보다 더 안전하거나 더 적합한 방향이 분명할 때만 override를 넣는다.",
    "답변을 쓰지 말고 추가 키도 넣지 않는다.",
  ].join("\n");
}

export function buildTinyRouterUserPrompt(args: RouteInput & { deterministic?: MedSafetyRouteDecision | null }) {
  const routeLine = args.deterministic ? buildCompactRouteSummary(args.deterministic) : "intent=unknown";
  return [
    `Question: ${normalizeText(args.query)}`,
    `Initial route: ${routeLine}`,
    `Image: ${args.imageDataUrl ? "yes" : "no"}`,
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
    buildQuestionSignals(normalizeQuery(""))
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

  const highRiskDetailed = args.decision.risk === "high" || args.hasImage || args.decision.answerDepth === "detailed";

  return {
    reasoningEfforts: ["high", "medium"],
    verbosity: "medium",
    outputTokenCandidates: shortSimple ? [1600, 1100, 800] : highRiskDetailed ? [3600, 2800, 2200] : [2400, 1800, 1300],
    qualityLevel: "balanced",
  };
}

export function assembleMedSafetyDeveloperPrompt(
  decision: MedSafetyRouteDecision,
  locale: "ko" | "en",
  options: PromptAssemblyOptions
): MedSafetyPromptAssembly {
  const signals = buildQuestionSignals(normalizeQuery(options.query));
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
  const basePrompt = buildBaseSpineLines(locale).join("\n");
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
  if (args.hasImage || args.isPremiumSearch) return true;
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
  return buildBaseSpineLines(locale).join("\n");
}

export function shouldGenerateKoEnglishVariant() {
  const raw = String(process.env.OPENAI_MED_SAFETY_GENERATE_EN_VARIANT ?? "false")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export { buildHeuristicQualityDecision, buildQualityGateDeveloperPrompt, parseQualityGateDecision };
