export type MedSafetyRuntimeMode = "legacy" | "hybrid_shadow" | "hybrid_live";
export type MedSafetyIntent = "knowledge" | "action" | "compare" | "numeric" | "device";
export type MedSafetyRisk = "low" | "medium" | "high";
export type MedSafetyEntityClarity = "high" | "medium" | "low";
export type MedSafetyAnswerDepth = "short" | "standard" | "detailed";
export type MedSafetyFormat = "short" | "sectioned";
export type MedSafetyRouteSource = "rules" | "model";
export type MedSafetyQualityVerdict = "pass" | "repair_required";
export type MedSafetyReasoningEffort = "low" | "medium" | "high";
export type MedSafetyVerbosity = "low" | "medium" | "high";

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
};

export type MedSafetyQualityDecision = {
  verdict: MedSafetyQualityVerdict;
  repairInstructions: string;
};

type RouteInput = {
  query: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
};

type IntentScoreMap = Record<MedSafetyIntent, number>;

const COMPARE_PATTERNS = [/차이/i, /구분/i, /\bvs\b/i, /뭐가\s*달라/i, /헷갈/i, /어떤\s*걸\s*써/i];
const NUMERIC_PATTERNS = [/정상\s*범위/i, /정상범위/i, /수치/i, /해석/i, /계산/i, /몇이\s*정상/i];
const DEVICE_PATTERNS = [/펌프/i, /라인/i, /카테터/i, /산소/i, /알람/i, /세팅/i, /드레싱/i, /모니터/i, /기구/i, /튜브/i, /필터/i];
const ACTION_PATTERNS = [/어떻게/i, /대응/i, /조치/i, /절차/i, /중단/i, /보고/i, /확인해야/i, /해야\s*해/i];
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

const CORE_SAFETY = [
  "너는 간호사를 위한 임상 검색 AI다.",
  "가장 중요한 목표는 간호사가 지금 무엇을 이해해야 하고 무엇을 해야 하는지 빠르고 정확하고 안전하게 알려주는 것이다.",
  "답변은 교과서식 장황한 설명이 아니라 현장에서 바로 쓰이는 실무형이어야 한다.",
  "첫 문장 또는 첫 2문장 안에 사용자가 가장 궁금해할 핵심 답을 먼저 준다.",
  "질문이 혼합형이면 행동과 안전을 먼저 두고 배경 설명은 그 다음에 둔다.",
  "답변은 빠른 판단, 실무 행동, 기억 보조가 함께 되도록 구성한다.",
  "사실을 지어내지 않는다.",
  "확실하지 않은 내용은 추정하지 않는다.",
  "진단이나 처방 결정을 대신하지 않는다.",
  "최종 기준은 기관 프로토콜, 의사 지시, 약제부 지침, 제조사 IFU다.",
  "위험이 있으면 설명보다 행동과 안전을 먼저 제시한다.",
  "질문이 요구하지 않은 정보를 과도하게 덧붙이지 않는다.",
  "같은 의미를 반복하지 않는다.",
  "현장에 도움이 적은 일반론과 빈 문장은 제거한다.",
].join("\n");

const INTENT_KNOWLEDGE = [
  "[현재 질문은 정보/지식 질문이다.]",
  "- 첫 1~2문장 안에 핵심 정의와 임상적 의미를 먼저 말한다.",
  "- 그 다음 간호사 관점에서 중요한 정보만 선별해 설명한다.",
  "- 관련 있을 때만 정의/분류, 작동 원리 또는 기전, 사용 목적, 실무상 관찰 포인트, 흔한 주의점, 보고가 필요한 위험 신호를 포함한다.",
  "- 관련 없는 항목은 억지로 채우지 않는다.",
].join("\n");

const INTENT_ACTION = [
  "[현재 질문은 행동/대응 질문이다.]",
  "- 설명보다 즉시 실행 가능한 행동을 우선한다.",
  "- 가능하면 핵심 판단, 지금 할 일, 확인할 수치/관찰 포인트, 흔한 원인 후보, 중단/보고/호출 기준 순으로 정리한다.",
  "- 즉시 위험이 의심되면 stop rule과 escalation을 분명히 적는다.",
  "- 배경 설명은 행동에 필요한 만큼만 짧게 붙인다.",
].join("\n");

const INTENT_COMPARE = [
  "[현재 질문은 비교/구분 질문이다.]",
  "- 먼저 핵심 차이를 1~2줄로 요약한다.",
  "- 그 다음 실무적으로 가장 빨리 보는 구분 포인트를 따로 뺀다.",
  "- 가능하면 1) 핵심 차이 2) 가장 빨리 보는 구분 포인트 3) 자세한 차이와 대응 순서를 따른다.",
  "- 이후 필요하면 자세한 차이와 대응을 덧붙인다.",
  "- 비교는 설명만 하지 말고 실제 판단에 도움이 되는 방향으로 정리한다.",
].join("\n");

const INTENT_NUMERIC = [
  "[현재 질문은 수치/해석/계산 질문이다.]",
  "- 먼저 일반적인 정상 또는 기준 범위를 말한다.",
  "- 이어서 현재 수치의 임상적 의미를 설명한다.",
  "- 이상 수치일 때 간호사가 바로 확인할 포인트를 함께 제시한다.",
  "- 언제 보고해야 하는지 분명히 적는다.",
  "- 기관별 기준 차이가 있을 수 있으면 일반 기준임을 밝히고 기관 기준 확인을 권고한다.",
].join("\n");

const INTENT_DEVICE = [
  "[현재 질문은 절차/기구/알람/장비 질문이다.]",
  "- 원리 설명보다 실무 대응을 우선한다.",
  "- 가능하면 문제 원인 후보, 지금 확인할 것, 바로 할 수 있는 조치, 사용 중단/보고/호출 기준 순으로 답한다.",
  "- 장비 세팅값, 교체주기, 조작법, 사용 조건이 기관/제조사마다 다르면 단정하지 말고 IFU 또는 기관 프로토콜 확인을 권고한다.",
].join("\n");

const ENTITY_AMBIGUITY = [
  "[대상 식별 규칙을 적용한다.]",
  "- 대상 식별이 애매하면 가장 유력한 해석을 짧은 전제로 밝히고 일반적이고 안전한 범위에서만 답한다.",
  "- 식별이 완료되지 않았거나 혼동 위험이 큰 상태에서는 용량, 주입속도, 희석, 투여 경로, 금기, 호환성, 장비 세팅값, 조작 순서, 고위험 대응 지시를 단정하지 않는다.",
  "- 필요한 경우 후보 1~3개를 짧게 제시하고 정확한 명칭 확인을 권고한다.",
  "- 대상과 무관하게 공통으로 적용되는 일반 안전 원칙은 제공할 수 있다.",
].join("\n");

const HIGH_RISK_ESCALATION = [
  "[현재 질문은 고위험 또는 escalation이 필요한 질문이다.]",
  "- 첫 문장 또는 첫 섹션에서 가장 큰 위험과 즉시 행동을 먼저 제시한다.",
  "- 애매한 표현보다 보수적으로 답한다.",
  "- 즉시 위험이 의심되면 상황에 맞게 중단, 분리, clamp, 산소 공급, 호출, 보고 등의 우선순위를 분명히 쓴다.",
  "- 관찰만으로 끝내지 말고 언제 즉시 보고/호출해야 하는지도 명확히 적는다.",
].join("\n");

const DEPTH_SHORT = [
  "[답변 밀도는 short다.]",
  "- 핵심 답을 첫 문장에서 바로 준다.",
  "- 최대 3~5개의 짧은 bullets 안에서 끝내는 것을 우선한다.",
  "- 배경 설명과 사례는 꼭 필요할 때만 넣는다.",
].join("\n");

const DEPTH_STANDARD = [
  "[답변 밀도는 standard다.]",
  "- 핵심 답을 먼저 주고 필요한 범위에서만 구조화한다.",
  "- 2~4개의 실무적으로 중요한 포인트만 남긴다.",
  "- 중복 설명 없이 밀도 있게 쓴다.",
].join("\n");

const DEPTH_DETAILED = [
  "[답변 밀도는 detailed다.]",
  "- 안전과 판단 포인트를 충분히 자세하게 쓰되 장황하게 늘어놓지 않는다.",
  "- 각 단락과 bullet은 반드시 새 정보를 담아야 한다.",
  "- 설명, 구분, 대응, 보고 기준을 분리해 가독성을 높인다.",
].join("\n");

const FORMAT_SHORT = [
  "[출력 형식은 short다.]",
  "- 한국어 존댓말을 사용한다.",
  "- 마크다운 장식(##, **, 표, 코드블록)은 사용하지 않는다.",
  "- 일반 텍스트와 불릿(-)만 사용한다.",
  "- 섹션은 최소화하고 첫 문장 또는 첫 2문장 안에 핵심 답을 준다.",
].join("\n");

const FORMAT_SECTIONED = [
  "[출력 형식은 sectioned다.]",
  "- 한국어 존댓말을 사용한다.",
  "- 마크다운 장식(##, **, 표, 코드블록)은 사용하지 않는다.",
  "- 일반 텍스트와 불릿(-)만 사용한다.",
  "- 필요하면 핵심:, 지금 할 일:, 구분 포인트:, 자세한 설명:, 주의:, 보고 기준:, 기억 포인트: 같은 짧은 소제목을 사용한다.",
  "- 여러 섹션이 있으면 각 섹션 사이를 반드시 빈 줄 2개로 구분한다.",
  "- 각 소제목 바로 아래 첫 줄은 그 섹션의 핵심을 요약하는 리드 문장으로 쓴다.",
  "- 리드 문장은 불릿으로 시작하지 않는다.",
  "- 소제목 없이 불릿만 나열하지 않는다.",
].join("\n");

const SBAR_APPENDIX = [
  "[필요하면 답변 끝에 짧은 SBAR 예시를 붙인다.]",
  "- SBAR는 실제 보고에 바로 쓸 수 있을 정도로만 짧고 구체적으로 작성한다.",
  "- SBAR가 본문을 압도하지 않게 한다.",
].join("\n");

const LANGUAGE_EN = [
  "[출력 언어는 영어다.]",
  "- 위 정책을 그대로 유지하되 최종 답변만 자연스러운 bedside clinical English로 작성한다.",
].join("\n");

const QUALITY_GATE_DEVELOPER_PROMPT = [
  "You are a strict QA reviewer for nurse-facing clinical answers.",
  "Do not rewrite the answer.",
  "Return JSON only.",
  "Allowed JSON shape:",
  '{"verdict":"pass|repair_required","repairInstructions":"string"}',
  "Return repair_required if any of the following is true:",
  "- high-risk answer does not put immediate action near the top",
  "- escalation is needed but stop/report/call criteria are missing",
  "- ambiguous entity answer asserts dose/rate/dilution/route/compatibility/device setting as if verified",
  "- sectioned answer lacks clear section structure or lead sentence",
  "- duplicated filler or generic weak sentences reduce decision usefulness",
  "- unsupported manufacturer-specific specificity appears",
  "- compare answer misses the fastest practical distinction",
  "- numeric answer misses one of baseline range, meaning, or reporting threshold",
  "- device/action answer is weak on what to check now or what to do now",
  "If the answer is already strong, return pass.",
].join("\n");

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

function inferRisk(query: string): MedSafetyRisk {
  return countPatternHits(query, HIGH_RISK_PATTERNS) > 0 ? "high" : countPatternHits(query, ACTION_PATTERNS) > 0 ? "medium" : "low";
}

function inferEntityClarity(query: string, hasImage: boolean, risk: MedSafetyRisk): MedSafetyEntityClarity {
  const shortText = query.replace(/\s+/g, "");
  if (!query) return "low";
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
}): MedSafetyAnswerDepth {
  const compact = input.query.replace(/\s+/g, "");
  if (
    input.risk === "high" ||
    input.hasImage ||
    input.entityClarity !== "high" ||
    input.ambiguousIntent ||
    compact.length > 140 ||
    input.intent === "compare"
  ) {
    return "detailed";
  }
  if ((input.intent === "knowledge" || input.intent === "numeric") && input.risk === "low" && compact.length <= 28) {
    return "short";
  }
  return "standard";
}

function inferNeedsEscalation(input: { query: string; risk: MedSafetyRisk; intent: MedSafetyIntent }) {
  if (input.risk === "high") return true;
  if ((input.intent === "action" || input.intent === "device") && countPatternHits(input.query, ESCALATION_PATTERNS) > 0) return true;
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

export function shouldGenerateKoEnglishVariant(runtimeMode: MedSafetyRuntimeMode) {
  const override = String(process.env.OPENAI_MED_SAFETY_EAGER_EN_TRANSLATE ?? "").trim().toLowerCase();
  if (override) {
    if (override === "0" || override === "false" || override === "off" || override === "no") return false;
    if (override === "1" || override === "true" || override === "on" || override === "yes") return true;
  }
  return runtimeMode !== "hybrid_live";
}

export function buildDeterministicRouteDecision(input: RouteInput): MedSafetyRouteDecision {
  const normalizedQuery = normalizeQuery(input.query);
  const scores = inferIntentScores(normalizedQuery);
  const topIntent = pickTopIntent(scores);
  const intent = topIntent.topScore > 0 ? topIntent.top : "knowledge";
  const risk = inferRisk(normalizedQuery);
  const entityClarity = inferEntityClarity(normalizedQuery, Boolean(input.imageDataUrl), risk);
  const answerDepth = inferAnswerDepth({
    query: normalizedQuery,
    risk,
    intent,
    hasImage: Boolean(input.imageDataUrl),
    entityClarity,
    ambiguousIntent: topIntent.isAmbiguous,
  });
  const needsEscalation = inferNeedsEscalation({ query: normalizedQuery, risk, intent });
  const needsSbar = needsEscalation && (intent === "action" || intent === "device");
  const format = inferFormat({ answerDepth, risk, intent });
  const confidence = topIntent.isAmbiguous || entityClarity !== "high" ? "medium" : "high";
  const reasonParts = [
    topIntent.topScore > 0 ? `intent=${intent}` : "intent=knowledge(default)",
    `risk=${risk}`,
    `entity=${entityClarity}`,
    topIntent.isAmbiguous ? "ambiguous_intent" : "clear_intent",
  ];
  return {
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
  };
}

export function shouldUseTinyRouter(input: RouteInput, decision: MedSafetyRouteDecision) {
  const normalizedQuery = normalizeQuery(input.query);
  const scores = inferIntentScores(normalizedQuery);
  const topIntent = pickTopIntent(scores);
  const intentFamiliesMatched = (Object.values(scores) as number[]).filter((score) => score > 0).length;
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
    shortAmbiguousEntity
  );
}

export function buildConservativeRouteDecision(reason = "conservative_fallback"): MedSafetyRouteDecision {
  return {
    intent: "action",
    risk: "high",
    entityClarity: "low",
    answerDepth: "standard",
    needsEscalation: true,
    needsSbar: true,
    format: "sectioned",
    source: "rules",
    confidence: "medium",
    reason,
  };
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
    return {
      intent: sanitizeEnum(parsed.intent, ["knowledge", "action", "compare", "numeric", "device"] as const, fallback.intent),
      risk: sanitizeEnum(parsed.risk, ["low", "medium", "high"] as const, fallback.risk),
      entityClarity: sanitizeEnum(parsed.entityClarity, ["high", "medium", "low"] as const, fallback.entityClarity),
      answerDepth: sanitizeEnum(parsed.answerDepth, ["short", "standard", "detailed"] as const, fallback.answerDepth),
      needsEscalation: parsed.needsEscalation === true,
      needsSbar: parsed.needsSbar === true,
      format: sanitizeEnum(parsed.format, ["short", "sectioned"] as const, fallback.format),
      source: "model",
      confidence: "medium",
      reason: normalizeText(parsed.reason) || "model_router",
    };
  } catch {
    return fallback;
  }
}

function resolveIntentModule(intent: MedSafetyIntent) {
  if (intent === "action") return INTENT_ACTION;
  if (intent === "compare") return INTENT_COMPARE;
  if (intent === "numeric") return INTENT_NUMERIC;
  if (intent === "device") return INTENT_DEVICE;
  return INTENT_KNOWLEDGE;
}

function resolveDepthModule(answerDepth: MedSafetyAnswerDepth) {
  if (answerDepth === "short") return DEPTH_SHORT;
  if (answerDepth === "detailed") return DEPTH_DETAILED;
  return DEPTH_STANDARD;
}

function resolveFormatModule(format: MedSafetyFormat) {
  return format === "short" ? FORMAT_SHORT : FORMAT_SECTIONED;
}

export function assembleMedSafetyDeveloperPrompt(decision: MedSafetyRouteDecision, locale: "ko" | "en") {
  const modules = [CORE_SAFETY, resolveIntentModule(decision.intent)];
  if (decision.entityClarity !== "high") modules.push(ENTITY_AMBIGUITY);
  if (decision.risk === "high" || decision.needsEscalation) modules.push(HIGH_RISK_ESCALATION);
  modules.push(resolveDepthModule(decision.answerDepth));
  modules.push(resolveFormatModule(decision.format));
  if (decision.needsSbar) modules.push(SBAR_APPENDIX);
  if (locale === "en") modules.push(LANGUAGE_EN);
  return modules.join("\n\n");
}

export function buildPromptProfile(args: {
  decision: MedSafetyRouteDecision;
  model: string;
  isPremiumSearch: boolean;
}): MedSafetyPromptProfile {
  const { decision, model, isPremiumSearch } = args;
  const normalizedModel = String(model ?? "").toLowerCase();
  const supportsHighReasoning = isPremiumSearch || normalizedModel.includes("5.4") || normalizedModel.includes("5.2");
  if (decision.answerDepth === "short" && decision.risk === "low" && decision.entityClarity === "high") {
    return {
      reasoningEfforts: isPremiumSearch ? ["medium"] : ["low"],
      verbosity: "low",
      outputTokenCandidates: [1000, 900],
    };
  }
  if (decision.risk === "high" || decision.entityClarity !== "high" || decision.answerDepth === "detailed") {
    return {
      reasoningEfforts: supportsHighReasoning ? ["high", "medium"] : ["medium"],
      verbosity: "medium",
      outputTokenCandidates: [2600, 2200, 1800],
    };
  }
  return {
    reasoningEfforts: ["medium"],
    verbosity: "medium",
    outputTokenCandidates: [1800, 1500, 1200],
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
}) {
  return [
    args.locale === "en" ? `User question: ${normalizeText(args.query)}` : `사용자 질문: ${normalizeText(args.query)}`,
    `intent=${args.decision.intent}`,
    `risk=${args.decision.risk}`,
    `entityClarity=${args.decision.entityClarity}`,
    `answerDepth=${args.decision.answerDepth}`,
    `needsEscalation=${String(args.decision.needsEscalation)}`,
    `needsSbar=${String(args.decision.needsSbar)}`,
    `format=${args.decision.format}`,
    "",
    args.locale === "en" ? "Answer to review:" : "검토할 답변:",
    normalizeText(args.answer),
  ].join("\n");
}

export function parseQualityGateDecision(raw: string): MedSafetyQualityDecision {
  try {
    const parsed = JSON.parse(String(raw ?? "").trim()) as Partial<{ verdict: string; repairInstructions: string }>;
    const verdict = sanitizeEnum(parsed.verdict, ["pass", "repair_required"] as const, "repair_required");
    return {
      verdict,
      repairInstructions: normalizeText(parsed.repairInstructions),
    };
  } catch {
    return {
      verdict: "repair_required",
      repairInstructions: "답변의 안전성, 구체성, 구조를 다시 확인하고 부족한 즉시 행동, 보고 기준, 모호성 경고를 보강하라.",
    };
  }
}

export function buildRepairDeveloperPrompt(baseDeveloperPrompt: string, locale: "ko" | "en") {
  const repairTail =
    locale === "en"
      ? [
          "[Repair mode]",
          "- Revise the existing answer without changing its clinical intent.",
          "- Preserve correct content and structure when possible.",
          "- Fix only the issues listed in the repair instructions.",
          "- Remove unsupported specificity, duplicated filler, and weak generic wording.",
          "- Return final plain text answer only.",
        ].join("\n")
      : [
          "[Repair mode]",
          "- 기존 답변의 임상적 의도는 유지하되 부족한 부분만 보강하라.",
          "- 맞는 내용과 구조는 가능한 한 유지하라.",
          "- repair instructions에 적힌 문제만 고쳐라.",
          "- 근거 없는 구체성, 중복 문장, 힘 빠진 일반론을 제거하라.",
          "- 최종 답변 평문만 반환하라.",
        ].join("\n");
  return `${baseDeveloperPrompt}\n\n${repairTail}`;
}

export function buildRepairUserPrompt(args: {
  query: string;
  answer: string;
  locale: "ko" | "en";
  decision: MedSafetyRouteDecision;
  repairInstructions: string;
}) {
  return [
    args.locale === "en" ? `User question: ${normalizeText(args.query)}` : `사용자 질문: ${normalizeText(args.query)}`,
    `intent=${args.decision.intent}`,
    `risk=${args.decision.risk}`,
    `entityClarity=${args.decision.entityClarity}`,
    `answerDepth=${args.decision.answerDepth}`,
    `needsEscalation=${String(args.decision.needsEscalation)}`,
    `needsSbar=${String(args.decision.needsSbar)}`,
    `format=${args.decision.format}`,
    "",
    args.locale === "en" ? `Repair instructions: ${normalizeText(args.repairInstructions)}` : `수정 지시: ${normalizeText(args.repairInstructions)}`,
    "",
    args.locale === "en" ? "Current answer:" : "현재 답변:",
    normalizeText(args.answer),
  ].join("\n");
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

function findHeuristicRepairIssues(answer: string, decision: MedSafetyRouteDecision) {
  const issues: string[] = [];
  if (decision.risk === "high" && !hasImmediateActionNearTop(answer)) {
    issues.push("고위험 질문인데 답변 상단에 즉시 행동이 충분히 드러나지 않습니다.");
  }
  if (decision.needsEscalation && !includesEscalationSignals(answer)) {
    issues.push("중단/보고/호출 기준이 약합니다.");
  }
  if (decision.entityClarity !== "high" && /(용량|속도|희석|경로|호환성|세팅)/i.test(answer) && !/(확인|추정|가능성|정확한 명칭)/i.test(answer)) {
    issues.push("대상 식별이 애매한데 구체 임상 지시가 단정적으로 보입니다.");
  }
  if (decision.format === "sectioned" && !hasSectionStructure(answer)) {
    issues.push("sectioned 형식인데 섹션 구조가 약합니다.");
  }
  if (countDuplicateLines(answer) >= 2) {
    issues.push("중복 문장이 있습니다.");
  }
  if (FILLER_PATTERNS.some((pattern) => pattern.test(answer))) {
    issues.push("힘이 약한 일반론 또는 filler 문장이 있습니다.");
  }
  if (UNSUPPORTED_SPECIFICITY_PATTERNS.some((pattern) => pattern.test(answer))) {
    issues.push("근거 없는 세팅/제조사 수준 구체성이 보입니다.");
  }
  if (decision.intent === "compare" && !includesFastDistinction(answer)) {
    issues.push("비교 질문인데 가장 빨리 보는 구분점이 약합니다.");
  }
  if (decision.intent === "numeric" && !includesNumericCore(answer)) {
    issues.push("수치 질문인데 기준, 의미, 보고 기준 중 일부가 부족합니다.");
  }
  if ((decision.intent === "action" || decision.intent === "device") && !includesActionCore(answer)) {
    issues.push("action/device 질문인데 지금 확인할 것과 바로 할 조치가 약합니다.");
  }
  return issues;
}

export function buildHeuristicQualityDecision(answer: string, decision: MedSafetyRouteDecision): MedSafetyQualityDecision {
  const issues = findHeuristicRepairIssues(answer, decision);
  if (!issues.length) {
    return { verdict: "pass", repairInstructions: "" };
  }
  return {
    verdict: "repair_required",
    repairInstructions: issues.slice(0, 4).join(" "),
  };
}

export function buildQualityGateDeveloperPrompt() {
  return QUALITY_GATE_DEVELOPER_PROMPT;
}
