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

export type MedSafetyPromptBudgetClass = "shadow_static" | "standard" | "high_risk_or_image";

export type MedSafetyPromptDeltaId =
  | "opening"
  | "trust"
  | "knowledge"
  | "action"
  | "compare"
  | "numeric"
  | "device"
  | "entity"
  | "risk"
  | "density_short"
  | "density_standard"
  | "density_detailed"
  | "format_sectioned"
  | "appendix_sbar"
  | "language_en";

export type MedSafetyPromptAssembly = {
  developerPrompt: string;
  basePrompt: string;
  selectedDeltaIds: MedSafetyPromptDeltaId[];
  droppedDeltaIds: MedSafetyPromptDeltaId[];
  basePromptChars: number;
  finalPromptChars: number;
  budgetClass: MedSafetyPromptBudgetClass;
  budgetChars: number;
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

const COMPACT_BASE_SCAFFOLD = [
  "너는 간호사 대상 임상검색 AI다.",
  "- 첫 1~2문장에 핵심 답을 먼저 쓴다.",
  "- 위험이 있으면 설명보다 행동과 보고 기준을 먼저 쓴다.",
  "- 확실하지 않은 사실은 단정하지 않는다.",
  "- 기관 프로토콜, 약제부, 제조사 IFU가 최종 기준이다.",
  "- 일반 텍스트와 불릿(-)만 사용한다.",
].join("\n");

const DELTA_OPENING = [
  "[opening]",
  "- 혼합 질문이면 행동과 안전을 먼저 두고 배경 설명은 뒤로 보낸다.",
  "- 첫 문장부터 현장 판단에 바로 쓸 수 있게 밀도 있게 쓴다.",
].join("\n");

const DELTA_TRUST = [
  "[trust]",
  "- 일반 원칙과 기관별/제품별 세부를 섞지 않는다.",
  "- 확신이 낮으면 용량, 속도, 희석, 경로, 호환성, 세팅, 교체주기, 적응증 세부는 일반 원칙 수준까지만 답한다.",
  "- 근거 없는 manufacturer-level specificity, filler, 반복 문장은 넣지 않는다.",
].join("\n");

const DELTA_KNOWLEDGE = [
  "[knowledge]",
  "- 핵심 정의와 임상적 의미를 먼저 말하고, 필요한 관찰 포인트와 위험 신호만 남긴다.",
].join("\n");

const DELTA_ACTION = [
  "[action]",
  "- 핵심 판단, 지금 할 일, 지금 확인할 것, 원인 후보, 중단/보고/호출 기준 순으로 답한다.",
].join("\n");

const DELTA_COMPARE = [
  "[compare]",
  "- 1) 핵심 차이 2) 가장 빨리 보는 구분점 3) 자세한 차이와 대응 순서를 우선한다.",
].join("\n");

const DELTA_NUMERIC = [
  "[numeric]",
  "- 일반 기준 범위, 현재 의미, 바로 확인할 것, 보고 기준을 빠뜨리지 않는다.",
].join("\n");

const DELTA_DEVICE = [
  "[device]",
  "- 원리 설명보다 문제 원인 후보, 지금 확인할 것, 바로 할 조치, 중단/보고/호출 기준을 우선한다.",
].join("\n");

const DELTA_ENTITY = [
  "[entity]",
  "- 식별이 HIGH가 아니면 첫 문장 근처에 어떤 전제로 설명하는지 짧게 밝힌다.",
  "- 식별이 애매하면 용량, 속도, 희석, 경로, 호환성, 세팅값, 고위험 조작은 단정하지 않는다.",
].join("\n");

const DELTA_RISK = [
  "[risk]",
  "- 고위험이면 첫 섹션 상단에 가장 큰 위험과 즉시 행동을 둔다.",
  "- 상세 추정보다 보수적 답변, 확인 필요, 중단/분리/clamp/산소/보고/호출 우선순위를 분명히 쓴다.",
].join("\n");

const DELTA_DENSITY_SHORT = [
  "[density_short]",
  "- 3~5개 안쪽의 짧은 bullet과 짧은 핵심 문장으로 끝내는 것을 우선한다.",
].join("\n");

const DELTA_DENSITY_STANDARD = [
  "[density_standard]",
  "- 2~4개의 중요한 포인트만 남기고 중복 없이 정리한다.",
].join("\n");

const DELTA_DENSITY_DETAILED = [
  "[density_detailed]",
  "- 자세히 쓰되 각 bullet은 새 정보만 담고, 설명/대응/보고 기준을 분리해 읽히게 한다.",
].join("\n");

const DELTA_FORMAT_SECTIONED = [
  "[format_sectioned]",
  "- 필요하면 핵심:, 지금 할 일:, 구분 포인트:, 주의:, 보고 기준:, 기억 포인트: 같은 짧은 소제목을 쓴다.",
  "- 섹션 사이에는 빈 줄 2개를 넣고, 각 소제목 아래 첫 줄은 요약 리드 문장으로 쓴다.",
  "- 한 섹션 안에서 양, 색, 점도/이물, 즉시 보고/호출 같은 짧은 소카테고리를 먼저 두고 그 아래 세부 bullet을 둔다.",
].join("\n");

const DELTA_APPENDIX_SBAR = [
  "[appendix_sbar]",
  "- 필요할 때만 답변 끝에 아주 짧은 SBAR 예시를 붙인다.",
].join("\n");

const DELTA_LANGUAGE_EN = [
  "[language_en]",
  "- 위 정책은 유지하고 최종 답변만 자연스러운 bedside clinical English로 쓴다.",
].join("\n");

const QUALITY_GATE_DEVELOPER_PROMPT = [
  "You are a strict QA reviewer for nurse-facing clinical answers.",
  "Do not rewrite the answer.",
  "Return JSON only.",
  "Allowed JSON shape:",
  '{"verdict":"pass|repair_required","repairInstructions":"comma-separated issue codes"}',
  "Use only these issue codes when repair is needed:",
  "- missing_immediate_action",
  "- missing_escalation_threshold",
  "- missing_assumption_disclosure",
  "- unsafe_specificity_for_ambiguous_entity",
  "- missing_local_authority_caveat",
  "- weak_section_structure",
  "- duplicate_lines",
  "- filler_detected",
  "- unsupported_specificity",
  "- missing_fast_distinction",
  "- missing_numeric_core",
  "- missing_action_core",
  "Return repair_required if any of the following is true:",
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
  "If repair is needed, return 1 to 4 issue codes only.",
  "If the answer is already strong and trustworthy, return pass.",
].join("\n");

type PromptDeltaSpec = {
  id: MedSafetyPromptDeltaId;
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
  if (intent === "action") return DELTA_ACTION;
  if (intent === "compare") return DELTA_COMPARE;
  if (intent === "numeric") return DELTA_NUMERIC;
  if (intent === "device") return DELTA_DEVICE;
  return DELTA_KNOWLEDGE;
}

function resolveDepthModule(answerDepth: MedSafetyAnswerDepth) {
  if (answerDepth === "short") return DELTA_DENSITY_SHORT;
  if (answerDepth === "detailed") return DELTA_DENSITY_DETAILED;
  return DELTA_DENSITY_STANDARD;
}

export function buildCompactMedSafetyBasePrompt(locale: "ko" | "en" = "ko") {
  if (locale === "en") {
    return `${COMPACT_BASE_SCAFFOLD}\n- 최종 답변은 자연스러운 bedside clinical English로 작성한다.`;
  }
  return COMPACT_BASE_SCAFFOLD;
}

function buildSelectedDeltaSpecs(args: {
  decision: MedSafetyRouteDecision;
  locale: "ko" | "en";
  runtimeMode?: MedSafetyRuntimeMode;
}) {
  const { decision, locale, runtimeMode } = args;
  if (runtimeMode === "hybrid_shadow") {
    return [] satisfies PromptDeltaSpec[];
  }

  const deltas: PromptDeltaSpec[] = [
    { id: "opening", text: DELTA_OPENING, optional: false, dropPriority: 999 },
    { id: "trust", text: DELTA_TRUST, optional: false, dropPriority: 999 },
    {
      id:
        decision.intent === "action"
          ? "action"
          : decision.intent === "compare"
            ? "compare"
            : decision.intent === "numeric"
              ? "numeric"
              : decision.intent === "device"
                ? "device"
                : "knowledge",
      text: resolveIntentModule(decision.intent),
      optional: false,
      dropPriority: 999,
    },
  ];

  if (decision.entityClarity !== "high") {
    deltas.push({ id: "entity", text: DELTA_ENTITY, optional: false, dropPriority: 999 });
  }
  if (decision.risk === "high" || decision.needsEscalation) {
    deltas.push({ id: "risk", text: DELTA_RISK, optional: false, dropPriority: 999 });
  }

  const densityId: MedSafetyPromptDeltaId =
    decision.answerDepth === "short"
      ? "density_short"
      : decision.answerDepth === "detailed"
        ? "density_detailed"
        : "density_standard";
  deltas.push({
    id: densityId,
    text: resolveDepthModule(decision.answerDepth),
    optional: true,
    dropPriority: decision.answerDepth === "detailed" ? 2 : 4,
  });

  if (decision.format === "sectioned") {
    deltas.push({
      id: "format_sectioned",
      text: DELTA_FORMAT_SECTIONED,
      optional: true,
      dropPriority: 3,
    });
  }
  if (decision.needsSbar) {
    deltas.push({
      id: "appendix_sbar",
      text: DELTA_APPENDIX_SBAR,
      optional: true,
      dropPriority: 1,
    });
  }
  if (locale === "en") {
    deltas.push({
      id: "language_en",
      text: DELTA_LANGUAGE_EN,
      optional: false,
      dropPriority: 999,
    });
  }
  return deltas;
}

function resolvePromptBudget(args: {
  decision: MedSafetyRouteDecision;
  runtimeMode?: MedSafetyRuntimeMode;
  hasImage?: boolean;
}) {
  if (args.runtimeMode === "legacy" || args.runtimeMode === "hybrid_shadow") {
    return {
      budgetClass: "shadow_static" as const,
      budgetChars: 1600,
    };
  }
  if (args.hasImage || args.decision.risk === "high") {
    return {
      budgetClass: "high_risk_or_image" as const,
      budgetChars: 3000,
    };
  }
  return {
    budgetClass: "standard" as const,
    budgetChars: 2200,
  };
}

function joinPromptParts(basePrompt: string, specs: PromptDeltaSpec[]) {
  const parts = [basePrompt.trim(), ...specs.map((spec) => spec.text.trim()).filter(Boolean)].filter(Boolean);
  return parts.join("\n\n").trim();
}

export function assembleMedSafetyDeveloperPrompt(
  decision: MedSafetyRouteDecision,
  locale: "ko" | "en",
  options?: {
    runtimeMode?: MedSafetyRuntimeMode;
    hasImage?: boolean;
  }
): MedSafetyPromptAssembly {
  const basePrompt = buildCompactMedSafetyBasePrompt(locale);
  const selectedSpecs = buildSelectedDeltaSpecs({
    decision,
    locale,
    runtimeMode: options?.runtimeMode,
  });
  const { budgetClass, budgetChars } = resolvePromptBudget({
    decision,
    runtimeMode: options?.runtimeMode,
    hasImage: options?.hasImage,
  });

  const keptSpecs = [...selectedSpecs];
  const droppedDeltaIds: MedSafetyPromptDeltaId[] = [];

  while (joinPromptParts(basePrompt, keptSpecs).length > budgetChars) {
    const dropCandidateIndex = keptSpecs.findIndex((spec) => spec.optional && spec.dropPriority === 1);
    if (dropCandidateIndex >= 0) {
      droppedDeltaIds.push(keptSpecs[dropCandidateIndex]!.id);
      keptSpecs.splice(dropCandidateIndex, 1);
      continue;
    }
    const optionalSpecs = keptSpecs
      .map((spec, index) => ({ spec, index }))
      .filter((entry) => entry.spec.optional)
      .sort((a, b) => a.spec.dropPriority - b.spec.dropPriority || a.index - b.index);
    if (!optionalSpecs.length) break;
    const target = optionalSpecs[0]!;
    droppedDeltaIds.push(target.spec.id);
    keptSpecs.splice(target.index, 1);
  }

  const developerPrompt = joinPromptParts(basePrompt, keptSpecs);
  return {
    developerPrompt,
    basePrompt,
    selectedDeltaIds: keptSpecs.map((spec) => spec.id),
    droppedDeltaIds,
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
}): MedSafetyPromptProfile {
  const { decision, model, isPremiumSearch } = args;
  const normalizedModel = String(model ?? "").toLowerCase();
  const supportsHighReasoning = isPremiumSearch || normalizedModel.includes("5.4") || normalizedModel.includes("5.2");
  if (decision.answerDepth === "short" && decision.risk === "low" && decision.entityClarity === "high") {
    return {
      reasoningEfforts: isPremiumSearch ? ["medium"] : ["low"],
      verbosity: "low",
      outputTokenCandidates: [2000, 1600, 1400],
      qualityLevel: "balanced",
    };
  }
  if (decision.risk === "high" || decision.entityClarity !== "high" || decision.answerDepth === "detailed") {
    return {
      reasoningEfforts: supportsHighReasoning ? ["high", "medium"] : ["medium"],
      verbosity: "medium",
      outputTokenCandidates: [5000, 4200, 3600],
      qualityLevel: "balanced",
    };
  }
  return {
    reasoningEfforts: ["medium"],
    verbosity: "medium",
    outputTokenCandidates: [4000, 3400, 2800],
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
    `confidence=${args.decision.confidence}`,
    `source=${args.decision.source}`,
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
        "If certainty is limited, disclose the working assumption or verification need.",
        "Strengthen immediate action, what to check now, and reporting thresholds when requested.",
        "Keep good lead sentences, section structure, and small subcategory labels when already correct.",
        "Issue code guide:",
        "- missing_immediate_action: move the immediate action to the top.",
        "- missing_escalation_threshold: add clear stop/report/call criteria.",
        "- missing_assumption_disclosure: disclose the working assumption near the start.",
        "- unsafe_specificity_for_ambiguous_entity or missing_local_authority_caveat: delete unsafe specifics or add protocol/IFU/pharmacy caveat.",
        "- weak_section_structure: restore short section headings and lead sentences.",
        "- missing_fast_distinction or missing_numeric_core or missing_action_core: add the missing core structure only.",
        "Return final plain text answer only.",
      ].join("\n")
    : [
        "너는 간호사 대상 임상답변을 수정하는 QA 편집기다.",
        "기존 답변의 임상적 의도는 유지하고 issue code에 해당하는 부분만 고쳐라.",
        "새 정보를 지어내지 말고, 근거 없는 구체성은 삭제하는 쪽을 우선한다.",
        "확신이 낮으면 전제 공개나 확인 필요성을 앞부분에 분명히 밝혀라.",
        "요청된 경우 즉시 행동, 지금 확인할 것, 보고 기준을 더 선명하게 다듬어라.",
        "이미 좋은 리드 문장, 섹션 구조, 작은 소카테고리는 유지하라.",
        "Issue code guide:",
        "- missing_immediate_action: 상단에 즉시 행동을 올린다.",
        "- missing_escalation_threshold: 중단/보고/호출 기준을 보강한다.",
        "- missing_assumption_disclosure: 시작부에 전제 또는 확인 필요성을 밝힌다.",
        "- unsafe_specificity_for_ambiguous_entity 또는 missing_local_authority_caveat: 위험한 구체성을 지우거나 기관 프로토콜/약제부/IFU 확인 문구를 넣는다.",
        "- weak_section_structure: 짧은 소제목과 리드 문장 구조를 복원한다.",
        "- missing_fast_distinction 또는 missing_numeric_core 또는 missing_action_core: 빠진 핵심 구조만 보강한다.",
        "최종 답변 평문만 반환하라.",
      ].join("\n");
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
    `confidence=${args.decision.confidence}`,
    `source=${args.decision.source}`,
    "",
    args.locale === "en"
      ? `Issue codes: ${normalizeText(args.repairInstructions)}`
      : `Issue codes: ${normalizeText(args.repairInstructions)}`,
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
  return issues;
}

export function buildHeuristicQualityDecision(answer: string, decision: MedSafetyRouteDecision): MedSafetyQualityDecision {
  const issues = Array.from(new Set(findHeuristicRepairIssues(answer, decision)));
  if (!issues.length) {
    return { verdict: "pass", repairInstructions: "" };
  }
  return {
    verdict: "repair_required",
    repairInstructions: issues.slice(0, 4).join(","),
  };
}

export function buildQualityGateDeveloperPrompt() {
  return QUALITY_GATE_DEVELOPER_PROMPT;
}
