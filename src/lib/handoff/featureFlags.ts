import type {
  HandoffAsrProvider,
  HandoffExecutionMode,
  HandoffFeatureFlags,
  HandoffPrivacyProfile,
} from "./types";

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseAsrProvider(value: string | undefined, fallback: HandoffAsrProvider): HandoffAsrProvider {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "manual") return "manual";
  if (normalized === "web_speech") return "web_speech";
  if (normalized === "wasm_local") return "wasm_local";
  return fallback;
}

function parsePrivacyProfile(
  value: string | undefined,
  fallback: HandoffPrivacyProfile
): HandoffPrivacyProfile {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "strict") return "strict";
  if (normalized === "standard") return "standard";
  return fallback;
}

function parseExecutionMode(
  value: string | undefined,
  fallback: HandoffExecutionMode
): HandoffExecutionMode {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "local_only") return "local_only";
  if (normalized === "hybrid_opt_in") return "hybrid_opt_in";
  return fallback;
}

function parseStringFlag(value: string | undefined, fallback: string) {
  if (value == null) return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized;
}

export function getHandoffFeatureFlags(): HandoffFeatureFlags {
  return {
    handoffEnabled: parseBooleanFlag(process.env.NEXT_PUBLIC_HANDOFF_ENABLED, true),
    handoffLocalAsrEnabled: parseBooleanFlag(process.env.NEXT_PUBLIC_HANDOFF_LOCAL_ASR_ENABLED, true),
    handoffEvidenceEnabled: parseBooleanFlag(process.env.NEXT_PUBLIC_HANDOFF_EVIDENCE_ENABLED, true),
    handoffExecutionMode: parseExecutionMode(
      process.env.NEXT_PUBLIC_HANDOFF_EXECUTION_MODE,
      "local_only"
    ),
    handoffRemoteSyncEnabled: parseBooleanFlag(
      process.env.NEXT_PUBLIC_HANDOFF_REMOTE_SYNC_ENABLED,
      false
    ),
    handoffAsrProvider: parseAsrProvider(process.env.NEXT_PUBLIC_HANDOFF_ASR_PROVIDER, "manual"),
    handoffWebAudioCaptureEnabled: parseBooleanFlag(
      process.env.NEXT_PUBLIC_HANDOFF_WEB_AUDIO_CAPTURE_ENABLED,
      true
    ),
    handoffWasmAsrEnabled: parseBooleanFlag(process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_ENABLED, false),
    handoffWasmAsrWorkerUrl: parseStringFlag(
      process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_WORKER_URL,
      "/workers/handoff-whisper.worker.js"
    ),
    handoffWasmAsrModelUrl: parseStringFlag(process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_MODEL_URL, ""),
    handoffWasmAsrRuntimeUrl: parseStringFlag(process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_RUNTIME_URL, ""),
    handoffPrivacyProfile: parsePrivacyProfile(process.env.NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE, "strict"),
    handoffRequireAuth: parseBooleanFlag(process.env.NEXT_PUBLIC_HANDOFF_REQUIRE_AUTH, true),
  };
}

export const HANDOFF_FLAGS = getHandoffFeatureFlags();
