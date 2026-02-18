import type { LocalAsrSegment } from "./asr";
import type { HandoffWasmAsrDevice, HandoffWasmAsrEngine } from "./types";

type WorkerRequestType = "init" | "transcribe" | "stop" | "INIT" | "TRANSCRIBE_CHUNK" | "FLUSH" | "RESET";
type WorkerResponseType =
  | "init:ok"
  | "init:err"
  | "transcribe:ok"
  | "transcribe:err"
  | "stop:ok"
  | "stop:err"
  | "READY"
  | "PROGRESS"
  | "PARTIAL"
  | "FINAL"
  | "ERROR"
  | "RESET:ok"
  | "RESET:err"
  | "FLUSH:ok"
  | "FLUSH:err";

type WorkerRequestMessage = {
  id: string;
  type: WorkerRequestType;
  payload?: Record<string, unknown>;
};

type WorkerResponseMessage = {
  id?: string;
  type: WorkerResponseType | string;
  payload?: Record<string, unknown>;
};

type WasmAsrWorkerOptions = {
  engine: HandoffWasmAsrEngine;
  workerUrl: string;
  runtimeUrl?: string;
  modelUrl?: string;
  modelId?: string;
  preferDevice?: HandoffWasmAsrDevice;
  dtype?: string;
  lang?: string;
  onProgress?: (event: WasmAsrProgressEvent) => void;
  onPartial?: (event: WasmAsrPartialEvent) => void;
};

export type WasmAsrChunkInput = {
  chunkId: string;
  blob: Blob;
  startMs: number;
  endMs: number;
  mimeType: string;
  pcmFloat32?: Float32Array;
  sampleRate?: number;
  vad?: {
    speechRatio: number;
    segments: Array<{ s: number; e: number }>;
  };
};

export type WasmAsrProgressEvent = {
  chunkId: string;
  percent: number;
};

export type WasmAsrPartialEvent = {
  chunkId: string;
  text: string;
  t0: number;
  t1: number;
  confidence: number | null;
};

export type WasmAsrController = {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  isRunning: () => boolean;
  transcribeChunk: (chunk: WasmAsrChunkInput) => Promise<LocalAsrSegment[]>;
};

type CapacitorWasmAsrPlugin = {
  start?: (options: { lang: string; modelUrl?: string }) => Promise<void>;
  stop?: () => Promise<void>;
  transcribeChunk: (input: {
    chunkId: string;
    startMs: number;
    endMs: number;
    mimeType: string;
    chunkBase64: string;
  }) => Promise<{
    segments?: Array<{
      text?: string;
      startMs?: number;
      endMs?: number;
      confidence?: number | null;
    }>;
  }>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCapacitorWasmAsrPlugin(): CapacitorWasmAsrPlugin | null {
  if (typeof window === "undefined") return null;
  const plugin = (window as any)?.Capacitor?.Plugins?.HandoffWasmAsr;
  if (!plugin || typeof plugin.transcribeChunk !== "function") return null;
  return plugin as CapacitorWasmAsrPlugin;
}

function createRequestId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function normalizeSegment(
  segment: {
    text?: string;
    startMs?: number;
    endMs?: number;
    confidence?: number | null;
  },
  fallbackStartMs: number,
  fallbackEndMs: number
): LocalAsrSegment | null {
  const text = String(segment.text ?? "").trim();
  if (!text) return null;
  const startMs = Math.max(0, Number(segment.startMs ?? fallbackStartMs));
  const endMs = Math.max(startMs + 250, Number(segment.endMs ?? fallbackEndMs));
  const confidence =
    typeof segment.confidence === "number" && Number.isFinite(segment.confidence)
      ? Number(segment.confidence)
      : null;
  return {
    text,
    startMs,
    endMs,
    confidence,
  };
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  throw new Error("base64 encoder unavailable");
}

function normalizePluginSegments(
  segments: Array<{
    text?: string;
    startMs?: number;
    endMs?: number;
    confidence?: number | null;
  }> | undefined,
  fallbackStartMs: number,
  fallbackEndMs: number
) {
  if (!segments?.length) return [];
  return segments
    .map((segment) => normalizeSegment(segment, fallbackStartMs, fallbackEndMs))
    .filter((segment): segment is LocalAsrSegment => Boolean(segment));
}

function normalizeWorkerSegments(
  payload: Record<string, unknown> | undefined,
  fallbackStartMs: number,
  fallbackEndMs: number
) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  return segments
    .map((segment) =>
      normalizeSegment(
        segment as {
          text?: string;
          startMs?: number;
          endMs?: number;
          confidence?: number | null;
        },
        fallbackStartMs,
        fallbackEndMs
      )
    )
    .filter((segment): segment is LocalAsrSegment => Boolean(segment));
}

function normalizeType(type: string | undefined) {
  return String(type ?? "").trim();
}

function makeTypeSet(types: string[]) {
  const set = new Set<string>();
  types.forEach((type) => {
    const normalized = normalizeType(type);
    if (!normalized) return;
    set.add(normalized);
    set.add(normalized.toLowerCase());
  });
  return set;
}

function matchType(typeSet: Set<string>, currentType: string) {
  if (!currentType) return false;
  return typeSet.has(currentType) || typeSet.has(currentType.toLowerCase());
}

function resolveChunkId(payload: Record<string, unknown> | undefined) {
  if (!payload) return null;
  const chunkId = payload.chunkId;
  if (typeof chunkId !== "string") return null;
  return chunkId.trim() || null;
}

type TransformersAsrOutput = {
  text?: string;
  chunks?: Array<{
    text?: string;
    timestamp?: [number | null, number | null] | number[] | null;
  }>;
};

type TransformersAsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<TransformersAsrOutput>;

let transformersPipelinePromise: Promise<TransformersAsrPipeline | null> | null = null;

function normalizeWasmAsrDevice(preferDevice: HandoffWasmAsrDevice | undefined) {
  if (preferDevice === "webgpu") return "webgpu";
  if (preferDevice === "wasm") return "wasm";
  if (typeof navigator !== "undefined" && "gpu" in navigator) return "webgpu";
  return "wasm";
}

function isTransformersAsrSupported(preferDevice?: HandoffWasmAsrDevice) {
  if (typeof window === "undefined") return false;
  const runtimeDevice = normalizeWasmAsrDevice(preferDevice);
  if (runtimeDevice === "webgpu") {
    return Boolean((navigator as any)?.gpu);
  }
  return typeof WebAssembly !== "undefined";
}

function isAudioContextSupported() {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).AudioContext || (window as any).webkitAudioContext);
}

function downsamplePcm(input: Float32Array, sourceRate: number, targetRate: number) {
  if (!input.length) return input;
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    output[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return output;
}

async function blobToPcmFloat32(blob: Blob, targetSampleRate: number) {
  const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("audio_context_unavailable");
  }
  const audioContext: AudioContext = new AudioContextCtor();
  try {
    const data = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(data.slice(0));
    const source = decoded.numberOfChannels === 1 ? decoded.getChannelData(0) : decoded.getChannelData(0);
    const mono = new Float32Array(source.length);
    mono.set(source);
    return {
      pcmFloat32: downsamplePcm(mono, decoded.sampleRate, targetSampleRate),
      sampleRate: targetSampleRate,
    };
  } finally {
    void audioContext.close();
  }
}

function normalizeTransformersSegments(
  output: TransformersAsrOutput,
  fallbackStartMs: number,
  fallbackEndMs: number
) {
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];
  const out: LocalAsrSegment[] = [];

  for (const chunk of chunks) {
    const text = String(chunk?.text ?? "").trim();
    if (!text) continue;

    const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
    const startSecRaw = Number(timestamp?.[0] ?? 0);
    const endSecRaw = Number(timestamp?.[1] ?? 0);
    const startMs =
      Number.isFinite(startSecRaw) && startSecRaw >= 0
        ? fallbackStartMs + Math.round(startSecRaw * 1000)
        : fallbackStartMs;
    const endMs =
      Number.isFinite(endSecRaw) && endSecRaw > startSecRaw
        ? fallbackStartMs + Math.round(endSecRaw * 1000)
        : Math.max(startMs + 250, fallbackEndMs);
    out.push({
      text,
      startMs: Math.max(0, startMs),
      endMs: Math.max(startMs + 250, endMs),
      confidence: null,
    });
  }

  if (out.length) return out;

  const text = String(output?.text ?? "").trim();
  if (!text) return [];
  return [
    {
      text,
      startMs: fallbackStartMs,
      endMs: Math.max(fallbackStartMs + 250, fallbackEndMs),
      confidence: null,
    },
  ];
}

async function ensureTransformersPipeline({
  modelId,
  preferDevice,
  dtype,
  onProgress,
}: {
  modelId: string;
  preferDevice?: HandoffWasmAsrDevice;
  dtype?: string;
  onProgress?: (event: WasmAsrProgressEvent) => void;
}) {
  if (!transformersPipelinePromise) {
    transformersPipelinePromise = (async () => {
      const mod = (await import("@huggingface/transformers")) as any;
      const env = mod?.env;
      if (env && typeof env === "object") {
        env.allowRemoteModels = true;
        env.allowLocalModels = true;
        if (env.backends?.onnx?.wasm) {
          env.backends.onnx.wasm.proxy = false;
          env.backends.onnx.wasm.numThreads = Math.max(
            1,
            Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2))
          );
        }
      }

      const runtimeDevice = normalizeWasmAsrDevice(preferDevice);
      const pipelineOptions: Record<string, unknown> = {
        device: runtimeDevice,
        dtype: dtype || "q8",
        progress_callback: (event: any) => {
          const progress = Number(event?.progress ?? 0);
          const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
          onProgress?.({
            chunkId: "model-load",
            percent,
          });
        },
      };

      try {
        return (await mod.pipeline(
          "automatic-speech-recognition",
          modelId || "openai/whisper-small",
          pipelineOptions
        )) as TransformersAsrPipeline;
      } catch {
        return (await mod.pipeline("automatic-speech-recognition", modelId || "openai/whisper-small", {
          device: "wasm",
        })) as TransformersAsrPipeline;
      }
    })();
  }

  try {
    return await transformersPipelinePromise;
  } catch (error) {
    transformersPipelinePromise = null;
    throw error;
  }
}

function createTransformersWhisperController({
  lang,
  modelId,
  preferDevice,
  dtype,
  onProgress,
  onPartial,
  onError,
}: {
  lang: string;
  modelId: string;
  preferDevice?: HandoffWasmAsrDevice;
  dtype?: string;
  onProgress?: (event: WasmAsrProgressEvent) => void;
  onPartial?: (event: WasmAsrPartialEvent) => void;
  onError?: (error: unknown) => void;
}): WasmAsrController {
  let running = false;
  let disposed = false;
  let transcribeChain: Promise<void> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>) => {
    const next = transcribeChain.then(task, task);
    transcribeChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const transcribe = async (chunk: WasmAsrChunkInput) => {
    if (!running || disposed) return [];
    const pipeline = await ensureTransformersPipeline({
      modelId,
      preferDevice,
      dtype,
      onProgress,
    });
    if (!pipeline) return [];

    const audioInput =
      chunk.pcmFloat32 && chunk.pcmFloat32.length
        ? {
            pcmFloat32: chunk.pcmFloat32,
            sampleRate: chunk.sampleRate || 16_000,
          }
        : await blobToPcmFloat32(chunk.blob, 16_000);

    const output = (await pipeline(audioInput.pcmFloat32, {
      sampling_rate: audioInput.sampleRate,
      task: "transcribe",
      language: lang,
      return_timestamps: true,
      chunk_length_s: 25,
      stride_length_s: 4,
    })) as TransformersAsrOutput;

    const segments = normalizeTransformersSegments(output, chunk.startMs, chunk.endMs);
    const partial = segments[segments.length - 1];
    if (partial?.text) {
      onPartial?.({
        chunkId: chunk.chunkId,
        text: partial.text,
        t0: Number((partial.startMs / 1000).toFixed(3)),
        t1: Number((partial.endMs / 1000).toFixed(3)),
        confidence: partial.confidence,
      });
    }
    onProgress?.({
      chunkId: chunk.chunkId,
      percent: 100,
    });
    return segments;
  };

  return {
    async start() {
      if (disposed) return false;
      if (running) return true;
      if (!isTransformersAsrSupported(preferDevice)) return false;
      if (!isAudioContextSupported()) return false;
      try {
        await ensureTransformersPipeline({
          modelId,
          preferDevice,
          dtype,
          onProgress,
        });
        running = true;
        return true;
      } catch (error) {
        onError?.(error);
        running = false;
        return false;
      }
    },
    async stop() {
      running = false;
    },
    async destroy() {
      disposed = true;
      running = false;
    },
    isRunning() {
      return running;
    },
    async transcribeChunk(chunk) {
      return enqueue(async () => {
        try {
          return await transcribe(chunk);
        } catch (error) {
          onError?.(error);
          return [];
        }
      });
    },
  };
}

function createPluginController({
  plugin,
  lang,
  modelUrl,
  onError,
}: {
  plugin: CapacitorWasmAsrPlugin;
  lang: string;
  modelUrl: string;
  onError?: (error: unknown) => void;
}): WasmAsrController {
  let running = false;

  return {
    async start() {
      if (running) return true;
      try {
        await plugin.start?.({
          lang,
          modelUrl: modelUrl || undefined,
        });
        running = true;
        return true;
      } catch (error) {
        onError?.(error);
        running = false;
        return false;
      }
    },
    async stop() {
      if (!running) return;
      running = false;
      try {
        await plugin.stop?.();
      } catch {
        // noop
      }
    },
    async destroy() {
      await this.stop();
    },
    isRunning() {
      return running;
    },
    async transcribeChunk(chunk) {
      if (!running) return [];
      const chunkBase64 = await blobToBase64(chunk.blob);
      const result = await plugin.transcribeChunk({
        chunkId: chunk.chunkId,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        mimeType: chunk.mimeType,
        chunkBase64,
      });
      return normalizePluginSegments(result.segments, chunk.startMs, chunk.endMs);
    },
  };
}

function createWorkerController({
  workerUrl,
  runtimeUrl,
  modelUrl,
  lang,
  onError,
  onProgress,
  onPartial,
}: WasmAsrWorkerOptions & {
  onError?: (error: unknown) => void;
}): WasmAsrController {
  type PendingEntry = {
    resolve: (value: WorkerResponseMessage) => void;
    reject: (error: Error) => void;
    successTypes: Set<string>;
    errorTypes: Set<string>;
    timeoutId: number;
    chunkId: string | null;
  };

  let running = false;
  let worker: Worker | null = null;
  let disposed = false;
  let protocol: "unknown" | "legacy" | "spec" = "unknown";
  const pending = new Map<string, PendingEntry>();
  let transcribeChain: Promise<void> = Promise.resolve();

  const rejectAll = (message: string) => {
    pending.forEach((entry) => {
      window.clearTimeout(entry.timeoutId);
      entry.reject(new Error(message));
    });
    pending.clear();
  };

  const cleanupWorker = () => {
    rejectAll("WASM ASR worker terminated");
    worker?.terminate();
    worker = null;
  };

  const postRequest = async ({
    type,
    payload,
    successTypes,
    errorTypes,
    timeoutMs,
    chunkId,
  }: {
    type: WorkerRequestType;
    payload?: Record<string, unknown>;
    successTypes: string[];
    errorTypes: string[];
    timeoutMs?: number;
    chunkId?: string | null;
  }): Promise<WorkerResponseMessage> => {
    if (!worker) throw new Error("WASM ASR worker is not initialized");
    const id = createRequestId(type);
    return new Promise<WorkerResponseMessage>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        reject(new Error(`${type} timed out`));
      }, timeoutMs ?? 45_000);

      pending.set(id, {
        resolve,
        reject,
        timeoutId,
        successTypes: makeTypeSet(successTypes),
        errorTypes: makeTypeSet(errorTypes),
        chunkId: chunkId ?? null,
      });
      const message: WorkerRequestMessage = { id, type, payload };
      worker?.postMessage(message);
    });
  };

  const enqueueTranscribe = <T>(task: () => Promise<T>) => {
    const next = transcribeChain.then(task, task);
    transcribeChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const ensureWorker = () => {
    if (worker) return worker;
    if (typeof Worker === "undefined") return null;
    worker = new Worker(workerUrl);
    worker.addEventListener("message", (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;
      const currentType = normalizeType(message?.type);
      const payload = message?.payload ?? {};
      const chunkId = resolveChunkId(payload);

      if (matchType(makeTypeSet(["PROGRESS"]), currentType) && chunkId) {
        const percentRaw = Number((payload.percent as number | undefined) ?? (payload.progress as number | undefined) ?? 0);
        onProgress?.({
          chunkId,
          percent: clamp(Math.round(percentRaw), 0, 100),
        });
      }

      if (matchType(makeTypeSet(["PARTIAL"]), currentType) && chunkId) {
        const text = String(payload.text ?? "").trim();
        if (text) {
          const confidenceRaw = payload.confidence;
          onPartial?.({
            chunkId,
            text,
            t0: Number(payload.t0 ?? 0),
            t1: Number(payload.t1 ?? 0),
            confidence:
              typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw) ? Number(confidenceRaw) : null,
          });
        }
      }

      let pendingEntry: PendingEntry | undefined;
      let pendingKey: string | undefined;

      if (message?.id && pending.has(message.id)) {
        pendingKey = message.id;
        pendingEntry = pending.get(message.id);
      } else if (chunkId) {
        for (const [key, entry] of pending.entries()) {
          if (entry.chunkId !== chunkId) continue;
          pendingKey = key;
          pendingEntry = entry;
          break;
        }
      }

      if (!pendingEntry || !pendingKey) return;

      if (matchType(pendingEntry.successTypes, currentType)) {
        pending.delete(pendingKey);
        window.clearTimeout(pendingEntry.timeoutId);
        pendingEntry.resolve({
          id: message.id,
          type: currentType,
          payload,
        });
        return;
      }

      if (matchType(pendingEntry.errorTypes, currentType) || currentType.toLowerCase().endsWith(":err")) {
        pending.delete(pendingKey);
        window.clearTimeout(pendingEntry.timeoutId);
        const msg = String(payload.message ?? `${currentType} failed`);
        pendingEntry.reject(new Error(msg));
      }
    });
    worker.addEventListener("error", (event) => {
      onError?.(new Error(event.message || "WASM ASR worker error"));
      cleanupWorker();
    });
    return worker;
  };

  const startWithSpecProtocol = async () => {
    const response = await postRequest({
      type: "INIT",
      payload: {
        modelUrl: modelUrl || undefined,
        runtimeUrl: runtimeUrl || undefined,
        languageHint: lang,
        lang,
      },
      successTypes: ["READY", "init:ok"],
      errorTypes: ["ERROR", "INIT:err", "init:err"],
      timeoutMs: 20_000,
    });
    protocol = normalizeType(response.type).toUpperCase() === "READY" ? "spec" : "legacy";
  };

  const startWithLegacyProtocol = async () => {
    await postRequest({
      type: "init",
      payload: {
        lang,
        runtimeUrl: runtimeUrl || undefined,
        modelUrl: modelUrl || undefined,
      },
      successTypes: ["init:ok", "READY"],
      errorTypes: ["init:err", "ERROR"],
      timeoutMs: 20_000,
    });
    if (protocol === "unknown") {
      protocol = "legacy";
    }
  };

  const transcribeChunkNow = async (chunk: WasmAsrChunkInput) => {
    if (!running) return [] as LocalAsrSegment[];
    const chunkBase64 = await blobToBase64(chunk.blob);
    const basePayload = {
      chunkId: chunk.chunkId,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      mimeType: chunk.mimeType,
      chunkBase64,
      t0: Number((chunk.startMs / 1000).toFixed(3)),
      t1: Number((chunk.endMs / 1000).toFixed(3)),
      sampleRate: chunk.sampleRate,
      pcmFloat32: chunk.pcmFloat32,
      vad: chunk.vad,
    };

    if (protocol !== "legacy") {
      try {
        const response = await postRequest({
          type: "TRANSCRIBE_CHUNK",
          payload: basePayload,
          successTypes: ["FINAL", "transcribe:ok"],
          errorTypes: ["ERROR", "TRANSCRIBE_CHUNK:err", "transcribe:err"],
          chunkId: chunk.chunkId,
        });
        protocol = "spec";
        return normalizeWorkerSegments(response.payload, chunk.startMs, chunk.endMs);
      } catch (error) {
        if (protocol === "spec") throw error;
      }
    }

    const response = await postRequest({
      type: "transcribe",
      payload: basePayload,
      successTypes: ["transcribe:ok", "FINAL"],
      errorTypes: ["transcribe:err", "ERROR"],
      chunkId: chunk.chunkId,
    });
    if (protocol === "unknown") protocol = "legacy";
    return normalizeWorkerSegments(response.payload, chunk.startMs, chunk.endMs);
  };

  return {
    async start() {
      if (disposed) return false;
      if (running) return true;
      try {
        const created = ensureWorker();
        if (!created) return false;
        try {
          await startWithSpecProtocol();
        } catch {
          await startWithLegacyProtocol();
        }
        running = true;
        return true;
      } catch (error) {
        onError?.(error);
        cleanupWorker();
        running = false;
        protocol = "unknown";
        return false;
      }
    },
    async stop() {
      if (!running) return;
      running = false;
      try {
        if (protocol === "spec") {
          await postRequest({
            type: "RESET",
            payload: {},
            successTypes: ["RESET:ok", "stop:ok", "READY"],
            errorTypes: ["RESET:err", "ERROR"],
            timeoutMs: 5_000,
          });
        }
      } catch {
        // noop
      }
      try {
        await postRequest({
          type: "stop",
          payload: {},
          successTypes: ["stop:ok", "RESET:ok"],
          errorTypes: ["stop:err", "ERROR"],
          timeoutMs: 5_000,
        });
      } catch {
        // noop
      }
    },
    async destroy() {
      disposed = true;
      running = false;
      protocol = "unknown";
      cleanupWorker();
    },
    isRunning() {
      return running;
    },
    async transcribeChunk(chunk) {
      return enqueueTranscribe(() => transcribeChunkNow(chunk));
    },
  };
}

export function isWasmLocalAsrSupported(options?: {
  engine?: HandoffWasmAsrEngine;
  workerUrl?: string;
  preferDevice?: HandoffWasmAsrDevice;
}) {
  if (typeof window === "undefined") return false;
  if (getCapacitorWasmAsrPlugin()) return true;
  if (options?.engine === "transformers_whisper") {
    return isTransformersAsrSupported(options.preferDevice);
  }
  if (typeof Worker === "undefined") return false;
  if (!options?.workerUrl) return false;
  return true;
}

export function createWasmLocalAsr(options?: {
  engine?: HandoffWasmAsrEngine;
  lang?: string;
  workerUrl?: string;
  runtimeUrl?: string;
  modelUrl?: string;
  modelId?: string;
  preferDevice?: HandoffWasmAsrDevice;
  dtype?: string;
  onError?: (error: unknown) => void;
  onProgress?: (event: WasmAsrProgressEvent) => void;
  onPartial?: (event: WasmAsrPartialEvent) => void;
}): WasmAsrController {
  const engine = options?.engine ?? "worker_runtime";
  const lang = options?.lang ?? "ko";
  const modelUrl = options?.modelUrl ?? "";
  const modelId = options?.modelId ?? "openai/whisper-small";
  const runtimeUrl = options?.runtimeUrl ?? "/runtime/whisper-runtime.js";
  const workerUrl = options?.workerUrl ?? "/workers/handoff-whisper.worker.js";
  const onError = options?.onError;
  const plugin = getCapacitorWasmAsrPlugin();

  if (plugin) {
    return createPluginController({
      plugin,
      lang,
      modelUrl,
      onError,
    });
  }

  if (engine === "transformers_whisper") {
    return createTransformersWhisperController({
      lang,
      modelId,
      preferDevice: options?.preferDevice,
      dtype: options?.dtype,
      onError,
      onProgress: options?.onProgress,
      onPartial: options?.onPartial,
    });
  }

  if (typeof window === "undefined" || typeof Worker === "undefined" || !workerUrl) {
    return {
      start: async () => false,
      stop: async () => undefined,
      destroy: async () => undefined,
      isRunning: () => false,
      transcribeChunk: async () => [],
    };
  }

  const controller = createWorkerController({
    engine,
    workerUrl,
    runtimeUrl,
    modelUrl,
    modelId: options?.modelId,
    preferDevice: options?.preferDevice,
    dtype: options?.dtype,
    lang,
    onError,
    onProgress: options?.onProgress,
    onPartial: options?.onPartial,
  });

  return {
    async start() {
      return controller.start();
    },
    async stop() {
      await controller.stop();
    },
    async destroy() {
      await controller.destroy();
    },
    isRunning() {
      return controller.isRunning();
    },
    async transcribeChunk(chunk) {
      try {
        return await controller.transcribeChunk(chunk);
      } catch (error) {
        onError?.(new Error(toErrorMessage(error, "WASM ASR chunk transcribe failed")));
        return [];
      }
    },
  };
}
