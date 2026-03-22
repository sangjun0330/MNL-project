import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";
import type { AIRecoveryEffort, AIRecoveryUsage } from "@/lib/aiRecovery";

type StructuredRequestArgs = {
  model: string;
  reasoningEffort: AIRecoveryEffort;
  developerPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  signal: AbortSignal;
  maxOutputTokens?: number;
};

type StructuredRequestSuccess = {
  text: string;
  responseId: string | null;
  usage: AIRecoveryUsage | null;
};

type StructuredRequestFailure = {
  error: string;
};

export type AIRecoveryOpenAIResult =
  | ({ ok: true } & StructuredRequestSuccess)
  | ({ ok: false } & StructuredRequestFailure);

function trimEnv(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeApiKey() {
  return (
    trimEnv(process.env.OPENAI_API_KEY) ||
    trimEnv(process.env.OPENAI_KEY) ||
    trimEnv(process.env.OPENAI_API_TOKEN) ||
    trimEnv(process.env.OPENAI_SECRET_KEY)
  );
}

function splitList(raw: string) {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupe(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function resolveBaseUrls() {
  const list = splitList(process.env.OPENAI_MED_SAFETY_BASE_URLS ?? "").map((item) => normalizeOpenAIResponsesBaseUrl(item));
  const single = normalizeOpenAIResponsesBaseUrl(
    trimEnv(process.env.OPENAI_MED_SAFETY_BASE_URL) || trimEnv(process.env.OPENAI_BASE_URL)
  );
  const configured = dedupe([...list, single]).filter(Boolean);
  return configured.length ? configured : ["https://api.openai.com/v1"];
}

function resolveStoreResponses() {
  const raw = trimEnv(process.env.OPENAI_MED_SAFETY_STORE || process.env.OPENAI_STORE || "true").toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function resolveMaxOutputTokens(fallback: number) {
  const raw = Number(process.env.OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1400, Math.min(8000, Math.round(raw)));
}

function resolveNetworkRetryCount() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRIES ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0, Math.min(3, Math.round(raw)));
}

function resolveNetworkRetryBaseMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_NETWORK_RETRY_BASE_MS ?? 700);
  if (!Number.isFinite(raw)) return 700;
  return Math.max(200, Math.min(3000, Math.round(raw)));
}

function resolveUpstreamTimeoutMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS ?? 120_000);
  if (!Number.isFinite(raw)) return 120_000;
  return Math.max(60_000, Math.min(300_000, Math.round(raw)));
}

function resolveTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS ?? 420_000);
  if (!Number.isFinite(raw)) return 420_000;
  return Math.max(120_000, Math.min(900_000, Math.round(raw)));
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: string) {
  const value = String(error ?? "").toLowerCase();
  if (value.startsWith("openai_network_")) return true;
  return /openai_responses_(408|409|425|429|500|502|503|504)/.test(value);
}

function isBadRequestError(error: string) {
  return /openai_responses_400/i.test(String(error ?? ""));
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function appendTextParts(out: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) {
    out.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const text = readString(record.text) ?? readString(record.output_text);
  if (text && text.trim()) {
    out.push(text);
  }
}

function appendChatMessageContent(out: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) {
    out.push(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const part of value) {
    if (typeof part === "string" && part.trim()) {
      out.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    const text = readString(record.text);
    if (text && text.trim()) {
      out.push(text);
    }
  }
}

function extractOutputText(json: any): string {
  if (Array.isArray(json?.choices)) {
    const parts: string[] = [];
    for (const choice of json.choices) {
      appendChatMessageContent(parts, choice?.message?.content);
    }
    return parts.join("\n").trim();
  }
  const parts: string[] = [];
  if (typeof json?.output_text === "string") {
    parts.push(json.output_text);
  }
  if (Array.isArray(json?.output)) {
    for (const item of json.output) {
      appendTextParts(parts, item?.content);
      if (Array.isArray(item?.content)) {
        for (const part of item.content) appendTextParts(parts, part);
      }
    }
  }
  if (Array.isArray(json?.content)) {
    for (const part of json.content) appendTextParts(parts, part);
  }
  return parts.join("\n").trim();
}

function readUsage(json: any): AIRecoveryUsage | null {
  const usage = json?.usage;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens);
  const totalTokens = Number(usage.total_tokens);
  const cachedInputTokens = Number(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens);
  const reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens);
  const asNullable = (value: number) => (Number.isFinite(value) ? Math.round(value) : null);
  return {
    inputTokens: asNullable(inputTokens),
    outputTokens: asNullable(outputTokens),
    totalTokens: asNullable(totalTokens),
    cachedInputTokens: asNullable(cachedInputTokens),
    reasoningTokens: asNullable(reasoningTokens),
  };
}

function mergeUsage(values: Array<AIRecoveryUsage | null | undefined>): AIRecoveryUsage | null {
  let hasValue = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cachedInputTokens = 0;
  let reasoningTokens = 0;
  for (const value of values) {
    if (!value) continue;
    hasValue = true;
    inputTokens += value.inputTokens ?? 0;
    outputTokens += value.outputTokens ?? 0;
    totalTokens += value.totalTokens ?? 0;
    cachedInputTokens += value.cachedInputTokens ?? 0;
    reasoningTokens += value.reasoningTokens ?? 0;
  }
  if (!hasValue) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
  };
}

export function combineAIRecoveryUsages(...values: Array<AIRecoveryUsage | null | undefined>) {
  return mergeUsage(values);
}

function safeJsonParse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function buildCompatStructuredDeveloperPrompt(args: StructuredRequestArgs) {
  return [
    args.developerPrompt,
    "",
    "반드시 JSON 하나만 출력하라.",
    "설명, 머리말, 코드블록, 마크다운을 붙이지 마라.",
    "아래 JSON schema의 키 구조를 그대로 지켜라.",
    JSON.stringify(args.schema),
  ].join("\n");
}

async function postStructuredRequest(
  baseUrl: string,
  args: StructuredRequestArgs,
  apiKey: string,
  compatMode = false
): Promise<StructuredRequestSuccess | StructuredRequestFailure> {
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: baseUrl,
    apiKey,
    model: args.model,
    scope: "med_safety",
  });

  if (requestConfig.missingCredential) {
    return { error: requestConfig.missingCredential };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("upstream_timeout"), resolveUpstreamTimeoutMs());
  const onAbort = () => controller.abort("caller_aborted");
  args.signal.addEventListener("abort", onAbort, { once: true });
  const requestUrl = requestConfig.requestUrl;

  try {
    const requestBody = compatMode
      ? {
          model: requestConfig.model,
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: buildCompatStructuredDeveloperPrompt(args) }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: args.userPrompt }],
            },
          ],
          max_output_tokens: resolveMaxOutputTokens(args.maxOutputTokens ?? 2400),
        }
      : {
          model: requestConfig.model,
          store: resolveStoreResponses(),
          reasoning: {
            effort: args.reasoningEffort,
          },
          max_output_tokens: resolveMaxOutputTokens(args.maxOutputTokens ?? 2400),
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: args.developerPrompt }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: args.userPrompt }],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: args.schemaName,
              strict: true,
              schema: args.schema,
            },
          },
        };

    console.info("[AIRecovery] openai_request_start", {
      model: requestConfig.model,
      url: requestUrl,
      compat: compatMode,
    });

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: requestConfig.headers,
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    });

    const raw = await response.text();
    const json = safeJsonParse(raw);
    if (!json) {
      return {
        error: response.ok
          ? `openai_parse_invalid_json_model:${requestConfig.model}`
          : `openai_responses_${response.status}_invalid_json_model:${requestConfig.model}`,
      };
    }
    if (!response.ok) {
      console.error("[AIRecovery] openai_request_failed", {
        model: requestConfig.model,
        url: requestUrl,
        status: response.status,
      });
      return {
        error: `openai_responses_${response.status}_model:${requestConfig.model}_${truncateError(raw || "unknown_error")}`,
      };
    }

    const text = extractOutputText(json);
    if (!text) {
      return {
        error: `openai_empty_text_model:${requestConfig.model}`,
      };
    }

    return {
      text,
      responseId: readString(json?.id),
      usage: readUsage(json),
    };
  } catch (error) {
    const name = String((error as any)?.name ?? "");
    const cause = String((error as any)?.message ?? error ?? "");
    console.error("[AIRecovery] openai_request_exception", {
      model: requestConfig.model,
      url: requestUrl,
      name,
      cause: truncateError(cause || "fetch_failed"),
    });
    if (name === "AbortError" || cause.includes("upstream_timeout")) {
      return {
        error: `openai_timeout_upstream_model:${requestConfig.model}`,
      };
    }
    return {
      error: `openai_network_${truncateError(cause || "fetch_failed")}`,
    };
  } finally {
    clearTimeout(timeout);
    args.signal.removeEventListener("abort", onAbort);
  }
}

export async function runAIRecoveryStructuredRequest(args: StructuredRequestArgs): Promise<AIRecoveryOpenAIResult> {
  const apiKey = normalizeApiKey();
  const startedAt = Date.now();
  const totalBudgetMs = resolveTotalBudgetMs();
  const retries = resolveNetworkRetryCount();
  const retryBaseMs = resolveNetworkRetryBaseMs();
  const baseUrls = resolveBaseUrls();

  let lastError = "openai_request_failed";
  for (const baseUrl of baseUrls) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (args.signal.aborted) {
        return { ok: false, error: "openai_timeout_retry_aborted" };
      }
      if (Date.now() - startedAt > totalBudgetMs) {
        return { ok: false, error: "openai_timeout_total_budget" };
      }

      const result = await postStructuredRequest(baseUrl, args, apiKey, false);
      if ("text" in result) {
        return { ok: true, ...result };
      }

      let effectiveError = result.error;
      if (isBadRequestError(result.error)) {
        const compatResult = await postStructuredRequest(baseUrl, args, apiKey, true);
        if ("text" in compatResult) {
          return { ok: true, ...compatResult };
        }
        effectiveError = compatResult.error || result.error;
      }

      lastError = effectiveError;
      if (!isRetryableError(effectiveError) || attempt >= retries) break;

      const delay = retryBaseMs * (attempt + 1);
      if (Date.now() - startedAt + delay > totalBudgetMs) {
        return { ok: false, error: "openai_timeout_total_budget" };
      }
      await sleep(delay);
    }
  }

  return { ok: false, error: lastError };
}
