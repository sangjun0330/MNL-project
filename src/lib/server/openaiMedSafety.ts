export type MedSafetyItemType = "medication" | "device" | "unknown";
export type MedSafetyQuickStatus = "OK" | "CHECK" | "STOP";
export type ClinicalMode = "ward" | "er" | "icu";
export type ClinicalSituation = "general" | "pre_admin" | "during_admin" | "event_response";
export type QueryIntent = "medication" | "device" | "scenario";

export type MedSafetyAnalysisResult = {
  resultKind: "medication" | "device" | "scenario";
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
};

type AnalyzeParams = {
  query: string;
  mode: ClinicalMode;
  situation: ClinicalSituation;
  queryIntent?: QueryIntent;
  preferredModel?: string;
  patientSummary?: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
  imageName?: string;
  previousResponseId?: string;
  conversationId?: string;
  signal: AbortSignal;
};

type ResponsesAttempt = {
  text: string | null;
  error: string | null;
  responseId: string | null;
  conversationId: string | null;
};

type ResponseVerbosity = "low" | "medium" | "high";

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

function resolveModelCandidates(preferredModel?: string) {
  const configuredPrimary = String(process.env.OPENAI_MED_SAFETY_MODEL ?? process.env.OPENAI_MODEL ?? "").trim();
  const configuredFallbacks = splitModelList(
    process.env.OPENAI_MED_SAFETY_FALLBACK_MODELS ?? process.env.OPENAI_FALLBACK_MODELS ?? ""
  );
  const defaults = ["gpt-4.1-mini", "gpt-4o-mini"];
  const merged = dedupeModels([String(preferredModel ?? "").trim(), configuredPrimary, ...configuredFallbacks, ...defaults]);
  return merged.length ? merged : ["gpt-4.1-mini"];
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

function resolveNetworkRetryCount() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRIES ?? 2);
  if (!Number.isFinite(raw)) return 2;
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
  const raw = Number(process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS ?? 35_000);
  if (!Number.isFinite(raw)) return 35_000;
  const rounded = Math.round(raw);
  return Math.max(8_000, Math.min(90_000, rounded));
}

function resolveTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS ?? 45_000);
  if (!Number.isFinite(raw)) return 45_000;
  const rounded = Math.round(raw);
  return Math.max(15_000, Math.min(120_000, rounded));
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function normalizeText(value: string) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function cleanLine(value: string) {
  return normalizeText(value)
    .replace(/^[-*•·]\s*/, "")
    .replace(/^\d+[).]\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
      "약물/의료기구/상황 질문에 대해 현장에서 즉시 쓸 수 있는 고품질 정보를 제공한다.",
      "정해진 출력 템플릿을 강제하지 말고, 질문 성격에 맞는 최적의 구조로 답한다.",
      "불확실하거나 기관별 차이가 큰 내용은 단정하지 말고 확인 포인트를 명확히 표시한다.",
      "진단/처방 결정을 대체하지 않으며 기관 프로토콜·의사 지시·제조사 IFU를 최종 기준으로 둔다.",
      "품질 기준: 핵심 우선, 중복 제거, 실수 방지 포인트 포함, 모바일에서도 한눈에 읽히는 문장 길이 유지.",
      "같은 의미의 문장을 반복하거나 재서술하지 않는다. 같은 정보는 1번만 전달한다.",
      "출력은 일반 텍스트 중심으로 작성하고 마크다운 장식(##, **, 코드블록)은 사용하지 않는다.",
    ].join("\n");
  }
  return [
    "You are a clinical search engine AI for bedside nurses.",
    "Provide high-quality, practical, safety-first guidance for medication, device, and scenario queries.",
    "Do not force rigid output templates; structure response to best fit the query.",
    "Mark uncertain or institution-dependent details as verification points.",
    "Do not replace diagnosis/prescribing decisions; local protocol and IFU are final.",
    "Quality bar: action-first, concise, de-duplicated, mobile-readable, high signal-to-noise.",
    "Use plain text and avoid markdown ornaments.",
  ].join("\n");
}

function buildMedicationPrompt(query: string, contextJson: string) {
  return [
    "질문 약물에 대해 간호사를 위한 검색엔진 답변을 작성하라.",
    "가독성과 학습 가치가 높은 고품질 답변을 작성하라. 단순 요약이 아니라 실무+학습이 동시에 되도록 작성하라.",
    "출력 규칙: 마크다운 기호(##, ###, **, ---, ``` )를 쓰지 말고 일반 텍스트로만 작성하라.",
    "중복 문장/중복 단락을 반복하지 말고, 모바일 화면에서 읽기 쉽게 짧은 문장과 줄바꿈으로 작성하라.",
    "각 불릿은 완결 문장 1개로 작성하고, 문장 중간에서 줄바꿈하지 마라.",
    "한 불릿에는 핵심 1개만 담아라.",
    "답변 시작에 핵심 요약 1~2문장(가장 중요한 안전 포인트)을 먼저 제시하라.",
    "실무에서 바로 행동 가능한 정보부터 우선순위로 제시하라.",
    "1~9번 항목은 반드시 모두 포함하라. 출력이 길어지면 각 항목을 1~2문장으로 압축해도 되지만 항목 누락은 금지한다.",
    "각 카테고리는 '카테고리명:' 한 줄 제목으로 시작하고, 바로 아래에 핵심 항목을 작성하라.",
    "카테고리마다 최소 3개, 최대 4개 핵심 항목을 제공하라.",
    "아래 카테고리를 각각 분리해서 작성하라(카테고리 누락 금지):",
    "- 이 약이 무엇인지(정의/분류/역할)",
    "- 언제 쓰는지(적응증/사용 맥락)",
    "- 어떻게 주는지(경로/투여 방식/원칙)",
    "- 반드시 확인할 금기/주의 Top 3",
    "- 반드시 모니터할 것 Top 3",
    "- 위험 신호/즉시 대응",
    "- 라인/호환/상호작용",
    "- 환자 교육 포인트",
    "- 실수 방지 포인트",
    "",
    "[약물 질문 출력 필수 내용]",
    "1) 이 약이 무엇인지(정의/분류/역할)",
    "- 정의/분류(예: 항생제/항응고/진통·진정/바소프레서/이뇨제/전해질/항부정맥 등)",
    "- 핵심 역할(무엇을 위해 쓰는지)",
    "- 작용 특성(효과 발현 시간대 또는 주요 기전 1~2문장)",
    "2) 언제 쓰는지(적응증/사용 맥락)",
    "- 대표 적응증 1~3개",
    "- 병동/ER/ICU 부서별 사용 포인트(해당 시)",
    "3) 어떻게 주는지(경로/투여 방식/원칙)",
    "- 경로(PO/IV/IM/SC/흡입/패치 등)",
    "- IV push 가능/불가/주의와 이유",
    "- 희석/농도/속도/시간: 대표 원칙 + 기관 프로토콜/약제부 확인 포인트",
    "- 필터/차광/프라이밍/flush, 말초/중심라인 요구(원칙 수준)",
    "4) 반드시 확인할 금기/주의 Top 3",
    "- 환자 상태 기반 금기/주의",
    "- 최소 확인 데이터: 알레르기/활력/의식 + 약물군별 핵심 lab/ECG",
    "- High-alert/LASA 여부(있으면 강하게 표시)",
    "5) 반드시 모니터할 것 Top 3",
    "- Vitals 우선순위",
    "- Labs/ECG 핵심 1~2개",
    "- 기대 효과 + 위험 신호",
    "- 재평가 타이밍(5/15/30/60분 중 현실적 제안)",
    "6) 위험 신호/즉시 대응",
    "- 진짜 위험 신호 2~4개",
    "- 즉시 행동: 중단/보류 → ABC → 모니터 강화 → 보고",
    "- 길항제/응급약은 준비/보고 수준으로",
    "7) 라인/호환/상호작용(치명적 중심)",
    "- Y-site/혼합 금지/전용라인 필요(대표 원칙 + 기관 확인)",
    "- 치명적 상호작용 Top 2~3",
    "- 라인 실수 포인트(클램프/stopcock 포함)",
    "8) 환자 교육 포인트(필요 시)",
    "- 20초 설명 + teach-back 질문 1개",
    "9) 실수 방지 포인트(최소 2개)",
    "- 단위/농도/LASA/주입속도/혼합/flush/알람무시/기록누락 등",
    "",
    "안전 원칙:",
    "- 근거 없는 수치·용량·기준은 만들지 말 것",
    "- 기관마다 다른 부분은 반드시 '기관 확인 필요'로 표기",
    "- 한국 간호 현장 표현으로, 바쁜 상황에서 바로 실행 가능하게 작성",
    "- 같은 정보를 다른 문장으로 반복하지 말 것",
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
    "질문 의료기구에 대해 간호사를 위한 검색엔진 답변을 작성하라.",
    "가독성과 학습 가치가 높은 고품질 답변을 작성하라. 단순 요약이 아니라 실무+학습이 동시에 되도록 작성하라.",
    "출력 규칙: 마크다운 기호(##, ###, **, ---, ``` )를 쓰지 말고 일반 텍스트로만 작성하라.",
    "중복 문장/중복 단락을 반복하지 말고, 모바일 화면에서 읽기 쉽게 짧은 문장과 줄바꿈으로 작성하라.",
    "각 불릿은 완결 문장 1개로 작성하고, 문장 중간에서 줄바꿈하지 마라.",
    "한 불릿에는 핵심 1개만 담아라.",
    "답변 시작에 핵심 요약 1~2문장(가장 중요한 안전 포인트)을 먼저 제시하라.",
    "현장 단계(준비→셋업→초기 확인→알람 대응)를 행동 중심으로 제시하라.",
    "카테고리 누락 없이 끝까지 작성하라. 길면 각 항목을 1~2문장으로 압축한다.",
    "각 카테고리는 '카테고리명:' 한 줄 제목으로 시작하고, 바로 아래에 핵심 항목을 작성하라.",
    "카테고리마다 최소 3개, 최대 4개 핵심 항목을 제공하라.",
    "아래 카테고리를 각각 분리해서 작성하라(카테고리 누락 금지):",
    "- 기구 정의/언제 쓰는지",
    "- 준비물/셋업/사용 절차",
    "- 정상 작동 기준",
    "- 알람/트러블슈팅",
    "- 합병증/Stop rules",
    "- 유지관리",
    "- 실수 방지 포인트",
    "",
    "[의료기구 질문 출력 필수 내용]",
    "1) 기구 정의/언제 쓰는지",
    "- 정의(기구 역할 1줄), 적응증 2~3개, 금기/주의 1~2개(가능 시)",
    "2) 준비물/셋업/사용 절차(현장 단계)",
    "- 준비물 체크리스트",
    "- Setup(연결→프라이밍/공기 제거→고정→설정값→시작→초기 확인)",
    "- 적용 전 안전 확인(연결, clamp, 방향, 공기, 소모품 적합성)",
    "3) 정상 작동 기준",
    "- 정상 표시/정상 상태 특징 2~4개",
    "- 시작 후 1~5분 내 확인 포인트",
    "4) 알람/트러블슈팅(의미→먼저 볼 것→해결→보고)",
    "- 알람 의미",
    "- 원인 후보 Top 3",
    "- 먼저 확인 Top 3(클램프/꺾임/연결/필터/위치/배터리)",
    "- 해결 행동 Top 3",
    "- 해결 안 되면 교체/대체 루트/전문팀/의사 보고 기준",
    "5) 합병증/Stop rules",
    "- 합병증 Top 3~5",
    "- 즉시 중단/호출 위험 신호 2~4개",
    "6) 유지관리(기관 확인 표기)",
    "- 관찰 포인트(피부/고정/누출/통증/감염)",
    "- 교체·점검 주기(기관/IFU 확인 항목 표시)",
    "- 기록 포인트(시각, 세팅, 반응, 문제/조치)",
    "7) 실수 방지 포인트(최소 2개)",
    "- clamp/stopcock, 프라이밍/공기 제거, 소모품 호환, 알람 무시 등",
    "",
    "안전 원칙:",
    "- 기기별 수치/주기는 제조사 IFU와 기관 프로토콜 확인 전제",
    "- 단정이 어려운 항목은 확인 포인트로 안내",
    "- 한국 간호 현장 표현으로, 바쁜 상황에서 바로 실행 가능하게 작성",
    "- 같은 정보를 다른 문장으로 반복하지 말 것",
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
    "형식은 자유이되, 불필요한 배경 설명은 줄이고 핵심 행동 중심으로 정돈된 답변을 작성하라.",
    "출력 규칙: 마크다운 기호(##, ###, **, ---, ``` )를 쓰지 말고 일반 텍스트로만 작성하라.",
    "중복 문장/중복 단락을 반복하지 말고, 모바일 화면에서 읽기 쉽게 짧은 문장과 불릿 위주로 작성하라.",
    "항목은 한 줄 한 문장으로 작성하고, 각 항목은 가능한 '-' 불릿으로 시작하라.",
    "각 불릿은 반드시 완결 문장으로 끝내고, 문장 조각(반문장)만 남기지 마라.",
    "섹션 제목은 '핵심 판단:', '지금 할 일:', '확인할 수치/관찰:', '원인 후보:', '중단/호출 기준:', '보고 문구:' 형태를 우선 사용하라.",
    "너무 짧게 요약하지 말고 임상적으로 필요한 맥락은 유지하라.",
    "질문과 직접 관련된 내용만 남기고 일반론·교과서식 장문 설명은 생략하라.",
    "권장 구성: 핵심 판단, 지금 할 일(즉시), 확인할 수치/관찰, 가능한 원인 Top 3, 조정/분기, 중단·호출 기준, 보고 문구.",
    "각 구성은 2~4개 핵심 포인트로 정리하라.",
    "전체 길이는 대략 18~32줄 내외로 작성하라.",
    "불확실한 부분은 단정하지 말고 '기관 확인 필요'를 짧게 표기하라.",
    "마지막에는 현장에서 바로 읽을 수 있는 짧은 보고 문구(SBAR 형태) 2~4문장을 포함하라.",
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
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();

  const direct = json?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (Array.isArray(direct)) {
    const joined = direct
      .map((item) => (typeof item === "string" ? item : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  const output = Array.isArray(json?.output) ? json.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const outputText = typeof item?.output_text === "string" ? item.output_text : "";
    if (outputText) {
      chunks.push(outputText);
      continue;
    }
    const cell = Array.isArray(item?.content) ? item.content : [];
    for (const part of cell) {
      const text = typeof part?.text === "string" ? part.text : "";
      if (text) chunks.push(text);
    }
  }
  return chunks.join("").trim();
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
  } = args;

  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
    });
  }

  const body: Record<string, unknown> = {
    model,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: developerPrompt }],
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    text: {
      format: { type: "text" as const },
      verbosity,
    },
    reasoning: { effort: "medium" as const },
    max_output_tokens: maxOutputTokens,
    tools: [],
    store: storeResponses,
  };
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

  const json = await response.json().catch(() => null);
  const text = extractResponsesText(json);
  const responseId = typeof json?.id === "string" ? json.id : null;
  const conversationFromString = typeof json?.conversation === "string" ? json.conversation : "";
  const conversationFromObject = typeof json?.conversation?.id === "string" ? json.conversation.id : "";
  const conversationResponseId = conversationFromString || conversationFromObject || null;
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

function buildFallbackResult(params: AnalyzeParams, intent: QueryIntent, note: string): MedSafetyAnalysisResult {
  const safeName = cleanLine(params.query || params.imageName || "조회 항목").slice(0, 50) || "조회 항목";
  return {
    resultKind: intent === "scenario" ? "scenario" : intent,
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

function buildResultFromAnswer(params: AnalyzeParams, intent: QueryIntent, answer: string): MedSafetyAnalysisResult {
  const normalized = sanitizeSearchAnswer(answer);
  const itemName = cleanLine(params.query || params.imageName || "").slice(0, 50) || "조회 항목";
  const status = detectStatus(normalized);
  const riskLevel = detectRiskLevel(normalized, status);
  const sentences = extractSentences(normalized);
  const bullets = extractBullets(normalized);

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

  return {
    resultKind: intent === "scenario" ? "scenario" : intent,
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
      aliases: dedupeLimit(
        pickLinesByPattern(normalized, /(별칭|alias|aka|다른 이름)/i, 4).map((line) => line.replace(/^(별칭|alias)\s*[:：]\s*/i, "")),
        4
      ),
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
      topActions: topActions.length ? topActions : ["핵심 정보 재확인 후 진행"],
      topNumbers: topNumbers.length ? topNumbers : ["핵심 활력·의식·라인 상태 확인"],
      topRisks: topRisks.length ? topRisks : ["위험 신호 확인 및 기준 이탈 시 즉시 보고"],
    },
    do: {
      steps: dedupeLimit([...topActions, ...bullets], 9),
      calculatorsNeeded,
      compatibilityChecks,
    },
    safety: {
      holdRules: holdRules.length ? holdRules : ["중요 기준 이탈 또는 급격한 악화 시 즉시 보류/중단"],
      monitor: monitor.length ? monitor : ["상태에 따라 5-15-30-60분 간격 재평가"],
      escalateWhen: escalateWhen.length ? escalateWhen : ["악화·응급 징후 발생 시 즉시 담당의/응급팀 호출"],
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

export async function analyzeMedSafetyWithOpenAI(params: AnalyzeParams): Promise<{
  result: MedSafetyAnalysisResult;
  model: string;
  rawText: string;
  fallbackReason: string | null;
  openaiResponseId: string | null;
  openaiConversationId: string | null;
}> {
  const apiKey = normalizeApiKey();
  if (!apiKey) throw new Error("missing_openai_api_key");

  const intent = inferIntent(params);
  const modelCandidates = resolveModelCandidates(params.preferredModel);
  const apiBaseUrls = resolveApiBaseUrls();
  const maxOutputTokens = resolveMaxOutputTokens();
  const maxOutputTokensForIntent =
    intent === "scenario" ? Math.max(2200, Math.min(4800, maxOutputTokens)) : maxOutputTokens;
  const responseVerbosity: ResponseVerbosity = "high";
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
  const totalBudgetMs = resolveTotalBudgetMs();
  const networkRetries = resolveNetworkRetryCount();
  const networkRetryBaseMs = resolveNetworkRetryBaseMs();
  const storeResponses = resolveStoreResponses();
  const developerPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt(params, intent);
  const startedAt = Date.now();

  let selectedModel = modelCandidates[0] ?? "gpt-4.1-mini";
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
        maxOutputTokens: maxOutputTokensForIntent,
        upstreamTimeoutMs,
        verbosity: responseVerbosity,
        storeResponses,
        retries: networkRetries,
        retryBaseMs: networkRetryBaseMs,
      });
      if (attempt.error) {
        // 상태 이어받기(previous/conversation) 포맷 문제면 같은 모델/베이스에서
        // 상태 키를 제거하고 한 번 더 즉시 재시도한다.
        if (
          useContinuationState &&
          /openai_responses_400/i.test(attempt.error) &&
          /(previous_response|conversation)/i.test(attempt.error)
        ) {
          const statelessRetry = await callResponsesApi({
            apiKey,
            model: candidateModel,
            developerPrompt,
            userPrompt,
            apiBaseUrl,
            imageDataUrl: params.imageDataUrl,
            signal: params.signal,
            maxOutputTokens: maxOutputTokensForIntent,
            upstreamTimeoutMs,
            verbosity: responseVerbosity,
            storeResponses,
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
          continue;
        }
        lastError = attempt.error;
        continue;
      }
      if (attempt.text) {
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
