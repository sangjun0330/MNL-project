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

export type SocialGroupAIBriefAIResult =
  | {
      ok: true;
      model: string;
      usage: AIRecoveryUsage | null;
      content: SocialGroupAIBriefContent;
    }
  | {
      ok: false;
      model: string;
      error: string;
    };

type SocialGroupAIBriefRequestResult =
  | {
      ok: true;
      model: string;
      usage: AIRecoveryUsage | null;
      content: SocialGroupAIBriefContent;
    }
  | {
      ok: false;
      model: string;
      error: string;
    };

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

function resolveBaseUrl() {
  return normalizeOpenAIResponsesBaseUrl(
    trimEnv(process.env.OPENAI_RECOVERY_BASE_URL) ||
      trimEnv(process.env.OPENAI_MED_SAFETY_BASE_URL) ||
      trimEnv(process.env.OPENAI_BASE_URL)
  );
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function buildSchema(snapshot: SocialGroupAIBriefSnapshot) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["hero", "findings", "actions", "windows", "personalCards"],
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
      findings: {
        type: "array",
        minItems: snapshot.findings.length,
        maxItems: snapshot.findings.length,
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
      windows: {
        type: "array",
        minItems: snapshot.windows.length,
        maxItems: snapshot.windows.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["dateISO", "label", "reason"],
          properties: {
            dateISO: { type: "string" },
            label: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      personalCards: {
        type: "array",
        minItems: snapshot.personalCards.length,
        maxItems: snapshot.personalCards.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["userId", "summary", "action"],
          properties: {
            userId: { type: "string" },
            summary: { type: "string" },
            action: { type: "string" },
          },
        },
      },
    },
  } as const;
}

function buildDeveloperPrompt() {
  return [
    "당신은 RNest 소셜의 그룹 회복 브리프 카피라이터입니다.",
    "반드시 한국어로만 작성합니다.",
    "의료 진단, 처방, 응급 판단, 비교 우열, 랭킹 표현을 쓰지 않습니다.",
    "같은 사실을 더 읽기 쉽게 짧고 따뜻하지 않지만 차분한 운영 문체로 정리합니다.",
    "원본 snapshot의 사실을 바꾸지 말고, wording만 다듬습니다.",
    "headline, subheadline, actions는 snapshot 안의 숫자와 상태 차이를 직접 반영해 상황별로 문구가 확실히 달라지게 작성합니다.",
    "body/mental/sleep/risk/off-window/night 중 가장 중요한 축을 먼저 드러내고, 매번 비슷한 첫 문장을 반복하지 않습니다.",
    "headline과 subheadline은 짧고 선명하게 작성합니다.",
    "findings와 actions는 각 카드당 1~2문장으로 제한합니다.",
    "personalCards는 낙인처럼 들리지 않게 중립적으로 씁니다.",
  ].join("\n");
}

function buildCompatDeveloperPrompt(snapshot: SocialGroupAIBriefSnapshot) {
  return [
    buildDeveloperPrompt(),
    "",
    "JSON 하나만 출력하라.",
    "설명, 코드블록, 마크다운 금지.",
    "아래 schema의 키 구조를 지켜라.",
    JSON.stringify(buildSchema(snapshot)),
  ].join("\n");
}

function buildUserPrompt(snapshot: SocialGroupAIBriefSnapshot) {
  return JSON.stringify(snapshot);
}

function shouldRetryWithCompat(error: string) {
  return (
    /openai_responses_400/i.test(error) ||
    error === "openai_social_group_brief_invalid_json" ||
    error === "openai_social_group_brief_empty_text" ||
    error === "openai_social_group_brief_parse_failed"
  );
}

async function postSocialGroupBriefRequest(args: {
  snapshot: SocialGroupAIBriefSnapshot;
  requestConfig: ReturnType<typeof resolveOpenAIResponsesRequestConfig>;
  signal: AbortSignal;
  compatMode?: boolean;
}): Promise<SocialGroupAIBriefRequestResult> {
  const compatMode = args.compatMode === true;
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
              text: compatMode ? buildCompatDeveloperPrompt(args.snapshot) : buildDeveloperPrompt(),
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
      store: false,
    }),
  });

  const raw = await response.text();
  const json = safeJsonParse<any>(raw);
  if (!response.ok) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: `openai_responses_${response.status}_social_group_brief`,
    };
  }
  if (!json) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: "openai_social_group_brief_invalid_json",
    };
  }

  const outputText = extractOutputText(json);
  if (!outputText) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: "openai_social_group_brief_empty_text",
    };
  }

  const parsed = safeJsonParse<any>(outputText);
  if (!parsed) {
    return {
      ok: false,
      model: args.requestConfig.model,
      error: "openai_social_group_brief_parse_failed",
    };
  }

  return {
    ok: true,
    model: args.requestConfig.model,
    usage: readUsage(json?.usage),
    content: mergeStructuredContent(args.snapshot, parsed),
  };
}

function mergeStructuredContent(snapshot: SocialGroupAIBriefSnapshot, raw: any): SocialGroupAIBriefContent {
  const findingMap = new Map<string, any>(
    Array.isArray(raw?.findings)
      ? raw.findings
          .map((item: any) => [String(item?.id ?? ""), item] as const)
          .filter((entry: readonly [string, any]) => Boolean(entry[0]))
      : []
  );
  const actionMap = new Map<string, any>(
    Array.isArray(raw?.actions)
      ? raw.actions
          .map((item: any) => [String(item?.id ?? ""), item] as const)
          .filter((entry: readonly [string, any]) => Boolean(entry[0]))
      : []
  );
  const windowMap = new Map<string, any>(
    Array.isArray(raw?.windows)
      ? raw.windows
          .map((item: any) => [String(item?.dateISO ?? ""), item] as const)
          .filter((entry: readonly [string, any]) => Boolean(entry[0]))
      : []
  );
  const personalCardMap = new Map<string, any>(
    Array.isArray(raw?.personalCards)
      ? raw.personalCards
          .map((item: any) => [String(item?.userId ?? ""), item] as const)
          .filter((entry: readonly [string, any]) => Boolean(entry[0]))
      : []
  );

  return {
    hero: {
      headline: clampText(raw?.hero?.headline, snapshot.hero.defaultHeadline, 48),
      subheadline: clampText(raw?.hero?.subheadline, snapshot.hero.defaultSubheadline, 84),
      tone: snapshot.hero.tone,
    },
    findings: snapshot.findings.map((item) => {
      const next = findingMap.get(item.id);
      return {
        id: item.id,
        title: clampText(next?.title, item.defaultTitle, 28),
        body: clampText(next?.body, item.defaultBody, 120),
        tone: item.tone,
        factLabel: item.factLabel,
      };
    }),
    actions: snapshot.actions.map((item) => {
      const next = actionMap.get(item.id);
      return {
        id: item.id,
        title: clampText(next?.title, item.defaultTitle, 28),
        body: clampText(next?.body, item.defaultBody, 120),
        reason: item.reason,
      };
    }),
    windows: snapshot.windows.map((item) => {
      const next = windowMap.get(item.dateISO);
      return {
        dateISO: item.dateISO,
        label: clampText(next?.label, item.label, 24),
        reason: clampText(next?.reason, item.reason, 90),
        members: item.members,
      };
    }),
    personalCards: snapshot.personalCards.map((item) => {
      const next = personalCardMap.get(item.userId);
      return {
        userId: item.userId,
        nickname: item.nickname,
        avatarEmoji: item.avatarEmoji,
        statusLabel: item.statusLabel,
        vitalScore: item.vitalScore,
        bodyBattery: item.bodyBattery,
        mentalBattery: item.mentalBattery,
        sleepDebtHours: item.sleepDebtHours,
        summary: clampText(next?.summary, item.defaultSummary, 88),
        action: clampText(next?.action, item.defaultAction, 88),
      };
    }),
  };
}

export async function generateSocialGroupBriefCopy(args: {
  snapshot: SocialGroupAIBriefSnapshot;
  model: string;
  signal: AbortSignal;
}): Promise<SocialGroupAIBriefAIResult> {
  const apiKey = normalizeApiKey();
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: resolveBaseUrl(),
    apiKey,
    model: args.model,
    scope: "recovery",
  });

  if (requestConfig.missingCredential) {
    return { ok: false, model: requestConfig.model, error: requestConfig.missingCredential };
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
      compatMode: false,
    });
    if (primary.ok) return primary;

    if (!shouldRetryWithCompat(primary.error)) {
      return primary;
    }

    const compat = await postSocialGroupBriefRequest({
      snapshot: args.snapshot,
      requestConfig,
      signal: controller.signal,
      compatMode: true,
    });
    return compat.ok ? compat : { ok: false, model: compat.model, error: compat.error || primary.error };
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
    };
  } finally {
    clearTimeout(timeout);
    args.signal.removeEventListener("abort", onAbort);
  }
}
