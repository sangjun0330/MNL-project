export type MedSafetyRuntimeMode = "legacy" | "hybrid_shadow" | "hybrid_live";
export type MedSafetyIntent = "knowledge" | "action" | "compare" | "numeric" | "device";
export type MedSafetyRisk = "low" | "medium" | "high";
export type MedSafetyEntityClarity = "high" | "medium" | "low";
export type MedSafetyAnswerDepth = "short" | "standard" | "detailed";
export type MedSafetyFormat = "short" | "sectioned";
export type MedSafetyRouteSource = "rules" | "model";
export type MedSafetyQualityVerdict = "pass" | "repair_required" | "pass_but_verbose";
export type MedSafetyReasoningEffort = "low" | "medium" | "high";
export type MedSafetyVerbosity = "low" | "medium" | "high";
export type MedSafetyQualityLevel = "balanced";

export type MedSafetyRouteDecision = {
  intent: MedSafetyIntent;
  risk: MedSafetyRisk;
  entityClarity: MedSafetyEntityClarity;
  answerDepth: MedSafetyAnswerDepth;
  needsEscalation: boolean;
  needsSbar: boolean;
  format: MedSafetyFormat;
  source: MedSafetyRouteSource;
  confidence: "high" | "medium";
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
};

export type MedSafetyPromptBudgetClass = "legacy" | "shadow" | "standard" | "high_risk_or_image";

export type MedSafetyOpeningMode = "direct" | "action_first" | "compare_first" | "numeric_first";

export type MedSafetyPromptContractId =
  | "role_goal_spine"
  | "decision_priority_spine"
  | "safety_certainty_spine"
  | "intent_blueprint"
  | "rendering_length_contract"
  | "risk_escalation_delta"
  | "entity_delta"
  | "depth_delta"
  | "format_delta"
  | "appendix_sbar"
  | "appendix_memory_point"
  | "appendix_mini_case"
  | "language_delta";

export type MedSafetyPromptBlueprint = {
  openingMode: MedSafetyOpeningMode;
  mustIncludeSections: string[];
  mustNotAssert: string[];
  sectionOrder: string[];
  smallCategoryHints: string[];
  lengthTarget: MedSafetyAnswerDepth;
  needsMemoryPoint: boolean;
  needsMiniCase: boolean;
  subjectFocus: MedSafetySubjectFocus;
  mixedIntent: boolean;
  followupPolicy: "forbid" | "limited";
};

export type MedSafetyPromptContractSet = {
  contractIds: MedSafetyPromptContractId[];
  appendixIds: MedSafetyPromptContractId[];
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

type PromptAssemblyContext = Pick<
  MedSafetyPromptAssembly,
  "blueprint" | "contractSet" | "selectedContractIds" | "droppedContractIds" | "finalPromptChars"
>;

type RouteInput = {
  query: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
};

type IntentScoreMap = Record<MedSafetyIntent, number>;
type MedSafetySubjectFocus = "medication" | "device" | "lab" | "procedure" | "patient_state" | "general";
type MedSafetyQuestionSignals = {
  intentScores: IntentScoreMap;
  intentFamiliesMatched: number;
  mixedIntent: boolean;
  asksSelection: boolean;
  asksDefinition: boolean;
  asksInterpretation: boolean;
  asksThreshold: boolean;
  asksImmediateAction: boolean;
  mentionsCompatibility: boolean;
  mentionsSetting: boolean;
  mentionsAlarm: boolean;
  mentionsLineOrTube: boolean;
  mentionsProcedure: boolean;
  mentionsMedication: boolean;
  mentionsPatientState: boolean;
  mentionsLabOrNumeric: boolean;
  subjectFocus: MedSafetySubjectFocus;
};

const COMPARE_PATTERNS = [/차이/i, /구분/i, /\bvs\b/i, /뭐가\s*달라/i, /헷갈/i, /어떤\s*걸\s*써/i];
const NUMERIC_PATTERNS = [/정상\s*범위/i, /정상범위/i, /수치/i, /해석/i, /계산/i, /몇이\s*정상/i];
const DEVICE_PATTERNS = [/펌프/i, /라인/i, /카테터/i, /산소/i, /알람/i, /세팅/i, /드레싱/i, /모니터/i, /기구/i, /튜브/i, /필터/i];
const ACTION_PATTERNS = [/어떻게/i, /대응/i, /조치/i, /절차/i, /중단/i, /보고/i, /확인해야/i, /해야\s*해/i];
const SELECTION_PATTERNS = [/어떤\s*걸\s*써/i, /선택/i, /추천/i, /뭐가\s*나아/i, /우선/i];
const DEFINITION_PATTERNS = [/무엇/i, /뭐예/i, /설명/i, /알려/i, /정의/i];
const INTERPRET_PATTERNS = [/해석/i, /의미/i, /시사/i, /왜/i];
const THRESHOLD_PATTERNS = [/언제/i, /기준/i, /threshold/i, /보고\s*기준/i, /호출\s*기준/i];
const IMMEDIATE_ACTION_PATTERNS = [/지금\s*할\s*일/i, /바로\s*할/i, /즉시/i, /우선/i, /먼저/i];
const HIGH_RISK_PATTERNS = [
  /용량/i,
  /속도/i,
  /주입\s*속도/i,
  /희석/i,
  /경로/i,
  /투여\s*경로/i,
  /호환성/i,
  /high-?alert/i,
  /lasa/i,
  /extravasation/i,
  /침윤/i,
  /anaphylaxis/i,
  /아나필락시스/i,
  /line\s*mix-?up/i,
  /line\s*disconnection/i,
  /\bbolus\b/i,
  /\bair\b/i,
  /공기\s*유입/i,
  /출혈/i,
  /의식\s*저하/i,
  /저산소/i,
  /쇼크/i,
  /급격한\s*활력징후\s*악화/i,
];
const ESCALATION_PATTERNS = [/즉시/i, /바로/i, /호출/i, /보고/i, /중단/i, /clamp/i, /산소/i, /분리/i];
const COMPATIBILITY_PATTERNS = [/호환성/i, /compatible/i, /incompat/i, /같이\s*들어/i, /섞/i, /y-?site/i];
const SETTING_PATTERNS = [/세팅/i, /설정/i, /rate/i, /flow/i, /fr\b/i, /l\/min/i, /mmhg/i, /psi/i, /gauge/i];
const ALARM_PATTERNS = [/알람/i, /\balarm\b/i, /occlusion/i, /air-in-line/i, /pressure/i];
const LINE_TUBE_PATTERNS = [/라인/i, /튜브/i, /카테터/i, /배액관/i, /drain/i, /lumen/i, /c-?line/i, /picc/i, /central line/i];
const PROCEDURE_PATTERNS = [/절차/i, /순서/i, /flush/i, /clamp/i, /교체/i, /드레싱/i, /삽입/i, /제거/i];
const MEDICATION_PATTERNS = [/약물?/i, /주입/i, /투여/i, /희석/i, /amp/i, /vial/i, /수액/i, /항생제/i, /진정제/i, /진통제/i, /tpn/i];
const PATIENT_STATE_PATTERNS = [/통증/i, /열/i, /발열/i, /오한/i, /혈압/i, /맥박/i, /심박/i, /호흡/i, /의식/i, /황달/i, /소변/i, /변/i, /복통/i, /spo2/i, /산소포화/i];
const LAB_PATTERNS = [/bilirubin/i, /\balp\b/i, /\bggt\b/i, /\bast\b/i, /\balt\b/i, /\bcrp\b/i, /\bwbc\b/i, /\bhb\b/i, /\bhgb\b/i, /\bplt\b/i, /\bna\b/i, /\bk\b/i, /\bca\b/i, /\babga\b/i, /\bph\b/i, /\bpco2\b/i, /\bpo2\b/i, /검사/i, /정상범위/i, /수치/i, /lab/i];
const GENERIC_ENTITY_PATTERNS = [
  /이\s*약/i,
  /이\s*기구/i,
  /이\s*장비/i,
  /이거/i,
  /이게/i,
  /이\s*수치/i,
  /이\s*검사/i,
  /이\s*라인/i,
];
const GENERIC_HEAD_NOUN_PATTERNS = [/약물?/i, /기구/i, /장비/i, /튜브/i, /라인/i, /펌프/i, /수액/i, /검사/i, /수치/i];
const AMBIGUOUS_SHORT_ENTITY_PATTERNS = [/^[a-z0-9가-힣/+.-]{2,8}$/i];
const FILLER_PATTERNS = [
  /꾸준한\s*관리/i,
  /신경\s*쓰/i,
  /활용해\s*보/i,
  /상황에\s*맞게/i,
  /필요시/i,
  /일반적으로/i,
];
const UNSUPPORTED_SPECIFICITY_PATTERNS = [
  /제조사별\s*세팅/i,
  /모델별\s*세팅/i,
  /기관마다\s*다르지만\s*\d/i,
  /\b\d+\s*(?:mmhg|psi|l\/min|fr|gauge)\b/i,
];
const DUPLICATE_LINE_EXEMPT_PATTERNS = [/^핵심[:：]?$/i, /^지금\s*할\s*일[:：]?$/i, /^주의[:：]?$/i, /^보고\s*기준[:：]?$/i];
const LONG_ANSWER_CHAR_THRESHOLD = 1100;

const ROLE_AND_GOAL_SPINE = [
  "[ROLE_AND_GOAL_SPINE]",
  "- 너는 간호사 전용 임상검색 AI다.",
  "- 답변은 현장 간호사가 바로 이해하고 바로 행동할 수 있어야 한다.",
  "- 교과서식 반복, 약한 일반론, 불필요한 서론은 제거한다.",
  "- 답변은 실무형이면서도 핵심 차이와 판단 포인트가 기억되도록 정리한다.",
  "- 불확실한 내용을 아는 척 지어내지 않는다.",
].join("\n");

const DECISION_PRIORITY_SPINE = [
  "[DECISION_PRIORITY_SPINE]",
  "- 답변 전에 내부적으로 즉시 위험 여부를 가장 먼저 본다.",
  "- 그 다음 intent를 판단하고, 핵심 대상이 약물/기구/처치/수치/상태 중 무엇인지 본다.",
  "- 질문이 혼합형이면 행동과 안전을 먼저, 배경 설명은 그 다음에 둔다.",
  "- 답변은 빨리 훑어봐도 핵심이 보이도록 구조화한다.",
].join("\n");

const SAFETY_AND_CERTAINTY_SPINE = [
  "[SAFETY_AND_CERTAINTY_SPINE]",
  "- 식별 확신도는 HIGH, MEDIUM, LOW로 내부 판단한다.",
  "- MEDIUM이면 전제를 짧게 밝히고 일반적이고 안전한 범위에서만 답한다.",
  "- LOW이면 후보를 짧게 제시하고 확인 요청과 일반 안전 원칙만 제공한다.",
  "- 식별이 애매하면 용량, 속도, 희석, 경로, 금기, 호환성, 세팅값, 조작 순서, 고위험 대응 지시를 단정하지 않는다.",
  "- 일반 원칙과 기관별/제조사별 세부를 섞지 않는다. 최종 기준은 기관 프로토콜, 약제부, 의사 지시, 제조사 IFU다.",
  "- 위험 상황에서는 설명보다 보수적 행동과 escalation을 우선한다.",
].join("\n");

const RENDERING_AND_LENGTH_CONTRACT = [
  "[RENDERING_AND_LENGTH_CONTRACT]",
  "- 첫 문장 또는 첫 2문장 안에 결론을 먼저 쓴다.",
  "- sectioned 답변은 짧은 소제목, 리드 문장, 세부 bullet 순서를 지킨다.",
  "- 각 섹션 사이는 빈 줄 2개로 분리한다.",
  "- 작은 묶음이 필요하면 짧은 소카테고리 한 줄 뒤에 세부 bullet을 둔다.",
  "- 모든 bullet은 새로운 정보를 담는 완결 문장으로 쓴다.",
  "- 모바일에서 읽기 쉽게 짧고 밀도 있게 쓴다.",
  "- 질문 중요도 대비 과하게 길어지지 않게 통제한다.",
].join("\n");

const RISK_ESCALATION_DELTA = [
  "[RISK_ESCALATION_DELTA]",
  "- 첫 문장 또는 첫 섹션에서 가장 큰 위험과 즉시 행동을 먼저 제시한다.",
  "- 중단, 분리, clamp, 산소, 보고, 호출 등 우선순위를 분명히 쓴다.",
  "- 관찰만으로 끝내지 말고 언제 즉시 보고/호출해야 하는지 명확히 쓴다.",
].join("\n");

const ENTITY_DELTA = [
  "[ENTITY_DELTA]",
  "- MEDIUM이면 시작부 근처에 어떤 전제로 설명하는지 분명히 밝힌다.",
  "- LOW이면 확인 요청과 후보 1~3개, 공통 안전 원칙만 제공한다.",
].join("\n");

const DEPTH_SHORT = [
  "[DEPTH_DELTA]",
  "- 짧은 핵심 문장과 3~5개 이내의 짧은 bullet 안에서 끝내는 것을 우선한다.",
].join("\n");

const DEPTH_STANDARD = [
  "[DEPTH_DELTA]",
  "- 핵심과 실무상 중요한 포인트만 남기고 2~4개 섹션 수준으로 정리한다.",
].join("\n");

const DEPTH_DETAILED = [
  "[DEPTH_DELTA]",
  "- 필요한 범위만 자세히 쓰고, 설명/대응/보고 기준을 분리한다.",
  "- 불필요한 사례, 기억 포인트, 후속 제안은 넣지 않는다.",
].join("\n");

const FORMAT_SHORT = [
  "[FORMAT_DELTA]",
  "- short 답변은 소제목 최소화, 바로 결론, 짧은 bullet 중심으로 쓴다.",
].join("\n");

const FORMAT_SECTIONED = [
  "[FORMAT_DELTA]",
  "- 필요하면 핵심:, 지금 할 일:, 구분 포인트:, 자세한 설명:, 주의:, 보고 기준:, 기억 포인트: 같은 짧은 소제목을 사용한다.",
  "- 리드 문장과 작은 소카테고리 구조를 반드시 살린다.",
].join("\n");

const APPENDIX_SBAR = [
  "[OPTIONAL_APPENDIX_DELTA]",
  "- 필요할 때만 답변 끝에 바로 보고 가능한 짧은 SBAR 예시를 붙인다.",
].join("\n");

const APPENDIX_MEMORY_POINT = [
  "[OPTIONAL_APPENDIX_DELTA]",
  "- 헷갈리기 쉬운 질문일 때만 1~3줄짜리 짧은 기억 포인트를 붙인다.",
].join("\n");

const APPENDIX_MINI_CASE = [
  "[OPTIONAL_APPENDIX_DELTA]",
  "- 실제 판단을 돕는 경우에만 3~4줄 내의 짧은 사례 예시를 붙인다.",
].join("\n");

const LANGUAGE_DELTA = [
  "[LANGUAGE_DELTA]",
  "- 위 정책을 유지하되 최종 답변만 자연스러운 bedside clinical English로 쓴다.",
].join("\n");

const QUALITY_GATE_DEVELOPER_PROMPT = [
  "You are a strict QA reviewer for nurse-facing clinical answers and must judge whether the answer is at least legacy-grade or better.",
  "Do not rewrite the answer.",
  "Return JSON only.",
  "Allowed JSON shape:",
  '{"verdict":"pass|repair_required|pass_but_verbose","repairInstructions":"comma-separated issue codes"}',
  "Use only these issue codes when repair is needed:",
  "- missing_conclusion_first",
  "- mixed_question_order",
  "- missing_immediate_action",
  "- missing_escalation_threshold",
  "- missing_assumption_disclosure",
  "- unsafe_specificity_for_ambiguous_entity",
  "- missing_local_authority_caveat",
  "- weak_section_structure",
  "- missing_small_category_structure",
  "- duplicate_lines",
  "- filler_detected",
  "- unsupported_specificity",
  "- missing_fast_distinction",
  "- missing_numeric_core",
  "- missing_action_core",
  "- overlong_answer",
  "- forbidden_followup",
  "Return repair_required if any of the following is true:",
  "- the first sentence does not state the practical conclusion or is too indirect",
  "- mixed questions do not put action/safety before background explanation",
  "- uncertain or weakly supported facts are stated with unjustified certainty",
  "- general principles and institution-specific or manufacturer-specific details are blurred together",
  "- high-risk answer does not put immediate action near the top",
  "- escalation is needed but stop/report/call criteria are missing",
  "- a medium-clarity entity answer does not briefly disclose the working assumption near the start",
  "- ambiguous entity answer asserts dose/rate/dilution/route/compatibility/device setting as if verified",
  "- high-risk low-confidence answer becomes more detailed instead of more conservative",
  "- sectioned answer lacks clear section structure or lead sentence",
  "- duplicated filler or generic weak sentences reduce decision usefulness",
  "- unsupported manufacturer-specific specificity appears",
  "- compare answer misses the fastest practical distinction",
  "- numeric answer misses one of baseline range, meaning, or reporting threshold",
  "- device/action answer is weak on what to check now or what to do now",
  "Return pass_but_verbose if the answer is safe and useful but too long, repetitive, or ends with unnecessary follow-up suggestions.",
  "If repair is needed, return 1 to 5 issue codes only.",
  "If the answer is already strong and trustworthy, return pass.",
].join("\n");

type PromptContractSpec = {
  id: MedSafetyPromptContractId;
  text: string;
  optional: boolean;
  dropPriority: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function normalizeQuery(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKC");
}

function countPatternHits(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function includesGenericEntity(text: string) {
  return GENERIC_ENTITY_PATTERNS.some((pattern) => pattern.test(text));
}

function includesGenericHeadNoun(text: string) {
  return GENERIC_HEAD_NOUN_PATTERNS.some((pattern) => pattern.test(text));
}

function pickTopIntent(scores: IntentScoreMap) {
  const ordered = (Object.keys(scores) as MedSafetyIntent[]).sort((a, b) => scores[b] - scores[a]);
  const top = ordered[0] ?? "knowledge";
  const second = ordered[1] ?? "knowledge";
  return {
    top,
    second,
    topScore: scores[top],
    secondScore: scores[second],
    isAmbiguous: scores[top] > 0 && scores[top] === scores[second],
  };
}

function inferIntentScores(query: string): IntentScoreMap {
  return {
    compare: countPatternHits(query, COMPARE_PATTERNS),
    numeric: countPatternHits(query, NUMERIC_PATTERNS),
    device: countPatternHits(query, DEVICE_PATTERNS),
    action: countPatternHits(query, ACTION_PATTERNS),
    knowledge: 0,
  };
}

function buildQuestionSignals(query: string): MedSafetyQuestionSignals {
  const intentScores = inferIntentScores(query);
  const intentFamiliesMatched = (Object.values(intentScores) as number[]).filter((score) => score > 0).length;
  const mentionsCompatibility = countPatternHits(query, COMPATIBILITY_PATTERNS) > 0;
  const mentionsSetting = countPatternHits(query, SETTING_PATTERNS) > 0;
  const mentionsAlarm = countPatternHits(query, ALARM_PATTERNS) > 0;
  const mentionsLineOrTube = countPatternHits(query, LINE_TUBE_PATTERNS) > 0;
  const mentionsProcedure = countPatternHits(query, PROCEDURE_PATTERNS) > 0;
  const mentionsMedication = countPatternHits(query, MEDICATION_PATTERNS) > 0;
  const mentionsPatientState = countPatternHits(query, PATIENT_STATE_PATTERNS) > 0;
  const mentionsLabOrNumeric = countPatternHits(query, LAB_PATTERNS) > 0 || intentScores.numeric > 0;
  const subjectFocus: MedSafetySubjectFocus =
    mentionsLabOrNumeric
      ? "lab"
      : mentionsAlarm || mentionsLineOrTube || intentScores.device > 0
        ? "device"
        : mentionsMedication || mentionsCompatibility
          ? "medication"
          : mentionsProcedure
            ? "procedure"
            : mentionsPatientState
              ? "patient_state"
              : "general";
  return {
    intentScores,
    intentFamiliesMatched,
    mixedIntent: intentFamiliesMatched >= 2,
    asksSelection: countPatternHits(query, SELECTION_PATTERNS) > 0 || intentScores.compare > 0,
    asksDefinition: countPatternHits(query, DEFINITION_PATTERNS) > 0,
    asksInterpretation: countPatternHits(query, INTERPRET_PATTERNS) > 0 || intentScores.numeric > 0,
    asksThreshold: countPatternHits(query, THRESHOLD_PATTERNS) > 0,
    asksImmediateAction: countPatternHits(query, IMMEDIATE_ACTION_PATTERNS) > 0 || intentScores.action > 0,
    mentionsCompatibility,
    mentionsSetting,
    mentionsAlarm,
    mentionsLineOrTube,
    mentionsProcedure,
    mentionsMedication,
    mentionsPatientState,
    mentionsLabOrNumeric,
    subjectFocus,
  };
}

function inferRisk(query: string, signals: MedSafetyQuestionSignals): MedSafetyRisk {
  if (countPatternHits(query, HIGH_RISK_PATTERNS) > 0) return "high";
  if (
    signals.mentionsCompatibility ||
    signals.mentionsSetting ||
    (signals.mentionsAlarm && signals.mentionsPatientState) ||
    (signals.mentionsLineOrTube && signals.mentionsMedication)
  ) {
    return "high";
  }
  if (countPatternHits(query, ACTION_PATTERNS) > 0 || signals.asksThreshold || signals.mentionsProcedure || signals.mixedIntent) {
    return "medium";
  }
  return "low";
}

function inferEntityClarity(query: string, hasImage: boolean, risk: MedSafetyRisk, signals: MedSafetyQuestionSignals): MedSafetyEntityClarity {
  const shortText = query.replace(/\s+/g, "");
  if (!query) return "low";
  if (signals.subjectFocus === "lab" || signals.subjectFocus === "patient_state") {
    return hasImage ? "medium" : "high";
  }
  if (includesGenericEntity(query) && !hasImage) return "low";
  if (includesGenericEntity(query) && hasImage) return "medium";
  if (AMBIGUOUS_SHORT_ENTITY_PATTERNS.some((pattern) => pattern.test(shortText)) && risk !== "low") return shortText.length <= 4 ? "low" : "medium";
  if (shortText.length <= 3) return "low";
  if (risk === "high" && shortText.length <= 6 && includesGenericHeadNoun(query)) return "medium";
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
    compact.length > 140 ||
    input.intent === "compare" ||
    input.signals.asksThreshold ||
    input.signals.mixedIntent ||
    input.signals.mentionsCompatibility ||
    input.signals.mentionsSetting
  ) {
    return "detailed";
  }
  if (
    (input.intent === "knowledge" || input.intent === "numeric") &&
    input.risk === "low" &&
    compact.length <= 28 &&
    !input.signals.mentionsPatientState
  ) {
    return "short";
  }
  return "standard";
}

function inferNeedsEscalation(input: { query: string; risk: MedSafetyRisk; intent: MedSafetyIntent; signals: MedSafetyQuestionSignals }) {
  if (input.risk === "high") return true;
  if ((input.intent === "action" || input.intent === "device") && countPatternHits(input.query, ESCALATION_PATTERNS) > 0) return true;
  if (input.signals.asksThreshold && (input.intent === "numeric" || input.signals.mentionsPatientState)) return true;
  return false;
}

function inferFormat(input: { answerDepth: MedSafetyAnswerDepth; risk: MedSafetyRisk; intent: MedSafetyIntent }) {
  if (input.answerDepth === "short" && input.risk === "low" && (input.intent === "knowledge" || input.intent === "numeric")) {
    return "short" as const;
  }
  return "sectioned" as const;
}

export function resolveMedSafetyRuntimeMode(): MedSafetyRuntimeMode {
  const raw = String(process.env.OPENAI_MED_SAFETY_RUNTIME_MODE ?? "hybrid_live")
    .trim()
    .toLowerCase();
  if (raw === "hybrid_shadow") return "hybrid_shadow";
  if (raw === "hybrid_live") return "hybrid_live";
  return "legacy";
}

export function shouldGenerateKoEnglishVariant() {
  const override = String(process.env.OPENAI_MED_SAFETY_EAGER_EN_TRANSLATE ?? "").trim().toLowerCase();
  if (override) {
    if (override === "0" || override === "false" || override === "off" || override === "no") return false;
    if (override === "1" || override === "true" || override === "on" || override === "yes") return true;
  }
  return false;
}

export function buildDeterministicRouteDecision(input: RouteInput): MedSafetyRouteDecision {
  const normalizedQuery = normalizeQuery(input.query);
  const signals = buildQuestionSignals(normalizedQuery);
  const scores = signals.intentScores;
  const topIntent = pickTopIntent(scores);
  const intent = topIntent.topScore > 0 ? topIntent.top : "knowledge";
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
  const needsSbar = needsEscalation && (intent === "action" || intent === "device");
  const format = inferFormat({ answerDepth, risk, intent });
  const confidence = topIntent.isAmbiguous || entityClarity !== "high" ? "medium" : "high";
  const reasonParts = [
    topIntent.topScore > 0 ? `intent=${intent}` : "intent=knowledge(default)",
    `risk=${risk}`,
    `entity=${entityClarity}`,
    `subject=${signals.subjectFocus}`,
    signals.mixedIntent ? "mixed_intent" : "single_intent",
    signals.mentionsCompatibility ? "compatibility_context" : "",
    signals.mentionsSetting ? "setting_context" : "",
    topIntent.isAmbiguous ? "ambiguous_intent" : "clear_intent",
  ].filter(Boolean);
  return normalizeRouteDecision({
    intent,
    risk,
    entityClarity,
    answerDepth,
    needsEscalation,
    needsSbar,
    format,
    source: "rules",
    confidence,
    reason: reasonParts.join(", "),
  });
}

export function shouldUseTinyRouter(input: RouteInput, decision: MedSafetyRouteDecision) {
  const normalizedQuery = normalizeQuery(input.query);
  const signals = buildQuestionSignals(normalizedQuery);
  const scores = signals.intentScores;
  const topIntent = pickTopIntent(scores);
  const intentFamiliesMatched = signals.intentFamiliesMatched;
  const hasCrossIntentConflict =
    (scores.compare > 0 && scores.action > 0) || (scores.numeric > 0 && scores.action > 0) || (scores.device > 0 && scores.action > 0);
  const shortAmbiguousEntity =
    decision.entityClarity !== "high" &&
    decision.risk !== "low" &&
    normalizedQuery.replace(/\s+/g, "").length <= 12 &&
    includesGenericHeadNoun(normalizedQuery);
  return (
    Boolean(input.imageDataUrl) ||
    topIntent.isAmbiguous ||
    (decision.entityClarity !== "high" && decision.risk !== "low") ||
    (normalizedQuery.length >= 280 && intentFamiliesMatched >= 2) ||
    hasCrossIntentConflict ||
    shortAmbiguousEntity ||
    (signals.mentionsCompatibility && signals.mentionsLineOrTube) ||
    (signals.mentionsAlarm && signals.mentionsPatientState)
  );
}

function normalizeRouteDecision(decision: MedSafetyRouteDecision) {
  const normalized = { ...decision };
  if (normalized.risk === "high") normalized.needsEscalation = true;
  if (normalized.entityClarity === "low" && normalized.answerDepth === "short") normalized.answerDepth = "standard";
  if (normalized.intent === "compare" && normalized.answerDepth === "short") normalized.answerDepth = "standard";
  normalized.needsSbar = normalized.needsEscalation && (normalized.intent === "action" || normalized.intent === "device");
  normalized.format = inferFormat({
    answerDepth: normalized.answerDepth,
    risk: normalized.risk,
    intent: normalized.intent,
  });
  return normalized;
}

export function buildTinyRouterDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You are a meta router for nurse-facing clinical search.",
      "Do not answer the clinical question.",
      "Return JSON only.",
      "Allowed JSON shape:",
      '{"intent":"knowledge|action|compare|numeric|device","risk":"low|medium|high","entityClarity":"high|medium|low","answerDepth":"short|standard|detailed","needsEscalation":true,"needsSbar":false,"format":"short|sectioned","reason":"one sentence"}',
      "Classify conservatively.",
      "If entity identification is uncertain and the question is clinically risky, lower entityClarity and increase risk rather than guessing.",
      "Do not generate dose, rate, dilution, route, compatibility, or device setting advice.",
    ].join("\n");
  }
  return [
    "너는 간호사용 임상검색 메타 라우터다.",
    "임상 답변을 생성하지 않는다.",
    "JSON만 반환한다.",
    "허용된 JSON shape:",
    '{"intent":"knowledge|action|compare|numeric|device","risk":"low|medium|high","entityClarity":"high|medium|low","answerDepth":"short|standard|detailed","needsEscalation":true,"needsSbar":false,"format":"short|sectioned","reason":"한 문장"}',
    "애매하면 보수적으로 분류한다.",
    "대상 식별이 불확실하고 임상적으로 위험하면 추정하지 말고 entityClarity를 낮추고 risk를 높인다.",
    "절대 용량, 속도, 희석, 경로, 호환성, 세팅값 같은 임상 지시를 생성하지 않는다.",
  ].join("\n");
}

export function buildTinyRouterUserPrompt(input: RouteInput) {
  const imageLine = input.imageDataUrl ? (input.locale === "en" ? "Image included: yes" : "이미지 포함: 예") : input.locale === "en" ? "Image included: no" : "이미지 포함: 아니오";
  return input.locale === "en"
    ? [`User question: ${normalizeText(input.query)}`, imageLine, "Return classification JSON only."].join("\n")
    : [`사용자 질문: ${normalizeText(input.query)}`, imageLine, "분류 JSON만 반환하라."].join("\n");
}

function sanitizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const text = String(value ?? "").trim();
  return (allowed.find((item) => item === text) ?? fallback) as T;
}

export function parseTinyRouterDecision(raw: string, fallback: MedSafetyRouteDecision): MedSafetyRouteDecision {
  try {
    const parsed = JSON.parse(String(raw ?? "").trim()) as Partial<MedSafetyRouteDecision> & { reason?: unknown };
    return normalizeRouteDecision({
      intent: sanitizeEnum(parsed.intent, ["knowledge", "action", "compare", "numeric", "device"] as const, fallback.intent),
      risk: sanitizeEnum(parsed.risk, ["low", "medium", "high"] as const, fallback.risk),
      entityClarity: sanitizeEnum(parsed.entityClarity, ["high", "medium", "low"] as const, fallback.entityClarity),
      answerDepth: sanitizeEnum(parsed.answerDepth, ["short", "standard", "detailed"] as const, fallback.answerDepth),
      needsEscalation: typeof parsed.needsEscalation === "boolean" ? parsed.needsEscalation : fallback.needsEscalation,
      needsSbar: typeof parsed.needsSbar === "boolean" ? parsed.needsSbar : fallback.needsSbar,
      format: sanitizeEnum(parsed.format, ["short", "sectioned"] as const, fallback.format),
      source: "model",
      confidence: "medium",
      reason: normalizeText(parsed.reason) || "model_router",
    });
  } catch {
    return fallback;
  }
}

function resolveDepthModule(answerDepth: MedSafetyAnswerDepth) {
  if (answerDepth === "short") return DEPTH_SHORT;
  if (answerDepth === "detailed") return DEPTH_DETAILED;
  return DEPTH_STANDARD;
}

function resolveFormatModule(format: MedSafetyFormat) {
  return format === "short" ? FORMAT_SHORT : FORMAT_SECTIONED;
}

function inferOpeningMode(decision: MedSafetyRouteDecision) {
  if (decision.risk === "high" || decision.needsEscalation || decision.intent === "action" || decision.intent === "device") {
    return "action_first" as const;
  }
  if (decision.intent === "compare") return "compare_first" as const;
  if (decision.intent === "numeric") return "numeric_first" as const;
  return "direct" as const;
}

function buildSectionOrder(decision: MedSafetyRouteDecision) {
  if (decision.intent === "compare") {
    return decision.risk === "high" ? ["핵심", "구분 포인트", "지금 할 일", "자세한 설명", "보고 기준"] : ["핵심", "구분 포인트", "자세한 설명"];
  }
  if (decision.intent === "numeric") {
    return decision.needsEscalation ? ["핵심", "지금 확인할 것", "지금 할 일", "보고 기준"] : ["핵심", "지금 확인할 것", "보고 기준"];
  }
  if (decision.intent === "action" || decision.intent === "device") {
    return decision.answerDepth === "detailed"
      ? ["핵심", "지금 할 일", "지금 확인할 것", "원인 후보", "보고 기준"]
      : ["핵심", "지금 할 일", "지금 확인할 것", "보고 기준"];
  }
  return decision.format === "short" ? ["핵심"] : ["핵심", "자세한 설명", "주의"];
}

function buildMustIncludeSections(decision: MedSafetyRouteDecision) {
  const sections = new Set<string>(buildSectionOrder(decision));
  if (decision.risk === "high" || decision.needsEscalation) sections.add("보고 기준");
  if (decision.intent === "compare") sections.add("구분 포인트");
  if (decision.intent === "numeric") sections.add("지금 확인할 것");
  if (decision.intent === "action" || decision.intent === "device") sections.add("지금 할 일");
  return Array.from(sections);
}

function buildSmallCategoryHints(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals) {
  if (decision.intent === "compare") {
    if (signals.mentionsCompatibility || signals.mentionsLineOrTube) return ["현재 라인 구성", "혼합/호환 위험", "선택 기준"];
    return ["목적", "원리/작용", "주의점", "선택 기준"];
  }
  if (decision.intent === "numeric") {
    return signals.mentionsPatientState ? ["기준", "현재 의미", "추가 확인", "보고 기준"] : ["기준", "의미", "바로 확인할 것"];
  }
  if (decision.intent === "device") {
    return signals.mentionsAlarm ? ["알람 원인 후보", "바로 확인", "바로 조치", "호출"] : ["원인 후보", "바로 확인할 것", "바로 할 조치"];
  }
  if (decision.intent === "action") {
    return signals.mentionsCompatibility ? ["핵심 판단", "현재 라인 확인", "안전 조치", "보고/호출"] : ["핵심 판단", "원인 후보", "보고/호출"];
  }
  return signals.subjectFocus === "lab" ? ["핵심 해석", "추가 확인", "보고 신호"] : ["핵심 관찰 포인트", "주의점", "보고 신호"];
}

function buildMustNotAssert(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals) {
  const items: string[] = [];
  if (decision.entityClarity !== "high") {
    items.push("용량", "주입속도", "희석", "경로", "금기", "호환성", "장비 세팅값", "조작 순서");
  }
  if (decision.risk === "high") {
    items.push("기관별 또는 제조사별 세부 수치");
  }
  if (signals.mentionsCompatibility) {
    items.push("검증되지 않은 Y-site compatibility 결론");
  }
  if (signals.mentionsSetting) {
    items.push("제조사/기관 미확인 세팅값");
  }
  return Array.from(new Set(items));
}

export function buildMedSafetyPromptBlueprint(
  decision: MedSafetyRouteDecision,
  options?: {
    hasImage?: boolean;
    query?: string;
  }
): MedSafetyPromptBlueprint {
  const signals = buildQuestionSignals(normalizeQuery(options?.query ?? ""));
  const openingMode = inferOpeningMode(decision);
  const needsMemoryPoint =
    signals.asksSelection ||
    decision.intent === "compare" ||
    (decision.intent === "knowledge" && decision.answerDepth === "detailed" && decision.risk !== "low");
  const needsMiniCase =
    !options?.hasImage &&
    (decision.intent === "action" || decision.intent === "device") &&
    decision.answerDepth === "detailed" &&
    decision.entityClarity === "high" &&
    !signals.mentionsCompatibility;
  return {
    openingMode,
    mustIncludeSections: buildMustIncludeSections(decision),
    mustNotAssert: buildMustNotAssert(decision, signals),
    sectionOrder: buildSectionOrder(decision),
    smallCategoryHints: buildSmallCategoryHints(decision, signals),
    lengthTarget: decision.answerDepth,
    needsMemoryPoint,
    needsMiniCase,
    subjectFocus: signals.subjectFocus,
    mixedIntent: signals.mixedIntent,
    followupPolicy: decision.entityClarity !== "high" || decision.risk === "high" || Boolean(options?.hasImage) ? "limited" : "forbid",
  };
}

function buildIntentBlueprintContract(decision: MedSafetyRouteDecision, blueprint: MedSafetyPromptBlueprint) {
  const openingLine =
    blueprint.openingMode === "action_first"
      ? "- 첫 문장은 결론, 둘째 문장은 바로 할 일 또는 즉시 위험을 쓴다."
      : blueprint.openingMode === "compare_first"
        ? "- 첫 문장은 핵심 차이, 둘째 문장은 가장 빨리 보는 구분점을 쓴다."
        : blueprint.openingMode === "numeric_first"
          ? "- 첫 문장은 수치의 해석, 둘째 문장은 바로 확인할 포인트나 보고 기준을 쓴다."
          : "- 첫 문장은 결론, 둘째 문장은 그 의미나 실무상 포인트를 쓴다.";
  const intentRule =
    decision.intent === "action"
      ? "- action 질문은 핵심 판단 -> 지금 할 일 -> 지금 확인할 것 -> 원인 후보 -> 중단/보고/호출 기준 순서를 지킨다."
      : decision.intent === "compare"
        ? "- compare 질문은 핵심 차이 -> 가장 빨리 보는 구분점 -> 자세한 차이/선택 기준 순서를 지킨다."
        : decision.intent === "numeric"
          ? "- numeric 질문은 기준 -> 현재 의미 -> 바로 확인할 것 -> 보고 기준 순서를 지킨다."
          : decision.intent === "device"
            ? "- device 질문은 문제 원인 후보 -> 지금 확인할 것 -> 바로 할 조치 -> 중단/보고/호출 기준 순서를 지킨다."
            : "- knowledge 질문은 정의/의미를 먼저 두고, 필요한 관찰 포인트와 위험 신호만 선별해 쓴다.";
  return [
    "[INTENT_BLUEPRINT]",
    openingLine,
    intentRule,
    `- opening_mode=${blueprint.openingMode}`,
    `- must_include_sections=${blueprint.mustIncludeSections.join(" | ") || "none"}`,
    `- must_not_assert=${blueprint.mustNotAssert.join(" | ") || "none"}`,
    `- section_order=${blueprint.sectionOrder.join(" -> ") || "none"}`,
    `- small_category_hints=${blueprint.smallCategoryHints.join(" | ") || "none"}`,
    `- length_target=${blueprint.lengthTarget}`,
    `- subject_focus=${blueprint.subjectFocus}`,
    `- mixed_intent=${String(blueprint.mixedIntent)}`,
    `- followup_policy=${blueprint.followupPolicy}`,
  ].join("\n");
}

export function buildHybridBehavioralBasePrompt(locale: "ko" | "en", decision: MedSafetyRouteDecision, blueprint: MedSafetyPromptBlueprint) {
  const parts = [
    ROLE_AND_GOAL_SPINE,
    DECISION_PRIORITY_SPINE,
    SAFETY_AND_CERTAINTY_SPINE,
    buildIntentBlueprintContract(decision, blueprint),
    RENDERING_AND_LENGTH_CONTRACT,
  ];
  if (locale === "en") parts.push(LANGUAGE_DELTA);
  return parts.join("\n\n");
}

function buildSelectedContractSpecs(args: {
  decision: MedSafetyRouteDecision;
  locale: "ko" | "en";
  blueprint: MedSafetyPromptBlueprint;
}) {
  const { decision, locale, blueprint } = args;
  const specs: PromptContractSpec[] = [
    { id: "role_goal_spine", text: ROLE_AND_GOAL_SPINE, optional: false, dropPriority: 999 },
    { id: "decision_priority_spine", text: DECISION_PRIORITY_SPINE, optional: false, dropPriority: 999 },
    { id: "safety_certainty_spine", text: SAFETY_AND_CERTAINTY_SPINE, optional: false, dropPriority: 999 },
    { id: "intent_blueprint", text: buildIntentBlueprintContract(decision, blueprint), optional: false, dropPriority: 999 },
    { id: "rendering_length_contract", text: RENDERING_AND_LENGTH_CONTRACT, optional: false, dropPriority: 999 },
  ];
  if (decision.risk === "high" || decision.needsEscalation) {
    specs.push({ id: "risk_escalation_delta", text: RISK_ESCALATION_DELTA, optional: false, dropPriority: 999 });
  }
  if (decision.entityClarity !== "high") {
    specs.push({ id: "entity_delta", text: ENTITY_DELTA, optional: false, dropPriority: 999 });
  }
  specs.push({ id: "depth_delta", text: resolveDepthModule(decision.answerDepth), optional: false, dropPriority: 999 });
  specs.push({ id: "format_delta", text: resolveFormatModule(decision.format), optional: false, dropPriority: 999 });
  if (decision.needsSbar) {
    specs.push({ id: "appendix_sbar", text: APPENDIX_SBAR, optional: true, dropPriority: 3 });
  }
  if (blueprint.needsMemoryPoint) {
    specs.push({ id: "appendix_memory_point", text: APPENDIX_MEMORY_POINT, optional: true, dropPriority: 2 });
  }
  if (blueprint.needsMiniCase) {
    specs.push({ id: "appendix_mini_case", text: APPENDIX_MINI_CASE, optional: true, dropPriority: 1 });
  }
  if (locale === "en") {
    specs.push({ id: "language_delta", text: LANGUAGE_DELTA, optional: false, dropPriority: 999 });
  }
  return specs;
}

function resolvePromptBudget(args: {
  decision: MedSafetyRouteDecision;
  runtimeMode?: MedSafetyRuntimeMode;
  hasImage?: boolean;
}) {
  if (args.runtimeMode === "legacy") {
    return { budgetClass: "legacy" as const, budgetChars: 14_000 };
  }
  if (args.runtimeMode === "hybrid_shadow") {
    return { budgetClass: "shadow" as const, budgetChars: 8_000 };
  }
  if (args.hasImage || args.decision.risk === "high") {
    return { budgetClass: "high_risk_or_image" as const, budgetChars: 8_500 };
  }
  return { budgetClass: "standard" as const, budgetChars: 6_500 };
}

function joinPromptContracts(specs: PromptContractSpec[]) {
  return specs.map((spec) => spec.text.trim()).filter(Boolean).join("\n\n").trim();
}

export function assembleMedSafetyDeveloperPrompt(
  decision: MedSafetyRouteDecision,
  locale: "ko" | "en",
  options?: {
    runtimeMode?: MedSafetyRuntimeMode;
    hasImage?: boolean;
  }
): MedSafetyPromptAssembly {
  const blueprint = buildMedSafetyPromptBlueprint(decision, { hasImage: options?.hasImage, query: options?.query });
  const selectedSpecs = buildSelectedContractSpecs({ decision, locale, blueprint });
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
      contractIds: keptSpecs.filter((spec) => !spec.id.startsWith("appendix_")).map((spec) => spec.id),
      appendixIds: keptSpecs.filter((spec) => spec.id.startsWith("appendix_")).map((spec) => spec.id),
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
    decision.risk === "high";

  if (isVerySimple) {
    return {
      reasoningEfforts: isPremiumSearch ? ["medium"] : ["low"],
      verbosity: "low",
      outputTokenCandidates: isPremiumSearch ? [900, 720, 560] : [700, 560, 440],
      qualityLevel: "balanced",
    };
  }

  if (isComplex) {
    const allowHighReasoning =
      supportsHighReasoning &&
      (decision.risk === "high" && (Boolean(hasImage) || decision.entityClarity !== "high" || decision.confidence === "medium"));
    return {
      reasoningEfforts: allowHighReasoning ? ["high", "medium"] : ["medium"],
      verbosity: decision.answerDepth === "detailed" && isPremiumSearch ? "medium" : "low",
      outputTokenCandidates:
        decision.answerDepth === "detailed"
          ? decision.risk === "high" || Boolean(hasImage)
            ? [2400, 2000, 1700]
            : [1900, 1600, 1350]
          : [1500, 1250, 1050],
      qualityLevel: "balanced",
    };
  }
  return {
    reasoningEfforts: ["medium"],
    verbosity: isPremiumSearch ? "medium" : "low",
    outputTokenCandidates: isPremiumSearch ? [1400, 1150, 950] : [1200, 980, 820],
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
  if (args.hasImage) return true;
  if (args.decision.answerDepth === "detailed") return true;
  if (normalizeText(args.answer ?? "").length >= LONG_ANSWER_CHAR_THRESHOLD) return true;
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
    `risk=${args.decision.risk}`,
    `entityClarity=${args.decision.entityClarity}`,
    `answerDepth=${args.decision.answerDepth}`,
    `needsEscalation=${String(args.decision.needsEscalation)}`,
    `needsSbar=${String(args.decision.needsSbar)}`,
    `format=${args.decision.format}`,
    `confidence=${args.decision.confidence}`,
    `source=${args.decision.source}`,
    blueprint ? `openingMode=${blueprint.openingMode}` : "",
    blueprint ? `mustIncludeSections=${blueprint.mustIncludeSections.join("|") || "none"}` : "",
    blueprint ? `mustNotAssert=${blueprint.mustNotAssert.join("|") || "none"}` : "",
    blueprint ? `sectionOrder=${blueprint.sectionOrder.join("->") || "none"}` : "",
    blueprint ? `smallCategoryHints=${blueprint.smallCategoryHints.join("|") || "none"}` : "",
    blueprint ? `subjectFocus=${blueprint.subjectFocus}` : "",
    blueprint ? `mixedIntent=${String(blueprint.mixedIntent)}` : "",
    blueprint ? `followupPolicy=${blueprint.followupPolicy}` : "",
    args.promptAssembly ? `selectedContracts=${args.promptAssembly.selectedContractIds.join("|")}` : "",
    args.promptAssembly ? `droppedContracts=${args.promptAssembly.droppedContractIds.join("|") || "none"}` : "",
    args.promptAssembly ? `assembledPromptChars=${String(args.promptAssembly.finalPromptChars)}` : "",
    "",
    args.locale === "en" ? "Answer to review:" : "검토할 답변:",
    normalizeText(args.answer),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseQualityGateDecision(raw: string): MedSafetyQualityDecision {
  try {
    const parsed = JSON.parse(String(raw ?? "").trim()) as Partial<{ verdict: string; repairInstructions: string }>;
    const verdict = sanitizeEnum(parsed.verdict, ["pass", "repair_required", "pass_but_verbose"] as const, "repair_required");
    return {
      verdict,
      repairInstructions: normalizeText(parsed.repairInstructions),
    };
  } catch {
    return {
      verdict: "repair_required",
      repairInstructions: "missing_immediate_action,missing_escalation_threshold,missing_assumption_disclosure",
    };
  }
}

export function buildRepairDeveloperPrompt(locale: "ko" | "en") {
  return locale === "en"
    ? [
        "You are revising a nurse-facing clinical answer.",
        "Keep the clinical intent. Fix only the listed issue codes.",
        "Delete unsupported specifics instead of inventing new facts.",
        "Prefer compression, reordering, and removing weak filler over adding new explanation.",
        "If certainty is limited, disclose the working assumption or verification need.",
        "Strengthen immediate action, what to check now, and reporting thresholds when requested.",
        "Keep good lead sentences, section structure, and small subcategory labels when already correct.",
        "Issue code guide:",
        "- missing_conclusion_first: make the practical conclusion appear in the first sentence or first lead line.",
        "- mixed_question_order: put action/safety before background explanation.",
        "- missing_immediate_action: move the immediate action to the top.",
        "- missing_escalation_threshold: add clear stop/report/call criteria.",
        "- missing_assumption_disclosure: disclose the working assumption near the start.",
        "- unsafe_specificity_for_ambiguous_entity or missing_local_authority_caveat: delete unsafe specifics or add protocol/IFU/pharmacy caveat.",
        "- weak_section_structure: restore short section headings and lead sentences.",
        "- missing_small_category_structure: restore short inline subcategory lines when a section contains grouped checks or criteria.",
        "- missing_fast_distinction or missing_numeric_core or missing_action_core: add the missing core structure only.",
        "- overlong_answer, duplicate_lines, filler_detected, forbidden_followup: compress, deduplicate, and remove unnecessary closing suggestions.",
        "Return final plain text answer only.",
      ].join("\n")
    : [
        "너는 간호사 대상 임상답변을 수정하는 QA 편집기다.",
        "기존 답변의 임상적 의도는 유지하고 issue code에 해당하는 부분만 고쳐라.",
        "새 정보를 지어내지 말고, 근거 없는 구체성은 삭제하는 쪽을 우선한다.",
        "설명을 늘리기보다 압축, 재배치, 군더더기 제거를 우선한다.",
        "확신이 낮으면 전제 공개나 확인 필요성을 앞부분에 분명히 밝혀라.",
        "요청된 경우 즉시 행동, 지금 확인할 것, 보고 기준을 더 선명하게 다듬어라.",
        "이미 좋은 리드 문장, 섹션 구조, 작은 소카테고리는 유지하라.",
        "Issue code guide:",
        "- missing_conclusion_first: 첫 문장 또는 첫 리드 문장에 실무 결론을 올린다.",
        "- mixed_question_order: 배경 설명보다 행동/안전을 먼저 오게 재배치한다.",
        "- missing_immediate_action: 상단에 즉시 행동을 올린다.",
        "- missing_escalation_threshold: 중단/보고/호출 기준을 보강한다.",
        "- missing_assumption_disclosure: 시작부에 전제 또는 확인 필요성을 밝힌다.",
        "- unsafe_specificity_for_ambiguous_entity 또는 missing_local_authority_caveat: 위험한 구체성을 지우거나 기관 프로토콜/약제부/IFU 확인 문구를 넣는다.",
        "- weak_section_structure: 짧은 소제목과 리드 문장 구조를 복원한다.",
        "- missing_small_category_structure: 묶음형 항목에는 짧은 소카테고리 줄과 그 아래 세부 bullet 구조를 복원한다.",
        "- missing_fast_distinction 또는 missing_numeric_core 또는 missing_action_core: 빠진 핵심 구조만 보강한다.",
        "- overlong_answer, duplicate_lines, filler_detected, forbidden_followup: 길이를 줄이고, 반복과 불필요한 마무리 제안을 제거한다.",
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
    `risk=${args.decision.risk}`,
    `entityClarity=${args.decision.entityClarity}`,
    `answerDepth=${args.decision.answerDepth}`,
    `needsEscalation=${String(args.decision.needsEscalation)}`,
    `needsSbar=${String(args.decision.needsSbar)}`,
    `format=${args.decision.format}`,
    `confidence=${args.decision.confidence}`,
    `source=${args.decision.source}`,
    blueprint ? `openingMode=${blueprint.openingMode}` : "",
    blueprint ? `sectionOrder=${blueprint.sectionOrder.join("->") || "none"}` : "",
    blueprint ? `mustIncludeSections=${blueprint.mustIncludeSections.join("|") || "none"}` : "",
    blueprint ? `smallCategoryHints=${blueprint.smallCategoryHints.join("|") || "none"}` : "",
    blueprint ? `subjectFocus=${blueprint.subjectFocus}` : "",
    blueprint ? `mixedIntent=${String(blueprint.mixedIntent)}` : "",
    blueprint ? `followupPolicy=${blueprint.followupPolicy}` : "",
    args.promptAssembly ? `selectedContracts=${args.promptAssembly.selectedContractIds.join("|")}` : "",
    "",
    args.locale === "en"
      ? `Issue codes: ${normalizeText(args.repairInstructions)}`
      : `Issue codes: ${normalizeText(args.repairInstructions)}`,
    "",
    args.locale === "en" ? "Current answer:" : "현재 답변:",
    normalizeText(args.answer),
  ]
    .filter(Boolean)
    .join("\n");
}

function extractLeadText(lines: string[]) {
  const normalized = lines.map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < normalized.length && index < 4; index += 1) {
    const line = normalized[index]!;
    if (/^-\s+/.test(line)) return line.replace(/^-\s+/, "").trim();
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
  return /(맞습니다|아닙니다|우선|지금은|가장|먼저|의심|권장|필요|안전|하는 것이|보는 것이|적절|중요|가능성)/i.test(lead) || lead.length >= 18;
}

function hasSmallCategoryStructure(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index]!;
    const next = lines[index + 1]!;
    if (/[:：]$/.test(current)) continue;
    if (/^- /.test(current)) continue;
    if (current.length > 24) continue;
    if (!/^[0-9A-Za-z가-힣()/+\-·, ]+$/.test(current)) continue;
    if (/^- /.test(next)) return true;
  }
  return false;
}

function isOverlongAnswer(text: string, decision: MedSafetyRouteDecision) {
  const length = normalizeText(text).length;
  if (decision.answerDepth === "short") return length > 520;
  if (decision.answerDepth === "standard") return length > 1500;
  if (decision.risk === "high") return length > 2600;
  return length > 2200;
}

function hasForbiddenFollowup(text: string, decision: MedSafetyRouteDecision) {
  const allowFollowup = decision.entityClarity !== "high" || decision.risk === "high" || decision.intent === "device";
  if (allowFollowup) return false;
  const tail = normalizeText(text)
    .split("\n")
    .slice(-5)
    .join("\n");
  return /(원하시면|원하면|이어서 정리|더 정리해드릴|추가로 정리|바로 이어서|제가 바로 이어서|I can also|if you want)/i.test(tail);
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
    .map((line) => line.trim())
    .filter(Boolean);
  const headings = lines.filter((line) => /[:：]$/.test(line) && line.length <= 20);
  return headings.length >= 2;
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
  return /(중단|멈추|보고|호출|clamp|산소|분리|의사에게|상급자에게)/i.test(text);
}

function includesFastDistinction(text: string) {
  return /(구분 포인트|제일 먼저|먼저 보는|핵심 차이|가장 빨리)/i.test(text);
}

function includesNumericCore(text: string) {
  return /(정상|기준|범위)/i.test(text) && /(의미|해석|시사)/i.test(text) && /(보고|호출|확인)/i.test(text);
}

function includesActionCore(text: string) {
  return /(확인|체크|관찰)/i.test(text) && /(조치|대응|중단|보고|호출)/i.test(text);
}

function includesRiskySpecificity(text: string) {
  return /(\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|mL|ml|cc|units?|u|amp|vial|mEq|mmol|gtt\/min|drops?\/min|ml\/hr|cc\/hr|L\/min|l\/min|psi|mmhg|fr|gauge)\b)|(희석[^\n]{0,18}\d)|(속도[^\n]{0,18}\d)|(세팅[^\n]{0,18}\d)|(교체주기[^\n]{0,18}\d)/i.test(
    text
  );
}

function includesLocalAuthorityCaveat(text: string) {
  return /(기관 프로토콜|기관 기준|약제부|제조사|ifu|local protocol|pharmacy|manufacturer)/i.test(text);
}

function findHeuristicRepairIssues(answer: string, decision: MedSafetyRouteDecision) {
  const issues: string[] = [];
  if (!hasConclusionNearTop(answer)) {
    issues.push("missing_conclusion_first");
  }
  if ((decision.risk === "high" || decision.intent === "action" || decision.intent === "device") && !hasImmediateActionNearTop(answer)) {
    issues.push("mixed_question_order");
  }
  if (decision.risk === "high" && !hasImmediateActionNearTop(answer)) {
    issues.push("missing_immediate_action");
  }
  if (decision.needsEscalation && !includesEscalationSignals(answer)) {
    issues.push("missing_escalation_threshold");
  }
  if (decision.entityClarity === "medium" && !hasAssumptionDisclosureNearTop(answer)) {
    issues.push("missing_assumption_disclosure");
  }
  if (decision.entityClarity !== "high" && /(용량|속도|희석|경로|호환성|세팅)/i.test(answer) && !/(확인|추정|가능성|정확한 명칭)/i.test(answer)) {
    issues.push("unsafe_specificity_for_ambiguous_entity");
  }
  if ((decision.entityClarity !== "high" || decision.risk === "high") && includesRiskySpecificity(answer) && !includesLocalAuthorityCaveat(answer)) {
    issues.push("missing_local_authority_caveat");
  }
  if (decision.format === "sectioned" && !hasSectionStructure(answer)) {
    issues.push("weak_section_structure");
  }
  if (
    decision.format === "sectioned" &&
    (decision.intent === "compare" || decision.intent === "numeric" || decision.intent === "action" || decision.intent === "device") &&
    !hasSmallCategoryStructure(answer)
  ) {
    issues.push("missing_small_category_structure");
  }
  if (countDuplicateLines(answer) >= 2) {
    issues.push("duplicate_lines");
  }
  if (FILLER_PATTERNS.some((pattern) => pattern.test(answer))) {
    issues.push("filler_detected");
  }
  if (UNSUPPORTED_SPECIFICITY_PATTERNS.some((pattern) => pattern.test(answer))) {
    issues.push("unsupported_specificity");
  }
  if (decision.intent === "compare" && !includesFastDistinction(answer)) {
    issues.push("missing_fast_distinction");
  }
  if (decision.intent === "numeric" && !includesNumericCore(answer)) {
    issues.push("missing_numeric_core");
  }
  if ((decision.intent === "action" || decision.intent === "device") && !includesActionCore(answer)) {
    issues.push("missing_action_core");
  }
  if (isOverlongAnswer(answer, decision)) {
    issues.push("overlong_answer");
  }
  if (hasForbiddenFollowup(answer, decision)) {
    issues.push("forbidden_followup");
  }
  return issues;
}

export function buildHeuristicQualityDecision(answer: string, decision: MedSafetyRouteDecision): MedSafetyQualityDecision {
  const issues = Array.from(new Set(findHeuristicRepairIssues(answer, decision)));
  if (!issues.length) {
    return { verdict: "pass", repairInstructions: "" };
  }
  const verboseOnly = issues.every((issue) =>
    ["duplicate_lines", "filler_detected", "overlong_answer", "forbidden_followup"].includes(issue)
  );
  if (verboseOnly) {
    return {
      verdict: "pass_but_verbose",
      repairInstructions: issues.slice(0, 4).join(","),
    };
  }
  return {
    verdict: "repair_required",
    repairInstructions: issues.slice(0, 4).join(","),
  };
}

export function buildQualityGateDeveloperPrompt() {
  return QUALITY_GATE_DEVELOPER_PROMPT;
}
