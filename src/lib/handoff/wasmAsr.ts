import type { LocalAsrSegment } from "./asr";

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
  workerUrl: string;
  runtimeUrl?: string;
  modelUrl?: string;
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

export function isWasmLocalAsrSupported(options?: { workerUrl?: string }) {
  if (typeof window === "undefined") return false;
  if (getCapacitorWasmAsrPlugin()) return true;
  if (typeof Worker === "undefined") return false;
  if (!options?.workerUrl) return false;
  return true;
}

export function createWasmLocalAsr(options?: {
  lang?: string;
  workerUrl?: string;
  runtimeUrl?: string;
  modelUrl?: string;
  onError?: (error: unknown) => void;
  onProgress?: (event: WasmAsrProgressEvent) => void;
  onPartial?: (event: WasmAsrPartialEvent) => void;
}): WasmAsrController {
  const lang = options?.lang ?? "ko";
  const modelUrl = options?.modelUrl ?? "";
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
    workerUrl,
    runtimeUrl,
    modelUrl,
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
