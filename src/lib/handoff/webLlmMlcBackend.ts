"use client";

import { HANDOFF_FLAGS } from "./featureFlags";
import type { HandoverSessionResult, PatientCard } from "./types";

type WebLlmPatch = {
  __source?: string;
  patients: Array<{
    patientKey: string;
    summary1?: string;
    watchFor?: string[];
    questions?: string[];
    plan?: Array<{
      priority?: "P0" | "P1" | "P2";
      task?: string;
      due?: "now" | "within_1h" | "today" | "next_shift";
      owner?: "RN" | "MD" | "RT" | "LAB";
    }>;
  }>;
};

type WebLlmEngine = {
  chat: {
    completions: {
      create: (args: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

declare global {
  interface Window {
    __RNEST_WEBLLM_BACKEND__?: unknown;
    __RNEST_WEBLLM_MLC_STATUS__?: {
      ready: boolean;
      modelId: string;
      error: string | null;
      updatedAt: number;
    };
  }
}

const DEFAULT_MODEL_ID = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const DEFAULT_MODULE_URL = "/runtime/vendor/web-llm/index.js";
const RAW_MODEL_LIB_BASE_URL = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/";
const DEFAULT_MODEL_LIB_BASE_URL = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/";

let enginePromise: Promise<WebLlmEngine | null> | null = null;

function readStringEnv(value: string | undefined, fallback: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function readNumberEnv(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sanitizeText(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadWebLlmModule(moduleUrl: string) {
  return await import(/* webpackIgnore: true */ moduleUrl);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = sanitizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function appendCacheBust(url: string, token: string) {
  const trimmedUrl = sanitizeText(url);
  const trimmedToken = sanitizeText(token);
  if (!trimmedUrl || !trimmedToken) return trimmedUrl;

  try {
    const absolute = new URL(trimmedUrl, window.location.origin);
    absolute.searchParams.set("v", trimmedToken);
    return absolute.toString();
  } catch {
    const separator = trimmedUrl.includes("?") ? "&" : "?";
    return `${trimmedUrl}${separator}v=${encodeURIComponent(trimmedToken)}`;
  }
}

async function loadWebLlmModuleWithCacheRetry(moduleUrl: string, moduleVersion: string) {
  const urls = uniqueStrings([
    appendCacheBust(moduleUrl, moduleVersion),
    appendCacheBust(moduleUrl, `${moduleVersion}-${Date.now()}`),
    sanitizeText(moduleUrl),
  ]);

  let lastError: unknown = null;
  for (const url of urls) {
    try {
      return await loadWebLlmModule(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("webllm_module_load_failed");
}

function normalizeUrlBase(value: string) {
  const trimmed = sanitizeText(value);
  if (!trimmed) return DEFAULT_MODEL_LIB_BASE_URL;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

type WebLlmAppConfig = {
  model_list?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

export function patchWebLlmAppConfigForCsp(
  moduleRef: unknown,
  modelId: string,
  modelLibBaseUrl: string
): { appConfig: WebLlmAppConfig | null; modelLibUrl: string | null } {
  const baseConfig = (moduleRef as any)?.prebuiltAppConfig as WebLlmAppConfig | undefined;
  if (!baseConfig || !Array.isArray(baseConfig.model_list)) {
    return { appConfig: null, modelLibUrl: null };
  }

  const normalizedModelId = sanitizeText(modelId);
  const normalizedBaseUrl = normalizeUrlBase(modelLibBaseUrl);
  const nextConfig = cloneJson(baseConfig);
  const nextModelList = Array.isArray(nextConfig.model_list) ? nextConfig.model_list : [];
  let resolvedModelLib: string | null = null;

  for (let index = 0; index < nextModelList.length; index += 1) {
    const record = nextModelList[index];
    const recordModelId = sanitizeText(String((record as any)?.model_id ?? ""));
    if (!recordModelId || recordModelId !== normalizedModelId) continue;

    const currentModelLib = sanitizeText(String((record as any)?.model_lib ?? ""));
    if (!currentModelLib) {
      resolvedModelLib = null;
      break;
    }

    if (currentModelLib.startsWith(RAW_MODEL_LIB_BASE_URL)) {
      const tailPath = currentModelLib.slice(RAW_MODEL_LIB_BASE_URL.length);
      const rewritten = `${normalizedBaseUrl}${tailPath}`;
      (record as any).model_lib = rewritten;
      resolvedModelLib = rewritten;
    } else {
      resolvedModelLib = currentModelLib;
    }
    break;
  }

  return { appConfig: nextConfig, modelLibUrl: resolvedModelLib };
}

function toCompactPatientInput(patient: PatientCard) {
  return {
    patientKey: patient.patientKey,
    summary1: sanitizeText(patient.summary1),
    currentStatus: patient.currentStatus.slice(0, 4),
    problems: patient.problems.slice(0, 4),
    watchFor: patient.watchFor.slice(0, 5),
    questions: patient.questions.slice(0, 4),
    plan: patient.plan.slice(0, 6).map((todo) => ({
      priority: todo.priority,
      task: sanitizeText(todo.task),
      due: todo.due,
      owner: todo.owner,
    })),
    risks: patient.risks.slice(0, 4).map((risk) => ({
      code: risk.code,
      score: risk.score,
      rationale: sanitizeText(risk.rationale),
      actions: Array.isArray(risk.actions) ? risk.actions.slice(0, 3).map((item) => sanitizeText(item)) : [],
    })),
  };
}

function buildRefinePrompt(result: HandoverSessionResult) {
  const payload = {
    dutyType: result.dutyType,
    uncertainties: result.uncertaintyItems.slice(0, 20).map((item) => ({
      patientKey: item.text.match(/PATIENT_[A-Z0-9]+/)?.[0] ?? null,
      kind: item.kind,
      reason: sanitizeText(item.reason),
    })),
    patients: result.patients.map(toCompactPatientInput),
  };

  return [
    "You are a Korean clinical handoff formatter.",
    "Return JSON only.",
    "Schema:",
    "{",
    '  "patients": [',
    "    {",
    '      "patientKey": "PATIENT_A",',
    '      "summary1": "string",',
    '      "watchFor": ["string"],',
    '      "questions": ["string"],',
    '      "plan": [{"priority":"P0|P1|P2","task":"string","due":"now|within_1h|today|next_shift","owner":"RN|MD|RT|LAB"}]',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "1) Keep patient count and patientKey unchanged.",
    "2) Keep Korean concise nursing style.",
    "3) For P0/P1 plan items, fill due and owner when inferable.",
    "4) Do not add PHI or identifiers.",
    "Input JSON:",
    JSON.stringify(payload),
  ].join("\n");
}

function extractCompletionText(raw: unknown) {
  const choices = (raw as any)?.choices;
  if (!Array.isArray(choices) || !choices.length) return "";
  const message = choices[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

function extractFirstJsonObject(text: string) {
  const source = String(text ?? "").trim();
  if (!source) return null;

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || source;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const jsonText = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => sanitizeText(typeof item === "string" ? item : ""))
    .filter(Boolean)
    .slice(0, 8);
  return out.length ? out : [];
}

function normalizePatch(result: HandoverSessionResult, value: unknown): WebLlmPatch | null {
  if (!value || typeof value !== "object") return null;
  const sourcePatients = (value as any).patients;
  if (!Array.isArray(sourcePatients)) return null;
  if (sourcePatients.length !== result.patients.length) return null;

  const allowedPatientKeys = new Set(result.patients.map((item) => item.patientKey));
  const patients = sourcePatients.map((item) => {
    const patientKey = sanitizeText(item?.patientKey);
    if (!allowedPatientKeys.has(patientKey)) return null;

    const plan = Array.isArray(item?.plan)
      ? item.plan
          .map((todo: any) => {
            const task = sanitizeText(todo?.task);
            if (!task) return null;
            return {
              priority:
                todo?.priority === "P0" || todo?.priority === "P1" || todo?.priority === "P2"
                  ? todo.priority
                  : undefined,
              task,
              due:
                todo?.due === "now" ||
                todo?.due === "within_1h" ||
                todo?.due === "today" ||
                todo?.due === "next_shift"
                  ? todo.due
                  : undefined,
              owner:
                todo?.owner === "RN" || todo?.owner === "MD" || todo?.owner === "RT" || todo?.owner === "LAB"
                  ? todo.owner
                  : undefined,
            };
          })
          .filter(Boolean)
      : undefined;

    return {
      patientKey,
      summary1: sanitizeText(item?.summary1) || undefined,
      watchFor: readStringArray(item?.watchFor),
      questions: readStringArray(item?.questions),
      plan,
    };
  });

  if (patients.some((item) => !item)) return null;
  return { patients: patients as WebLlmPatch["patients"] };
}

async function getMlcEngine() {
  if (typeof window === "undefined") return null;
  const modelId = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MODEL_ID,
    HANDOFF_FLAGS.handoffWebLlmModelId || DEFAULT_MODEL_ID
  );
  const moduleUrl = readStringEnv(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MODULE_URL, DEFAULT_MODULE_URL);
  const moduleVersion = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MODULE_VERSION,
    modelId
  );
  const modelLibBaseUrl = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MODEL_LIB_BASE_URL,
    DEFAULT_MODEL_LIB_BASE_URL
  );

  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    try {
      const mod = await loadWebLlmModuleWithCacheRetry(moduleUrl, moduleVersion);
      const appConfigPatch = patchWebLlmAppConfigForCsp(mod, modelId, modelLibBaseUrl);
      const createEngine =
        (mod as any).CreateMLCEngine ??
        (mod as any).createMLCEngine ??
        (mod as any).CreateWebWorkerMLCEngine ??
        null;
      if (typeof createEngine !== "function") {
        throw new Error("webllm_engine_factory_not_found");
      }

      const engine = (await createEngine(modelId, {
        initProgressCallback: () => undefined,
        appConfig: appConfigPatch.appConfig ?? undefined,
      })) as WebLlmEngine;

      window.__RNEST_WEBLLM_MLC_STATUS__ = {
        ready: true,
        modelId,
        error: null,
        updatedAt: Date.now(),
      };
      return engine;
    } catch (error) {
      window.__RNEST_WEBLLM_MLC_STATUS__ = {
        ready: false,
        modelId,
        error: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      };
      enginePromise = null;
      return null;
    }
  })();

  return enginePromise;
}

export function initWebLlmMlcBackend() {
  if (typeof window === "undefined") return;
  if (!HANDOFF_FLAGS.handoffWebLlmRefineEnabled) return;
  if (!HANDOFF_FLAGS.handoffWebLlmUseMlc) return;

  const existing = window.__RNEST_WEBLLM_BACKEND__ as any;
  if (existing?.__source === "mlc_webllm") return;

  const modelId = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MODEL_ID,
    HANDOFF_FLAGS.handoffWebLlmModelId || DEFAULT_MODEL_ID
  );
  const maxOutputTokens = readNumberEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    200,
    4096
  );

  window.__RNEST_WEBLLM_BACKEND__ = {
    __source: "mlc_webllm",
    runtime: `mlc_webllm_${modelId}`,
    async refine(input: { result?: HandoverSessionResult }) {
      const result = input?.result;
      if (!result || !Array.isArray(result.patients)) return null;

      const engine = await getMlcEngine();
      if (!engine) return null;

      const prompt = buildRefinePrompt(result);
      let completion: unknown;
      try {
        completion = await engine.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You generate strict JSON for de-identified clinical handoff refinement. Never output markdown.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          top_p: 0.9,
          max_tokens: maxOutputTokens,
        });
      } catch {
        return null;
      }

      const text = extractCompletionText(completion);
      const parsed = extractFirstJsonObject(text);
      const normalized = normalizePatch(result, parsed);
      if (!normalized) {
        // If model returned non-JSON text, keep data unchanged but still mark that MLC backend ran.
        return {
          __source: "mlc_webllm",
          patients: result.patients.map((patient) => ({
            patientKey: patient.patientKey,
          })),
        };
      }
      return {
        ...normalized,
        __source: "mlc_webllm",
      };
    },
  };
}
