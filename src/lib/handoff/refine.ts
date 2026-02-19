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
    __RNEST_WEBLLM_BACKEND__?: unknown;
  }
}

const WEBLLM_BACKEND_DEFAULT_URL = "/runtime/webllm-refine-backend.js";
const WEBLLM_ADAPTER_DEFAULT_URL = "/runtime/webllm-refine-adapter.js";
const WEBLLM_BACKEND_SCRIPT_ID = "wnl-handoff-webllm-backend";
const WEBLLM_ADAPTER_SCRIPT_ID = "wnl-handoff-webllm-adapter";

function readStringEnv(value: string | undefined, fallback: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function isRelativeOrSameOrigin(url: string, origin: string) {
  if (!url) return false;
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) return true;
  try {
    return new URL(url, origin).origin === origin;
  } catch {
    return false;
  }
}

function ensureScript(url: string, id: string) {
  if (typeof document === "undefined") return Promise.resolve();

  const absolute = new URL(url, window.location.origin).href;
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.src === absolute) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`failed_to_load_${id}`)), { once: true });
    });
  }

  if (existing) {
    existing.remove();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = url;
    script.async = false;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.dataset.loaded = "false";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`failed_to_load_${id}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });
}

async function waitForRefineAdapter(timeoutMs: number) {
  if (typeof window === "undefined") return false;
  if (typeof window.__RNEST_WEBLLM_REFINE__ === "function") return true;

  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 80);
    });
    if (typeof window.__RNEST_WEBLLM_REFINE__ === "function") return true;
  }
  return false;
}

export async function ensureWebLlmRefineReady() {
  if (typeof window === "undefined") return false;
  if (typeof window.__RNEST_WEBLLM_REFINE__ === "function") return true;

  const backendUrl = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_BACKEND_URL,
    WEBLLM_BACKEND_DEFAULT_URL
  );
  const adapterUrl = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_ADAPTER_URL,
    WEBLLM_ADAPTER_DEFAULT_URL
  );

  const backendSameOrigin = isRelativeOrSameOrigin(backendUrl, window.location.origin);
  const adapterSameOrigin = isRelativeOrSameOrigin(adapterUrl, window.location.origin);
  if (!adapterSameOrigin) {
    return false;
  }

  if (backendSameOrigin) {
    try {
      await ensureScript(backendUrl, WEBLLM_BACKEND_SCRIPT_ID);
    } catch {
      // backend script is optional; adapter can still provide heuristic fallback
    }
  }

  try {
    await ensureScript(adapterUrl, WEBLLM_ADAPTER_SCRIPT_ID);
  } catch {
    return false;
  }

  return waitForRefineAdapter(4_000);
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const strings = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return strings.length ? strings : [];
}

function normalizeTaskKey(task: string | undefined) {
  return String(task ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizePatientPatch(base: PatientCard, patch: unknown) {
  if (!patch || typeof patch !== "object") return base;
  const source = patch as Partial<PatientCard>;

  const nextSummary = typeof source.summary1 === "string" ? source.summary1.trim() : base.summary1;
  const nextWatch = readStringArray(source.watchFor) ?? base.watchFor;
  const nextQuestions = readStringArray(source.questions) ?? base.questions;

  const basePlanByTask = new Map<string, PatientCard["plan"]>();
  base.plan.forEach((todo) => {
    const key = normalizeTaskKey(todo.task);
    if (!key) return;
    const bucket = basePlanByTask.get(key) ?? [];
    bucket.push(todo);
    basePlanByTask.set(key, bucket);
  });

  const nextPlan =
    Array.isArray(source.plan) && source.plan.length
      ? source.plan.map((todo, index) => {
          const currentByIndex = base.plan[index];
          const task = typeof todo?.task === "string" ? todo.task.trim() : currentByIndex?.task ?? "";
          const taskKey = normalizeTaskKey(task);
          const bucket = taskKey ? basePlanByTask.get(taskKey) : undefined;
          const matchedByTask = bucket?.length ? bucket.shift() : undefined;
          const current = matchedByTask ?? currentByIndex;
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

  const ready = await ensureWebLlmRefineReady();
  if (!ready) {
    return {
      result,
      refined: false,
      reason: "webllm_adapter_not_found",
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
