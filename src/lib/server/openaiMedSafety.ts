import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";

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

const MED_SAFETY_LOCKED_MODEL = "gpt-5.2";

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

function resolveModelCandidates() {
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
  const raw = String(process.env.OPENAI_MED_SAFETY_STORE ?? process.env.OPENAI_STORE ?? "false")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS ?? 3200);
  if (!Number.isFinite(raw)) return 3200;
  const rounded = Math.round(raw);
  return Math.max(1400, Math.min(8000, rounded));
}

function buildOutputTokenCandidates(maxOutputTokens: number) {
  const requested = Math.max(1400, Math.round(maxOutputTokens));
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of [requested, 2800, 2400, 2000, 1600, 1400]) {
    const value = Math.max(1400, Math.min(requested, Math.round(raw)));
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.length ? out : [requested];
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

function buildDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "en") {
    return [
      "You are a bedside clinical AI assistant for nurses.",
      "Answer general nursing questions across medications, devices, clinical situations, procedures, and lab interpretation.",
      "",
      "Intent strategy:",
      "- Knowledge questions: explain definition, classification, mechanism, indications, administration principles, and practical cautions.",
      "- Action questions: prioritize bedside actions, observations, branch points, stop rules, and a short SBAR-ready report.",
      "- Comparison questions: use a compact comparison layout with clinical choice criteria.",
      "- Number or lab questions: explain normal range, bedside meaning, and what to do when abnormal.",
      "",
      "Medication and device identification safety rule:",
      "- If the question requires identifying a medication or device, identify it internally before answering.",
      "- Normalize typos, abbreviations, transliterations, spacing, and dosage-form noise into a core name.",
      "- If confidence is high, answer with the identified official name in mind.",
      "- If confidence is medium, do not provide clinical details. Instead, show 1 to 3 candidates and ask the nurse to confirm the exact name.",
      "- If confidence is low, state that the target could not be identified and stop.",
      "",
      "Output rules:",
      "- Use plain text and '-' bullets only. No markdown headings, bold, or code fences.",
      "- Keep every bullet informative and non-repetitive.",
      "- Prefer short sentences that are easy to read on mobile.",
      "- When institution-dependent values are involved, avoid hard certainty and say to check local protocol, pharmacy, or IFU.",
      "- If there is immediate danger such as air embolism, bleeding, anaphylaxis, or line failure, state the stop rule or escalation threshold clearly.",
      "- Do not fabricate facts. If uncertain, say verification is needed.",
      "",
      "Safety boundary:",
      "- This does not replace diagnosis or prescribing decisions.",
      "- The final authority is local protocol, clinician order, and manufacturer IFU.",
    ].join("\n");
  }

  return [
    "너는 간호사 전용 임상 AI 어시스턴트다.",
    "간호사가 임상 현장에서 궁금한 것을 질문하면, 질문 의도에 맞는 최적의 답변을 제공한다.",
    "",
    "[역할]",
    "- 의약품, 의료기구, 임상 상황, 간호 절차, 검사 수치 해석 등 간호 업무 전반에 대한 질문에 답한다.",
    "- 질문 의도를 자동으로 판단하여 답변 깊이와 구조를 조절한다.",
    "",
    "[질문 유형별 답변 전략]",
    "1. 정보/지식 질문에는 정의, 분류, 약리/기전, 적응증, 투여 원칙, 주의사항을 실무 중심으로 설명한다.",
    "2. 행동/대응 질문에는 핵심 판단, 지금 할 일, 확인할 수치/관찰, 원인 후보, 중단/호출 기준, 보고 문구를 우선 제시한다.",
    "3. 비교/선택 질문에는 핵심 차이와 선택 기준을 간결하게 비교한다.",
    "4. 수치/계산 질문에는 정상 범위, 임상 의미, 이상 시 조치를 구조화한다.",
    "",
    "[의약품/의료기구 식별 규칙]",
    "- 의약품이나 의료기구를 특정해야 하는 질문은 먼저 대상을 내부적으로 식별한다.",
    "- 오타, 약어, 음역, 붙여쓰기, 용량/제형 포함 입력도 정규화하여 핵심명을 추출한다.",
    "- HIGH 확신이면 정식명 기반으로 답한다.",
    "- MEDIUM 확신이면 임상 내용을 쓰지 말고 후보 1~3개와 함께 정확한 명칭 확인을 요청한다.",
    "- LOW 확신이면 확인할 수 없다고 말하고 종료한다.",
    "- 식별 미완료 상태에서 용량, 금기, 투여법, 사용법, 알람 등 임상 내용을 절대 생성하지 않는다.",
    "",
    "[출력 규칙]",
    "- 한국어 존댓말(합니다/하세요 체)로 작성한다.",
    "- 마크다운 장식(##, **, ``` )을 쓰지 않는다. 일반 텍스트와 불릿(-)만 사용한다.",
    "- 섹션 구분이 필요하면 '섹션명:' 형태로만 쓴다.",
    "- 같은 의미를 반복하지 않는다. 모든 불릿은 새로운 정보여야 한다.",
    "- 기관 차이가 큰 수치(용량/속도/희석/호환/교체주기/세팅값)는 단정하지 않고, 기관 프로토콜/약제부/IFU 확인 권장을 덧붙인다.",
    "- 모바일에서 읽기 쉽게 짧은 문장 위주로 작성한다.",
    "- 전체 답변은 보통 20~40줄 안에서 끝내되, 질문이 단순하면 더 짧아도 된다.",
    "",
    "[안전 경계]",
    "- 진단/처방 결정을 대체하지 않는다. 최종 기준은 기관 프로토콜·의사 지시·제조사 IFU다.",
    "- 절대 사실을 지어내지 않는다. 불확실하면 확인이 필요하다고 표기한다.",
    "- High-alert medication, LASA 가능성이 보이면 경고를 포함한다.",
    "- 즉시 위험 가능성이 있으면 Stop rule 또는 호출 기준을 명시한다.",
  ].join("\n");
}

function buildUserPrompt(query: string, locale: "ko" | "en") {
  if (locale === "en") {
    return `Question:\n${normalizeText(query)}`;
  }
  return normalizeText(query);
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
  const finalText = fallbackText.trim().length >= rawText.trim().length ? fallbackText.trim() : rawText.trim();
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
        reasoning: { effort: "medium" as const },
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
      error: `openai_responses_${response.status}_model:${requestConfig.model}_${truncateError(raw || "unknown_error")}`,
      responseId: null,
      conversationId: null,
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
    };
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
  const modelCandidates = resolveModelCandidates();
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

export async function analyzeMedSafetyWithOpenAI(params: AnalyzeParams): Promise<OpenAIMedSafetyOutput> {
  const apiKey = normalizeApiKey();
  const modelCandidates = resolveModelCandidates();
  const apiBaseUrls = resolveApiBaseUrls();
  const outputTokenCandidates = buildOutputTokenCandidates(resolveMaxOutputTokens());
  const responseVerbosity: ResponseVerbosity = "medium";
  const upstreamTimeoutMs = resolveUpstreamTimeoutMs();
  const totalBudgetMs = Math.max(resolveTotalBudgetMs(), Math.min(900_000, upstreamTimeoutMs + 120_000));
  const networkRetries = resolveNetworkRetryCount();
  const networkRetryBaseMs = resolveNetworkRetryBaseMs();
  const storeResponses = resolveStoreResponses();
  const developerPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt(params.query, params.locale);
  const startedAt = Date.now();

  let selectedModel = modelCandidates[0] ?? MED_SAFETY_LOCKED_MODEL;
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
          const result = buildAnalyzeResult(params.query, attempt.text);
          return {
            result,
            model: candidateModel,
            rawText: result.answer,
            fallbackReason: null,
            openaiResponseId: attempt.responseId,
            openaiConversationId: attempt.conversationId,
          };
        }
        if (attempt.error) {
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
              const result = buildAnalyzeResult(params.query, statelessRetry.text);
              return {
                result,
                model: candidateModel,
                rawText: result.answer,
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

  const fallbackAnswer = buildFallbackAnswer(params.query, params.locale, lastError);
  return {
    result: buildAnalyzeResult(params.query, fallbackAnswer),
    model: selectedModel,
    rawText: fallbackAnswer,
    fallbackReason: lastError,
    openaiResponseId: null,
    openaiConversationId: null,
  };
}
