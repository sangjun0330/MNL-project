import test from "node:test";
import assert from "node:assert/strict";
import { runHandoffPipeline, transcriptToRawSegments } from "../pipeline";
import { tryRefineWithWebLlm } from "../refine";

function normalizeTaskKey(task: string) {
  return task
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .toLowerCase();
}

test("tryRefineWithWebLlm keeps evidenceRef mapped to task when adapter reorders plan", async () => {
  const transcript = [
    "701호 최OO 혈압 90/60이라 30분 후 재측정 오더.",
    "701호 최OO CBC와 CRP 결과 확인 필요.",
  ].join(" ");

  const output = runHandoffPipeline({
    sessionId: "hs_refine_evidence_ref",
    dutyType: "night",
    rawSegments: transcriptToRawSegments(transcript, {
      idPrefix: "refine-evidence",
      segmentDurationMs: 3000,
    }),
  });

  assert.ok(output.result.patients.length >= 1);
  const basePatient = output.result.patients[0];
  assert.ok(basePatient.plan.length >= 2);

  const evidenceByTask = new Map(
    basePatient.plan.map((todo) => [normalizeTaskKey(todo.task), todo.evidenceRef?.segmentId ?? ""])
  );

  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    __RNEST_WEBLLM_REFINE__: async ({ result }: { result: typeof output.result }) => {
      return {
        patients: result.patients.map((patient) => ({
          patientKey: patient.patientKey,
          plan: [...patient.plan]
            .reverse()
            .map((todo) => ({
              priority: todo.priority,
              task: todo.task,
              due: todo.due,
              owner: todo.owner,
            })),
        })),
      };
    },
    setTimeout,
  };

  try {
    const outcome = await tryRefineWithWebLlm(output.result);
    const refinedPatient = outcome.result.patients[0];

    for (const todo of refinedPatient.plan) {
      const key = normalizeTaskKey(todo.task);
      assert.ok(evidenceByTask.has(key));
      const expectedSegmentId = evidenceByTask.get(key) ?? "";
      assert.equal(todo.evidenceRef?.segmentId ?? "", expectedSegmentId);
    }
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = previousWindow;
    }
  }
});

test("tryRefineWithWebLlm marks heuristic fallback when non-LLM backend source is used", async () => {
  const output = runHandoffPipeline({
    sessionId: "hs_refine_fallback_source",
    dutyType: "night",
    rawSegments: transcriptToRawSegments("701호 최OO 혈압 재측정 필요.", {
      idPrefix: "refine-fallback",
      segmentDurationMs: 2000,
    }),
  });

  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    __RNEST_WEBLLM_REFINE__: async ({ result }: { result: typeof output.result }) => {
      return {
        __source: "adapter_heuristic",
        patients: result.patients.map((patient) => ({
          patientKey: patient.patientKey,
          summary1: `${patient.patientKey}: fallback refined`,
        })),
      };
    },
    setTimeout,
  };

  try {
    const outcome = await tryRefineWithWebLlm(output.result);
    assert.equal(outcome.refined, false);
    assert.equal(outcome.reason, "refine_fallback_used");
    assert.equal(outcome.backendSource, "adapter_heuristic");
    assert.equal(outcome.result.provenance.llmRefined, false);
    assert.match(outcome.result.patients[0]?.summary1 ?? "", /fallback refined/);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = previousWindow;
    }
  }
});

test("tryRefineWithWebLlm marks llmRefined when mlc backend source is used", async () => {
  const output = runHandoffPipeline({
    sessionId: "hs_refine_llm_source",
    dutyType: "night",
    rawSegments: transcriptToRawSegments("703호 박OO 혈당 재확인 필요.", {
      idPrefix: "refine-mlc",
      segmentDurationMs: 2000,
    }),
  });

  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    __RNEST_WEBLLM_REFINE__: async ({ result }: { result: typeof output.result }) => {
      return {
        __source: "mlc_webllm",
        patients: result.patients.map((patient) => ({
          patientKey: patient.patientKey,
          summary1: `${patient.patientKey}: llm refined`,
        })),
      };
    },
    setTimeout,
  };

  try {
    const outcome = await tryRefineWithWebLlm(output.result);
    assert.equal(outcome.refined, true);
    assert.equal(outcome.reason, null);
    assert.equal(outcome.backendSource, "mlc_webllm");
    assert.equal(outcome.result.provenance.llmRefined, true);
    assert.match(outcome.result.patients[0]?.summary1 ?? "", /llm refined/);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = previousWindow;
    }
  }
});
