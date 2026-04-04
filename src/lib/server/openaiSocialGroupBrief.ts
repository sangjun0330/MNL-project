import type { AIRecoveryUsage } from "@/lib/aiRecovery";
import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";
import type { SocialGroupAIBriefSnapshot } from "@/lib/server/socialGroupAIBriefModel";
import type {
  SocialGroupAIBriefAction,
  SocialGroupAIBriefFinding,
  SocialGroupAIBriefPersonalCard,
  SocialGroupAIBriefTone,
  SocialGroupAIBriefWindow,
} from "@/types/social";

type SocialGroupAIBriefContent = {
  hero: {
    headline: string;
    subheadline: string;
    tone: SocialGroupAIBriefTone;
  };
  findings: SocialGroupAIBriefFinding[];
  actions: SocialGroupAIBriefAction[];
  windows: SocialGroupAIBriefWindow[];
  personalCards: SocialGroupAIBriefPersonalCard[];
};

type SocialGroupAIBriefRequestMetadata = Record<string, string>;

type SocialGroupAIBriefRequestDebug = {
  responseId: string | null;
  traceId: string;
  storeResponses: boolean;
  requestUrl: string;
  authMode: "direct" | "request_header" | "stored_key";
  usesCloudflareGateway: boolean;
  requestMetadata: SocialGroupAIBriefRequestMetadata;
};

const BANNED_PHRASES = [
  "비교적 안정적으로 유지",
  "먼저 고정",
  "흔들리지 않게 유지",
  "잘 활용하면 좋습니다",
  "우선입니다",
];

export type SocialGroupAIBriefAIResult =
  | {
      ok: true;
      model: string;
      usage: AIRecoveryUsage | null;
      content: SocialGroupAIBriefContent;
    } & SocialGroupAIBriefRequestDebug
  | {
      ok: false;
      model: string;
      error: string;
    } & SocialGroupAIBriefRequestDebug;

type SocialGroupAIBriefRequestResult =
  | {
      ok: true;
      model: string;
      usage: AIRecoveryUsage | null;
      content: SocialGroupAIBriefContent;
    } & SocialGroupAIBriefRequestDebug
  | {
      ok: false;
      model: string;
      error: string;
    } & SocialGroupAIBriefRequestDebug;

function trimEnv(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeApiKey() {
  return (
    trimEnv(process.env.OPENAI_SOCIAL_GROUP_BRIEF_API_KEY) ||
    trimEnv(process.env.OPENAI_SOCIAL_GROUP_BRIEF_KEY) ||
    trimEnv(process.env.OPENAI_SOCIAL_GROUP_BRIEF_API_TOKEN) ||
    trimEnv(process.env.OPENAI_API_KEY) ||
    trimEnv(process.env.OPENAI_KEY) ||
    trimEnv(process.env.OPENAI_API_TOKEN) ||
    trimEnv(process.env.OPENAI_SECRET_KEY)
  );
}

function resolveBaseUrl() {
  return normalizeOpenAIResponsesBaseUrl(
    trimEnv(process.env.OPENAI_SOCIAL_GROUP_BRIEF_BASE_URL) ||
      trimEnv(process.env.OPENAI_BASE_URL)
  );
}

function resolveStoreResponses() {
  const raw = trimEnv(
    process.env.OPENAI_SOCIAL_GROUP_BRIEF_STORE ||
      process.env.OPENAI_STORE ||
      "true"
  ).toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function createTraceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `social-group-brief-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildRequestMetadata(args: {
  traceId: string;
  groupId: number;
  generatorType: "cron" | "manual";
  promptVersion: string;
  snapshot: SocialGroupAIBriefSnapshot;
}): SocialGroupAIBriefRequestMetadata {
  return {
    feature: "social_group_brief",
    trace_id: args.traceId,
    group_id: String(args.groupId),
    week_start: args.snapshot.week.startISO,
    generator: args.generatorType,
    prompt_version: args.promptVersion,
    archetype: args.snapshot.copyMeta.archetypeId,
    copy_slot: args.snapshot.copyMeta.copySlotKey,
    copy_fp: args.snapshot.copyMeta.copyFingerprint,
  };
}

function readUsage(value: any): AIRecoveryUsage | null {
  if (!value || typeof value !== "object") return null;
  const inputTokens = readNumber(value.input_tokens ?? value.prompt_tokens);
  const outputTokens = readNumber(value.output_tokens ?? value.completion_tokens);
  const totalTokens =
    readNumber(value.total_tokens) ??
    (inputTokens != null || outputTokens != null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  const cachedInputTokens = readNumber(value?.input_tokens_details?.cached_tokens);
  const reasoningTokens = readNumber(value?.output_tokens_details?.reasoning_tokens);
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
    if (typeof node.text === "object" && node.text) append((node.text as Record<string, unknown>).value);
    append(node.output_text);
    append(node.transcript);
  };

  appendFromTextLike(json?.output_text);
  appendFromTextLike(json?.choices?.[0]?.message?.content);

  const output = Array.isArray(json?.output) ? json.output : [];
  for (const item of output) {
    appendFromTextLike(item?.text);
    appendFromTextLike(item?.output_text);
    appendFromTextLike(item?.transcript);
    appendFromTextLike(item?.content);
  }

  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampText(value: unknown, fallback: string, limit: number) {
  const clean = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return fallback;
  return Array.from(clean).slice(0, limit).join("");
}

function previewForLog(value: unknown, limit = 220) {
  const clean = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return Array.from(clean).slice(0, limit).join("");
}

function containsBannedPhrase(value: string) {
  return BANNED_PHRASES.some((phrase) => value.includes(phrase));
}

function extractOpener(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function shouldPreserveNumericFact(fallback: string, candidate: string) {
  return !/\d/.test(fallback) || /\d/.test(candidate);
}

function sanitizeCopyText(args: {
  value: unknown;
  fallback: string;
  limit: number;
  rejectRepeatedOpener?: Set<string>;
}) {
  const clean = clampText(args.value, args.fallback, args.limit);
  if (!clean) return args.fallback;
  if (containsBannedPhrase(clean)) return args.fallback;
  if (!shouldPreserveNumericFact(args.fallback, clean)) return args.fallback;
  if (args.rejectRepeatedOpener) {
    const opener = extractOpener(clean);
    if (args.rejectRepeatedOpener.has(opener)) return args.fallback;
    args.rejectRepeatedOpener.add(opener);
  }
  return clean;
}

function buildSchema(snapshot: SocialGroupAIBriefSnapshot) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["hero", "actions"],
    properties: {
      hero: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "subheadline"],
        properties: {
          headline: { type: "string" },
          subheadline: { type: "string" },
        },
      },
      actions: {
        type: "array",
        minItems: snapshot.actions.length,
        maxItems: snapshot.actions.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "body"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
          },
        },
      },
    },
  } as const;
}

function buildDeveloperPrompt(snapshot: SocialGroupAIBriefSnapshot) {
  return [
    "당신은 RNest 소셜의 그룹 회복 브리프 카피라이터입니다.",
    "반드시 한국어로만 작성합니다.",
    "hero와 actions만 다듬고, findings/windows/personalCards는 건드리지 않습니다.",
    "의료 진단, 처방, 응급 판단, 비교 우열, 랭킹 표현, 감상적 위로 문장을 쓰지 않습니다.",
    "상태 → 원인 → 이번 주 권장 방향 구조를 유지합니다.",
    "원본 fact bundle의 숫자, 위험 인원, 야간 수, 겹치는 회복 창 수, 액션 순서를 절대 바꾸지 않습니다.",
    "headline, subheadline, action title opener가 서로 반복되지 않게 작성합니다.",
    `다음 표현은 피합니다: ${BANNED_PHRASES.join(", ")}`,
    `dominantAxis=${snapshot.narrativeSpec.dominantAxis}, secondaryAxis=${snapshot.narrativeSpec.secondaryAxis}, severity=${snapshot.narrativeSpec.severityBand}`,
    "기본 deterministic 문구보다 더 선명하고 상황 차이가 드러날 때만 바꿉니다. 애매하면 기본 문구를 유지합니다.",
    "hero headline은 48자 이내, subheadline은 84자 이내, action title은 28자 이내, action body는 120자 이내로 유지합니다.",
  ].join("\n");
}

function buildCompatDeveloperPrompt(snapshot: SocialGroupAIBriefSnapshot) {
  return [
    buildDeveloperPrompt(snapshot),
    "",
    "JSON 하나만 출력하라.",
    "설명, 코드블록, 마크다운 금지.",
    "아래 schema의 키 구조를 지켜라.",
    JSON.stringify(buildSchema(snapshot)),
  ].join("\n");
}

function buildUserPrompt(snapshot: SocialGroupAIBriefSnapshot) {
  return JSON.stringify({
    narrativeSpec: snapshot.narrativeSpec,
    factBundle: snapshot.factBundle,
    previousCopy: snapshot.previousCopy,
    deterministicDefault: {
      hero: {
        headline: snapshot.hero.defaultHeadline,
        subheadline: snapshot.hero.defaultSubheadline,
        tone: snapshot.hero.tone,
      },
      actions: snapshot.actions.map((item) => ({
        id: item.id,
        title: item.defaultTitle,
        body: item.defaultBody,
        reason: item.reason,
        factText: item.factText,
      })),
    },
    bannedPhrases: BANNED_PHRASES,
  });
}

function shouldRetryWithCompat(error: string) {
  return (
    /openai_responses_400/i.test(error) ||
    error === "openai_social_group_brief_invalid_json" ||
    error === "openai_social_group_brief_empty_text" ||
    error === "openai_social_group_brief_parse_failed"
  );
}

function shouldRetryDirectWithoutGateway(error: string) {
  return (
    shouldRetryWithCompat(error) ||
    /^openai_responses_(401|403|404|408|409|422|425|429|500|502|503|504)_social_group_brief$/i.test(error) ||
    error === "openai_social_group_brief_timeout" ||
    error.startsWith("openai_social_group_brief_network_")
  );
}

async function postSocialGroupBriefRequest(args: {
  snapshot: SocialGroupAIBriefSnapshot;
  requestConfig: ReturnType<typeof resolveOpenAIResponsesRequestConfig>;
  signal: AbortSignal;
  traceId: string;
  storeResponses: boolean;
  requestMetadata: SocialGroupAIBriefRequestMetadata;
  compatMode?: boolean;
}): Promise<SocialGroupAIBriefRequestResult> {
  const compatMode = args.compatMode === true;
  const responseDebugHeaders = (response: Response) => ({
    requestId: readString(response.headers.get("x-request-id")),
    cfAigRequestId: readString(response.headers.get("cf-aig-request-id")),
    cfRay: readString(response.headers.get("cf-ray")),
  });
  console.info("[SocialGroupAIBrief] openai_request_start", {
    traceId: args.traceId,
    model: args.requestConfig.model,
    url: args.requestConfig.requestUrl,
    compatMode,
    storeResponses: args.storeResponses,
    authMode: args.requestConfig.authMode,
    usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
    metadata: args.requestMetadata,
  });
  const response = await fetch(args.requestConfig.requestUrl, {
    method: "POST",
    headers: args.requestConfig.headers,
    signal: args.signal,
    body: JSON.stringify({
      model: args.requestConfig.model,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: compatMode ? buildCompatDeveloperPrompt(args.snapshot) : buildDeveloperPrompt(args.snapshot),
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildUserPrompt(args.snapshot) }],
        },
      ],
      text: compatMode
        ? {
            format: { type: "text" },
            verbosity: "low",
          }
        : {
            format: {
              type: "json_schema",
              name: "social_group_brief",
              schema: buildSchema(args.snapshot),
              strict: true,
            },
          },
      reasoning: {
        effort: compatMode ? "low" : /^gpt-5\.4(?:$|[-_])/i.test(String(args.requestConfig.model)) ? "medium" : "low",
      },
      max_output_tokens: compatMode ? 2600 : 2200,
      tools: [],
      metadata: args.requestMetadata,
      store: args.storeResponses,
    }),
  });

  const raw = await response.text();
  const json = safeJsonParse<any>(raw);
  const headerDebug = responseDebugHeaders(response);
  if (!response.ok) {
    console.error("[SocialGroupAIBrief] openai_request_failed", {
      traceId: args.traceId,
      model: args.requestConfig.model,
      url: args.requestConfig.requestUrl,
      status: response.status,
      compatMode,
      ...headerDebug,
      errorPreview: previewForLog(raw),
    });
    return {
      ok: false,
      model: args.requestConfig.model,
      error: `openai_responses_${response.status}_social_group_brief`,
      responseId: readString(json?.id),
      traceId: args.traceId,
      storeResponses: args.storeResponses,
      requestUrl: args.requestConfig.requestUrl,
      authMode: args.requestConfig.authMode,
      usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
      requestMetadata: args.requestMetadata,
    };
  }
  if (!json) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: "openai_social_group_brief_invalid_json",
      responseId: null,
      traceId: args.traceId,
      storeResponses: args.storeResponses,
      requestUrl: args.requestConfig.requestUrl,
      authMode: args.requestConfig.authMode,
      usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
      requestMetadata: args.requestMetadata,
    };
  }

  const outputText = extractOutputText(json);
  if (!outputText) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: "openai_social_group_brief_empty_text",
      responseId: readString(json?.id),
      traceId: args.traceId,
      storeResponses: args.storeResponses,
      requestUrl: args.requestConfig.requestUrl,
      authMode: args.requestConfig.authMode,
      usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
      requestMetadata: args.requestMetadata,
    };
  }

  const parsed = safeJsonParse<any>(outputText);
  if (!parsed) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: "openai_social_group_brief_parse_failed",
      responseId: readString(json?.id),
      traceId: args.traceId,
      storeResponses: args.storeResponses,
      requestUrl: args.requestConfig.requestUrl,
      authMode: args.requestConfig.authMode,
      usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
      requestMetadata: args.requestMetadata,
    };
  }

  const responseId = readString(json?.id);
  console.info("[SocialGroupAIBrief] openai_request_success", {
    traceId: args.traceId,
    responseId,
    model: args.requestConfig.model,
    url: args.requestConfig.requestUrl,
    compatMode,
    storeResponses: args.storeResponses,
    authMode: args.requestConfig.authMode,
    usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
    ...headerDebug,
    usage: readUsage(json?.usage),
  });
  return {
    ok: true,
    model: args.requestConfig.model,
    usage: readUsage(json?.usage),
    content: mergeStructuredContent(args.snapshot, parsed),
    responseId,
    traceId: args.traceId,
    storeResponses: args.storeResponses,
    requestUrl: args.requestConfig.requestUrl,
    authMode: args.requestConfig.authMode,
    usesCloudflareGateway: args.requestConfig.usesCloudflareGateway,
    requestMetadata: args.requestMetadata,
  };
}

function mergeStructuredContent(snapshot: SocialGroupAIBriefSnapshot, raw: any): SocialGroupAIBriefContent {
  const actionMap = new Map<string, any>(
    Array.isArray(raw?.actions)
      ? raw.actions
          .map((item: any) => [String(item?.id ?? ""), item] as const)
          .filter((entry: readonly [string, any]) => Boolean(entry[0]))
      : []
  );
  const usedOpeners = new Set<string>();
  const headline = sanitizeCopyText({
    value: raw?.hero?.headline,
    fallback: snapshot.hero.defaultHeadline,
    limit: 48,
    rejectRepeatedOpener: usedOpeners,
  });
  const subheadline = sanitizeCopyText({
    value: raw?.hero?.subheadline,
    fallback: snapshot.hero.defaultSubheadline,
    limit: 84,
  });

  return {
    hero: {
      headline,
      subheadline,
      tone: snapshot.hero.tone,
    },
    findings: snapshot.findings.map((item) => ({
      id: item.id,
      title: item.defaultTitle,
      body: item.defaultBody,
      tone: item.tone,
      factLabel: item.factLabel,
    })),
    actions: snapshot.actions.map((item) => {
      const next = actionMap.get(item.id);
      return {
        id: item.id,
        title: sanitizeCopyText({
          value: next?.title,
          fallback: item.defaultTitle,
          limit: 28,
          rejectRepeatedOpener: usedOpeners,
        }),
        body: sanitizeCopyText({
          value: next?.body,
          fallback: item.defaultBody,
          limit: 120,
        }),
        reason: item.reason,
      };
    }),
    windows: snapshot.windows.map((item) => ({
      dateISO: item.dateISO,
      label: item.label,
      reason: item.reason,
      members: item.members,
    })),
    personalCards: snapshot.personalCards.map((item) => ({
      userId: item.userId,
      nickname: item.nickname,
      avatarEmoji: item.avatarEmoji,
      statusLabel: item.statusLabel,
      vitalScore: item.vitalScore,
      bodyBattery: item.bodyBattery,
      mentalBattery: item.mentalBattery,
      sleepDebtHours: item.sleepDebtHours,
      summary: item.defaultSummary,
      action: item.defaultAction,
    })),
  };
}

export async function generateSocialGroupBriefCopy(args: {
  snapshot: SocialGroupAIBriefSnapshot;
  model: string;
  signal: AbortSignal;
  groupId: number;
  generatorType: "cron" | "manual";
  promptVersion: string;
}): Promise<SocialGroupAIBriefAIResult> {
  const apiKey = normalizeApiKey();
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: resolveBaseUrl(),
    apiKey,
    model: args.model,
    scope: "social_group_brief",
  });
  const traceId = createTraceId();
  const storeResponses = resolveStoreResponses();
  const requestMetadata = buildRequestMetadata({
    traceId,
    groupId: args.groupId,
    generatorType: args.generatorType,
    promptVersion: args.promptVersion,
    snapshot: args.snapshot,
  });

  if (requestConfig.missingCredential) {
    return {
      ok: false,
      model: requestConfig.model,
      error: requestConfig.missingCredential,
      responseId: null,
      traceId,
      storeResponses,
      requestUrl: requestConfig.requestUrl,
      authMode: requestConfig.authMode,
      usesCloudflareGateway: requestConfig.usesCloudflareGateway,
      requestMetadata,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("social_group_brief_timeout"), 45_000);
  const onAbort = () => controller.abort("caller_aborted");
  args.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const primary = await postSocialGroupBriefRequest({
      snapshot: args.snapshot,
      requestConfig,
      signal: controller.signal,
      traceId,
      storeResponses,
      requestMetadata,
      compatMode: false,
    });
    let finalResult: SocialGroupAIBriefRequestResult = primary;
    if (!primary.ok && shouldRetryWithCompat(primary.error)) {
      console.warn("[SocialGroupAIBrief] openai_request_retry_compat", {
        traceId,
        model: requestConfig.model,
        url: requestConfig.requestUrl,
        error: primary.error,
      });

      const compat = await postSocialGroupBriefRequest({
        snapshot: args.snapshot,
        requestConfig,
        signal: controller.signal,
        traceId,
        storeResponses,
        requestMetadata,
        compatMode: true,
      });
      finalResult = compat.ok
        ? compat
        : {
            ok: false,
            model: compat.model,
            error: compat.error || primary.error,
            responseId: compat.responseId,
            traceId,
            storeResponses,
            requestUrl: requestConfig.requestUrl,
            authMode: requestConfig.authMode,
            usesCloudflareGateway: requestConfig.usesCloudflareGateway,
            requestMetadata,
          };
    }

    if (
      !finalResult.ok &&
      requestConfig.usesCloudflareGateway &&
      apiKey &&
      shouldRetryDirectWithoutGateway(finalResult.error)
    ) {
      const directRequestConfig = resolveOpenAIResponsesRequestConfig({
        apiBaseUrl: "https://api.openai.com/v1",
        apiKey,
        model: args.model,
        scope: "social_group_brief",
      });
      if (directRequestConfig.requestUrl !== requestConfig.requestUrl) {
        console.warn("[SocialGroupAIBrief] openai_request_retry_direct", {
          traceId,
          gatewayUrl: requestConfig.requestUrl,
          directUrl: directRequestConfig.requestUrl,
          gatewayError: finalResult.error,
        });
        const directPrimary = await postSocialGroupBriefRequest({
          snapshot: args.snapshot,
          requestConfig: directRequestConfig,
          signal: controller.signal,
          traceId,
          storeResponses,
          requestMetadata,
          compatMode: false,
        });
        if (directPrimary.ok) return directPrimary;
        if (shouldRetryWithCompat(directPrimary.error)) {
          console.warn("[SocialGroupAIBrief] openai_request_retry_direct_compat", {
            traceId,
            model: directRequestConfig.model,
            url: directRequestConfig.requestUrl,
            error: directPrimary.error,
          });
          const directCompat = await postSocialGroupBriefRequest({
            snapshot: args.snapshot,
            requestConfig: directRequestConfig,
            signal: controller.signal,
            traceId,
            storeResponses,
            requestMetadata,
            compatMode: true,
          });
          if (directCompat.ok) return directCompat;
          return {
            ok: false,
            model: directCompat.model,
            error: directCompat.error || directPrimary.error,
            responseId: directCompat.responseId,
            traceId,
            storeResponses,
            requestUrl: directRequestConfig.requestUrl,
            authMode: directRequestConfig.authMode,
            usesCloudflareGateway: directRequestConfig.usesCloudflareGateway,
            requestMetadata,
          };
        }
        return directPrimary;
      }
    }

    return finalResult;
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    const name = String((error as any)?.name ?? "");
    return {
      ok: false,
      model: requestConfig.model,
      error:
        name === "AbortError" || message.includes("social_group_brief_timeout")
          ? "openai_social_group_brief_timeout"
          : `openai_social_group_brief_network_${message.slice(0, 120)}`,
      responseId: null,
      traceId,
      storeResponses,
      requestUrl: requestConfig.requestUrl,
      authMode: requestConfig.authMode,
      usesCloudflareGateway: requestConfig.usesCloudflareGateway,
      requestMetadata,
    };
  } finally {
    clearTimeout(timeout);
    args.signal.removeEventListener("abort", onAbort);
  }
}
