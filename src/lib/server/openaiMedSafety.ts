import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";
import {
  assembleMedSafetyDeveloperPrompt,
  buildDeterministicRouteDecision,
  buildHeuristicQualityDecision,
  buildPromptProfile,
  buildQualityGateDeveloperPrompt,
  buildQualityGateUserPrompt,
  buildRepairDeveloperPrompt,
  buildRepairUserPrompt,
  buildTinyRouterDeveloperPrompt,
  buildTinyRouterUserPrompt,
  parseQualityGateDecision,
  parseTinyRouterDecision,
  resolveMedSafetyRuntimeMode,
  shouldRunQualityGate,
  shouldUseTinyRouter,
  type MedSafetyPromptAssembly,
  type MedSafetyPromptProfile,
  type MedSafetyQualityDecision,
  type MedSafetyReasoningEffort,
  type MedSafetyRouteDecision,
  type MedSafetyRuntimeMode,
} from "@/lib/server/medSafetyPrompting";

export type ClinicalMode = "ward" | "er" | "icu";
export type ClinicalSituation = "general" | "pre_admin" | "during_admin" | "event_response";

export type MedSafetyAnalysisResult = {
  answer: string;
  query: string;
};

type AnalyzeParams = {
  query: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
  modelOverride?: string;
  previousResponseId?: string;
  conversationId?: string;
  continuationMemory?: string;
  onTextDelta?: (delta: string) => void | Promise<void>;
  signal: AbortSignal;
};

type ResponsesAttempt = {
  text: string | null;
  error: string | null;
  responseId: string | null;
  conversationId: string | null;
  usage: ResponsesUsage | null;
};

type TextDeltaHandler = (delta: string) => void | Promise<void>;
type ResponseVerbosity = "low" | "medium" | "high";
type ResponsesUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
};

export type MedSafetyUsageBreakdown = {
  router: ResponsesUsage | null;
  main: ResponsesUsage | null;
  gate: ResponsesUsage | null;
  repair: ResponsesUsage | null;
  translation: ResponsesUsage | null;
  total: ResponsesUsage | null;
  visibleAnswerChars: number;
  visibleAnswerLines: number;
  assembledPromptChars: number | null;
  selectedContracts: string[];
  runtimeMode: MedSafetyRuntimeMode;
  routeDecision: {
    intent: MedSafetyRouteDecision["intent"];
    risk: MedSafetyRouteDecision["risk"];
    entityClarity: MedSafetyRouteDecision["entityClarity"];
    answerDepth: MedSafetyRouteDecision["answerDepth"];
    needsEscalation: boolean;
    needsSbar: boolean;
    format: MedSafetyRouteDecision["format"];
    source: MedSafetyRouteDecision["source"];
    confidence: MedSafetyRouteDecision["confidence"];
  } | null;
};

export type MedSafetyShadowComparison = {
  legacyAnswer: string;
  hybridAnswer: string | null;
  legacyUsage: ResponsesUsage | null;
  hybridUsage: ResponsesUsage | null;
  heuristicVerdict: string;
  heuristicRepairInstructions: string;
  pairwiseQualityFlags: string[];
  verbosityFlags: string[];
  overlong: boolean;
  selectedContracts: string[];
};

const MED_SAFETY_LOCKED_MODEL = "gpt-5.4";

export type OpenAIMedSafetyOutput = {
  result: MedSafetyAnalysisResult;
  model: string;
  rawText: string;
  fallbackReason: string | null;
  openaiResponseId: string | null;
  openaiConversationId: string | null;
  routeDecision?: MedSafetyRouteDecision | null;
  runtimeMode?: MedSafetyRuntimeMode;
  usageBreakdown?: MedSafetyUsageBreakdown | null;
  shadowComparison?: MedSafetyShadowComparison | null;
};

function normalizeApiKey() {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.OPENAI_API_TOKEN ??
    process.env.OPENAI_SECRET_KEY ??
    "";
  return String(key ?? "").trim();
}

function splitModelList(raw: string) {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeStrings(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function resolveModelCandidates(modelOverride?: string | null) {
  const direct = String(modelOverride ?? "").trim();
  if (direct) return [direct];
  return [MED_SAFETY_LOCKED_MODEL];
}

function normalizeApiBaseUrl(raw: string) {
  return normalizeOpenAIResponsesBaseUrl(String(raw ?? "").trim());
}

function resolveApiBaseUrls() {
  const listFromEnv = splitModelList(process.env.OPENAI_MED_SAFETY_BASE_URLS ?? "").map((item) => normalizeApiBaseUrl(item));
  const singleRaw = String(process.env.OPENAI_MED_SAFETY_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "").trim();
  const single = normalizeApiBaseUrl(singleRaw);
  const configured = dedupeStrings([...listFromEnv, single]).filter(Boolean);
  if (configured.length) return configured;
  return ["https://api.openai.com/v1"];
}

function resolveStoreResponses() {
  const raw = String(process.env.OPENAI_MED_SAFETY_STORE ?? process.env.OPENAI_STORE ?? "true")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS ?? 5000);
  if (!Number.isFinite(raw)) return 5000;
  const rounded = Math.round(raw);
  return Math.max(1400, Math.min(8000, rounded));
}

function resolveNetworkRetryCount() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRIES ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0, Math.min(5, Math.round(raw)));
}

function resolveNetworkRetryBaseMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRY_BASE_MS ?? 700);
  if (!Number.isFinite(raw)) return 700;
  return Math.max(200, Math.min(4000, Math.round(raw)));
}

function resolveUpstreamTimeoutMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS ?? 120_000);
  if (!Number.isFinite(raw)) return 120_000;
  return Math.max(90_000, Math.min(300_000, Math.round(raw)));
}

function resolveTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS ?? 420_000);
  if (!Number.isFinite(raw)) return 420_000;
  return Math.max(300_000, Math.min(900_000, Math.round(raw)));
}

function resolveTranslateTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TRANSLATE_BUDGET_MS ?? 90_000);
  if (!Number.isFinite(raw)) return 90_000;
  return Math.max(30_000, Math.min(180_000, Math.round(raw)));
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function isBadRequestError(error: string) {
  return /openai_responses_400/i.test(String(error ?? ""));
}

function isTokenLimitError(error: string) {
  const e = String(error ?? "").toLowerCase();
  if (!isBadRequestError(e)) return false;
  return /(max[_ -]?output[_ -]?tokens|max[_ -]?tokens|token limit|too many tokens|context length|incomplete_details|max_output_tokens)/i.test(
    e
  );
}

function normalizeText(value: string) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function stripMarkdownDecorations(text: string) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function dedupeAnswerLines(lines: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function sanitizeAnswerText(text: string) {
  const lines = dedupeAnswerLines(
    stripMarkdownDecorations(text)
      .replace(/^\s*---+\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) =>
        line
          .replace(/^\s*•\s*/g, "- ")
          .replace(/^\s*\d+[.)]\s+/g, "- ")
          .trimEnd()
      )
  );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE = [
  "너는 간호사 전용 임상 AI 어시스턴트다.",
  "사용자는 병동, 응급실, 중환자실, 수술 전후, 회복실, 외래 등 다양한 임상 환경에서 일하는 간호사일 수 있다.",
  "사용자의 질문 의도를 스스로 판단하여, 간호 실무에 바로 도움이 되는 정확하고 안전한 답변을 제공한다.",
  "",
  "[핵심 목표]",
  "- 가장 중요한 목표는 “간호사가 지금 이 상황에서 무엇을 이해해야 하고, 무엇을 해야 하는지”를 빠르고 명확하게 알려주는 것이다.",
  "- 답변은 교과서식 장황한 설명이 아니라, 임상 실무에서 바로 쓸 수 있는 정보 중심으로 작성한다.",
  "- 동시에 사용자가 답변을 보고 핵심 차이와 판단 포인트를 쉽게 기억할 수 있어야 한다.",
  "- 즉, 답변은 “바로 행동 가능한 실무형”이면서도 “한눈에 구분되고 기억되는 학습형”이어야 한다.",
  "- 질문이 단순하면 짧고 선명하게 답하고, 질문이 복합적이면 구조화하여 답한다.",
  "- 불확실한 내용을 아는 척 지어내지 않는다. 확신이 낮으면 확인이 필요하다고 분명히 말한다.",
  "",
  "[최우선 원칙]",
  "- 현장 간호사가 바로 활용할 수 있어야 한다.",
  "- 읽는 즉시 “핵심이 무엇인지”, “지금 무엇을 해야 하는지”가 보여야 한다.",
  "- 도움이 적은 일반론, 교과서식 반복, 쓸모없는 서론은 제거한다.",
  "- 질문이 요구하지 않은 정보를 과도하게 덧붙이지 않는다.",
  "- 위험 상황에서는 설명보다 행동과 escalation을 먼저 제시한다.",
  "",
  "[답변 우선순위]",
  "질문을 받으면 내부적으로 다음 순서로 판단한다.",
  "1. 즉시 위험 여부가 있는지 먼저 본다.",
  "2. 사용자가 원하는 것이 설명인지, 행동 지침인지, 비교인지, 해석인지, 계산인지 판단한다.",
  "3. 약물, 기구, 처치, 수치, 환자상태, 검사, 절차 중 무엇이 핵심 대상인지 파악한다.",
  "4. 질문이 혼합형이면 행동과 안전을 먼저 제시하고, 배경 설명은 그 다음에 덧붙인다.",
  "5. 답변은 “빨리 훑어봐도 핵심이 보이도록” 구조화한다.",
  "",
  "[질문 유형별 답변 규칙]",
  "1. 정보/지식 질문",
  "- 예: \"~이 뭐예요\", \"~설명해 주세요\", \"~에 대해 알려주세요\"",
  "- 첫 1~2문장 안에 핵심 정의와 임상적 의미를 먼저 말한다.",
  "- 그 다음 간호사 관점에서 중요한 정보만 선별해 설명한다.",
  "- 필요 시 다음 요소 중 관련 있는 것만 포함한다:",
  "  - 정의/분류",
  "  - 기전 또는 작동 원리",
  "  - 주요 적응증 또는 사용 목적",
  "  - 실무상 핵심 관찰 포인트",
  "  - 흔한 주의점/실수 포인트",
  "  - 보고가 필요한 위험 신호",
  "- 관련 없는 항목까지 억지로 채우지 않는다.",
  "",
  "2. 행동/대응 질문",
  "- 예: \"~하면 어떻게 하나요\", \"~대응은?\", \"~절차가 뭐예요?\"",
  "- 설명보다 즉시 실행 가능한 행동을 우선한다.",
  "- 가능하면 다음 흐름을 따른다:",
  "  - 핵심 판단",
  "  - 지금 할 일",
  "  - 확인할 수치/관찰 포인트",
  "  - 흔한 원인 후보",
  "  - 중단/보고/호출 기준",
  "  - 필요 시 SBAR 예시",
  "- 즉시 위험이 의심되면 stop rule과 escalation을 분명히 적는다.",
  "- 행동 질문에서는 장황한 배경 설명을 줄인다.",
  "",
  "3. 비교/선택 질문",
  "- 예: \"~와 ~ 차이\", \"~vs~\", \"어떤 걸 써야 하나요\"",
  "- 먼저 핵심 차이를 짧게 요약한다.",
  "- 이후 필요하면 항목별로 정리한다.",
  "- 비교 항목은 필요한 것만 사용한다:",
  "  - 목적",
  "  - 원리/작용",
  "  - 적응 상황",
  "  - 장점/단점",
  "  - 주의점",
  "  - 선택 기준",
  "- 실제 선택에 도움이 되는 임상적 판단 기준을 넣는다.",
  "- 비교 질문은 가능하면 “실무적으로 가장 빨리 보는 구분”을 따로 짧게 정리한다.",
  "",
  "4. 수치/해석/계산 질문",
  "- 예: \"~ 정상범위\", \"~ 수치 의미\", \"~ 해석\", \"~ 계산\"",
  "- 먼저 일반적인 정상/기준 범위를 말하고, 이어서 현재 수치의 임상적 의미를 설명한다.",
  "- 이상 수치일 때는 간호사가 확인할 포인트와 보고 기준을 함께 제시한다.",
  "- 기관별 기준 차이가 있을 수 있으면 일반적 기준임을 밝히고 기관 기준 확인을 권고한다.",
  "",
  "5. 절차/기구/알람/장비 질문",
  "- 예: 펌프 알람, 라인 문제, 산소 장비, 카테터, 드레싱, 모니터링 장비",
  "- 원리 설명보다 실무 대응을 우선한다.",
  "- 적절하면 다음 순서를 따른다:",
  "  - 문제 원인 후보",
  "  - 지금 확인할 것",
  "  - 바로 할 수 있는 조치",
  "  - 사용 중단/보고/호출 기준",
  "- 장비 세팅값, 교체주기, 조작법, 사용 조건이 기관/제조사마다 다르면 단정하지 말고 IFU 또는 기관 프로토콜 확인을 권고한다.",
  "",
  "[혼합 질문 처리]",
  "- 질문에 설명, 비교, 대응, 해석이 함께 섞여 있으면 하나만 고르지 말고 자연스럽게 통합한다.",
  "- 다만 항상 행동과 안전을 먼저, 배경 설명은 그 다음에 둔다.",
  "- 예를 들어 위험 가능성이 있는 질문이면 “정의”보다 “지금 어떻게 해야 하는지”를 먼저 준다.",
  "",
  "[약물/기구 식별 규칙]",
  "- 약물이나 기구를 특정해야 하는 질문에서는 먼저 사용자가 무엇을 의미하는지 최대한 정확히 식별한다.",
  "- 오타, 약어, 음역, 붙여쓰기, 성분명/상품명 혼용, 용량/제형 포함 입력도 정규화하여 핵심 명칭을 추출한다.",
  "- 실제 임상 입력에서는 오타나 비표준 표현이 흔하다는 점을 고려한다.",
  "- 따라서 단순 철자 차이나 흔한 음역/약어 수준이라면, 사용자의 의도가 충분히 분명한지 적극적으로 판단한다.",
  "- 단, 이름이 비슷한 서로 다른 약물/기구가 실제로 혼동될 수 있는 경우에는 보수적으로 대응한다.",
  "- 내부적으로 식별 확신도를 HIGH / MEDIUM / LOW로 판단한다.",
  "",
  "- HIGH:",
  "  - 의도가 충분히 명확하다.",
  "  - 가장 표준적인 정식명 또는 대표 명칭으로 통일해 설명한다.",
  "  - 필요하면 첫 문장에 “질문하신 것은 보통 ___를 의미합니다”처럼 정규화하여 밝혀도 된다.",
  "",
  "- MEDIUM:",
  "  - 사용자의 의도가 한 후보로 꽤 기울지만 완전히 단정하기 어렵다.",
  "  - 이 경우 무조건 답변을 중단하지 말고, “___를 의미하신 것으로 보고 설명드리면”처럼 전제를 짧게 밝힌 뒤 일반적이고 안전한 범위에서 답변할 수 있다.",
  "  - 다만 용량, 주입속도, 희석, 금기, 특정 세팅값, 고위험 조작법처럼 대상이 바뀌면 위험해질 수 있는 정보는 단정하지 않는다.",
  "  - 혼동 가능성이 큰 다른 후보가 있으면 짧게 함께 언급하고 정확한 명칭 확인을 권고한다.",
  "",
  "- LOW:",
  "  - 어떤 대상을 의미하는지 판단할 근거가 부족하다.",
  "  - 이 경우 확인할 수 없다고 분명히 말하고, 추정해서 구체 임상 내용을 생성하지 않는다.",
  "  - 가능하면 후보 1~3개를 짧게 제시하고 정확한 명칭 확인을 요청한다.",
  "",
  "[식별 실패 시 안전 원칙]",
  "- 식별이 완료되지 않았거나 혼동 위험이 큰 상태에서는 다음 정보를 확정적으로 쓰지 않는다:",
  "  - 용량",
  "  - 주입속도",
  "  - 희석 방법",
  "  - 투여 경로",
  "  - 금기",
  "  - 호환성",
  "  - 장비 세팅값",
  "  - 조작 순서",
  "  - 고위험 대응 지시",
  "- 단, 대상이 정확히 확정되지 않아도 공통적으로 적용되는 일반 안전 원칙은 말할 수 있다.",
  "",
  "[불확실성 처리]",
  "- 확실하지 않은 내용은 추정하지 않는다.",
  "- 질문이 모호하더라도 일반 원칙 수준에서 도움이 되는 답은 제공하되, 특정 수치나 처방 수준의 내용은 확인이 필요하다고 분명히 적는다.",
  "- 기관마다 다른 기준은 “기관 프로토콜/약제부/제조사 IFU 확인 권장”으로 명시한다.",
  "- 여러 해석이 가능한 질문은 가장 가능성 높은 해석을 택하되, 그 해석이 안전에 영향을 줄 수 있으면 짧게 전제를 밝혀 준다.",
  "",
  "[안전 규칙]",
  "- 진단이나 처방 결정을 대신하지 않는다.",
  "- 최종 기준은 기관 프로토콜, 의사 지시, 약제부 지침, 제조사 IFU다.",
  "- 다음 위험이 보이면 경고를 포함한다:",
  "  - high-alert medication",
  "  - LASA(Look-Alike Sound-Alike)",
  "  - 투여 경로 오류",
  "  - 희석/속도 오류",
  "  - line mix-up",
  "  - extravasation",
  "  - 아나필락시스",
  "  - 급격한 활력징후 악화",
  "  - 출혈",
  "  - 공기 유입",
  "  - 의식 저하",
  "  - 심각한 저산소증",
  "  - line disconnection",
  "- 위험 상황에서는 애매한 표현보다 보수적으로 답한다.",
  "- 즉시 위험이 의심되면 중단, 분리, clamp, 산소 공급, 호출, 보고 등 필요한 행동 우선순위를 분명히 쓴다.",
  "- 중대한 이상반응이나 악화가 의심되면 “관찰”만 제시하지 말고, 언제 즉시 보고/호출해야 하는지도 명확히 쓴다.",
  "",
  "[출력 설계 원칙]",
  "- 답변은 단순한 설명문이 아니라, “빠른 판단 + 실무 행동 + 기억 보조”가 함께 되도록 구성한다.",
  "- 특히 비교/위험/대응 질문에서는 아래 요소를 상황에 맞게 자연스럽게 조합한다:",
  "  - 핵심",
  "  - 지금 할 일",
  "  - 구분 포인트",
  "  - 자세한 설명",
  "  - 헷갈리는 점",
  "  - 보고 기준",
  "  - 기억 포인트",
  "  - 필요 시 짧은 사례 또는 SBAR/기록 예시",
  "- 모든 질문에 이 요소를 억지로 다 넣지는 않는다.",
  "- 질문이 짧고 단순하면 짧게 답한다.",
  "- 질문이 실무적으로 중요하거나 헷갈리기 쉬운 경우에는 위 요소를 사용해 한눈에 들어오도록 정리한다.",
  "",
  "[비교/구분 질문의 특별 규칙]",
  "- 사용자가 “어떻게 구분해?”, “차이 뭐야?”, “vs”, “헷갈려”처럼 물으면, 가능한 경우 아래 3단 구조를 우선 고려한다:",
  "  1. 핵심 차이 한두 줄",
  "  2. 실무적으로 가장 빨리 보는 구분 포인트",
  "  3. 자세한 차이와 대응",
  "- 사용자가 바로 임상에 적용할 수 있도록 “실제로 제일 먼저 보는 기준”을 따로 빼서 보여준다.",
  "- 비교는 설명만 하지 말고 판단에 도움이 되는 방향으로 정리한다.",
  "",
  "[기억 보조 규칙]",
  "- 헷갈리기 쉬운 질문에서는, 필요할 때만 짧은 “기억 포인트:” 또는 “짧게 정리하면:” 섹션을 넣을 수 있다.",
  "- 이 섹션은 1~3줄 이내로 짧고 강하게 쓴다.",
  "- 시험용 암기 문구처럼 과장되거나 유치하게 쓰지 않는다.",
  "- 실무 기억에 실제 도움이 되는 수준으로만 쓴다.",
  "",
  "[사례 예시 규칙]",
  "- 사례 예시는 질문 이해를 돕거나 실제 판단을 더 쉽게 만들 때만 짧게 넣는다.",
  "- 사례는 3~6줄 정도의 매우 짧은 상황 예시만 사용한다.",
  "- 긴 스토리텔링은 하지 않는다.",
  "- 사례는 항상 실무 판단과 연결되어야 한다.",
  "",
  "[표현 규칙]",
  "- 한국어 존댓말로 작성한다.",
  "- 마크다운 장식(##, **, 표, 코드블록)은 사용하지 않는다.",
  "- 일반 텍스트와 불릿(-)만 사용한다.",
  "- 필요하면 \"핵심:\", \"지금 할 일:\", \"구분 포인트:\", \"주의:\", \"헷갈리는 점:\", \"보고 기준:\", \"기억 포인트:\"처럼 짧은 소제목을 사용한다.",
  "- 첫 문장 또는 첫 2문장 안에 사용자가 가장 궁금해할 핵심 답을 준다.",
  "- 모든 불릿은 새로운 정보를 담는 완결된 문장으로 작성한다.",
  "- 같은 의미를 반복하지 않는다.",
  "- 모바일 화면에서 읽기 쉽게 짧은 문장 위주로 작성한다.",
  "- 단순 질문은 짧고 직접적으로 답한다.",
  "- 복합 질문은 필요한 범위에서만 구조화해 설명한다.",
  "- 불필요한 면책문구를 길게 반복하지 않는다.",
  "- 영어 의학용어가 필요하면 괄호로 짧게 병기할 수 있으나, 설명의 중심은 한국어로 둔다.",
  "",
  "[섹션 구분 형식 — 반드시 준수]",
  "- 여러 줄 답변은 \"소제목:\" 한 줄 -> 다음 줄 일반 텍스트 리드 문장 -> 이후 \"- \" bullet 순서로 쓴다.",
  "- 새 섹션 전에는 빈 줄 2개를 둔다.",
  "- 각 섹션 첫 줄은 bullet로 시작하지 않는다.",
  "- 섹션 안의 작은 묶음 제목은 콜론/마침표 없는 아주 짧은 한 줄로만 쓰고, 바로 아래에 \"- \" bullet을 둔다.",
  "- 소제목 없이 불릿만 나열하지 않는다. 내용이 2가지 이상의 주제를 다루면 반드시 소제목으로 분리한다.",
  "",
  "[답변 길이 원칙]",
  "- 짧은 정의 질문은 짧게 끝낼 수 있어야 한다.",
  "- 복잡한 대응 질문은 필요한 만큼 충분히 자세해야 한다.",
  "- 항상 “질문에 비해 과한 답변”과 “너무 빈약한 답변” 사이의 균형을 맞춘다.",
  "- 질문의 중요도와 위험도에 비해 지나치게 장황해지지 않는다.",
  "- 다만 실무적으로 헷갈리기 쉬운 고위험 질문은 충분히 자세하게 답할 수 있다.",
  "",
  "[좋은 답변의 기준]",
  "- 사용자가 답변을 읽고 바로 이해할 수 있어야 한다.",
  "- 사용자가 “그래서 지금 무엇을 보면 되고, 무엇을 해야 하는지”를 알 수 있어야 한다.",
  "- 실무적이고, 안전하고, 적용 가능해야 한다.",
  "- 필요한 경우에만 경고를 넣고, 필요한 경우에만 설명을 확장한다.",
  "- 현장 간호사에게 실제로 도움이 되는지 내부적으로 점검하고, 도움이 적은 일반론은 제거한다.",
  "- 답변은 “급할 때 바로 쓰는 카드”와 “짧게 공부되는 설명”의 중간지점이어야 한다.",
].join("\n");

function buildDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE,
      "",
      "[LANGUAGE_OVERRIDE]",
      "- 위 규칙을 유지하되 최종 답변만 자연스러운 bedside clinical English로 작성한다.",
    ].join("\n");
  }
  return MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE;
}

function buildPromptDisciplineDiagnostics(
  decision: MedSafetyRouteDecision | null | undefined,
  profile?: MedSafetyPromptProfile | null,
  assembly?: MedSafetyPromptAssembly | null
) {
  const qualityLevel = profile?.qualityLevel ?? "balanced";
  if (!decision) {
    return {
      qualityLevel,
      confidenceDiscipline: "legacy_or_base_only",
      specificitySuppression: false,
      assumptionDisclosure: "not_applicable",
      basePromptChars: assembly?.basePromptChars ?? null,
      finalPromptChars: assembly?.finalPromptChars ?? null,
      selectedContractIds: assembly?.selectedContractIds ?? [],
      droppedContractIds: assembly?.droppedContractIds ?? [],
      openingMode: assembly?.blueprint.openingMode ?? null,
      subjectFocus: assembly?.blueprint.subjectFocus ?? null,
      mixedIntent: assembly?.blueprint.mixedIntent ?? null,
      followupPolicy: assembly?.blueprint.followupPolicy ?? null,
      budgetClass: assembly?.budgetClass ?? null,
    };
  }
  return {
    qualityLevel,
    confidenceDiscipline:
      decision.risk === "high" && decision.entityClarity !== "high"
        ? "constrained_high_risk"
        : decision.entityClarity === "medium"
          ? "assumption_disclosed_general_only"
          : decision.entityClarity === "low"
            ? "verification_before_specifics"
            : decision.risk === "high"
              ? "safety_first_verified_only"
              : "standard",
    specificitySuppression: decision.risk === "high" || decision.entityClarity !== "high",
    assumptionDisclosure:
      decision.entityClarity === "medium"
        ? "opening_line_required"
        : decision.entityClarity === "low"
            ? "verification_required"
          : "not_required",
    basePromptChars: assembly?.basePromptChars ?? null,
    finalPromptChars: assembly?.finalPromptChars ?? null,
    selectedContractIds: assembly?.selectedContractIds ?? [],
    droppedContractIds: assembly?.droppedContractIds ?? [],
    openingMode: assembly?.blueprint.openingMode ?? null,
    subjectFocus: assembly?.blueprint.subjectFocus ?? null,
    mixedIntent: assembly?.blueprint.mixedIntent ?? null,
    followupPolicy: assembly?.blueprint.followupPolicy ?? null,
    budgetClass: assembly?.budgetClass ?? null,
  };
}

function buildUserPrompt(query: string, locale: "ko" | "en") {
  const normalizedQuery = normalizeText(query);
  if (locale === "en") {
    return [
      `User question: ${normalizedQuery}`,
      "Answer directly in the format that best fits the user's intent, and if there is any risk, present safety and immediate actions first.",
    ].join("\n");
  }
  return [
    `사용자 질문: ${normalizedQuery}`,
    "질문 의도에 가장 잘 맞는 형태로 직접 답하고, 위험 가능성이 있으면 안전과 행동을 먼저 제시하라.",
  ].join("\n");
}

function buildUserPromptWithContinuationMemory(userPrompt: string, memory: string | undefined, locale: "ko" | "en") {
  const normalizedMemory = normalizeText(memory ?? "");
  if (!normalizedMemory) return userPrompt;
  if (locale === "en") {
    return [
      userPrompt,
      "",
      "Prior conversation context:",
      normalizedMemory,
      "",
      "Use the prior context only when it is relevant to the current question. If the context is incomplete or conflicts with the current question, say that confirmation is needed instead of assuming.",
    ].join("\n");
  }
  return [
    userPrompt,
    "",
    "이전 대화 맥락:",
    normalizedMemory,
    "",
    "위 맥락은 현재 질문과 관련된 범위에서만 반영하라. 맥락이 불완전하거나 현재 질문과 충돌하면 단정하지 말고 확인이 필요하다고 밝혀라.",
  ].join("\n");
}

function extractResponsesText(json: any): string {
  const chunks: string[] = [];
  const seen = new Set<string>();
  const append = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const value = raw.replace(/\r/g, "").trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    chunks.push(value);
  };
  const appendFromTextLike = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      append(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) appendFromTextLike(item);
      return;
    }
    if (typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    append(node.value);
    append(node.text);
    if (typeof node.text === "object" && node.text) {
      append((node.text as Record<string, unknown>).value);
    }
    append(node.output_text);
    append(node.transcript);
  };

  appendFromTextLike(json?.choices?.[0]?.message?.content);
  appendFromTextLike(json?.output_text);

  const output = Array.isArray(json?.output) ? json.output : [];
  for (const item of output) {
    appendFromTextLike(item?.output_text);
    appendFromTextLike(item?.text);
    appendFromTextLike(item?.transcript);
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      appendFromTextLike(part?.output_text);
      appendFromTextLike(part?.text);
      appendFromTextLike(part?.transcript);
      appendFromTextLike(part);
    }
  }

  const messageContent = Array.isArray(json?.message?.content) ? json.message.content : [];
  for (const part of messageContent) {
    appendFromTextLike(part?.text);
    appendFromTextLike(part?.output_text);
    appendFromTextLike(part?.transcript);
    appendFromTextLike(part);
  }

  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractConversationId(json: any): string | null {
  const conversationFromString = typeof json?.conversation === "string" ? json.conversation : "";
  const conversationFromObject = typeof json?.conversation?.id === "string" ? json.conversation.id : "";
  return conversationFromString || conversationFromObject || null;
}

function readStringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function readNumberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeUsageNode(value: unknown): ResponsesUsage | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const inputTokens = readNumberFromUnknown(node.input_tokens ?? node.prompt_tokens ?? node.inputTokens);
  const outputTokens = readNumberFromUnknown(node.output_tokens ?? node.completion_tokens ?? node.outputTokens);
  const inputDetails =
    (node.input_tokens_details as Record<string, unknown> | undefined) ??
    (node.prompt_tokens_details as Record<string, unknown> | undefined) ??
    (node.inputTokensDetails as Record<string, unknown> | undefined);
  const outputDetails =
    (node.output_tokens_details as Record<string, unknown> | undefined) ??
    (node.completion_tokens_details as Record<string, unknown> | undefined) ??
    (node.outputTokensDetails as Record<string, unknown> | undefined);
  const cachedInputTokens = readNumberFromUnknown(inputDetails?.cached_tokens ?? inputDetails?.cachedTokens);
  const reasoningTokens = readNumberFromUnknown(outputDetails?.reasoning_tokens ?? outputDetails?.reasoningTokens);
  const totalTokens =
    readNumberFromUnknown(node.total_tokens ?? node.totalTokens) ??
    (inputTokens != null || outputTokens != null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  if (inputTokens == null && outputTokens == null && totalTokens == null && cachedInputTokens == null && reasoningTokens == null) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
  };
}

function extractResponsesUsage(json: any): ResponsesUsage | null {
  return (
    normalizeUsageNode(json?.usage) ??
    normalizeUsageNode(json?.response?.usage) ??
    normalizeUsageNode(json?.metrics?.usage) ??
    null
  );
}

function sumUsages(...values: Array<ResponsesUsage | null | undefined>): ResponsesUsage | null {
  const normalized = values.filter((value): value is ResponsesUsage => Boolean(value));
  if (!normalized.length) return null;
  const sum = (items: Array<number | null>) => {
    const usable = items.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    if (!usable.length) return null;
    return usable.reduce((total, item) => total + item, 0);
  };
  return {
    inputTokens: sum(normalized.map((item) => item.inputTokens)),
    outputTokens: sum(normalized.map((item) => item.outputTokens)),
    totalTokens: sum(normalized.map((item) => item.totalTokens)),
    cachedInputTokens: sum(normalized.map((item) => item.cachedInputTokens)),
    reasoningTokens: sum(normalized.map((item) => item.reasoningTokens)),
  };
}

function serializeRouteDecision(decision: MedSafetyRouteDecision | null | undefined) {
  if (!decision) return null;
  return {
    intent: decision.intent,
    risk: decision.risk,
    entityClarity: decision.entityClarity,
    answerDepth: decision.answerDepth,
    needsEscalation: decision.needsEscalation,
    needsSbar: decision.needsSbar,
    format: decision.format,
    source: decision.source,
    confidence: decision.confidence,
  };
}

function countVisibleAnswerLines(answer: string) {
  return normalizeText(answer)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function parseIssueCodes(raw: string) {
  return String(raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeQualityDecisions(heuristic: MedSafetyQualityDecision, model: MedSafetyQualityDecision | null) {
  if (!model) return heuristic;
  const priority = (verdict: MedSafetyQualityDecision["verdict"]) =>
    verdict === "repair_required" ? 2 : verdict === "pass_but_verbose" ? 1 : 0;
  const chosen = priority(model.verdict) >= priority(heuristic.verdict) ? model.verdict : heuristic.verdict;
  const mergedIssues = Array.from(new Set([...parseIssueCodes(heuristic.repairInstructions), ...parseIssueCodes(model.repairInstructions)]));
  return {
    verdict: chosen,
    repairInstructions: mergedIssues.join(","),
  } satisfies MedSafetyQualityDecision;
}

function buildUsageBreakdown(args: {
  runtimeMode: MedSafetyRuntimeMode;
  routeDecision: MedSafetyRouteDecision | null;
  routerUsage?: ResponsesUsage | null;
  mainUsage?: ResponsesUsage | null;
  gateUsage?: ResponsesUsage | null;
  repairUsage?: ResponsesUsage | null;
  translationUsage?: ResponsesUsage | null;
  answer: string;
  assembledPromptChars?: number | null;
  selectedContracts?: string[];
}) {
  return {
    router: args.routerUsage ?? null,
    main: args.mainUsage ?? null,
    gate: args.gateUsage ?? null,
    repair: args.repairUsage ?? null,
    translation: args.translationUsage ?? null,
    total: sumUsages(args.routerUsage, args.mainUsage, args.gateUsage, args.repairUsage, args.translationUsage),
    visibleAnswerChars: normalizeText(args.answer).length,
    visibleAnswerLines: countVisibleAnswerLines(args.answer),
    assembledPromptChars: args.assembledPromptChars ?? null,
    selectedContracts: args.selectedContracts ?? [],
    runtimeMode: args.runtimeMode,
    routeDecision: serializeRouteDecision(args.routeDecision),
  } satisfies MedSafetyUsageBreakdown;
}

function buildDefaultPromptProfile(): MedSafetyPromptProfile {
  return {
    reasoningEfforts: ["medium"],
    verbosity: "low",
    outputTokenCandidates: [1200, 900, 700],
    qualityLevel: "balanced",
  };
}

function buildShadowFallbackDecision(
  deterministic: MedSafetyRouteDecision,
  args: {
    imageDataUrl?: string;
    error?: string | null;
  }
) {
  const next: MedSafetyRouteDecision = {
    ...deterministic,
    answerDepth:
      args.imageDataUrl && deterministic.answerDepth === "short"
        ? "standard"
        : deterministic.answerDepth,
    format:
      args.imageDataUrl && deterministic.format === "short"
        ? "sectioned"
        : deterministic.format,
    confidence: deterministic.confidence === "high" && !args.imageDataUrl ? "high" : "medium",
    reason: [deterministic.reason, "tiny_router_failed", args.error ? truncateError(args.error, 120) : ""].filter(Boolean).join(", "),
  };
  return next;
}

function extractResponsesDelta(event: any): string {
  const eventType = String(event?.type ?? "");
  if (!eventType || !eventType.includes("delta")) return "";
  if (eventType.includes("reasoning")) return "";

  const direct = readStringFromUnknown(event?.delta);
  if (direct) return direct;

  const outputTextDelta = readStringFromUnknown(event?.output_text?.delta);
  if (outputTextDelta) return outputTextDelta;

  const textDelta = readStringFromUnknown(event?.text?.delta);
  if (textDelta) return textDelta;

  const partText = readStringFromUnknown(event?.part?.text);
  if (partText) return partText;

  return "";
}

async function readResponsesEventStream(args: {
  response: Response;
  model: string;
  onTextDelta: TextDeltaHandler;
}): Promise<ResponsesAttempt> {
  const { response, model, onTextDelta } = args;
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/event-stream")) {
    const fallbackJson = await response.json().catch(() => null);
    const fallbackText = extractResponsesText(fallbackJson);
    const fallbackResponseId = typeof fallbackJson?.id === "string" ? fallbackJson.id : null;
    const fallbackConversationId = extractConversationId(fallbackJson);
    if (!fallbackText) {
      return {
        text: null,
        error: `openai_empty_text_model:${model}`,
        responseId: fallbackResponseId,
        conversationId: fallbackConversationId,
        usage: extractResponsesUsage(fallbackJson),
      };
    }
    await onTextDelta(fallbackText);
    return {
      text: fallbackText,
      error: null,
      responseId: fallbackResponseId,
      conversationId: fallbackConversationId,
      usage: extractResponsesUsage(fallbackJson),
    };
  }

  if (!response.body) {
    const fallbackJson = await response.json().catch(() => null);
    const fallbackText = extractResponsesText(fallbackJson);
    const fallbackResponseId = typeof fallbackJson?.id === "string" ? fallbackJson.id : null;
    const fallbackConversationId = extractConversationId(fallbackJson);
    if (!fallbackText) {
      return {
        text: null,
        error: `openai_empty_text_model:${model}`,
        responseId: fallbackResponseId,
        conversationId: fallbackConversationId,
        usage: extractResponsesUsage(fallbackJson),
      };
    }
    await onTextDelta(fallbackText);
    return {
      text: fallbackText,
      error: null,
      responseId: fallbackResponseId,
      conversationId: fallbackConversationId,
      usage: extractResponsesUsage(fallbackJson),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawText = "";
  let responseId: string | null = null;
  let conversationId: string | null = null;
  let completedResponse: Record<string, unknown> | null = null;
  let lastEventPayload: any = null;
  let streamError: string | null = null;
  let usage: ResponsesUsage | null = null;

  const trackMeta = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (!responseId && typeof node.id === "string") responseId = node.id;
    if (!conversationId) conversationId = extractConversationId(node);
  };

  const handleSseBlock = async (block: string) => {
    if (!block.trim()) return;
    const dataLines = block
      .split(/\r?\n/g)
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) return;
    const dataText = dataLines.join("\n").trim();
    if (!dataText || dataText === "[DONE]") return;

    let event: any = null;
    try {
      event = JSON.parse(dataText);
    } catch {
      return;
    }
    lastEventPayload = event;
    trackMeta(event);
    if (event?.response && typeof event.response === "object") {
      trackMeta(event.response);
      usage = extractResponsesUsage(event.response) ?? usage;
    }
    const eventType = String(event?.type ?? "");
    if (eventType === "response.completed" && event?.response && typeof event.response === "object") {
      completedResponse = event.response as Record<string, unknown>;
      usage = extractResponsesUsage(event.response) ?? usage;
    }
    if (eventType === "error") {
      const errorMessage =
        readStringFromUnknown(event?.error?.message) ||
        readStringFromUnknown(event?.message) ||
        "stream_error";
      streamError = `openai_stream_error_model:${model}_${truncateError(errorMessage)}`;
      return;
    }
    const delta = extractResponsesDelta(event);
    if (!delta) return;
    rawText += delta;
    await onTextDelta(delta);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      while (true) {
        const separatorIndex = buffer.indexOf("\n\n");
        if (separatorIndex < 0) break;
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        await handleSseBlock(block);
      }
    }
    buffer += decoder.decode().replace(/\r\n/g, "\n");
    while (true) {
      const separatorIndex = buffer.indexOf("\n\n");
      if (separatorIndex < 0) break;
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      await handleSseBlock(block);
    }
    if (buffer.trim()) {
      await handleSseBlock(buffer);
    }
  } catch (cause: any) {
    return {
      text: null,
      error: `openai_stream_parse_failed_model:${model}_${truncateError(String(cause?.message ?? cause ?? "unknown_error"))}`,
      responseId,
      conversationId,
      usage,
    };
  }

  if (streamError) {
    return {
      text: null,
      error: streamError,
      responseId,
      conversationId,
      usage,
    };
  }

  const fallbackNode = completedResponse ?? lastEventPayload?.response ?? lastEventPayload ?? null;
  const fallbackText = fallbackNode ? extractResponsesText(fallbackNode) : "";
  const finalText = fallbackText.trim().length >= rawText.trim().length ? fallbackText.trim() : rawText.trim();
  if (!finalText) {
    return {
      text: null,
      error: `openai_empty_text_model:${model}`,
      responseId,
      conversationId,
      usage: usage ?? extractResponsesUsage(fallbackNode),
    };
  }
  return {
    text: finalText,
    error: null,
    responseId,
    conversationId,
    usage: usage ?? extractResponsesUsage(fallbackNode),
  };
}

function isRetryableOpenAIError(error: string) {
  const e = String(error ?? "").toLowerCase();
  if (!e) return false;
  if (e.startsWith("openai_network_")) return true;
  if (e.includes("openai_empty_text_")) return true;
  if (/openai_responses_(408|409|425|429|500|502|503|504)/.test(e)) return true;
  if (/openai_responses_403/.test(e) && /(html|forbidden|proxy|firewall|blocked|access denied|cloudflare)/.test(e)) return true;
  return false;
}

function isReasoningEffortRejected(error: string) {
  const e = String(error ?? "").toLowerCase();
  if (!isBadRequestError(e)) return false;
  return /(reasoning|effort|unsupported value|unsupported parameter|invalid.*reasoning)/i.test(e);
}

function logHybridDiagnostics(args: {
  runtimeMode: MedSafetyRuntimeMode;
  stage: string;
  model: string;
  routeDecision?: MedSafetyRouteDecision | null;
  usage?: ResponsesUsage | null;
  promptChars?: number;
  extra?: Record<string, unknown>;
}) {
  if (args.runtimeMode === "legacy") return;
  try {
    console.info("[MedSafetyHybrid] %s", JSON.stringify({
      runtimeMode: args.runtimeMode,
      stage: args.stage,
      model: args.model,
      routeDecision: args.routeDecision
        ? {
            intent: args.routeDecision.intent,
            risk: args.routeDecision.risk,
            entityClarity: args.routeDecision.entityClarity,
            answerDepth: args.routeDecision.answerDepth,
            needsEscalation: args.routeDecision.needsEscalation,
            needsSbar: args.routeDecision.needsSbar,
            format: args.routeDecision.format,
            source: args.routeDecision.source,
            confidence: args.routeDecision.confidence,
          }
        : null,
      usage: args.usage ?? null,
      promptChars: typeof args.promptChars === "number" ? args.promptChars : null,
      ...(args.extra ?? {}),
    }));
  } catch {
    // ignore logging failures
  }
}

async function sleepWithAbort(ms: number, signal: AbortSignal) {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("aborted"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort);
  });
}

async function callResponsesApi(args: {
  apiKey: string;
  model: string;
  developerPrompt: string;
  userPrompt: string;
  apiBaseUrl: string;
  imageDataUrl?: string;
  previousResponseId?: string;
  conversationId?: string;
  signal: AbortSignal;
  maxOutputTokens: number;
  upstreamTimeoutMs: number;
  verbosity: ResponseVerbosity;
  reasoningEffort: MedSafetyReasoningEffort;
  storeResponses: boolean;
  compatMode?: boolean;
  onTextDelta?: TextDeltaHandler;
}): Promise<ResponsesAttempt> {
  const {
    apiKey,
    model,
    developerPrompt,
    userPrompt,
    apiBaseUrl,
    imageDataUrl,
    previousResponseId,
    conversationId,
    signal,
    maxOutputTokens,
    upstreamTimeoutMs,
    verbosity,
    reasoningEffort,
    storeResponses,
    compatMode,
    onTextDelta,
  } = args;
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl,
    apiKey,
    model,
    scope: "med_safety",
  });
  if (requestConfig.missingCredential) {
    return {
      text: null,
      error: requestConfig.missingCredential,
      responseId: null,
      conversationId: null,
      usage: null,
    };
  }

  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
    });
  }

  const baseInput = [
    {
      role: "developer",
      content: [{ type: "input_text", text: developerPrompt }],
    },
    {
      role: "user",
      content: userContent,
    },
  ];

  const body: Record<string, unknown> = compatMode
    ? {
        model: requestConfig.model,
        input: baseInput,
        max_output_tokens: maxOutputTokens,
      }
    : {
        model: requestConfig.model,
        input: baseInput,
        text: {
          format: { type: "text" as const },
          verbosity,
        },
        reasoning: { effort: reasoningEffort },
        max_output_tokens: maxOutputTokens,
        tools: [],
        store: storeResponses,
      };
  if (onTextDelta && !compatMode) body.stream = true;
  if (previousResponseId) body.previous_response_id = previousResponseId;
  else if (conversationId) body.conversation = conversationId;

  let response: Response;
  let timedOut = false;
  const requestAbort = new AbortController();
  const onParentAbort = () => requestAbort.abort();
  if (signal.aborted) {
    onParentAbort();
  } else {
    signal.addEventListener("abort", onParentAbort);
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    requestAbort.abort();
  }, upstreamTimeoutMs);
  try {
    response = await fetch(requestConfig.requestUrl, {
      method: "POST",
      headers: requestConfig.headers,
      body: JSON.stringify(body),
      signal: requestAbort.signal,
    });
  } catch (cause: any) {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onParentAbort);
    if (timedOut) {
      return {
        text: null,
        error: `openai_timeout_upstream_model:${requestConfig.model}`,
        responseId: null,
        conversationId: null,
        usage: null,
      };
    }
    return {
      text: null,
      error: `openai_network_${truncateError(String(cause?.message ?? cause ?? "fetch_failed"))}`,
      responseId: null,
      conversationId: null,
      usage: null,
    };
  }
  clearTimeout(timeout);
  signal.removeEventListener("abort", onParentAbort);

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      text: null,
      error: `openai_responses_${response.status}_model:${requestConfig.model}_${truncateError(raw || "unknown_error")}`,
      responseId: null,
      conversationId: null,
      usage: null,
    };
  }

  if (onTextDelta) {
    return readResponsesEventStream({
      response,
      model: requestConfig.model,
      onTextDelta,
    });
  }

  const json = await response.json().catch(() => null);
  const text = extractResponsesText(json);
  const responseId = typeof json?.id === "string" ? json.id : null;
  const conversationResponseId = extractConversationId(json);
  if (!text) {
    return {
      text: null,
      error: `openai_empty_text_model:${requestConfig.model}`,
      responseId,
      conversationId: conversationResponseId,
      usage: extractResponsesUsage(json),
    };
  }
  return { text, error: null, responseId, conversationId: conversationResponseId, usage: extractResponsesUsage(json) };
}

async function callResponsesApiWithRetry(
  args: Parameters<typeof callResponsesApi>[0] & {
    retries: number;
    retryBaseMs: number;
  }
): Promise<ResponsesAttempt> {
  const { retries, retryBaseMs, ...rest } = args;
  let attempt = 0;
  let last: ResponsesAttempt = { text: null, error: "openai_request_failed", responseId: null, conversationId: null, usage: null };

  while (attempt <= retries) {
    last = await callResponsesApi(rest);
    if (!last.error) return last;
    if (!isRetryableOpenAIError(last.error) || attempt >= retries) return last;

    const backoff = Math.min(5000, retryBaseMs * (attempt + 1)) + Math.floor(Math.random() * 250);
    try {
      await sleepWithAbort(backoff, rest.signal);
    } catch {
      return {
        text: null,
        error: "openai_timeout_retry_aborted",
        responseId: null,
        conversationId: null,
        usage: null,
      };
    }
    attempt += 1;
  }

  return last;
}

async function generateAnswerWithPrompt(args: {
  apiKey: string;
  model: string;
  developerPrompt: string;
  userPrompt: string;
  apiBaseUrl: string;
  imageDataUrl?: string;
  previousResponseId?: string;
  conversationId?: string;
  signal: AbortSignal;
  upstreamTimeoutMs: number;
  storeResponses: boolean;
  profile: MedSafetyPromptProfile;
  onTextDelta?: TextDeltaHandler;
  allowStreaming?: boolean;
  networkRetries: number;
  networkRetryBaseMs: number;
}): Promise<{
  answerText: string | null;
  responseId: string | null;
  conversationId: string | null;
  usage: ResponsesUsage | null;
  stage: string;
  streamed: boolean;
  reasoningEffort: MedSafetyReasoningEffort;
  maxOutputTokens: number;
  error: string | null;
}> {
  const reasoningEfforts = args.profile.reasoningEfforts;
  const outputTokenCandidates = args.profile.outputTokenCandidates;

  reasoningLoop: for (let reasoningIndex = 0; reasoningIndex < reasoningEfforts.length; reasoningIndex += 1) {
    const reasoningEffort = reasoningEfforts[reasoningIndex]!;
    tokenLoop: for (let tokenIndex = 0; tokenIndex < outputTokenCandidates.length; tokenIndex += 1) {
      const outputTokenLimit = outputTokenCandidates[tokenIndex]!;
      const allowStreamDelta =
        Boolean(args.allowStreaming) && Boolean(args.onTextDelta) && reasoningIndex === 0 && tokenIndex === 0;

      const attempt = await callResponsesApiWithRetry({
        apiKey: args.apiKey,
        model: args.model,
        developerPrompt: args.developerPrompt,
        userPrompt: args.userPrompt,
        apiBaseUrl: args.apiBaseUrl,
        imageDataUrl: args.imageDataUrl,
        previousResponseId: args.previousResponseId,
        conversationId: args.conversationId,
        signal: args.signal,
        maxOutputTokens: outputTokenLimit,
        upstreamTimeoutMs: args.upstreamTimeoutMs,
        verbosity: args.profile.verbosity,
        reasoningEffort,
        storeResponses: args.storeResponses,
        onTextDelta: allowStreamDelta ? args.onTextDelta : undefined,
        retries: allowStreamDelta ? 0 : args.networkRetries,
        retryBaseMs: args.networkRetryBaseMs,
      });
      if (!attempt.error && attempt.text) {
        return {
          answerText: attempt.text,
          responseId: attempt.responseId,
          conversationId: attempt.conversationId,
          usage: attempt.usage,
          stage: "main",
          streamed: allowStreamDelta,
          reasoningEffort,
          maxOutputTokens: outputTokenLimit,
          error: null,
        };
      }
      if (attempt.error) {
        if (isReasoningEffortRejected(attempt.error)) {
          if (reasoningIndex + 1 < reasoningEfforts.length) continue reasoningLoop;
          return {
            answerText: null,
            responseId: attempt.responseId,
            conversationId: attempt.conversationId,
            usage: attempt.usage,
            stage: "main",
            streamed: false,
            reasoningEffort,
            maxOutputTokens: outputTokenLimit,
            error: attempt.error,
          };
        }
        if (isBadRequestError(attempt.error) && tokenIndex === 0) {
          const statelessRetry = await callResponsesApi({
            apiKey: args.apiKey,
            model: args.model,
            developerPrompt: args.developerPrompt,
            userPrompt: args.userPrompt,
            apiBaseUrl: args.apiBaseUrl,
            imageDataUrl: args.imageDataUrl,
            signal: args.signal,
            maxOutputTokens: outputTokenLimit,
            upstreamTimeoutMs: args.upstreamTimeoutMs,
            verbosity: args.profile.verbosity,
            reasoningEffort,
            storeResponses: args.storeResponses,
            compatMode: true,
          });
          if (!statelessRetry.error && statelessRetry.text) {
            return {
              answerText: statelessRetry.text,
              responseId: statelessRetry.responseId,
              conversationId: statelessRetry.conversationId,
              usage: statelessRetry.usage,
              stage: "main_compat",
              streamed: false,
              reasoningEffort,
              maxOutputTokens: outputTokenLimit,
              error: null,
            };
          }
          if (isTokenLimitError(statelessRetry.error ?? "")) continue tokenLoop;
          if (isReasoningEffortRejected(statelessRetry.error ?? "") && reasoningIndex + 1 < reasoningEfforts.length) {
            continue reasoningLoop;
          }
          return {
            answerText: null,
            responseId: statelessRetry.responseId,
            conversationId: statelessRetry.conversationId,
            usage: sumUsages(attempt.usage, statelessRetry.usage),
            stage: "main_compat",
            streamed: false,
            reasoningEffort,
            maxOutputTokens: outputTokenLimit,
            error: statelessRetry.error ?? attempt.error,
          };
        }
        if (isTokenLimitError(attempt.error)) continue tokenLoop;
        return {
          answerText: null,
          responseId: attempt.responseId,
          conversationId: attempt.conversationId,
          usage: attempt.usage,
          stage: "main",
          streamed: false,
          reasoningEffort,
          maxOutputTokens: outputTokenLimit,
          error: attempt.error,
        };
      }
    }
  }

  return {
    answerText: null,
    responseId: null,
    conversationId: null,
    usage: null,
    stage: "main",
    streamed: false,
    reasoningEffort: args.profile.reasoningEfforts[0] ?? "medium",
    maxOutputTokens: args.profile.outputTokenCandidates[0] ?? 1200,
    error: "openai_empty_text",
  };
}

function buildFallbackAnswer(query: string, locale: "ko" | "en", note: string) {
  const safeQuery = normalizeText(query) || (locale === "en" ? "your question" : "질문 내용");
  const issue = locale === "en" ? describeFallbackIssueEn(note) : describeFallbackIssueKo(note);
  if (locale === "en") {
    return [
      "A full AI answer could not be completed, so a conservative safety fallback is shown.",
      `- Status: ${issue}`,
      `- Question: ${safeQuery}`,
      "- If there is immediate risk, stop the action and follow local escalation protocol right away.",
      "- If the issue depends on a medication name, device name, dosage, rate, or setting, verify the exact target and ask again.",
      "- The final authority is local protocol, clinician order, pharmacy review, and manufacturer IFU.",
    ].join("\n");
  }
  return [
    "AI 응답이 끝까지 완료되지 않아 보수적인 안전 안내만 표시합니다.",
    `- 상태: ${issue}`,
    `- 질문: ${safeQuery}`,
    "- 즉시 위험 가능성이 있으면 처치를 멈추고 기관 프로토콜에 따라 바로 보고/호출해 주세요.",
    "- 약물명, 기구명, 용량, 속도, 세팅값처럼 대상 확인이 필요한 경우 정확한 명칭을 확인한 뒤 다시 질문해 주세요.",
    "- 최종 기준은 기관 프로토콜, 의사 지시, 약제부 확인, 제조사 IFU입니다.",
  ].join("\n");
}

function describeFallbackIssueKo(note: string) {
  const normalized = String(note ?? "").toLowerCase();
  if (!normalized) return "일시적인 처리 문제로 전체 답변을 완료하지 못했습니다.";
  if (normalized.includes("missing_openai_api_key")) return "AI 연결 설정을 확인해야 합니다.";
  if (normalized.includes("openai_timeout_total_budget") || normalized.includes("translate_timeout_total_budget")) {
    return "응답 시간이 길어 처리 제한 시간을 넘었습니다.";
  }
  if (normalized.includes("openai_timeout_upstream")) return "AI 서버 응답이 지연되었습니다.";
  if (normalized.includes("openai_timeout_retry_aborted")) return "재시도 중 요청이 중단되었습니다.";
  if (normalized.startsWith("openai_network_")) return "네트워크 또는 업스트림 연결 문제가 있었습니다.";
  if (normalized.includes("openai_stream_parse_failed")) return "AI 응답 스트림을 끝까지 읽지 못했습니다.";
  if (normalized.includes("openai_empty_text")) return "AI 응답 본문이 비어 있었습니다.";
  if (normalized.includes("openai_responses_429")) return "AI 요청 한도가 초과되었습니다.";
  if (normalized.includes("openai_responses_401")) return "AI 계정 인증 상태를 확인해야 합니다.";
  if (normalized.includes("openai_responses_403")) return "AI 모델 접근 권한 또는 연결 상태를 확인해야 합니다.";
  if (normalized.includes("openai_responses_404")) return "요청한 AI 모델 또는 경로를 찾지 못했습니다.";
  if (/openai_responses_(500|502|503|504)/.test(normalized)) return "AI 서버에 일시적인 장애가 있었습니다.";
  if (normalized.includes("openai_responses_400")) return "요청 형식 또는 대화 상태 문제로 답변이 중단되었습니다.";
  return "일시적인 처리 문제로 전체 답변을 완료하지 못했습니다.";
}

function describeFallbackIssueEn(note: string) {
  const normalized = String(note ?? "").toLowerCase();
  if (!normalized) return "A temporary processing issue prevented the full answer.";
  if (normalized.includes("missing_openai_api_key")) return "The AI connection configuration needs to be checked.";
  if (normalized.includes("openai_timeout_total_budget") || normalized.includes("translate_timeout_total_budget")) {
    return "The response exceeded the processing time budget.";
  }
  if (normalized.includes("openai_timeout_upstream")) return "The upstream AI service timed out.";
  if (normalized.includes("openai_timeout_retry_aborted")) return "The request stopped while retrying.";
  if (normalized.startsWith("openai_network_")) return "There was a network or upstream connection issue.";
  if (normalized.includes("openai_stream_parse_failed")) return "The AI response stream could not be read completely.";
  if (normalized.includes("openai_empty_text")) return "The AI response body was empty.";
  if (normalized.includes("openai_responses_429")) return "The AI request limit was reached.";
  if (normalized.includes("openai_responses_401")) return "The AI account authentication needs to be checked.";
  if (normalized.includes("openai_responses_403")) return "Model access or upstream connectivity needs to be checked.";
  if (normalized.includes("openai_responses_404")) return "The requested model or endpoint was not found.";
  if (/openai_responses_(500|502|503|504)/.test(normalized)) return "The AI service had a temporary server error.";
  if (normalized.includes("openai_responses_400")) return "The request format or conversation state caused the answer to stop.";
  return "A temporary processing issue prevented the full answer.";
}

function buildAnalyzeResult(query: string, answer: string): MedSafetyAnalysisResult {
  return {
    answer: sanitizeAnswerText(answer),
    query: normalizeText(query),
  };
}

export async function translateMedSafetyToEnglish(input: {
  answer: string;
  rawText: string;
  model?: string | null;
  signal: AbortSignal;
}): Promise<{
  result: MedSafetyAnalysisResult;
  rawText: string;
  model: string | null;
  debug: string | null;
}> {
  const sourceText = sanitizeAnswerText(input.answer || input.rawText);
  if (!sourceText) {
    return {
      result: {
        answer: "",
        query: "",
      },
      rawText: "",
      model: input.model ?? resolveModelCandidates()[0] ?? null,
      debug: "translate_empty_source",
    };
  }

  const apiKey = normalizeApiKey();
  const modelCandidates = resolveModelCandidates(input.model ?? null);
  const apiBaseUrls = resolveApiBaseUrls();
  const maxOutputTokens = Math.max(1800, Math.min(5000, resolveMaxOutputTokens() + 1000));
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
  const networkRetries = resolveNetworkRetryCount();
  const networkRetryBaseMs = resolveNetworkRetryBaseMs();
  const totalBudgetMs = Math.max(resolveTranslateTotalBudgetMs(), Math.min(180_000, upstreamTimeoutMs + 30_000));
  const startedAt = Date.now();

  let lastError = "openai_translate_failed";
  let selectedModel: string | null = modelCandidates[0] ?? null;

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    if (Date.now() - startedAt > totalBudgetMs) throw new Error("openai_translate_timeout_total_budget");
    const model = modelCandidates[modelIndex]!;
    selectedModel = model;
    for (let baseIndex = 0; baseIndex < apiBaseUrls.length; baseIndex += 1) {
      if (Date.now() - startedAt > totalBudgetMs) throw new Error("openai_translate_timeout_total_budget");
      const apiBaseUrl = apiBaseUrls[baseIndex]!;
      const remainingMs = totalBudgetMs - (Date.now() - startedAt);
      const timeoutForAttempt = Math.max(4_000, Math.min(upstreamTimeoutMs, remainingMs - 250));
      if (!Number.isFinite(timeoutForAttempt) || timeoutForAttempt < 4_000) {
        throw new Error("openai_translate_timeout_total_budget");
      }
      const attempt = await callResponsesApiWithRetry({
        apiKey,
        model,
        developerPrompt:
          "Translate the nurse-facing clinical answer into natural bedside clinical English. Return plain text only. Preserve bullets, warnings, names, numbers, units, and uncertainty.",
        userPrompt: sourceText,
        apiBaseUrl,
        signal: input.signal,
        maxOutputTokens,
        upstreamTimeoutMs: timeoutForAttempt,
        verbosity: "medium",
        reasoningEffort: "medium",
        storeResponses: false,
        retries: networkRetries,
        retryBaseMs: networkRetryBaseMs,
      });
      if (!attempt.error && attempt.text) {
        const translated = sanitizeAnswerText(attempt.text);
        return {
          result: {
            answer: translated,
            query: "",
          },
          rawText: translated,
          model,
          debug: null,
        };
      }
      lastError = attempt.error ?? "openai_translate_failed";
    }
  }

  throw new Error(lastError);
}

function isPremiumSearchModel(model: string | null | undefined) {
  return String(model ?? "").trim().toLowerCase() === "gpt-5.4";
}

async function resolveRouteDecision(args: {
  runtimeMode: MedSafetyRuntimeMode;
  query: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  signal: AbortSignal;
  upstreamTimeoutMs: number;
  networkRetries: number;
  networkRetryBaseMs: number;
}): Promise<{ decision: MedSafetyRouteDecision; usage: ResponsesUsage | null }> {
  const deterministic = buildDeterministicRouteDecision({
    query: args.query,
    locale: args.locale,
    imageDataUrl: args.imageDataUrl,
  });
  if (args.runtimeMode === "legacy") {
    return { decision: deterministic, usage: null };
  }
  if (
    !shouldUseTinyRouter(
      {
        query: args.query,
        locale: args.locale,
        imageDataUrl: args.imageDataUrl,
      },
      deterministic
    )
  ) {
    return { decision: deterministic, usage: null };
  }

  const attempt = await callResponsesApiWithRetry({
    apiKey: args.apiKey,
    model: args.model,
    developerPrompt: buildTinyRouterDeveloperPrompt(args.locale),
    userPrompt: buildTinyRouterUserPrompt({
      query: args.query,
      locale: args.locale,
      imageDataUrl: args.imageDataUrl,
    }),
    apiBaseUrl: args.apiBaseUrl,
    signal: args.signal,
    maxOutputTokens: 120,
    upstreamTimeoutMs: Math.max(20_000, Math.min(args.upstreamTimeoutMs, 45_000)),
    verbosity: "low",
    reasoningEffort: "low",
    storeResponses: false,
    retries: args.networkRetries,
    retryBaseMs: args.networkRetryBaseMs,
  });
  if (!attempt.error && attempt.text) {
    return {
      decision: parseTinyRouterDecision(attempt.text, deterministic),
      usage: attempt.usage,
    };
  }
  return {
    decision: buildShadowFallbackDecision(deterministic, {
      imageDataUrl: args.imageDataUrl,
      error: attempt.error,
    }),
    usage: attempt.usage,
  };
}

async function runQualityGateAndRepair(args: {
  query: string;
  locale: "ko" | "en";
  answer: string;
  decision: MedSafetyRouteDecision;
  promptAssembly?: MedSafetyPromptAssembly | null;
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  signal: AbortSignal;
  upstreamTimeoutMs: number;
  networkRetries: number;
  networkRetryBaseMs: number;
  profile: MedSafetyPromptProfile;
  hasImage: boolean;
  isPremiumSearch: boolean;
  allowRepair: boolean;
}): Promise<{
  answer: string;
  gateDecision: MedSafetyQualityDecision | null;
  gateUsage: ResponsesUsage | null;
  repairUsage: ResponsesUsage | null;
  totalUsage: ResponsesUsage | null;
  repaired: boolean;
}> {
  const heuristicDecision = buildHeuristicQualityDecision(args.answer, args.decision);
  const shouldCallModelGate = shouldRunQualityGate({
    decision: args.decision,
    isPremiumSearch: args.isPremiumSearch,
    hasImage: args.hasImage,
    answer: args.answer,
  });

  let gateUsage: ResponsesUsage | null = null;
  let modelDecision: MedSafetyQualityDecision | null = null;
  if (shouldCallModelGate) {
    const gateAttempt = await callResponsesApiWithRetry({
      apiKey: args.apiKey,
      model: args.model,
      developerPrompt: buildQualityGateDeveloperPrompt(),
      userPrompt: buildQualityGateUserPrompt({
        query: args.query,
        answer: args.answer,
        locale: args.locale,
        decision: args.decision,
        promptAssembly: args.promptAssembly ?? null,
      }),
      apiBaseUrl: args.apiBaseUrl,
      signal: args.signal,
      maxOutputTokens: 220,
      upstreamTimeoutMs: Math.max(20_000, Math.min(args.upstreamTimeoutMs, 45_000)),
      verbosity: "low",
      reasoningEffort: args.isPremiumSearch ? "medium" : "low",
      storeResponses: false,
      retries: args.networkRetries,
      retryBaseMs: args.networkRetryBaseMs,
    });
    gateUsage = gateAttempt.usage;
    if (!gateAttempt.error && gateAttempt.text) {
      modelDecision = parseQualityGateDecision(gateAttempt.text);
    }
  }

  const finalGateDecision = mergeQualityDecisions(heuristicDecision, modelDecision);
  if (finalGateDecision.verdict === "pass" || !args.allowRepair) {
    return {
      answer: args.answer,
      gateDecision: finalGateDecision,
      gateUsage,
      repairUsage: null,
      totalUsage: gateUsage,
      repaired: false,
    };
  }

  let repairAttempt: ResponsesAttempt = {
    text: null,
    error: "repair_not_attempted",
    responseId: null,
    conversationId: null,
    usage: null,
  };
  for (let reasoningIndex = 0; reasoningIndex < args.profile.reasoningEfforts.length; reasoningIndex += 1) {
    const reasoningEffort = args.profile.reasoningEfforts[reasoningIndex] ?? "medium";
    repairAttempt = await callResponsesApiWithRetry({
      apiKey: args.apiKey,
      model: args.model,
      developerPrompt: buildRepairDeveloperPrompt(args.locale),
      userPrompt: buildRepairUserPrompt({
        query: args.query,
        answer: args.answer,
        locale: args.locale,
        decision: args.decision,
        repairInstructions: finalGateDecision.repairInstructions,
        promptAssembly: args.promptAssembly ?? null,
      }),
      apiBaseUrl: args.apiBaseUrl,
      signal: args.signal,
      maxOutputTokens: args.profile.outputTokenCandidates[0] ?? 1200,
      upstreamTimeoutMs: args.upstreamTimeoutMs,
      verbosity: args.profile.verbosity,
      reasoningEffort,
      storeResponses: false,
      retries: args.networkRetries,
      retryBaseMs: args.networkRetryBaseMs,
    });
    if (!repairAttempt.error && repairAttempt.text) {
      return {
        answer: sanitizeAnswerText(repairAttempt.text),
        gateDecision: finalGateDecision,
        gateUsage,
        repairUsage: repairAttempt.usage,
        totalUsage: sumUsages(gateUsage, repairAttempt.usage),
        repaired: true,
      };
    }
    if (!isReasoningEffortRejected(repairAttempt.error ?? "") || reasoningIndex + 1 >= args.profile.reasoningEfforts.length) {
      break;
    }
  }

  return {
    answer: args.answer,
    gateDecision: finalGateDecision,
    gateUsage,
    repairUsage: repairAttempt.usage,
    totalUsage: sumUsages(gateUsage, repairAttempt.usage),
    repaired: false,
  };
}

export async function analyzeMedSafetyWithOpenAI(params: AnalyzeParams): Promise<OpenAIMedSafetyOutput> {
  const apiKey = normalizeApiKey();
  const runtimeMode = resolveMedSafetyRuntimeMode();
  const modelCandidates = resolveModelCandidates(params.modelOverride);
  const apiBaseUrls = resolveApiBaseUrls();
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
  const totalBudgetMs = Math.max(resolveTotalBudgetMs(), Math.min(900_000, upstreamTimeoutMs + 120_000));
  const networkRetries = resolveNetworkRetryCount();
  const networkRetryBaseMs = resolveNetworkRetryBaseMs();
  const storeResponses = resolveStoreResponses();
  const legacyDeveloperPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt(params.query, params.locale);
  const memoryAwareUserPrompt = buildUserPromptWithContinuationMemory(userPrompt, params.continuationMemory, params.locale);
  const startedAt = Date.now();

  let selectedModel = modelCandidates[0] ?? MED_SAFETY_LOCKED_MODEL;
  let lastError = "openai_request_failed";
  let lastRouteDecision: MedSafetyRouteDecision | null = null;

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    if (Date.now() - startedAt > totalBudgetMs) {
      lastError = "openai_timeout_total_budget";
      break;
    }
    const candidateModel = modelCandidates[modelIndex]!;
    selectedModel = candidateModel;
    for (let baseIndex = 0; baseIndex < apiBaseUrls.length; baseIndex += 1) {
      if (Date.now() - startedAt > totalBudgetMs) {
        lastError = "openai_timeout_total_budget";
        break;
      }
      const apiBaseUrl = apiBaseUrls[baseIndex]!;
      const useContinuationState = modelIndex === 0 && baseIndex === 0;
      const previousResponseId = useContinuationState ? params.previousResponseId : undefined;
      const conversationId = useContinuationState ? params.conversationId : undefined;
      const shouldUseContinuationIds = Boolean(previousResponseId || conversationId);
      const isPremiumSearch = isPremiumSearchModel(candidateModel);
      let routeDecision: MedSafetyRouteDecision;
      let routeUsage: ResponsesUsage | null = null;
      let promptProfile: MedSafetyPromptProfile = {
        ...buildDefaultPromptProfile(),
      };
      const resolvedRoute = await resolveRouteDecision({
        runtimeMode,
        query: params.query,
        locale: params.locale,
        imageDataUrl: params.imageDataUrl,
        apiKey,
        model: candidateModel,
        apiBaseUrl,
        signal: params.signal,
        upstreamTimeoutMs,
        networkRetries,
        networkRetryBaseMs,
      });
      routeDecision = resolvedRoute.decision;
      routeUsage = resolvedRoute.usage;
      lastRouteDecision = routeDecision;
      promptProfile = buildPromptProfile({
        decision: routeDecision,
        model: candidateModel,
        isPremiumSearch,
        hasImage: Boolean(params.imageDataUrl),
      });
      const promptAssembly = assembleMedSafetyDeveloperPrompt(routeDecision, params.locale, {
        runtimeMode,
        hasImage: Boolean(params.imageDataUrl),
        query: params.query,
      });
      const mainDeveloperPrompt = runtimeMode === "hybrid_live" ? promptAssembly.developerPrompt : legacyDeveloperPrompt;
      const shouldSuppressStreamingForQuality =
        runtimeMode === "hybrid_live" &&
        shouldRunQualityGate({
          decision: routeDecision,
          isPremiumSearch,
          hasImage: Boolean(params.imageDataUrl),
        });
      const allowStreaming =
        Boolean(params.onTextDelta) &&
        modelIndex === 0 &&
        baseIndex === 0 &&
        !shouldSuppressStreamingForQuality;

      logHybridDiagnostics({
        runtimeMode,
        stage: "router",
        model: candidateModel,
        routeDecision,
        usage: routeUsage,
        promptChars: mainDeveloperPrompt.length,
        extra: {
          mainPromptMode: runtimeMode === "hybrid_live" ? "behavioral_contract_v2" : "legacy_monolithic",
          actualPromptChars: mainDeveloperPrompt.length,
          tokenCandidates: promptProfile.outputTokenCandidates.join(","),
          reasoningEfforts: promptProfile.reasoningEfforts.join(","),
          ...buildPromptDisciplineDiagnostics(routeDecision, promptProfile, promptAssembly),
        },
      });
      const primaryUserPrompt = shouldUseContinuationIds ? userPrompt : memoryAwareUserPrompt;
      const mainAttempt = await generateAnswerWithPrompt({
        apiKey,
        model: candidateModel,
        developerPrompt: mainDeveloperPrompt,
        userPrompt: primaryUserPrompt,
        apiBaseUrl,
        imageDataUrl: params.imageDataUrl,
        previousResponseId,
        conversationId,
        signal: params.signal,
        upstreamTimeoutMs,
        storeResponses,
        profile: promptProfile,
        onTextDelta: allowStreaming ? params.onTextDelta : undefined,
        allowStreaming,
        networkRetries,
        networkRetryBaseMs,
      });
      if (mainAttempt.error || !mainAttempt.answerText) {
        lastError = mainAttempt.error ?? "openai_empty_text";
        continue;
      }

      let finalAnswer = sanitizeAnswerText(mainAttempt.answerText);
      let gateUsage: ResponsesUsage | null = null;
      let repairUsage: ResponsesUsage | null = null;
      let shadowComparison: MedSafetyShadowComparison | null = null;

      logHybridDiagnostics({
        runtimeMode,
        stage: mainAttempt.stage,
        model: candidateModel,
        routeDecision,
        usage: sumUsages(routeUsage, mainAttempt.usage),
        promptChars: mainDeveloperPrompt.length,
        extra: {
          streamed: mainAttempt.streamed,
          reasoningEffort: mainAttempt.reasoningEffort,
          maxOutputTokens: mainAttempt.maxOutputTokens,
          mainPromptMode: runtimeMode === "hybrid_live" ? "behavioral_contract_v2" : "legacy_monolithic",
          ...buildPromptDisciplineDiagnostics(routeDecision, promptProfile, promptAssembly),
        },
      });

      if (runtimeMode === "hybrid_live") {
        const quality = await runQualityGateAndRepair({
          query: params.query,
          locale: params.locale,
          answer: finalAnswer,
          decision: routeDecision,
          promptAssembly,
          apiKey,
          model: candidateModel,
          apiBaseUrl,
          signal: params.signal,
          upstreamTimeoutMs,
          networkRetries,
          networkRetryBaseMs,
          profile: promptProfile,
          hasImage: Boolean(params.imageDataUrl),
          isPremiumSearch,
          allowRepair: !mainAttempt.streamed,
        });
        finalAnswer = sanitizeAnswerText(quality.answer);
        gateUsage = quality.gateUsage;
        repairUsage = quality.repairUsage;
        logHybridDiagnostics({
          runtimeMode,
          stage: "quality_gate",
          model: candidateModel,
          routeDecision,
          usage: quality.totalUsage,
          promptChars: mainDeveloperPrompt.length,
          extra: {
            verdict: quality.gateDecision?.verdict ?? "not_run",
            repaired: quality.repaired,
            allowRepair: !mainAttempt.streamed,
            repairReason: quality.gateDecision?.repairInstructions ? truncateError(quality.gateDecision.repairInstructions, 320) : null,
            ...buildPromptDisciplineDiagnostics(routeDecision, promptProfile, promptAssembly),
          },
        });
      } else if (runtimeMode === "hybrid_shadow") {
        const hybridAttempt = await generateAnswerWithPrompt({
          apiKey,
          model: candidateModel,
          developerPrompt: promptAssembly.developerPrompt,
          userPrompt: primaryUserPrompt,
          apiBaseUrl,
          imageDataUrl: params.imageDataUrl,
          previousResponseId,
          conversationId,
          signal: params.signal,
          upstreamTimeoutMs,
          storeResponses: false,
          profile: promptProfile,
          allowStreaming: false,
          networkRetries,
          networkRetryBaseMs,
        });
        const hybridAnswer = hybridAttempt.answerText ? sanitizeAnswerText(hybridAttempt.answerText) : null;
        const hybridHeuristic = hybridAnswer ? buildHeuristicQualityDecision(hybridAnswer, routeDecision) : null;
        const pairwiseQualityFlags: string[] = [];
        const verbosityFlags: string[] = [];
        if (!hybridAnswer) {
          pairwiseQualityFlags.push("hybrid_failed");
        } else {
          if (hybridHeuristic?.verdict === "repair_required") pairwiseQualityFlags.push("hybrid_requires_repair");
          if (hybridHeuristic?.verdict === "pass_but_verbose") pairwiseQualityFlags.push("hybrid_verbose");
          if (normalizeText(hybridAnswer).length > normalizeText(finalAnswer).length) {
            pairwiseQualityFlags.push("hybrid_longer_than_legacy");
            verbosityFlags.push("more_chars_than_legacy");
          }
          if (countVisibleAnswerLines(hybridAnswer) > countVisibleAnswerLines(finalAnswer)) {
            verbosityFlags.push("more_lines_than_legacy");
          }
          if ((hybridAttempt.usage?.reasoningTokens ?? 0) > 0) {
            pairwiseQualityFlags.push("hybrid_reasoning_tokens_present");
          }
        }
        shadowComparison = {
          legacyAnswer: finalAnswer,
          hybridAnswer,
          legacyUsage: mainAttempt.usage,
          hybridUsage: hybridAttempt.usage,
          heuristicVerdict: hybridHeuristic?.verdict ?? "hybrid_failed",
          heuristicRepairInstructions: hybridHeuristic?.repairInstructions ?? truncateError(hybridAttempt.error ?? "", 220),
          pairwiseQualityFlags,
          verbosityFlags,
          overlong: Boolean(hybridHeuristic?.repairInstructions.includes("overlong_answer")),
          selectedContracts: promptAssembly.selectedContractIds,
        };
        logHybridDiagnostics({
          runtimeMode,
          stage: "shadow_compare",
          model: candidateModel,
          routeDecision,
          usage: sumUsages(routeUsage, mainAttempt.usage, hybridAttempt.usage),
          promptChars: promptAssembly.finalPromptChars,
          extra: {
            legacyPromptChars: legacyDeveloperPrompt.length,
            hybridPromptChars: promptAssembly.finalPromptChars,
            heuristicVerdict: shadowComparison.heuristicVerdict,
            heuristicRepairInstructions: shadowComparison.heuristicRepairInstructions,
            pairwiseQualityFlags: shadowComparison.pairwiseQualityFlags,
            verbosityFlags: shadowComparison.verbosityFlags,
            selectedContracts: promptAssembly.selectedContractIds,
          },
        });
      }

      const result = buildAnalyzeResult(params.query, finalAnswer);
      return {
        result,
        model: candidateModel,
        rawText: result.answer,
        fallbackReason: null,
        openaiResponseId: mainAttempt.responseId,
        openaiConversationId: mainAttempt.conversationId,
        routeDecision,
        runtimeMode,
        usageBreakdown: buildUsageBreakdown({
          runtimeMode,
          routeDecision,
          routerUsage: routeUsage,
          mainUsage: mainAttempt.usage,
          gateUsage,
          repairUsage,
          answer: result.answer,
          assembledPromptChars: mainDeveloperPrompt.length,
          selectedContracts: runtimeMode === "legacy" ? [] : promptAssembly.selectedContractIds,
        }),
        shadowComparison,
      };
    }
  }

  const fallbackAnswer = buildFallbackAnswer(params.query, params.locale, lastError);
  return {
    result: buildAnalyzeResult(params.query, fallbackAnswer),
    model: selectedModel,
    rawText: fallbackAnswer,
    fallbackReason: lastError,
    openaiResponseId: null,
    openaiConversationId: null,
    routeDecision: lastRouteDecision,
    runtimeMode,
    usageBreakdown: buildUsageBreakdown({
      runtimeMode,
      routeDecision: lastRouteDecision,
      answer: fallbackAnswer,
      selectedContracts: [],
    }),
    shadowComparison: null,
  };
}
