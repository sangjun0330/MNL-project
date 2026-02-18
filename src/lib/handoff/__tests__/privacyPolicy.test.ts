import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHandoffPrivacyPolicy } from "../privacyPolicy";
import type { HandoffFeatureFlags } from "../types";

function baseFlags(): HandoffFeatureFlags {
  return {
    handoffEnabled: true,
    handoffLocalAsrEnabled: true,
    handoffEvidenceEnabled: true,
    handoffExecutionMode: "local_only",
    handoffRemoteSyncEnabled: false,
    handoffAsrProvider: "manual",
    handoffWebAudioCaptureEnabled: true,
    handoffWasmAsrEnabled: true,
    handoffWasmAsrWorkerUrl: "/workers/handoff-whisper.worker.js",
    handoffWasmAsrModelUrl: "/models/ko.bin",
    handoffWasmAsrRuntimeUrl: "/runtime/whisper.js",
    handoffWasmAsrEngine: "transformers_whisper",
    handoffWasmAsrModelId: "openai/whisper-small",
    handoffWasmAsrDevice: "auto",
    handoffWasmAsrDType: "q8",
    handoffVadEnabled: true,
    handoffVadMinSpeechRatio: 0.05,
    handoffVadMinSegmentMs: 180,
    handoffVadThreshold: 0.012,
    handoffWebLlmRefineEnabled: false,
    handoffWebLlmUseMlc: true,
    handoffWebLlmModelId: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    handoffPrivacyProfile: "strict",
    handoffRequireAuth: true,
  };
}

test("strict profile downgrades web_speech to manual", () => {
  const flags = baseFlags();
  flags.handoffAsrProvider = "web_speech";
  const policy = evaluateHandoffPrivacyPolicy(flags, {
    origin: "https://rnest.kr",
    hostname: "rnest.kr",
    isSecureContext: true,
  });

  assert.equal(policy.effectiveAsrProvider, "manual");
  assert.equal(policy.asrProviderDowngraded, true);
  assert.ok(policy.downgradeReason?.includes("web_speech"));
});

test("strict profile downgrades wasm_local when runtime URL is cross-origin", () => {
  const flags = baseFlags();
  flags.handoffAsrProvider = "wasm_local";
  flags.handoffWasmAsrModelUrl = "https://cdn.example.com/models/ko.bin";
  const policy = evaluateHandoffPrivacyPolicy(flags, {
    origin: "https://rnest.kr",
    hostname: "rnest.kr",
    isSecureContext: true,
  });

  assert.equal(policy.effectiveAsrProvider, "manual");
  assert.equal(policy.asrProviderDowngraded, true);
  assert.ok(policy.downgradeReason?.includes("동일 출처"));
});

test("standard profile keeps configured provider", () => {
  const flags = baseFlags();
  flags.handoffPrivacyProfile = "standard";
  flags.handoffExecutionMode = "hybrid_opt_in";
  flags.handoffRequireAuth = false;
  flags.handoffAsrProvider = "web_speech";
  const policy = evaluateHandoffPrivacyPolicy(flags, {
    origin: "https://rnest.kr",
    hostname: "rnest.kr",
    isSecureContext: true,
  });

  assert.equal(policy.effectiveAsrProvider, "web_speech");
  assert.equal(policy.asrProviderDowngraded, false);
  assert.equal(policy.authRequired, false);
});

test("local_only blocks web_speech even in standard profile", () => {
  const flags = baseFlags();
  flags.handoffPrivacyProfile = "standard";
  flags.handoffExecutionMode = "local_only";
  flags.handoffRequireAuth = false;
  flags.handoffAsrProvider = "web_speech";
  const policy = evaluateHandoffPrivacyPolicy(flags, {
    origin: "https://rnest.kr",
    hostname: "rnest.kr",
    isSecureContext: true,
  });

  assert.equal(policy.effectiveAsrProvider, "manual");
  assert.equal(policy.asrProviderDowngraded, true);
  assert.ok(policy.downgradeReason?.includes("local_only"));
});

test("local_only blocks remote sync even when configured", () => {
  const flags = baseFlags();
  flags.handoffExecutionMode = "local_only";
  flags.handoffRemoteSyncEnabled = true;
  const policy = evaluateHandoffPrivacyPolicy(flags, {
    origin: "https://rnest.kr",
    hostname: "rnest.kr",
    isSecureContext: true,
  });

  assert.equal(policy.remoteSyncConfigured, true);
  assert.equal(policy.remoteSyncEffective, false);
  assert.ok(policy.remoteSyncBlockedReason?.includes("local_only"));
});
