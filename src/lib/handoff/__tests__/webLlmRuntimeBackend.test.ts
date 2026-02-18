import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { runHandoffPipeline, transcriptToRawSegments } from "../pipeline";

function loadWebLlmAdapter() {
  const backendPath = path.resolve(process.cwd(), "public/runtime/webllm-refine-backend.js");
  const adapterPath = path.resolve(process.cwd(), "public/runtime/webllm-refine-adapter.js");
  const backendSource = fs.readFileSync(backendPath, "utf8");
  const adapterSource = fs.readFileSync(adapterPath, "utf8");

  const context = {
    window: {} as Record<string, unknown>,
    console,
  };
  vm.createContext(context);
  vm.runInContext(backendSource, context);
  vm.runInContext(adapterSource, context);

  const backend = (context.window as any).__RNEST_WEBLLM_BACKEND__;
  const adapter = (context.window as any).__RNEST_WEBLLM_REFINE__;
  return { backend, adapter };
}

function loadWebLlmAdapterOnly() {
  const adapterPath = path.resolve(process.cwd(), "public/runtime/webllm-refine-adapter.js");
  const adapterSource = fs.readFileSync(adapterPath, "utf8");

  const context = {
    window: {} as Record<string, unknown>,
    console,
  };
  vm.createContext(context);
  vm.runInContext(adapterSource, context);

  const backend = (context.window as any).__RNEST_WEBLLM_BACKEND__;
  const adapter = (context.window as any).__RNEST_WEBLLM_REFINE__;
  return { backend, adapter };
}

test("webllm runtime backend enriches plan due and questions", async () => {
  const transcript = [
    "701호 최OO 혈압 90/60이라 수액 볼루스 시행.",
    "703호 박OO 혈당 280으로 재측정 오더.",
    "708호 정OO 소변량 감소 경향 있어 모니터링 필요.",
  ].join(" ");

  const output = runHandoffPipeline({
    sessionId: "hs_webllm_runtime_test",
    dutyType: "night",
    rawSegments: transcriptToRawSegments(transcript, {
      idPrefix: "runtime-check",
      segmentDurationMs: 3000,
    }),
  });

  const { backend, adapter } = loadWebLlmAdapter();
  assert.equal(typeof adapter, "function");
  assert.equal(backend?.runtime, "local_clinical_backend_v2");

  const refined = await adapter({ result: output.result });
  assert.ok(refined && typeof refined === "object");
  const patients = Array.isArray((refined as any).patients) ? (refined as any).patients : [];
  assert.ok(patients.length >= 2);

  for (const patient of patients) {
    assert.equal(typeof patient.summary1, "string");
    assert.match(patient.summary1, /PATIENT_/);
    assert.ok(Array.isArray(patient.questions));
    assert.ok(patient.questions.length >= 1);

    const plan = Array.isArray(patient.plan) ? patient.plan : [];
    for (const todo of plan) {
      if (todo.priority === "P0" || todo.priority === "P1") {
        assert.ok(
          todo.due === "now" || todo.due === "within_1h" || todo.due === "today" || todo.due === "next_shift"
        );
      }
    }
  }
});

test("webllm adapter-only fallback still enriches plan due and questions", async () => {
  const transcript = [
    "701호 최OO 혈압 90/60이라 수액 볼루스 시행.",
    "703호 박OO 혈당 280으로 재측정 오더.",
  ].join(" ");

  const output = runHandoffPipeline({
    sessionId: "hs_webllm_adapter_only_test",
    dutyType: "night",
    rawSegments: transcriptToRawSegments(transcript, {
      idPrefix: "adapter-only-check",
      segmentDurationMs: 3000,
    }),
  });

  const { backend, adapter } = loadWebLlmAdapterOnly();
  assert.equal(backend, undefined);
  assert.equal(typeof adapter, "function");

  const refined = await adapter({ result: output.result });
  assert.ok(refined && typeof refined === "object");
  const patients = Array.isArray((refined as any).patients) ? (refined as any).patients : [];
  assert.ok(patients.length >= 1);

  for (const patient of patients) {
    assert.ok(Array.isArray(patient.questions));
    assert.ok(patient.questions.length >= 1);
    const plan = Array.isArray(patient.plan) ? patient.plan : [];
    for (const todo of plan) {
      if (todo.priority === "P0" || todo.priority === "P1") {
        assert.ok(
          todo.due === "now" || todo.due === "within_1h" || todo.due === "today" || todo.due === "next_shift"
        );
      }
    }
  }
});
