import type { HandoffFeatureFlags } from "@/lib/handoff/types";
import { evaluateHandoffPrivacyPolicy } from "@/lib/handoff/privacyPolicy";
import { isWasmLocalAsrSupported } from "@/lib/handoff/wasmAsr";
import { isWebLlmRefineAvailable } from "@/lib/handoff/refine";
import { isAudioDecodeSupported } from "@/lib/handoff/vad";

export type DiagnosticStatus = "ok" | "warn" | "fail";

export type HandoffDiagnosticItem = {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
};

export type HandoffDiagnosticReport = {
  checkedAt: number;
  items: HandoffDiagnosticItem[];
};

const WEBLLM_ADAPTER_DEFAULT_URL = "/runtime/webllm-refine-adapter.js";
const WEBLLM_BACKEND_DEFAULT_URL = "/runtime/webllm-refine-backend.js";

function statusFromCondition(ok: boolean): DiagnosticStatus {
  return ok ? "ok" : "fail";
}

function getMediaRecorderSupport() {
  if (typeof window === "undefined") return false;
  return typeof (window as any).MediaRecorder !== "undefined";
}

function getSpeechRecognitionSupport() {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);
}

function normalizeAdapterUrl(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || WEBLLM_ADAPTER_DEFAULT_URL;
}

function normalizeBackendUrl(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || WEBLLM_BACKEND_DEFAULT_URL;
}

function isRelativeOrSameOrigin(url: string) {
  if (typeof window === "undefined") return true;
  if (!url) return false;
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function storageEstimateItem(): Promise<HandoffDiagnosticItem> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return {
      id: "storage-estimate",
      label: "Storage quota",
      status: "warn",
      detail: "Storage estimate API unavailable",
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;

    if (!quota) {
      return {
        id: "storage-estimate",
        label: "Storage quota",
        status: "warn",
        detail: "Quota is unknown",
      };
    }

    const ratio = usage / quota;
    const usageMb = (usage / (1024 * 1024)).toFixed(1);
    const quotaMb = (quota / (1024 * 1024)).toFixed(1);

    return {
      id: "storage-estimate",
      label: "Storage quota",
      status: ratio >= 0.85 ? "warn" : "ok",
      detail: `usage ${usageMb}MB / quota ${quotaMb}MB (${Math.round(ratio * 100)}%)`,
    };
  } catch {
    return {
      id: "storage-estimate",
      label: "Storage quota",
      status: "warn",
      detail: "Storage estimate failed",
    };
  }
}

export async function runHandoffWebDiagnostics(flags: HandoffFeatureFlags): Promise<HandoffDiagnosticReport> {
  const items: HandoffDiagnosticItem[] = [];
  const policy = evaluateHandoffPrivacyPolicy(flags);
  const secureContextReady = typeof window !== "undefined" && window.isSecureContext;

  items.push({
    id: "secure-context",
    label: "Secure context",
    status: policy.secureContextRequired ? statusFromCondition(policy.secureContextSatisfied) : "warn",
    detail: policy.secureContextRequired
      ? secureContextReady
        ? "strict profile: HTTPS secure context enabled"
        : "strict profile: HTTPS secure context required (localhost dev only exception)"
      : secureContextReady
        ? "HTTPS secure context enabled"
        : "HTTPS secure context unavailable",
  });

  const cryptoReady = typeof window !== "undefined" && Boolean(window.crypto?.subtle);
  items.push({
    id: "web-crypto",
    label: "Web Crypto",
    status: statusFromCondition(cryptoReady),
    detail: cryptoReady ? "AES-GCM available" : "window.crypto.subtle unavailable",
  });

  let localStorageReady = false;
  if (typeof window !== "undefined") {
    try {
      const key = "wnl:handoff:diag";
      window.localStorage.setItem(key, "ok");
      localStorageReady = window.localStorage.getItem(key) === "ok";
      window.localStorage.removeItem(key);
    } catch {
      localStorageReady = false;
    }
  }

  items.push({
    id: "local-storage",
    label: "Local storage",
    status: statusFromCondition(localStorageReady),
    detail: localStorageReady ? "read/write available" : "blocked by browser policy",
  });

  items.push({
    id: "privacy-profile",
    label: "Privacy profile",
    status: policy.profile === "strict" ? "ok" : "warn",
    detail:
      policy.profile === "strict"
        ? "strict profile active (auth + secure context + external STT guard)"
        : "standard profile active (looser compatibility settings)",
  });

  items.push({
    id: "execution-mode",
    label: "Execution mode",
    status: policy.executionMode === "local_only" ? "ok" : "warn",
    detail:
      policy.executionMode === "local_only"
        ? "local_only active (on-device processing only)"
        : "hybrid_opt_in active (remote path can be enabled by policy)",
  });

  items.push({
    id: "remote-sync",
    label: "Remote sync",
    status:
      policy.executionMode === "local_only"
        ? policy.remoteSyncConfigured
          ? "warn"
          : "ok"
        : policy.remoteSyncEffective
          ? "warn"
          : "ok",
    detail: (() => {
      if (policy.executionMode === "local_only") {
        if (policy.remoteSyncConfigured) {
          return `configured=true but blocked (${policy.remoteSyncBlockedReason ?? "local_only policy"})`;
        }
        return "disabled in local_only mode";
      }
      return policy.remoteSyncEffective
        ? "enabled (hybrid path active)"
        : "disabled (hybrid path available but off)";
    })(),
  });

  const mediaDevicesReady = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const mediaRecorderReady = getMediaRecorderSupport();

  items.push({
    id: "media-capture",
    label: "Audio capture",
    status: flags.handoffWebAudioCaptureEnabled
      ? (mediaDevicesReady && mediaRecorderReady ? "ok" : "warn")
      : "warn",
    detail: !flags.handoffWebAudioCaptureEnabled
      ? "disabled by feature flag"
      : mediaDevicesReady && mediaRecorderReady
        ? "MediaRecorder path ready"
        : "Mic capture unsupported; use manual transcript mode",
  });

  items.push({
    id: "vad-path",
    label: "VAD path",
    status: flags.handoffVadEnabled ? (isAudioDecodeSupported() ? "ok" : "warn") : "warn",
    detail: !flags.handoffVadEnabled
      ? "disabled by feature flag"
      : isAudioDecodeSupported()
        ? `enabled (min_ratio=${flags.handoffVadMinSpeechRatio}, min_segment_ms=${flags.handoffVadMinSegmentMs})`
        : "enabled but AudioContext decode unavailable in current runtime",
  });

  const speechRecognitionReady = getSpeechRecognitionSupport();
  const wasmAsrReady = isWasmLocalAsrSupported({
    engine: flags.handoffWasmAsrEngine,
    workerUrl: flags.handoffWasmAsrWorkerUrl,
    preferDevice: flags.handoffWasmAsrDevice,
  });
  const providerForCheck = policy.effectiveAsrProvider;
  items.push({
    id: "asr-provider",
    label: "ASR provider",
    status: (() => {
      if (providerForCheck === "manual") return "ok";
      if (providerForCheck === "web_speech") {
        return speechRecognitionReady ? "warn" : "fail";
      }
      if (!flags.handoffWasmAsrEnabled) return "warn";
      return wasmAsrReady ? "ok" : "fail";
    })(),
    detail: (() => {
      if (policy.asrProviderDowngraded) {
        return `configured ${flags.handoffAsrProvider} -> effective ${policy.effectiveAsrProvider} (${policy.downgradeReason ?? "policy guard"})`;
      }
      if (providerForCheck === "manual") {
        return "manual mode (privacy-safe default)";
      }
      if (providerForCheck === "web_speech") {
        return speechRecognitionReady
          ? "web_speech available (may use vendor cloud STT in compatible browsers)"
          : "web_speech selected but unsupported in current browser";
      }
      if (!flags.handoffWasmAsrEnabled) {
        return "wasm_local selected but disabled by feature flag";
      }
      if (!wasmAsrReady) {
        return "wasm_local selected but no worker/plugin runtime available";
      }
      const runtimeConfigured = flags.handoffWasmAsrRuntimeUrl.trim() || "/runtime/whisper-runtime.js";
      return `wasm_local available (engine=${flags.handoffWasmAsrEngine}, model_id=${flags.handoffWasmAsrModelId}, device=${flags.handoffWasmAsrDevice}, runtime=${runtimeConfigured})`;
    })(),
  });

  const webLlmAdapterUrl = normalizeAdapterUrl(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_ADAPTER_URL);
  const webLlmBackendUrl = normalizeBackendUrl(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_BACKEND_URL);
  const webLlmAdapterSameOrigin = isRelativeOrSameOrigin(webLlmAdapterUrl);
  const webLlmBackendSameOrigin = isRelativeOrSameOrigin(webLlmBackendUrl);
  const backendRuntime = typeof window !== "undefined" ? (window as any).__RNEST_WEBLLM_BACKEND__ : null;
  const backendRuntimeName =
    backendRuntime && typeof backendRuntime === "object" ? String((backendRuntime as any).runtime ?? "") : "";
  const hasBackendRuntime = Boolean(backendRuntime);
  const usingMlcBackend = flags.handoffWebLlmUseMlc;
  const mlcStatus = typeof window !== "undefined" ? (window as any).__RNEST_WEBLLM_MLC_STATUS__ : null;
  const strictOrLocal = policy.profile === "strict" || policy.executionMode === "local_only";
  const backendBlockedByPolicy = !webLlmBackendSameOrigin && strictOrLocal;
  const adapterBlockedByPolicy = !webLlmAdapterSameOrigin && strictOrLocal;
  const adapterReady = isWebLlmRefineAvailable();

  items.push({
    id: "webllm-refine",
    label: "WebLLM refine",
    status: !flags.handoffWebLlmRefineEnabled
      ? "warn"
      : adapterBlockedByPolicy
        ? "fail"
        : adapterReady
          ? usingMlcBackend
            ? mlcStatus?.ready
              ? "ok"
              : "warn"
            : hasBackendRuntime
              ? "ok"
              : "warn"
          : "warn",
    detail: !flags.handoffWebLlmRefineEnabled
      ? "disabled by feature flag"
      : adapterBlockedByPolicy
        ? `enabled but adapter URL blocked by strict/local_only policy: ${webLlmAdapterUrl}`
        : adapterReady
          ? usingMlcBackend
            ? `enabled (adapter ready, backend_mode=mlc, backend_runtime=${backendRuntimeName || "pending"}, model=${flags.handoffWebLlmModelId}, mlc_ready=${mlcStatus?.ready ? "true" : "false"}, mlc_error=${mlcStatus?.error ?? "none"}, adapter_url=${webLlmAdapterUrl})`
            : backendBlockedByPolicy
              ? `enabled (adapter ready, backend URL blocked by strict/local_only policy: ${webLlmBackendUrl})`
              : `enabled (adapter ready, backend=${hasBackendRuntime ? "ready" : "missing"}, backend_url=${webLlmBackendUrl}, adapter_url=${webLlmAdapterUrl})`
          : `enabled but runtime adapter not found (backend_url=${webLlmBackendUrl}, adapter_url=${webLlmAdapterUrl})`,
  });

  items.push(await storageEstimateItem());

  return {
    checkedAt: Date.now(),
    items,
  };
}
