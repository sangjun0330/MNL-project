export type MedSafetyItemType = "medication" | "device" | "unknown";
export type MedSafetyQuickStatus = "OK" | "CHECK" | "STOP";
export type ClinicalMode = "ward" | "er" | "icu";
export type ClinicalSituation = "general" | "pre_admin" | "during_admin" | "event_response";
export type QueryIntent = "medication" | "device" | "scenario";

export type MedSafetyAnalysisResult = {
  resultKind: "medication" | "device" | "scenario";
  notFound?: boolean;
  notFoundReason?: string;
  oneLineConclusion: string;
  riskLevel: "low" | "medium" | "high";
  item: {
    name: string;
    type: MedSafetyItemType;
    aliases: string[];
    highRiskBadges: string[];
    primaryUse: string;
    confidence: number;
  };
  quick: {
    status: MedSafetyQuickStatus;
    topActions: string[];
    topNumbers: string[];
    topRisks: string[];
  };
  do: {
    steps: string[];
    calculatorsNeeded: string[];
    compatibilityChecks: string[];
  };
  safety: {
    holdRules: string[];
    monitor: string[];
    escalateWhen: string[];
  };
  institutionalChecks: string[];
  sbar: {
    situation: string;
    background: string;
    assessment: string;
    recommendation: string;
  };
  patientScript20s: string;
  modePriority: string[];
  confidenceNote: string;
  searchAnswer?: string;
  suggestedNames?: string[];
};

type AnalyzeParams = {
  query: string;
  mode: ClinicalMode;
  situation: ClinicalSituation;
  queryIntent?: QueryIntent;
  patientSummary?: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
  imageName?: string;
  previousResponseId?: string;
  conversationId?: string;
  onTextDelta?: (delta: string) => void | Promise<void>;
  signal: AbortSignal;
};

type ResponsesAttempt = {
  text: string | null;
  error: string | null;
  responseId: string | null;
  conversationId: string | null;
};

type TextDeltaHandler = (delta: string) => void | Promise<void>;

type ResponseVerbosity = "low" | "medium" | "high";
const MED_SAFETY_LOCKED_MODEL = "gpt-5.1";

export type OpenAIMedSafetyOutput = {
  result: MedSafetyAnalysisResult;
  model: string;
  rawText: string;
  fallbackReason: string | null;
  openaiResponseId: string | null;
  openaiConversationId: string | null;
};

function normalizeApiKey() {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.OPENAI_API_TOKEN ??
    process.env.OPENAI_SECRET_KEY ??
    process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
    "";
  return String(key).trim();
}

function splitModelList(raw: string) {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeModels(models: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const model of models) {
    const key = model.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(model);
  }
  return out;
}

function resolveModelCandidates() {
  // User request: med-safety search must use a single fixed model only.
  // Do not allow preferred/env fallback model switching here.
  return [MED_SAFETY_LOCKED_MODEL];
}

function normalizeApiBaseUrl(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function resolveApiBaseUrls() {
  const listFromEnv = splitModelList(process.env.OPENAI_MED_SAFETY_BASE_URLS ?? "").map((item) => normalizeApiBaseUrl(item));
  const single = normalizeApiBaseUrl(
    process.env.OPENAI_MED_SAFETY_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  );
  const defaults = ["https://api.openai.com/v1"];
  return dedupeModels([...listFromEnv, single, ...defaults]).filter(Boolean);
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
  // Med safety는 글로벌 토큰 제한(OPENAI_MAX_OUTPUT_TOKENS)과 분리해서 관리한다.
  // 글로벌 값이 3200으로 고정된 환경에서도 이 엔드포인트는 더 길게 출력 가능해야 한다.
  const raw = Number(process.env.OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS ?? 7000);
  if (!Number.isFinite(raw)) return 7000;
  const rounded = Math.round(raw);
  return Math.max(1800, Math.min(20000, rounded));
}

function buildOutputTokenCandidates(maxOutputTokens: number, intent: QueryIntent) {
  const requested = Math.max(1200, Math.round(maxOutputTokens));
  const steps =
    intent === "scenario"
      ? [requested, 3800, 3200, 2800, 2400, 2000, 1800]
      : [requested, 3200, 2800, 2400, 2000, 1600, 1400];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of steps) {
    const value = Math.max(intent === "scenario" ? 1600 : 1200, Math.min(requested, Math.round(raw)));
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= 5) break;
  }
  return out.length ? out : [requested];
}

function resolveNetworkRetryCount() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRIES ?? 1);
  if (!Number.isFinite(raw)) return 1;
  const rounded = Math.round(raw);
  return Math.max(0, Math.min(5, rounded));
}

function resolveNetworkRetryBaseMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRY_BASE_MS ?? 700);
  if (!Number.isFinite(raw)) return 700;
  const rounded = Math.round(raw);
  return Math.max(200, Math.min(4000, rounded));
}

function resolveUpstreamTimeoutMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS ?? 120_000);
  if (!Number.isFinite(raw)) return 120_000;
  const rounded = Math.round(raw);
  return Math.max(90_000, Math.min(300_000, rounded));
}

function resolveTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS ?? 420_000);
  if (!Number.isFinite(raw)) return 420_000;
  const rounded = Math.round(raw);
  return Math.max(300_000, Math.min(900_000, rounded));
}

function resolveTranslateTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TRANSLATE_BUDGET_MS ?? 90_000);
  if (!Number.isFinite(raw)) return 90_000;
  const rounded = Math.round(raw);
  return Math.max(30_000, Math.min(180_000, rounded));
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

function isContinuationStateError(error: string) {
  return /(previous_response|conversation)/i.test(String(error ?? ""));
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

function cleanLine(value: string) {
  const base = normalizeText(value)
    .replace(/^[-*•·]\s*/, "")
    .replace(/^\d+[).]\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";

  // "섹션명: 내용" 형태는 섹션명 접두어만 제거하고,
  // "섹션명:" 단독 헤더 라인은 유지해서 클라이언트가 카드 분할에 사용하도록 한다.
  const sectionPrefixed = base.match(
    /^(핵심 요약|주요 행동|핵심 확인|실행 포인트|위험\/에스컬레이션|라인\/호환\/상호작용|환자 교육 포인트|실수 방지 포인트|이 약이 무엇인지\(정의\/분류\/역할\)|언제 쓰는지\(적응증\/사용 맥락\)|어떻게 주는지\(경로\/투여 방식\/원칙\)|반드시 확인할 금기\/주의 Top 3|반드시 모니터할 것 Top 3|위험 신호\/즉시 대응|기구 정의\/언제 쓰는지|준비물\/셋업\/사용 절차|정상 작동 기준|알람\/트러블슈팅|합병증\/Stop rules|유지관리|실수 방지)\s*[:：]\s*(.+)$/i
  );
  if (sectionPrefixed?.[2]) {
    return sectionPrefixed[2].replace(/\s+/g, " ").trim();
  }
  return base;
}

function sanitizeSearchAnswer(text: string) {
  const replaced = normalizeText(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");

  const lines = replaced
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) continue;
    if (seen.has(key) && line.length > 12) continue;
    if (out.length) {
      const prev = out[out.length - 1]
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
      if (prev && (key.includes(prev) || prev.includes(key)) && Math.min(prev.length, key.length) > 24) {
        continue;
      }
    }
    seen.add(key);
    out.push(line);
  }
  return out.join("\n");
}

function dedupeLimit(items: string[], limit: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const clean = cleanLine(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function modeLabel(mode: ClinicalMode, locale: "ko" | "en") {
  if (locale === "en") {
    if (mode === "ward") return "Ward";
    if (mode === "er") return "ER";
    return "ICU";
  }
  if (mode === "ward") return "병동";
  if (mode === "er") return "ER";
  return "ICU";
}

function situationLabel(situation: ClinicalSituation, locale: "ko" | "en") {
  if (locale === "en") {
    if (situation === "general") return "General";
    if (situation === "pre_admin") return "Pre-administration";
    if (situation === "during_admin") return "During administration";
    return "Alarm/event response";
  }
  if (situation === "general") return "일반";
  if (situation === "pre_admin") return "투여 전";
  if (situation === "during_admin") return "투여 중";
  return "이상/알람 대응";
}

function departmentFromMode(mode: ClinicalMode) {
  if (mode === "icu") return "ICU";
  if (mode === "er") return "ER";
  return "WARD";
}

function inferIntent(params: Pick<AnalyzeParams, "query" | "queryIntent" | "situation">): QueryIntent {
  if (params.queryIntent === "medication" || params.queryIntent === "device" || params.queryIntent === "scenario") {
    return params.queryIntent;
  }
  if (params.situation !== "general") return "scenario";
  const q = String(params.query ?? "").toLowerCase();
  if (/pump|카테터|기구|장비|ventilator|모니터|occlusion|라인|필터|stopcock|클램프/.test(q)) return "device";
  if (/약|투여|약물|mg|mcg|mEq|IU|항생제|진정제|진통제|항응고|바소프레서/.test(q)) return "medication";
  return "scenario";
}

function buildDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "ko") {
    return [
      "너는 간호사를 위한 임상 검색엔진 AI다.",
      "목표: 현장에서 즉시 실행 가능한 안전 중심 지시를, 높은 정보 밀도로, 중복 없이 제공한다.",
      "절대 사실을 지어내지 마라. 불확실하면 임상 세부를 생성하지 않는다.",
      "",
      "[판단 플로우]",
      "1) 약물/의료기구 질의는 '정확 식별'을 먼저 수행한다.",
      "2) 정확 식별 실패 시 NOT_FOUND 블록만 출력하고 종료한다.",
      "3) 정확 식별 성공 시 정식명칭으로 정규화하고, 지정된 섹션 순서로만 출력한다.",
      "",
      "[출력 규칙]",
      "- 섹션 순서/제목/필수 항목을 바꾸지 않는다.",
      "- 숫자/용량/속도/주기처럼 기관차가 큰 정보는 단정하지 말고 '기관 프로토콜/약제부/IFU 확인 필요'로 표기한다.",
      "- 같은 의미를 반복하지 않는다. 각 불릿은 새 정보여야 한다.",
      "- 각 문장은 짧고 명확하며 행동 가능해야 한다.",
      "- 마크다운 장식(##, **, 코드블록) 없이 일반 텍스트로 출력한다.",
      "",
      "[안전 경계]",
      "- 진단/처방 결정을 대체하지 않는다.",
      "- 최종 기준은 기관 프로토콜·의사 지시·제조사 IFU다.",
    ].join("\n");
  }
  return [
    "You are a clinical search engine AI for bedside nurses.",
    "Goal: deliver bedside-actionable, safety-first guidance with high information density and zero fluff.",
    "Never fabricate facts. If uncertain, do not generate clinical details.",
    "For medication/device queries: verify exact identity first. If not verified, output NOT_FOUND block only.",
    "If verified, normalize to canonical official name and follow required section order exactly.",
    "For institution-dependent values, mark 'check local protocol/pharmacy/IFU'.",
    "No repetition. No markdown ornaments. Plain text only.",
    "Do not replace diagnosis or prescribing decisions.",
  ].join("\n");
}

function buildMedicationPrompt(query: string, contextJson: string) {
  return [
    "아래 FLOW와 OUTPUT CONTRACT를 정확히 지켜 약물 답변을 작성하라.",
    "",
    "[FLOW]",
    "1) 입력 약물명(오타/약어 포함)의 정확 식별 여부를 먼저 판단한다.",
    "2) 정확 식별 실패 시 NOT_FOUND 블록만 출력하고 즉시 종료한다.",
    "3) 정확 식별 성공 시 ENTITY 헤더 3줄 + 본문 9개 섹션을 순서대로 출력한다.",
    "",
    "[NOT_FOUND 출력 형식 - 고정]",
    "NOT_FOUND",
    "입력명: <원문 질의>",
    "CANDIDATES: <정확한 후보명1>; <정확한 후보명2>; <정확한 후보명3> (없으면 NONE)",
    "판정: 정확히 일치하는 약물을 확인하지 못했습니다.",
    "요청: 정확한 공식명(성분명/제품명)을 다시 입력해 주세요.",
    "주의: NOT_FOUND에서는 임상 내용(적응증/용량/주의/모니터링)을 절대 생성하지 마라.",
    "",
    "[정확 식별 성공 시 헤더 - 고정]",
    "ENTITY_VERIFIED: YES",
    "ENTITY_NAME: <정식명칭 1개, 괄호/쉼표 설명 금지, 짧은 이름만>",
    "ENTITY_ALIASES: <대표 별칭/동의어 1~3개; 세미콜론 구분, 없으면 NONE>",
    "",
    "[본문 OUTPUT CONTRACT - 아래 9개 섹션 순서 고정]",
    "규칙: 섹션당 2~3개 불릿, 각 불릿은 '행동 + 이유/위험 + 확인포인트'를 포함한 1문장.",
    "규칙: 섹션 제목을 불릿 문장에 반복하지 말 것.",
    "규칙: 불확실하거나 기관 차이 큰 내용은 반드시 '기관 프로토콜/약제부/IFU 확인 필요' 표기.",
    "",
    "이 약이 무엇인지(정의/분류/역할):",
    "- 정의/분류(예: 항생제/항응고/진정/바소프레서 등) 1줄",
    "- 핵심 역할(무엇을 위해 쓰는지) 1줄",
    "- 작용 특성(주요 기전 또는 효과 발현 시간대) 1~2문장",
    "",
    "언제 쓰는지(적응증/사용 맥락):",
    "- 대표 적응증 1~3개",
    "- 병동/ER/ICU 사용 목적 차이 포인트가 있으면 부서별 1줄",
    "",
    "어떻게 주는지(경로/투여 방식/원칙):",
    "- 경로(PO/IV/IM/SC/흡입/패치 등)",
    "- IV push 가능/불가/주의 + 이유",
    "- 희석/농도/속도/시간은 대표 원칙만 제시",
    "- 기관 차이가 크면 '기관 프로토콜/약제부 확인 필요' + 확인 포인트(희석액/최대속도/필터/차광)",
    "- 준비(필터/차광/프라이밍/flush) 및 라인 요구(말초/중심) 원칙",
    "",
    "반드시 확인할 금기/주의 Top 3:",
    "- 환자 상태 기반 금기/주의 Top 3",
    "- 최소 확인 데이터: 알레르기/활력/의식 + 약물군별 핵심 lab/ECG 1~2개",
    "- High-alert/LASA 여부가 있으면 강하게 표시",
    "",
    "반드시 모니터할 것 Top 3:",
    "- 상황별 우선 활력징후(BP/MAP, HR, RR/SpO2, 의식)",
    "- 약물군별 핵심 Labs/ECG 1~2개",
    "- 기대 효과 + 위험 부작용 신호",
    "- 재평가 타이밍(5/15/30/60분 중 적절값)",
    "",
    "위험 신호/즉시 대응:",
    "- 진짜 위험 신호 2~3개",
    "- 즉시 행동: 중단/보류 → ABC → 모니터 강화 → 보고",
    "- 길항제/응급약은 '준비/의사 보고' 수준으로만 언급",
    "",
    "라인/호환/상호작용:",
    "- Y-site/혼합 금지/전용 라인 필요 원칙",
    "- 치명적 상호작용 Top 2~3",
    "- 라인 혼동, clamp, stopcock 방향 실수 방지 포인트",
    "",
    "환자 교육 포인트:",
    "- 20초 설명 스크립트(왜/정상 반응/바로 말할 증상)",
    "- teach-back 질문 1개",
    "",
    "실수 방지 포인트:",
    "- 최소 2개 이상",
    "- 예: mg↔mcg/IU/mEq 단위 혼동, 농도 착각, LASA, 과속 주입, 라인 혼합, flush 누락, 알람 무시, 기록 누락",
    "",
    "[품질 루브릭]",
    "- 최우선 행동이 상단에 와야 한다.",
    "- 위험 신호와 즉시 대응이 모호하지 않아야 한다.",
    "- 중복/장황/교과서식 일반론을 제거한다.",
    "- 전체는 간결하되 임상적으로 충분히 깊어야 한다.",
    "- 일반 텍스트만 사용(##, **, ``` 금지).",
    "",
    "질문:",
    query || "(없음)",
    "",
    "맥락:",
    contextJson,
  ].join("\n");
}

function buildDevicePrompt(query: string, contextJson: string) {
  return [
    "아래 FLOW와 OUTPUT CONTRACT를 정확히 지켜 의료기구 답변을 작성하라.",
    "",
    "[FLOW]",
    "1) 입력 기구명(오타/약어 포함)의 정확 식별 여부를 먼저 판단한다.",
    "2) 정확 식별 실패 시 NOT_FOUND 블록만 출력하고 즉시 종료한다.",
    "3) 정확 식별 성공 시 ENTITY 헤더 3줄 + 본문 7개 섹션을 순서대로 출력한다.",
    "",
    "[NOT_FOUND 출력 형식 - 고정]",
    "NOT_FOUND",
    "입력명: <원문 질의>",
    "CANDIDATES: <정확한 후보명1>; <정확한 후보명2>; <정확한 후보명3> (없으면 NONE)",
    "판정: 정확히 일치하는 의료기구를 확인하지 못했습니다.",
    "요청: 정확한 공식명(제품명/기구명)을 다시 입력해 주세요.",
    "주의: NOT_FOUND에서는 임상 내용(사용법/알람/합병증/경고)을 절대 생성하지 마라.",
    "",
    "[정확 식별 성공 시 헤더 - 고정]",
    "ENTITY_VERIFIED: YES",
    "ENTITY_NAME: <정식명칭 1개, 괄호/쉼표 설명 금지, 짧은 이름만>",
    "ENTITY_ALIASES: <대표 별칭/동의어 1~3개; 세미콜론 구분, 없으면 NONE>",
    "",
    "[본문 OUTPUT CONTRACT - 아래 7개 섹션 순서 고정]",
    "규칙: 섹션당 2~3개 불릿, 각 불릿은 '행동 + 이유/위험 + 확인포인트'를 포함한 1문장.",
    "규칙: 섹션 제목을 불릿 문장에 반복하지 말 것.",
    "규칙: 교체/점검 주기 등 기관차 큰 내용은 반드시 '기관/IFU 확인 필요' 표기.",
    "",
    "기구 정의/언제 쓰는지:",
    "- 정의 1줄(무엇을 하는 기구인지)",
    "- 적응증 2~3개",
    "- 가능하면 핵심 금기/주의 1~2개",
    "",
    "준비물/셋업/사용 절차:",
    "- 필수 구성품 체크리스트",
    "- Setup 6~12단계: 연결 → 프라이밍/공기 제거 → 고정 → 설정값 입력 → 시작 → 초기 확인",
    "- 환자 적용 전 안전 확인(연결/clamp/라인 방향/공기/소모품 적합성)",
    "",
    "정상 작동 기준:",
    "- 정상 시 보이는 상태/징후 2~3개",
    "- 시작 후 1~5분 내 반드시 확인할 포인트",
    "",
    "알람/트러블슈팅:",
    "- 알람 의미",
    "- 원인 후보 Top 3",
    "- 먼저 확인할 것 Top 3(clamp/꺾임/연결/필터/위치/배터리)",
    "- 해결 행동 Top 3",
    "- 해결 안 되면 보고/교체/대체 루트/전문팀 호출 기준",
    "",
    "합병증/Stop rules:",
    "- 합병증 Top 3~5(감염/막힘/누출/출혈/탈락/공기유입 등)",
    "- 즉시 중단·호출해야 할 위험 신호 2~3개",
    "",
    "유지관리:",
    "- 관찰 포인트(피부/고정/누출/통증/감염징후)",
    "- 교체·점검 주기는 '기관/IFU 확인 필요' 표기",
    "- 기록 포인트(시각/세팅/환자 반응/문제/조치)",
    "",
    "실수 방지 포인트:",
    "- 최소 2개 이상",
    "- 예: clamp/stopcock 방향 실수, 라인 연결 누락, 프라이밍 미흡, 공기 제거 누락, 소모품 호환 착오, 알람 무시",
    "",
    "[품질 루브릭]",
    "- 알람 대응은 의미→먼저 볼 것→해결→보고 순서가 명확해야 한다.",
    "- Stop rule은 즉시 행동이 모호하지 않아야 한다.",
    "- 중복/장황/교과서식 일반론을 제거한다.",
    "- 전체는 간결하되 임상적으로 충분히 깊어야 한다.",
    "- 일반 텍스트만 사용(##, **, ``` 금지).",
    "",
    "질문:",
    query || "(없음)",
    "",
    "맥락:",
    contextJson,
  ].join("\n");
}

function buildScenarioPrompt(query: string, contextJson: string) {
  return [
    "상황 질문에 대해 질문 자체에 직접 답하라.",
    "입력 해석 규칙: '질문'은 현재 어떤 상황인지(상황 설명), '맥락.patient_summary'는 추가 참고사항이다.",
    "답변 작성 시 현재 상황을 최우선으로 판단하고, 추가 참고사항은 우선순위/분기 판단에만 반영하라.",
    "형식은 자유이되, 불필요한 배경 설명은 줄이고 핵심 행동 중심으로 정돈된 답변을 작성하라.",
    "출력 규칙: 마크다운 기호(##, ###, **, ---, ``` )를 쓰지 말고 일반 텍스트로만 작성하라.",
    "중복 문장/중복 단락을 반복하지 말고, 모바일 화면에서 읽기 쉽게 짧은 문장과 불릿 위주로 작성하라.",
    "항목은 한 줄 한 문장으로 작성하고, 각 항목은 가능한 '-' 불릿으로 시작하라.",
    "각 불릿은 반드시 완결 문장으로 끝내고, 문장 조각(반문장)만 남기지 마라.",
    "섹션 제목은 '핵심 판단:', '지금 할 일:', '확인할 수치/관찰:', '원인 후보:', '중단/호출 기준:', '보고 문구:' 형태를 우선 사용하라.",
    "너무 짧게 요약하지 말고 임상적으로 필요한 맥락은 유지하라.",
    "질문과 직접 관련된 내용만 남기고 일반론·교과서식 장문 설명은 생략하라.",
    "권장 구성: 핵심 판단, 지금 할 일(즉시), 확인할 수치/관찰, 가능한 원인 Top 3, 조정/분기, 중단·호출 기준, 보고 문구.",
    "각 구성은 2~3개 핵심 포인트로 정리하라.",
    "전체 길이는 대략 18~32줄 내외로 작성하라.",
    "불확실한 부분은 단정하지 말고 '기관 확인 필요'를 짧게 표기하라.",
    "마지막에는 현장에서 바로 읽을 수 있는 짧은 보고 문구(SBAR 형태) 2~3문장을 포함하라.",
    "질문:",
    query || "(없음)",
    "",
    "맥락:",
    contextJson,
  ].join("\n");
}

function buildUserPrompt(params: AnalyzeParams, intent: QueryIntent) {
  const context = JSON.stringify(
    {
      mode: modeLabel(params.mode, params.locale),
      department: departmentFromMode(params.mode),
      situation: situationLabel(params.situation, params.locale),
      query_intent: intent,
      patient_summary: params.patientSummary || "(없음)",
      image_name: params.imageName || "(없음)",
    },
    null,
    2
  );
  if (intent === "medication") return buildMedicationPrompt(params.query, context);
  if (intent === "device") return buildDevicePrompt(params.query, context);
  return buildScenarioPrompt(params.query, context);
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

  // Legacy chat-completions style
  appendFromTextLike(json?.choices?.[0]?.message?.content);
  // Top-level Responses style
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

  // Some providers wrap message content separately
  const messageContent = Array.isArray(json?.message?.content) ? json.message.content : [];
  for (const part of messageContent) {
    appendFromTextLike(part?.text);
    appendFromTextLike(part?.output_text);
    appendFromTextLike(part?.transcript);
    appendFromTextLike(part);
  }

  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function hasEntityControlMarkers(text: string) {
  const t = String(text ?? "");
  return (
    /ENTITY_VERIFIED\s*[:=：]/i.test(t) ||
    /(ENTITY_NAME|OFFICIAL_NAME|CANONICAL_NAME|정식명칭|공식명)\s*[:=：]/i.test(t) ||
    /(ENTITY_ALIASES|ALIASES|별칭)\s*[:=：]/i.test(t)
  );
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

function extractResponsesDelta(event: any): string {
  const eventType = String(event?.type ?? "");
  if (!eventType || !eventType.includes("delta")) return "";

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
      };
    }
    await onTextDelta(fallbackText);
    return {
      text: fallbackText,
      error: null,
      responseId: fallbackResponseId,
      conversationId: fallbackConversationId,
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
      };
    }
    await onTextDelta(fallbackText);
    return {
      text: fallbackText,
      error: null,
      responseId: fallbackResponseId,
      conversationId: fallbackConversationId,
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

  const trackMeta = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (!responseId && typeof node.id === "string") responseId = node.id;
    if (!conversationId) {
      conversationId = extractConversationId(node);
    }
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
    }
    const eventType = String(event?.type ?? "");
    if (eventType === "response.completed" && event?.response && typeof event.response === "object") {
      completedResponse = event.response as Record<string, unknown>;
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
    };
  }

  if (streamError) {
    return {
      text: null,
      error: streamError,
      responseId,
      conversationId,
    };
  }

  const fallbackNode = completedResponse ?? lastEventPayload?.response ?? lastEventPayload ?? null;
  const fallbackText = fallbackNode ? extractResponsesText(fallbackNode) : "";
  const rawNormalized = rawText.trim();
  const fallbackNormalized = fallbackText.trim();
  const rawHasMarkers = hasEntityControlMarkers(rawNormalized);
  const fallbackHasMarkers = hasEntityControlMarkers(fallbackNormalized);
  let finalText = rawNormalized;
  if (fallbackNormalized) {
    if (!rawNormalized) {
      finalText = fallbackNormalized;
    } else if (fallbackHasMarkers && !rawHasMarkers) {
      // 실시간 delta 조합본에 제어 라인이 누락된 경우 완료 응답 본문을 우선한다.
      finalText = fallbackNormalized;
    } else if (fallbackNormalized.length >= rawNormalized.length) {
      // 더 완전한 본문(대개 response.completed)을 우선 사용한다.
      finalText = fallbackNormalized;
    }
  }
  if (!finalText) {
    return {
      text: null,
      error: `openai_empty_text_model:${model}`,
      responseId,
      conversationId,
    };
  }
  return {
    text: finalText,
    error: null,
    responseId,
    conversationId,
  };
}

function isRetryableOpenAIError(error: string) {
  const e = String(error ?? "").toLowerCase();
  if (!e) return false;
  if (e.startsWith("openai_network_")) return true;
  if (e.includes("openai_empty_text_")) return true;
  if (/openai_responses_(408|409|425|429|500|502|503|504)/.test(e)) return true;
  // 일부 병원 Wi-Fi/프록시가 OpenAI 응답을 403 HTML로 반환하는 케이스를 재시도 대상으로 포함
  if (/openai_responses_403/.test(e) && /(html|forbidden|proxy|firewall|blocked|access denied|cloudflare)/.test(e)) return true;
  return false;
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
    storeResponses,
    compatMode,
    onTextDelta,
  } = args;

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
        // 400/게이트웨이 호환 이슈를 피하기 위한 최소 요청 바디
        model,
        input: baseInput,
        max_output_tokens: maxOutputTokens,
      }
    : {
        model,
        input: baseInput,
        text: {
          format: { type: "text" as const },
          verbosity,
        },
        reasoning: { effort: "medium" as const },
        max_output_tokens: maxOutputTokens,
        tools: [],
        store: storeResponses,
      };
  if (onTextDelta && !compatMode) body.stream = true;
  // conversation state는 동시에 2개 키를 보내지 않고 하나만 사용한다.
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
    response = await fetch(`${apiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: requestAbort.signal,
    });
  } catch (cause: any) {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onParentAbort);
    if (timedOut) {
      return {
        text: null,
        error: `openai_timeout_upstream_model:${model}`,
        responseId: null,
        conversationId: null,
      };
    }
    return {
      text: null,
      error: `openai_network_${truncateError(String(cause?.message ?? cause ?? "fetch_failed"))}`,
      responseId: null,
      conversationId: null,
    };
  }
  clearTimeout(timeout);
  signal.removeEventListener("abort", onParentAbort);

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      text: null,
      error: `openai_responses_${response.status}_model:${model}_${truncateError(raw || "unknown_error")}`,
      responseId: null,
      conversationId: null,
    };
  }

  if (onTextDelta) {
    return readResponsesEventStream({
      response,
      model,
      onTextDelta,
    });
  }

  const json = await response.json().catch(() => null);
  const text = extractResponsesText(json);
  const responseId = typeof json?.id === "string" ? json.id : null;
  const conversationResponseId = extractConversationId(json);
  if (!text) {
    return { text: null, error: `openai_empty_text_model:${model}`, responseId, conversationId: conversationResponseId };
  }
  return { text, error: null, responseId, conversationId: conversationResponseId };
}

async function callResponsesApiWithRetry(
  args: Parameters<typeof callResponsesApi>[0] & {
    retries: number;
    retryBaseMs: number;
  }
): Promise<ResponsesAttempt> {
  const { retries, retryBaseMs, ...rest } = args;
  let attempt = 0;
  let last: ResponsesAttempt = { text: null, error: "openai_request_failed", responseId: null, conversationId: null };

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
      };
    }
    attempt += 1;
  }

  return last;
}

function extractBullets(text: string) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim());
  return lines
    .map((line) => {
      const hit = line.match(/^(?:[-*•·]|\d+[).])\s+(.+)$/);
      if (hit?.[1]) return cleanLine(hit[1]);
      return "";
    })
    .filter(Boolean);
}

function extractSentences(text: string) {
  const flat = normalizeText(text).replace(/\n+/g, " ");
  const chunks = flat
    .split(/(?<=[.!?]|다\.|요\.)\s+/)
    .map((line) => cleanLine(line))
    .filter(Boolean);
  return chunks;
}

function pickLinesByPattern(text: string, pattern: RegExp, limit: number) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .filter((line) => pattern.test(line));
  return dedupeLimit(lines, limit);
}

function detectStatus(text: string): MedSafetyQuickStatus {
  const t = text.toLowerCase();
  if (/\b(stop|중단|즉시 중단|투여 금지|사용 금지)\b/i.test(t)) return "STOP";
  if (/\b(hold|check|보류|확인 후|재확인)\b/i.test(t)) return "CHECK";
  if (/\b(go|가능|진행 가능)\b/i.test(t)) return "OK";
  return "CHECK";
}

function detectRiskLevel(text: string, status: MedSafetyQuickStatus): "low" | "medium" | "high" {
  if (status === "STOP") return "high";
  const t = text.toLowerCase();
  if (/(고위험|위험도 높음|critical|life[- ]threatening|응급)/i.test(t)) return "high";
  if (/(주의|위험|monitor closely|careful)/i.test(t)) return "medium";
  if (status === "OK") return "low";
  return "medium";
}

function buildSbar(text: string) {
  const s = text.match(/(?:^|\n)\s*S\s*[:：]\s*(.+)/i)?.[1] ?? "";
  const b = text.match(/(?:^|\n)\s*B\s*[:：]\s*(.+)/i)?.[1] ?? "";
  const a = text.match(/(?:^|\n)\s*A\s*[:：]\s*(.+)/i)?.[1] ?? "";
  const r = text.match(/(?:^|\n)\s*R\s*[:：]\s*(.+)/i)?.[1] ?? "";
  const sent = extractSentences(text);
  return {
    situation: cleanLine(s) || sent[0] || "현재 핵심 상황 전달",
    background: cleanLine(b) || sent[1] || "관련 배경/최근 변화 전달",
    assessment: cleanLine(a) || sent[2] || "현재 평가 소견 전달",
    recommendation: cleanLine(r) || sent[3] || "요청/다음 조치 전달",
  };
}

function detectItemType(intent: QueryIntent, text: string): MedSafetyItemType {
  if (intent === "medication") return "medication";
  if (intent === "device") return "device";
  const t = text.toLowerCase();
  if (/pump|카테터|기구|장비|monitor|ventilator|line|필터/.test(t)) return "device";
  if (/약물|투여|약|dose|mg|mcg|mEq|IU|항생제|진정제|진통제/.test(t)) return "medication";
  return "unknown";
}

type CanonicalEntity = {
  canonical: string;
  aliases: string[];
};

const MEDICATION_CANONICAL_ENTITIES: CanonicalEntity[] = [
  { canonical: "노르에피네프린", aliases: ["노르피네프린", "norepinephrine", "noradrenaline", "levarterenol"] },
  { canonical: "에피네프린", aliases: ["epinephrine", "adrenaline"] },
  { canonical: "아세틸콜린", aliases: ["acetylcholine", "아세틸톨린", "아세칠콜린", "acetilcholine"] },
  { canonical: "도파민", aliases: ["dopamine"] },
  { canonical: "도부타민", aliases: ["dobutamine"] },
  { canonical: "바소프레신", aliases: ["vasopressin"] },
  { canonical: "페닐에프린", aliases: ["phenylephrine"] },
  { canonical: "헤파린", aliases: ["heparin"] },
  { canonical: "와파린", aliases: ["warfarin"] },
  { canonical: "푸로세미드", aliases: ["furosemide", "lasix"] },
  { canonical: "반코마이신", aliases: ["vancomycin"] },
  { canonical: "피페라실린/타조박탐", aliases: ["piperacillin/tazobactam", "zosyn"] },
  { canonical: "세프트리악손", aliases: ["ceftriaxone"] },
  { canonical: "아미오다론", aliases: ["amiodarone"] },
  { canonical: "아데노신", aliases: ["adenosine"] },
  { canonical: "레귤러 인슐린", aliases: ["insulin regular", "regular insulin"] },
  { canonical: "글라진 인슐린", aliases: ["insulin glargine", "glargine"] },
  { canonical: "프로포폴", aliases: ["propofol"] },
  { canonical: "미다졸람", aliases: ["midazolam"] },
  { canonical: "펜타닐", aliases: ["fentanyl"] },
  { canonical: "모르핀", aliases: ["morphine"] },
];

const DEVICE_CANONICAL_ENTITIES: CanonicalEntity[] = [
  { canonical: "인퓨전 펌프", aliases: ["infusion pump", "iv infusion pump"] },
  { canonical: "시린지 펌프", aliases: ["syringe pump"] },
  { canonical: "펜타닐 PCA 펌프", aliases: ["fentanyl pca pump", "pca pump"] },
  { canonical: "유치도뇨관", aliases: ["foley catheter", "urinary catheter", "폴리 카테터"] },
  { canonical: "중심정맥관", aliases: ["central line", "cvc"] },
  { canonical: "PICC 라인", aliases: ["picc", "picc line"] },
  { canonical: "동맥 라인", aliases: ["arterial line", "a-line"] },
  { canonical: "삼방콕", aliases: ["three-way stopcock", "stopcock"] },
  { canonical: "연장 세트", aliases: ["extension set"] },
  { canonical: "혈액투석 카테터", aliases: ["hemodialysis catheter"] },
  { canonical: "비재호흡 마스크", aliases: ["non-rebreather mask", "nrb mask"] },
  { canonical: "앰부백", aliases: ["ambu bag", "bag valve mask", "bvm"] },
  { canonical: "인공호흡기", aliases: ["ventilator"] },
  { canonical: "바이레벨 PAP", aliases: ["bi-level pap", "bipap"] },
  { canonical: "고유량 비강 캐뉼라", aliases: ["high-flow nasal cannula", "hfnc"] },
  { canonical: "맥박산소측정기", aliases: ["pulse oximeter", "spo2 monitor"] },
  { canonical: "제세동기", aliases: ["defibrillator"] },
  { canonical: "흡인 카테터", aliases: ["suction catheter"] },
];

function normalizeEntityKey(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9가-힣\s/+\-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEntityCompact(value: string) {
  return normalizeEntityKey(value).replace(/\s+/g, "");
}

function canonicalEntitiesByIntent(intent: QueryIntent) {
  return intent === "device" ? DEVICE_CANONICAL_ENTITIES : MEDICATION_CANONICAL_ENTITIES;
}

function scoreAliasMatch(queryCompact: string, aliasCompact: string) {
  if (!queryCompact || !aliasCompact) return 0;
  if (queryCompact === aliasCompact) return 1;
  if (aliasCompact.includes(queryCompact) || queryCompact.includes(aliasCompact)) return 0.97;
  const distance = levenshteinDistance(queryCompact.slice(0, 40), aliasCompact.slice(0, 40));
  const score = 1 - distance / Math.max(queryCompact.length, aliasCompact.length);
  const prefixPenalty = queryCompact[0] && aliasCompact[0] && queryCompact[0] !== aliasCompact[0] ? 0.08 : 0;
  return score - prefixPenalty;
}

function resolveCanonicalEntityFromQuery(query: string, intent: QueryIntent): CanonicalEntity | null {
  const queryCompact = normalizeEntityCompact(query);
  if (!queryCompact || queryCompact.length < 3) return null;

  const entries = canonicalEntitiesByIntent(intent);
  let best: { entry: CanonicalEntity; score: number } | null = null;

  for (const entry of entries) {
    const aliases = dedupeLimit([entry.canonical, ...entry.aliases], 20);
    let localBest = 0;
    for (const alias of aliases) {
      const aliasCompact = normalizeEntityCompact(alias);
      if (!aliasCompact) continue;
      const score = scoreAliasMatch(queryCompact, aliasCompact);
      if (score > localBest) localBest = score;
    }
    if (!best || localBest > best.score) {
      best = { entry, score: localBest };
    }
  }

  if (!best) return null;
  const threshold = queryCompact.length <= 5 ? 0.9 : 0.82;
  if (best.score < threshold) return null;
  return best.entry;
}

function containsEntityReference(query: string, answer: string, canonicalName?: string | null) {
  const q = normalizeEntityKey(query);
  const canonical = normalizeEntityKey(canonicalName ?? "");
  if (!q) return true;
  const answerNorm = normalizeEntityKey(answer);
  if (!answerNorm) return false;

  const qCompact = q.replace(/\s+/g, "");
  const answerCompact = answerNorm.replace(/\s+/g, "");
  const canonicalCompact = canonical.replace(/\s+/g, "");

  if (q.length >= 3 && answerNorm.includes(q)) return true;
  if (qCompact.length >= 3 && answerCompact.includes(qCompact)) return true;
  if (canonical && answerNorm.includes(canonical)) return true;
  if (canonicalCompact.length >= 3 && answerCompact.includes(canonicalCompact)) return true;
  if (canonical && scoreAliasMatch(qCompact, canonicalCompact) >= 0.82) return true;

  const tokens = q.split(" ").filter((token) => token.length >= 3);
  if (!tokens.length) return true;
  if (tokens.length === 1) {
    return answerNorm.includes(tokens[0]!) || answerCompact.includes(tokens[0]!.replace(/\s+/g, ""));
  }

  const matched = tokens.filter((token) => answerNorm.includes(token) || answerCompact.includes(token)).length;
  return matched >= Math.min(2, tokens.length);
}

function hasNotFoundSignal(text: string) {
  const t = String(text ?? "").toLowerCase();
  return (
    /\bnot_found\b/.test(t) ||
    /(찾을\s*수\s*없|확인하지\s*못|일치하는\s*(약물|기구).*(없|못)|존재하지\s*않)/i.test(t) ||
    /(no\s+exact\s+match|cannot\s+identify|could\s+not\s+identify|not\s+found|unknown\s+medication|unknown\s+device)/i.test(t) ||
    /(정확한\s*(이름|명칭|공식명).*(입력|다시))/i.test(t)
  );
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

function cleanCandidateName(value: string) {
  const clean = String(value ?? "")
    .replace(/^[-*•·]\s*/, "")
    .replace(/^\d+[).]\s*/, "")
    .replace(/^["'`(]+|["'`)]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!clean) return "";
  if (/^(none|없음|없습니다|해당\s*없음|n\/a|null|na)[.!]?$/.test(clean.toLowerCase())) return "";
  if (/^<[^>]+>$/.test(clean)) return "";
  if (/정확한\s*후보명/i.test(clean)) return "";
  if (/candidate\s*name/i.test(clean)) return "";
  return clean;
}

function fallbackSuggestionsFromQuery(query: string, intent: QueryIntent) {
  const queryCompact = normalizeEntityCompact(query);
  if (!queryCompact || queryCompact.length < 3) return [] as string[];

  const entries = canonicalEntitiesByIntent(intent);
  const scored = entries
    .map((entry) => {
      const aliases = dedupeLimit([entry.canonical, ...entry.aliases], 20);
      const score = aliases.reduce((best, alias) => {
        const aliasCompact = normalizeEntityCompact(alias);
        if (!aliasCompact) return best;
        return Math.max(best, scoreAliasMatch(queryCompact, aliasCompact));
      }, 0);
      return { name: entry.canonical, score };
    })
    .filter((row) => row.score >= 0.52)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.name);

  return dedupeLimit(scored, 3);
}

function extractSuggestedNames(rawAnswer: string, query: string, intent: QueryIntent) {
  const lines = String(rawAnswer ?? "")
    .split(/\r?\n/)
    .map((line) => String(line ?? "").trim())
    .filter(Boolean);

  const out: string[] = [];
  let inCandidates = false;

  const push = (value: string) => {
    const clean = cleanCandidateName(value);
    if (!clean) return;
    out.push(clean);
  };

  for (const line of lines) {
    if (
      /^ENTITY_VERIFIED\s*[:=]/i.test(line) ||
      /^NOT_FOUND$/i.test(line) ||
      /^INPUT(_NAME)?\s*[:=]/i.test(line) ||
      /^(ENTITY_NAME|OFFICIAL_NAME|CANONICAL_NAME|정식명칭|공식명)\s*[:=]/i.test(line) ||
      /^(ENTITY_ALIASES|ALIASES|별칭)\s*[:=]/i.test(line)
    ) {
      continue;
    }
    if (/^(CANDIDATES?|MAYBE_MEANT|후보|혹시.*찾으시고\s*계신가요)\s*[:：]?/i.test(line)) {
      inCandidates = true;
      const inline = line.split(/[:：]/).slice(1).join(":").trim();
      if (inline && !/^\(?none\)?$/i.test(inline)) {
        inline
          .split(/[;,]/)
          .map((name) => cleanCandidateName(name))
          .filter(Boolean)
          .forEach((name) => push(name));
      }
      continue;
    }
    if (/^(ACTION|요청|판정|REASON)\s*[:：]?/i.test(line)) {
      inCandidates = false;
      continue;
    }
    if (inCandidates) {
      const bullet = line.match(/^(?:[-*•·]|\d+[).])\s*(.+)$/);
      if (bullet?.[1]) {
        push(bullet[1]);
        continue;
      }
      if (!/^[A-Z_]+[:=]/.test(line)) {
        push(line);
      }
    }
  }

  const uniq = dedupeLimit(out, 3);
  if (uniq.length) return uniq;
  return fallbackSuggestionsFromQuery(query, intent);
}

function parseEntityVerification(text: string): "yes" | "no" | "unknown" {
  const t = String(text ?? "");
  if (/ENTITY_VERIFIED\s*[:=：]\s*YES/i.test(t)) return "yes";
  if (/ENTITY_VERIFIED\s*[:=：]\s*NO/i.test(t)) return "no";
  if (/\bNOT_FOUND\b/i.test(t)) return "no";
  return "unknown";
}

function parseEntityOfficialName(text: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizeOfficial = (value: string) => {
    const clean = cleanLine(value);
    if (!clean || /^none$/i.test(clean)) return "";
    const noParen = clean.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!noParen) return "";
    const maybeShort = noParen.length > 28 && /[,]/.test(noParen) ? noParen.split(",")[0]!.trim() : noParen;
    return maybeShort.slice(0, 48);
  };
  for (const line of lines) {
    const hit = line.match(/^(ENTITY_NAME|OFFICIAL_NAME|CANONICAL_NAME|정식명칭|공식명)\s*[:=：]\s*(.+)$/i);
    if (!hit?.[2]) continue;
    const normalized = normalizeOfficial(hit[2]);
    if (!normalized) continue;
    return normalized;
  }
  return "";
}

function parseEntityAliases(text: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const hit = line.match(/^(ENTITY_ALIASES|ALIASES|별칭)\s*[:=：]\s*(.+)$/i);
    if (!hit?.[2]) continue;
    const value = hit[2].trim();
    if (!value || /^(none|없음)$/i.test(value)) return [] as string[];
    const list = value
      .split(/[;,]/)
      .map((token) => cleanCandidateName(token))
      .filter(Boolean);
    return dedupeLimit(list, 6);
  }
  return [] as string[];
}

function stripEntityControlLines(text: string) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^ENTITY_VERIFIED\s*[:=]/i.test(line))
    .filter((line) => !/^NOT_FOUND$/i.test(line))
    .filter((line) => !/^(ENTITY_NAME|OFFICIAL_NAME|CANONICAL_NAME|정식명칭|공식명)\s*[:=]/i.test(line))
    .filter((line) => !/^(ENTITY_ALIASES|ALIASES|별칭)\s*[:=]/i.test(line))
    .filter((line) => !/^(CANDIDATES?|MAYBE_MEANT)\s*[:=]/i.test(line))
    .filter((line) => !/^(후보|혹시.*찾으시고\s*계신가요)\s*[:：]?/i.test(line))
    .join("\n")
    .trim();
}

function buildNotFoundResult(
  params: AnalyzeParams,
  intent: QueryIntent,
  reason: string,
  suggestedNames: string[]
): MedSafetyAnalysisResult {
  const safeName = cleanLine(params.query || params.imageName || "조회 항목").slice(0, 70) || "조회 항목";
  const ko = params.locale === "ko";
  const isMedication = intent === "medication";
  const itemLabel = ko ? (isMedication ? "약물" : "의료기구") : isMedication ? "medication" : "device";

  return {
    resultKind: intent === "scenario" ? "scenario" : intent,
    notFound: true,
    notFoundReason: reason.slice(0, 120),
    oneLineConclusion: ko
      ? `입력한 "${safeName}"에 대해 정확히 일치하는 ${itemLabel}를 확인하지 못했습니다.`
      : `Could not verify an exact ${itemLabel} match for "${safeName}".`,
    riskLevel: "medium",
    item: {
      name: safeName,
      type: "unknown",
      aliases: [],
      highRiskBadges: [ko ? "정확한 명칭 재확인" : "Recheck exact name"],
      primaryUse: ko
        ? `${itemLabel} 명칭 확인 후 다시 검색이 필요합니다.`
        : `Please verify the exact ${itemLabel} name and search again.`,
      confidence: 10,
    },
    quick: {
      status: "CHECK",
      topActions: ko
        ? [
            `입력하신 명칭: ${safeName}`,
            suggestedNames.length ? "이걸 찾으시고 계신가요?" : "정확한 공식명을 다시 확인해 주세요.",
            ...suggestedNames.map((name, idx) => `${idx + 1}) ${name}`),
            suggestedNames.length
              ? "위 후보 중 정확한 이름 하나를 복사해서 다시 입력해 주세요."
              : "정확한 공식명(성분명/제품명/기구명)을 다시 입력해 주세요.",
            "철자·약어·공백을 확인하고 가능한 경우 full name으로 입력하세요.",
          ]
        : [
            `Entered name: ${safeName}`,
            suggestedNames.length ? "Did you mean one of these?" : "Please verify the exact official name.",
            ...suggestedNames.map((name, idx) => `${idx + 1}) ${name}`),
            suggestedNames.length
              ? "Copy one exact candidate above and search again."
              : "Re-enter the exact official name (generic/product/device name).",
            "Check spelling, abbreviations, and spacing; use full name when possible.",
          ],
      topNumbers: ko ? ["현재 결과는 미확인 명칭 상태입니다."] : ["Current result is based on an unverified name."],
      topRisks: ko
        ? ["존재가 불명확한 항목에 대한 임상 정보는 제공할 수 없습니다."]
        : ["Clinical details are withheld for unverified entities."],
    },
    do: {
      steps: ko
        ? ["정확한 명칭 재입력", "재검색 실행", "여전히 불일치면 공식 자료 확인 후 재시도"]
        : ["Re-enter exact name", "Run search again", "If still unmatched, verify with official source and retry"],
      calculatorsNeeded: [],
      compatibilityChecks: [],
    },
    safety: {
      holdRules: ko
        ? ["정확한 식별 전에는 본 결과를 투약/사용 판단 근거로 사용하지 마세요."]
        : ["Do not use this result for medication/device decisions until identity is verified."],
      monitor: ko ? ["정확한 명칭 확인 후 다시 조회"] : ["Verify exact name, then run search again"],
      escalateWhen: ko ? ["명칭 혼동이 우려되면 즉시 동료와 더블체크"] : ["If name confusion is likely, perform immediate double-check"],
    },
    institutionalChecks: ko
      ? ["기관 프로토콜·약제부 DB·제조사 IFU에서 명칭 확인 필요"]
      : ["Verify naming in local protocol, pharmacy DB, and manufacturer IFU"],
    sbar: ko
      ? {
          situation: `입력명 "${safeName}"의 정확한 ${itemLabel} 식별이 되지 않았습니다.`,
          background: "철자/약어/유사명으로 인해 오인 가능성이 있습니다.",
          assessment: "현재 결과는 미확인 명칭으로 임상 정보 제공을 제한했습니다.",
          recommendation: "정확한 공식명을 확인한 뒤 다시 검색하겠습니다.",
        }
      : {
          situation: `Exact ${itemLabel} identity for "${safeName}" is not verified.`,
          background: "Spelling/abbreviation/look-alike names may cause mismatch.",
          assessment: "Clinical details are restricted due to unverified identity.",
          recommendation: "Please verify the exact official name, then retry.",
        },
    patientScript20s: ko
      ? "입력하신 명칭이 정확히 확인되지 않아 안전을 위해 임상 안내를 제한했습니다. 정확한 이름 확인 후 다시 도와드릴게요."
      : "The entered name is not verified, so clinical guidance is restricted for safety. Please confirm the exact name and retry.",
    modePriority: [],
    confidenceNote: reason.slice(0, 180),
    searchAnswer: "",
    suggestedNames: suggestedNames.slice(0, 3),
  };
}

function buildFallbackResult(params: AnalyzeParams, intent: QueryIntent, note: string): MedSafetyAnalysisResult {
  const safeName = cleanLine(params.query || params.imageName || "조회 항목").slice(0, 50) || "조회 항목";
  return {
    resultKind: intent === "scenario" ? "scenario" : intent,
    notFound: false,
    notFoundReason: "",
    oneLineConclusion: "AI 응답이 불안정해 기본 안내를 표시합니다. 핵심 항목을 다시 확인해 주세요.",
    riskLevel: "medium",
    item: {
      name: safeName,
      type: intent === "scenario" ? "unknown" : intent,
      aliases: [],
      highRiskBadges: ["확인 필요"],
      primaryUse: "간호 현장 안전 확인",
      confidence: 35,
    },
    quick: {
      status: "CHECK",
      topActions: ["처방/오더와 환자 상태를 먼저 재확인", "핵심 활력·라인·알레르기 정보를 먼저 점검", "기준 이탈 시 즉시 보고"],
      topNumbers: ["혈압·맥박·SpO2·의식 최신값", "알레르기/주요 검사값", "라인 및 장비 상태"],
      topRisks: ["정보 부족 상태에서 즉시 진행 시 위험", "단위·농도·속도 혼동", "라인/호환성 미확인"],
    },
    do: {
      steps: ["핵심 정보 재확인", "안전 기준 충족 여부 판단", "필요 시 보류 후 보고"],
      calculatorsNeeded: ["용량/속도 계산이 필요한지 확인"],
      compatibilityChecks: ["라인/혼합/연결 상태 확인"],
    },
    safety: {
      holdRules: ["중요 기준 이탈 또는 증상 악화 시 보류/중단"],
      monitor: ["5-15-30-60분 내 상태 재평가"],
      escalateWhen: ["호흡곤란·저혈압·의식저하·급격한 악화 시 즉시 보고"],
    },
    institutionalChecks: ["기관 프로토콜·약제부·IFU 확인 필요"],
    sbar: {
      situation: "안전 확인이 필요한 상태",
      background: "현재 투여/장비 상황과 최근 변화 요약",
      assessment: "핵심 활력·라인·증상 재평가",
      recommendation: "즉시 조치 후 기준 이탈 시 담당의/당직 보고",
    },
    patientScript20s: "안전을 위해 지금 필요한 수치와 상태를 먼저 확인한 뒤 가장 안전한 방법으로 진행하겠습니다.",
    modePriority: [],
    confidenceNote: note.slice(0, 180),
    searchAnswer: "",
  };
}

function replaceEntityMentionForDisplay(text: string, query: string, canonicalName: string) {
  const source = String(text ?? "");
  const from = cleanLine(query);
  const to = cleanLine(canonicalName);
  if (!source || !from || !to) return source;
  if (normalizeEntityCompact(from) === normalizeEntityCompact(to)) return source;
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = source.replace(new RegExp(escapeRegex(from), "gi"), to);
  const compactFrom = from.replace(/\s+/g, "");
  if (compactFrom.length >= 4 && compactFrom !== from) {
    out = out.replace(new RegExp(escapeRegex(compactFrom), "gi"), to);
  }
  return out;
}

function qualityFallbackTemplates(intent: QueryIntent, locale: "ko" | "en", itemName: string) {
  if (locale === "en") {
    if (intent === "medication") {
      return {
        topActions: [
          `Confirm order, route, unit, and patient before administering ${itemName}.`,
          "Run two-person check for high-alert and look-alike/sound-alike medications.",
          "Set infusion concentration/rate once, then perform reverse-check.",
          "Prioritize first 15-minute reassessment after start/titration.",
        ],
        topNumbers: ["BP/HR/SpO2/mental status baseline", "Key labs/ECG points by medication class", "Current concentration and pump rate"],
        topRisks: ["10x unit error (mg-mcg, units-mL)", "Wrong line/compatibility mismatch", "Delayed response to warning signs"],
        compatibilityChecks: ["Line dedicated/shared policy", "Y-site compatibility and flush sequence", "Pump channel/line tracing double-check"],
        monitor: ["Recheck at 5-15-30-60 minutes", "Document effect and adverse signals", "Escalate on threshold breach"],
        holdRules: ["Hold/stop when severe hypotension, respiratory decline, or acute deterioration occurs"],
        escalateWhen: ["Report immediately when vital signs are unstable or risk signals persist"],
      };
    }
    if (intent === "device") {
      return {
        topActions: [
          `Verify setup sequence and consumables before using ${itemName}.`,
          "Check clamp/stopcock/line direction before start.",
          "Confirm alarm meaning first, then troubleshoot top probable causes.",
          "Escalate promptly when alarm persists after first-line fixes.",
        ],
        topNumbers: ["Initial 1-5 min function check", "Current settings and recent changes", "Patient response trend"],
        topRisks: ["Wrong connection/channel", "Air/occlusion/position issue", "Alarm ignored or delayed"],
        compatibilityChecks: ["Consumable-device compatibility", "Line routing and fixation", "Replacement criteria by IFU/protocol"],
        monitor: ["Frequent reassessment after setting changes", "Skin/line/leak/infection signs", "Record alarm and interventions"],
        holdRules: ["Stop use and switch route/device when severe malfunction or patient risk appears"],
        escalateWhen: ["Call specialist/physician when unresolved critical alarm continues"],
      };
    }
    return {
      topActions: ["Confirm current condition first, then proceed with immediate priorities."],
      topNumbers: ["Latest vitals and trend changes", "Current route/line/device status"],
      topRisks: ["Acting with incomplete data", "Delayed escalation on deterioration"],
      compatibilityChecks: ["Line and setup compatibility check"],
      monitor: ["Reassess at 5-15-30-60 minutes"],
      holdRules: ["Hold/stop when critical deterioration appears"],
      escalateWhen: ["Report immediately when unstable findings persist"],
    };
  }

  if (intent === "medication") {
    return {
      topActions: [
        `${itemName} 투여 전 오더·환자·경로·단위를 먼저 재확인하세요.`,
        "High-alert/LASA 가능성이 있으면 더블체크를 먼저 시행하세요.",
        "농도/속도 설정 후 역산 검산을 반드시 수행하세요.",
        "시작 또는 증량 후 15분 이내 재평가를 우선하세요.",
      ],
      topNumbers: ["혈압·맥박·SpO2·의식 baseline", "약물군별 핵심 검사값/ECG", "현재 농도와 펌프 속도"],
      topRisks: ["mg↔mcg, units↔mL 단위 10배 오류", "라인/혼합 호환성 미확인", "경고 신호 지연 대응"],
      compatibilityChecks: ["전용라인 필요 여부", "Y-site/혼합 가능 여부", "채널/라인 tracing 더블체크"],
      monitor: ["5-15-30-60분 재평가", "효과·부작용 동시 확인", "기준 이탈 시 즉시 보고"],
      holdRules: ["중증 저혈압·호흡저하·의식저하 등 급격한 악화 시 즉시 보류/중단"],
      escalateWhen: ["활력징후 불안정 또는 위험 신호 지속 시 즉시 보고/호출"],
    };
  }
  if (intent === "device") {
    return {
      topActions: [
        `${itemName} 적용 전 준비물/연결 순서를 먼저 확인하세요.`,
        "클램프·stopcock·라인 방향을 시작 전에 재확인하세요.",
        "알람 발생 시 의미 확인 후 원인 Top3부터 순차 점검하세요.",
        "1차 조치 후 지속 알람이면 즉시 보고하고 대체 루트를 준비하세요.",
      ],
      topNumbers: ["시작 1~5분 정상 작동 확인", "현재 세팅값/변경 이력", "환자 반응 추이"],
      topRisks: ["채널/라인 오연결", "공기/폐색/위치 문제", "알람 무시 또는 지연 대응"],
      compatibilityChecks: ["소모품-기구 호환성", "라인 꺾임·고정 상태", "교체/점검 기준(IFU·기관)"],
      monitor: ["세팅 변경 직후 재평가 강화", "피부·누출·감염 징후 확인", "알람/조치 기록"],
      holdRules: ["중대한 오작동 또는 환자 위해 징후 시 즉시 중지 후 대체"],
      escalateWhen: ["치명 알람 지속·해결 불가 시 전문팀/의사 즉시 호출"],
    };
  }
  return {
    topActions: ["현재 상태를 먼저 확인하고 즉시 행동 우선순위를 정하세요."],
    topNumbers: ["최신 활력징후와 변화 추이", "현재 라인/장비/투여 상태"],
    topRisks: ["정보 부족 상태에서의 즉시 진행", "악화 신호 보고 지연"],
    compatibilityChecks: ["라인·연결·셋업 호환성 확인"],
    monitor: ["5-15-30-60분 간격 재평가"],
    holdRules: ["중증 악화 신호 시 즉시 보류/중단"],
    escalateWhen: ["불안정 소견 지속 시 즉시 보고/호출"],
  };
}

function ensureMinList(primary: string[], fallback: string[], min: number, max: number) {
  if (primary.length >= min) return dedupeLimit(primary, max);
  return dedupeLimit([...primary, ...fallback], max);
}

function buildResultFromAnswer(params: AnalyzeParams, intent: QueryIntent, answer: string): MedSafetyAnalysisResult {
  const verification = parseEntityVerification(answer);
  const officialNameFromControl = parseEntityOfficialName(answer);
  const aliasesFromControl = parseEntityAliases(answer);
  const canonicalFromQuery = intent === "medication" || intent === "device" ? resolveCanonicalEntityFromQuery(params.query, intent) : null;
  const answerWithoutControl = stripEntityControlLines(answer);
  const normalizedRaw = sanitizeSearchAnswer(answerWithoutControl || answer);
  const canonicalName =
    cleanLine(canonicalFromQuery?.canonical || officialNameFromControl || params.query || params.imageName || "").slice(0, 50) || "조회 항목";
  const normalized = replaceEntityMentionForDisplay(normalizedRaw, params.query, canonicalName);
  const suggestedNames = dedupeLimit(
    [
      ...extractSuggestedNames(answer, params.query, intent),
      ...(canonicalFromQuery?.canonical ? [canonicalFromQuery.canonical] : []),
    ].filter((name) => normalizeEntityCompact(name) !== normalizeEntityCompact(params.query)),
    3
  );
  if (intent === "medication" || intent === "device") {
    const hasVerifiedIdentity = verification === "yes" || Boolean(officialNameFromControl) || aliasesFromControl.length > 0;
    if (verification === "no") {
      return buildNotFoundResult(params, intent, "entity_verification_no", suggestedNames);
    }
    if (!hasVerifiedIdentity && verification === "unknown") {
      return buildNotFoundResult(params, intent, "entity_verification_missing", suggestedNames);
    }
    if (!hasVerifiedIdentity && hasNotFoundSignal(normalized)) {
      return buildNotFoundResult(params, intent, "model_not_found_signal", suggestedNames);
    }
    if (!hasVerifiedIdentity && !containsEntityReference(params.query, normalized, canonicalName)) {
      return buildNotFoundResult(params, intent, "entity_reference_mismatch", suggestedNames);
    }
  }
  const itemName = intent === "medication" || intent === "device" ? canonicalName : cleanLine(params.query || params.imageName || "").slice(0, 50) || "조회 항목";
  const status = detectStatus(normalized);
  const riskLevel = detectRiskLevel(normalized, status);
  const sentences = extractSentences(normalized);
  const bullets = extractBullets(normalized);
  const templates = qualityFallbackTemplates(intent, params.locale, itemName);

  const topActions = dedupeLimit(
    [
      ...pickLinesByPattern(normalized, /(즉시|먼저|우선|first|immediate|초기 행동|시작)/i, 6),
      ...bullets,
      ...sentences,
    ],
    7
  );
  const topNumbers = dedupeLimit(
    [
      ...pickLinesByPattern(normalized, /(혈압|맵|map|맥박|spo2|rr|호흡|의식|통증|혈당|glucose|inr|aptt|qt|ecg|k\/mg|전해질|lab|검사)/i, 6),
      ...pickLinesByPattern(normalized, /\d/, 6),
    ],
    6
  );
  const topRisks = dedupeLimit(
    [
      ...pickLinesByPattern(normalized, /(위험|금기|주의|경고|합병증|알람|stop|중단|보류|응급|호출)/i, 8),
      ...bullets,
    ],
    7
  );
  const compatibilityChecks = dedupeLimit(
    pickLinesByPattern(normalized, /(라인|호환|혼합|y-site|flush|clamp|stopcock|연결|전용 라인|compat)/i, 6),
    6
  );
  const monitor = dedupeLimit(
    [
      ...pickLinesByPattern(normalized, /(모니터|재평가|vital|관찰|5분|15분|30분|60분)/i, 6),
      ...topNumbers,
    ],
    6
  );
  const holdRules = dedupeLimit(pickLinesByPattern(normalized, /(중단|보류|hold|stop rule|즉시 중지)/i, 6), 6);
  const escalateWhen = dedupeLimit(pickLinesByPattern(normalized, /(보고|호출|rtt|code|응급콜|전문팀)/i, 6), 6);
  const calculatorsNeeded = dedupeLimit(
    pickLinesByPattern(normalized, /(단위|농도|용량|속도|계산|mg|mcg|mEq|IU|drip)/i, 5),
    5
  );
  const institutionalChecks = dedupeLimit(
    pickLinesByPattern(normalized, /(기관|프로토콜|약제부|ifu|제조사|병원 지침|policy)/i, 4),
    4
  );
  const sbar = buildSbar(normalized);
  const aliases = dedupeLimit(
    [
      ...aliasesFromControl,
      ...(canonicalFromQuery?.aliases ?? []),
      ...pickLinesByPattern(normalized, /(별칭|alias|aka|다른 이름)/i, 4).map((line) => line.replace(/^(별칭|alias)\s*[:：]\s*/i, "")),
    ],
    6
  );

  return {
    resultKind: intent === "scenario" ? "scenario" : intent,
    notFound: false,
    notFoundReason: "",
    oneLineConclusion:
      cleanLine(sentences[0] || "") ||
      (intent === "medication"
        ? `${itemName}의 핵심 목적·투여 원칙·위험 신호를 우선 확인하세요.`
        : intent === "device"
          ? `${itemName}의 셋업·정상 작동·알람 대응 순서를 우선 확인하세요.`
          : `${itemName} 관련 상황에서 즉시 행동 우선순위와 중단/보고 기준을 우선 확인하세요.`),
    riskLevel,
    item: {
      name: itemName,
      type: detectItemType(intent, normalized),
      aliases,
      highRiskBadges:
        status === "STOP"
          ? ["즉시 중단/호출 검토"]
          : status === "CHECK"
            ? ["핵심 확인 필요"]
            : ["진행 전 안전 확인"],
      primaryUse: cleanLine(sentences.slice(0, 2).join(" ")) || `${itemName} 관련 핵심 임상 정보`,
      confidence: Math.max(55, Math.min(95, Math.round(65 + Math.min(normalized.length, 1200) / 40))),
    },
    quick: {
      status,
      topActions: ensureMinList(topActions, templates.topActions, 4, 8),
      topNumbers: ensureMinList(topNumbers, templates.topNumbers, 3, 7),
      topRisks: ensureMinList(topRisks, templates.topRisks, 3, 8),
    },
    do: {
      steps: ensureMinList(dedupeLimit([...topActions, ...bullets], 9), templates.topActions, 5, 9),
      calculatorsNeeded: ensureMinList(calculatorsNeeded, templates.topNumbers, 2, 5),
      compatibilityChecks: ensureMinList(compatibilityChecks, templates.compatibilityChecks, 2, 6),
    },
    safety: {
      holdRules: ensureMinList(holdRules, templates.holdRules, 1, 6),
      monitor: ensureMinList(monitor, templates.monitor, 2, 6),
      escalateWhen: ensureMinList(escalateWhen, templates.escalateWhen, 1, 6),
    },
    institutionalChecks: institutionalChecks.length ? institutionalChecks : ["기관 프로토콜·약제부·IFU 확인 필요"],
    sbar,
    patientScript20s:
      cleanLine(
        pickLinesByPattern(normalized, /(환자|설명|알려|teach|교육)/i, 1)[0] ||
          "지금 처치는 안전 확인이 핵심이라, 목적과 주의 증상을 짧게 설명드리고 바로 상태를 다시 확인하겠습니다."
      ).slice(0, 220),
    modePriority: [],
    confidenceNote: "",
    searchAnswer: normalized,
  };
}

function parseJsonStringArray(raw: string): string[] | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const tryParse = (candidate: string) => {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) return null;
      return parsed.map((item) => String(item ?? "").trim());
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const fenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const fencedParsed = tryParse(fenced);
  if (fencedParsed) return fencedParsed;

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return tryParse(text.slice(firstBracket, lastBracket + 1));
  }

  return null;
}

function hangulRatio(lines: string[]) {
  const text = lines.join(" ");
  const total = (text.match(/[A-Za-z가-힣]/g) ?? []).length;
  if (!total) return 0;
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  return hangul / total;
}

function splitChunks<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function cloneMedSafetyResult(source: MedSafetyAnalysisResult): MedSafetyAnalysisResult {
  return {
    ...source,
    item: {
      ...source.item,
      aliases: [...(source.item.aliases ?? [])],
      highRiskBadges: [...(source.item.highRiskBadges ?? [])],
    },
    quick: {
      ...source.quick,
      topActions: [...(source.quick.topActions ?? [])],
      topNumbers: [...(source.quick.topNumbers ?? [])],
      topRisks: [...(source.quick.topRisks ?? [])],
    },
    do: {
      ...source.do,
      steps: [...(source.do.steps ?? [])],
      calculatorsNeeded: [...(source.do.calculatorsNeeded ?? [])],
      compatibilityChecks: [...(source.do.compatibilityChecks ?? [])],
    },
    safety: {
      ...source.safety,
      holdRules: [...(source.safety.holdRules ?? [])],
      monitor: [...(source.safety.monitor ?? [])],
      escalateWhen: [...(source.safety.escalateWhen ?? [])],
    },
    institutionalChecks: [...(source.institutionalChecks ?? [])],
    sbar: {
      ...source.sbar,
    },
    modePriority: [...(source.modePriority ?? [])],
    searchAnswer: source.searchAnswer ?? "",
    suggestedNames: [...(source.suggestedNames ?? [])],
  };
}

export async function translateMedSafetyToEnglish(input: {
  result: MedSafetyAnalysisResult;
  rawText: string;
  model?: string | null;
  signal: AbortSignal;
}): Promise<{
  result: MedSafetyAnalysisResult;
  rawText: string;
  model: string | null;
  debug: string | null;
}> {
  const apiKey = normalizeApiKey();
  if (!apiKey) throw new Error("missing_openai_api_key");

  const modelCandidates = resolveModelCandidates();
  const apiBaseUrls = resolveApiBaseUrls();
  const maxOutputTokens = Math.max(2600, Math.min(14000, resolveMaxOutputTokens() + 1600));
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
  const networkRetries = resolveNetworkRetryCount();
  const networkRetryBaseMs = resolveNetworkRetryBaseMs();
  const totalBudgetMs = Math.max(resolveTranslateTotalBudgetMs(), Math.min(180_000, upstreamTimeoutMs + 30_000));
  const startedAt = Date.now();

  const translatedResult = cloneMedSafetyResult(input.result);
  let translatedRawText = normalizeText(input.rawText);
  let selectedModel: string | null = modelCandidates[0] ?? null;

  const lines: string[] = [];
  const setters: Array<(value: string) => void> = [];
  const push = (value: string, setter: (value: string) => void) => {
    const text = normalizeText(value);
    if (!text) return;
    lines.push(text);
    setters.push(setter);
  };

  push(input.result.oneLineConclusion, (value) => {
    translatedResult.oneLineConclusion = value;
  });
  push(input.result.item.name, (value) => {
    translatedResult.item.name = value;
  });
  push(input.result.item.primaryUse, (value) => {
    translatedResult.item.primaryUse = value;
  });

  translatedResult.item.aliases.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.item.aliases[idx] = translated;
    });
  });
  translatedResult.item.highRiskBadges.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.item.highRiskBadges[idx] = translated;
    });
  });
  translatedResult.quick.topActions.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.quick.topActions[idx] = translated;
    });
  });
  translatedResult.quick.topNumbers.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.quick.topNumbers[idx] = translated;
    });
  });
  translatedResult.quick.topRisks.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.quick.topRisks[idx] = translated;
    });
  });

  translatedResult.do.steps.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.do.steps[idx] = translated;
    });
  });
  translatedResult.do.calculatorsNeeded.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.do.calculatorsNeeded[idx] = translated;
    });
  });
  translatedResult.do.compatibilityChecks.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.do.compatibilityChecks[idx] = translated;
    });
  });

  translatedResult.safety.holdRules.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.safety.holdRules[idx] = translated;
    });
  });
  translatedResult.safety.monitor.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.safety.monitor[idx] = translated;
    });
  });
  translatedResult.safety.escalateWhen.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.safety.escalateWhen[idx] = translated;
    });
  });

  translatedResult.institutionalChecks.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.institutionalChecks[idx] = translated;
    });
  });
  push(input.result.sbar.situation, (value) => {
    translatedResult.sbar.situation = value;
  });
  push(input.result.sbar.background, (value) => {
    translatedResult.sbar.background = value;
  });
  push(input.result.sbar.assessment, (value) => {
    translatedResult.sbar.assessment = value;
  });
  push(input.result.sbar.recommendation, (value) => {
    translatedResult.sbar.recommendation = value;
  });
  push(input.result.patientScript20s, (value) => {
    translatedResult.patientScript20s = value;
  });
  translatedResult.modePriority.forEach((value, idx) => {
    push(value, (translated) => {
      translatedResult.modePriority[idx] = translated;
    });
  });
  translatedResult.suggestedNames?.forEach((value, idx) => {
    push(value, (translated) => {
      if (!translatedResult.suggestedNames) translatedResult.suggestedNames = [];
      translatedResult.suggestedNames[idx] = translated;
    });
  });
  push(input.result.confidenceNote ?? "", (value) => {
    translatedResult.confidenceNote = value;
  });
  push(input.result.searchAnswer ?? "", (value) => {
    translatedResult.searchAnswer = value;
  });
  push(input.rawText ?? "", (value) => {
    translatedRawText = value;
  });

  if (!lines.length) {
    return {
      result: translatedResult,
      rawText: translatedRawText,
      model: selectedModel,
      debug: "translate_empty_source",
    };
  }

  const buildTranslatePrompt = (targetLines: string[], strictNoKorean = false) =>
    [
      "Translate each input string into natural clinical English for bedside nurses.",
      "Return ONLY a JSON array of strings.",
      `Array length must be exactly ${targetLines.length}.`,
      "Keep order exactly the same.",
      "Do not merge or split lines.",
      "Keep numbers, units, dates, medication names, and device names unchanged when appropriate.",
      strictNoKorean ? "Final output must contain no Korean characters." : "",
      "",
      JSON.stringify(targetLines, null, 2),
    ]
      .filter(Boolean)
      .join("\n");

  const translateChunk = async (
    targetLines: string[],
    strictNoKorean = false
  ): Promise<{ translated: string[]; model: string }> => {
    if (Date.now() - startedAt > totalBudgetMs) {
      throw new Error("openai_translate_timeout_total_budget");
    }
    let lastError = "openai_translate_failed";
    for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
      const model = modelCandidates[modelIndex]!;
      for (let baseIndex = 0; baseIndex < apiBaseUrls.length; baseIndex += 1) {
        if (Date.now() - startedAt > totalBudgetMs) {
          throw new Error("openai_translate_timeout_total_budget");
        }
        const remainingMs = totalBudgetMs - (Date.now() - startedAt);
        const timeoutForAttempt = Math.max(4_000, Math.min(upstreamTimeoutMs, remainingMs - 250));
        if (!Number.isFinite(timeoutForAttempt) || timeoutForAttempt < 4_000) {
          throw new Error("openai_translate_timeout_total_budget");
        }
        const apiBaseUrl = apiBaseUrls[baseIndex]!;
        const attempt = await callResponsesApiWithRetry({
          apiKey,
          model,
          developerPrompt:
            "You are a professional Korean-to-English clinical translator for bedside nursing safety content.",
          userPrompt: buildTranslatePrompt(targetLines, strictNoKorean),
          apiBaseUrl,
          signal: input.signal,
          maxOutputTokens,
          upstreamTimeoutMs: timeoutForAttempt,
          verbosity: "medium",
          storeResponses: false,
          retries: networkRetries,
          retryBaseMs: networkRetryBaseMs,
        });
        if (!attempt.error && attempt.text) {
          const parsed = parseJsonStringArray(attempt.text);
          if (parsed && parsed.length === targetLines.length) {
            return { translated: parsed, model };
          }
          lastError = parsed
            ? `openai_translate_count_mismatch_model:${model}_${parsed.length}/${targetLines.length}`
            : `openai_translate_non_json_array_model:${model}`;
          continue;
        }
        lastError = attempt.error ?? "openai_translate_failed";
      }
    }
    throw new Error(lastError);
  };

  const chunks = splitChunks(lines, 14);
  const translatedLines: string[] = [];
  for (const chunk of chunks) {
    if (Date.now() - startedAt > totalBudgetMs) {
      throw new Error("openai_translate_timeout_total_budget");
    }
    let chunkTranslated = await translateChunk(chunk, false);
    if (hangulRatio(chunkTranslated.translated) > 0.08) {
      chunkTranslated = await translateChunk(chunk, true);
    }
    selectedModel = chunkTranslated.model;
    translatedLines.push(...chunkTranslated.translated);
  }

  if (translatedLines.length !== setters.length) {
    throw new Error(`openai_translate_count_mismatch_${translatedLines.length}/${setters.length}`);
  }

  for (let i = 0; i < translatedLines.length; i += 1) {
    const value = String(translatedLines[i] ?? "").trim();
    if (!value) continue;
    setters[i]?.(value);
  }

  if (!translatedResult.searchAnswer && translatedRawText) {
    translatedResult.searchAnswer = translatedRawText;
  }

  return {
    result: translatedResult,
    rawText: translatedRawText,
    model: selectedModel,
    debug: null,
  };
}

export async function analyzeMedSafetyWithOpenAI(params: AnalyzeParams): Promise<OpenAIMedSafetyOutput> {
  const apiKey = normalizeApiKey();
  if (!apiKey) throw new Error("missing_openai_api_key");

  const intent = inferIntent(params);
  const modelCandidates = resolveModelCandidates();
  const apiBaseUrls = resolveApiBaseUrls();
  const maxOutputTokens = resolveMaxOutputTokens();
  const maxOutputTokensForIntent =
    intent === "scenario" ? Math.max(2200, Math.min(4800, maxOutputTokens)) : maxOutputTokens;
  const outputTokenCandidates = buildOutputTokenCandidates(maxOutputTokensForIntent, intent);
  const responseVerbosity: ResponseVerbosity = "high";
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
  const totalBudgetMs = Math.max(resolveTotalBudgetMs(), Math.min(900_000, upstreamTimeoutMs + 120_000));
  const networkRetries = resolveNetworkRetryCount();
  const networkRetryBaseMs = resolveNetworkRetryBaseMs();
  const storeResponses = resolveStoreResponses();
  const developerPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt(params, intent);
  const startedAt = Date.now();

  let selectedModel = modelCandidates[0] ?? MED_SAFETY_LOCKED_MODEL;
  let rawText = "";
  let lastError = "openai_request_failed";

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
      for (let tokenIndex = 0; tokenIndex < outputTokenCandidates.length; tokenIndex += 1) {
        if (Date.now() - startedAt > totalBudgetMs) {
          lastError = "openai_timeout_total_budget";
          break;
        }
        const outputTokenLimit = outputTokenCandidates[tokenIndex]!;
        const allowStreamDelta = Boolean(params.onTextDelta) && modelIndex === 0 && baseIndex === 0 && tokenIndex === 0;
        const attempt = await callResponsesApiWithRetry({
          apiKey,
          model: candidateModel,
          developerPrompt,
          userPrompt,
          apiBaseUrl,
          imageDataUrl: params.imageDataUrl,
          previousResponseId,
          conversationId,
          signal: params.signal,
          maxOutputTokens: outputTokenLimit,
          upstreamTimeoutMs,
          verbosity: responseVerbosity,
          storeResponses,
          onTextDelta: allowStreamDelta ? params.onTextDelta : undefined,
          retries: allowStreamDelta ? 0 : networkRetries,
          retryBaseMs: networkRetryBaseMs,
        });
        if (!attempt.error && attempt.text) {
          rawText = attempt.text;
          const result = buildResultFromAnswer(params, intent, attempt.text);
          return {
            result,
            model: candidateModel,
            rawText: attempt.text,
            fallbackReason: null,
            openaiResponseId: attempt.responseId,
            openaiConversationId: attempt.conversationId,
          };
        }
        if (attempt.error) {
          // 400 에러는 상태 키(previous/conversation) 문제 혹은 토큰 상한 문제일 수 있어
          // 같은 모델/베이스에서 상태 키 제거 재시도 1회를 먼저 수행한다.
          if (
            isBadRequestError(attempt.error) &&
            (tokenIndex === 0 || (useContinuationState && isContinuationStateError(attempt.error)))
          ) {
            const statelessRetry = await callResponsesApi({
              apiKey,
              model: candidateModel,
              developerPrompt,
              userPrompt,
              apiBaseUrl,
              imageDataUrl: params.imageDataUrl,
              signal: params.signal,
              maxOutputTokens: outputTokenLimit,
              upstreamTimeoutMs,
              verbosity: responseVerbosity,
              storeResponses,
              compatMode: true,
            });
            if (!statelessRetry.error && statelessRetry.text) {
              rawText = statelessRetry.text;
              const result = buildResultFromAnswer(params, intent, statelessRetry.text);
              return {
                result,
                model: candidateModel,
                rawText: statelessRetry.text,
                fallbackReason: null,
                openaiResponseId: statelessRetry.responseId,
                openaiConversationId: statelessRetry.conversationId,
              };
            }
            lastError = statelessRetry.error ?? attempt.error;
            if (isTokenLimitError(lastError)) continue;
            break;
          }
          lastError = attempt.error;
          if (isTokenLimitError(attempt.error)) continue;
          break;
        }
        lastError = "openai_empty_text";
        if (tokenIndex + 1 < outputTokenCandidates.length) continue;
        break;
      }
    }
  }

  return {
    result: buildFallbackResult(
      params,
      intent,
      `AI 응답 실패로 기본 안전 모드로 전환되었습니다. (${truncateError(lastError)})`
    ),
    model: selectedModel,
    rawText,
    fallbackReason: lastError,
    openaiResponseId: null,
    openaiConversationId: null,
  };
}
