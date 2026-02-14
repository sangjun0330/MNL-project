import type { HandoffAsrProvider, HandoffFeatureFlags, HandoffPrivacyProfile } from "./types";

type RuntimeContext = {
  origin?: string;
  hostname?: string;
  isSecureContext?: boolean;
};

export type HandoffPrivacyPolicyState = {
  profile: HandoffPrivacyProfile;
  executionMode: HandoffFeatureFlags["handoffExecutionMode"];
  authRequired: boolean;
  secureContextRequired: boolean;
  secureContextSatisfied: boolean;
  configuredAsrProvider: HandoffAsrProvider;
  effectiveAsrProvider: HandoffAsrProvider;
  asrProviderDowngraded: boolean;
  downgradeReason: string | null;
  networkEgressAllowed: boolean;
  remoteSyncConfigured: boolean;
  remoteSyncEffective: boolean;
  remoteSyncBlockedReason: string | null;
  wasmSameOriginRequired: boolean;
};

function isLocalhost(hostname: string | undefined) {
  if (!hostname) return false;
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function resolveRuntimeContext(input?: RuntimeContext): Required<RuntimeContext> {
  if (typeof window === "undefined") {
    return {
      origin: input?.origin ?? "",
      hostname: input?.hostname ?? "",
      isSecureContext: input?.isSecureContext ?? true,
    };
  }

  return {
    origin: input?.origin ?? window.location.origin,
    hostname: input?.hostname ?? window.location.hostname,
    isSecureContext: input?.isSecureContext ?? window.isSecureContext,
  };
}

function hasCrossOriginUrl(url: string, origin: string) {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return false;

  try {
    const parsed = new URL(value, origin);
    return parsed.origin !== origin;
  } catch {
    return true;
  }
}

function isHttpsOrLocal(url: string, origin: string, runtimeHostname: string) {
  const value = url.trim();
  if (!value) return true;
  try {
    const parsed = new URL(value, origin);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && isLocalhost(parsed.hostname) && isLocalhost(runtimeHostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function validateWasmLocalUrls(flags: HandoffFeatureFlags, runtime: Required<RuntimeContext>) {
  const urls = [
    flags.handoffWasmAsrWorkerUrl,
    flags.handoffWasmAsrModelUrl,
    flags.handoffWasmAsrRuntimeUrl,
  ].filter(Boolean);

  if (!urls.length) return { ok: true, reason: null as string | null };

  const hasCrossOrigin = urls.some((url) => hasCrossOriginUrl(url, runtime.origin));
  if (hasCrossOrigin) {
    return {
      ok: false,
      reason:
        "strict/local_only 모드에서는 WASM worker/model/runtime URL을 동일 출처(relative 또는 same-origin)로 제한해야 합니다.",
    };
  }

  const hasInsecureUrl = urls.some((url) => !isHttpsOrLocal(url, runtime.origin, runtime.hostname));
  if (hasInsecureUrl) {
    return {
      ok: false,
      reason: "strict/local_only 모드에서는 WASM URL에 HTTPS(로컬 개발 제외)가 필요합니다.",
    };
  }

  return { ok: true, reason: null as string | null };
}

export function evaluateHandoffPrivacyPolicy(
  flags: HandoffFeatureFlags,
  runtimeInput?: RuntimeContext
): HandoffPrivacyPolicyState {
  const runtime = resolveRuntimeContext(runtimeInput);
  const profile = flags.handoffPrivacyProfile;
  const executionMode = flags.handoffExecutionMode;
  const localOnlyMode = executionMode === "local_only";
  const strictMode = profile === "strict";
  const secureContextRequired = strictMode;
  const secureContextSatisfied =
    !secureContextRequired || runtime.isSecureContext || isLocalhost(runtime.hostname);
  const authRequired = strictMode || flags.handoffRequireAuth;

  let effectiveAsrProvider: HandoffAsrProvider = flags.handoffAsrProvider;
  let downgradeReason: string | null = null;

  if (localOnlyMode && flags.handoffAsrProvider === "web_speech") {
    effectiveAsrProvider = "manual";
    downgradeReason =
      "local_only 모드에서는 외부 전송 가능성이 있는 web_speech를 차단하고 manual 모드로 강제합니다.";
  }

  if (strictMode && flags.handoffAsrProvider === "web_speech") {
    effectiveAsrProvider = "manual";
    downgradeReason =
      "strict 모드에서는 외부 STT 가능성이 있는 web_speech를 차단하고 manual 모드로 강제합니다.";
  }

  if ((strictMode || localOnlyMode) && flags.handoffAsrProvider === "wasm_local") {
    const validation = validateWasmLocalUrls(flags, runtime);
    if (!validation.ok) {
      effectiveAsrProvider = "manual";
      downgradeReason = validation.reason;
    }
  }

  let remoteSyncEffective = flags.handoffRemoteSyncEnabled;
  let remoteSyncBlockedReason: string | null = null;
  if (localOnlyMode && flags.handoffRemoteSyncEnabled) {
    remoteSyncEffective = false;
    remoteSyncBlockedReason =
      "local_only 모드에서는 원격 동기화/원격 요약 경로를 강제 비활성화합니다.";
  }

  return {
    profile,
    executionMode,
    authRequired,
    secureContextRequired,
    secureContextSatisfied,
    configuredAsrProvider: flags.handoffAsrProvider,
    effectiveAsrProvider,
    asrProviderDowngraded: effectiveAsrProvider !== flags.handoffAsrProvider,
    downgradeReason,
    networkEgressAllowed:
      executionMode === "hybrid_opt_in" &&
      (remoteSyncEffective || effectiveAsrProvider === "web_speech"),
    remoteSyncConfigured: flags.handoffRemoteSyncEnabled,
    remoteSyncEffective,
    remoteSyncBlockedReason,
    wasmSameOriginRequired: strictMode || localOnlyMode,
  };
}
