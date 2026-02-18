import { sanitizeStructuredSession } from "./deidGuard";
import type { HandoverSessionResult, PatientCard } from "./types";

export type HandoffRefineAdapterInput = {
  result: HandoverSessionResult;
};

export type HandoffRefineAdapter =
  | ((input: HandoffRefineAdapterInput) => Promise<unknown>)
  | ((input: HandoffRefineAdapterInput) => unknown);

export type RefineOutcome = {
  result: HandoverSessionResult;
  refined: boolean;
  reason: string | null;
};

declare global {
  interface Window {
    __RNEST_WEBLLM_REFINE__?: HandoffRefineAdapter;
  }
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const strings = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return strings.length ? strings : [];
}

function normalizePatientPatch(base: PatientCard, patch: unknown) {
  if (!patch || typeof patch !== "object") return base;
  const source = patch as Partial<PatientCard>;

  const nextSummary = typeof source.summary1 === "string" ? source.summary1.trim() : base.summary1;
  const nextWatch = readStringArray(source.watchFor) ?? base.watchFor;
  const nextQuestions = readStringArray(source.questions) ?? base.questions;

  const nextPlan =
    Array.isArray(source.plan) && source.plan.length
      ? source.plan.map((todo, index) => {
          const current = base.plan[index];
          const task = typeof todo?.task === "string" ? todo.task.trim() : current?.task ?? "";
          return {
            priority:
              todo?.priority === "P0" || todo?.priority === "P1" || todo?.priority === "P2"
                ? todo.priority
                : current?.priority ?? "P2",
            task: task || current?.task || "",
            due:
              todo?.due === "now" ||
              todo?.due === "within_1h" ||
              todo?.due === "today" ||
              todo?.due === "next_shift"
                ? todo.due
                : current?.due,
            owner:
              todo?.owner === "RN" || todo?.owner === "MD" || todo?.owner === "RT" || todo?.owner === "LAB"
                ? todo.owner
                : current?.owner,
            evidenceRef: current?.evidenceRef,
          };
        })
      : base.plan;

  return {
    ...base,
    summary1: nextSummary || base.summary1,
    watchFor: nextWatch,
    questions: nextQuestions,
    plan: nextPlan,
  };
}

function mergeRefinedResult(base: HandoverSessionResult, candidate: unknown): HandoverSessionResult | null {
  if (!candidate || typeof candidate !== "object") return null;
  const source = candidate as Partial<HandoverSessionResult>;
  if (!Array.isArray(source.patients)) return null;
  if (source.patients.length !== base.patients.length) return null;

  const nextPatients = base.patients.map((patient, index) => {
    const patch = source.patients?.[index];
    if (!patch || patch.patientKey !== patient.patientKey) return patient;
    return normalizePatientPatch(patient, patch);
  });

  return {
    ...base,
    patients: nextPatients,
  };
}

export function isWebLlmRefineAvailable() {
  if (typeof window === "undefined") return false;
  return typeof window.__RNEST_WEBLLM_REFINE__ === "function";
}

export async function tryRefineWithWebLlm(result: HandoverSessionResult): Promise<RefineOutcome> {
  if (typeof window === "undefined") {
    return {
      result,
      refined: false,
      reason: "browser_runtime_required",
    };
  }

  const adapter = window.__RNEST_WEBLLM_REFINE__;
  if (typeof adapter !== "function") {
    return {
      result,
      refined: false,
      reason: "webllm_adapter_not_found",
    };
  }

  const safeInput = sanitizeStructuredSession(result).result;
  try {
    const raw = await adapter({ result: safeInput });
    const candidate = raw && typeof raw === "object" && "result" in (raw as any) ? (raw as any).result : raw;
    const merged = mergeRefinedResult(safeInput, candidate);
    if (!merged) {
      return {
        result: safeInput,
        refined: false,
        reason: "refine_output_invalid",
      };
    }

    const changed = JSON.stringify(merged.patients) !== JSON.stringify(safeInput.patients);
    return {
      result: {
        ...merged,
        provenance: {
          ...merged.provenance,
          llmRefined: changed,
        },
      },
      refined: changed,
      reason: changed ? null : "refine_no_change",
    };
  } catch {
    return {
      result: safeInput,
      refined: false,
      reason: "refine_runtime_error",
    };
  }
}
