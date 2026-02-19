import test from "node:test";
import assert from "node:assert/strict";
import { getHandoffFeatureFlags } from "../featureFlags";

test("getHandoffFeatureFlags parses wasm_local provider and wasm options", () => {
  process.env.NEXT_PUBLIC_HANDOFF_ENABLED = "true";
  process.env.NEXT_PUBLIC_HANDOFF_LOCAL_ASR_ENABLED = "false";
  process.env.NEXT_PUBLIC_HANDOFF_EVIDENCE_ENABLED = "true";
  process.env.NEXT_PUBLIC_HANDOFF_EXECUTION_MODE = "hybrid_opt_in";
  process.env.NEXT_PUBLIC_HANDOFF_REMOTE_SYNC_ENABLED = "true";
  process.env.NEXT_PUBLIC_HANDOFF_ASR_PROVIDER = "wasm_local";
  process.env.NEXT_PUBLIC_HANDOFF_WEB_AUDIO_CAPTURE_ENABLED = "true";
  process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_ENABLED = "true";
  process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_WORKER_URL = "/workers/custom.worker.js";
  process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_MODEL_URL = "/models/ko.bin";
  process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_RUNTIME_URL = "/runtime/whisper-runtime.js";
  process.env.NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE = "standard";
  process.env.NEXT_PUBLIC_HANDOFF_REQUIRE_AUTH = "false";

  const flags = getHandoffFeatureFlags();
  assert.equal(flags.handoffExecutionMode, "hybrid_opt_in");
  assert.equal(flags.handoffRemoteSyncEnabled, true);
  assert.equal(flags.handoffAsrProvider, "wasm_local");
  assert.equal(flags.handoffWasmAsrEnabled, true);
  assert.equal(flags.handoffWasmAsrWorkerUrl, "/workers/custom.worker.js");
  assert.equal(flags.handoffWasmAsrModelUrl, "/models/ko.bin");
  assert.equal(flags.handoffWasmAsrRuntimeUrl, "/runtime/whisper-runtime.js");
  assert.equal(flags.handoffPrivacyProfile, "standard");
  assert.equal(flags.handoffRequireAuth, false);
});

test("getHandoffFeatureFlags falls back to manual defaults when values are missing", () => {
  delete process.env.NEXT_PUBLIC_HANDOFF_ASR_PROVIDER;
  delete process.env.NEXT_PUBLIC_HANDOFF_EXECUTION_MODE;
  delete process.env.NEXT_PUBLIC_HANDOFF_REMOTE_SYNC_ENABLED;
  delete process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_ENABLED;
  delete process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_WORKER_URL;
  delete process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_MODEL_URL;
  delete process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_RUNTIME_URL;
  delete process.env.NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE;
  delete process.env.NEXT_PUBLIC_HANDOFF_REQUIRE_AUTH;

  const flags = getHandoffFeatureFlags();
  assert.equal(flags.handoffExecutionMode, "local_only");
  assert.equal(flags.handoffRemoteSyncEnabled, false);
  assert.equal(flags.handoffAsrProvider, "manual");
  assert.equal(flags.handoffWasmAsrEnabled, false);
  assert.equal(flags.handoffWasmAsrWorkerUrl, "/workers/handoff-whisper.worker.js");
  assert.equal(flags.handoffWasmAsrModelUrl, "");
  assert.equal(flags.handoffWasmAsrRuntimeUrl, "");
  assert.equal(flags.handoffPrivacyProfile, "strict");
  assert.equal(flags.handoffRequireAuth, true);
});
