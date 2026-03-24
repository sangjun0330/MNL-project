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
  const raw = trimEnv(process.env.OPENAI_RECOVERY_STORE || process.env.OPENAI_MED_SAFETY_STORE || process.env.OPENAI_STORE || "true").toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function resolveConfiguredMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_RECOVERY_MAX_OUTPUT_TOKENS ?? "");
  if (!Number.isFinite(raw)) return null;
  return raw;
}

function resolveMaxOutputTokens(explicit?: number) {
  const raw = explicit != null && Number.isFinite(explicit) ? explicit : resolveConfiguredMaxOutputTokens() ?? 2400;
  if (!Number.isFinite(raw)) return 2400;
  return Math.max(1400, Math.min(8000, Math.round(raw)));
}

function resolveNetworkRetryCount() {
  const raw = Number(process.env.OPENAI_RECOVERY_NETWORK_RETRIES ?? process.env.OPENAI_MED_SAFETY_NETWORK_RETRIES ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0, Math.min(3, Math.round(raw)));
}

function resolveNetworkRetryBaseMs() {
  const raw = Number(process.env.OPENAI_RECOVERY_NETWORK_RETRY_BASE_MS ?? process.env.OPENAI_MED_SAFETY_NETWORK_RETRY_BASE_MS ?? 700);
  if (!Number.isFinite(raw)) return 700;
  return Math.max(200, Math.min(3000, Math.round(raw)));
}

function resolveUpstreamTimeoutMs() {
  const raw = Number(process.env.OPENAI_RECOVERY_UPSTREAM_TIMEOUT_MS ?? process.env.OPENAI_MED_SAFETY_UPSTREAM_TIMEOUT_MS ?? 120_000);
  if (!Number.isFinite(raw)) return 120_000;
  return Math.max(60_000, Math.min(300_000, Math.round(raw)));
}

function resolveTotalBudgetMs() {
  const raw = Number(process.env.OPENAI_RECOVERY_TOTAL_BUDGET_MS ?? process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS ?? 420_000);
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

function needsMoreOutputTokens(error: string) {
  const value = String(error ?? "").toLowerCase();
  return (
    value.includes("incomplete:max_output_tokens") ||
    value.includes("openai_responses_400_token_limit") ||
    value.includes("openai_empty_text_model:")
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractOutputText(json: any): string {
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

function normalizeUsageNode(value: unknown): AIRecoveryUsage | null {
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

function readUsage(json: any): AIRecoveryUsage | null {
  return normalizeUsageNode(json?.usage) ?? normalizeUsageNode(json?.response?.usage) ?? normalizeUsageNode(json?.metrics?.usage) ?? null;
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
    "JSON 하나만 출력하라.",
    "설명, 코드블록, 마크다운 금지.",
    "아래 schema의 키 구조를 지켜라.",
    JSON.stringify(args.schema),
  ].join("\n");
}

function buildStructuredTextDeveloperPrompt(args: StructuredRequestArgs) {
  return buildCompatStructuredDeveloperPrompt(args);
}

function buildEmptyTextError(model: string, payload: any) {
  const status = typeof payload?.status === "string" ? payload.status : "unknown";
  const incompleteReason =
    typeof payload?.incomplete_details?.reason === "string" ? payload.incomplete_details.reason : "none";
  return `openai_empty_text_model:${model}_status:${status}_incomplete:${incompleteReason}`;
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
          input: [
            {
              role: "developer",
              content: [{ type: "input_text", text: buildStructuredTextDeveloperPrompt(args) }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: args.userPrompt }],
            },
          ],
          text: {
            format: { type: "text" },
            verbosity: "medium",
          },
          reasoning: {
            effort: args.reasoningEffort,
          },
          max_output_tokens: resolveMaxOutputTokens(args.maxOutputTokens ?? 2400),
          tools: [],
          store: resolveStoreResponses(),
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
        error: buildEmptyTextError(requestConfig.model, json),
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
  let retriedWithMoreTokens = false;
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

      if (needsMoreOutputTokens(effectiveError) && !retriedWithMoreTokens) {
        retriedWithMoreTokens = true;
        const boostedArgs = {
          ...args,
          reasoningEffort: (args.reasoningEffort === "high" ? "medium" : "low") as AIRecoveryEffort,
          maxOutputTokens: Math.min((args.maxOutputTokens ?? 2400) + 1800, 5200),
        };
        console.info("[AIRecovery] openai_retry_more_tokens", {
          model: args.model,
          baseUrl,
          previousReasoningEffort: args.reasoningEffort,
          nextReasoningEffort: boostedArgs.reasoningEffort,
          previousMaxOutputTokens: args.maxOutputTokens ?? 2400,
          nextMaxOutputTokens: boostedArgs.maxOutputTokens,
        });
        const boostedResult = await postStructuredRequest(baseUrl, boostedArgs, apiKey, false);
        if ("text" in boostedResult) {
          return { ok: true, ...boostedResult };
        }
        effectiveError = boostedResult.error;
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
