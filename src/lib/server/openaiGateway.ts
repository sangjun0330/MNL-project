export type OpenAIRequestScope = "recovery" | "med_safety";

export type OpenAIResponsesRequestConfig = {
  requestUrl: string;
  headers: Record<string, string>;
  model: string;
  usesCloudflareGateway: boolean;
  usesCompatEndpoint: boolean;
  authMode: "direct" | "request_header" | "stored_key";
  missingCredential: string | null;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function trimEnv(value: unknown) {
  return String(value ?? "").trim();
}

function isTruthyFlag(raw: string) {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function normalizeGatewayAuthMode(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value || value === "auto") return "auto" as const;
  if (
    [
      "request_header",
      "request-headers",
      "request",
      "key_in_request",
      "key-in-request",
      "cf_header",
      "cf-header",
      "header",
    ].includes(value)
  ) {
    return "request_header" as const;
  }
  if (
    [
      "stored_key",
      "stored-key",
      "byok",
      "gateway_key",
      "gateway-key",
      "gateway_token",
      "gateway-token",
      "byok_header",
      "byok-header",
    ].includes(value)
  ) {
    return "stored_key" as const;
  }
  return "auto" as const;
}

function resolveGatewayToken(scope: OpenAIRequestScope) {
  const values =
    scope === "med_safety"
      ? [
          process.env.OPENAI_MED_SAFETY_GATEWAY_TOKEN,
          process.env.OPENAI_MED_SAFETY_CF_AIG_TOKEN,
          process.env.CF_AIG_TOKEN,
          process.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
          process.env.OPENAI_GATEWAY_TOKEN,
          process.env.OPENAI_GATEWAY_API_KEY,
        ]
      : [
          process.env.OPENAI_RECOVERY_GATEWAY_TOKEN,
          process.env.OPENAI_RECOVERY_CF_AIG_TOKEN,
          process.env.OPENAI_MED_SAFETY_GATEWAY_TOKEN,
          process.env.OPENAI_MED_SAFETY_CF_AIG_TOKEN,
          process.env.CF_AIG_TOKEN,
          process.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
          process.env.OPENAI_GATEWAY_TOKEN,
          process.env.OPENAI_GATEWAY_API_KEY,
        ];
  return values.map(trimEnv).find(Boolean) ?? "";
}

function resolveStoredKeyFlag(scope: OpenAIRequestScope) {
  const values =
    scope === "med_safety"
      ? [
          process.env.OPENAI_MED_SAFETY_GATEWAY_USE_STORED_KEY,
          process.env.OPENAI_GATEWAY_USE_STORED_KEY,
        ]
      : [
          process.env.OPENAI_RECOVERY_GATEWAY_USE_STORED_KEY,
          process.env.OPENAI_MED_SAFETY_GATEWAY_USE_STORED_KEY,
          process.env.OPENAI_GATEWAY_USE_STORED_KEY,
        ];
  for (const raw of values) {
    const parsed = isTruthyFlag(trimEnv(raw));
    if (parsed !== null) return parsed;
  }
  return null;
}

function resolveGatewayAuthMode(scope: OpenAIRequestScope, openAIApiKey: string, gatewayToken: string) {
  const values =
    scope === "med_safety"
      ? [
          process.env.OPENAI_MED_SAFETY_GATEWAY_AUTH_MODE,
          process.env.OPENAI_GATEWAY_AUTH_MODE,
        ]
      : [
          process.env.OPENAI_RECOVERY_GATEWAY_AUTH_MODE,
          process.env.OPENAI_MED_SAFETY_GATEWAY_AUTH_MODE,
          process.env.OPENAI_GATEWAY_AUTH_MODE,
        ];

  for (const raw of values) {
    const normalized = normalizeGatewayAuthMode(trimEnv(raw));
    if (normalized !== "auto") return normalized;
  }

  const storedKeyFlag = resolveStoredKeyFlag(scope);
  if (storedKeyFlag === true) return "stored_key" as const;
  if (storedKeyFlag === false) return "request_header" as const;

  if (!gatewayToken) return "direct" as const;
  if (!openAIApiKey) return "stored_key" as const;
  return "request_header" as const;
}

function isCloudflareGatewayBaseUrl(url: string) {
  return /^https:\/\/gateway\.ai\.cloudflare\.com(?:\/|$)/i.test(url);
}

function stripKnownEndpointSuffix(url: string) {
  return url.replace(/\/(?:responses|chat\/completions)$/i, "");
}

export function normalizeOpenAIResponsesBaseUrl(raw: string) {
  const trimmed = trimEnv(raw).replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_OPENAI_BASE_URL;

  const stripped = stripKnownEndpointSuffix(trimmed);
  if (!isCloudflareGatewayBaseUrl(stripped)) return stripped || DEFAULT_OPENAI_BASE_URL;

  if (/\/compat$/i.test(stripped)) {
    return stripped.replace(/\/compat$/i, "/openai");
  }
  if (/\/openai$/i.test(stripped)) {
    return stripped;
  }
  if (/\/v1\/[^/]+\/[^/]+$/i.test(stripped)) {
    return `${stripped}/openai`;
  }
  return stripped;
}

function normalizeOpenAIResponsesModel(model: string, options: { usesCloudflareGateway: boolean; usesCompatEndpoint: boolean }) {
  const trimmed = trimEnv(model);
  if (!trimmed) {
    return options.usesCloudflareGateway && options.usesCompatEndpoint ? "openai/gpt-5.4" : "gpt-5.4";
  }
  if (options.usesCloudflareGateway && options.usesCompatEndpoint) {
    return /^openai\//i.test(trimmed) ? trimmed : `openai/${trimmed}`;
  }
  return trimmed.replace(/^openai\//i, "");
}

export function resolveOpenAIResponsesRequestConfig(args: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  scope: OpenAIRequestScope;
}): OpenAIResponsesRequestConfig {
  const normalizedBaseUrl = normalizeOpenAIResponsesBaseUrl(args.apiBaseUrl);
  const usesCloudflareGateway = isCloudflareGatewayBaseUrl(normalizedBaseUrl);
  const usesCompatEndpoint = usesCloudflareGateway && /\/compat$/i.test(normalizedBaseUrl);
  const gatewayToken = resolveGatewayToken(args.scope);
  const authMode = usesCloudflareGateway
    ? resolveGatewayAuthMode(args.scope, trimEnv(args.apiKey), gatewayToken)
    : ("direct" as const);

  const openAIApiKey = trimEnv(args.apiKey);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (usesCloudflareGateway && usesCompatEndpoint && authMode === "stored_key") {
    const compatToken = gatewayToken || openAIApiKey;
    if (compatToken) {
      headers.Authorization = `Bearer ${compatToken}`;
    }
  } else if (usesCloudflareGateway && authMode === "stored_key") {
    if (gatewayToken) {
      headers["cf-aig-authorization"] = `Bearer ${gatewayToken}`;
    }
    if (openAIApiKey) {
      headers.Authorization = `Bearer ${openAIApiKey}`;
    }
  } else if (usesCloudflareGateway && usesCompatEndpoint && authMode === "request_header") {
    const compatToken = openAIApiKey || gatewayToken;
    if (compatToken) {
      headers.Authorization = `Bearer ${compatToken}`;
    }
  } else if (usesCloudflareGateway && authMode === "request_header") {
    if (openAIApiKey) {
      headers.Authorization = `Bearer ${openAIApiKey}`;
    }
    if (gatewayToken) {
      headers["cf-aig-authorization"] = `Bearer ${gatewayToken}`;
    }
  } else if (openAIApiKey) {
    headers.Authorization = `Bearer ${openAIApiKey}`;
  }

  let missingCredential: string | null = null;
  if (usesCloudflareGateway && usesCompatEndpoint && authMode === "stored_key" && !gatewayToken && !openAIApiKey) {
    missingCredential = "missing_cf_aig_token_and_openai_api_key";
  } else if (usesCloudflareGateway && authMode === "stored_key" && !gatewayToken && !openAIApiKey) {
    missingCredential = "missing_cf_aig_token_and_openai_api_key";
  } else if (usesCloudflareGateway && usesCompatEndpoint && authMode === "request_header" && !openAIApiKey && !gatewayToken) {
    missingCredential = "missing_openai_api_key";
  } else if ((authMode === "request_header" || authMode === "direct") && !openAIApiKey) {
    missingCredential = "missing_openai_api_key";
  }

  return {
    requestUrl: `${normalizedBaseUrl}/responses`,
    headers,
    // Cloudflare Gateway canonical path for this project is /openai/responses.
    // /compat or /openai/chat/completions inputs are normalized to /openai.
    model: normalizeOpenAIResponsesModel(args.model, { usesCloudflareGateway, usesCompatEndpoint }),
    usesCloudflareGateway,
    usesCompatEndpoint,
    authMode,
    missingCredential,
  };
}
