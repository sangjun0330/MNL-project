import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";
import {
  buildMedSafetyAnswerText,
  buildMedSafetyQualitySnapshot,
  normalizeMedSafetyStructuredAnswer,
  type MedSafetyQualitySnapshot,
  type MedSafetyStructuredAnswer,
  type MedSafetyVerificationIssueCode,
  type MedSafetyVerificationReport,
} from "@/lib/medSafetyStructured";
import {
  mergeMedSafetySources,
  sanitizeMedSafetyTextUrls,
  type MedSafetyGroundingMode,
  type MedSafetyGroundingStatus,
  type MedSafetySource,
} from "@/lib/medSafetySources";

type SearchCreditType = "standard" | "premium";
type Locale = "ko" | "en";

type AnalyzeStage = "routing" | "retrieving" | "generating" | "verifying";

type AnalyzeParams = {
  query: string;
  locale: Locale;
  searchType: SearchCreditType;
  imageDataUrl?: string;
  continuationMemory?: string;
  onStage?: (stage: AnalyzeStage, payload?: Record<string, unknown>) => void | Promise<void>;
  signal: AbortSignal;
};

type ResponsesUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
};

type GroundingDecision = {
  question_type: MedSafetyStructuredAnswer["question_type"];
  triage_level: MedSafetyStructuredAnswer["triage_level"];
  needs_grounding: boolean;
  needs_verification: boolean;
  high_risk: boolean;
  freshness_sensitive: boolean;
};

type EvidenceRetrievalResult = {
  question_type: MedSafetyStructuredAnswer["question_type"];
  triage_level: MedSafetyStructuredAnswer["triage_level"];
  grounding_note: string;
  evidence_packets: MedSafetySource[];
};

type StructuredCallResult<T> = {
  data: T | null;
  rawText: string;
  responseId: string | null;
  usage: ResponsesUsage | null;
  sources: MedSafetySource[];
  error: string | null;
};

export type OpenAIMedSafetyStructuredOutput = {
  query: string;
  answerText: string;
  answer: MedSafetyStructuredAnswer;
  model: string;
  fallbackReason: string | null;
  sources: MedSafetySource[];
  groundingMode: MedSafetyGroundingMode;
  groundingStatus: MedSafetyGroundingStatus;
  groundingError: string | null;
  quality: MedSafetyQualitySnapshot;
  verification: MedSafetyVerificationReport | null;
  latencyMs: number;
  usage: ResponsesUsage | null;
  routeDecision: GroundingDecision;
  debug?: {
    retrievalNote: string;
  };
};

type WebSearchContextSize = "low" | "medium" | "high";

type MedSafetyWebSearchProfile = {
  allowedDomains: string[];
  searchContextSize: WebSearchContextSize;
  toolChoice: "required" | "auto";
  includeSourceList: boolean;
};

const DEFAULT_STANDARD_MODEL = "gpt-5.2";
const DEFAULT_PREMIUM_MODEL = "gpt-5.4";

const OFFICIAL_TIER_1_DOMAINS = [
  "fda.gov",
  "cdc.gov",
  "who.int",
  "nih.gov",
  "nice.org.uk",
  "nhs.uk",
  "ema.europa.eu",
  "kdca.go.kr",
  "mfds.go.kr",
] as const;

const OFFICIAL_TIER_2_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "dailymed.nlm.nih.gov",
  "medlineplus.gov",
] as const;

const ALLOWED_DOMAINS = [...OFFICIAL_TIER_1_DOMAINS, ...OFFICIAL_TIER_2_DOMAINS];

const RETRIEVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question_type: { type: "string", enum: ["general", "drug", "lab", "compare", "guideline", "device", "procedure", "image"] },
    triage_level: { type: "string", enum: ["routine", "urgent", "critical"] },
    grounding_note: { type: "string" },
    evidence_packets: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          title: { type: "string" },
          domain: { type: "string" },
          organization: { type: ["string", "null"] },
          doc_type: { type: ["string", "null"] },
          effective_date: { type: ["string", "null"] },
          retrieved_at: { type: ["string", "null"] },
          claim_scope: { type: ["string", "null"] },
          support_strength: { type: "string", enum: ["direct", "background"] },
          official: { type: "boolean" },
        },
        required: [
          "id",
          "url",
          "title",
          "domain",
          "organization",
          "doc_type",
          "effective_date",
          "retrieved_at",
          "claim_scope",
          "support_strength",
          "official",
        ],
      },
    },
  },
  required: ["question_type", "triage_level", "grounding_note", "evidence_packets"],
} as const;

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question_type: { type: "string", enum: ["general", "drug", "lab", "compare", "guideline", "device", "procedure", "image"] },
    triage_level: { type: "string", enum: ["routine", "urgent", "critical"] },
    bottom_line: { type: "string" },
    bottom_line_citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
    key_points: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
          evidence_status: { type: "string", enum: ["supported", "needs_review"] },
        },
        required: ["text", "citation_ids", "evidence_status"],
      },
    },
    recommended_actions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
          evidence_status: { type: "string", enum: ["supported", "needs_review"] },
        },
        required: ["text", "citation_ids", "evidence_status"],
      },
    },
    do_not_do: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
          evidence_status: { type: "string", enum: ["supported", "needs_review"] },
        },
        required: ["text", "citation_ids", "evidence_status"],
      },
    },
    when_to_escalate: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
          evidence_status: { type: "string", enum: ["supported", "needs_review"] },
        },
        required: ["text", "citation_ids", "evidence_status"],
      },
    },
    patient_specific_caveats: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
          evidence_status: { type: "string", enum: ["supported", "needs_review"] },
        },
        required: ["text", "citation_ids", "evidence_status"],
      },
    },
    uncertainty: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        needs_verification: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["summary", "needs_verification", "reasons"],
    },
    freshness: {
      type: "object",
      additionalProperties: false,
      properties: {
        retrieved_at: { type: ["string", "null"] },
        newest_effective_date: { type: ["string", "null"] },
        note: { type: "string" },
        verification_status: { type: "string", enum: ["verified", "dated", "unknown"] },
      },
      required: ["retrieved_at", "newest_effective_date", "note", "verification_status"],
    },
    citations: RETRIEVAL_SCHEMA.properties.evidence_packets,
    comparison_table: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          role: { type: "string" },
          when_to_use: { type: "string" },
          effect_onset: { type: "string" },
          limitations: { type: "string" },
          bedside_points: { type: "string" },
          citation_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
          evidence_status: { type: "string", enum: ["supported", "needs_review"] },
        },
        required: ["role", "when_to_use", "effect_onset", "limitations", "bedside_points", "citation_ids", "evidence_status"],
      },
    },
  },
  required: [
    "question_type",
    "triage_level",
    "bottom_line",
    "bottom_line_citation_ids",
    "key_points",
    "recommended_actions",
    "do_not_do",
    "when_to_escalate",
    "patient_specific_caveats",
    "uncertainty",
    "freshness",
    "citations",
    "comparison_table",
  ],
} as const;

const VERIFIER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    passed: { type: "boolean" },
    issues: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
        enum: [
          "claim_citation_mismatch",
          "unsupported_specificity",
          "missing_urgency",
          "self_contradiction",
          "overlong_indirect",
        ],
      },
    },
    notes: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    corrected_answer: ANSWER_SCHEMA,
  },
  required: ["passed", "issues", "notes", "corrected_answer"],
} as const;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function splitModelList(raw: string) {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeApiKey() {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.OPENAI_API_TOKEN ??
    process.env.OPENAI_SECRET_KEY ??
    "";
  return String(key ?? "").trim();
}

function resolveModel(searchType: SearchCreditType) {
  const direct = ((searchType === "premium" ? process.env.OPENAI_MED_SAFETY_PREMIUM_MODEL : process.env.OPENAI_MED_SAFETY_STANDARD_MODEL) ?? "").trim();
  if (direct) return direct;
  return searchType === "premium" ? DEFAULT_PREMIUM_MODEL : DEFAULT_STANDARD_MODEL;
}

function resolveApiBaseUrls() {
  const listFromEnv = splitModelList(process.env.OPENAI_MED_SAFETY_BASE_URLS ?? "").map((item) => normalizeOpenAIResponsesBaseUrl(item));
  const singleRaw = String(process.env.OPENAI_MED_SAFETY_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "").trim();
  const single = normalizeOpenAIResponsesBaseUrl(singleRaw);
  return [...new Set([...listFromEnv, single].filter(Boolean))];
}

function resolveStoreResponses() {
  const raw = String(process.env.OPENAI_MED_SAFETY_STORE ?? process.env.OPENAI_STORE ?? "true").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function resolveUpstreamTimeoutMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS ?? 120_000);
  if (!Number.isFinite(raw)) return 120_000;
  return Math.max(60_000, Math.min(240_000, Math.round(raw)));
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
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      append(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    append(node.value);
    append(node.text);
    append(node.output_text);
    if (node.text && typeof node.text === "object") {
      append((node.text as Record<string, unknown>).value);
    }
    visit(node.content);
  };
  visit(json?.output_text);
  visit(json?.output);
  visit(json?.message?.content);
  visit(json?.choices?.[0]?.message?.content);
  return chunks.join("\n").trim();
}

function extractMedSafetySourcesFromResponsesPayload(payload: any): MedSafetySource[] {
  const collected: Array<Record<string, unknown>> = [];
  const appendCandidate = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    collected.push({
      url: node.url ?? node.link ?? node.uri ?? node.source_url ?? node.sourceUrl,
      title: node.title ?? node.name ?? node.label,
      domain: node.domain ?? node.hostname ?? node.host,
      cited: false,
      organization: node.organization,
      docType: node.docType ?? node.doc_type,
      effectiveDate: node.effectiveDate ?? node.effective_date,
      retrievedAt: node.retrievedAt ?? node.retrieved_at,
      claimScope: node.claimScope ?? node.claim_scope,
      supportStrength: node.supportStrength ?? node.support_strength,
      official: node.official,
    });
  };
  const visitSourceList = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach(appendCandidate);
  };
  const visitContent = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const node = item as Record<string, unknown>;
      visitSourceList(node.sources);
      if (node.action && typeof node.action === "object") {
        visitSourceList((node.action as Record<string, unknown>).sources);
      }
      if (node.annotations && Array.isArray(node.annotations)) {
        node.annotations.forEach((annotation) => {
          if (!annotation || typeof annotation !== "object") return;
          const citation = ((annotation as Record<string, unknown>).url_citation ??
            (annotation as Record<string, unknown>).citation ??
            annotation) as Record<string, unknown>;
          appendCandidate({
            url: citation.url ?? citation.link,
            title: citation.title ?? citation.name,
            domain: citation.domain,
            cited: true,
          });
        });
      }
    });
  };
  visitSourceList(payload?.web_search_call?.action?.sources);
  const output = Array.isArray(payload?.output) ? payload.output : [];
  output.forEach((item: unknown) => {
    if (!item || typeof item !== "object") return;
    const node = item as Record<string, unknown>;
    visitSourceList(node.sources);
    if (node.action && typeof node.action === "object") {
      visitSourceList((node.action as Record<string, unknown>).sources);
    }
    if (node.web_search_call && typeof node.web_search_call === "object") {
      visitSourceList(((node.web_search_call as Record<string, unknown>).action as Record<string, unknown> | undefined)?.sources);
    }
    visitContent(node.content);
  });
  visitContent(payload?.message?.content);
  visitContent(payload?.choices?.[0]?.message?.content);
  return mergeMedSafetySources(collected, 12);
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractUsageNode(value: unknown): ResponsesUsage | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const inputTokens = readNumber(node.input_tokens ?? node.prompt_tokens ?? node.inputTokens);
  const outputTokens = readNumber(node.output_tokens ?? node.completion_tokens ?? node.outputTokens);
  const inputDetails =
    (node.input_tokens_details as Record<string, unknown> | undefined) ??
    (node.prompt_tokens_details as Record<string, unknown> | undefined) ??
    (node.inputTokensDetails as Record<string, unknown> | undefined);
  const outputDetails =
    (node.output_tokens_details as Record<string, unknown> | undefined) ??
    (node.completion_tokens_details as Record<string, unknown> | undefined) ??
    (node.outputTokensDetails as Record<string, unknown> | undefined);
  const cachedInputTokens = readNumber(inputDetails?.cached_tokens ?? inputDetails?.cachedTokens);
  const reasoningTokens = readNumber(outputDetails?.reasoning_tokens ?? outputDetails?.reasoningTokens);
  const totalTokens =
    readNumber(node.total_tokens ?? node.totalTokens) ??
    (inputTokens != null || outputTokens != null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  if (inputTokens == null && outputTokens == null && totalTokens == null && cachedInputTokens == null && reasoningTokens == null) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
  };
}

function sumUsage(...values: Array<ResponsesUsage | null | undefined>): ResponsesUsage | null {
  const usable = values.filter((value): value is ResponsesUsage => Boolean(value));
  if (!usable.length) return null;
  const sum = (items: Array<number | null>) => {
    const nums = items.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    if (!nums.length) return null;
    return nums.reduce((total, item) => total + item, 0);
  };
  return {
    inputTokens: sum(usable.map((item) => item.inputTokens)),
    outputTokens: sum(usable.map((item) => item.outputTokens)),
    totalTokens: sum(usable.map((item) => item.totalTokens)),
    cachedInputTokens: sum(usable.map((item) => item.cachedInputTokens)),
    reasoningTokens: sum(usable.map((item) => item.reasoningTokens)),
  };
}

function isCompareQuery(query: string) {
  return /(차이|비교|구분|vs\b|versus|어떤\s*걸|무슨\s*차이|둘\s*중)/i.test(query);
}

function isGuidelineQuery(query: string) {
  return /(가이드라인|guideline|권고|recommendation|최신|업데이트|권장)/i.test(query);
}

function isLabQuery(query: string) {
  return /(수치|전해질|검사|lab|cbc|bmp|cmp|abga|혈액가스|칼륨|나트륨|크레아티닌|troponin|lactate|inr)/i.test(query);
}

function isDrugQuery(query: string) {
  return /(약|투여|용량|희석|속도|부작용|금기|상호작용|insulin|heparin|vancomycin|norepinephrine|dopamine|항생제|수혈)/i.test(query);
}

function isDeviceQuery(query: string) {
  return /(기구|장비|펌프|라인|카테터|튜브|ventilator|기계환기|모니터|알람|드레인)/i.test(query);
}

function isProcedureQuery(query: string) {
  return /(절차|순서|프로토콜|체크리스트|준비|세팅|중재|어떻게\s*해|무엇부터)/i.test(query);
}

function isCriticalQuery(query: string) {
  return /(심정지|무수축|vf|vt|맥박없|shock|쇼크|산소포화도\s*급락|의식저하|호흡정지|아나필락시스|고칼륨.*ecg|chest pain)/i.test(query);
}

function isUrgentQuery(query: string) {
  return /(고칼륨|저혈당|저혈압|고혈압\s*응급|sepsis|패혈증|급성|이상반응|부정맥|호흡곤란|악화|즉시|바로|응급)/i.test(query);
}

function isFreshnessSensitiveQuery(query: string) {
  return /(최신|most recent|today|current|업데이트|최근|가이드라인|권고안|권고)/i.test(query);
}

function buildGroundingDecision(query: string, imageDataUrl?: string): GroundingDecision {
  const normalized = normalizeText(query);
  const questionType: MedSafetyStructuredAnswer["question_type"] =
    imageDataUrl ? "image" :
    isCompareQuery(normalized) ? "compare" :
    isGuidelineQuery(normalized) ? "guideline" :
    isLabQuery(normalized) ? "lab" :
    isDrugQuery(normalized) ? "drug" :
    isDeviceQuery(normalized) ? "device" :
    isProcedureQuery(normalized) ? "procedure" :
    "general";

  const triageLevel: MedSafetyStructuredAnswer["triage_level"] = isCriticalQuery(normalized)
    ? "critical"
    : isUrgentQuery(normalized) || questionType === "lab" || questionType === "drug"
      ? "urgent"
      : "routine";

  return {
    question_type: questionType,
    triage_level: triageLevel,
    needs_grounding: true,
    needs_verification: triageLevel !== "routine" || questionType === "compare" || questionType === "guideline" || Boolean(imageDataUrl),
    high_risk: triageLevel !== "routine",
    freshness_sensitive: isFreshnessSensitiveQuery(normalized) || questionType === "guideline",
  };
}

function buildWebSearchProfile(searchType: SearchCreditType): MedSafetyWebSearchProfile {
  return {
    allowedDomains: [...ALLOWED_DOMAINS],
    searchContextSize: searchType === "premium" ? "high" : "medium",
    toolChoice: "required",
    includeSourceList: true,
  };
}

function describeQuestionType(questionType: GroundingDecision["question_type"]) {
  switch (questionType) {
    case "drug":
      return "약물/투약 안전 질문";
    case "lab":
      return "수치/검사 해석 질문";
    case "compare":
      return "비교 질문";
    case "guideline":
      return "가이드라인/최신 권고 질문";
    case "device":
      return "기구/장비 질문";
    case "procedure":
      return "절차/실무 질문";
    case "image":
      return "이미지 기반 임상 질문";
    default:
      return "일반 임상 질문";
  }
}

function describeTriageLevel(triageLevel: GroundingDecision["triage_level"]) {
  switch (triageLevel) {
    case "critical":
      return "critical (즉시 대응과 보고가 우선되는 상황)";
    case "urgent":
      return "urgent (빠른 재평가와 보고를 고려해야 하는 상황)";
    default:
      return "routine (일반 우선순위 상황)";
  }
}

function describeOutputLanguage(locale: Locale) {
  return locale === "en" ? "자연스러운 임상 영어" : "자연스러운 한국어 존댓말";
}

function buildQuestionFocusPrompt(decision: GroundingDecision) {
  switch (decision.question_type) {
    case "drug":
      return "이 질문의 초점은 약물/투약 안전이다. 적응증, 금기, 모니터링, 투여 전 확인사항, 즉시 보고 기준을 우선 정리하라.";
    case "lab":
      return "이 질문의 초점은 수치/검사 해석이다. 수치 자체보다 임상적 의미, 먼저 확인할 것, 재검·보고 필요성을 우선 정리하라.";
    case "compare":
      return "이 질문의 초점은 비교다. 핵심 차이, 선택 기준, 주 추천이 깨지는 조건과 예외를 분리해서 보여줘야 한다.";
    case "guideline":
      return "이 질문의 초점은 최신 권고/가이드라인이다. 문서 날짜와 최신성 한계를 분명히 반영하고, 오래된 근거는 단정하지 마라.";
    case "device":
      return "이 질문의 초점은 기구/장비 실무다. 설정, 경고, 확인 포인트, 즉시 중단 또는 보고 기준을 우선하라.";
    case "procedure":
      return "이 질문의 초점은 절차/실무 순서다. 현장에서 바로 적용할 수 있게 우선순위와 체크포인트를 간결하게 정리하라.";
    case "image":
      return "이 질문의 초점은 이미지 해석이다. 보이는 소견과 추정을 구분하고, 확정 진단처럼 단정하지 말며 위험 징후와 추가 확인 항목을 우선하라.";
    default:
      return "이 질문은 일반 임상 질문이다. 교과서식 나열보다 지금 이해해야 할 핵심과 바로 취할 행동을 우선하라.";
  }
}

function buildRetrievalPriorityPrompt(decision: GroundingDecision) {
  switch (decision.question_type) {
    case "drug":
      return "약물 질문이므로 승인 라벨, 규제기관 안전성 정보, 공공 약물 정보, 금기·상호작용·모니터링에 직접 연결되는 자료를 우선하라.";
    case "lab":
      return "수치 질문이므로 해석 기준, 위험 수치, 즉시 보고/재평가, 초기 대응에 직접 연결되는 자료를 우선하라.";
    case "compare":
      return "비교 질문이므로 각 선택지의 역할, 언제 쓰는지, 한계, 예외를 직접 비교할 수 있는 근거를 우선하라.";
    case "guideline":
      return "가이드라인 질문이므로 가장 최신의 권고문, 공식 기관 문서, 문서 날짜가 분명한 자료를 최우선으로 하라.";
    case "device":
      return "기구/장비 질문이므로 공식 사용 지침, 공공기관 안전 문서, 경고/주의사항과 직접 연결되는 자료를 우선하라.";
    case "procedure":
      return "절차 질문이므로 단계, 금기, 확인 포인트, 중단 기준과 직접 연결되는 자료를 우선하라.";
    case "image":
      return "이미지 질문이므로 이미지 자체를 단정적으로 판독하기보다, 관련 공식 해설이나 안전 경고를 우선하라.";
    default:
      return "핵심 판단과 실제 행동을 직접 바꾸는 근거를 우선하라.";
  }
}

function buildAnswerPriorityPrompt(decision: GroundingDecision) {
  const urgencyRule =
    decision.triage_level === "critical"
      ? "critical 질문이므로 bottom_line 첫 문장에서 즉시 행동과 보고/에스컬레이션을 분명히 하라."
      : decision.triage_level === "urgent"
        ? "urgent 질문이므로 관찰, 재평가, 보고 필요성을 초반에 분명히 하라."
        : "routine 질문이므로 과도한 경고보다 실무 판단 포인트를 간결하게 정리하라.";
  return [buildQuestionFocusPrompt(decision), urgencyRule].join(" ");
}

function buildRetrievalQualityPrompt(decision: GroundingDecision) {
  const balancedRule =
    decision.question_type === "compare"
      ? "비교 질문이므로 한쪽 선택지에 치우치지 말고 양쪽 선택지를 모두 직접 뒷받침하는 자료를 모아라."
      : "";
  const freshnessRule = decision.freshness_sensitive
    ? "최신성 민감 질문이므로 같은 기관의 유사 문서가 여러 개면 날짜가 가장 최신인 문서를 우선하라."
    : "";
  return [
    "claim_scope는 '이 출처가 정확히 어떤 주장이나 판단을 지지하는지'가 보이도록 한 문장으로 구체적으로 써라.",
    "너무 넓은 배경 설명이나 일반론보다, 실제 답변의 핵심 문장에 바로 연결될 수 있는 범위로 claim_scope를 좁혀라.",
    balancedRule,
    freshnessRule,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildAnswerFieldRequirementsPrompt(decision: GroundingDecision) {
  const typeRule = (() => {
    switch (decision.question_type) {
      case "drug":
        return "약물 질문이므로 key_points에는 적응증/핵심 차이보다도 안전성, 모니터링, 금기, 흔한 함정을 우선 반영하라. do_not_do와 patient_specific_caveats가 비어 있지 않도록 우선 검토하라.";
      case "lab":
        return "수치 질문이므로 key_points는 숫자 자체의 반복보다 임상적 의미와 왜 지금 중요해지는지를 담아라. recommended_actions와 when_to_escalate에 재평가·보고 판단을 실무형으로 반영하라.";
      case "compare":
        return "비교 질문이므로 bottom_line에서 선택 기준을 먼저 요약하고, comparison_table에는 역할/언제 쓰는지/효과 시작/한계/실무 포인트 차이를 분명히 나눠라.";
      case "guideline":
        return "가이드라인 질문이므로 freshness와 uncertainty에 문서 날짜와 최신성 한계를 반영하라. 오래된 문서나 상충 근거가 있으면 단정하지 마라.";
      case "device":
        return "기구 질문이므로 recommended_actions에는 설정 전 확인, 경고 대응, 중단·보고 기준을 우선 넣어라.";
      case "procedure":
        return "절차 질문이므로 recommended_actions를 순서감 있게 쓰고, key_points에는 빠뜨리면 위험한 체크포인트만 남겨라.";
      case "image":
        return "이미지 질문이므로 key_points에는 관찰 사실과 추정을 구분하고, uncertainty에 이미지 한계나 추가 확인 필요성을 분명히 남겨라.";
      default:
        return "일반 질문이므로 bottom_line과 key_points가 중복되지 않게 하고, 실제 행동을 바꾸는 정보만 남겨라.";
    }
  })();
  const triageRule =
    decision.triage_level === "critical"
      ? "critical 질문이므로 when_to_escalate는 비워두지 말고, 즉시 보고 또는 응급 대응이 필요한 이유를 짧게라도 남겨라."
      : decision.triage_level === "urgent"
        ? "urgent 질문이므로 when_to_escalate 또는 recommended_actions 중 최소 한 곳에는 빠른 보고/재평가 필요성을 넣어라."
        : "routine 질문이므로 불필요한 위기 표현은 줄이고, 실제 실무 판단 포인트를 남겨라.";
  return [typeRule, triageRule].join(" ");
}

function buildAnswerStylePrompt(decision: GroundingDecision) {
  const escalationRule =
    decision.triage_level === "routine"
      ? "과도하게 겁주지 말고 차분하게 설명하라."
      : "긴급도에 맞게 단호하고 짧게 쓰되, 공포를 조장하는 표현은 쓰지 마라.";
  return [
    "bottom_line은 짧고 직접적으로 써라. 첫 문장만 읽어도 결론과 우선순위가 보이게 하라.",
    "recommended_actions와 when_to_escalate는 가능하면 동사로 시작하고, 지금 바로 할 수 있는 행동처럼 읽히게 써라.",
    "key_points는 단순 반복이 아니라 왜 중요한지 또는 무엇을 구분해야 하는지가 드러나야 한다.",
    "한 항목에 여러 메시지를 밀어 넣지 말고, 항목 하나에는 하나의 판단이나 행동만 담아라.",
    escalationRule,
  ].join(" ");
}

function buildVerifierPriorityPrompt(decision: GroundingDecision) {
  switch (decision.question_type) {
    case "compare":
      return "비교 질문이므로 각 선택지의 차이와 선택 기준이 흐려지지 않았는지 특히 확인하라.";
    case "drug":
      return "약물 질문이므로 근거 없는 용량, 속도, 적응증, 금기 단정이 없는지 특히 확인하라.";
    case "lab":
      return "수치 질문이므로 수치 해석의 과도한 단정, 위험도/보고 기준 누락이 없는지 특히 확인하라.";
    case "guideline":
      return "가이드라인 질문이므로 최신성, 문서 날짜, 권고 강도의 과장 여부를 특히 확인하라.";
    case "image":
      return "이미지 질문이므로 확정 진단처럼 단정한 표현과 위험 징후 누락을 특히 확인하라.";
    default:
      return "주장-근거 일치와 즉시 행동 필요성 누락 여부를 특히 확인하라.";
  }
}

function buildRetrievalDeveloperPrompt(locale: Locale, searchType: SearchCreditType, decision: GroundingDecision) {
  const sourceCountRule =
    searchType === "premium" ? "가능하면 근거 패킷을 3~6개까지 반환하라." : "가능하면 근거 패킷을 1~3개까지 반환하라.";
  return [
    "너는 간호사 전용 임상 검색 시스템의 공식 근거 수집 단계다.",
    "목표는 지금 질문에 실제로 도움이 되는 공식·공공 근거만 추려서, 후속 답변이 안전하고 실무적으로 되도록 만드는 것이다.",
    "허용된 도메인 안의 공식·공공 출처만 사용하라.",
    "규제기관, 정부기관, 공공보건기관, 공공 의학 레퍼런스를 일반 배경자료보다 우선하라.",
    "문서 날짜, 기관명, URL, claim_scope를 추정하거나 만들어 넣지 마라.",
    "간호 실무 판단을 직접 바꾸는 정보, 즉 보고 기준, 위험 신호, 금기, 주의, 모니터링, 선택 기준과 직접 연결되는 근거를 우선하라.",
    buildRetrievalPriorityPrompt(decision),
    buildRetrievalQualityPrompt(decision),
    "support_strength는 핵심 주장을 직접 지지하면 direct, 배경 설명이면 background로 표시하라.",
    "근거가 부족하면 억지로 채우지 말고 부족하다고 남겨라.",
    sourceCountRule,
    `grounding_note는 ${describeOutputLanguage(locale)}로 작성하라.`,
    "반드시 JSON만 반환하라.",
  ].join("\n");
}

function buildRetrievalUserPrompt(args: {
  query: string;
  locale: Locale;
  decision: GroundingDecision;
  continuationMemory?: string;
}) {
  const memory = normalizeText(args.continuationMemory);
  return [
    `질문: ${sanitizeMedSafetyTextUrls(args.query)}`,
    `질문유형(question_type): ${args.decision.question_type} - ${describeQuestionType(args.decision.question_type)}`,
    `긴급도(triage_level): ${args.decision.triage_level} - ${describeTriageLevel(args.decision.triage_level)}`,
    args.decision.freshness_sensitive ? "최신성 민감 질문이므로 가능하면 최신 문서와 문서 날짜가 분명한 자료를 우선하라." : "",
    memory ? `직전 문맥:\n${memory}` : "",
    "이 질문의 핵심 답변을 뒷받침할 공식/공공 근거를 찾아라.",
    "특히 간호사가 보고, 재평가, 관찰, 안전 판단에 바로 써야 할 정보가 우선이다.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildAnswerDeveloperPrompt(locale: Locale, decision: GroundingDecision) {
  return [
    "너는 간호사 전용 임상 AI 어시스턴트다.",
    "모든 답변의 최우선 목표는 간호사가 지금 이 상황에서 무엇을 이해해야 하고 무엇을 해야 하는지 빠르고 명확하게 전달하는 것이다.",
    "교과서식 나열보다 임상 실무에서 바로 쓸 수 있는 정보를 우선하되, 핵심 차이와 판단 포인트가 기억되도록 실무형이면서 교육적인 답변을 작성하라.",
    "위험 상황에서는 설명보다 행동과 escalation을 먼저 제시하라.",
    "약물 용량, 수치 기준, 시간 기준, 적응증, 금기, 모니터링 기준은 evidence packet이 직접 뒷받침할 때만 단정형으로 써라.",
    "근거가 약하거나 기관·환자별로 달라질 수 있는 내용은 단정하지 말고 uncertainty 또는 evidence_status=needs_review로 낮춰라.",
    "필요하면 기관 프로토콜 확인 필요, 의사 확인 필요, 약사 확인 필요를 구체적으로 명시하라.",
    "근거가 상충하거나 부족하면 하나를 사실처럼 확정하지 말고, 현재 더 안전한 일반 원칙과 추가 확인 필요성을 함께 제시하라.",
    "간호사가 독자적으로 할 수 있는 확인·관찰·보고·중단·재평가 행동과, 의사 지시 또는 약사 확인이 필요한 행위를 혼동하지 마라.",
    "병원 내부 프로토콜, 임의의 처방, 환자별 확정 지시를 만들어 넣지 마라.",
    "답변은 구조화된 JSON이지만, 각 필드는 실제 간호 현장에서 바로 쓸 수 있게 채워라.",
    "bottom_line에는 제목 없는 결론 1~3문장을 넣고, urgent/critical이면 첫 문장에 행동 또는 보고 우선순위를 반영하라.",
    "비어 있지 않은 각 섹션(key_points, recommended_actions, do_not_do, when_to_escalate, patient_specific_caveats)은 항상 첫 항목을 소제목 아래 들어가는 핵심 요약 1문장으로 써라.",
    "각 섹션의 2번째 항목부터는 세부 bullet이다. 기본은 2개 이내 bullet로 제한하고, 위험도·보고 필요·예외 경계 때문에 꼭 필요할 때만 3번째 bullet을 허용하라.",
    "각 bullet은 기본 1문장으로 쓰고, 임상적으로 중요한 내용이 빠질 때만 2문장까지 허용하라.",
    "질문에 비해 과하지도 빈약하지도 않게, 필요한 범위에서만 구조화하라.",
    "key_points에는 핵심 판단 포인트만 넣어라. recommended_actions에는 간호사가 지금 할 수 있는 행동을 우선 넣어라.",
    "do_not_do에는 흔하지만 위험한 행동이나 근거 없는 단정을 넣어라. when_to_escalate에는 즉시 보고/에스컬레이션 기준을 넣어라.",
    "patient_specific_caveats에는 실제로 판단을 바꿀 수 있는 예외만 넣어라.",
    "comparison_table은 진짜 비교 질문일 때만 사용하라.",
    "같은 경고나 근거를 여러 필드에 반복하지 말고 가장 적절한 위치에 한 번만 넣어라.",
    "내부 설계 용어(route, pack, artifact, contract)는 절대 출력하지 마라.",
    buildAnswerPriorityPrompt(decision),
    buildAnswerFieldRequirementsPrompt(decision),
    buildAnswerStylePrompt(decision),
    `모든 사용자 노출 문구는 ${describeOutputLanguage(locale)}로 작성하라.`,
    "반드시 JSON만 반환하라.",
  ].join("\n");
}

function buildAnswerUserPrompt(args: {
  query: string;
  locale: Locale;
  decision: GroundingDecision;
  evidence: EvidenceRetrievalResult;
  continuationMemory?: string;
}) {
  const memory = normalizeText(args.continuationMemory);
  return [
    `질문: ${sanitizeMedSafetyTextUrls(args.query)}`,
    `질문유형(question_type): ${args.decision.question_type} - ${describeQuestionType(args.decision.question_type)}`,
    `긴급도(triage_level): ${args.decision.triage_level} - ${describeTriageLevel(args.decision.triage_level)}`,
    buildQuestionFocusPrompt(args.decision),
    memory ? `직전 문맥:\n${memory}` : "",
    "근거 패킷(JSON):",
    JSON.stringify(args.evidence, null, 2),
    "위 근거를 바탕으로 간호 실무에서 바로 쓸 수 있는 답변을 만들어라.",
    "시스템 출력 규칙상, 비어 있지 않은 각 섹션 배열의 첫 항목은 소제목 아래 첫 줄 요약이고, 그 다음 항목들만 bullet 세부 내용으로 사용된다.",
    "따라서 각 섹션은 필요할 때만 채우고, 첫 항목은 요약 1문장, 이후 항목은 기본 2개 이내의 짧은 bullet로 구성하라.",
    "출처가 없는 세부사항은 만들어 넣지 말고 uncertainty 또는 needs_review로 처리하라.",
    "환자 악화 가능성, 즉시 보고 기준, 중단/재평가 기준이 있으면 when_to_escalate 또는 recommended_actions에 우선 반영하라.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildVerifierDeveloperPrompt(locale: Locale, decision: GroundingDecision) {
  return [
    "너는 간호사 전용 임상 답변의 최종 안전 검증 단계다.",
    "다음 이슈만 검사하라: claim_citation_mismatch, unsupported_specificity, missing_urgency, self_contradiction, overlong_indirect.",
    "특히 근거 없는 수치·용량·강한 단정, 긴급 상황에서 에스컬레이션 누락, 자기모순, 핵심이 흐려지는 장황함을 엄격하게 본다.",
    buildVerifierPriorityPrompt(decision),
    "문제가 있으면 corrected_answer를 보수적으로 수정하라.",
    "수정할 때는 사실을 덧붙이기보다 unsupported specificity를 줄이고, 즉시 행동/보고를 분명히 하고, 근거가 약한 항목은 uncertainty 또는 needs_review로 낮춰라.",
    "간호사에게 처방권이 필요한 행동을 직접 지시하는 표현이 있으면 제거하거나 더 안전한 확인/보고 방식으로 바꿔라.",
    "비어 있지 않은 각 섹션은 첫 항목이 소제목 아래 요약 1문장인지, 이후 항목이 bullet 세부사항인지 확인하라.",
    "각 섹션이 과도하게 길거나 bullet이 너무 많으면 줄여라. 기본은 세부 bullet 2개 이내이며, 꼭 필요할 때만 3개까지 허용한다.",
    decision.triage_level === "routine"
      ? "routine 질문은 과도한 경고를 줄이고 핵심 판단을 남겨라."
      : "urgent 또는 critical 질문은 when_to_escalate 누락, recommended_actions의 미온적 표현, bottom_line 초반의 우선순위 누락을 엄격하게 잡아라.",
    "key_points가 bottom_line을 반복만 하거나, recommended_actions가 실제 행동이 아니라 배경설명으로 채워졌으면 더 실무형으로 다듬어라.",
    "문제가 없으면 passed=true로 명확히 표시하라.",
    `corrected_answer 안의 사용자 노출 문구는 ${describeOutputLanguage(locale)}로 유지하라.`,
    "notes는 한국어로 간결하게 작성하라.",
    "반드시 JSON만 반환하라.",
  ].join("\n");
}

function buildVerifierUserPrompt(args: {
  query: string;
  answer: MedSafetyStructuredAnswer;
  evidence: EvidenceRetrievalResult;
}) {
  return [
    `질문: ${sanitizeMedSafetyTextUrls(args.query)}`,
    `질문유형: ${args.answer.question_type}`,
    `긴급도: ${args.answer.triage_level}`,
    "근거 패킷(JSON):",
    JSON.stringify(args.evidence, null, 2),
    "현재 답변(JSON):",
    JSON.stringify(args.answer, null, 2),
    "과도한 단정, 근거 없는 수치, 보고 기준 누락, 간호사 역할 경계 혼동, 장황함을 점검하고 corrected_answer를 반환하라.",
  ].join("\n\n");
}

function buildFallbackStructuredAnswer(query: string, locale: Locale, sources: MedSafetySource[], groundingFailed: boolean) {
  const answer = normalizeMedSafetyStructuredAnswer(
    {
      question_type: "general",
      triage_level: "routine",
      bottom_line:
        locale === "en"
          ? "I could not fully complete the evidence-grounded answer, so only a safe summary is shown."
          : "공식 근거를 끝까지 확인하지 못해 안전한 요약만 먼저 보여드립니다.",
      bottom_line_citation_ids: [],
      key_points: [],
      recommended_actions: [
        {
          text:
            locale === "en"
              ? "Re-check the key point against an official public source and your local protocol."
              : "핵심 판단은 공식 공공 출처와 기관 프로토콜로 다시 확인해 주세요.",
          citation_ids: [],
          evidence_status: "needs_review",
        },
      ],
      do_not_do: [],
      when_to_escalate: [
        {
          text:
            locale === "en"
              ? "If the patient is deteriorating or an emergency condition is possible, escalate immediately."
              : "환자 악화나 응급 가능성이 있으면 지체하지 말고 즉시 보고·에스컬레이션하세요.",
          citation_ids: [],
          evidence_status: "needs_review",
        },
      ],
      patient_specific_caveats: [],
      uncertainty: {
        summary:
          locale === "en"
            ? "The evidence-grounded path did not complete, so specific details may be missing."
            : "근거 수집 또는 검증 단계가 끝까지 완료되지 않아 구체 항목이 부족할 수 있습니다.",
        needs_verification: true,
        reasons: [
          groundingFailed
            ? locale === "en"
              ? "Official evidence retrieval failed."
              : "공식 근거 검색이 실패했습니다."
            : locale === "en"
              ? "Answer generation was incomplete."
              : "답변 생성이 불완전했습니다.",
        ],
      },
      freshness: {
        retrieved_at: sources[0]?.retrievedAt ?? new Date().toISOString(),
        newest_effective_date: sources.map((source) => source.effectiveDate).filter(Boolean).sort().at(-1) ?? null,
        note:
          locale === "en"
            ? "Freshness verification was incomplete."
            : "최신성 확인이 완전하지 않았습니다.",
        verification_status: groundingFailed ? "dated" : "unknown",
      },
      citations: sources,
      comparison_table: [],
    },
    sources
  );
  return answer;
}

async function callStructuredModel<T>(args: {
  apiKey: string;
  model: string;
  apiBaseUrl: string;
  developerPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  signal: AbortSignal;
  maxOutputTokens: number;
  storeResponses: boolean;
  webSearchProfile?: MedSafetyWebSearchProfile;
  reasoningEffort?: "low" | "medium";
  imageDataUrl?: string;
}): Promise<StructuredCallResult<T>> {
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: args.apiBaseUrl,
    apiKey: args.apiKey,
    model: args.model,
    scope: "med_safety",
  });
  if (requestConfig.missingCredential) {
    return {
      data: null,
      rawText: "",
      responseId: null,
      usage: null,
      sources: [],
      error: requestConfig.missingCredential,
    };
  }

  const input = [
    {
      role: "developer",
      content: [{ type: "input_text", text: args.developerPrompt }],
    },
    {
      role: "user",
      content: [
        { type: "input_text", text: args.userPrompt },
        ...(args.imageDataUrl ? [{ type: "input_image", image_url: args.imageDataUrl }] : []),
      ],
    },
  ];

  const body: Record<string, unknown> = {
    model: requestConfig.model,
    input,
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        schema: args.schema,
        strict: true,
      },
    },
    max_output_tokens: args.maxOutputTokens,
    store: args.storeResponses,
  };

  if (args.webSearchProfile) {
    body.tools = [
      {
        type: "web_search_preview",
        allowed_domains: args.webSearchProfile.allowedDomains,
        search_context_size: args.webSearchProfile.searchContextSize,
      },
    ];
    body.tool_choice = args.webSearchProfile.toolChoice;
    if (args.webSearchProfile.includeSourceList) {
      body.include = ["web_search_call.action.sources"];
    }
  }

  let response: Response;
  try {
    response = await fetch(requestConfig.requestUrl, {
      method: "POST",
      headers: requestConfig.headers,
      body: JSON.stringify(body),
      signal: args.signal,
    });
  } catch (error) {
    return {
      data: null,
      rawText: "",
      responseId: null,
      usage: null,
      sources: [],
      error: `openai_network_${normalizeText(error) || "fetch_failed"}`,
    };
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      data: null,
      rawText: extractResponsesText(json),
      responseId: typeof json?.id === "string" ? json.id : null,
      usage: extractUsageNode(json?.usage),
      sources: extractMedSafetySourcesFromResponsesPayload(json),
      error: `openai_responses_${response.status}`,
    };
  }

  const rawText = extractResponsesText(json);
  if (!rawText) {
    return {
      data: null,
      rawText: "",
      responseId: typeof json?.id === "string" ? json.id : null,
      usage: extractUsageNode(json?.usage),
      sources: extractMedSafetySourcesFromResponsesPayload(json),
      error: "openai_empty_text",
    };
  }

  try {
    const parsed = JSON.parse(rawText) as T;
    return {
      data: parsed,
      rawText,
      responseId: typeof json?.id === "string" ? json.id : null,
      usage: extractUsageNode(json?.usage),
      sources: extractMedSafetySourcesFromResponsesPayload(json),
      error: null,
    };
  } catch {
    return {
      data: null,
      rawText,
      responseId: typeof json?.id === "string" ? json.id : null,
      usage: extractUsageNode(json?.usage),
      sources: extractMedSafetySourcesFromResponsesPayload(json),
      error: "structured_json_parse_failed",
    };
  }
}

function normalizeEvidenceRetrieval(raw: unknown, fallbackSources: MedSafetySource[], decision: GroundingDecision): EvidenceRetrievalResult {
  const node = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const evidencePackets = mergeMedSafetySources(
    [
      ...(Array.isArray(node.evidence_packets) ? (node.evidence_packets as Record<string, unknown>[]) : []),
      ...fallbackSources,
    ],
    12
  );
  return {
    question_type: decision.question_type,
    triage_level: decision.triage_level,
    grounding_note:
      normalizeText(node.grounding_note) ||
      (evidencePackets.length ? "공식 또는 공공 근거를 기준으로 정리했습니다." : "공식 근거를 충분히 확보하지 못했습니다."),
    evidence_packets: evidencePackets.map((source: MedSafetySource, index: number) => ({
      ...source,
      id: source.id || `src_${index + 1}`,
      supportStrength: source.supportStrength ?? "direct",
      official: source.official !== false,
      retrievedAt: source.retrievedAt ?? new Date().toISOString(),
    })),
  };
}

function normalizeVerification(raw: unknown, fallbackAnswer: MedSafetyStructuredAnswer): MedSafetyVerificationReport {
  const node = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const issues = Array.isArray(node.issues)
    ? (node.issues
        .map((item) => normalizeText(item))
        .filter(Boolean) as MedSafetyVerificationIssueCode[])
    : [];
  return {
    ran: true,
    passed: node.passed === true,
    issues,
    notes: Array.isArray(node.notes) ? node.notes.map((item) => normalizeText(item)).filter(Boolean).slice(0, 6) : [],
    corrected_answer: normalizeMedSafetyStructuredAnswer(node.corrected_answer, fallbackAnswer.citations),
  };
}

export async function analyzeMedSafetyStructuredWithOpenAI(params: AnalyzeParams): Promise<OpenAIMedSafetyStructuredOutput> {
  const startedAt = Date.now();
  const apiKey = normalizeApiKey();
  const apiBaseUrl = resolveApiBaseUrls()[0] ?? "https://api.openai.com/v1";
  const model = resolveModel(params.searchType);
  const storeResponses = resolveStoreResponses();
  const decision = buildGroundingDecision(params.query, params.imageDataUrl);
  const webSearchProfile = buildWebSearchProfile(params.searchType);
  const timeoutMs = resolveUpstreamTimeoutMs();
  const timeoutController = new AbortController();
  const relayAbort = () => timeoutController.abort();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  params.signal.addEventListener("abort", relayAbort);

  try {
    await params.onStage?.("routing", {
      triage_level: decision.triage_level,
      question_type: decision.question_type,
    });

    let retrievalNote = "";
    let retrievalUsage: ResponsesUsage | null = null;
    let retrievalSources: MedSafetySource[] = [];
    let groundingStatus: MedSafetyGroundingStatus = "none";
    let groundingError: string | null = null;
    let evidence: EvidenceRetrievalResult = {
      question_type: decision.question_type,
      triage_level: decision.triage_level,
      grounding_note: "",
      evidence_packets: [],
    };

    if (decision.needs_grounding) {
      await params.onStage?.("retrieving");
      const retrieval = await callStructuredModel<Record<string, unknown>>({
        apiKey,
        model,
        apiBaseUrl,
        developerPrompt: buildRetrievalDeveloperPrompt(params.locale, params.searchType, decision),
        userPrompt: buildRetrievalUserPrompt({
          query: params.query,
          locale: params.locale,
          decision,
          continuationMemory: params.continuationMemory,
        }),
        schemaName: "med_safety_retrieval",
        schema: RETRIEVAL_SCHEMA as unknown as Record<string, unknown>,
        signal: timeoutController.signal,
        maxOutputTokens: params.searchType === "premium" ? 3600 : 2400,
        storeResponses,
        reasoningEffort: "low",
        webSearchProfile,
      });
      retrievalUsage = retrieval.usage;
      retrievalSources = retrieval.sources;
      groundingStatus = retrieval.error ? "failed" : retrieval.sources.length ? "ok" : "failed";
      groundingError = retrieval.error;
      evidence = normalizeEvidenceRetrieval(retrieval.data, retrieval.sources, decision);
      retrievalNote = evidence.grounding_note;
    }

    await params.onStage?.("generating");
    const generated = await callStructuredModel<Record<string, unknown>>({
      apiKey,
      model,
      apiBaseUrl,
      developerPrompt: buildAnswerDeveloperPrompt(params.locale, decision),
      userPrompt: buildAnswerUserPrompt({
        query: params.query,
        locale: params.locale,
        decision,
        evidence,
        continuationMemory: params.continuationMemory,
      }),
      schemaName: "med_safety_answer",
      schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
      signal: timeoutController.signal,
      maxOutputTokens: params.searchType === "premium" ? 4600 : 3800,
      storeResponses,
      reasoningEffort: decision.high_risk ? "medium" : "low",
    });

    let answer = normalizeMedSafetyStructuredAnswer(generated.data, evidence.evidence_packets);
    let verification: MedSafetyVerificationReport | null = null;
    let verificationUsage: ResponsesUsage | null = null;

    if (decision.needs_verification && params.searchType === "premium") {
      await params.onStage?.("verifying");
      const verifyResult = await callStructuredModel<Record<string, unknown>>({
        apiKey,
        model: resolveModel("standard"),
        apiBaseUrl,
        developerPrompt: buildVerifierDeveloperPrompt(params.locale, decision),
        userPrompt: buildVerifierUserPrompt({
          query: params.query,
          answer,
          evidence,
        }),
        schemaName: "med_safety_verifier",
        schema: VERIFIER_SCHEMA as unknown as Record<string, unknown>,
        signal: timeoutController.signal,
        maxOutputTokens: 3000,
        storeResponses: false,
        reasoningEffort: "low",
      });
      verificationUsage = verifyResult.usage;
      if (verifyResult.data) {
        verification = normalizeVerification(verifyResult.data, answer);
        if (!verification.passed && verification.corrected_answer) {
          answer = verification.corrected_answer;
        }
      } else {
        verification = {
          ran: true,
          passed: false,
          issues: ["unsupported_specificity"],
          notes: ["검증 결과를 파싱하지 못해 안전하게 축약된 답변을 사용합니다."],
          corrected_answer: answer,
        };
      }
    }

    const mergedSources = mergeMedSafetySources(
      [
        ...answer.citations,
        ...evidence.evidence_packets,
        ...retrievalSources,
        ...generated.sources,
      ],
      12
    );
    const grounded = groundingStatus === "ok" && mergedSources.length > 0;
    if (!grounded && decision.needs_grounding) {
      answer = buildFallbackStructuredAnswer(params.query, params.locale, mergedSources, true);
    } else {
      answer = normalizeMedSafetyStructuredAnswer(answer, mergedSources);
    }

    const quality = buildMedSafetyQualitySnapshot({
      answer,
      verification,
      grounded,
    });
    const answerText = buildMedSafetyAnswerText(answer);
    const fallbackReason =
      generated.error || (verification && !verification.passed ? verification.issues.join("|") || "verification_failed" : null);

    return {
      query: normalizeText(params.query),
      answerText,
      answer,
      model,
      fallbackReason,
      sources: mergedSources,
      groundingMode: decision.needs_grounding ? "official_search" : "none",
      groundingStatus: grounded ? "ok" : decision.needs_grounding ? "failed" : "none",
      groundingError,
      quality,
      verification,
      latencyMs: Date.now() - startedAt,
      usage: sumUsage(retrievalUsage, generated.usage, verificationUsage),
      routeDecision: decision,
      debug: {
        retrievalNote,
      },
    };
  } catch (error) {
    const fallback = buildFallbackStructuredAnswer(params.query, params.locale, [], true);
    return {
      query: normalizeText(params.query),
      answerText: buildMedSafetyAnswerText(fallback),
      answer: fallback,
      model: resolveModel(params.searchType),
      fallbackReason: normalizeText(error) || "med_safety_structured_failed",
      sources: [],
      groundingMode: "official_search",
      groundingStatus: "failed",
      groundingError: normalizeText(error) || "med_safety_structured_failed",
      quality: buildMedSafetyQualitySnapshot({
        answer: fallback,
        verification: null,
        grounded: false,
      }),
      verification: null,
      latencyMs: Date.now() - startedAt,
      usage: null,
      routeDecision: decision,
      debug: {
        retrievalNote: "",
      },
    };
  } finally {
    clearTimeout(timer);
    params.signal.removeEventListener("abort", relayAbort);
  }
}
