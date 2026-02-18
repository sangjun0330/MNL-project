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
const DEFAULT_WASM_FALLBACK_MODEL_ID = "Xenova/distilgpt2";
const HEAVY_WASM_FALLBACK_MODEL_HINTS = ["onnx-community/qwen2.5-0.5b-instruct", "qwen2.5-0.5b-instruct"];
const DEFAULT_WASM_FALLBACK_MAX_NEW_TOKENS = 220;
const DEFAULT_WASM_FALLBACK_DTYPE = "q8";
const TRANSFORMERS_JSDELIVR_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const TRANSFORMERS_UNPKG_URL =
  "https://unpkg.com/@huggingface/transformers@3.8.1/dist/transformers.min.js";

let enginePromise: Promise<WebLlmEngine | null> | null = null;
let transformersModulePromise: Promise<any> | null = null;
let transformersTextGenPromise: Promise<any> | null = null;
let mlcFatalUnavailable = false;
let mlcFatalError: string | null = null;

function readStringEnv(value: string | undefined, fallback: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function readNumberEnv(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function readBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function sanitizeText(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadWebLlmModule(moduleUrl: string) {
  return await import(/* webpackIgnore: true */ moduleUrl);
}

async function importModuleFromUrl(url: string) {
  return await import(/* webpackIgnore: true */ url);
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

function resolveTransformersRuntimeUrl() {
  const configured = sanitizeText(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_TRANSFORMERS_URL);
  if (configured) return configured;
  const asrRuntimeConfigured = sanitizeText(process.env.NEXT_PUBLIC_HANDOFF_WASM_ASR_TRANSFORMERS_URL);
  if (asrRuntimeConfigured) return asrRuntimeConfigured;
  return TRANSFORMERS_JSDELIVR_URL;
}

function resolveWasmFallbackModelId() {
  const configured = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_MODEL_ID,
    DEFAULT_WASM_FALLBACK_MODEL_ID
  );
  const allowHeavyModel = readBooleanEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_ALLOW_HEAVY_MODEL,
    false
  );
  const usingWasmDevice = resolveWasmFallbackDevice() === "wasm";
  if (!allowHeavyModel && usingWasmDevice) {
    const normalized = configured.toLowerCase();
    if (HEAVY_WASM_FALLBACK_MODEL_HINTS.some((hint) => normalized.includes(hint))) {
      return DEFAULT_WASM_FALLBACK_MODEL_ID;
    }
  }
  return configured;
}

function resolveWasmFallbackDevice() {
  const configured = sanitizeText(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_DEVICE).toLowerCase();
  if (configured === "webgpu") return "webgpu";
  if (configured === "wasm") return "wasm";
  if (configured === "auto") {
    if (typeof navigator !== "undefined" && "gpu" in navigator) return "webgpu";
    return "wasm";
  }
  return "wasm";
}

function shouldAllowLocalFallbackModels() {
  return readBooleanEnv(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_ALLOW_LOCAL_MODELS, false);
}

function shouldSkipMlcWebGpuPath() {
  // 기본값 true: WebGPU 경로 실패/재시도로 UI가 멈추는 현상 방지
  return readBooleanEnv(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_SKIP_MLC_WEBGPU, true);
}

function canAttemptMlcWebGpu() {
  if (typeof window === "undefined") return false;
  if (shouldSkipMlcWebGpuPath()) return false;
  return Boolean((navigator as any)?.gpu);
}

function isMlcFatalWebGpuError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to create webgpu context provider") ||
    normalized.includes("unable to find a compatible gpu") ||
    normalized.includes("webgpu")
  );
}

async function ensureTransformersModule() {
  if (transformersModulePromise) return transformersModulePromise;

  transformersModulePromise = (async () => {
    const primaryUrl = resolveTransformersRuntimeUrl();
    try {
      return await importModuleFromUrl(primaryUrl);
    } catch {
      if (primaryUrl !== TRANSFORMERS_UNPKG_URL) {
        return await importModuleFromUrl(TRANSFORMERS_UNPKG_URL);
      }
      throw new Error("transformers_runtime_load_failed");
    }
  })();

  try {
    return await transformersModulePromise;
  } catch (error) {
    transformersModulePromise = null;
    throw error;
  }
}

async function ensureTransformersTextGenerationPipeline() {
  if (transformersTextGenPromise) return transformersTextGenPromise;

  transformersTextGenPromise = (async () => {
    const mod = (await ensureTransformersModule()) as any;
    const env = mod?.env;
    if (env && typeof env === "object") {
      env.allowRemoteModels = true;
      env.allowLocalModels = shouldAllowLocalFallbackModels();
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.proxy = false;
        // crossOriginIsolated가 아닌 환경에서도 경고/재시도 없이 즉시 동작하도록 단일 스레드로 고정
        env.backends.onnx.wasm.numThreads = 1;
      }
    }

    const modelId = resolveWasmFallbackModelId();
    const device = resolveWasmFallbackDevice();
    const dtype = readStringEnv(
      process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_DTYPE,
      DEFAULT_WASM_FALLBACK_DTYPE
    );
    const pipelineOptions: Record<string, unknown> = {
      device,
    };
    if (dtype) {
      pipelineOptions.dtype = dtype;
    }

    try {
      return await mod.pipeline("text-generation", modelId, pipelineOptions);
    } catch {
      if (device !== "wasm") {
        return await mod.pipeline("text-generation", modelId, { device: "wasm" });
      }
      return await mod.pipeline("text-generation", modelId);
    }
  })();

  try {
    return await transformersTextGenPromise;
  } catch (error) {
    transformersTextGenPromise = null;
    throw error;
  }
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

function extractGeneratedText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const generated = extractGeneratedText(item);
      if (generated) return generated;
    }
    return "";
  }

  if (!raw || typeof raw !== "object") return "";

  const generatedText = sanitizeText((raw as any).generated_text);
  if (generatedText) return generatedText;
  const text = sanitizeText((raw as any).text);
  if (text) return text;
  return "";
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

async function refineWithWasmFallback(
  result: HandoverSessionResult,
  maxOutputTokens: number
): Promise<WebLlmPatch | null> {
  const enabled = readBooleanEnv(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_ENABLED, true);
  if (!enabled) return null;
  if (typeof window === "undefined") return null;
  if (typeof WebAssembly === "undefined") return null;

  let pipeline: any;
  try {
    pipeline = await ensureTransformersTextGenerationPipeline();
  } catch {
    return null;
  }
  if (!pipeline) return null;

  const fallbackMaxNewTokens = readNumberEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_WASM_FALLBACK_MAX_NEW_TOKENS,
    Math.min(DEFAULT_WASM_FALLBACK_MAX_NEW_TOKENS, maxOutputTokens),
    128,
    2048
  );
  const prompt = [
    "You are a Korean clinical handoff formatter.",
    "Return ONLY JSON. No markdown. No explanation.",
    buildRefinePrompt(result),
  ].join("\n");

  let output: unknown = null;
  try {
    output = await pipeline(prompt, {
      max_new_tokens: fallbackMaxNewTokens,
      do_sample: false,
      temperature: 0.1,
      top_p: 0.9,
      return_full_text: false,
    });
  } catch {
    return null;
  }

  const generated = extractGeneratedText(output);
  const parsed = extractFirstJsonObject(generated);
  const normalized = normalizePatch(result, parsed);
  if (!normalized) {
    return {
      __source: "transformers_webllm",
      patients: result.patients.map((patient) => ({
        patientKey: patient.patientKey,
      })),
    };
  }
  return {
    ...normalized,
    __source: "transformers_webllm",
  };
}

async function getMlcEngine() {
  if (typeof window === "undefined") return null;
  const modelId = readStringEnv(
    process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_MODEL_ID,
    HANDOFF_FLAGS.handoffWebLlmModelId || DEFAULT_MODEL_ID
  );
  if (mlcFatalUnavailable) {
    window.__RNEST_WEBLLM_MLC_STATUS__ = {
      ready: false,
      modelId,
      error: mlcFatalError || "mlc_webgpu_unavailable",
      updatedAt: Date.now(),
    };
    return null;
  }
  if (!canAttemptMlcWebGpu()) {
    // WebGPU 없음 → MLC 불가, WASM fallback도 시도하지 않고 즉시 null
    window.__RNEST_WEBLLM_MLC_STATUS__ = {
      ready: false,
      modelId,
      error: "webgpu_unavailable",
      updatedAt: Date.now(),
    };
    return null;
  }
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

  // 모듈 로드 전 WebGPU 실제 가용성 검증 (requestAdapter + requestDevice 둘 다)
  // requestAdapter()는 조용히 null 반환, requestDevice() 실패가 브라우저 콘솔 경고 유발
  // 따라서 두 단계를 모두 probe해서 실패 시 모듈 로드 자체를 건너뜀
  try {
    const gpuAdapter = await (navigator as any).gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!gpuAdapter) {
      mlcFatalUnavailable = true;
      mlcFatalError = "webgpu_unavailable";
      window.__RNEST_WEBLLM_MLC_STATUS__ = { ready: false, modelId, error: "webgpu_unavailable", updatedAt: Date.now() };
      return null;
    }
    const gpuDevice = await (gpuAdapter as any).requestDevice();
    if (!gpuDevice) {
      mlcFatalUnavailable = true;
      mlcFatalError = "webgpu_unavailable";
      window.__RNEST_WEBLLM_MLC_STATUS__ = { ready: false, modelId, error: "webgpu_unavailable", updatedAt: Date.now() };
      return null;
    }
    (gpuDevice as any).destroy();
  } catch {
    mlcFatalUnavailable = true;
    mlcFatalError = "webgpu_unavailable";
    window.__RNEST_WEBLLM_MLC_STATUS__ = { ready: false, modelId, error: "webgpu_unavailable", updatedAt: Date.now() };
    return null;
  }

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
      const message = error instanceof Error ? error.message : String(error);
      const isGpuFatal = isMlcFatalWebGpuError(message);
      if (isGpuFatal) {
        mlcFatalUnavailable = true;
        mlcFatalError = "webgpu_unavailable";
      }
      // GPU 관련 에러는 짧은 코드로 정규화 (raw 영어 에러 메시지를 UI에 노출하지 않음)
      window.__RNEST_WEBLLM_MLC_STATUS__ = {
        ready: false,
        modelId,
        error: isGpuFatal ? "webgpu_unavailable" : message,
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
      if (engine) {
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
          completion = null;
        }

        if (completion) {
          const text = extractCompletionText(completion);
          const parsed = extractFirstJsonObject(text);
          const normalized = normalizePatch(result, parsed);
          if (!normalized) {
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
        }
      }

      // WebGPU MLC 실패 시 WASM fallback 경로로 이어서 처리
      const fallbackPatch = await refineWithWasmFallback(result, maxOutputTokens);
      if (!fallbackPatch) {
        window.__RNEST_WEBLLM_MLC_STATUS__ = {
          ready: false,
          modelId: resolveWasmFallbackModelId(),
          error: "transformers_fallback_unavailable_returning_noop",
          updatedAt: Date.now(),
        };
        return {
          __source: "transformers_webllm",
          patients: result.patients.map((patient) => ({
            patientKey: patient.patientKey,
          })),
        };
      }
      window.__RNEST_WEBLLM_MLC_STATUS__ = {
        ready: true,
        modelId: resolveWasmFallbackModelId(),
        error: null,
        updatedAt: Date.now(),
      };
      return fallbackPatch;
    },
  };
}
