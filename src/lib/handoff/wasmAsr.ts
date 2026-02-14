import type { LocalAsrSegment } from "./asr";

type WorkerRequestType = "init" | "transcribe" | "stop";
type WorkerResponseType = "init:ok" | "init:err" | "transcribe:ok" | "transcribe:err" | "stop:ok" | "stop:err";

type WorkerRequestMessage = {
  id: string;
  type: WorkerRequestType;
  payload?: Record<string, unknown>;
};

type WorkerResponseMessage = {
  id: string;
  type: WorkerResponseType;
  payload?: Record<string, unknown>;
};

type WasmAsrWorkerOptions = {
  workerUrl: string;
  runtimeUrl?: string;
  modelUrl?: string;
  lang?: string;
};

type WasmAsrChunkInput = {
  chunkId: string;
  blob: Blob;
  startMs: number;
  endMs: number;
  mimeType: string;
};

type WasmAsrController = {
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
}: WasmAsrWorkerOptions & {
  onError?: (error: unknown) => void;
}): WasmAsrController {
  let running = false;
  let worker: Worker | null = null;
  let disposed = false;
  const pending = new Map<
    string,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();

  const rejectAll = (message: string) => {
    pending.forEach(({ reject }) => reject(new Error(message)));
    pending.clear();
  };

  const cleanupWorker = () => {
    rejectAll("WASM ASR worker terminated");
    worker?.terminate();
    worker = null;
  };

  const postRequest = async (
    type: WorkerRequestType,
    payload?: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (!worker) throw new Error("WASM ASR worker is not initialized");
    const id = createRequestId(type);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const message: WorkerRequestMessage = { id, type, payload };
      worker?.postMessage(message);
      window.setTimeout(() => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        reject(new Error(`${type} timed out`));
      }, 45_000);
    });
  };

  const ensureWorker = () => {
    if (worker) return worker;
    if (typeof Worker === "undefined") return null;
    worker = new Worker(workerUrl);
    worker.addEventListener("message", (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;
      if (!message?.id) return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.type.endsWith(":ok")) {
        entry.resolve(message.payload ?? {});
        return;
      }
      const msg = String(message.payload?.message ?? `${message.type} failed`);
      entry.reject(new Error(msg));
    });
    worker.addEventListener("error", (event) => {
      onError?.(new Error(event.message || "WASM ASR worker error"));
      cleanupWorker();
    });
    return worker;
  };

  return {
    async start() {
      if (disposed) return false;
      if (running) return true;
      try {
        const created = ensureWorker();
        if (!created) return false;
        await postRequest("init", {
          lang,
          runtimeUrl: runtimeUrl || undefined,
          modelUrl: modelUrl || undefined,
        });
        running = true;
        return true;
      } catch (error) {
        onError?.(error);
        cleanupWorker();
        running = false;
        return false;
      }
    },
    async stop() {
      if (!running) return;
      running = false;
      try {
        await postRequest("stop");
      } catch {
        // noop
      }
    },
    async destroy() {
      disposed = true;
      running = false;
      cleanupWorker();
    },
    isRunning() {
      return running;
    },
    async transcribeChunk(chunk) {
      if (!running) return [];
      const chunkBase64 = await blobToBase64(chunk.blob);
      const response = await postRequest("transcribe", {
        chunkId: chunk.chunkId,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        mimeType: chunk.mimeType,
        chunkBase64,
      });
      const segments = Array.isArray(response.segments) ? response.segments : [];
      return segments
        .map((segment) =>
          normalizeSegment(
            segment as {
              text?: string;
              startMs?: number;
              endMs?: number;
              confidence?: number | null;
            },
            chunk.startMs,
            chunk.endMs
          )
        )
        .filter((segment): segment is LocalAsrSegment => Boolean(segment));
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
}): WasmAsrController {
  const lang = options?.lang ?? "ko";
  const modelUrl = options?.modelUrl ?? "";
  const runtimeUrl = options?.runtimeUrl ?? "";
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

export type { WasmAsrChunkInput, WasmAsrController };
